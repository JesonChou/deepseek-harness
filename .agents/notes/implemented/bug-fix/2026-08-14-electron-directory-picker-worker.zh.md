# Agent Note: Electron directory picker worker

Status: implemented

[English](2026-08-14-electron-directory-picker-worker.md) | 中文

## Problem

Windows 原生目录选择器用 `process.execPath` 派生子进程来承载 `IFileOpenDialog` 会话。在 Electron 下，这个可执行文件是打包后的应用，因此子进程会再启动一个应用实例而不是 Node，并在返回结果前退出；驱动层报出 `win32 folder dialog worker exited before reporting a result`。

## Decision

`spawnDialogWorker` 通过 `dialogWorkerEnvironment` 构建子进程环境：当宿主进程存在 `process.versions.electron` 时加入 `ELECTRON_RUN_AS_NODE=1`。子进程随后像 dsh CLI 一样，以纯 Node 方式运行打包好的 `worker.cjs` 并保留 IPC 通道。

## Alternatives considered

**随包附带独立的 Node 可执行文件。** 拒绝：为单个 worker 复制一份 Electron 运行时会让安装包翻倍。

**为 spawn 改写 `process.execPath`。** 拒绝：它是进程全局的，会破坏主进程自身的模块解析。

**在 Electron 下回退到浏览式选择器。** 拒绝：桌面外壳应保留原生系统选择器，且浏览式后端是组合层的回退，而不是静默降级。

## Consequences

原生选择器在打包后的 Electron 外壳中可用，纯 Node 宿主的子进程环境保持不变。Electron 分支由发布的应用实际执行，而辅助函数的两种结果均由单元测试覆盖。
