/**
 * Renderer-bridge wire vocabulary and pure helpers shared by the main-process
 * bridge and its tests. No Electron imports live here so the tests run under
 * plain Node.
 * @module @deepseek-ai/dsh-desktop/transport
 */

/** IPC channel names, shared by preload and main without a code import. */
export const CHANNELS = {
  bootManifest: 'dsh:boot-manifest',
  fetch: 'dsh:fetch',
  abortFetch: 'dsh:abort-fetch',
  streamOpen: 'dsh:stream-open',
  streamClose: 'dsh:stream-close',
  streamFrame: 'dsh:stream-frame',
  streamEnd: 'dsh:stream-end',
  compositionDump: 'dsh:composition-dump',
  compositionReadPatch: 'dsh:composition-read-patch',
  compositionWritePatch: 'dsh:composition-write-patch',
} as const

/** Wire shape of one bridged fetch call. */
export interface BridgeFetchRequest {
  readonly id: number
  readonly url: string
  readonly method: string
  readonly headers: readonly (readonly [string, string])[]
  readonly body?: ArrayBuffer
}

/** Wire shape of one bridged fetch settlement. */
export interface BridgeFetchResult {
  readonly status: number
  readonly statusText: string
  readonly headers: readonly (readonly [string, string])[]
  readonly body?: ArrayBuffer
}

/**
 * Rebase a renderer URL onto the embedded loopback server. Only the pathname
 * and query cross the bridge; the authority is always the loopback port.
 * @param rawUrl - the URL the renderer addressed.
 * @param port - the embedded server's listening port.
 * @returns the loopback URL carrying the same path and query.
 */
export function toLoopbackTarget(rawUrl: string, port: number): string {
  const url = new URL(rawUrl)
  return `http://127.0.0.1:${String(port)}${url.pathname === '' ? '/' : url.pathname}${url.search}`
}

/** One stream frame with the envelope the browser WebSocket carrier uses. */
export interface StreamFrame {
  readonly rpcId: string
  readonly payload: { readonly type: string; readonly [key: string]: unknown }
}

/** Encode one downlink frame as the browser WebSocket carrier's text message. */
export function frameEnvelope(frame: StreamFrame): string {
  return JSON.stringify({
    type: 'server-request',
    rpcId: frame.rpcId,
    method: frame.payload.type,
    payload: frame.payload,
  })
}
