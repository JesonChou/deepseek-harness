/**
 * URL resolution for the desktop shell, kept apart from the Electron main
 * entry so tests can exercise it without an Electron runtime.
 * @module @deepseek-ai/dsh-desktop/url
 */

/** The Web UI address the shell loads when the launcher passes no URL. */
export const DEFAULT_WEB_URL = 'http://127.0.0.1:3080'

/**
 * Resolve the Web UI URL: the DSH_WEB_URL environment wins, then --url=<url>,
 * then the default.
 * @param argv - process arguments.
 * @param env - the process environment.
 * @returns the URL to load.
 */
export function resolveWebUrl(argv: readonly string[], env: NodeJS.ProcessEnv): string {
  if (env.DSH_WEB_URL) return env.DSH_WEB_URL
  const urlArg = argv.find(arg => arg.startsWith('--url='))
  if (urlArg) return urlArg.slice('--url='.length)
  return DEFAULT_WEB_URL
}
