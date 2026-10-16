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
const run = (dir) => spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });

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
