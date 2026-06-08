#!/usr/bin/env node
/**
 * Smoke test for scripts/holoshell-local-reality-node.mjs.
 *
 * Proves the Local Reality Node receipt carries the source .holo hash and a
 * non-empty shell-object projection. The negative checks make missing hashes
 * and empty projections explicit failures.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLocalRealityNodeReceipt } from '../holoshell-local-reality-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-local-reality-node.mjs');
const SOURCE = 'experiments/holoshell-human-os-frontier/flagship-readiness-room.holo';
const OUT_DIR = join(REPO_ROOT, '.scratch', 'holoshell-local-reality-node-test');
const OUT_FILE = join(OUT_DIR, 'receipt.json');

let testsRun = 0;
let testsFailed = 0;

try {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--source',
      SOURCE,
      '--object',
      'OutcomePedestal',
      '--out',
      OUT_FILE,
      '--now',
      '2026-05-26T00:00:00.000Z',
      '--json',
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }
  );

  assertEq(result.status, 0, 'local reality node exits 0');
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
  }
  assertOk(existsSync(OUT_FILE), 'receipt file was written');

  const receipt = JSON.parse(readFileSync(OUT_FILE, 'utf8'));
  const printedReceipt = JSON.parse(result.stdout);
  const sourceBytes = readFileSync(resolve(REPO_ROOT, SOURCE));
  const expectedSourceHash = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;

  assertEq(
    receipt.schemaVersion,
    'holoscript.holoshell.local-reality-node.receipt.v0.1.0',
    'schema'
  );
  assertEq(receipt.sourceHoloHash, expectedSourceHash, 'top-level source .holo hash');
  assertEq(receipt.source.holoHash, expectedSourceHash, 'nested source .holo hash');
  assertEq(printedReceipt.sourceHoloHash, expectedSourceHash, 'stdout source .holo hash');
  assertOk(/^sha256:[a-f0-9]{64}$/.test(receipt.sourceHoloHash), 'source hash is sha256 hex');
  assertOk(
    receipt.projectedState && Object.keys(receipt.projectedState).length > 0,
    'projected state is non-empty'
  );
  assertEq(receipt.projectedState.objectName, 'OutcomePedestal', 'selected object projected');
  assertOk(receipt.projectedState.label.includes('Outcome:'), 'object label projected');
  assertOk(receipt.projectedState.properties.humanJob, 'object properties projected');
  assertEq(receipt.operation.permissionEnvelope, 'read_only', 'operation is read_only');
  assertEq(receipt.operation.mutationExecuted, false, 'operation did not mutate');
  assertOk(receipt.cael.chain.hash.startsWith('sha256:'), 'CAEL chain hash present');
  assertEq(validateLocalRealityNodeReceipt(receipt).length, 0, 'receipt validates');

  const missingHash = JSON.parse(JSON.stringify(receipt));
  delete missingHash.sourceHoloHash;
  missingHash.source.holoHash = '';
  assertOk(
    validateLocalRealityNodeReceipt(missingHash).includes('source .holo hash missing or invalid'),
    'validator fails when source hash is missing'
  );

  const emptyProjection = JSON.parse(JSON.stringify(receipt));
  emptyProjection.projectedState = {};
  assertOk(
    validateLocalRealityNodeReceipt(emptyProjection).includes('projected state is empty'),
    'validator fails when projection is empty'
  );

  const emptySource = join(OUT_DIR, 'empty-room.holo');
  writeFileSync(emptySource, 'composition "Empty Room" {\n}\n', 'utf8');
  const emptyResult = spawnSync(
    process.execPath,
    [SCRIPT, '--source', emptySource, '--out', join(OUT_DIR, 'empty-receipt.json'), '--json'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }
  );
  assertEq(emptyResult.status, 1, 'empty projection source exits 1');
  assertOk(
    emptyResult.stderr.includes('No object declarations'),
    'empty projection error is explicit'
  );
} finally {
  rmSync(OUT_DIR, { recursive: true, force: true });
}

if (testsFailed > 0) {
  console.error(`FAIL ${testsFailed}/${testsRun} assertions failed`);
  process.exit(1);
}

console.log(`PASS ${testsRun} assertions`);

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  ok - ${name}`);
  } else {
    testsFailed += 1;
    console.error(
      `  not ok - ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertOk(value, name) {
  testsRun += 1;
  if (value) {
    console.log(`  ok - ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  not ok - ${name}`);
  }
}
