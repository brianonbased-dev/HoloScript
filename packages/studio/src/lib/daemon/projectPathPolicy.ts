/**
 * Which folder a HoloHeal job may copy and scan.
 *
 * Same rule as absorb-service's absorbRootRefusal (#483, e546d000): compare
 * after resolving symlinks, with a path.relative containment test (so
 * /data/workspaces2 is NOT inside /data/workspaces). Stricter in three ways:
 *   - the only allowed root is the Studio workspaces root
 *     (HOLOSCRIPT_WORKSPACES_DIR via getWorkspacesRoot), never cwd or tmp;
 *   - projectPath must be absolute, must exist, and must be strictly BELOW the
 *     root (the root itself holds every user's workspaces);
 *   - there is no fallback: an empty projectPath is refused, never replaced by
 *     process.cwd().
 * Runs inside the runner on every path (API route, Brittney, HoloDaemon), so a
 * caller that skips the route-level check cannot skip this one.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspacesRoot } from '@/lib/workspace/workspaceFs';

export type ProjectPathDecision =
  { ok: true; realPath: string; realRoot: string } | { ok: false; reason: string };

function isStrictlyWithin(child: string, root: string): boolean {
  const relative = path.relative(root, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function checkProjectPath(
  projectPath: string | null | undefined,
  root: string = getWorkspacesRoot()
): ProjectPathDecision {
  if (typeof projectPath !== 'string' || projectPath.trim() === '') {
    return {
      ok: false,
      reason:
        'no projectPath — a HoloHeal job needs the workspace folder of an imported project (there is no fallback to the server directory)',
    };
  }
  if (!path.isAbsolute(projectPath)) {
    return { ok: false, reason: `projectPath must be an absolute path (got ${projectPath})` };
  }
  let realRoot: string;
  try {
    realRoot = fs.realpathSync.native(path.resolve(root));
  } catch (err: unknown) {
    return {
      ok: false,
      reason: `the workspaces root (HOLOSCRIPT_WORKSPACES_DIR) is not readable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  let realPath: string;
  try {
    realPath = fs.realpathSync.native(path.resolve(projectPath));
  } catch (err: unknown) {
    return {
      ok: false,
      reason: `projectPath does not exist or is unreadable (${projectPath}): ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!isStrictlyWithin(realPath, realRoot)) {
    return {
      ok: false,
      reason: `projectPath is outside the workspaces root (HOLOSCRIPT_WORKSPACES_DIR) after resolving links and ".." (${projectPath})`,
    };
  }
  return { ok: true, realPath, realRoot };
}
