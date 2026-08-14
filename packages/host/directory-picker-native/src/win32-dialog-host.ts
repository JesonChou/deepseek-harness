/**
 * Real-process half of the Win32 dialog driver: spawn the dialog child
 * process (source or built plane) and close a dialog thread's windows. The
 * module itself loads everywhere (the import chain from native-picker.ts is
 * static); what stays win32-only is koffi, imported dynamically inside the
 * bindings' functions. The driver's logic is tested against fakes of this
 * surface instead.
 */

import { spawn, type StdioOptions } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Win32DialogWorkerData } from './win32-dialog-worker.ts'

/**
 * Build the dialog worker's child environment. Under Electron, `process.execPath`
 * is the app executable, so the child must opt into Node mode
 * (`ELECTRON_RUN_AS_NODE`) before it can run the bundled worker entry.
 * @param base - the inherited environment plus the dialog title.
 * @param isElectron - whether the spawning host is an Electron main process.
 * @returns the child environment.
 */
export function dialogWorkerEnvironment(base: NodeJS.ProcessEnv, isElectron: boolean): NodeJS.ProcessEnv {
  return isElectron ? { ...base, ELECTRON_RUN_AS_NODE: '1' } : { ...base }
}

/**
 * Spawn the dialog child process. Built consumers launch the bundled CJS
 * entry next to this module under plain node; unbuilt (source) consumers
 * bootstrap tsx first, mirroring the dsh CLI's source launch. The dialog is
 * the child's first window, so Windows activates it without a foreground
 * call.
 * @param data - the child payload (dialog title).
 * @returns the spawned child process.
 */
export function spawnDialogWorker(data: Win32DialogWorkerData): ReturnType<typeof spawn> {
  /* v8 ignore next -- the Electron arm only runs inside the packaged shell; the helper's unit tests cover both outcomes. */
  const env = dialogWorkerEnvironment(
    { ...process.env, DSH_DIALOG_TITLE: data.title },
    process.versions.electron !== undefined,
  )
  const stdio: StdioOptions = ['ignore', 'inherit', 'inherit', 'ipc']
  /* v8 ignore next 3 -- the built-output arm: tests always run unbuilt (src/) */
  if (!import.meta.url.endsWith('.ts')) {
    return spawn(process.execPath, [fileURLToPath(new URL('./worker.cjs', import.meta.url))], { env, stdio, windowsHide: true })
  }
  return spawn(process.execPath, ['--import', import.meta.resolve('tsx/esm'), fileURLToPath(new URL('./win32-dialog-worker.ts', import.meta.url))], { env, stdio, windowsHide: true })
}

export { closeThreadWindows } from './win32-dialog-bindings.ts'
