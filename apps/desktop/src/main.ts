/**
 * Minimal Electron shell for the DeepSeek Harness Web UI.
 *
 * The launcher (scripts/launch-web.ps1) owns server startup and port polling;
 * this process only renders the Web UI in a standalone window. The URL comes
 * from the DSH_WEB_URL environment variable the launcher sets, from --url=...,
 * or from the default. A second launch while a window exists focuses the
 * existing window instead of opening another one.
 *
 * Run `electron apps/desktop --smoke` to load the URL headlessly and exit 0 on
 * success (1 on failure); the launcher never passes --smoke.
 *
 * electron is imported dynamically: static top-level imports of the electron
 * builtin are flaky under Electron 38's ESM main-process loader.
 * @module @deepseek-ai/dsh-desktop
 */
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BrowserWindow as BrowserWindowType, HandlerDetails } from 'electron'
import { resolveWebUrl } from './url.js'

const desktopRoot = fileURLToPath(new URL('..', import.meta.url))
const iconPath = join(desktopRoot, 'build', 'icon.png')
const smoke = process.argv.includes('--smoke')
const smokeLog = join(desktopRoot, 'tmp', 'desktop-smoke.log')
const log = (message: string) => {
  if (smoke) appendFileSync(smokeLog, message + '\n')
}
log('main module top-level reached')

void import('electron').then(({ app, BrowserWindow, shell }) => {
  // Unpackaged Electron apps all default to %APPDATA%\Electron, so another
  // Electron app on the machine (e.g. Reasonix) would share our userData and
  // single-instance lock. Give the shell its own data directory first.
  app.setPath('userData', join(app.getPath('appData'), 'DeepSeekHarnessWeb'))
  log('userData: ' + app.getPath('userData'))

  if (!app.requestSingleInstanceLock()) {
    // Another shell instance already owns the window; it focuses it for us.
    log('single-instance lock held elsewhere; quitting')
    app.quit()
    return
  }

  let mainWindow: BrowserWindowType | undefined

  app.setAppUserModelId('com.deepseek.dsh-web')

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  void app.whenReady().then(() => {
    log('ready; loading ' + resolveWebUrl(process.argv, process.env))
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      autoHideMenuBar: true,
      icon: iconPath,
      show: !smoke,
      webPreferences: { backgroundThrottling: false },
    })
    mainWindow.webContents.setWindowOpenHandler(({ url }: HandlerDetails) => {
      if (/^https?:/i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    mainWindow.webContents.on('did-finish-load', () => { log('did-finish-load') })
    mainWindow.webContents.on('did-fail-load', (_event: unknown, code: number, description: string) => { log(`did-fail-load ${code} ${description}`) })
    mainWindow.webContents.on('dom-ready', () => { log('dom-ready') })

    void mainWindow.loadURL(resolveWebUrl(process.argv, process.env)).then(() => {
      log('loadURL resolved')
      if (smoke) {
        // Headless verification: the page loaded; report success and leave.
        app.exit(0)
      }
    }, (error: unknown) => {
      log('loadURL rejected: ' + String(error))
      console.error('[dsh-desktop] failed to load the Web UI:', error)
      if (smoke) app.exit(1)
    })
  })
})
