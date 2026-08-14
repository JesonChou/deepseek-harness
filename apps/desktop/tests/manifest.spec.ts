import { describe, expect, it } from 'vitest'
import { appAssetPath, pluginArtifact, rewriteBootGraph, rewriteBundleUrl } from '../src/manifest.ts'

describe('desktop boot graph rewrite', () => {
  it('rewrites server-relative bundle endpoints onto dsh://plugins', () => {
    expect(rewriteBundleUrl('/plugins/@deepseek-ai/dsh-client-ui-sidebar/client.js?rev=abc123'))
      .toBe('dsh://plugins/@deepseek-ai/dsh-client-ui-sidebar/client.js?rev=abc123')
  })

  it('rewrites every graph entry and preserves metadata fields', () => {
    const graph = {
      rev: 'graph-rev',
      entries: [
        { id: '@deepseek-ai/dsh-client-runtime', url: '/plugins/@deepseek-ai/dsh-client-runtime/client.js?rev=r1', rev: 'r1', immediately: true },
        { id: '@deepseek-ai/dsh-client-locale', url: '/plugins/@deepseek-ai/dsh-client-locale/client.js?rev=r2', rev: 'r2', inject: ['@deepseek-ai/dsh-client-web'] },
      ],
    }
    expect(rewriteBootGraph(graph)).toEqual({
      rev: 'graph-rev',
      entries: [
        { id: '@deepseek-ai/dsh-client-runtime', url: 'dsh://plugins/@deepseek-ai/dsh-client-runtime/client.js?rev=r1', rev: 'r1', immediately: true },
        { id: '@deepseek-ai/dsh-client-locale', url: 'dsh://plugins/@deepseek-ai/dsh-client-locale/client.js?rev=r2', rev: 'r2', inject: ['@deepseek-ai/dsh-client-web'] },
      ],
    })
  })

  it('rejects endpoints outside the plugin bundle grammar', () => {
    expect(() => rewriteBundleUrl('/assets/app.js')).toThrow(/unexpected client bundle url/)
    expect(() => rewriteBundleUrl('/plugins/client.js')).toThrow(/unexpected client bundle url/)
  })
})

describe('plugin route parsing', () => {
  it('parses bundle and source-map artifacts', () => {
    expect(pluginArtifact('/pkg/client.js')).toEqual({ id: 'pkg', kind: 'bundle' })
    expect(pluginArtifact('/pkg/client.js.map')).toEqual({ id: 'pkg', kind: 'map' })
    expect(pluginArtifact('/@deepseek-ai/dsh-client-web/client.js'))
      .toEqual({ id: '@deepseek-ai/dsh-client-web', kind: 'bundle' })
  })

  it('rejects unknown route shapes', () => {
    expect(pluginArtifact('/client.js')).toBeUndefined()
    expect(pluginArtifact('/a/../b/client.js')).toBeUndefined()
    expect(pluginArtifact('/assets/app.js')).toBeUndefined()
  })
})

describe('app asset mapping', () => {
  it('maps the root and nested assets while rejecting traversal', () => {
    expect(appAssetPath('/')).toBe('index.html')
    expect(appAssetPath('/assets/index-abc.js')).toBe('assets/index-abc.js')
    expect(appAssetPath('/../secret')).toBeUndefined()
    expect(appAssetPath('/a/../b')).toBeUndefined()
  })
})
