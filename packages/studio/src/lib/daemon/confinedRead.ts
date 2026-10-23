/**
 * Read a regular file that must live inside a confinement root, without
 * following symlinks and without a check-then-read race (Mapping BLOCK B3,
 * 2026-10-05).
 *
 * Order of checks:
 *   1. the path is lexically inside the root (no absolute escape, no `..`);
 *   2. lstat: it must be a regular file (a symlink, directory, FIFO or device is
 *      refused, never followed);
 *   3. realpath: the resolved path must still be inside the real root;
 *   4. open with O_NOFOLLOW (a final-component symlink swapped in after step 2
 *      makes the open fail with ELOOP) and O_NONBLOCK (a FIFO cannot hang us);
 *   5. on the OPEN HANDLE: fstat must be a regular file with the same dev/ino
 *      as step 2, and the handle's own path (/proc/self/fd/N on Linux) must be
 *      inside the real root. A directory swapped for a symlink between steps
 *      3 and 4 opens a different file, and this step refuses it before a
 *      single byte is read.
 *   6. only then read from the handle (size-capped).
 */
import * as fs from 'fs';
import * as path from 'path';

export type ConfinedReadResult =
  { ok: true; content: string; realPath: string } | { ok: false; missing: boolean; reason: string };

/** Test seam: runs between the confinement check and the open. Never set in production. */
export const confinedReadHooks: { beforeOpen?: (candidate: string) => void } = {};

const O_NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;
const O_NONBLOCK = fs.constants.O_NONBLOCK ?? 0;

function inside(child: string, root: string): boolean {
  const rel = path.relative(root, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function errCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Real path of an open handle, or null where the platform can't tell us. */
function handlePath(fd: number): string | null {
  try {
    return fs.readlinkSync(`/proc/self/fd/${fd}`);
  } catch {
    return null;
  }
}

/**
 * @param root     confinement root (resolved with realpath here)
 * @param target   a path relative to `root`, or an absolute path under `root`
 * @param maxBytes refuse files larger than this (default 8 MB)
 */
export function readConfinedRegularFile(
  root: string,
  target: string,
  maxBytes = 8 * 1024 * 1024
): ConfinedReadResult {
  let realRoot: string;
  try {
    realRoot = fs.realpathSync.native(root);
  } catch (err: unknown) {
    return { ok: false, missing: false, reason: `root unreadable: ${errText(err)}` };
  }
  const lexical = path.isAbsolute(target) ? path.resolve(target) : path.resolve(root, target);
  let rel: string;
  if (inside(lexical, path.resolve(root))) rel = path.relative(path.resolve(root), lexical);
  else if (inside(lexical, realRoot)) rel = path.relative(realRoot, lexical);
  else return { ok: false, missing: false, reason: 'outside the confinement root' };
  if (rel === '') return { ok: false, missing: false, reason: 'not a file (the root itself)' };
  const candidate = path.join(realRoot, rel);

  // 2. lstat — never follow.
  let lst: fs.Stats;
  try {
    lst = fs.lstatSync(candidate);
  } catch (err: unknown) {
    if (errCode(err) === 'ENOENT' || errCode(err) === 'ENOTDIR') {
      return { ok: false, missing: true, reason: 'does not exist' };
    }
    return { ok: false, missing: false, reason: `lstat failed: ${errText(err)}` };
  }
  if (lst.isSymbolicLink()) {
    return { ok: false, missing: false, reason: 'symlink (not followed, not read)' };
  }
  if (!lst.isFile()) {
    return { ok: false, missing: false, reason: 'not a regular file (skipped)' };
  }

  // 3. realpath confinement (catches a symlinked parent directory).
  try {
    const real = fs.realpathSync.native(candidate);
    if (!inside(real, realRoot)) {
      return { ok: false, missing: false, reason: 'resolves outside the confinement root' };
    }
  } catch (err: unknown) {
    return { ok: false, missing: false, reason: `realpath failed: ${errText(err)}` };
  }

  confinedReadHooks.beforeOpen?.(candidate);

  // 4. open without following a final-component symlink.
  let fd: number;
  try {
    fd = fs.openSync(candidate, fs.constants.O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
  } catch (err: unknown) {
    if (errCode(err) === 'ELOOP' || errCode(err) === 'EMLINK') {
      return { ok: false, missing: false, reason: 'symlink swapped in before open (O_NOFOLLOW)' };
    }
    if (errCode(err) === 'ENOENT')
      return { ok: false, missing: true, reason: 'vanished before open' };
    return { ok: false, missing: false, reason: `open failed: ${errText(err)}` };
  }

  try {
    // 5. identity and location of the handle we actually opened.
    const st = fs.fstatSync(fd);
    if (!st.isFile()) {
      return { ok: false, missing: false, reason: 'opened handle is not a regular file' };
    }
    if (st.dev !== lst.dev || st.ino !== lst.ino) {
      return {
        ok: false,
        missing: false,
        reason: 'file changed between the check and the open (refused)',
      };
    }
    const opened = handlePath(fd);
    if (opened !== null && !inside(opened, realRoot)) {
      return { ok: false, missing: false, reason: 'opened file is outside the confinement root' };
    }
    if (opened === null) {
      // No /proc: re-check the path and identity after the open.
      const again = fs.lstatSync(candidate);
      if (again.dev !== st.dev || again.ino !== st.ino) {
        return { ok: false, missing: false, reason: 'file changed after the open (refused)' };
      }
      if (!inside(fs.realpathSync.native(candidate), realRoot)) {
        return { ok: false, missing: false, reason: 'resolves outside the confinement root' };
      }
    }
    if (st.size > maxBytes) {
      return { ok: false, missing: false, reason: `larger than ${maxBytes} bytes (skipped)` };
    }
    // 6. read from the verified handle only.
    const content = fs.readFileSync(fd, 'utf-8');
    return { ok: true, content, realPath: candidate };
  } catch (err: unknown) {
    return { ok: false, missing: false, reason: `read failed: ${errText(err)}` };
  } finally {
    fs.closeSync(fd);
  }
}

/** Async adapter for CodebaseScanner's `readFile` option: throws with the refusal reason. */
export function confinedReader(root: string, maxBytes?: number): (p: string) => Promise<string> {
  return async (p: string) => {
    const r = readConfinedRegularFile(root, p, maxBytes);
    if (!r.ok) throw new Error(`refused read of ${p}: ${r.reason}`);
    return r.content;
  };
}
