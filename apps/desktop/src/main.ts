/**
 * Electron main process: boot the in-process harness host, register the
 * `dsh://` protocol and IPC bridge, and open the window over the built
 * frontend. `--smoke --smoke-out <path>` boots headlessly enough to capture a
 * screenshot of the settled UI and exit, which the packaging flow uses as the
 * installed-app acceptance check.
 * @module @deepseek-ai/dsh-desktop/main
 */

import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from 'electron'
import { writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { inspect } from 'node:util'
import { fileURLToPath } from 'node:url'
import { bootDesktop } from './boot.ts'
import { dumpComposition, patchPath, readPatch, writePatch } from './composition.ts'
import { DesktopIpc } from './ipc.ts'
import { rewriteBootGraph, type DesktopBootGraph } from './manifest.ts'
import { installProtocolHandlers, registerDshScheme } from './protocol.ts'
import type { DesktopApiProxy } from './ipc.ts'

/** The client-modules registry slice the desktop shell reads after boot. */
interface ClientModulesLike {
  /** Current composed boot graph. */
  graph(): DesktopBootGraph
  /** Absolute path of one entry's built client bundle, when present. */
  clientPath(id: string): string | undefined
}

/** Smoke-mode arguments parsed from the process command line. */
interface SmokeOptions {
  readonly enabled: boolean
  readonly output: string
  readonly timeoutMs: number
}

function parseSmokeOptions(argv: readonly string[]): SmokeOptions {
  const findValue = (flag: string): string | undefined => {
    const equals = argv.find(arg => arg.startsWith(`${flag}=`))
    if (equals !== undefined) return equals.slice(flag.length + 1)
    const index = argv.indexOf(flag)
    return index !== -1 ? argv[index + 1] : undefined
  }
  return {
    enabled: argv.includes('--smoke'),
    output: findValue('--smoke-out') ?? join(app.getPath('userData'), 'smoke.png'),
    timeoutMs: Number(findValue('--smoke-timeout-ms')) || 12000,
  }
}

/** Optional `--dsh-home` override so tests and users can relocate harness data. */
function parseDshHome(argv: readonly string[]): string | undefined {
  const equals = argv.find(arg => arg.startsWith('--dsh-home='))
  if (equals !== undefined) return equals.slice('--dsh-home='.length)
  const index = argv.indexOf('--dsh-home')
  return index !== -1 ? argv[index + 1] : undefined
}

const smoke = parseSmokeOptions(process.argv)
const dshHomeOverride = parseDshHome(process.argv)

if (smoke.enabled) {
  // The probe may run beside a live user instance; a private userData avoids
  // Chromium cache-lock noise and keeps the probe off the user's data dir.
  app.setPath('userData', join(tmpdir(), `dsh-desktop-smoke-${String(process.pid)}`))
}

// The watch-only HMR instance computes its main module URL from
// `process.argv[1]`; a packaged exe has no script argument, so point the slot
// at the shell's own entry before any plugin boots.
if (process.argv.length < 2) process.argv.push(fileURLToPath(import.meta.url))

if (smoke.enabled) {
  try {
    writeFileSync(`${smoke.output}.started`, 'main module loaded')
  } catch {
    // The marker is diagnostic sugar; failures surface through the exit code.
  }
  process.on('uncaughtException', (error) => {
    try {
      writeFileSync(`${smoke.output}.error.txt`, inspect(error, { depth: 12 }))
    } catch {
      // Diagnostic only.
    }
    app.exit(1)
  })
  process.on('unhandledRejection', (reason) => {
    try {
      writeFileSync(`${smoke.output}.error.txt`, inspect(reason, { depth: 12 }))
    } catch {
      // Diagnostic only.
    }
    app.exit(1)
  })
}

registerDshScheme()

/** The window the renderer loads; undefined until boot succeeds. */
let mainWindow: BrowserWindow | undefined
/** One-shot tree disposal guard for quit. */
let disposed = false
/** The booted root context, held for disposal. */
let rootCtx: Awaited<ReturnType<typeof bootDesktop>>['ctx'] | undefined

// The smoke probe runs beside an already-open instance: it is a diagnostic
// harness, not a second user window, so it does not take the single-instance
// lock and does not receive the ordinary second-instance focus path.
const gotSingleInstance = smoke.enabled || app.requestSingleInstanceLock()
if (!gotSingleInstance) {
  app.quit()
}

app.on('second-instance', () => {
  if (mainWindow === undefined) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', (event) => {
  if (disposed || rootCtx === undefined) return
  event.preventDefault()
  disposed = true
  void rootCtx.fiber.dispose().finally(() => { app.quit() })
})

void app.whenReady().then(async () => {
  if (!gotSingleInstance) return
  try {
    await run()
  } catch (error) {
    console.error('[dsh-desktop] boot failed:', error)
    if (smoke.enabled) {
      try {
        writeFileSync(`${smoke.output}.error.txt`, inspect(error, { depth: 12 }))
      } catch {
        // The error file is diagnostic sugar; the exit code is the signal.
      }
    } else {
      dialog.showErrorBox('DeepSeek Harness failed to start', String(error))
    }
    app.exit(1)
  }
})

/** Boot the host, install transport, and open the window. */
async function run(): Promise<void> {
  const home = dshHomeOverride ?? process.env.DSH_HOME ?? app.getPath('userData')
  process.env.DSH_HOME = home
  process.chdir(homedir())

  const booted = await bootDesktop({
    home,
    onExit: (code) => { app.exit(code) },
  })
  rootCtx = booted.ctx

  const modules = booted.ctx.get('clientModules') as ClientModulesLike | undefined
  if (modules === undefined) {
    throw new Error('dsh-desktop: the desktop composition mounts no client module registry')
  }
  const graph = modules.graph()
  const pluginFiles = new Map<string, string>()
  for (const entry of graph.entries) {
    const clientPath = modules.clientPath(entry.id)
    if (clientPath !== undefined) pluginFiles.set(entry.id, clientPath)
  }

  const distDir = dirname(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-web-frontend/dist/index.html')))
  const composerDir = fileURLToPath(new URL('../resources/composer/', import.meta.url))

  installProtocolHandlers({
    distDir,
    composerDir,
    pluginFiles,
    forwardToHost: async url => fetch(
      `http://127.0.0.1:${String(booted.port)}${url.pathname}${url.search}`,
    ),
  })

  const ipc = new DesktopIpc({
    port: booted.port,
    apiProxy: booted.ctx.get('apiProxy') as DesktopApiProxy,
    bootGraph: rewriteBootGraph(graph),
    compositionDump: () => dumpComposition(booted.ctx),
    readPatch: () => readPatch(home),
    writePatch: (text) => { writePatch(home, text) },
  })

  const preload = fileURLToPath(new URL('./types/preload.cjs', import.meta.url))
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })
  const mainWebContents = mainWindow.webContents
  mainWindow.on('closed', () => {
    ipc.cleanupWebContents(mainWebContents.id)
    mainWindow = undefined
  })
  if (smoke.enabled) installSmokeCapture(mainWindow, smoke)

  const template: MenuItemConstructorOptions[] = [
    {
      label: '工具',
      submenu: [
        {
          label: '插件拼接 / Composition',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => { openCompositionWindow(preload, ipc) },
        },
        {
          label: '打开用户补丁 / Open patch file',
          click: () => {
            void shell.openPath(patchPath(home))
          },
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  await mainWindow.loadURL('dsh://app/index.html')
}

/** Open the standalone composition window over the same preload bridge. */
function openCompositionWindow(preload: string, ipc: DesktopIpc): void {
  const existing = BrowserWindow.getAllWindows().find(window => window.getTitle() === '插件拼接 / Composition')
  if (existing !== undefined) {
    existing.focus()
    return
  }
  const window = new BrowserWindow({
    width: 980,
    height: 720,
    title: '插件拼接 / Composition',
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  window.on('closed', () => { ipc.cleanupWebContents(window.webContents.id) })
  void window.loadURL('dsh://composer/index.html')
}

/** Capture the settled renderer to the smoke output and exit with a status. */
function installSmokeCapture(window: BrowserWindow, options: SmokeOptions): void {
  const errors: string[] = []
  window.webContents.on('console-message', (_event, ...args: unknown[]) => {
    const first = args[0]
    const level = typeof first === 'object' && first !== null ? (first as { level?: unknown }).level : first
    const message = typeof first === 'object' && first !== null ? (first as { message?: unknown }).message : args[1]
    if (level === 'error' || level === 3) errors.push(String(message))
  })
  const timer = setTimeout(() => {
    console.error('[dsh-desktop] smoke timed out', errors.join('\n'))
    app.exit(2)
  }, options.timeoutMs)
  window.webContents.once('did-finish-load', () => {
    void (async () => {
      const deadline = Date.now() + options.timeoutMs
      let ready = false
      while (Date.now() < deadline) {
        try {
          ready = await window.webContents.executeJavaScript(
            'Boolean(window.__DSH_MODULES__) && (document.querySelector("#root")?.childElementCount ?? 0) > 0',
          ) as boolean
          if (ready) break
        } catch {
          // The page may still be mid-boot; keep polling until the deadline.
        }
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      if (!ready) {
        console.error('[dsh-desktop] smoke: the web shell kernel never booted', errors.join('\n'))
        clearTimeout(timer)
        app.exit(2)
        return
      }
      // Prove the full bridge end to end: preload fetch -> IPC -> loopback
      // HTTP -> gateway -> workspace registry. A non-ok result names the
      // broken hop in the diagnostic instead of leaving a blank-page pass.
      const probe = await window.webContents.executeJavaScript(`
        (async () => {
          const response = await fetch('/api/workspace.list', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'client-request', rpcId: 'smoke-probe', method: 'workspace.list', payload: {} }),
          })
          return { status: response.status, body: await response.text() }
        })()
      `) as { status: number; body: string }
      if (probe.status !== 200) {
        console.error(`[dsh-desktop] smoke: workspace.list probe failed: ${probe.status} ${probe.body}`)
        clearTimeout(timer)
        app.exit(2)
        return
      }
      // Let the first React paint settle before capture; the readiness probe
      // only proves the shell mounted a root element.
      await new Promise(resolve => setTimeout(resolve, 2500))
      try {
        const image = await window.webContents.capturePage()
        writeFileSync(options.output, image.toPNG())
        writeFileSync(`${options.output}.ok`, 'SMOKE_OK')
        console.log(`SMOKE_OK ${options.output}`)
        clearTimeout(timer)
        app.exit(0)
      } catch (error) {
        console.error('[dsh-desktop] smoke capture failed:', error, errors.join('\n'))
        clearTimeout(timer)
        app.exit(1)
      }
    })()
  })
}
