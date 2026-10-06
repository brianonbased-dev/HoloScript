/**
 * Workspace filesystem guards — shared by /api/workspace/files,
 * /api/workspace/build, and the Brittney route's workspacePath injection.
 *
 * Trust model mirrors /api/git/_shared: every operation is confined to
 * workspace clones under ~/.holoscript/workspaces (HOLOSCRIPT_WORKSPACES_DIR)
 * AND to a workspace the caller owns (./workspaceOwner.ts).
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

// The containment-only `resolveWorkspaceFsRoot(workspacePath)` that used to
// live here was removed on purpose (P0 2026-10-05): containment proves a path
// is under the SHARED root, not that the caller owns it. Use
// `resolveOwnedWorkspaceFsRoot(workspacePath, session)` from ./workspaceOwner,
// which adds the ownership check, so no caller can silently skip it.

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
  { ok: true; absolute: string } | { ok: false; error: string };

const MAX_SYMLINK_HOPS = 40;
const SEGMENT_SPLIT = path.sep === '\\' ? /[\\/]+/ : /\/+/;

function errorCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | null)?.code;
}

/**
 * Walk `segments` from `base` the way the kernel would, but with lstat on
 * every component: a symlink component is followed explicitly (readlink, then
 * the same walk on its target, chains included), so a dangling link is never
 * mistaken for "absent". Once a component does not exist, the rest is
 * appended lexically below the deepest existing real directory. Returns the
 * path the operation would actually land on, or null on a loop, too many hops
 * or an unreadable component.
 */
function walkSegments(base: string, segments: string[], hops: { count: number }): string | null {
  let current = base;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      current = path.dirname(current);
      continue;
    }
    const next = path.join(current, segment);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(next);
    } catch (err) {
      const code = errorCode(err);
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return path.join(next, ...segments.slice(i + 1).filter((rest) => rest && rest !== '.'));
      }
      return null;
    }
    if (!stat.isSymbolicLink()) {
      current = next;
      continue;
    }
    hops.count += 1;
    if (hops.count > MAX_SYMLINK_HOPS) return null;
    let link: string;
    try {
      link = fs.readlinkSync(next);
    } catch {
      return null;
    }
    const linkBase = path.isAbsolute(link) ? path.parse(path.resolve(link)).root : current;
    const linkSegments = (
      path.isAbsolute(link) ? link.slice(path.parse(link).root.length) : link
    ).split(SEGMENT_SPLIT);
    const landed = walkSegments(linkBase, linkSegments, hops);
    if (landed === null) return null;
    current = landed;
  }
  return current;
}

/** Where an absolute path would land on disk, following every symlink component. */
function landingPath(absolute: string): string | null {
  const root = path.parse(absolute).root;
  return walkSegments(root, absolute.slice(root.length).split(SEGMENT_SPLIT), { count: 0 });
}

/**
 * Resolve a validated relative path to an absolute path, then defeat
 * symlink escape WITHOUT following links while climbing:
 *  1. climb to the deepest existing ancestor with lstat (a dangling link
 *     counts as existing; existsSync used to follow it and report "absent");
 *  2. realpath only that ancestor and require it inside the workspace's own
 *     realpath (a dangling ancestor cannot be realpathed and goes to step 3);
 *  3. resolve where the full path would actually land, following each
 *     symlink component (chains and dangling links included) with
 *     lstat/readlink, and require that inside too.
 * So a write, mkdir or move under a symlinked parent or onto a dangling link
 * that points outside the workspace is refused before anything is created.
 */
export function resolveInsideWorkspace(
  workspaceRoot: string,
  relative: string
): InsideWorkspaceResolution {
  const absolute = path.resolve(workspaceRoot, relative);
  if (!isInsidePath(workspaceRoot, absolute)) {
    return { ok: false, error: 'path escapes the workspace root' };
  }

  let realRoot: string;
  try {
    realRoot = fs.realpathSync(workspaceRoot);
  } catch {
    return { ok: false, error: 'path could not be resolved' };
  }
  const escape = {
    ok: false as const,
    error: 'path resolves outside the workspace (symlink escape)',
  };

  let probe = absolute;
  for (;;) {
    try {
      fs.lstatSync(probe);
      break;
    } catch (err) {
      const code = errorCode(err);
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        return { ok: false, error: 'path could not be resolved' };
      }
    }
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  try {
    if (!isInsidePath(realRoot, fs.realpathSync(probe))) return escape;
  } catch (err) {
    // Only a dangling (or looping) symlink ancestor gets here; step 3 decides.
    if (errorCode(err) !== 'ENOENT' && errorCode(err) !== 'ELOOP') {
      return { ok: false, error: 'path could not be resolved' };
    }
  }

  const landing = landingPath(absolute);
  if (landing === null) {
    return { ok: false, error: 'path could not be resolved (symlink loop)' };
  }
  if (!isInsidePath(realRoot, landing)) return escape;

  return { ok: true, absolute };
}
