#!/usr/bin/env node
/**
 * Pure Node tests for scripts/format-stress-segmented-capture.mjs.
 *
 * Run via: `node scripts/__tests__/format-stress-segmented-capture.test.mjs`.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSegmentedCapture } from '../format-stress-segmented-capture.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

let testsRun = 0;
let testsFailed = 0;

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertOk(value, name) {
  testsRun += 1;
  if (value) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

const tmp = mkdtempSync(join(tmpdir(), 'format-stress-segmented-'));
try {
  const experimentDir = join(tmp, 'experiment');
  const outDir = join(tmp, 'out');
  mkdirSync(experimentDir, { recursive: true });
  writeFileSync(join(experimentDir, 'stage.holo'), 'composition "Stage" {}');
  writeFileSync(join(experimentDir, 'behavior.hsplus'), 'composition "Behavior" {}');
  writeFileSync(join(experimentDir, 'pipeline.hs'), 'pipeline "Pipeline" {}');

  const segments = Array.from({ length: 10 }, (_, index) => ({
    id: `${String(index).padStart(2, '0')}_segment`,
    title: `Segment ${index}`,
    expectedStill: `${String(index).padStart(2, '0')}_segment.png`,
    checks: ['receipt_exists'],
  }));

  const manifestPath = join(experimentDir, 'manifest.json');
  writeJson(manifestPath, {
    schema: 'format-realism-gauntlet-v1',
    flagship: 'test-gauntlet',
    formats: {
      stage: 'stage.holo',
      behavior: 'behavior.hsplus',
      pipeline: 'pipeline.hs',
    },
    artifactRoot: join(tmp, 'artifacts'),
    segments,
    qualityMetrics: ['segment_coverage'],
  });

  console.log('Test 1: dry-run emits full receipt set');
  const receipt = await runSegmentedCapture({
    manifest: manifestPath,
    out: outDir,
    dryRun: true,
    skipScreenshot: true,
    skipHeadless: true,
  });

  assertEq(receipt.schema, 'format-stress-segmented-capture-v1', 'schema');
  assertEq(receipt.coverage.segmentsRequested, 10, 'segments requested');
  assertEq(receipt.coverage.segmentsWithStill, 10, 'all segments have stills');
  assertEq(receipt.coverage.segmentsWithRuntimeEventLog, 10, 'all segments have event logs');
  assertEq(receipt.coverage.segmentsWithPosePhysicsJson, 10, 'all segments have pose/physics');
  assertEq(receipt.coverage.segmentsWithTiming, 10, 'all segments have timing');

  console.log('Test 2: artifacts exist and point at owning surfaces');
  assertOk(existsSync(join(outDir, 'segment-receipts.json')), 'segment receipt file exists');
  assertOk(existsSync(join(outDir, 'scorecard.json')), 'scorecard exists');
  assertOk(existsSync(join(outDir, 'task-seeds.json')), 'task seeds exist');

  const written = JSON.parse(readFileSync(join(outDir, 'segment-receipts.json'), 'utf8'));
  assertEq(written.segments.length, 10, 'written segment count');
  assertOk(written.segments.every((segment) => segment.still), 'every segment has still path');
  assertOk(
    written.segments.every((segment) => segment.oracle.owningSurface),
    'every segment names owning surface'
  );

  const firstPosePath = join(outDir, written.segments[0].posePhysicsJson);
  const firstPose = JSON.parse(readFileSync(firstPosePath, 'utf8'));
  assertEq(firstPose.mode, 'kinematic-placeholder', 'pose receipt declares placeholder mode');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} assertions failed`);
  process.exit(1);
}

console.log(`\n${testsRun} assertions passed`);
