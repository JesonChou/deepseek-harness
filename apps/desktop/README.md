# dsh-desktop

English | [中文](README.zh.md)

Minimal Electron shell that renders the DeepSeek Harness Web UI in a standalone window: no tabs, no address bar, and a second launch focuses the existing window. Closing the window quits the shell and stops the Web Host through `scripts/stop-web.ps1`, so an app-style exit leaves no orphaned server. The Windows desktop launcher ([`scripts/launch-web.ps1`](../../scripts/launch-web.ps1)) owns server startup and prefers this shell over the browser; this package itself only draws the window and stops the Host on exit.

## Layout

- `src/main.ts` — Electron main process: single-instance lock, the `BrowserWindow`, and `--smoke` headless verification.
- `src/url.ts` — URL resolution (launcher environment, `--url=`, default).
- `build/icon.png` — window icon, generated with [`scripts/render-launch-web-icon.py`](../../scripts/render-launch-web-icon.py).

## Use

The launcher starts the shell when `lib/main.js` is built and `electron` is installed; otherwise it falls back to Edge/Chrome `--app` mode. Build with the repository build (`pnpm run build`), then double-click the desktop shortcut. Verify the shell headlessly with:

```sh
node_modules/electron/dist/electron.exe . --smoke --url=http://127.0.0.1:3080
```

The shell never starts the server: run `dsh web` (or the launcher) first.
