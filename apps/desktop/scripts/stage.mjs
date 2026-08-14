/**
 * Desktop packaging stage: materialize the production dependency closure as
 * real npm tarballs and a flat node_modules outside the monorepo, then hand
 * that directory to electron-builder. electron-builder cannot reconstruct
 * pnpm's symlinked workspace layout, so the stage installs packed tarballs
 * (`pnpm pack` rewrites `workspace:` ranges) into a hoisted consumer.
 *
 * Usage: node scripts/stage.mjs --out <dir> [--skip-install]
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    'skip-install': { type: 'boolean', default: false },
    'store-dir': { type: 'string' },
  },
  allowPositionals: false,
})

if (values.out === undefined) throw new Error('usage: stage.mjs --out <directory> [--skip-install]')
const outDir = resolve(values.out)

/** Run pnpm through its .cmd shim; Windows spawns cannot exec a bare name. */
function pnpm(args) {
  const shim = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  return spawnSync(shim, args, { encoding: 'utf8', shell: process.platform === 'win32', stdio: 'pipe' })
}

function requireSuccess(result, step) {
  if (result.status !== 0) {
    throw new Error(`${step} failed:\n${result.stdout}\n${result.stderr}`)
  }
}

/**
 * Every workspace package in the app's production closure, as name -> directory.
 * Breadth-first over each package's own manifest (dependencies, peers, and
 * optional dependencies): pnpm links every direct dependency into a package's
 * node_modules, so Node resolution from the discovered directories is complete
 * where `pnpm list` omits auto-installed peers.
 */
function workspaceClosure() {
  const requireFrom = createRequire(join(APP_DIR, 'package.json'))
  const members = new Map()
  const queue = [APP_DIR]
  while (queue.length > 0) {
    const directory = queue.shift()
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    const names = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ]
    for (const name of names) {
      if (!name.startsWith('@deepseek-ai/') || members.has(name)) continue
      let manifestPath
      try {
        manifestPath = requireFrom.resolve(`${name}/package.json`, { paths: [directory] })
      } catch {
        continue
      }
      const packageDir = dirname(manifestPath)
      if (packageDir.includes('node_modules')) continue
      members.set(name, packageDir)
      queue.push(packageDir)
    }
  }
  return members
}

const members = workspaceClosure()
const tarballDir = join(outDir, 'tarballs')
// Windows can hold the previous stage briefly (indexer, antivirus, or a
// lingering electron-builder handle); retry a bounded number of times instead
// of failing the whole pack on a transient lock.
for (let attempt = 0; ; attempt++) {
  try {
    rmSync(outDir, { recursive: true, force: true })
    break
  } catch (error) {
    if (error && error.code !== 'EPERM' || attempt >= 5) throw error
    await sleep(3000)
  }
}
mkdirSync(tarballDir, { recursive: true })

const dependencies = {}
const packedVersions = {}
for (const [name, directory] of [...members].sort(([left], [right]) => left.localeCompare(right))) {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  const os = manifest.os
  const cpu = manifest.cpu
  const platformOk = (os === undefined || os.includes(process.platform))
    && (cpu === undefined || cpu.includes(process.arch))
  if (!platformOk) {
    console.error(`skipping ${name}: not for ${process.platform}/${process.arch}`)
    continue
  }
  const declaredFiles = Array.isArray(manifest.files) ? manifest.files : []
  const hasBuiltPayload = declaredFiles.some(entry => !entry.startsWith('!') && existsSync(join(directory, entry.replace(/\/$/, ''))))
  if (declaredFiles.length > 0 && !hasBuiltPayload) {
    throw new Error(`${name} declares files but none exist: run \`pnpm run build\` before staging`)
  }
  const relativePath = relative(APP_DIR, directory)
  console.error(`packing ${name} (${relativePath})`)
  const packed = pnpm(['--dir', directory, 'pack', '--pack-destination', tarballDir])
  requireSuccess(packed, `pnpm pack ${name}`)
  const tarball = packed.stdout.trim().split(/\r?\n/).at(-1)
  if (tarball === undefined || !tarball.endsWith('.tgz')) {
    throw new Error(`pnpm pack ${name} printed no tarball path`)
  }
  dependencies[name] = pathToFileURL(resolve(tarball)).href
  packedVersions[name] = manifest.version
}

// The app manifest is the stage root manifest: same payload and tarball-backed
// production dependencies. electron-builder runs from the repository checkout,
// so the stage installs production dependencies only; the electron version
// stays as metadata for the packager.
const appManifest = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8'))
appManifest.name = '@deepseek-ai/dsh-desktop-stage'
appManifest.dependencies = {
  ...dependencies,
  ...Object.fromEntries(Object.entries(appManifest.dependencies ?? {})
    .filter(([name]) => !name.startsWith('@deepseek-ai/'))),
}
appManifest.pnpm = {
  overrides: {
    koffi: '3.1.1',
    'node-pty': '1.1.0',
  },
}
appManifest.devDependencies = { electron: '38.8.6' }
writeFileSync(join(outDir, 'package.json'), `${JSON.stringify(appManifest, null, 2)}\n`)

for (const entry of ['lib', 'config', 'resources', 'build']) {
  const source = join(APP_DIR, entry)
  try {
    cpSync(source, join(outDir, entry), { recursive: true })
  } catch {
    // build/icon.png is generated; missing entries are not fatal.
  }
}
for (const file of ['tsconfig.json', 'tsdown.config.ts']) {
  cpSync(join(APP_DIR, file), join(outDir, file))
}
writeFileSync(join(outDir, 'electron-builder.yml'), [
  'appId: com.deepseek.harness.desktop',
  'productName: DeepSeek Harness',
  'asar: false',
  'npmRebuild: false',
  'directories:',
  `  output: ${JSON.stringify(join(outDir, 'release'))}`,
  'files:',
  '  - lib/**/*',
  '  - config/**/*',
  '  - resources/**/*',
  '  - package.json',
  'extraResources:',
  '  - from: vendor/node_modules',
  '    to: app/node_modules',
  'win:',
  '  icon: build/icon.png',
  '  target:',
  '    - target: nsis',
  '      arch: [x64]',
  'nsis:',
  '  oneClick: false',
  '  perMachine: false',
  '  allowToChangeInstallationDirectory: true',
  '  createDesktopShortcut: true',
  '  createStartMenuShortcut: true',
  '  runAfterFinish: false',
  '  shortcutName: DeepSeek Harness',
  '',
].join('\n'))

if (!values['skip-install']) {
  const installArgs = [
    'install',
    '--ignore-workspace',
    '--config.node-linker=hoisted',
    '--config.strictDepBuilds=false',
    '--prod',
    '--dir', outDir,
  ]
  if (values['store-dir'] !== undefined) installArgs.splice(1, 0, '--store-dir', values['store-dir'])
  const installed = pnpm(installArgs)
  requireSuccess(installed, 'pnpm install stage')

  // electron-builder rebuilds its dependency tree from `dependencies`, and a
  // hoisted pnpm layout defeats that traversal: it fails the build over
  // packages that ARE present. The builder manifest therefore declares no
  // production dependencies, the installed closure moves out of reach into
  // vendor/node_modules (copied verbatim through extraResources), and the
  // runtime keeps the full name list in resources/runtime-manifest.json so
  // healProfilesModuleFallback can build the profile symlink closure.
  const stagedManifest = JSON.parse(readFileSync(join(outDir, 'package.json'), 'utf8'))
  const runtimeDependencies = Object.fromEntries(
    Object.entries(stagedManifest.dependencies).map(([name, specifier]) => {
      const version = packedVersions[name]
      return [name, typeof version === 'string' ? version : specifier]
    }),
  )
  stagedManifest.dependencies = {}
  delete stagedManifest.pnpm
  writeFileSync(join(outDir, 'package.json'), `${JSON.stringify(stagedManifest, null, 2)}\n`)
  writeFileSync(
    join(outDir, 'resources', 'runtime-manifest.json'),
    `${JSON.stringify({ name: '@deepseek-ai/dsh-desktop', dependencies: runtimeDependencies }, null, 2)}\n`,
  )

  const vendorModules = join(outDir, 'vendor', 'node_modules')
  mkdirSync(dirname(vendorModules), { recursive: true })
  renameSync(join(outDir, 'node_modules'), vendorModules)
}

console.log(outDir)
