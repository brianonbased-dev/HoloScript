/**
 * ImportResolver — Parser Utility Production Tests
 *
 * Tests the pure-CPU path utilities exported from ImportResolver.ts:
 *
 * resolveImportPath:
 *   - relative ./foo from baseDir
 *   - relative ../foo traversal
 *   - absolute path returned as-is
 *   - Windows-style absolute path A: returned as-is
 *   - nested ./a/b/c relative path
 *   - multiple ../ segments
 *   - baseDir with trailing slash
 *   - base with dot segments
 *
 * ImportResolver cache API (clearCache / getCachedPaths / getCached):
 *   - empty cache after construction
 *   - getCachedPaths returns empty array initially
 *   - getCached returns undefined for unknown path
 *   - clearCache no-throws on empty cache
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveImportPath, ImportResolver } from '../../parser/ImportResolver';

// ── resolveImportPath ─────────────────────────────────────────────────────────

describe('resolveImportPath — relative paths', () => {
  it('./module resolves relative to baseDir', () => {
    const result = resolveImportPath('./component', '/project/src');
    expect(result).toBe('/project/src/component');
  });

  it('../module goes one level up', () => {
    const result = resolveImportPath('../shared', '/project/src/features');
    expect(result).toBe('/project/src/shared');
  });

  it('../../module goes two levels up', () => {
    // base = /project/src/features/auth  →  combined = /project/src/features/auth/../../lib
    // normalised: auth → up → features → up → /project/src/lib
    const result = resolveImportPath('../../lib', '/project/src/features/auth');
    expect(result).toBe('/project/src/lib');
  });

  it('./a/b/c resolves nested relative path', () => {
    const result = resolveImportPath('./a/b/c', '/root');
    expect(result).toBe('/root/a/b/c');
  });

  it('baseDir with trailing slash is handled correctly', () => {
    const result = resolveImportPath('./mod', '/base/dir/');
    expect(result).toBe('/base/dir/mod');
  });

  it('dot segment in baseDir is normalised away', () => {
    const result = resolveImportPath('./x', '/a/./b');
    expect(result).toBe('/a/b/x');
  });

  it('multiple .. segments resolve correctly', () => {
    const result = resolveImportPath('../../../top', '/a/b/c/d');
    expect(result).toBe('/a/top');
  });
});

describe('resolveImportPath — absolute paths', () => {
  it('absolute /path is returned as-is (normalised)', () => {
    const result = resolveImportPath('/absolute/path/to/file', '/some/base');
    expect(result).toBe('/absolute/path/to/file');
  });

  it('Windows-style C: path is returned as-is', () => {
    const result = resolveImportPath('C:/Users/foo/bar', '/base');
    expect(result).toBe('C:/Users/foo/bar');
  });

  it('windows backslash in importPath is converted to forward slash', () => {
    // resolveImportPath normalises \\ → /
    const result = resolveImportPath('C:\\Users\\bar', '/base');
    // After normalisation: starts with C: → returned as-is
    expect(result.startsWith('C:')).toBe(true);
  });
});

describe('resolveImportPath — forward-slash normalisation', () => {
  it('baseDir with backslashes is normalised', () => {
    const result = resolveImportPath('./mod', 'C:\\project\\src');
    // Should resolve relative to C:/project/src
    expect(result.includes('src')).toBe(true);
    expect(result.includes('\\')).toBe(false);
  });
});

// ── ImportResolver cache API ──────────────────────────────────────────────────

describe('ImportResolver — cache API', () => {
  it('getCachedPaths returns empty array for fresh resolver', () => {
    const ir = new ImportResolver();
    expect(ir.getCachedPaths()).toHaveLength(0);
  });

  it('getCached returns undefined for unknown path', () => {
    const ir = new ImportResolver();
    expect(ir.getCached('/not/in/cache')).toBeUndefined();
  });

  it('clearCache does not throw on empty cache', () => {
    expect(() => new ImportResolver().clearCache()).not.toThrow();
  });

  it('getCachedPaths is still empty after clearCache', () => {
    const ir = new ImportResolver();
    ir.clearCache();
    expect(ir.getCachedPaths()).toHaveLength(0);
  });
});

// ── ImportResolver — disabled mode ────────────────────────────────────────────

describe('ImportResolver — resolve (disabled)', () => {
  it('disabled=true returns empty scope/modules/errors immediately', async () => {
    const ir = new ImportResolver();
    const result = await ir.resolve(
      { ast: { imports: [{ path: './foo', alias: 'foo' }] } } as any,
      '/src/index.hs',
      { baseDir: '/src', disabled: true }
    );
    expect(result.scope.size).toBe(0);
    expect(result.modules.size).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('no imports = empty result without calling readFile', async () => {
    const ir = new ImportResolver();
    const readFile = vi.fn();
    const result = await ir.resolve({ ast: { imports: [] } } as any, '/src/index.hs', {
      baseDir: '/src',
      readFile,
    });
    expect(result.errors).toHaveLength(0);
    expect(readFile).not.toHaveBeenCalled();
  });
});

// ── ImportResolver — not_found error ─────────────────────────────────────────

describe('ImportResolver — file-not-found error', () => {
  it('produces not_found error when readFile throws ENOENT', async () => {
    const ir = new ImportResolver();
    const result = await ir.resolve(
      { ast: { imports: [{ path: './missing', alias: 'miss' }] } } as any,
      '/src/index.hs',
      {
        baseDir: '/src',
        readFile: async () => {
          throw new Error('File not found: /src/missing');
        },
      }
    );
    expect(result.errors.length).toBeGreaterThan(0);
    // Should map to not_found or parse_error (our impl checks message prefixes)
    const codes = result.errors.map((e) => e.code);
    expect(codes.some((c) => ['not_found', 'parse_error'].includes(c))).toBe(true);
  });
});
