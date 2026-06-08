#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holoshell-fiducial-board.mjs.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECEIPT_VERSION, selfTest, validateReceipt } from '../holoshell-fiducial-board.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-fiducial-board.mjs');

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
    console.error(
      `  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

console.log('Test 1: self-test emits deterministic fiducial board receipt');
const receipt = await selfTest();
assertEq(receipt.schemaVersion, RECEIPT_VERSION, 'schema version');
assertEq(receipt.status, 'pass', 'pass status');
assertEq(validateReceipt(receipt).length, 0, 'receipt validates');
assertEq(receipt.target.profile, 'fiducial-board', 'target profile recorded');
assertEq(receipt.target.markers.length, 9, 'nine marker descriptors recorded');
assertOk(
  receipt.target.markers.every((marker) => marker.payload.length === 25),
  'marker payloads are 5x5'
);
assertEq(receipt.target.compatibility.opencvAruco, false, 'OpenCV ArUco compatibility is honest');
assertEq(receipt.target.compatibility.aprilTag, false, 'AprilTag compatibility is honest');
assertOk(receipt.target.pngHash.startsWith('sha256:'), 'target PNG hash recorded');
assertOk(existsSync(resolve(REPO_ROOT, receipt.target.pngPath)), 'target PNG exists');
assertOk(receipt.chain?.receipt?.hash?.startsWith('sha256:'), 'chain hash recorded');

console.log('Test 2: generated board PNG has a valid PNG signature');
const png = readFileSync(resolve(REPO_ROOT, receipt.target.pngPath));
assertEq(png[0], 0x89, 'PNG signature byte 0');
assertEq(png[1], 0x50, 'PNG signature byte 1');
assertEq(png[2], 0x4e, 'PNG signature byte 2');
assertEq(png[3], 0x47, 'PNG signature byte 3');

console.log('Test 3: invalid receipts fail closed');
const missingMarkers = {
  ...receipt,
  target: {
    ...receipt.target,
    markers: [],
  },
};
assertOk(
  validateReceipt(missingMarkers).includes('marker metadata missing'),
  'markers are required'
);

console.log('Test 4: CLI self-test runs without touching hardware');
const cli = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(cli.status, 0, 'CLI self-test exits 0');
assertOk(cli.stdout.includes('self-test PASS'), 'CLI self-test names pass');

console.log('Test 5: CLI help explains compatibility scope');
const help = spawnSync(process.execPath, [SCRIPT, '--help'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(help.status, 0, 'CLI help exits 0');
assertOk(help.stdout.includes('Fiducial Board'), 'help names board');
assertOk(help.stdout.includes('not OpenCV ArUco/AprilTag compatible'), 'help states honest scope');

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
