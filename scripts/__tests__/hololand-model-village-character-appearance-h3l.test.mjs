import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  classifyFreshRtxReceipt,
  compileH3LBundles,
  parseH3LStack,
  validateH3LContract,
} from '../check-hololand-model-village-character-appearance-h3l.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';

test('H3L parses .holo, .hsplus, and .hs and binds the four symbolic model families', async () => {
  const stack = await parseH3LStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3LContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  assert.equal(
    stack.contract.metadata.upstreamHoloScriptCommit,
    'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2'
  );
  assert.deepEqual(
    validation.plan.residents.map((resident) => resident.displayLabel),
    ['OpenAI', 'Claude', 'Gemini', 'Grok']
  );
});

test('H3L compiles eight connected upper limbs and four tailored civic garments', async () => {
  const stack = await parseH3LStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3LContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const compiled = await compileH3LBundles(stack, validation.plan);
  assert.equal(compiled.records.length, 4);
  for (const record of compiled.records) {
    const limbs = record.bundle.anatomy.upperBody.upperLimbs;
    assert.deepEqual(
      limbs.map((limb) => limb.side),
      ['left', 'right']
    );
    assert.equal(record.upperLimbTopology.length, 2);
    for (const [index, limb] of limbs.entries()) {
      assert.deepEqual(
        {
          schemaVersion: limb.schemaVersion,
          profile: limb.profile,
          radialSegments: limb.radialSegments,
          ringCount: limb.ringCount,
          vertexCount: limb.vertexRange.vertexCount,
          indexCount: limb.indexRange.indexCount,
          connectedVertexCount: record.upperLimbTopology[index].connectedVertexCount,
        },
        {
          schemaVersion: 'holoscript.agent-avatar-upper-limb-geometry.v1',
          profile: 'coherent-arm-palm-v1',
          radialSegments: 24,
          ringCount: 8,
          vertexCount: 193,
          indexCount: 1080,
          connectedVertexCount: 193,
        }
      );
    }
    assert.equal(record.bundle.garment.collarProfile, 'tailored-open-v-collar-v1');
    assert.ok(record.bundle.garment.shoulderShellHalfWidth < 0.43);
    assert.ok(record.bundle.garment.sleeveRootRadius < 0.1);
    assert.ok(
      record.bundle.garment.sleeveWristRadius < record.bundle.garment.sleeveRootRadius
    );
    assert.equal(record.comparisons.strippedUpperBody.geometryChanged, true);
  }
});

test('H3L fresh RTX gate rejects install-state and hardware-readback-only evidence', () => {
  const blocked = classifyFreshRtxReceipt({
    installerProcessRunning: true,
    pendingDriverRestart: true,
    browserProbePassed: false,
    sceneCapturePassed: false,
    gpuName: 'NVIDIA GeForce RTX 3060 Laptop GPU',
    driverVersion: '610.88',
    measuredAt: '2026-07-28T20:30:00-07:00',
  });
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(blocked.blockers, [
    'driver-installer-not-proven-idle',
    'driver-restart-state-not-clear',
    'browser-webgpu-probe-not-passed',
    'current-scene-capture-not-passed',
  ]);
  assert.equal(blocked.historicalEvidenceCountsAsCurrent, false);
});

test('H3L fresh RTX gate only admits a stable post-install browser and scene receipt', () => {
  const admitted = classifyFreshRtxReceipt({
    installerProcessRunning: false,
    pendingDriverRestart: false,
    browserProbePassed: true,
    sceneCapturePassed: true,
    gpuName: 'NVIDIA GeForce RTX 3060 Laptop GPU',
    driverVersion: '610.88',
    measuredAt: '2026-07-28T21:00:00-07:00',
  });
  assert.deepEqual(admitted, {
    status: 'pass',
    blockers: [],
    historicalEvidenceCountsAsCurrent: false,
  });
});

test('H3L fails closed on topology, tailoring, and current-benchmark claim drift', async () => {
  const stack = await parseH3LStack(ROOT, HOLOSCRIPT_ROOT);
  stack.contract.state.upperLimbFoundation.profile = 'provider-arm-v9';
  stack.contract.state.tailoredGarmentFoundation.collarProfile = 'floating-cowl-v9';
  stack.contract.state.freshRtxBenchmarkClaimed = true;
  stack.contract.state.currentDriverInstallBenchmarkClaimed = true;
  stack.contract.state.historicalRtxEvidenceMayBeReusedAsCurrent = true;
  stack.contract.state.torsoToLimbSharedTopologyClaimed = true;
  const validation = validateH3LContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'fail');
  const errors = validation.errors.join('\n');
  assert.match(errors, /upper-limb foundation drifted/);
  assert.match(errors, /tailored-garment foundation drifted/);
  assert.match(errors, /freshRtxBenchmarkClaimed/);
  assert.match(errors, /currentDriverInstallBenchmarkClaimed/);
  assert.match(errors, /historicalRtxEvidenceMayBeReusedAsCurrent/);
  assert.match(errors, /torsoToLimbSharedTopologyClaimed/);
});
