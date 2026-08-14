# Agent Note: minimal Electron shell for the Web UI

Status: implemented

English | [中文](2026-08-15-desktop-electron-shell.zh.md)

## Problem

The [web-launcher Agent Note](../../process/2026-08-14-windows-desktop-web-launcher.md) shipped a desktop entry whose UI step opened a browser `--app` window. That window still belongs to the browser: its taskbar icon is the browser's, its session mixes with everyday browsing, and upgrades to the browser can change the window's look. A desktop-application feel needs the UI in its own shell process.

## Decision

`apps/desktop` is a minimal Electron shell: a single main-process file that renders the Web UI in a standalone `BrowserWindow` (no tabs, no address bar) and does nothing else. The launcher keeps owning server startup and port polling; the shell only draws the window. Specifics:

- **Single instance with focus.** `app.requestSingleInstanceLock()` plus a `second-instance` handler restores and focuses the existing window, so a second double-click reopens the UI instead of stacking windows.
- **Own userData.** Unpackaged Electron apps all default to `%APPDATA%\Electron`, which would share state and the single-instance lock with other Electron apps on the machine (e.g. Reasonix). The shell sets `userData` to `%APPDATA%\DeepSeekHarnessWeb` before taking the lock.
- **Dynamic electron import.** Static top-level `import 'electron'` proved flaky under Electron 38's ESM main-process loader (the process intermittently exited before any code ran); the whole body runs inside `import('electron').then(...)`, which loads reliably. The `import type` declarations stay static and are erased at compile time.
- **`--smoke` headless verification.** With `--smoke` the shell logs its progress to `apps/desktop/tmp/desktop-smoke.log` (gitignored; the GUI subsystem discards stdout) and exits 0 once `loadURL` resolves, 1 on failure. The launcher never passes `--smoke`.
- **Launcher tiers.** `launch-web.ps1` opens the UI via the shell when `apps/desktop/lib/main.js` and the electron binary exist, then Edge `--app`, then Chrome `--app`, then the default browser. The URL travels through the `DSH_WEB_URL` environment variable.
- **Build.** Same pattern as `apps/cli`: `tsc -b` emits `lib/types`, the package's tsdown config bundles `lib/types/main.js` to `lib/main.js` with `electron` external. `pnpm-workspace.yaml` lists `electron: true` under `allowBuilds` so its postinstall (runtime binary download) runs.

## Alternatives considered

**Reusing the full desktop app from the desktop-app branch** (composition window, patch layer, packaging). Rejected: that assembly targets a different product surface; this note's shell is deliberately one window and one file.

**Staying on browser `--app` mode.** Rejected: the window remains the browser's (taskbar icon, session, upgrade behavior), which is exactly what this change removes.

**Packaging with electron-builder now.** Rejected for this iteration: an unpackaged shell already delivers the window experience; a packaged exe (own taskbar icon, installer) is a follow-up, not a prerequisite.

## Consequences

The Electron window has its own browser state under `%APPDATA%\DeepSeekHarnessWeb`: users who configured the model API key in a browser must configure it once inside the Electron window. The taskbar icon is Electron's default until the shell is packaged. `pnpm install` now downloads the Electron runtime binary (~100 MB, one-time). The smoke log directory `apps/desktop/tmp/` is gitignored. The [web-launcher note](../../process/2026-08-14-windows-desktop-web-launcher.md) keeps owning the desktop-entry decision; this note supersedes its "browser --app window" fact.

## Testing

`apps/desktop/tests/url.spec.ts` unit-tests URL resolution (environment, `--url=`, default). The full chain — built shell plus `electron ... --smoke` against a running Web UI — was exercised on Windows and logged module load, ready, dom-ready, did-finish-load, and a 0 exit. `scripts/launch-web.spec.ts` still covers the launcher branches; the second-launch focus path was verified manually by relaunching against a live window and observing a single titled window.
