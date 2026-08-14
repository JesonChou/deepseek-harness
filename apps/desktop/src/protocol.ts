/**
 * The `dsh://` protocol: `dsh://app/...` serves the built frontend dist,
 * `dsh://plugins/<id>/client.js[.map]` serves a client plugin bundle, and
 * `dsh://composer/...` serves the desktop composition window. GETs under
 * `dsh://app/api/` forward to the embedded loopback server so native
 * downloads (session export) keep their streaming headers.
 * @module @deepseek-ai/dsh-desktop/protocol
 */

import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { appAssetPath, DSH_SCHEME, pluginArtifact } from './manifest.ts'
import { contentTypeFor } from './mime.ts'

/** Register the scheme as a secure, fetch-capable standard scheme before app ready. */
export function registerDshScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: DSH_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

/** Assets the protocol handler resolves against. */
export interface ProtocolTargets {
  /** Absolute root of the built frontend dist. */
  readonly distDir: string
  /** Absolute root of the composition window assets. */
  readonly composerDir: string
  /** Plugin id -> absolute built client bundle path. */
  readonly pluginFiles: ReadonlyMap<string, string>
  /** Forwards `dsh://app/api/*` GETs into the embedded loopback server. */
  readonly forwardToHost: (url: URL) => Promise<Response>
}

/**
 * Install the `dsh://` handler. Unknown routes answer 404; traversal out of
 * an asset root is refused before any file read.
 * @param targets - asset roots and the API forwarding hook.
 */
export function installProtocolHandlers(targets: ProtocolTargets): void {
  protocol.handle(DSH_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host === 'app') {
      if (url.pathname.startsWith('/api/')) return targets.forwardToHost(url)
      const asset = appAssetPath(url.pathname)
      if (asset === undefined) return notFound()
      return serveFile(resolve(targets.distDir, asset), targets.distDir)
    }
    if (url.host === 'plugins') {
      const artifact = pluginArtifact(url.pathname)
      if (artifact === undefined) return notFound()
      const base = targets.pluginFiles.get(artifact.id)
      if (base === undefined) return notFound()
      return serveFile(artifact.kind === 'map' ? `${base}.map` : base, undefined)
    }
    if (url.host === 'composer') {
      const asset = appAssetPath(url.pathname)
      if (asset === undefined) return notFound()
      return serveFile(resolve(targets.composerDir, asset), targets.composerDir)
    }
    return notFound()
  })
}

/** Stream one file inside an allowed root (or any file when the root is undefined). */
async function serveFile(path: string, allowRoot: string | undefined): Promise<Response> {
  if (allowRoot !== undefined && path !== allowRoot && !path.startsWith(allowRoot + sep)) return notFound()
  try {
    const info = await stat(path)
    if (!info.isFile()) return notFound()
    const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>
    return new Response(body, {
      status: 200,
      headers: { 'content-type': contentTypeFor(path) },
    })
  } catch {
    return notFound()
  }
}

/** The shared 404 response. */
function notFound(): Response {
  return new Response('not found', { status: 404 })
}
