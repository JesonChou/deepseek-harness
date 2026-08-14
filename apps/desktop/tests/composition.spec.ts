import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  loadSessionRoots,
  patchPath,
  readPatch,
  saveSessionRoots,
  syncSessionRoots,
  writePatch,
} from '../src/composition.ts'

const homes: string[] = []

async function freshHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'dsh-desktop-'))
  homes.push(home)
  return home
}

afterEach(async () => {
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true })
})

function fakeContext(
  workspacePaths: readonly string[],
  onRoots: (roots: readonly string[]) => void = () => {},
): Context {
  const registry = { list: () => workspacePaths.map(path => ({ path })) }
  const backend = { setProjectRoots: onRoots }
  return {
    get: (key: string) => key === 'workspaceRegistry'
      ? registry
      : key === 'sessionPersistence'
        ? backend
        : undefined,
  } as unknown as Context
}

describe('session roots manifest', () => {
  it('reads a missing or malformed manifest as empty', async () => {
    const home = await freshHome()
    expect(loadSessionRoots(home)).toEqual([])
    await writeFile(join(home, 'session-roots.json'), '{not json', 'utf8')
    expect(loadSessionRoots(home)).toEqual([])
  })

  it('persists the union without ever shrinking it', async () => {
    const home = await freshHome()
    saveSessionRoots(home, ['D:\\work\\a'])
    saveSessionRoots(home, ['D:\\work\\b'])
    expect(loadSessionRoots(home)).toEqual(['D:\\work\\a', 'D:\\work\\b'])
    const stored = JSON.parse(await readFile(join(home, 'session-roots.json'), 'utf8')) as { roots: unknown }
    expect(stored.roots).toEqual(['D:\\work\\a', 'D:\\work\\b'])
  })
})

describe('workspace root sync', () => {
  it('folds workspace paths into the backend and manifest', async () => {
    const home = await freshHome()
    let roots: readonly string[] = []
    const ctx = fakeContext(['D:\\work\\a'], (next) => { roots = next })
    expect(syncSessionRoots(ctx, home)).toBe(true)
    expect(roots).toEqual(['D:\\work\\a'])
    expect(loadSessionRoots(home)).toEqual(['D:\\work\\a'])
  })

  it('reports false when either service is absent', async () => {
    const home = await freshHome()
    const registryOnly = { get: (key: string) => key === 'workspaceRegistry' ? { list: () => [] } : undefined } as unknown as Context
    expect(syncSessionRoots(registryOnly, home)).toBe(false)
  })
})

describe('user patch layer', () => {
  it('materializes the canonical empty list and round-trips writes', async () => {
    const home = await freshHome()
    expect(readPatch(home)).toBe('[]\n')
    expect(patchPath(home)).toBe(join(home, 'cordis.patch.yml'))
    writePatch(home, '- id: webserver\n  config:\n    port: 0\n')
    expect(readPatch(home)).toBe('- id: webserver\n  config:\n    port: 0\n')
  })
})
