#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const tempRoot = mkdtempSync(path.join(tmpdir(), 'holoshell-holomap-preview-'));
const framePath = path.join(tempRoot, 'native-depth-frame.json');
const replayPath = path.join(tempRoot, 'native-depth-holomap-replay.json');
const output = path.join(tempRoot, 'holomap-replay-preview.json');
const jsOutput = path.join(tempRoot, 'holomap-replay-preview.js');

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(
    result.status,
    0,
    `${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  return result.stdout;
}

writeFileSync(
  framePath,
  JSON.stringify({
    schemaVersion: 'holomap-android-arcore-depth-frame/v1',
    status: 'pass',
    deviceModel: 'SM-S918U',
    manufacturer: 'samsung',
    androidRelease: '16',
    androidSdk: 36,
    arcorePackage: 'com.google.ar.core',
    frameAttempts: 8,
    timestampNs: 987654321,
    sample: {
      width: 64,
      height: 48,
      rgb: [11, 12, 13, 14],
      depthMillimeters: [700, 701, 702],
      confidence: [1, 2, 3],
    },
    cameraImage: { width: 640, height: 480, format: 35 },
    depthImage16Bits: {
      width: 160,
      height: 90,
      format: 48,
      planePixelStride: 2,
      planeRowStride: 320,
    },
    intrinsics: {
      imageWidth: 640,
      imageHeight: 480,
      fx: 415.7,
      fy: 415.7,
      cx: 320.7,
      cy: 238.4,
      source: 'arcore-camera-image-intrinsics',
    },
    cameraTransformColumnMajor4x4: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.01, 0.02, 0.03, 1],
    hashes: {
      sampleRgbSha256: 'sha256:test-rgb',
      sampleDepthSha256: 'sha256:test-depth',
    },
    honestScope: 'Test frame receipt.',
  }),
  'utf8'
);

writeFileSync(
  replayPath,
  JSON.stringify({
    schemaVersion: 'holomap-android-arcore-depth-replay/v1',
    status: 'pass',
    sourceReceipt: framePath,
    bundle: {
      schemaVersion: 'holomap-mobile-sensor-bundle/v1',
      bundleId: 's23-arcore-depth-test',
      capture: {
        platform: 'android-arcore-depth',
        deviceModel: 'SM-S918U',
        coordinateSystem: 'arcore-right-handed-y-up',
        intrinsics: {
          width: 64,
          height: 48,
          fx: 41.57,
          fy: 41.57,
          cx: 32,
          cy: 24,
          source: 'test-scaled-intrinsics',
        },
      },
      frames: [
        {
          index: 0,
          timestampMs: 987654.321,
          width: 64,
          height: 48,
          stride: 3,
          rgb: [21, 22, 23, 24],
          depthMillimeters: [800, 801, 802],
          confidence: [9, 8, 7],
          cameraTransformColumnMajor4x4: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.01, 0.02, 0.03, 1],
        },
      ],
    },
    replay: {
      source: {
        bundleId: 's23-arcore-depth-test',
        platform: 'android-arcore-depth',
        frameCount: 1,
        meshAnchorCount: 0,
      },
      stepCount: 1,
      pointCount: 16,
      frameCount: 1,
      replayFingerprint: 'test-fingerprint',
    },
    honestScope: 'Test replay receipt.',
  }),
  'utf8'
);

runNode([
  'scripts/holoshell-holomap-replay-preview.mjs',
  '--self-test',
  '--output',
  path.join(tempRoot, 'self-test-preview.json'),
  '--js-output',
  path.join(tempRoot, 'self-test-preview.js'),
]);

runNode([
  'scripts/holoshell-holomap-replay-preview.mjs',
  '--frame',
  framePath,
  '--replay',
  replayPath,
  '--output',
  output,
  '--js-output',
  jsOutput,
]);

const preview = JSON.parse(readFileSync(output, 'utf8'));
const serialized = JSON.stringify(preview);

assert.equal(preview.schemaVersion, 'hololand.holoshell.holomap-replay-preview.v0.1.0');
assert.equal(preview.summary.status, 'pass');
assert.equal(preview.summary.deviceModel, 'SM-S918U');
assert.equal(preview.summary.bundleId, 's23-arcore-depth-test');
assert.equal(preview.summary.replayFingerprint, 'test-fingerprint');
assert.equal(preview.summary.pointCount, 16);
assert.equal(preview.summary.rawPixelsIncluded, false);
assert.equal(preview.summary.rawDepthIncluded, false);
assert.equal(preview.summary.productionGeospatialClaim, false);
assert.equal(preview.source.deviceClass, 'samsung-s23');
assert.equal(preview.preview.sourceMutation, false);
assert.equal(preview.runtimeOutcome.status, 'previewed');
assert.equal(preview.privacy.rawGpsIncluded, false);
assert.equal(preview.privacy.rawMediaIncluded, false);
assert.ok(preview.objects.some((object) => object.id === 'room.s23-holomap-preview'));
assert.ok(preview.objects.some((object) => object.id === 'device.s23-ultra'));
assert.ok(preview.objects.some((object) => object.objectKind === 'point_cloud_preview'));
assert.ok(preview.objects.some((object) => object.relationships?.fleetMember === true));
assert.ok(!serialized.includes('[11,12,13,14]'));
assert.ok(!serialized.includes('[21,22,23,24]'));
assert.ok(!serialized.includes('[800,801,802]'));
assert.ok(!serialized.includes('cameraTransformColumnMajor4x4'));
assert.match(readFileSync(jsOutput, 'utf8'), /HOLOSHELL_HOLOMAP_REPLAY_PREVIEW/);

console.log('PASS holoshell HoloMap replay preview projection');
