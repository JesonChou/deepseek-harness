/**
 * Desktop host boot: compose the dsh-base + dsh-web-app bundle layers, the
 * desktop overlay, the persisted project roots, and the user patch layer, then
 * boot the tree in-process and attach the live patch watcher.
 * @module @deepseek-ai/dsh-desktop/boot
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import {
  boot,
  healProfilesModuleFallback,
  loadLayeredEnv,
  loadOptionalPatches,
  loadOverlayPatches,
  watchUserPatches,
} from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { loadSessionRoots, patchPath, syncSessionRoots } from './composition.ts'

/** Absolute path of the desktop overlay patch. */
const DESKTOP_PATCH_PATH = fileURLToPath(new URL('../config/desktop.patch.yml', import.meta.url))

/** The runtime manifest carrying the full dependency name closure: the
 * installation anchor for the healed module fallback. electron-builder's
 * package.json declares no production dependencies (its collector cannot
 * parse a hoisted pnpm layout), so the closure travels beside it; the dev
 * checkout falls back to the app's own package.json. */
const INSTALL_ANCHOR = (() => {
  const runtimeManifest = fileURLToPath(new URL('../resources/runtime-manifest.json', import.meta.url))
  return existsSync(runtimeManifest)
    ? runtimeManifest
    : fileURLToPath(new URL('../package.json', import.meta.url))
})()

/** The session-persistence row id the root patch restates. */
const SESSION_PERSISTENCE_ROW_ID = 'session-persistence-jsonl'

/** The empty Loader include root written into the desktop profile directory. */
const PROFILE_ROOT_CONFIG = `# DeepSeek Harness desktop profile root: an empty entry list. The tree is composed as
# patch layers (dsh-base, dsh-web-app, desktop overlay, user patch). Edit
# $DSH_HOME/cordis.patch.yml, not this file.
[]
`

/**
 * Materialize the desktop profile directory under the Harness home and write
 * its empty root config. The directory name matters, not the manifest: bare
 * plugin specifiers resolve through the parent-walk into the healed
 * `$DSH_HOME/profiles/node_modules` fallback.
 * @param home - the Harness home directory.
 * @returns the absolute root config path.
 */
function prepareDesktopProfile(home: string): string {
  const dir = join(home, 'profiles', 'desktop')
  mkdirSync(dir, { recursive: true })
  const configPath = join(dir, 'cordis.yml')
  writeFileSync(configPath, PROFILE_ROOT_CONFIG)
  return configPath
}

/**
 * Resolve a bundle package's patch file by walking up from its resolved entry
 * to the manifest that declares `dsh.bundle.patch`. Works for both the bundled
 * `lib/` entry and any directory-form entry.
 * @param packageName - the bundle package name.
 * @returns the absolute patch-file path.
 */
export function resolveBundlePatchPath(packageName: string): string {
  const entryUrl = import.meta.resolve(packageName)
  // A directory-form entry (a source-root mapping) ends with '/'; a file entry
  // starts its walk at its own directory.
  let dir = entryUrl.endsWith('/') ? fileURLToPath(entryUrl) : dirname(fileURLToPath(entryUrl))
  for (;;) {
    const manifestPath = join(dir, 'package.json')
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        dsh?: { bundle?: { patch?: unknown } }
      }
      if (typeof manifest.dsh?.bundle?.patch === 'string') {
        return join(dir, manifest.dsh.bundle.patch)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(`dsh-desktop: bundle package ${packageName} declares no dsh.bundle.patch`)
    }
    dir = parent
  }
}

/** The settled desktop host: the root context and the embedded loopback port. */
export interface BootedDesktop {
  /** The settled root context; disposal owns the whole tree. */
  readonly ctx: Context
  /** The embedded HTTP server's listening port (loopback only). */
  readonly port: number
}

/** Options for {@link bootDesktop}. */
export interface BootDesktopOptions {
  /** The Harness home directory for settings, sessions, and patches. */
  readonly home: string
  /** Launcher-owned exit request (the cmdline provider's `appExit`). */
  readonly onExit: (code: number) => void
}

/**
 * Boot the desktop host and attach live user-patch recomposition.
 * @param options - the Harness home and the exit callback.
 * @returns the settled context and embedded server port.
 */
export async function bootDesktop(options: BootDesktopOptions): Promise<BootedDesktop> {
  const environment = loadLayeredEnv('dsh-desktop', homedir())
  healProfilesModuleFallback(INSTALL_ANCHOR, options.home)
  const bundlePatches = [
    ...loadOverlayPatches('dsh-desktop', resolveBundlePatchPath('@deepseek-ai/dsh-base')),
    ...loadOverlayPatches('dsh-desktop', resolveBundlePatchPath('@deepseek-ai/dsh-web-app')),
  ]
  const desktopPatches = loadOverlayPatches('dsh-desktop', DESKTOP_PATCH_PATH)
  const rootsPatch = (): PatchOptions => ({
    id: SESSION_PERSISTENCE_ROW_ID,
    config: {
      root: join(options.home, 'sessions'),
      projectRoots: loadSessionRoots(options.home),
    },
  })
  const homePatches = (): PatchOptions[] => loadOptionalPatches('dsh-desktop', patchPath(options.home)) ?? []
  const composeLive = (): PatchOptions[] => structuredClone([
    ...bundlePatches,
    ...desktopPatches,
    rootsPatch(),
    ...homePatches(),
  ])

  const ctx = await boot(
    'dsh-desktop',
    prepareDesktopProfile(options.home),
    composeLive(),
    (hostCtx) => {
      hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
      provideCmdline(hostCtx, { args: [], exit: options.onExit })
    },
  )

  syncSessionRoots(ctx, options.home)

  // Config-only HMR for the live user patch layer: the web bundle disables the
  // shared module-reload row, so mount a watch-only instance when none exists.
  if (ctx.get('hmr') === undefined) {
    if (ctx.get('timer') === undefined) {
      await ctx.loader.create({ name: '@deepseek-ai/cordis-plugin-timer' })
    }
    // A non-empty module root: the watch-only instance exists for the user
    // patch watcher, and chokidar rejects an empty path set at init. Watching
    // the profile directory is the narrowest root that is never empty.
    await ctx.loader.create({ name: '@deepseek-ai/cordis-plugin-hmr', config: { root: ['.'] } })
  }
  await watchUserPatches(ctx, {
    binName: 'dsh-desktop',
    filename: patchPath(options.home),
    compose: composeLive,
  })

  const webServer = ctx.get('webServer')
  if (webServer === undefined) {
    throw new Error('dsh-desktop: the desktop composition mounts no web server')
  }
  return { ctx, port: webServer.port }
}
