/**
 * Renderer preload (CommonJS): inject the boot manifest and replace `fetch`
 * and `WebSocket` with IPC bridges before the page runs. `contextIsolation`
 * is off deliberately so these globals land in the page world;
 * `nodeIntegration` stays off, so the page itself gains no Node access.
 */

const { ipcRenderer } = require('electron') as typeof import('electron')

const CHANNELS = {
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

const APP_BASE = 'dsh://app'

interface BridgeFetchResult {
  readonly status: number
  readonly statusText: string
  readonly headers: readonly (readonly [string, string])[]
  readonly body?: ArrayBuffer
}

type FetchOutcome =
  | { readonly ok: true; readonly result: BridgeFetchResult }
  | { readonly ok: false; readonly error: 'aborted' }
  | { readonly ok: false; readonly error: 'failed'; readonly message: string }

interface DesktopComposition {
  readonly dump: () => Promise<unknown[]>
  readonly readPatch: () => Promise<string>
  readonly writePatch: (text: string) => Promise<void>
}

/** Resolve a fetch input against the app origin. */
function targetUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input, APP_BASE)
  if (input instanceof URL) return new URL(input.href)
  if (input instanceof Request) return new URL(input.url)
  return new URL(String(input), APP_BASE)
}

/** Whether this call belongs to the API bridge. */
function isApiUrl(url: URL): boolean {
  return (url.hostname === 'app' || url.hostname === 'dsh.internal') && url.pathname.startsWith('/api/')
}

/** Normalize a request body to bytes the IPC structured clone carries. */
async function bodyBytes(body: BodyInit | null | undefined): Promise<Uint8Array | undefined> {
  if (body == null) return undefined
  if (typeof body === 'string') return new TextEncoder().encode(body)
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  return new Uint8Array(await new Response(body).arrayBuffer())
}

const nativeFetch = window.fetch.bind(window)

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = targetUrl(input)
  if (!isApiUrl(url)) return nativeFetch(input, init)
  const id = Math.floor(Math.random() * 0x7fffffff)
  const headers: Array<[string, string]> = []
  new Headers(init?.headers).forEach((value, key) => headers.push([key, value]))
  const signal = init?.signal
  if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
  let settled = false
  const onAbort = (): void => {
    if (!settled) ipcRenderer.send(CHANNELS.abortFetch, id)
  }
  signal?.addEventListener('abort', onAbort)
  try {
    const outcome = await ipcRenderer.invoke(CHANNELS.fetch, {
      id,
      url: url.href,
      method: init?.method ?? 'GET',
      headers,
      body: (await bodyBytes(init?.body))?.buffer as ArrayBuffer | undefined,
    }) as FetchOutcome
    if (!outcome.ok) {
      if (outcome.error === 'aborted') throw new DOMException('The operation was aborted', 'AbortError')
      throw new Error(`dsh-desktop: host fetch failed: ${outcome.message}`)
    }
    return new Response(outcome.result.body, {
      status: outcome.result.status,
      statusText: outcome.result.statusText,
      headers: outcome.result.headers.map(([key, value]) => [key, value] as [string, string]),
    })
  } finally {
    settled = true
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Minimal WebSocket over the stream IPC channel, matching the browser carrier's usage. */
class IpcWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = IpcWebSocket.CONNECTING
  private streamId: number | undefined
  private detach: () => void = () => {}

  /** @param url - only `ws(s)://app/api/events.mux|host` opens a bridge stream. */
  constructor(url: string | URL) {
    super()
    const parsed = new URL(url)
    const kind = parsed.pathname.endsWith('/events.mux') ? 'mux'
      : parsed.pathname.endsWith('/events.host') ? 'host'
        : undefined
    if (kind === undefined) {
      queueMicrotask(() => this.finish())
      return
    }
    const streamId = Math.floor(Math.random() * 0x7fffffff)
    const onFrame = (_event: unknown, payload: { readonly id: number; readonly data: string }): void => {
      if (payload.id !== this.streamId) return
      this.dispatchEvent(new MessageEvent('message', { data: payload.data }))
    }
    const onEnd = (_event: unknown, payload: { readonly id: number }): void => {
      if (payload.id !== this.streamId) return
      this.finish()
    }
    ipcRenderer.on(CHANNELS.streamFrame, onFrame)
    ipcRenderer.on(CHANNELS.streamEnd, onEnd)
    void ipcRenderer.invoke(CHANNELS.streamOpen, { id: streamId, kind }).then((openedId: number) => {
      if (this.readyState === IpcWebSocket.CLOSED) {
        void ipcRenderer.invoke(CHANNELS.streamClose, { id: openedId })
        return
      }
      this.streamId = openedId
      this.readyState = IpcWebSocket.OPEN
      this.dispatchEvent(new Event('open'))
    })
    this.detach = (): void => {
      ipcRenderer.removeListener(CHANNELS.streamFrame, onFrame)
      ipcRenderer.removeListener(CHANNELS.streamEnd, onEnd)
    }
  }

  /** Close the bridge stream; the host ends it and fires the close event. */
  close(): void {
    if (this.readyState === IpcWebSocket.CLOSED || this.readyState === IpcWebSocket.CLOSING) return
    this.readyState = IpcWebSocket.CLOSING
    if (this.streamId !== undefined) void ipcRenderer.invoke(CHANNELS.streamClose, { id: this.streamId })
    else this.finish()
  }

  private finish(): void {
    if (this.readyState === IpcWebSocket.CLOSED) return
    this.readyState = IpcWebSocket.CLOSED
    this.detach()
    this.dispatchEvent(new Event('close'))
  }
}

window.WebSocket = IpcWebSocket as unknown as typeof WebSocket

const win = window as unknown as {
  __DSH_BOOT__?: unknown
  dshDesktop?: { readonly composition: DesktopComposition }
}
win.__DSH_BOOT__ = ipcRenderer.sendSync(CHANNELS.bootManifest)
win.dshDesktop = {
  composition: {
    dump: () => ipcRenderer.invoke(CHANNELS.compositionDump) as Promise<unknown[]>,
    readPatch: () => ipcRenderer.invoke(CHANNELS.compositionReadPatch) as Promise<string>,
    writePatch: (text: string) => ipcRenderer.invoke(CHANNELS.compositionWritePatch, text) as Promise<void>,
  },
}
