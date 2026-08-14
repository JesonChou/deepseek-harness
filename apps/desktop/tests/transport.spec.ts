import { describe, expect, it } from 'vitest'
import { frameEnvelope, toLoopbackTarget } from '../src/transport.ts'

describe('loopback rebasing', () => {
  it('keeps the path and query while replacing the authority', () => {
    expect(toLoopbackTarget('dsh://app/api/session.prompt?x=1', 4321))
      .toBe('http://127.0.0.1:4321/api/session.prompt?x=1')
    expect(toLoopbackTarget('http://dsh.internal/remote/endpoint', 80))
      .toBe('http://127.0.0.1:80/remote/endpoint')
  })
})

describe('stream frame envelopes', () => {
  it('encodes the browser WebSocket carrier envelope', () => {
    expect(frameEnvelope({ rpcId: 'rpc-1', payload: { type: 'mux/frame' } }))
      .toBe('{"type":"server-request","rpcId":"rpc-1","method":"mux/frame","payload":{"type":"mux/frame"}}')
  })
})
