# Agent Note: 桌面启动器优先使用已构建的本地 CLI，而非 npx

Status: implemented

[English](2026-08-14-windows-desktop-launcher-local-cli.md) | 中文

## 问题

[web-launcher Agent Note](../../process/2026-08-14-windows-desktop-web-launcher.md) 交付的 Windows 桌面启动器在仓库根目录用 `npx --yes @deepseek-ai/dsh web --port <port>` 启动 Web UI。在 Windows + npm 11 下，这条命令在端口打开前就失败：npm 的 npx 通过 Arborist 读取工作目录的依赖树，把 `apps/cli` workspace 成员（发布名为 `@deepseek-ai/dsh`）误判为该包已安装，跳过向 npx 缓存安装，然后 spawn `dsh`。而 PATH 上没有 `dsh` shim（pnpm 不会把 workspace 成员的 bin 链接到根 `.bin`），于是 cmd 以 `'dsh' is not recognized` 退出，启动器报 "the server exited before the port opened"。

## 决策

`launch-web.ps1` 按两级解析启动命令：

1. 检出目录已有构建好的 CLI（`apps\cli\lib\bin.js` 存在）时，从仓库根运行 `node "<repo>\apps\cli\lib\bin.js" web --port <port>`。这条路径不需要网络、registry 或 npx。
2. 否则回退到 `npx --yes @deepseek-ai/dsh web --port <port>`，且从用户主目录运行——绝不在仓库目录运行，因为从仓库运行正是触发上述 Arborist 误判的条件。

`stop-web.ps1` 把端口占用者的匹配从 `dsh` 放宽为 `dsh|bin\.js`，从而能停止任一级启动的服务器。启动器中的 npx 存在性预检只在回退级执行；任何一级都要求 PATH 上有 `node`。

原 note 继续拥有四脚本桌面入口的决策及其各项否决；本 note 只取代其中"启动已发布包"这一事实。

## 考虑过的替代方案

**让 npx 原地可用**（如 `npx -c "dsh web"`、`npm exec --`、换目录运行 npx）。被否：这些走的是同一条 libnpmexec 流程，失败取决于环境（npm 版本与工作目录树），而检出目录里已构建的 CLI 更快且可离线。

**全局安装 `@deepseek-ai/dsh` 并调用全局 `dsh`。** 被否：在仓库外引入持久机器状态、一次性网络下载和第二条升级路径，而快捷方式指向的仓库本身就包含 CLI。

**回退到 `pnpm dsh web`（源码启动）。** 被否：要求目标机器上有 pnpm 且满足 tsx 源码启动契约，而未构建产物的检出会像原 note 预料的那样失败。

## 后果

启动器现在跟随检出的构建状态：服务的版本是 `apps/cli/lib` 里构建的那个，而不是 registry 上的最新版本；`pnpm build` 即升级。没有构建产物的干净检出保留 npx 回退，该回退依赖网络。隐藏的控制台窗口、端口轮询、弹窗报错以及 `-DryRun`/`-NonInteractive` 测试面不变。试运行 spec 断言运行它的主机上适用的那一级。

## 测试

`scripts/launch-web.spec.ts`（仅 Windows）根据测试主机上 `apps/cli/lib/bin.js` 是否存在，断言两级试运行命令；已监听与缺少 Node.js 两个用例不变。端到端路径——`launch-web.ps1 -NoBrowser -NonInteractive` 启动、轮询 `http://127.0.0.1:<port>`、重跑验证已监听分支、`stop-web.ps1` 停止——已在 Windows 上用本地 CLI 一级手动验证。
