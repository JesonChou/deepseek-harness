# @deepseek-ai/dsh-desktop

[English](README.md) | 中文

DeepSeek Harness 的 Windows 桌面外壳：Electron 主进程在进程内引导 `dsh-base` + `dsh-web-app` 组合，渲染层通过私有 `dsh://` 协议加载构建好的 Web UI，`fetch`/`WebSocket` 由 IPC 桥承载。内嵌 HTTP 服务器只绑定在临时的 127.0.0.1 端口上，渲染层和网络都接触不到它。

## 安装与运行

```sh
pnpm --filter @deepseek-ai/dsh-desktop build
pnpm --filter @deepseek-ai/dsh-desktop dev
```

NSIS 安装器分两步产出：

```sh
node scripts/stage.mjs --out <stage-dir> --store-dir <pnpm-store>
electron-builder --win nsis --publish never --config <stage-dir>/electron-builder.yml
```

`stage.mjs` 把 workspace 依赖闭包打成 tarball，在 monorepo 之外安装成一个 hoisted 消费者，再把该 `node_modules` 移出收集器的管辖范围（通过 `extraResources` 附带）。electron-builder 从仓库检出目录运行。

## 外壳负责的内容

- `dsh://app/...` 协议提供构建好的前端产物，`dsh://plugins/<id>/client.js` 提供客户端插件包，`dsh://composer/...` 提供组合窗口。
- preload 注入 `window.__DSH_BOOT__`，把 `fetch` 补丁成通过 IPC 转发 `/api/*`，并把 `WebSocket` 补丁成两条下行事件流。
- 组合窗口（菜单：工具 → 插件拼接）展示实时 Loader 树并编辑 `$DSH_HOME/cordis.patch.yml`；改动通过现有的配置重组监听器即时生效。
- 会话日志跟随项目：workspace 路径同步为持久化后端的项目根，会话因此存放在 `<project>/.dsh/sessions`。
- Harness home 默认为操作系统用户数据目录，可通过 `DSH_HOME` 环境变量或 `--dsh-home` 修改。

## 验证

`--smoke --smoke-out <png>` 启动真实的宿主和渲染层，等待 Web 壳内核和渲染根出现，驱动一次贯穿整条桥的 `workspace.list` RPC，并截图。安装后的应用用同样方式冒烟；`--smoke` 绕过单实例锁并使用私有的用户数据目录。

## 已知限制

- IPC 桥把一元请求经内嵌回环 HTTP 服务器转发，使 Remote 拦截器和浏览器信任栅栏保持共享；这一跳只存在于主进程内部。
- 用户补丁的即时重载需要 watch-only HMR 实例，其主模块探测读取 `process.argv[1]`；外壳用自身入口填充该槽位。
- Windows 会话沙箱继承该平台的部分强制限制；持久 PTY 表面不属于此组合。
- 安装器以未压缩形式携带完整生产闭包（`asar: false`、`extraResources`），因此比打包的 Web 部署更大。
