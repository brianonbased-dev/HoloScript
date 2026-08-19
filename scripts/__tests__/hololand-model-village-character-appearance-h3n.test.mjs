import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  compileH3NBundles,
  parseH3NStack,
  proveH3NTaaReference,
  runCharacterAppearanceH3N,
  validateH3NContract,
} from '../check-hololand-model-village-character-appearance-h3n.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const TEST_OUTPUT = path.join(ROOT, '.tmp/hololand/model-village/character-appearance-h3n-test');

test('H3N parses .holo, .hsplus, and .hs with four symbolic model families', async () => {
  const stack = await parseH3NStack(ROOT, HOLOSCRIPT_ROOT, TEST_OUTPUT);
  try {
    const validation = validateH3NContract(stack, ROOT, HOLOSCRIPT_ROOT);
    assert.equal(validation.status, 'pass', validation.errors.join('\n'));
    assert.equal(
      stack.contract.metadata.upstreamHoloScriptCommit,
      'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2'
    );
    assert.deepEqual(
      validation.plan.residents.map((resident) => resident.displayLabel),
      ['OpenAI', 'Claude', 'Gemini', 'Grok']
    );
    const manifestPath = path.join(
      ROOT,
      'source/layers/vr/frontier/model-village/model-village-character-appearance-h3n-hand-landmarks-taa-lod-manifest.holo'
    );
    if (readFileSync(manifestPath, 'utf8').length) {
      const manifest = new stack.toolchain.HoloCompositionParser().parse(
        readFileSync(manifestPath, 'utf8')
      );
      assert.equal(manifest.success, true, JSON.stringify(manifest.errors));
      assert.deepEqual(manifest.errors, []);
    }
  } finally {
    stack.esbuild.stop?.();
  }
});

test('H3N compiles connected landmark receipts and isolated nail material ranges', async () => {
  const stack = await parseH3NStack(ROOT, HOLOSCRIPT_ROOT, TEST_OUTPUT);
  try {
    const validation = validateH3NContract(stack, ROOT, HOLOSCRIPT_ROOT);
    assert.equal(validation.status, 'pass', validation.errors.join('\n'));
    const compiled = await compileH3NBundles(stack, validation.plan);
    assert.equal(compiled.records.length, 4);
    for (const record of compiled.records) {
      assert.equal(record.landmarkTopology.length, 36);
      assert.equal(record.nailMaterialGroupCount, 10);
      assert.equal(record.lodReceipts.length, 3);
      assert.ok(record.lodReceipts[0].vertexCount > record.lodReceipts[1].vertexCount);
      assert.ok(record.lodReceipts[1].vertexCount > record.lodReceipts[2].vertexCount);
      assert.equal(record.comparisons.strippedHandLandmarks.geometryChanged, true);
    }
  } finally {
    stack.esbuild.stop?.();
  }
});

test('H3N proves deterministic reference TAA convergence from HoloScript source', async () => {
  const stack = await parseH3NStack(ROOT, HOLOSCRIPT_ROOT, TEST_OUTPUT);
  try {
    const receipt = await proveH3NTaaReference(stack, HOLOSCRIPT_ROOT, TEST_OUTPUT);
    assert.equal(receipt.sampleCount, 16);
    assert.equal(receipt.repeatedRunByteIdentity, true);
    assert.equal(receipt.nativeSceneTaaClaimed, false);
    assert.ok(receipt.historyProbeVarianceLast8 < receipt.currentProbeVarianceLast8);
    assert.ok(receipt.finalHistoryRmseToSampleMean < receipt.meanCurrentFrameRmseToSampleMean);
  } finally {
    stack.esbuild.stop?.();
  }
});

test('H3N preserves the inherited 12-pose clearance admission', async () => {
  const { receipt } = await runCharacterAppearanceH3N({
    root: ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
    outputDir: TEST_OUTPUT,
    requireManifest: false,
  });
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.admission.handLandmarkReceiptCount, 144);
  assert.equal(receipt.admission.connectedSurfaceCount, 192);
  assert.equal(receipt.admission.nailMaterialGroupCount, 40);
  assert.equal(receipt.admission.lodReceiptCount, 12);
  assert.equal(receipt.admission.poseClearanceReceiptCount, 12);
  assert.equal(receipt.admission.triangleIntersectionCount, 0);
  assert.ok(receipt.admission.minimumClearanceMeters >= 0.015);
  assert.ok(receipt.admission.minimumCoveredRayRatio >= 0.95);
});

test('H3N fails closed on anatomy, LOD, and capability-claim drift', async () => {
  const stack = await parseH3NStack(ROOT, HOLOSCRIPT_ROOT, TEST_OUTPUT);
  try {
    stack.contract.state.handFoundation.landmarkCountPerHand = 1;
    stack.contract.state.qualityFoundation.lodLevels = [0];
    stack.contract.state.landmarkToHandSharedTopologyClaimed = true;
    stack.contract.state.freshRtxBenchmarkClaimed = true;
    stack.contract.state.nativeWebgpuTaaClaimed = true;
    stack.contract.state.photorealismClaimed = true;
    const validation = validateH3NContract(stack, ROOT, HOLOSCRIPT_ROOT);
    assert.equal(validation.status, 'fail');
    const errors = validation.errors.join('\n');
    assert.match(errors, /hand foundation drifted/);
    assert.match(errors, /quality foundation drifted/);
    assert.match(errors, /landmarkToHandSharedTopologyClaimed/);
    assert.match(errors, /freshRtxBenchmarkClaimed/);
    assert.match(errors, /nativeWebgpuTaaClaimed/);
    assert.match(errors, /photorealismClaimed/);
  } finally {
    stack.esbuild.stop?.();
  }
});
