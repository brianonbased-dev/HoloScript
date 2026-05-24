#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holoshell-geometric-control-target.mjs.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECEIPT_VERSION,
  selfTest,
  validateReceipt,
} from '../holoshell-geometric-control-target.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-geometric-control-target.mjs');

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

console.log('Test 1: self-test emits deterministic geometric target receipt');
const receipt = await selfTest();
assertEq(receipt.schemaVersion, RECEIPT_VERSION, 'schema version');
assertEq(receipt.status, 'pass', 'pass status');
assertEq(validateReceipt(receipt).length, 0, 'receipt validates');
assertOk(receipt.target.pngHash.startsWith('sha256:'), 'target PNG hash recorded');
assertOk(existsSync(resolve(REPO_ROOT, receipt.target.pngPath)), 'target PNG exists');
assertEq(receipt.target.width, 320, 'self-test width');
assertEq(receipt.target.height, 240, 'self-test height');
assertEq(receipt.target.fiducials.length, 4, 'four fiducials recorded');
assertEq(receipt.target.primitives.length, 5, 'five primitives recorded');
assertOk(receipt.target.primitives.some((primitive) => primitive.kind === 'circle'), 'circle primitive recorded');
assertOk(receipt.target.primitives.some((primitive) => primitive.kind === 'triangle'), 'triangle primitive recorded');
assertEq(receipt.chain?.receipt?.stageCount, 1, 'one generation stage');

console.log('Test 2: generated PNG has a valid PNG signature');
const png = readFileSync(resolve(REPO_ROOT, receipt.target.pngPath));
assertEq(png[0], 0x89, 'PNG signature byte 0');
assertEq(png[1], 0x50, 'PNG signature byte 1');
assertEq(png[2], 0x4e, 'PNG signature byte 2');
assertEq(png[3], 0x47, 'PNG signature byte 3');

console.log('Test 3: invalid target receipts fail closed');
const missingTarget = {
  ...receipt,
  target: {
    ...receipt.target,
    pngHash: undefined,
  },
};
assertOk(validateReceipt(missingTarget).includes('target PNG hash missing'), 'target PNG hash is required');

console.log('Test 4: CLI self-test runs without touching hardware');
const cli = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(cli.status, 0, 'CLI self-test exits 0');
assertOk(cli.stdout.includes('self-test PASS'), 'CLI self-test names pass');

console.log('Test 5: CLI help explains control target scope');
const help = spawnSync(process.execPath, [SCRIPT, '--help'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(help.status, 0, 'CLI help exits 0');
assertOk(help.stdout.includes('Geometric Control Target'), 'help names target');
assertOk(help.stdout.includes('not a camera capture'), 'help states honest scope');

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
