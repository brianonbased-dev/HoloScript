#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holoshell-camera-scan-adapter.mjs.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECEIPT_VERSION,
  buildNativeTileCorrespondence,
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
    droppedFrameCount: 0,
    intervalMs: 250,
    effectiveFps: 4,
    expectedDurationMs: 250,
    videoHash: 'holoshell-native-camera:' + 'b'.repeat(64),
  },
  frame: {
    rgbHash: 'sha256:' + 'a'.repeat(64),
    quality: { status: 'pass', score: 0.8, warnings: [] },
  },
  frames: [
    { index: 0, rgbHash: 'sha256:' + 'a'.repeat(64), quality: { status: 'pass', score: 0.8, warnings: [] } },
    { index: 1, rgbHash: 'sha256:' + 'b'.repeat(64), quality: { status: 'pass', score: 0.9, warnings: [] } },
  ],
  scanQuality: {
    status: 'pass',
    averageScore: 0.85,
    warnings: [],
  },
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

console.log('Test 3: native tile-flow correspondence detects shifted low-res tiles');
function makeFrame(index, tiles) {
  const width = 4;
  const height = 4;
  const stride = 3;
  const rgb = new Uint8Array(width * height * stride);
  for (let ty = 0; ty < 2; ty += 1) {
    for (let tx = 0; tx < 2; tx += 1) {
      const color = tiles[ty * 2 + tx];
      for (let y = ty * 2; y < ty * 2 + 2; y += 1) {
        for (let x = tx * 2; x < tx * 2 + 2; x += 1) {
          const p = (y * width + x) * stride;
          rgb[p] = color[0];
          rgb[p + 1] = color[1];
          rgb[p + 2] = color[2];
        }
      }
    }
  }
  return { index, width, height, stride, rgb };
}

const correspondence = buildNativeTileCorrespondence({
  frames: [
    makeFrame(0, [
      [0, 0, 0],
      [255, 0, 0],
      [0, 0, 0],
      [0, 0, 255],
    ]),
    makeFrame(1, [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 255],
    ]),
  ],
  bridgeFrames: [
    { frameIndex: 0, pointOffset: 0, pointCount: 4 },
    { frameIndex: 1, pointOffset: 4, pointCount: 4 },
  ],
  pointsPerFrame: 4,
});
assertEq(correspondence?.method, 'native-tile-flow-v1', 'correspondence method');
assertEq(correspondence?.referenceFrameIndex, 1, 'latest frame is reference');
assertEq(correspondence?.frameMatches?.[0]?.shiftTiles?.[0], 1, 'horizontal tile shift detected');
assertEq(correspondence?.frameMatches?.[0]?.shiftTiles?.[1], 0, 'vertical tile shift stable');
assertOk((correspondence?.meanMatchScore ?? 0) > 0.5, 'shift score is load-bearing');

console.log('Test 4: CLI self-test runs without touching hardware');
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
