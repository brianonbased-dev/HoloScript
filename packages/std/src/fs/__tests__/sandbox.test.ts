/**
 * @holoscript/std/fs sandbox boundary tests (R-02 P1).
 *
 * Verifies that `enforcePathBoundary`:
 *   - Pass-through when HOLOSCRIPT_FS_SANDBOX_ROOT is unset (preserves
 *     existing behavior, existing tests continue to pass).
 *   - Resolves relative paths against the sandbox root (not cwd).
 *   - Rejects absolute paths outside the sandbox.
 *   - Rejects relative paths that traverse outside via `..`.
 *   - Allows the sandbox root itself.
 *   - Allows nested paths inside the root.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, sep } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';
import {
  enforcePathBoundary,
  enforcePathBoundaryPair,
  PathBoundaryError,
  getSandboxRoot,
} from '../sandbox.js';

const SANDBOX_ENV = 'HOLOSCRIPT_FS_SANDBOX_ROOT';

describe('sandbox boundary', () => {
  let originalEnv: string | undefined;
  let sandboxRoot: string;

  beforeEach(() => {
    originalEnv = process.env[SANDBOX_ENV];
    sandboxRoot = mkdtempSync(`${tmpdir()}${sep}holoscript-fs-sandbox-`);
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env[SANDBOX_ENV];
    else process.env[SANDBOX_ENV] = originalEnv;
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  describe('disabled (env var unset)', () => {
    beforeEach(() => {
      delete process.env[SANDBOX_ENV];
    });

    it('returns the path unchanged', () => {
      expect(enforcePathBoundary('/etc/passwd')).toBe('/etc/passwd');
      expect(enforcePathBoundary('../../escape')).toBe('../../escape');
      expect(enforcePathBoundary('foo/bar')).toBe('foo/bar');
    });

    it('reports null sandbox root', () => {
      expect(getSandboxRoot()).toBeNull();
    });
  });

  describe('enabled', () => {
    beforeEach(() => {
      process.env[SANDBOX_ENV] = sandboxRoot;
    });

    it('reports the resolved sandbox root', () => {
      expect(getSandboxRoot()).toBe(resolve(sandboxRoot));
    });

    it('allows the sandbox root itself', () => {
      const out = enforcePathBoundary(sandboxRoot);
      expect(out).toBe(resolve(sandboxRoot));
    });

    it('allows nested paths inside the root', () => {
      const out = enforcePathBoundary(`${sandboxRoot}${sep}sub${sep}file.txt`);
      expect(out).toBe(resolve(sandboxRoot, 'sub', 'file.txt'));
    });

    it('resolves relative paths against the sandbox root', () => {
      const out = enforcePathBoundary('config.json');
      expect(out).toBe(resolve(sandboxRoot, 'config.json'));
    });

    it('resolves nested relative paths against the sandbox root', () => {
      const out = enforcePathBoundary('sub/file.txt');
      expect(out).toBe(resolve(sandboxRoot, 'sub', 'file.txt'));
    });

    it('rejects absolute paths outside the root', () => {
      const target = process.platform === 'win32' ? 'C:\\Windows\\System32' : '/etc/passwd';
      expect(() => enforcePathBoundary(target)).toThrow(PathBoundaryError);
    });

    it('rejects relative paths that escape via ..', () => {
      expect(() => enforcePathBoundary('../escape')).toThrow(PathBoundaryError);
      expect(() => enforcePathBoundary('sub/../../escape')).toThrow(PathBoundaryError);
    });

    it('throws on non-string input', () => {
      // @ts-expect-error — runtime guard for misuse from JS callers
      expect(() => enforcePathBoundary(undefined)).toThrow(TypeError);
      // @ts-expect-error
      expect(() => enforcePathBoundary(null)).toThrow(TypeError);
    });

    it('PathBoundaryError carries diagnostic fields', () => {
      try {
        enforcePathBoundary('../escape');
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PathBoundaryError);
        const e = err as PathBoundaryError;
        expect(e.code).toBe('ERR_PATH_BOUNDARY');
        expect(e.attemptedPath).toBe('../escape');
        expect(e.sandboxRoot).toBe(resolve(sandboxRoot));
      }
    });

    it('enforcePathBoundaryPair validates both args', () => {
      const [src, dest] = enforcePathBoundaryPair('a.txt', 'b.txt');
      expect(src).toBe(resolve(sandboxRoot, 'a.txt'));
      expect(dest).toBe(resolve(sandboxRoot, 'b.txt'));

      expect(() => enforcePathBoundaryPair('a.txt', '../escape.txt')).toThrow(PathBoundaryError);
      expect(() => enforcePathBoundaryPair('../escape.txt', 'b.txt')).toThrow(PathBoundaryError);
    });
  });

  describe('runtime toggle', () => {
    it('flips behavior when env var is set/unset between calls', () => {
      delete process.env[SANDBOX_ENV];
      expect(enforcePathBoundary('../escape')).toBe('../escape');

      process.env[SANDBOX_ENV] = sandboxRoot;
      expect(() => enforcePathBoundary('../escape')).toThrow(PathBoundaryError);

      delete process.env[SANDBOX_ENV];
      expect(enforcePathBoundary('../escape')).toBe('../escape');
    });
  });
});
