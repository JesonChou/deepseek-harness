# Agent Note: Web UI 的最小 Electron 壳

Status: implemented

[English](2026-08-15-desktop-electron-shell.md) | 中文

## 问题

[web-launcher Agent Note](../../process/2026-08-14-windows-desktop-web-launcher.md) 交付的桌面入口在 UI 一步打开的是浏览器 `--app` 窗口。该窗口仍属于浏览器：任务栏图标是浏览器的、会话与日常浏览混在一起、浏览器升级可能改变窗口外观。桌面应用体验需要 UI 运行在自己的壳进程里。

## 决策

`apps/desktop` 是一个最小 Electron 壳：单个主进程文件，把 Web UI 渲染在独立的 `BrowserWindow` 中（无标签栏、无地址栏），不做其他事。启动器继续负责服务启动与端口轮询；壳只负责画窗口。具体：

- **单实例 + 聚焦。** `app.requestSingleInstanceLock()` 加 `second-instance` 处理器恢复并聚焦已有窗口，因此再次双击会重新打开 UI 而不是叠加窗口。
- **独立 userData。** 未打包的 Electron 应用默认使用 `%APPDATA%\Electron`，会与机器上其他 Electron 应用（如 Reasonix）共享状态和单实例锁。壳在取锁前把 `userData` 设为 `%APPDATA%\DeepSeekHarnessWeb`。
- **动态 electron import。** Electron 38 的 ESM 主进程 loader 下，顶层静态 `import 'electron'` 表现不稳定（进程在运行任何代码前间歇性退出）；整个主体运行在 `import('electron').then(...)` 内，加载可靠。`import type` 声明保持静态，编译期被擦除。
- **`--smoke` 无头验证。** 带 `--smoke` 时壳把进度写入 `apps/desktop/tmp/desktop-smoke.log`（已 gitignore；GUI 子系统丢弃 stdout），`loadURL` 成功后退出 0，失败退出 1。启动器不会传 `--smoke`。
- **启动器分级。** `apps/desktop/lib/main.js` 与 electron 二进制都存在时，`launch-web.ps1` 用壳打开 UI，其次 Edge `--app`，再次 Chrome `--app`，最后默认浏览器。URL 经 `DSH_WEB_URL` 环境变量传递。
- **构建。** 与 `apps/cli` 同模式：`tsc -b` 产出 `lib/types`，包内 tsdown 配置把 `lib/types/main.js` 打包为 `lib/main.js`，`electron` 标记 external。`pnpm-workspace.yaml` 的 `allowBuilds` 列入 `electron: true` 以允许其 postinstall（下载运行时二进制）。

## 考虑过的替代方案

**复用 desktop-app 分支的完整桌面应用**（组合窗口、补丁层、打包）。被否：那个装配面向不同的产品面；本 note 的壳刻意只做一个窗口一个文件。

**继续使用浏览器 `--app` 模式。** 被否：窗口仍属于浏览器（任务栏图标、会话、升级行为），正是本次变更要移除的。

**现在就打包 electron-builder。** 被否（本次迭代）：未打包的壳已交付窗口体验；打包的 exe（自有任务栏图标、安装器）是后续工作而非前提。

## 后果

Electron 窗口在 `%APPDATA%\DeepSeekHarnessWeb` 下拥有独立浏览器状态：在浏览器里配置过模型 API 密钥的用户需要在 Electron 窗口内重新配置一次。任务栏图标在打包前是 Electron 默认图标。`pnpm install` 现在会一次性下载 Electron 运行时二进制（约 100 MB）。smoke 日志目录 `apps/desktop/tmp/` 已 gitignore。[web-launcher note](../../process/2026-08-14-windows-desktop-web-launcher.md) 继续拥有桌面入口决策；本 note 取代其中"浏览器 --app 窗口"这一事实。

## 测试

`apps/desktop/tests/url.spec.ts` 对 URL 解析（环境变量、`--url=`、默认值）做单元测试。完整链路——已构建的壳 + `electron ... --smoke` 对运行中的 Web UI——已在 Windows 上验证，日志记录 module load、ready、dom-ready、did-finish-load 并以 0 退出。`scripts/launch-web.spec.ts` 继续覆盖启动器分支；二次启动的聚焦路径已通过再次启动并观察仅一个带标题窗口来手动验证。
