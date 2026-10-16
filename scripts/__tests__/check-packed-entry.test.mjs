// node --test scripts/__tests__/check-packed-entry.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-packed-entry.mjs');

function fixture(pkg, files) {
  const dir = mkdtempSync(join(tmpdir(), 'packed-entry-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '0.0.0', ...pkg }));
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), '');
  }
  return dir;
}
const run = (dir, cwd) => spawnSync(process.execPath, [script, dir], { encoding: 'utf8', cwd });
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('fails when main is declared but not packed (linter 6.1.1 shape)', () => {
  const dir = fixture({ name: 'fx-bad', main: 'dist/index.js', types: 'dist/index.d.ts', files: ['dist'] },
    ['dist/index.mjs', 'dist/index.d.ts']);
  try {
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /lacks declared entry: dist\/index\.js/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fails when an exports target or bin is missing', () => {
  const dir = fixture({ name: 'fx-exp', main: 'dist/index.js', bin: { x: './bin/x.cjs' },
    exports: { '.': { require: './dist/index.js', import: './dist/index.mjs' } }, files: ['dist'] },
    ['dist/index.js']);
  try {
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /dist\/index\.mjs/);
    assert.match(r.stderr, /bin\/x\.cjs/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('passes when every declared entry is packed', () => {
  const dir = fixture({ name: 'fx-ok', main: 'dist/index.js', module: 'dist/index.mjs', types: 'dist/index.d.ts',
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.mjs', require: './dist/index.js' } }, files: ['dist'] },
    ['dist/index.js', 'dist/index.mjs', 'dist/index.d.ts']);
  try {
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resolves a repo-relative package path from any cwd (pnpm --filter shape)', () => {
  const linterDir = join(repoRoot, 'packages', 'linter');
  const dir = fixture({ name: 'fx-cwd', main: 'index.js' }, ['index.js']);
  try {
    for (const cwd of [repoRoot, linterDir, tmpdir()]) {
      const r = run('packages/linter', cwd);
      assert.doesNotMatch(r.stderr, /ENOENT/, `cwd=${cwd}: ${r.stderr}`);
      assert.match(r.stdout + r.stderr, /@holoscript\/linter@/, `cwd=${cwd}`);
      const a = run(dir, linterDir);
      assert.equal(a.status, 0, `absolute from cwd=${cwd}: ${a.stderr}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
