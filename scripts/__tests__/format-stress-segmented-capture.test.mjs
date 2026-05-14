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
import {
  runSegmentedCapture,
  summarizeVisualEvidence,
} from '../format-stress-segmented-capture.mjs';

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
    console.error(
      `  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
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
  writeFileSync(
    join(experimentDir, 'stage.holo'),
    `composition "Stage" {
  template "RockTemplate" {
    @grabbable
    geometry: "sphere"
    color: "#777777"
  }

  object "Rock" using "RockTemplate" {
    position: [1, 2, 3]
    scale: [1, 1, 1]
  }
}`
  );
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
  assertEq(
    receipt.coverage.qualityAdjustedSegmentsWithStill,
    0,
    'placeholder stills do not count as replay evidence'
  );
  assertEq(receipt.coverage.uniqueStillHashes, 1, 'placeholder stills collapse to one hash');
  assertEq(
    receipt.coverage.placeholderStillSegments,
    10,
    'dry-run stills are labeled placeholders'
  );
  assertEq(receipt.coverage.dynamicReplayBlockedSegments, 9, 'dynamic segments remain blocked');
  assertEq(
    receipt.coverage.falseGreenRisk,
    'all-stills-byte-identical',
    'duplicate stills are flagged'
  );
  assertEq(receipt.coverage.segmentsWithRuntimeEventLog, 10, 'all segments have event logs');
  assertEq(receipt.coverage.segmentsWithPosePhysicsJson, 10, 'all segments have pose/physics');
  assertEq(receipt.coverage.segmentsWithTiming, 10, 'all segments have timing');
  assertEq(receipt.coverage.headlessRuntimeSceneObjects, 1, 'headless scene object count');
  assertEq(receipt.coverage.headlessRuntimeTemplates, 1, 'headless scene template count');
  assertEq(
    receipt.coverage.segmentsWithHeadlessSceneObjects,
    10,
    'all segments link headless scene objects'
  );

  console.log('Test 2: artifacts exist and point at owning surfaces');
  assertOk(existsSync(join(outDir, 'segment-receipts.json')), 'segment receipt file exists');
  assertOk(existsSync(join(outDir, 'scorecard.json')), 'scorecard exists');
  assertOk(existsSync(join(outDir, 'still-evidence.json')), 'still evidence exists');
  assertOk(
    existsSync(join(outDir, 'visual-uniqueness-audit.json')),
    'visual uniqueness audit exists'
  );
  assertOk(existsSync(join(outDir, 'task-seeds.json')), 'task seeds exist');

  const written = JSON.parse(readFileSync(join(outDir, 'segment-receipts.json'), 'utf8'));
  assertEq(written.segments.length, 10, 'written segment count');
  assertEq(written.headlessScene.objectCount, 1, 'written headless scene object count');
  assertOk(
    written.segments.every((segment) => segment.still),
    'every segment has still path'
  );
  assertOk(
    written.segments.every((segment) => segment.oracle.owningSurface),
    'every segment names owning surface'
  );
  assertEq(
    written.segments[0].runtimeScene.objectCount,
    1,
    'segment receipt names runtime object count'
  );
  assertEq(written.segments[0].runtimeScene.status, 'instantiated', 'segment receipt scene status');

  const firstEventPath = join(outDir, written.segments[0].eventLog);
  const firstEvent = JSON.parse(readFileSync(firstEventPath, 'utf8'));
  assertEq(firstEvent.runtimeScene.objectCount, 1, 'event log names runtime object count');

  const firstPosePath = join(outDir, written.segments[0].posePhysicsJson);
  const firstPose = JSON.parse(readFileSync(firstPosePath, 'utf8'));
  assertEq(firstPose.mode, 'kinematic-placeholder', 'pose receipt declares placeholder mode');
  assertEq(firstPose.sceneObjectCount, 1, 'pose receipt links runtime scene object count');

  const visualAudit = JSON.parse(
    readFileSync(join(outDir, 'visual-uniqueness-audit.json'), 'utf8')
  );
  assertEq(
    visualAudit.falseGreenRisk,
    'all-stills-byte-identical',
    'visual audit flags false green coverage'
  );
  assertEq(
    visualAudit.visualCoverageStatus,
    'blocked-placeholder',
    'visual audit labels placeholder coverage blocked'
  );

  console.log('Test 3: static-copy stills do not count as distinct visual replay evidence');
  const staticCopyAudit = summarizeVisualEvidence([
    {
      segment: '00_scene_loaded',
      exists: true,
      sha256: 'same-hash',
      mode: 'captured-scene-loaded',
      oracleStatus: 'partial-pass',
    },
    {
      segment: '01_grab',
      exists: true,
      sha256: 'same-hash',
      mode: 'static-scene-copy',
      oracleStatus: 'blocked-dynamic-replay',
    },
    {
      segment: '02_replay',
      exists: true,
      sha256: 'unique-replay-hash',
      mode: 'segment-replay',
      oracleStatus: 'partial-pass',
    },
  ]);
  assertEq(
    staticCopyAudit.replayCandidateSegments,
    2,
    'base still and replay still are replay candidates'
  );
  assertEq(staticCopyAudit.replayDistinctSegments, 1, 'only unique replay hash counts');
  assertEq(
    staticCopyAudit.capturedReplaySegments,
    1,
    'quality gate counts unique replay evidence only'
  );
  assertEq(
    staticCopyAudit.staticCopyCoverageBlocked,
    true,
    'static-copy coverage is explicitly blocked'
  );
  assertEq(
    staticCopyAudit.falseGreenRisk,
    'duplicate-still-hashes',
    'duplicate static copy is flagged'
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} assertions failed`);
  process.exit(1);
}

console.log(`\n${testsRun} assertions passed`);
