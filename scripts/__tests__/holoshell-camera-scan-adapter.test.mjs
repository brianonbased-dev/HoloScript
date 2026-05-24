#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holoshell-camera-scan-adapter.mjs.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECEIPT_VERSION,
  selfTest,
  validateReceipt,
} from '../holoshell-camera-scan-adapter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-camera-scan-adapter.mjs');

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

console.log('Test 1: blocked camera receipts validate and carry permission next action');
const blocked = await selfTest();
assertEq(blocked.schemaVersion, RECEIPT_VERSION, 'schema version');
assertEq(blocked.status, 'blocked', 'blocked status');
assertEq(validateReceipt(blocked).length, 0, 'blocked receipt validates');
assertOk(blocked.permissionGate.nextAction.includes('Windows Settings'), 'blocked receipt names OS permission gate');
assertOk(!JSON.stringify(blocked).includes('device-id'), 'raw device id is absent');

console.log('Test 2: pass receipts require HoloMap replay identity');
const pass = {
  ...blocked,
  status: 'pass',
  blockedReason: undefined,
  permissionGate: undefined,
  capture: {
    requestedFrameCount: 2,
    capturedFrameCount: 2,
    acceptedFrameCount: 2,
    intervalMs: 250,
    videoHash: 'holoshell-native-camera:' + 'b'.repeat(64),
  },
  frame: {
    rgbHash: 'sha256:' + 'a'.repeat(64),
  },
  frames: [
    { index: 0, rgbHash: 'sha256:' + 'a'.repeat(64) },
    { index: 1, rgbHash: 'sha256:' + 'b'.repeat(64) },
  ],
  holomap: {
    replayFingerprint: 'replay',
    pointCount: 32,
    assets: {
      ply: '.bench-logs/holoshell-camera-scan/test/scan.ply',
      hologramBridge: '.bench-logs/holoshell-camera-scan/test/scan.hologram-bridge.json',
    },
  },
  hologramBridge: {
    status: 'geometry-ready',
    artifactPath: '.bench-logs/holoshell-camera-scan/test/scan.hologram-bridge.json',
  },
};
assertEq(validateReceipt(pass).length, 0, 'minimal pass receipt validates');

console.log('Test 3: CLI self-test runs without touching hardware');
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
