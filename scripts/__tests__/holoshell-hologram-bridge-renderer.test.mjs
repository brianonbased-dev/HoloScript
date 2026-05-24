#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holoshell-hologram-bridge-renderer.mjs.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECEIPT_VERSION,
  selfTest,
  validateReceipt,
} from '../holoshell-hologram-bridge-renderer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-hologram-bridge-renderer.mjs');

let testsRun = 0;
let testsFailed = 0;

function assertOk(value, name) {
  testsRun += 1;
  if (value) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('Test 1: synthetic HoloMap bridge renders a quilt receipt');
const receipt = await selfTest();
assertEq(receipt.schemaVersion, RECEIPT_VERSION, 'schema version');
assertEq(receipt.status, 'pass', 'pass status');
assertEq(validateReceipt(receipt).length, 0, 'receipt validates');
assertOk(receipt.quilt.pngHash.startsWith('sha256:'), 'receipt names PNG hash');
assertEq(receipt.quilt.views, 4, 'self-test view count');
assertOk(receipt.quilt.path.includes(receipt.quilt.variant), 'quilt path includes render variant');
assertOk(receipt.quilt.style.exposure >= 1, 'receipt records exposure');
assertOk(receipt.quilt.style.pointRadius >= 1, 'receipt records point radius');

console.log('Test 2: CLI self-test runs without touching hardware');
const cli = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(cli.status, 0, 'CLI self-test exits 0');
assertOk(cli.stdout.includes('self-test PASS'), 'CLI self-test names pass');

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
