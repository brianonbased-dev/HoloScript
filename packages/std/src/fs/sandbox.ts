/**
 * @holoscript/std/fs sandbox boundary enforcement.
 *
 * Closes A-003 R-02 P1 finding (PackagePermissionManifest noted "NO path
 * boundary enforcement currently"). Without a boundary, a `.hsplus`
 * scene can call `readText('../../etc/passwd')` and read host files —
 * the vm2 sandbox confines the JS runtime but trusts std/fs as a
 * privileged bridge.
 *
 * Behavior is **opt-in** via env var so this module ships as a no-op
 * for existing call sites and existing tests. The HoloScript runtime
 * loader sets `HOLOSCRIPT_FS_SANDBOX_ROOT` to the project root when
 * loading a `.hsplus`; flipping that switch enables enforcement
 * fleet-wide without further code changes.
 *
 * Two modes:
 *   - disabled (env var unset): pass-through, behavior identical to
 *     pre-R-02 code. Existing tests remain valid.
 *   - enabled (env var set):    every path is resolved against the
 *     sandbox root; paths that resolve outside it throw `PathBoundaryError`.
 */

import { resolve, isAbsolute, relative } from 'path';

const SANDBOX_ROOT_ENV = 'HOLOSCRIPT_FS_SANDBOX_ROOT';

export class PathBoundaryError extends Error {
  readonly code = 'ERR_PATH_BOUNDARY';
  readonly attemptedPath: string;
  readonly sandboxRoot: string;
  constructor(attemptedPath: string, sandboxRoot: string) {
    super(
      `[@holoscript/std/fs] path "${attemptedPath}" resolves outside sandbox root "${sandboxRoot}"`,
    );
    this.name = 'PathBoundaryError';
    this.attemptedPath = attemptedPath;
    this.sandboxRoot = sandboxRoot;
  }
}

/**
 * Returns the configured sandbox root, or null if enforcement is disabled.
 * Reads from process.env at every call so the runtime can flip enforcement
 * on/off without rebuilding the std package.
 */
export function getSandboxRoot(): string | null {
  const raw = process.env[SANDBOX_ROOT_ENV];
  if (!raw || raw.trim() === '') return null;
  return resolve(raw.trim());
}

/**
 * Validates a user-supplied path against the sandbox root and returns the
 * resolved absolute path. When enforcement is disabled, returns the path
 * unchanged so call sites compose cleanly with both modes.
 *
 * Throws `PathBoundaryError` when the path resolves outside the sandbox.
 * Symlinks are NOT followed here — that's a layer above this check; we
 * enforce the lexical boundary only. (vm2 + filesystem permissions handle
 * symlink-targeted escapes.)
 */
export function enforcePathBoundary(path: string): string {
  if (typeof path !== 'string') {
    throw new TypeError(`[@holoscript/std/fs] path must be a string, got ${typeof path}`);
  }
  const root = getSandboxRoot();
  if (root === null) return path;

  // Resolve relative paths against sandbox root, not the current working
  // directory. This is the critical difference: a `.hsplus` scene shouldn't
  // be able to control which directory relative paths are interpreted from.
  const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);

  // Lexical containment check via `relative()`. If the relative path starts
  // with `..` the target is outside the root.
  const rel = relative(root, absolute);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return absolute;
  }
  throw new PathBoundaryError(path, root);
}

/**
 * Convenience for two-path APIs (copy, move, rename).
 */
export function enforcePathBoundaryPair(src: string, dest: string): [string, string] {
  return [enforcePathBoundary(src), enforcePathBoundary(dest)];
}
