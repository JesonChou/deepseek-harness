# @deepseek-ai/dsh-desktop

English | [中文](README.zh.md)

Windows desktop shell for DeepSeek Harness: the Electron main process boots the `dsh-base` + `dsh-web-app` composition in-process, and the renderer loads the built web UI over the private `dsh://` protocol with `fetch`/`WebSocket` carried by an IPC bridge. The embedded HTTP server stays bound to an ephemeral 127.0.0.1 port and is never reachable from the renderer or the network.

## Install and run

```sh
pnpm --filter @deepseek-ai/dsh-desktop build
pnpm --filter @deepseek-ai/dsh-desktop dev
```

The NSIS installer is produced in two steps:

```sh
node scripts/stage.mjs --out <stage-dir> --store-dir <pnpm-store>
electron-builder --win nsis --publish never --config <stage-dir>/electron-builder.yml
```

`stage.mjs` packs the workspace dependency closure into tarballs, installs a hoisted consumer outside the monorepo, and moves that `node_modules` out of the collector's reach (shipped via `extraResources`). electron-builder runs from the repository checkout.

## What the shell owns

- The `dsh://app/...` protocol serves the built frontend dist, `dsh://plugins/<id>/client.js` serves client plugin bundles, and `dsh://composer/...` serves the composition window.
- The preload injects `window.__DSH_BOOT__`, patches `fetch` to forward `/api/*` over IPC, and patches `WebSocket` for the two downlink event streams.
- The composition window (menu: 工具 → 插件拼接) shows the live Loader tree and edits `$DSH_HOME/cordis.patch.yml`; the change applies live through the existing config-recomposition watcher.
- Session logs follow their projects: workspace paths sync into the persistence backend as project roots, so sessions store under `<project>/.dsh/sessions`.
- The Harness home defaults to the OS user-data directory and can be moved with the `DSH_HOME` environment variable or `--dsh-home`.

## Verification

`--smoke --smoke-out <png>` boots the real host and renderer, waits for the web shell kernel and a rendered root, drives one `workspace.list` RPC through the full bridge, and captures a screenshot. The installed app is smoke-tested the same way; `--smoke` bypasses the single-instance lock and uses a private user-data directory.

## Known limitations

- The IPC bridge forwards unary requests through the embedded loopback HTTP server so Remote interceptors and the browser-trust fence stay shared; that hop is internal to the main process.
- Live user-patch reload requires the watch-only HMR instance, whose main-module detection reads `process.argv[1]`; the shell fills that slot with its own entry.
- Windows session sandboxing inherits the platform's partial-enforcement limits; the persistent PTY surface is not part of this composition.
- The installer carries the full production closure uncompressed (`asar: false`, `extraResources`), so it is larger than a bundled web deployment.
