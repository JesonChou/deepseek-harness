# dsh-desktop

[English](README.md) | 中文

把 DeepSeek Harness Web UI 渲染为独立窗口的最小 Electron 壳：没有标签栏和地址栏，再次启动会聚焦已有窗口而非新开。Windows 桌面启动器（[`scripts/launch-web.ps1`](../../scripts/launch-web.ps1)）负责服务启动并优先使用本壳而非浏览器；本包只负责绘制窗口。

## 布局

- `src/main.ts` — Electron 主进程：单实例锁、`BrowserWindow` 与 `--smoke` 无头验证。
- `src/url.ts` — URL 解析（启动器环境变量、`--url=`、默认值）。
- `build/icon.png` — 窗口图标，由 [`scripts/render-launch-web-icon.py`](../../scripts/render-launch-web-icon.py) 生成。

## 使用

启动器在 `lib/main.js` 已构建且安装了 `electron` 时使用本壳；否则回退到 Edge/Chrome `--app` 模式。用仓库构建（`pnpm run build`）构建后，双击桌面快捷方式即可。无头验证：

```sh
node_modules/electron/dist/electron.exe . --smoke --url=http://127.0.0.1:3080
```

本壳不会启动服务器：请先运行 `dsh web`（或启动器）。
