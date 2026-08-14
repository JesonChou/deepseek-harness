# Agent Note: Project-local session roots

Status: implemented

English | [中文](2026-08-14-project-local-session-roots.zh.md)

## Problem

Session logs default to `$DSH_HOME/sessions`, which grows without bound on the system drive. Desktop users want each project to own its sessions, and a deleted workspace must keep its history discoverable.

## Decision

`@deepseek-ai/dsh-session-persistence-jsonl` gains an optional `projectRoots` config and a `setProjectRoots()` runtime mutator. Each project root owns the storage scope `<root>/.dsh/sessions`; a session routes to the longest matching root whose path prefixes its cwd, and everything else falls back to the configured `root`. Listing, identity checks, encoding checks, and materialization iterate every scope, and one session id stored under two scopes remains a collision. Removing a root hides its sessions without deleting them; the desktop sync therefore keeps roots strictly growing and persists the union in `$DSH_HOME/session-roots.json`, so workspace deletion preserves history.

The desktop main restates the persistence row with the persisted roots at boot, then syncs the live workspace registry every few seconds into the mutator. Polling is the desktop shell's reconciliation, not a persistence contract.

## Alternatives considered

**Mount one backend instance per project.** Rejected: `ctx.sessionPersistence` is a single service, and per-instance coordinators would each subscribe to the whole event stream.

**A new backend package reusing the coordinator.** Rejected: the JSONL storage hooks, Zstandard framing, Windows publication, and identity checks are private; extracting them would duplicate the durability surface.

**A new runtime root-feed seam.** Rejected for this pre-release surface: the mutator is one typed method on the existing backend, and the desktop shell already holds the live registry.

## Consequences

Existing single-root deployments keep byte-identical layout and behavior: `projectRoots` defaults to empty. Sessions inside a project now live beside the code they touched, and machine restarts recover them through the persisted root manifest. A session created before its root existed stores under the fallback root and does not migrate.
