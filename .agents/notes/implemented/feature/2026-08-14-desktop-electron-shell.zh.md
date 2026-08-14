# Agent Note: Desktop Electron shell

Status: implemented

[English](2026-08-14-desktop-electron-shell.md) | 中文

## Problem

`dsh` 目前只提供浏览器和 headless 两种形态。用户需要一款可安装的 Windows 桌面应用，具备常规的安装、启动和卸载体验。GUI 分层早已为 Electron 预留了形态（[web-server 分层](../../architecture/2026-07-19-gui-layering-and-rpc-protocol.md)），但当时还没有外壳、传输桥和打包方案。

## Decision

`apps/desktop` 新增一个 Electron 主进程，在进程内直接引导 `dsh-base` + `dsh-web-app` 组合。渲染层通过自定义 `dsh://` 协议加载 `dsh://app/index.html`，该协议同时提供构建好的前端产物和各个客户端插件包；preload 注入 `window.__DSH_BOOT__`，并把 `fetch`/`WebSocket` 替换为 IPC 桥。一元请求转发到内嵌的回环 HTTP 服务器（保留浏览器信任栅栏和 Remote 拦截器），两条下行流则直接读取 `ctx.apiProxy.events` 并使用与浏览器 WebSocket 一致的封装。因此渲染层完全不接触 HTTP，内嵌服务器只绑定在临时的 127.0.0.1 端口上。

一个独立的组合窗口（`dsh://composer`）展示实时 Loader 树和可编辑的用户补丁层，主进程通过现有的 HMR 重组路径监听该补丁。外壳不拥有任何产品 UI：所有聊天界面都来自 web bundle 的客户端清单。

打包时先把 workspace 依赖闭包打成 tarball，在 monorepo 之外安装成一个 hoisted 消费者，再通过 `extraResources` 附带该 `node_modules`，因为 electron-builder 的依赖收集器无法还原 pnpm 的软链接或 hoisted 布局。最终产物是带桌面快捷方式、开始菜单快捷方式和可用卸载器的 NSIS 辅助安装器。

## Alternatives considered

**用 BrowserWindow 包裹本地 Web 服务器。** 拒绝：它只保留回环端口这一种传输，且只是复制网页，而不是预留的 `file://` + IPC 形态。

**在进程内复用 connection 插件的组合 fetch handler。** 拒绝：从 desktop 程序导入 client-connection 的宿主一半会跨越 Host/Client 两个 TypeScript 聚合边界；回环转发复用同一套派发且没有这条边。

**让 electron-builder 收集 pnpm 的 node_modules。** 在它先后清空或裁掉软链接 workspace 与 hoisted stage 两种布局后拒绝；打包后再 staging 的流程是确定性的。

**为 Electron 重编译原生模块。** 拒绝：`koffi` 和 `node-pty` 都提供 N-API 预编译产物，跨 Node/Electron 边界 ABI 稳定。

## Consequences

桌面应用是现有 web bundle 之上的额外组装，而不是 fork：客户端插件、设置、审批、沙箱和会话界面保持一致。代价是一套专门的 staging 脚本和更大的安装包（完整生产闭包以未压缩形式随 NSIS 归档分发）。IPC 桥有意保留内部 HTTP 一跳，而不是重新实现 Remote 端点派发；这一跳仅限回环，渲染层不可见。
