/**
 * Every @holoscript/core subpath must be loadable with require() from the
 * built dist. framework, mcp-server and other CJS consumers require() core at
 * runtime; an "import"-only export (or a "require" pointing at a file the
 * build does not emit) crashes them at boot. mcp-server was down 2026-10-15
 * for exactly that (./constants, #565 -> #582/#583).
 *
 * Needs a built core (pnpm --filter @holoscript/core build). It FAILS, not
 * skips, without one: a silent skip is how the gap shipped.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { join, resolve } from 'path';

const coreRoot = resolve(__dirname, '../..');
const pkg = JSON.parse(readFileSync(join(coreRoot, 'package.json'), 'utf8'));
const exportsMap = pkg.exports as Record<string, unknown>;
const requireFromCore = createRequire(join(coreRoot, 'package.json'));

// Loading these would run a program, not just a module. Resolve only.
const RESOLVE_ONLY = new Set(['./cli/holoscript-runner']);

const concrete = Object.keys(exportsMap).filter(
  (sp) => !sp.includes('*') && !sp.endsWith('.json') && typeof exportsMap[sp] === 'object'
);

describe('core exports: every JS subpath has a require condition', () => {
  it('no subpath is import-only', () => {
    const importOnly = concrete.filter((sp) => {
      const e = exportsMap[sp] as Record<string, unknown>;
      return 'import' in e && !('require' in e) && !('default' in e);
    });
    expect(importOnly).toEqual([]);
  });

  it('./tools and ./constants point at their .cjs builds', () => {
    expect(exportsMap['./tools']).toMatchObject({ require: './dist/tools/index.cjs' });
    expect(exportsMap['./constants']).toMatchObject({ require: './dist/constants.cjs' });
  });
});

describe('core exports: every require target exists and loads from dist', () => {
  it('core is built', () => {
    expect(existsSync(join(coreRoot, 'dist/index.cjs')), 'build core first').toBe(true);
  });

  const withRequire = concrete.filter((sp) => 'require' in (exportsMap[sp] as object));
  it.each(withRequire)('%s', (sp) => {
    const target = (exportsMap[sp] as Record<string, unknown>).require;
    const file = typeof target === 'string' ? target : (target as Record<string, string>)?.default;
    expect(typeof file, `${sp} require target`).toBe('string');
    expect(existsSync(join(coreRoot, file)), `${sp} -> ${file} missing from dist`).toBe(true);
    const id = sp === '.' ? '@holoscript/core' : `@holoscript/core/${sp.slice(2)}`;
    if (RESOLVE_ONLY.has(sp)) {
      expect(requireFromCore.resolve(id)).toContain('dist');
    } else {
      expect(() => requireFromCore(id)).not.toThrow();
    }
  }, 60_000);
});
