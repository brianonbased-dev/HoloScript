/**
 * Workspace filesystem guards — shared by /api/workspace/files,
 * /api/workspace/build, and the Brittney route's workspacePath injection.
 *
 * Trust model mirrors /api/git/_shared: every operation is confined to
 * workspace clones under ~/.holoscript/workspaces (HOLOSCRIPT_WORKSPACES_DIR).
 * Unlike the git resolver, a `.git` directory is NOT required — scaffolded
 * (not-yet-committed) workspaces are valid file-op targets too.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function getWorkspacesRoot(): string {
  return path.resolve(
    process.env.HOLOSCRIPT_WORKSPACES_DIR ??
      path.join(
        process.env.HOME ?? process.env.USERPROFILE ?? os.homedir(),
        '.holoscript',
        'workspaces'
      )
  );
}

export function isInsidePath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export type WorkspaceFsResolution =
  | { ok: true; resolved: string }
  | { ok: false; error: string; status: number };

/**
 * Validate an absolute workspace path: must resolve inside the workspaces
 * root and exist as a directory.
 */
export function resolveWorkspaceFsRoot(workspacePath: string): WorkspaceFsResolution {
  const root = getWorkspacesRoot();
  const resolved = path.resolve(workspacePath);
  if (!isInsidePath(root, resolved)) {
    return {
      ok: false,
      error: 'workspacePath must be inside ~/.holoscript/workspaces',
      status: 403,
    };
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { ok: false, error: 'workspacePath does not exist', status: 400 };
  }
  return { ok: true, resolved };
}

export type RelativePathValidation = { ok: true; relative: string } | { ok: false; error: string };

/**
 * Validate a workspace-relative path from a tool call or request body.
 * Rejects traversal, absolute paths, flag-like values, null bytes, and
 * anything under `.git/` (repo metadata is mutated only via the git APIs,
 * and reading it could leak credential-bearing remote URLs).
 */
export function validateWorkspaceRelativePath(
  value: unknown,
  opts: { allowEmpty?: boolean } = {}
): RelativePathValidation {
  if (typeof value !== 'string') {
    return { ok: false, error: 'path must be a string' };
  }
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').trim();
  if (!normalized) {
    return opts.allowEmpty
      ? { ok: true, relative: '' }
      : { ok: false, error: 'path must not be empty' };
  }
  if (normalized.includes('\0')) {
    return { ok: false, error: 'path contains a null byte' };
  }
  if (normalized.startsWith('-')) {
    return { ok: false, error: 'flag-like paths are not allowed' };
  }
  if (path.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) {
    return { ok: false, error: 'path must be relative to the workspace root' };
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..' || segment === '')) {
    return { ok: false, error: 'path must stay inside the workspace (no ".." segments)' };
  }
  if (segments[0] === '.git') {
    return { ok: false, error: '.git is managed by the git APIs and is off-limits to file ops' };
  }
  return { ok: true, relative: normalized };
}

export type InsideWorkspaceResolution =
  | { ok: true; absolute: string }
  | { ok: false; error: string };

/**
 * Resolve a validated relative path to an absolute path, then defeat
 * symlink escape: realpath the deepest EXISTING ancestor of the target and
 * require it to remain inside the workspace's own realpath.
 */
export function resolveInsideWorkspace(
  workspaceRoot: string,
  relative: string
): InsideWorkspaceResolution {
  const absolute = path.resolve(workspaceRoot, relative);
  if (!isInsidePath(workspaceRoot, absolute)) {
    return { ok: false, error: 'path escapes the workspace root' };
  }

  let probe = absolute;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  try {
    const realProbe = fs.realpathSync(probe);
    const realRoot = fs.realpathSync(workspaceRoot);
    if (!isInsidePath(realRoot, realProbe)) {
      return { ok: false, error: 'path resolves outside the workspace (symlink escape)' };
    }
  } catch {
    return { ok: false, error: 'path could not be resolved' };
  }

  return { ok: true, absolute };
}
