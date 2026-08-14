import { defineConfig } from 'tsdown'

/**
 * The desktop shell ships one Electron main entry. The renderer preload stays
 * a plain tsc artifact (`lib/types/preload.cjs`) because Electron loads
 * preloads by path and ESM preloads carry extension constraints tsdown would
 * have to reproduce. Declarations come from `tsc -b` (dts: false), matching
 * every package.
 */
export default defineConfig({
  entry: ['lib/types/main.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  deps: {
    neverBundle: ['electron'],
  },
  fixedExtension: false,
  dts: false,
  clean: false,
})
