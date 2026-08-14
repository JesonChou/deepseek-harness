import { describe, expect, it } from 'vitest'
import { DEFAULT_WEB_URL, resolveWebUrl } from '../src/url.js'

describe('apps/desktop URL resolution', () => {
  it('prefers the DSH_WEB_URL environment over everything else', () => {
    expect(resolveWebUrl(['--url=http://127.0.0.1:3099'], { DSH_WEB_URL: 'http://127.0.0.1:3081' })).toBe('http://127.0.0.1:3081')
  })

  it('falls back to --url= when the environment is absent', () => {
    expect(resolveWebUrl(['node', '--url=http://127.0.0.1:3099'], {})).toBe('http://127.0.0.1:3099')
  })

  it('uses the default URL when neither source provides one', () => {
    expect(resolveWebUrl(['node', 'main.js'], {})).toBe(DEFAULT_WEB_URL)
  })
})
