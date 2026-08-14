/**
 * The renderer bridge: preload patches `fetch`/`WebSocket` onto this channel,
 * and the main process carries each call into the in-process host. Unary
 * requests forward to the embedded loopback HTTP server (which owns the
 * browser-trust fence and Remote interceptors); the two downlink streams read
 * the API proxy directly and reuse the WebSocket wire envelope.
 * @module @deepseek-ai/dsh-desktop/ipc
 */

import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import type { DesktopBootGraph } from './manifest.ts'
import {
  CHANNELS,
  frameEnvelope,
  toLoopbackTarget,
  type BridgeFetchRequest,
  type BridgeFetchResult,
} from './transport.ts'

/** Services the desktop main hands to the bridge. */
export interface DesktopIpcOptions {
  /** Embedded loopback HTTP port for unary forwarding. */
  readonly port: number
  /** The in-process API proxy owning both event streams. */
  readonly apiProxy: DesktopApiProxy
  /** The rewritten boot graph served to the renderer preload. */
  readonly bootGraph: DesktopBootGraph
  /** Live Loader-tree snapshot for the composition window. */
  readonly compositionDump: () => unknown[]
  /** The user patch layer text. */
  readonly readPatch: () => string
  /** Persist the user patch layer; the live recomposition is host-owned. */
  readonly writePatch: (text: string) => void
}

/** The API proxy slice the bridge consumes. Declared locally so the desktop
 * program does not pull the apiproxy source graph through tsconfig paths; the
 * runtime object is the web bundle's mounted `ctx.apiProxy`. */
export interface DesktopApiProxy {
  readonly events: {
    mux(request: StreamRequest, signal: AbortSignal): AsyncIterable<StreamFrame>
    host(request: StreamRequest, signal: AbortSignal): AsyncIterable<StreamFrame>
  }
}

/** One stream open request; the payload is always empty. */
export interface StreamRequest {
  readonly rpcId: string
  readonly payload: Record<string, never>
}

/** One stream frame with the envelope the browser WebSocket carrier uses. */
export interface StreamFrame {
  readonly rpcId: string
  readonly payload: { readonly type: string; readonly [key: string]: unknown }
}

/** Failure frame for a stream source that ended with an error. */
function streamFailure(error: unknown): string {
  return frameEnvelope({
    rpcId: randomUUID(),
    payload: {
      type: 'stream/error',
      error: { code: 'internal', message: String(error), details: {} },
    },
  })
}

/**
 * Install the bridge handlers and own their lifetimes.
 */
export class DesktopIpc {
  private readonly fetches = new Map<number, AbortController>()
  private readonly streams = new Map<number, { readonly controller: AbortController; readonly webContentsId: number }>()

  /** @param options - services and surfaces the bridge dispatches to. */
  constructor(private readonly options: DesktopIpcOptions) {
    ipcMain.on(CHANNELS.bootManifest, (event) => {
      event.returnValue = options.bootGraph
    })
    ipcMain.handle(CHANNELS.fetch, async (_event, request: BridgeFetchRequest) => {
      const controller = this.fetches.get(request.id) ?? new AbortController()
      this.fetches.set(request.id, controller)
      try {
        const target = toLoopbackTarget(request.url, options.port)
        const response = await fetch(target, {
          method: request.method,
          headers: request.headers.map(([key, value]) => [key, value] as [string, string]),
          ...(request.body === undefined ? {} : { body: request.body }),
          signal: controller.signal,
        })
        const result: BridgeFetchResult = {
          status: response.status,
          statusText: response.statusText,
          headers: [...response.headers.entries()],
          ...response.body === null ? {} : { body: await response.arrayBuffer() },
        }
        return { ok: true as const, result }
      } catch (error) {
        if (controller.signal.aborted) return { ok: false as const, error: 'aborted' as const }
        return { ok: false as const, error: 'failed' as const, message: String(error) }
      } finally {
        this.fetches.delete(request.id)
      }
    })
    ipcMain.on(CHANNELS.abortFetch, (_event, id: number) => {
      this.fetches.get(id)?.abort()
    })
    ipcMain.handle(CHANNELS.streamOpen, (event, request: { readonly id: number; readonly kind: 'mux' | 'host' }) => {
      const controller = new AbortController()
      this.streams.set(request.id, { controller, webContentsId: event.sender.id })
      void this.pumpStream(event.sender, request.id, request.kind, controller.signal)
    })
    ipcMain.handle(CHANNELS.streamClose, (_event, request: { readonly id: number }) => {
      this.streams.get(request.id)?.controller.abort()
    })
    ipcMain.handle(CHANNELS.compositionDump, () => options.compositionDump())
    ipcMain.handle(CHANNELS.compositionReadPatch, () => options.readPatch())
    ipcMain.handle(CHANNELS.compositionWritePatch, (_event, text: string) => { options.writePatch(text) })
  }

  /** Abort every stream owned by a closing renderer. */
  cleanupWebContents(webContentsId: number): void {
    for (const [id, stream] of this.streams) {
      if (stream.webContentsId === webContentsId) {
        stream.controller.abort()
        this.streams.delete(id)
      }
    }
  }

  /** Remove every installed handler and stop owned streams. */
  dispose(): void {
    for (const controller of this.fetches.values()) controller.abort()
    this.fetches.clear()
    for (const stream of this.streams.values()) stream.controller.abort()
    this.streams.clear()
    ipcMain.removeHandler(CHANNELS.fetch)
    ipcMain.removeHandler(CHANNELS.streamOpen)
    ipcMain.removeHandler(CHANNELS.streamClose)
    ipcMain.removeHandler(CHANNELS.compositionDump)
    ipcMain.removeHandler(CHANNELS.compositionReadPatch)
    ipcMain.removeHandler(CHANNELS.compositionWritePatch)
    ipcMain.removeAllListeners(CHANNELS.bootManifest)
    ipcMain.removeAllListeners(CHANNELS.abortFetch)
  }

  private async pumpStream(
    sender: WebContents,
    id: number,
    kind: 'mux' | 'host',
    signal: AbortSignal,
  ): Promise<void> {
    const frames = kind === 'mux'
      ? this.options.apiProxy.events.mux({ rpcId: randomUUID(), payload: {} }, signal)
      : this.options.apiProxy.events.host({ rpcId: randomUUID(), payload: {} }, signal)
    try {
      for await (const frame of frames) {
        sender.send(CHANNELS.streamFrame, { id, data: frameEnvelope(frame) })
      }
    } catch (error) {
      if (!signal.aborted) sender.send(CHANNELS.streamFrame, { id, data: streamFailure(error) })
    } finally {
      if (!sender.isDestroyed()) sender.send(CHANNELS.streamEnd, { id })
      this.streams.delete(id)
    }
  }
}
