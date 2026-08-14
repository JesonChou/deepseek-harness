/**
 * Desktop-owned composition state: the persisted project-root set that keeps
 * session logs beside their projects, the live user patch layer, and the
 * Loader-tree snapshot the composition window renders. The project-root set
 * only grows: removing a root would hide its sessions from listing while a
 * deleted workspace must keep them (the workspace registry contract).
 * @module @deepseek-ai/dsh-desktop/composition
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

/** The workspace registry slice the root sync reads. */
export interface WorkspaceRegistryLike {
  /** Every registered workspace; `path` is the canonical project directory. */
  list(): Array<{ readonly path: string }>
}

/** The JSONL backend slice that accepts a replacement project-root set. */
export interface ProjectSessionPersistence {
  /** Replace the active project-local storage scopes. */
  setProjectRoots(projectRoots: readonly string[]): void
}

/** Filename of the desktop-owned project-root manifest under the Harness home. */
const SESSION_ROOTS_FILENAME = 'session-roots.json'

/** The user patch layer filename under the Harness home. */
const PATCH_FILENAME = 'cordis.patch.yml'

/** Absolute path of the persisted project-root manifest. */
export function sessionRootsPath(home: string): string {
  return join(home, SESSION_ROOTS_FILENAME)
}

/** Absolute path of the user patch layer. */
export function patchPath(home: string): string {
  return join(home, PATCH_FILENAME)
}

/**
 * Load the persisted project-root set. A missing or malformed file reads as
 * empty: the manifest is desktop-owned convenience state, never a source of
 * truth, and the workspace registry rebuilds it on the next sync.
 * @param home - the Harness home directory.
 * @returns the persisted project roots.
 */
export function loadSessionRoots(home: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(sessionRootsPath(home), 'utf8')) as { roots?: unknown }
    return Array.isArray(parsed.roots)
      ? parsed.roots.filter((root): root is string => typeof root === 'string')
      : []
  } catch {
    return []
  }
}

/**
 * Persist the union of the stored roots and the current workspace paths. The
 * set never shrinks: sessions of a deleted workspace stay discoverable.
 * @param home - the Harness home directory.
 * @param roots - the current workspace paths to fold into the set.
 */
export function saveSessionRoots(home: string, roots: readonly string[]): void {
  const next = [...new Set([...loadSessionRoots(home), ...roots])]
  mkdirSync(home, { recursive: true })
  const target = sessionRootsPath(home)
  const temp = `${target}.tmp`
  writeFileSync(temp, `${JSON.stringify({ version: 1, roots: next }, null, 2)}\n`)
  renameSync(temp, target)
}

/**
 * Fold the live workspace registry into the persistence backend and the
 * manifest. Returns false when either service is absent from the composition.
 * @param ctx - the booted root context.
 * @param home - the Harness home directory.
 * @returns whether both services existed and the sync ran.
 */
export function syncSessionRoots(ctx: Context, home: string): boolean {
  const registry = ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined
  const backend = ctx.get('sessionPersistence') as ProjectSessionPersistence | undefined
  if (registry === undefined || backend === undefined) return false
  const workspacePaths = registry.list().map(workspace => workspace.path)
  const union = [...new Set([...loadSessionRoots(home), ...workspacePaths])]
  backend.setProjectRoots(union)
  const previous = loadSessionRoots(home)
  const changed = union.length !== previous.length || union.some((root, index) => root !== previous[index])
  if (changed) saveSessionRoots(home, union)
  return true
}

/** One row of the live Loader tree the composition window renders. */
export interface LoaderEntryView {
  /** Loader entry id, when the row declares one. */
  readonly id: string | undefined
  /** Module specifier or package name. */
  readonly name: string | undefined
  /** Effective enablement. */
  readonly disabled?: boolean
  /** Effective configuration. */
  readonly config?: unknown
}

/** The Loader service slice the dump reads. */
interface LoaderLike {
  /** The current entry tree. */
  entries(): Iterable<{ readonly options: LoaderEntryView }>
}

/**
 * Snapshot the live Loader tree for the composition window. The view is
 * point-in-time by design; the window re-reads on request.
 * @param ctx - the booted root context.
 * @returns one view per Loader entry, in Loader order.
 */
export function dumpComposition(ctx: Context): LoaderEntryView[] {
  const loader = ctx.get('loader') as LoaderLike | undefined
  if (loader === undefined) return []
  return [...loader.entries()].map(entry => ({
    id: entry.options.id,
    name: entry.options.name,
    disabled: entry.options.disabled ?? false,
    config: entry.options.config,
  }))
}

/**
 * Read the user patch layer, materializing the canonical empty list when the
 * file does not exist.
 * @param home - the Harness home directory.
 * @returns the patch file text.
 */
export function readPatch(home: string): string {
  const path = patchPath(home)
  if (!existsSync(path)) return '[]\n'
  return readFileSync(path, 'utf8')
}

/**
 * Persist the user patch layer. The booted watcher recomposes the tree from
 * the new text; this write owns only the file bytes.
 * @param home - the Harness home directory.
 * @param text - the complete replacement patch text.
 */
export function writePatch(home: string, text: string): void {
  mkdirSync(home, { recursive: true })
  writeFileSync(patchPath(home), text)
}
