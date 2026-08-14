import { describe, expect, it } from 'vitest'
import { contentTypeFor } from '../src/mime.ts'

describe('content type lookup', () => {
  it('maps renderer asset extensions', () => {
    expect(contentTypeFor('/assets/index.html')).toBe('text/html; charset=utf-8')
    expect(contentTypeFor('client.js')).toBe('text/javascript; charset=utf-8')
    expect(contentTypeFor('client.js.map')).toBe('application/json; charset=utf-8')
    expect(contentTypeFor('theme.css')).toBe('text/css; charset=utf-8')
    expect(contentTypeFor('logo.svg')).toBe('image/svg+xml')
  })

  it('falls back to octet-stream for unknown extensions', () => {
    expect(contentTypeFor('file.unknown')).toBe('application/octet-stream')
  })
})
