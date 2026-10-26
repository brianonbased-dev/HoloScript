// Importing the module must write nothing: no token, no receipts dir, in the repo or cwd.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const snap = (d) => readdirSync(d).sort();

test('importing jetson-scope.mjs creates no files', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'jscope-cwd-'));
  const state = mkdtempSync(join(tmpdir(), 'jscope-state-'));
  const oldCwd = process.cwd(),
    oldState = process.env.JETSON_SCOPE_STATE_DIR;
  const before = snap(HERE);
  try {
    process.chdir(cwd);
    process.env.JETSON_SCOPE_STATE_DIR = state;
    await import(pathToFileURL(join(HERE, 'jetson-scope.mjs')).href + '?import-test');
    assert.deepEqual(snap(HERE), before, 'module dir unchanged');
    assert.deepEqual(snap(cwd), [], 'cwd unchanged');
    assert.deepEqual(snap(state), [], 'state dir untouched on import');
  } finally {
    process.chdir(oldCwd);
    if (oldState === undefined) delete process.env.JETSON_SCOPE_STATE_DIR;
    else process.env.JETSON_SCOPE_STATE_DIR = oldState;
    rmSync(cwd, { recursive: true, force: true });
    rmSync(state, { recursive: true, force: true });
  }
});
