import { defineConfig } from 'tsdown'

/**
 * The desktop shell ships one entry: the Electron main process referenced by
 * package.json `main`. The root tsdown builds only `lib/types/index.js`, so
 * this override points at `lib/types/main.js`. electron stays external: the
 * Electron runtime provides it, it is never bundled.
 */
export default defineConfig({
  entry: ['lib/types/main.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  external: ['electron'],
})
