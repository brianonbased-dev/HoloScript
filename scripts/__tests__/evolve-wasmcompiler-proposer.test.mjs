#!/usr/bin/env node
/**
 * Pure Node smoke tests for scripts/evolve-wasmcompiler-proposer.mjs.
 *
 * Run via: node scripts/__tests__/evolve-wasmcompiler-proposer.test.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'evolve-wasmcompiler-proposer.mjs');

let testsRun = 0;

function test(name, fn) {
  fn();
  testsRun += 1;
  console.log(`  PASS ${name}`);
}

test('help exits 0 and documents the model/provenance controls', () => {
  const result = spawnSync('node', [SCRIPT, '--help'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--model <name>/);
  assert.match(result.stdout, /--seed-ref <ref>/);
  assert.match(result.stdout, /--mock-proposer <path>/);
});

test('source wires runEvolution to the committed WASMCompiler gate', () => {
  const source = readFileSync(SCRIPT, 'utf8');
  assert.match(source, /runEvolution/);
  assert.match(source, /scripts\/evolve-wasmcompiler-gate\.mjs/);
  assert.match(source, /selfShips:\s*false/);
  assert.match(source, /holoscript-evolve-wasmcompiler-proposer-v1/);
});

console.log(`\n${testsRun}/${testsRun} tests passed`);
