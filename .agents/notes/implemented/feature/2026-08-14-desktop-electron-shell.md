# Agent Note: Desktop Electron shell

Status: implemented

English | [中文](2026-08-14-desktop-electron-shell.zh.md)

## Problem

`dsh` ships browser and headless surfaces. Users want an installable Windows desktop application with ordinary install, launch, and uninstall behavior. The GUI layering reserved the Electron shape ([web-server layering](../architecture/2026-07-19-gui-layering-and-rpc-protocol.md)) but no shell, transport bridge, or packaging existed.

## Decision

`apps/desktop` adds an Electron main process that boots the `dsh-base` + `dsh-web-app` composition in-process. The renderer loads `dsh://app/index.html` over a custom `dsh://` protocol that serves the built frontend dist and each client plugin bundle; the preload injects `window.__DSH_BOOT__` and replaces `fetch`/`WebSocket` with IPC bridges. Unary requests forward to the embedded loopback HTTP server (which retains the browser-trust fence and Remote interceptors), and the two downlink streams read `ctx.apiProxy.events` directly with the browser WebSocket envelope. The renderer therefore never binds HTTP; the embedded server stays on an ephemeral 127.0.0.1 port.

A standalone composition window (`dsh://composer`) exposes the live Loader tree and an editable user patch layer, and the main process watches that patch through the existing HMR recomposition path. The shell owns no product UI: every chat surface is the web bundle's client roster.

Packaging stages the workspace dependency closure into tarballs, installs a hoisted consumer outside the monorepo, and ships that `node_modules` through `extraResources`, because electron-builder's dependency collector cannot reconstruct pnpm's symlinked or hoisted layouts. The result is an assisted NSIS installer with desktop and start-menu shortcuts and a working uninstaller.

## Alternatives considered

**Wrap the local web server in a BrowserWindow.** Rejected: it keeps a loopback port as the only transport and duplicates a web page instead of the reserved `file://` + IPC shape.

**Reuse the connection plugin's composed fetch handler in-process.** Rejected: importing the client-connection host half from the desktop program crosses the Host/Client TypeScript aggregate boundary; the loopback hop reuses the identical dispatch without that edge.

**Let electron-builder collect pnpm node_modules.** Rejected after its collector pruned or emptied the layout on both the symlinked workspace and the hoisted stage; the pack-then-stage flow is deterministic.

**Rebuild native modules for Electron.** Rejected: `koffi` and `node-pty` ship N-API prebuilds, which are ABI-stable across the Node/Electron boundary.

## Consequences

The desktop app is an extra assembly over the shipped web bundle, not a fork: client plugin, settings, approval, sandbox, and session surfaces stay identical. The trade-off is a bespoke staging script and a larger installer (the full production closure travels uncompressed inside the NSIS archive). The IPC bridge deliberately keeps the internal HTTP hop instead of reimplementing Remote-endpoint dispatch; that hop is loopback-only and invisible to the renderer.
