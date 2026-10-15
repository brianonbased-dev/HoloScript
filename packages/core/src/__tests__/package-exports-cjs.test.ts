/**
 * @holoscript/framework ships a CJS build (dist/index.cjs) with @holoscript/core
 * external, so every core subpath framework imports is `require()`d at runtime.
 * A subpath exported with only an "import" condition throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED at startup. That took mcp-server down on
 * 2026-10-15 (framework #565 added `@holoscript/core/constants`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const coreRoot = resolve(__dirname, '../..');
const pkg = JSON.parse(readFileSync(join(coreRoot, 'package.json'), 'utf8'));
const frameworkSrc = resolve(coreRoot, '../framework/src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function subpathsFrameworkImports(): string[] {
  const found = new Set<string>();
  const re = /from\s+['"]@holoscript\/core\/([^'"]+)['"]/g;
  for (const file of walk(frameworkSrc)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(re)) {
      if (/^\s*import\s+type\b/.test(text.slice(text.lastIndexOf('\n', m.index) + 1, m.index))) continue;
      found.add(`./${m[1]}`);
    }
  }
  return [...found].sort();
}

describe('core exports are require()-able where framework CJS needs them', () => {
  it('./constants has a require condition pointing at the CJS build', () => {
    expect(pkg.exports['./constants']).toMatchObject({
      import: './dist/constants.js',
      require: './dist/constants.cjs',
    });
  });

  it('every core subpath framework value-imports has a require condition', () => {
    const subpaths = subpathsFrameworkImports();
    expect(subpaths).toContain('./constants');
    const missing = subpaths.filter((sp) => {
      const entry = pkg.exports[sp];
      return entry && typeof entry === 'object' && !('require' in entry) && !('default' in entry);
    });
    expect(missing).toEqual([]);
  });
});
