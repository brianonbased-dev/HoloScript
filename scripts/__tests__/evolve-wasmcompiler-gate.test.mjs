#!/usr/bin/env node
/**
 * Pure Node smoke tests for scripts/evolve-wasmcompiler-gate.mjs.
 *
 * Run via: node scripts/__tests__/evolve-wasmcompiler-gate.test.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'evolve-wasmcompiler-gate.mjs');

let testsRun = 0;

function test(name, fn) {
  fn();
  testsRun += 1;
  console.log(`  PASS ${name}`);
}

test('restores target source after applying seed and candidate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evolve-wasm-gate-'));
  const target = join(dir, 'Target.ts');
  const seed = join(dir, 'Seed.ts');
  const candidate = join(dir, 'Candidate.ts');
  const out = join(dir, 'receipt.json');
  const originalSource = 'export const marker = "original";\n';

  writeFileSync(target, originalSource);
  writeFileSync(seed, 'export const marker = "seed";\n');
  writeFileSync(candidate, 'export const marker = "candidate";\n');

  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--target',
      target,
      '--seed',
      seed,
      '--candidate',
      candidate,
      '--out',
      out,
      '--skip-tests',
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    }
  );

  assert.equal(result.status, 1);
  assert.equal(readFileSync(target, 'utf8'), originalSource);
  assert.match(result.stderr, /restored original target file/);
});

console.log(`\n${testsRun}/${testsRun} tests passed`);
