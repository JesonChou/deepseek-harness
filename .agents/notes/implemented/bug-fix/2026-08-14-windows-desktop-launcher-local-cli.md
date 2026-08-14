# Agent Note: desktop launcher prefers the built local CLI over npx

Status: implemented

English | [中文](2026-08-14-windows-desktop-launcher-local-cli.zh.md)

## Problem

The Windows desktop launcher shipped by the [web-launcher Agent Note](../../process/2026-08-14-windows-desktop-web-launcher.md) starts the Web UI with `npx --yes @deepseek-ai/dsh web --port <port>` run from the repository root. On Windows with npm 11 this command fails before the port opens: npm's npx reads the working-directory tree through Arborist, mistakes the `apps/cli` workspace member (published as `@deepseek-ai/dsh`) for an installed copy of that package, skips installing the package into the npx cache, and then spawns `dsh`. No `dsh` shim is on PATH (pnpm does not link workspace-member bins into the root `.bin`), so cmd exits with `'dsh' is not recognized`, and the launcher reports "the server exited before the port opened".

## Decision

`launch-web.ps1` resolves its start command in two tiers:

1. When the checkout has the built CLI (`apps\cli\lib\bin.js` exists), it runs `node "<repo>\apps\cli\lib\bin.js" web --port <port>` from the repository root. This path needs no network, no registry, and no npx.
2. Otherwise it falls back to `npx --yes @deepseek-ai/dsh web --port <port>` run from the user profile directory — never from the repository, because running from the repository is exactly what triggers the Arborist misread described above.

`stop-web.ps1` widens its port-owner match from `dsh` to `dsh|bin\.js` so it stops servers started by either tier. The npx existence preflight in the launcher now runs only on the fallback tier; every tier still requires `node` on PATH.

The original note keeps its ownership of the four-script desktop entry and its rejections; this note supersedes only its "starts the published package" fact.

## Alternatives considered

**Making npx work in place** (e.g. `npx -c "dsh web"`, `npm exec --`, running npx from another directory). Rejected: all of these go through the same libnpmexec flow, the failure is environmental (npm version and working-directory tree), and the checkout's built CLI is faster and offline-capable.

**Installing `@deepseek-ai/dsh` globally and calling the global `dsh`.** Rejected: it adds persistent machine state outside the repository, a one-time network download, and a second upgrade path, while the repository the shortcut already points at contains the CLI.

**Falling back to `pnpm dsh web` (source launch).** Rejected: it requires pnpm and the tsx source-launch contract on the target machine, and a checkout without built artifacts would fail the same way the original note predicted.

## Consequences

The launcher now tracks the checkout's build state: the version served is the one built in `apps/cli/lib`, not the latest registry release; `pnpm build` upgrades it. A clean checkout without built artifacts keeps the npx fallback, which is network-dependent. The hidden console window, port polling, popup errors, and the `-DryRun`/`-NonInteractive` test surface are unchanged. The dry-run spec asserts whichever tier applies on the host that runs it.

## Testing

`scripts/launch-web.spec.ts` (Windows-only) asserts the dry-run start command for both tiers, driven by whether `apps/cli/lib/bin.js` exists on the test host; the already-listening and missing-Node.js cases are unchanged. The end-to-end path — launch via `launch-web.ps1 -NoBrowser -NonInteractive`, poll `http://127.0.0.1:<port>`, re-run for the already-listening branch, and stop via `stop-web.ps1` — was exercised manually on Windows with the built CLI tier.
