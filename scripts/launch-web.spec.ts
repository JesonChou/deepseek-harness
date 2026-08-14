/**
 * Windows desktop launcher tests. Exercise the PowerShell entry's decision branches
 * without starting the real server: the already-listening shortcut, the dry run, and
 * the missing-Node.js preflight failure. The suite skips on non-Windows hosts; the
 * scripts target Windows PowerShell 5.1.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const launcherPath = join(dirname(fileURLToPath(import.meta.url)), 'launch-web.ps1')
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const builtCli = join(repoRoot, 'apps', 'cli', 'lib', 'bin.js')
// Absolute executable path: spawn resolution must not depend on the child's PATH,
// which the missing-Node.js test strips on purpose.
const powershellPath = join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
)

/**
 * Run launch-web.ps1 in Windows PowerShell with non-interactive flags.
 * @param args - launcher arguments after the script path.
 * @param env - child environment; defaults to the current environment.
 * @returns the synchronous spawn result with UTF-8 text output.
 */
function invokeLauncher(args: readonly string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(
    powershellPath,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcherPath, ...args],
    { encoding: 'utf8', env, timeout: 30_000 },
  )
}

/**
 * Reserve a free loopback port and hand back its release function.
 * @returns the bound port number and a closer that frees it.
 */
async function reservePort(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as AddressInfo).port
  return {
    port,
    close: () => new Promise<void>((resolve) => {
      server.close(() => {
        resolve()
      })
    }),
  }
}

const suite = process.platform === 'win32' ? describe : describe.skip

suite('scripts/launch-web.ps1', () => {
  it('prints the planned start command and exits cleanly on a free port with -DryRun', async () => {
    const { port, close } = await reservePort()
    await close()
    const result = invokeLauncher(['-Port', String(port), '-NoBrowser', '-NonInteractive', '-DryRun'])
    expect(result.status).toBe(0)
    if (existsSync(builtCli)) {
      expect(result.stdout).toContain('node "' + builtCli + '" web --port ' + String(port))
    }
    else {
      expect(result.stdout).toContain('npx --yes @deepseek-ai/dsh web --port ' + String(port))
    }
  })

  it('only reports the running server on an occupied port and opens no browser', async () => {
    const { port, close } = await reservePort()
    try {
      const result = invokeLauncher(['-Port', String(port), '-NoBrowser', '-NonInteractive'])
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('port ' + String(port) + ' already serves the Web UI')
    }
    finally {
      await close()
    }
  })

  it('fails with a readable error when Node.js is missing from PATH', async () => {
    const { port, close } = await reservePort()
    await close()
    const barePath = [join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')].join(';')
    const result = invokeLauncher(
      ['-Port', String(port), '-NonInteractive'],
      { ...process.env, PATH: barePath },
    )
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Node.js was not found on PATH')
  })
})
