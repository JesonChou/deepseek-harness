# Agent Note: Electron directory picker worker

Status: implemented

English | [中文](2026-08-14-electron-directory-picker-worker.zh.md)

## Problem

The Windows native directory picker runs its `IFileOpenDialog` conversation in a child process spawned with `process.execPath`. Under Electron, that executable is the packaged app, so the child boots another app instance instead of Node and exits before reporting a result; the driver surfaces `win32 folder dialog worker exited before reporting a result`.

## Decision

`spawnDialogWorker` builds the child environment through `dialogWorkerEnvironment`, which adds `ELECTRON_RUN_AS_NODE=1` when the hosting process reports `process.versions.electron`. The child then runs the bundled `worker.cjs` as plain Node with its IPC channel, exactly like the dsh CLI.

## Alternatives considered

**Ship a standalone Node executable.** Rejected: it would duplicate the Electron runtime in the installer for one worker.

**Rewrite `process.execPath` for the spawn.** Rejected: it is process-global and would corrupt the main process's own module resolution.

**Fall back to the browse picker under Electron.** Rejected: the desktop shell should keep the native OS chooser, and the browse backend is the composition-level fallback, not a silent downgrade.

## Consequences

The native chooser works in the packaged Electron shell, and plain Node hosts keep their unchanged child environment. The Electron branch is exercised by the shipped app rather than unit tests; the helper's both outcomes stay covered.
