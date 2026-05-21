#!/usr/bin/env node
/**
 * Pure Node tests for scripts/format-stress-segmented-capture.mjs.
 *
 * Run via: `node scripts/__tests__/format-stress-segmented-capture.test.mjs`.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderLiveSegmentSceneSource,
  renderSegmentReplayStill,
  runSegmentedCapture,
  summarizeVisualEvidence,
} from '../format-stress-segmented-capture.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const BASE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

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

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
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
  assertOk(existsSync(join(outDir, 'segment-replay-inputs.json')), 'replay inputs exist');
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

  console.log('Test 4: replay still renderer emits distinct segment payloads');
  const sceneSnapshot = {
    schema: 'format-stress-headless-scene-snapshot-v1',
    source: 'test',
    objectCount: 1,
    templateCount: 1,
    objects: [
      {
        id: 'Rock',
        type: 'object',
        transform: { position: '[1, 2, 3]' },
      },
    ],
  };
  const firstReplay = renderSegmentReplayStill({
    segment: segments[1],
    index: 1,
    total: segments.length,
    sceneSnapshot,
    width: 320,
    height: 180,
  });
  const secondReplay = renderSegmentReplayStill({
    segment: segments[7],
    index: 7,
    total: segments.length,
    sceneSnapshot,
    width: 320,
    height: 180,
  });
  assertOk(
    firstReplay.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'first replay is png'
  );
  assertOk(secondReplay.length > firstReplay.length * 0.7, 'second replay has image payload');
  assertOk(sha256(firstReplay) !== sha256(secondReplay), 'segment replay stills are distinct');

  console.log('Test 4b: world-model events alter replay pixels across dynamic segments');
  const worldModelReplay = {
    schema_version: 'world-model-replay-v1',
    scene: { id: 'humanoid-rock-throw-v1', sceneHash: 'test-hash' },
    result: {
      eventLogHash: 'event-hash',
      contactCount: 1,
      predicateViolationCount: 0,
      objects: [
        { id: 'avatar', center: { x: -3, y: 1.25, z: 0 } },
        { id: 'right-hand', center: { x: -2.72, y: 1.22, z: 0.16 } },
        { id: 'rock', center: { x: -2.35, y: 0.22, z: 0.12 } },
        { id: 'target', center: { x: 2.55, y: 0.85, z: 0 } },
      ],
      events: [
        {
          type: 'avatar_approached',
          payload: {
            from: { x: -3, y: 1.25, z: 0 },
            to: { x: -2.35, y: 1.25, z: 0 },
          },
        },
        {
          type: 'hand_reached',
          payload: { handPosition: { x: -2.35, y: 0.9, z: 0.12 }, clearanceM: 0.03 },
        },
        {
          type: 'grab_constraint_attached',
          payload: { constraint: 'hand-rock-fixed' },
        },
        {
          type: 'lift_pose',
          payload: { rockPosition: { x: -2.15, y: 1.2, z: 0.12 } },
        },
        {
          type: 'windup_pose',
          payload: { shoulderYawDeg: -38, rockPosition: { x: -1.45, y: 1.55, z: 0.08 } },
        },
        {
          type: 'release',
          payload: {
            releasePosition: { x: -0.95, y: 1.62, z: 0.02 },
            releaseVelocity: { x: 5.2, y: 3.4, z: 0 },
          },
        },
        {
          type: 'ballistic_sample',
          payload: { rockPosition: { x: -0.014, y: 2.073078, z: 0.02 } },
        },
        {
          type: 'ballistic_sample',
          payload: { rockPosition: { x: 0.922, y: 2.208312, z: 0.02 } },
        },
        {
          type: 'target_contact',
          payload: { rockPosition: { x: 2.55, y: 0.85, z: 0 }, impulseNs: 8.6 },
        },
        {
          type: 'aftermath',
          payload: { observedImpact: true, provenancePanel: true },
        },
      ],
    },
    trajectory: { id: 'trajectory-test', status: 'open' },
  };
  const kinematicReach = renderSegmentReplayStill({
    segment: { id: '02_hand_reaches', title: 'Reach', expectedStill: '02_hand_reaches.png' },
    index: 2,
    total: 10,
    sceneSnapshot,
    width: 320,
    height: 180,
  });
  const worldModelReach = renderSegmentReplayStill({
    segment: { id: '02_hand_reaches', title: 'Reach', expectedStill: '02_hand_reaches.png' },
    index: 2,
    total: 10,
    sceneSnapshot,
    worldModelReplay,
    width: 320,
    height: 180,
  });
  const kinematicImpact = renderSegmentReplayStill({
    segment: { id: '08_impact', title: 'Impact', expectedStill: '08_impact.png' },
    index: 8,
    total: 10,
    sceneSnapshot,
    width: 320,
    height: 180,
  });
  const worldModelImpact = renderSegmentReplayStill({
    segment: { id: '08_impact', title: 'Impact', expectedStill: '08_impact.png' },
    index: 8,
    total: 10,
    sceneSnapshot,
    worldModelReplay,
    width: 320,
    height: 180,
  });
  assertOk(
    sha256(kinematicReach) !== sha256(worldModelReach),
    'world-model reach payload changes still pixels'
  );
  assertOk(
    sha256(kinematicImpact) !== sha256(worldModelImpact),
    'world-model impact payload changes still pixels'
  );

  console.log('Test 4c: live segment scene source carries pose, camera, and provenance');
  const liveScene = renderLiveSegmentSceneSource({
    segment: { id: '06_release', title: 'Release Frame', expectedStill: '06_release.png' },
    index: 6,
    total: 10,
    sceneSnapshot,
    worldModelReplay,
  });
  assertOk(liveScene.includes('composition "Live Segment 06_release Release Frame"'), 'live scene names segment');
  assertOk(liveScene.includes('object "ThrowRock"'), 'live scene includes rock transform object');
  assertOk(liveScene.includes('released rock transform'), 'live scene labels released rock');
  assertOk(liveScene.includes('object "ProvenancePanel"'), 'live scene includes provenance panel');
  assertOk(liveScene.includes('camera perspective'), 'live scene includes camera pose');

  console.log('Test 5: base still plus replay mode clears duplicate-still false green');
  const replayOutDir = join(tmp, 'out-replay');
  const baseStillPath = join(tmp, 'base-still.png');
  writeFileSync(baseStillPath, BASE_PNG);
  const replayReceipt = await runSegmentedCapture({
    manifest: manifestPath,
    out: replayOutDir,
    dryRun: true,
    skipHeadless: true,
    baseStill: baseStillPath,
  });

  assertEq(replayReceipt.coverage.segmentsWithStill, 10, 'replay mode emits all stills');
  assertEq(
    replayReceipt.coverage.qualityAdjustedSegmentsWithStill,
    10,
    'distinct replay stills count as visual evidence'
  );
  assertEq(replayReceipt.coverage.staticCopySegments, 0, 'replay mode avoids static copies');
  assertEq(replayReceipt.coverage.placeholderStillSegments, 0, 'replay mode avoids placeholders');
  assertEq(
    replayReceipt.coverage.dynamicReplayBlockedSegments,
    0,
    'replay mode unblocks dynamic segments'
  );
  assertEq(replayReceipt.coverage.falseGreenRisk, 'none-detected', 'replay hashes are unique');
  assertEq(
    replayReceipt.visualEvidence.replayDistinctSegmentIds.includes('07_segment'),
    true,
    'visual audit records distinct replay segment ids'
  );
  assertEq(
    replayReceipt.segments[1].stillMode,
    'segment-replay-kinematic',
    'dynamic segment uses replay still mode'
  );
  assertEq(
    replayReceipt.segments[1].oracle.status,
    'segment-replay-receipt',
    'dynamic segment oracle records replay receipt'
  );
  assertOk(
    existsSync(join(replayOutDir, 'segment-replay-inputs.json')),
    'replay input payload file exists'
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} assertions failed`);
  process.exit(1);
}

console.log(`\n${testsRun} assertions passed`);
