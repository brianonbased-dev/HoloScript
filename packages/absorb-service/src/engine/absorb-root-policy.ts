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
 * Inline sourceFiles uploads never reach this check: they are written to a
 * server-chosen temp directory, not a caller-named one.
 *
 * The server's own state is never scanned, whatever the allowlist says
 * (2026-10-08). On the hosted mcp-server the workspace root is /app, and its
 * persistent volume, which holds HOLOMESH_DATA_DIR (/app/.holoscript/holomesh:
 * the key registry, boards, teams), is mounted INSIDE it. A logged-in caller
 * could absorb rootDir ".holoscript/holomesh", or "." with includeHidden, and
 * get the names of those files and the symbols of any code there.
 * serverStateDirs() names those folders: a root inside one is refused, and
 * CodebaseScanner skips them during any walk (pathExcludedByPolicy).
 *
 *   ABSORB_PROTECTED_ROOTS  more folders to treat the same way (path-delimited).
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

/**
 * The environment keys the policy reads. A plain record, not NodeJS.ProcessEnv, so a
 * caller can pass only the roots it allows: frameworks that require keys such as
 * NODE_ENV on ProcessEnv (Next.js) otherwise reject a literal like { ABSORB_ALLOWED_ROOTS }.
 */
export type AbsorbRootEnv = Readonly<Record<string, string | undefined>>;

export function absorbAllowedRoots(env: AbsorbRootEnv = process.env): string[] {
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

/**
 * The folders that hold this server's own state, as given and resolved: the
 * HoloMesh data dir (HOLOMESH_DATA_DIR, or its default <cache>/holomesh), the
 * .holoscript folder in the workspace root (the hosted volume), and
 * ABSORB_PROTECTED_ROOTS. None is ever scanned. The cache dir as a whole is NOT
 * here: Studio clones a local import into <cache>/workspaces/<id>, and an
 * operator may allowlist that.
 */
export function serverStateDirs(env: AbsorbRootEnv = process.env): string[] {
  const workspaceRoot = env.HOLOSCRIPT_WORKSPACE_ROOT?.trim() || process.cwd();
  const cacheDir = env.HOLOSCRIPT_CACHE_DIR?.trim() || path.join(os.homedir(), '.holoscript');
  const candidates = [
    env.HOLOMESH_DATA_DIR?.trim() || path.join(cacheDir, 'holomesh'),
    path.join(workspaceRoot, '.holoscript'),
    ...(env.ABSORB_PROTECTED_ROOTS ?? '').split(path.delimiter).map((entry) => entry.trim()),
  ].filter((entry): entry is string => Boolean(entry));
  return [...new Set(candidates.flatMap((entry) => [path.resolve(entry), realOrResolved(entry)]))];
}

/** Is `target` inside (or equal to) one of `dirs`? Checked as given and after resolving links. */
export function insideServerState(target: string, dirs: string[] = serverStateDirs()): boolean {
  const candidates = [path.resolve(target), realOrResolved(target)];
  return dirs.some((dir) => candidates.some((candidate) => isWithin(candidate, dir)));
}

/** Why `requested` may not be scanned, or null when it sits inside an allowed root. */
export function absorbRootRefusal(
  requested: string,
  env: AbsorbRootEnv = process.env
): string | null {
  // A caller that passes its own env (Studio's runner names only ABSORB_ALLOWED_ROOTS)
  // still has the real process's state folders protected.
  const stateDirs = serverStateDirs(env === process.env ? env : { ...process.env, ...env });
  if (insideServerState(requested, stateDirs)) {
    return (
      `${requested} is this server's own state (its data, cache or key folders), which is never scanned. ` +
      'A remote caller should send its code as sourceFiles.'
    );
  }
  const real = realOrResolved(requested);
  const roots = absorbAllowedRoots(env);
  if (roots.some((root) => isWithin(real, root))) return null;
  return (
    `${requested} is outside the folders this server may scan (${roots.join(', ')}). ` +
    'The operator can widen this with ABSORB_ALLOWED_ROOTS; a remote caller should send its code as sourceFiles.'
  );
}
