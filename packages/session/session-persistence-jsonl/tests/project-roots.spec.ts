import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import SessionStore from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { meta, oneTurnLog } from '../../session-persistence/tests/contract.ts'
import { sessionDir } from '../src/format.ts'

const cleanups: Array<() => Promise<void>> = []

async function freshDirs(): Promise<{ root: string; projectA: string; projectB: string }> {
  const base = await mkdtemp(join(tmpdir(), 'dsh-project-roots-'))
  const root = join(base, 'fallback')
  const projectA = join(base, 'project-a')
  const projectB = join(base, 'project-b')
  cleanups.push(async () => rm(base, { recursive: true, force: true }))
  return { root, projectA, projectB }
}

async function mount(
  root: string,
  projectRoots: readonly string[] = [],
): Promise<{ ctx: Context; backend: JsonlSessionPersistence }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(JsonlSessionPersistence, { root, projectRoots: [...projectRoots], compression: 'none' })
  return { ctx, backend: ctx.sessionPersistence as JsonlSessionPersistence }
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

describe('JSONL project-local storage scopes', () => {
  it('routes a session under a project root to <root>/.dsh/sessions', async () => {
    const dirs = await freshDirs()
    const { backend } = await mount(dirs.root, [dirs.projectA])
    const cwd = join(dirs.projectA, 'sub', 'repo')
    const header = meta('s1', cwd)
    const scope = join(dirs.projectA, '.dsh', 'sessions')
    expect(backend.locate(header).path)
      .toBe(join(sessionDir(scope, cwd, SessionId('s1')), 'session.jsonl'))

    await backend.create(header)
    await backend.append(SessionId('s1'), oneTurnLog())
    expect((await backend.list()).map(listed => listed.id)).toEqual([SessionId('s1')])
  })

  it('keeps sessions outside every project root under the fallback root', async () => {
    const dirs = await freshDirs()
    const { backend } = await mount(dirs.root, [dirs.projectA])
    const cwd = join(dirs.projectB, 'repo')
    const header = meta('s-out', cwd)
    expect(backend.locate(header).path)
      .toBe(join(sessionDir(dirs.root, cwd, SessionId('s-out')), 'session.jsonl'))
    await backend.create(header)
    await backend.append(SessionId('s-out'), oneTurnLog())
    expect((await backend.list()).map(listed => listed.id)).toEqual([SessionId('s-out')])
  })

  it('picks the longest matching project root for nested projects', async () => {
    const dirs = await freshDirs()
    const { backend } = await mount(dirs.root, [dirs.projectA, join(dirs.projectA, 'nested')])
    const header = meta('s-nested', join(dirs.projectA, 'nested', 'repo'))
    expect(backend.locate(header).path)
      .toBe(join(sessionDir(join(dirs.projectA, 'nested', '.dsh', 'sessions'), header.cwd as string, SessionId('s-nested')), 'session.jsonl'))
  })

  it('follows runtime root replacement for new sessions', async () => {
    const dirs = await freshDirs()
    const { backend } = await mount(dirs.root, [])
    backend.setProjectRoots([dirs.projectA])
    const header = meta('s-live', join(dirs.projectA, 'repo'))
    expect(backend.locate(header).path)
      .toBe(join(sessionDir(join(dirs.projectA, '.dsh', 'sessions'), header.cwd as string, SessionId('s-live')), 'session.jsonl'))
    backend.setProjectRoots([])
    expect(backend.locate(header).path)
      .toBe(join(sessionDir(dirs.root, header.cwd as string, SessionId('s-live')), 'session.jsonl'))
  })

  it('rejects one session id stored under two scopes', async () => {
    const dirs = await freshDirs()
    const { backend } = await mount(dirs.root, [dirs.projectA])
    const headerA = meta('dup', join(dirs.projectA, 'repo'))
    await backend.create(headerA)
    await backend.append(SessionId('dup'), oneTurnLog())
    await expect(backend.create(meta('dup', join(dirs.projectB, 'repo')))).rejects.toThrow(/already exists|duplicate/i)
  })

  it('lists sessions across every scope', async () => {
    const dirs = await freshDirs()
    const { backend } = await mount(dirs.root, [dirs.projectA, dirs.projectB])
    await backend.create(meta('in-a', join(dirs.projectA, 'repo')))
    await backend.append(SessionId('in-a'), oneTurnLog())
    await backend.create(meta('in-b', join(dirs.projectB, 'repo')))
    await backend.append(SessionId('in-b'), oneTurnLog())
    await backend.create(meta('in-root', join(dirs.root, 'repo')))
    await backend.append(SessionId('in-root'), oneTurnLog())
    const ids = (await backend.list()).map(listed => listed.id).sort()
    expect(ids).toEqual([SessionId('in-a'), SessionId('in-b'), SessionId('in-root')].sort())
  })
})
