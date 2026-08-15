/**
 * Shutdown bridge from the desktop shell to the launcher's stop script.
 * Closing the shell window stops the Web Host the launcher started, so an
 * app-style quit leaves no orphaned server behind.
 * @module @deepseek-ai/dsh-desktop/stop-web
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = fileURLToPath(new URL('..', import.meta.url))
/** Repository-root stop script that frees the Web Host port. */
const STOP_SCRIPT = join(desktopRoot, '..', '..', 'scripts', 'stop-web.ps1')

/** A runnable stop-web.ps1 invocation. */
export interface StopWebCommand {
  /** PowerShell executable path. */
  readonly file: string
  /** Arguments after the executable. */
  readonly args: readonly string[]
}

/**
 * Build the command that stops the Web Host serving `url`.
 * @param url - the loaded Web UI URL; its port names the Host to stop.
 * @param env - process environment (SystemRoot selects PowerShell).
 * @returns the command, or undefined when the port or script is absent.
 */
export function resolveStopWebCommand(url: string, env: NodeJS.ProcessEnv): StopWebCommand | undefined {
  let port: number
  try {
    port = Number(new URL(url).port)
  } catch {
    return undefined
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined
  if (!existsSync(STOP_SCRIPT)) return undefined
  const file = join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return { file, args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', STOP_SCRIPT, '-Port', String(port)] }
}
