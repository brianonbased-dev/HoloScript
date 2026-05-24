#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holoshell-hologram-bridge-renderer.mjs.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECEIPT_VERSION,
  renderBridge,
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

console.log('Test 2: multi-frame bridges default to native tracked fusion');
const dir = mkdtempSync(join(tmpdir(), 'holoshell-hologram-bridge-renderer-test-'));
try {
  const plyPath = join(dir, 'scan.ply');
  const bridgePath = join(dir, 'scan.hologram-bridge.json');
  const outPath = join(dir, 'receipt.json');
  writeFileSync(
    plyPath,
    [
      'ply',
      'format ascii 1.0',
      'element vertex 8',
      'property float x',
      'property float y',
      'property float z',
      'property uchar red',
      'property uchar green',
      'property uchar blue',
      'property float confidence',
      'end_header',
      '-0.4 -0.4 0.1 255 0 0 0.7',
      '0.4 -0.4 0.1 255 0 0 0.7',
      '-0.4 0.4 0.1 255 0 0 0.7',
      '0.4 0.4 0.1 255 0 0 0.7',
      '-0.4 -0.4 0.2 0 255 0 0.9',
      '0.4 -0.4 0.2 0 255 0 0.9',
      '-0.4 0.4 0.2 0 255 0 0.9',
      '0.4 0.4 0.2 0 255 0 0.9',
    ].join('\n') + '\n',
    'utf8'
  );
  writeFileSync(
    bridgePath,
    `${JSON.stringify(
      {
        schemaVersion: 'hologram-bridge/holomap-pointcloud/v1',
        status: 'geometry-ready',
        source: {
          kind: 'holomap-pointcloud',
          replayFingerprint: 'temporal-test',
          pointCloudHash: 'sha256:test',
          pointCount: 8,
          frameCount: 2,
          tileGrid: 2,
          frameLayout: {
            pointOrder: 'frame-major-tile-row-major',
            pointsPerFrame: 4,
          },
          frames: [
            {
              frameIndex: 0,
              timestampMs: 0,
              pointOffset: 0,
              pointCount: 4,
              pose: { position: [0.1, 0, 0], rotation: [0, 0, 0, 1], confidence: 0.8 },
            },
            {
              frameIndex: 1,
              timestampMs: 200,
              pointOffset: 4,
              pointCount: 4,
              pose: { position: [0.4, 0, 0], rotation: [0, 0, 0, 1], confidence: 0.8 },
            },
          ],
          correspondence: {
            method: 'native-tile-flow-v1',
            pointOrder: 'reference-grid-with-shift-observations',
            gridSize: 2,
            referenceFrameIndex: 1,
            referencePointOffset: 4,
            searchRadiusTiles: 1,
            trackCount: 4,
            frameMatchCount: 2,
            meanMatchScore: 0.9,
            meanOverlapRatio: 1,
            frameMatches: [
              {
                frameIndex: 0,
                pointOffset: 0,
                shiftTiles: [0, 0],
                score: 0.9,
                overlapRatio: 1,
                matchedPointCount: 4,
              },
              {
                frameIndex: 1,
                pointOffset: 4,
                shiftTiles: [0, 0],
                score: 1,
                overlapRatio: 1,
                matchedPointCount: 4,
              },
            ],
          },
          bounds: { min: [-0.4, -0.4, 0.1], max: [0.4, 0.4, 0.2] },
          assets: { ply: plyPath },
        },
        targets: {
          quilt: { status: 'ready-for-render', views: 4, columns: 2, rows: 2, sourceAsset: 'ply' },
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  const temporalReceipt = await renderBridge({
    bridge: bridgePath,
    out: outPath,
    tileWidth: 32,
    tileHeight: 24,
  });
  assertEq(temporalReceipt.source.temporalMode, 'tracked', 'default temporal mode');
  assertEq(temporalReceipt.source.pointCount, 4, 'tracked fused point count');
  assertEq(temporalReceipt.source.originalPointCount, 8, 'original point count retained');
  assertEq(temporalReceipt.source.temporalSelection.fusedFrameCount, 2, 'both frames fused');
  assertEq(temporalReceipt.source.temporalSelection.referenceFrameIndex, 1, 'latest frame is alignment reference');
  assertEq(
    temporalReceipt.source.temporalSelection.alignmentMethod,
    'tile-flow-correspondence+pose-centroid-translation',
    'alignment method recorded'
  );
  assertEq(
    temporalReceipt.source.temporalSelection.correspondenceMethod,
    'native-tile-flow-v1',
    'correspondence method recorded'
  );
  assertEq(temporalReceipt.source.temporalSelection.trackedFrameCount, 2, 'tracked frame count recorded');
  const png = readFileSync(resolve(REPO_ROOT, temporalReceipt.quilt.path));
  assertOk(png[0] === 0x89 && png[1] === 0x50, 'temporal quilt is PNG');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

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
