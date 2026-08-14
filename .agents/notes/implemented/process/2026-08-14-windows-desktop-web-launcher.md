# Agent Note: Windows desktop launcher for the Web UI

Status: implemented

English | [中文](2026-08-14-windows-desktop-web-launcher.zh.md)

## Problem

Starting the Web UI on Windows takes three manual steps: open a PowerShell prompt, run `npx @deepseek-ai/dsh web`, and point a browser at the address the command prints. A person who uses the Web UI like a desktop application wants one double-click entry that performs all three.

## Decision

The repository ships four plain Windows scripts under `scripts/` with no added runtime dependency:

- `launch-web.ps1` is the launcher. When the port already accepts connections it only opens the UI window, so a second double-click reopens the UI. Otherwise it starts the Web UI server in a hidden console window, polls the port for up to 120 seconds, and opens the UI in an application window at `http://127.0.0.1:<port>` — the [Electron shell](../../feature/2026-08-15-desktop-electron-shell.md) when built and installed, Edge `--app` mode, Chrome `--app` mode, and the default browser in that order, so the UI shows with no tabs and no address bar. The start command prefers the checkout's built CLI (`node apps\cli\lib\bin.js web --port <port>`) and falls back to the published package (`npx --yes @deepseek-ai/dsh web --port <port>` run from the user profile directory); the [local-CLI bug-fix Agent Note](../../bug-fix/2026-08-14-windows-desktop-launcher-local-cli.md) owns that split. `-NoBrowser`, `-NonInteractive`, and `-DryRun` serve automation and tests.
- `launch-web.vbs` runs the launcher without a console window; it is the shortcut's target, so a double-click shows no window flash.
- `stop-web.ps1` stops the node process listening on the port after confirming its command line names `dsh` or `bin.js`; it refuses other port owners and is the only way to stop the hidden server.
- `create-web-shortcut.ps1` writes the desktop shortcut, targeting `wscript.exe` with the vbs as its argument and `scripts/launch-web.ico` as its icon.

The launcher prefers the checkout's built CLI, which matches how the repository runs its own Web UI and needs no network; the published-package path stays as the fallback for checkouts without built artifacts. The scripts target Windows PowerShell 5.1, which is present on every supported Windows, and report failures as popups except under `-NonInteractive`.

## Alternatives considered

**An Electron or other desktop shell around the Web UI.** Rejected: the browser is already the UI, and a shell adds a dependency and a second window without new behavior.

**Launching the source checkout (`pnpm dsh web`, building first).** Rejected: any checkout without built frontend artifacts would fail to launch, and the published-package path is what the README and the installed Web UI use.

**Tracking the started process through pid files.** Rejected: the console chain (`cmd` → `npx` → `node`) makes a recorded pid transient, and discovering the port owner by listening state and command line also covers servers started by hand.

**Requiring PowerShell 7.** Rejected: Windows ships 5.1, and the target machine does not have pwsh installed.

## Consequences

The scripts are Windows-only; the spec skips on other platforms. `stop-web.ps1` stops any node `dsh` process owning the port, including servers started by hand. The served version follows the checkout's build (`apps/cli/lib`), and the npx fallback follows npx's package resolution. The icon is generated from `apps/web/public/favicon.svg` (whale recolored to the brand blue, packed as multi-size DIB entries for transparent decoding on Windows) and committed as a static asset.

## Testing

`scripts/launch-web.spec.ts` runs only on Windows and covers the already-listening branch, the dry run (asserting the local-CLI command when the checkout is built and the npx fallback otherwise), and the missing-Node.js preflight failure. Snapshot transcripts do not apply: the launcher performs no model-visible behavior.
