# 使用 Web UI

[English](index.md) | 中文

先按照[根 README](../../../README.md#run)启动 Web UI；命令会打印其访问地址。本指南从服务器已经运行的状态开始。`dsh` 进程会把调用目录作为默认文件系统位置，但新的 Web UI 在添加工作区前不会选中任何工作区。

## 从桌面快捷方式启动（Windows）

在 Windows 上可以像桌面应用一样启动 Web UI。先在仓库目录的 PowerShell 中运行一次快捷方式安装脚本：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\create-web-shortcut.ps1
```

双击桌面上的 **DeepSeek Harness Web** 快捷方式：启动器会在隐藏窗口中运行本仓库已构建的 CLI（`node apps\cli\lib\bin.js web`；CLI 未构建时回退到 `npx --yes @deepseek-ai/dsh web`），等服务就绪后把 Web UI 打开为独立的 Electron 窗口（壳未构建时回退到 Edge/Chrome `--app` 模式），没有标签栏和地址栏。再次双击会聚焦已有窗口。Electron 窗口拥有独立的浏览器状态：首次使用时在窗口内配置模型 API 密钥。运行 `scripts\stop-web.ps1` 即可停止服务器。

## 配置模型

打开**设置 → 模型**，输入 DeepSeek API 密钥并保存。模型路由会立即可用，不需要重启服务器。

[模型配置指南](./providers.md)介绍其他提供方和自定义 OpenAI 兼容端点。

## 选择工作区

点击**选择工作区**，添加启动 `dsh` 时所在的项目目录，然后选中它。选中工作区前，会话输入框不可用。

## 运行任务

启动一个会话并发送：

> Summarize this repository and identify its main packages.

agent 可以读取和编辑工作区文件、运行命令、委派工作并维护计划。当操作在当前权限策略下需要审批时，Web UI 会先询问你。

## 继续使用

- [配置模型](./providers.md)
- [使用 Python SDK](./python-sdk.md)
- [使用其他 CLI 模式](../../../apps/cli/README.md)
- [开发插件](../develop/basic/)
