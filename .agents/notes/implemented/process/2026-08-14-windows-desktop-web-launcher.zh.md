# Agent Note: Web UI 的 Windows 桌面启动器

Status: implemented

[English](2026-08-14-windows-desktop-web-launcher.md) | 中文

## 问题

在 Windows 上启动 Web UI 需要三步手动操作：打开 PowerShell 提示符、运行 `npx @deepseek-ai/dsh web`、再把浏览器指向命令打印的地址。像桌面应用一样使用 Web UI 的人希望有一个双击入口一次完成这三步。

## 决策

仓库在 `scripts/` 下提供四个纯 Windows 脚本，不新增运行时依赖：

- `launch-web.ps1` 是启动器。端口已接受连接时它只打开浏览器，因此再次双击会重新打开 UI。否则它在最小化的控制台窗口中启动发布包（`npx --yes @deepseek-ai/dsh web --port <port>`），轮询端口最长 120 秒，然后在 `http://127.0.0.1:<port>` 打开浏览器。`-NoBrowser`、`-NonInteractive` 和 `-DryRun` 服务于自动化与测试。
- `launch-web.vbs` 无控制台窗口地运行启动器；它是快捷方式的目标，因此双击不会闪现窗口。
- `stop-web.ps1` 在确认命令行包含 `dsh` 后停止监听该端口的 node 进程；它拒绝其他端口占用者。关闭最小化的控制台窗口同样能停止服务器。
- `create-web-shortcut.ps1` 写入桌面快捷方式，目标为 `wscript.exe`（参数为 vbs），图标为 `scripts/launch-web.ico`。

启动器包装发布包流程而非源码检出：它与 README 的 npm 路径一致，且不需要仓库构建。脚本面向每台受支持 Windows 都自带的 Windows PowerShell 5.1；除 `-NonInteractive` 模式外，失败以弹窗显示。

## 考虑过的替代方案

**用 Electron 或其他桌面壳包住 Web UI。** 被否：浏览器本身就是 UI，外壳只增加依赖和第二个窗口，没有新行为。

**启动源码检出（`pnpm dsh web`，先构建）。** 被否：任何缺少已构建前端产物的检出都无法启动，而 README 和已安装的 Web UI 使用的都是发布包路径。

**用 pid 文件跟踪启动的进程。** 被否：控制台进程链（`cmd` → `npx` → `node`）使记录的 pid 转瞬即逝，按监听状态和命令行发现端口占用者对手动启动的服务器同样有效。

**要求 PowerShell 7。** 被否：Windows 自带 5.1，目标机器没有安装 pwsh。

## 后果

脚本仅限 Windows；spec 在其他平台上跳过。`stop-web.ps1` 会停止任何占用该端口的 node `dsh` 进程，包括手动启动的服务器。升级沿用 npx 的包解析。图标由 `apps/web/public/favicon.svg` 生成并作为静态资产提交。

## 测试

`scripts/launch-web.spec.ts` 仅在 Windows 上运行，覆盖已监听分支、试运行和缺少 Node.js 的前置检查失败。快照转录不适用：启动器不产生模型可见的行为。
