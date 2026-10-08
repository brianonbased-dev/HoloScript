/**
 * Which server folders a codebase scan may open.
 *
 * Why (2026-10-04 custody review): holo_absorb_repo, holo_detect_drift and the
 * absorb-service /api/absorb/scan route opened any folder the caller named,
 * checking only that it existed. A caller holding tools:codebase (every
 * non-admin GitHub login on the hosted server) could map arbitrary server
 * directories: file lists, symbols, signatures and doc comments.
 *
 * The rule: a caller-named scan root must sit inside one of the allowed roots,
 * compared after resolving symlinks and junctions, so a link cannot point out.
 *
 *   ABSORB_ALLOWED_ROOTS  path-delimited list (";" on Windows, ":" elsewhere).
 *                         Set it on the laptop node to the checkout parent,
 *                         e.g. C:/holo-dev, to absorb sibling repos.
 *   unset                 the server's workspace root (HOLOSCRIPT_WORKSPACE_ROOT
 *                         or cwd) and the daemon project root
 *                         (ABSORB_PROJECT_ROOT or <tmp>/holoscript-daemon).
 *
 * Inline sourceFiles uploads never reach this check. Without a named root they
 * are written to a server-chosen temp directory. With one (rootDir, rootDirs
 * or a snapshot receipt's roots) they are refused unless the caller may name
 * this server's folders (callerMayNameUploadRoots in mcp/code-read-access.ts),
 * and code is read from the uploaded text, never from the disk at that root.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function realOrResolved(target: string): string {
  const resolved = path.resolve(target);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function isWithin(child: string, root: string): boolean {
  const relative = path.relative(root, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function absorbAllowedRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = (env.ABSORB_ALLOWED_ROOTS ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const roots =
    configured.length > 0
      ? configured
      : [
          env.HOLOSCRIPT_WORKSPACE_ROOT?.trim() || process.cwd(),
          env.ABSORB_PROJECT_ROOT?.trim() || path.join(os.tmpdir(), 'holoscript-daemon'),
        ];
  return roots.map(realOrResolved);
}

/** Why `requested` may not be scanned, or null when it sits inside an allowed root. */
export function absorbRootRefusal(
  requested: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const real = realOrResolved(requested);
  const roots = absorbAllowedRoots(env);
  if (roots.some((root) => isWithin(real, root))) return null;
  return (
    `${requested} is outside the folders this server may scan (${roots.join(', ')}). ` +
    'The operator can widen this with ABSORB_ALLOWED_ROOTS; a remote caller should send its code as sourceFiles.'
  );
}
