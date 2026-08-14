/**
 * Boot-graph and protocol-path helpers for the desktop shell: rewrite the
 * host-composed client-modules graph onto the `dsh://` scheme and parse that
 * scheme's plugin/app routes. This file is transport-pure (no Electron
 * imports) so tests exercise it without a window.
 * @module @deepseek-ai/dsh-desktop/manifest
 */

/** The subset of the client-modules boot entry the desktop shell consumes. */
export interface DesktopBootEntry {
  /** Entry name == package name. */
  readonly id: string
  /** Bundle endpoint, '/plugins/<id>/client.js?rev=<rev>'. */
  readonly url: string
  /** Bundle content hash. */
  readonly rev: string
  /** Package-name dependency edges, informational. */
  readonly inject?: string[]
  /** Stage-one prefetch mark. */
  readonly immediately?: boolean
}

/** The composed client entry graph the host injects as `window.__DSH_BOOT__`. */
export interface DesktopBootGraph {
  /** Consistency anchor over the whole graph. */
  readonly rev: string
  /** Composed entries; order carries no semantics. */
  readonly entries: readonly DesktopBootEntry[]
}

/** The `dsh://` scheme serving the built frontend and client plugin bundles. */
export const DSH_SCHEME = 'dsh'

/**
 * Rewrite every server-relative bundle endpoint onto `dsh://plugins`, keeping
 * the cache-busting query. Any other URL is a composition error, never a
 * silent passthrough: the renderer has no HTTP origin to resolve it against.
 * @param graph - the host-composed boot graph.
 * @returns the same graph with rewritten entry URLs.
 */
export function rewriteBootGraph(graph: DesktopBootGraph): DesktopBootGraph {
  return {
    rev: graph.rev,
    entries: graph.entries.map(entry => ({ ...entry, url: rewriteBundleUrl(entry.url) })),
  }
}

/** Rewrite one `/plugins/<id>/client.js[?...]` endpoint to `dsh://plugins/...`. */
export function rewriteBundleUrl(raw: string): string {
  const url = new URL(raw, `${DSH_SCHEME}://app`)
  const prefix = '/plugins/'
  const suffix = '/client.js'
  if (!url.pathname.startsWith(prefix) || !url.pathname.endsWith(suffix)) {
    throw new Error(`dsh-desktop: unexpected client bundle url ${JSON.stringify(raw)}`)
  }
  // Scoped package ids span two path segments (`@scope/name`), so the id is
  // everything between the fixed prefix and suffix rather than one segment.
  const id = decodeURIComponent(url.pathname.slice(prefix.length, -suffix.length))
  if (id === '' || id.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`dsh-desktop: unexpected client bundle url ${JSON.stringify(raw)}`)
  }
  return new URL(`/${id}/client.js${url.search}`, `${DSH_SCHEME}://plugins`).href
}

/** Artifact kinds served under `dsh://plugins/<id>/`. */
export type PluginArtifactKind = 'bundle' | 'map'

/** Parse a plugin bundle route into its package id and artifact kind. */
export function pluginArtifact(pathname: string): { readonly id: string; readonly kind: PluginArtifactKind } | undefined {
  const rest = pathname.startsWith('/') ? pathname.slice(1) : pathname
  const suffixes = [
    { suffix: '/client.js', kind: 'bundle' },
    { suffix: '/client.js.map', kind: 'map' },
  ] as const
  for (const { suffix, kind } of suffixes) {
    if (!rest.endsWith(suffix)) continue
    const id = decodeURIComponent(rest.slice(0, -suffix.length))
    if (id === '' || id.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) return undefined
    return { id, kind }
  }
  return undefined
}

/**
 * Map an app route to a dist-relative asset path, rejecting traversal. The
 * root and empty pathname select `index.html`.
 * @param pathname - request pathname under `dsh://app`.
 * @returns the dist-relative path, or `undefined` for traversal or malformed input.
 */
export function appAssetPath(pathname: string): string | undefined {
  if (pathname === '' || pathname === '/') return 'index.html'
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, '')
  if (relativePath === '') return undefined
  const segments = relativePath.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) return undefined
  return relativePath
}
