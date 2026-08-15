import { describe, expect, it } from 'vitest'
import { resolveStopWebCommand } from '../src/stop-web.js'

describe('apps/desktop stop-web bridge', () => {
  it('builds a PowerShell stop command with the port from the URL', () => {
    const command = resolveStopWebCommand('http://127.0.0.1:3080', { SystemRoot: 'C:\\Windows' })
    expect(command).toBeDefined()
    const args = command!.args
    expect(args[args.length - 2]).toBe('-Port')
    expect(args[args.length - 1]).toBe('3080')
    expect(args[0]).toBe('-NoProfile')
  })

  it('returns undefined when the URL has no explicit port', () => {
    expect(resolveStopWebCommand('http://127.0.0.1/', {})).toBeUndefined()
  })

  it('returns undefined for an invalid or unparsable URL', () => {
    expect(resolveStopWebCommand('not a url', {})).toBeUndefined()
    expect(resolveStopWebCommand('http://127.0.0.1:99999', {})).toBeUndefined()
  })
})
