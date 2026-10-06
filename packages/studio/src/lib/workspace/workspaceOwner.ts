/**
 * Workspace OWNERSHIP guard: the identity half of workspace containment.
 *
 * Containment alone (workspaceFs.ts, git/_shared.ts) only proves a path is
 * somewhere under the shared workspaces root. Every signed-in Studio user
 * shares that root, so containment by itself let any account list, read,
 * write, move and delete files in another account's clone (P0, 2026-10-05).
 *
 * Ownership is decided from the durable workspace registry,
 * `<workspaces>/.absorb-projects.json`, which POST /api/workspace/import
 * writes with `ownerId: session.user.id` when it clones. Rules:
 *
 *   1. Both the workspaces root and the requested path are REALPATHED, and
 *      the target must sit strictly inside the real root (separator-safe; the
 *      root itself is nobody's workspace). A symlink cannot carry a path out
 *      of the root or across into another workspace's directory.
 *   2. The workspace is the FIRST path segment under the root (the
 *      `ws-<uuid>` directory import creates). The registry row whose `id` is
 *      exactly that directory name is authoritative. Rows are never matched
 *      by a localPath prefix string, so registering a row that merely points
 *      at someone else's directory claims nothing.
 *   3. That row must record a localPath inside the same workspace directory,
 *      and its `ownerId` must equal the caller's user id. A missing row, a
 *      row with no owner (legacy), or another owner is refused.
 *   4. Every refusal returns the SAME status and message, so a caller can't
 *      tell "exists but not yours" apart from "does not exist".
 *
 * There is deliberately no founder bypass: the founder owns his own rows.
 */

import * as fs from 'fs';
import * as path from 'path';

import { findDurableAbsorbProject, type DurableAbsorbProject } from '../absorb/projectState';
import { getWorkspacesRoot } from './workspaceFs';

/** Anything carrying the caller's user id: a NextAuth session or a requireAuth* result. */
export interface WorkspaceOwnerIdentity {
  user?: { id?: string | null } | null;
}

export const WORKSPACE_NOT_ACCESSIBLE_ERROR = 'Workspace not found or not accessible';
export const WORKSPACE_NOT_ACCESSIBLE_STATUS = 404;

export type WorkspaceOwnerRefusal = { ok: false; error: string; status: number };

export type WorkspaceOwnerResult =
  | {
      ok: true;
      /** Realpath of the requested path (inside the caller's workspace). */
      resolved: string;
      /** Realpath of the workspace directory (`<realRoot>/<workspaceId>`). */
      workspaceDir: string;
      workspaceId: string;
      project: DurableAbsorbProject;
    }
  | WorkspaceOwnerRefusal;

function refuse(): WorkspaceOwnerRefusal {
  return {
    ok: false,
    error: WORKSPACE_NOT_ACCESSIBLE_ERROR,
    status: WORKSPACE_NOT_ACCESSIBLE_STATUS,
  };
}

function realpathOrNull(target: string): string | null {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

/** True when `child` is `parent` itself or below it, compared by path segments. */
function isAtOrInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  if (rel === '') return true;
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/** True when `child` is strictly below `parent` (never `parent` itself). */
function isStrictlyInside(parent: string, child: string): boolean {
  return path.relative(parent, child) !== '' && isAtOrInside(parent, child);
}

/** First path segment of `target` under `root`, or null when not strictly inside. */
function firstSegmentUnder(root: string, target: string): string | null {
  if (!isStrictlyInside(root, target)) return null;
  return path.relative(root, target).split(path.sep)[0] || null;
}

export function callerUserId(identity: WorkspaceOwnerIdentity | null | undefined): string | null {
  const id = identity?.user?.id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/**
 * Does the row's recorded localPath live in workspace directory `workspaceId`?
 * Checked against both the real root and the configured (possibly symlinked)
 * root, so a row written before a root symlink still matches its own dir.
 */
function rowLivesInWorkspace(
  project: DurableAbsorbProject,
  workspaceId: string,
  realRoot: string,
  configuredRoot: string
): boolean {
  if (!project.localPath) return false;
  const lexical = path.resolve(project.localPath);
  const real = realpathOrNull(lexical);
  const candidates = [real, lexical].filter((value): value is string => Boolean(value));
  return candidates.some(
    (candidate) =>
      firstSegmentUnder(realRoot, candidate) === workspaceId ||
      firstSegmentUnder(configuredRoot, candidate) === workspaceId
  );
}

/**
 * Refuse unless `fsPath` lies inside a workspace whose registry row is owned by
 * the caller. See the module comment for the exact rules.
 */
export function assertWorkspaceOwner(
  session: WorkspaceOwnerIdentity | null | undefined,
  fsPath: unknown
): WorkspaceOwnerResult {
  const callerId = callerUserId(session);
  if (!callerId) return refuse();
  if (typeof fsPath !== 'string' || !fsPath.trim() || fsPath.includes('\0')) return refuse();

  const configuredRoot = getWorkspacesRoot();
  const realRoot = realpathOrNull(configuredRoot);
  if (!realRoot) return refuse();

  const realTarget = realpathOrNull(path.resolve(fsPath.trim()));
  if (!realTarget) return refuse();

  const workspaceId = firstSegmentUnder(realRoot, realTarget);
  // Dot-entries at the root (the registry file itself, caches) are nobody's.
  if (!workspaceId || workspaceId.startsWith('.')) return refuse();

  const project = findDurableAbsorbProject({ projectId: workspaceId });
  if (!project || project.id !== workspaceId) return refuse();
  if (!project.ownerId || project.ownerId !== callerId) return refuse();
  if (!rowLivesInWorkspace(project, workspaceId, realRoot, configuredRoot)) return refuse();

  return {
    ok: true,
    resolved: realTarget,
    workspaceDir: path.join(realRoot, workspaceId),
    workspaceId,
    project,
  };
}

export type OwnedWorkspaceFsResolution = { ok: true; resolved: string } | WorkspaceOwnerRefusal;

/**
 * Replacement for the old containment-only `resolveWorkspaceFsRoot`: the path
 * must be inside the workspaces root, inside a workspace the caller OWNS, and a
 * directory. Used by /api/workspace/files, /api/workspace/build and the
 * Brittney route's workspacePath.
 */
export function resolveOwnedWorkspaceFsRoot(
  workspacePath: string,
  session: WorkspaceOwnerIdentity | null | undefined
): OwnedWorkspaceFsResolution {
  const root = getWorkspacesRoot();
  // Lexical containment first: a path-shape answer that touches no files.
  if (!isAtOrInside(root, path.resolve(workspacePath))) {
    return {
      ok: false,
      error: 'workspacePath must be inside ~/.holoscript/workspaces',
      status: 403,
    };
  }
  const owned = assertWorkspaceOwner(session, workspacePath);
  if (!owned.ok) return owned;
  let isDirectory = false;
  try {
    isDirectory = fs.statSync(owned.resolved).isDirectory();
  } catch {
    return refuse();
  }
  if (!isDirectory) {
    return { ok: false, error: 'workspacePath is not a directory', status: 400 };
  }
  return { ok: true, resolved: owned.resolved };
}

/**
 * The Brittney route's client-supplied workspacePath, resolved for the
 * authenticated caller. `auth` is the result of `requireAuthOrApiKey`, so for
 * an API-key caller `auth.user.id` is the key's OWNING user (looked up from
 * user_api_keys → users) and the same ownership rule applies. Returns null
 * (workspace tools stay in their fail-soft "no active workspace" mode) for an
 * absent, invalid or not-owned path.
 */
export function resolveCallerWorkspacePath(
  auth: WorkspaceOwnerIdentity | null | undefined,
  workspacePath: unknown
): string | null {
  if (typeof workspacePath !== 'string' || !workspacePath.trim()) return null;
  const resolved = resolveOwnedWorkspaceFsRoot(workspacePath.trim(), auth);
  return resolved.ok ? resolved.resolved : null;
}
