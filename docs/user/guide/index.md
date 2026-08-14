# Use the Web UI

English | [中文](index.zh.md)

Start the Web UI through the [root README](../../../README.md#run); the command prints its URL. This guide begins after that server is running. The `dsh` process uses its invoking directory as the default filesystem location, but a fresh Web UI has no selected workspace until you add one.

## Start from a desktop shortcut (Windows)

On Windows you can start the Web UI like a desktop application. From a PowerShell prompt in the repository, run the shortcut installer once:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\create-web-shortcut.ps1
```

Double-click the **DeepSeek Harness Web** shortcut on your desktop: the launcher runs `npx --yes @deepseek-ai/dsh web`, waits until the server is ready, and opens the printed address in your default browser. The server runs in a minimized console window; close that window, or run `scripts\stop-web.ps1`, to stop it.

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
