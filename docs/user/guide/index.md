# Use the Web UI

English | [中文](index.zh.md)

Start the Web UI through the [root README](../../../README.md#run); the command prints its URL. This guide begins after that server is running. The `dsh` process uses its invoking directory as the default filesystem location, but a fresh Web UI has no selected workspace until you add one.

## Start from a desktop shortcut (Windows)

On Windows you can start the Web UI like a desktop application. From a PowerShell prompt in the repository, run the shortcut installer once:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\create-web-shortcut.ps1
```

Double-click the **DeepSeek Harness Web** shortcut on your desktop: the launcher starts the checkout's built CLI (`node apps\cli\lib\bin.js web`; it falls back to `npx --yes @deepseek-ai/dsh web` when the CLI is not built) in a hidden window, waits until the server is ready, and opens the Web UI in a standalone Electron window (Edge/Chrome `--app` mode when the shell is not built) with no tabs or address bar. A second double-click focuses the existing window. The Electron window keeps its own browser state: configure the model API key inside it the first time. Run `scripts\stop-web.ps1` to stop the server.

## Configure a model

Open **Settings → Models**, enter a DeepSeek API key, and save it. The model route becomes usable immediately without restarting the server.

The [model configuration guide](./providers.md) covers other providers and custom OpenAI-compatible endpoints.

## Choose a workspace

Click **Choose workspace**, add the project directory where you started `dsh`, and select it. The session composer remains unavailable until a workspace is selected.

## Run a task

Start a session and send:

> Summarize this repository and identify its main packages.

The agent can read and edit workspace files, run commands, delegate work, and maintain a plan. The Web UI asks before operations that require approval under the active permission policy.

## Continue

- [Configure models](./providers.md)
- [Use the Python SDK](./python-sdk.md)
- [Use other CLI modes](../../../apps/cli/README.md)
- [Develop a plugin](../develop/basic/)
