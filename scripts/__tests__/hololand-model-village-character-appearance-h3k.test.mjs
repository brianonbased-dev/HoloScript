import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  compileH3KBundles,
  parseH3KStack,
  proveH3KPoseClearance,
  validateH3KContract,
} from '../check-hololand-model-village-character-appearance-h3k.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const OUTPUT_DIR = path.join(ROOT, '.tmp/hololand/model-village/character-appearance-h3k-test');

async function loadModules() {
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const workspaceRequire = createRequire(path.join(HOLOSCRIPT_ROOT, 'package.json'));
  const esbuild = await import(pathToFileURL(workspaceRequire.resolve('esbuild')).href);
  return { esbuild };
}

test('H3K parses all three formats and binds four named model-family residents', async () => {
  const stack = await parseH3KStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3KContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  assert.equal(
    stack.contract.metadata.upstreamHoloScriptCommit,
    'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2'
  );
  assert.deepEqual(
    validation.plan.residents.map((resident) => resident.displayLabel),
    ['OpenAI', 'Claude', 'Gemini', 'Grok']
  );
  assert.deepEqual(
    validation.plan.poses.map((pose) => pose.poseId),
    ['civic_rest', 'open_welcome', 'dialogue_reach']
  );
});

test('H3K compiles four exact coherent surfaces with stripped-profile causal deltas', async () => {
  const stack = await parseH3KStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3KContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const compiled = await compileH3KBundles(stack, validation.plan);
  assert.equal(compiled.records.length, 4);
  const expectedFitScales = new Map([
    ['OpenAI', { torsoScale: 0.96, shoulderScale: 1.1 }],
    ['Claude', { torsoScale: 0.95, shoulderScale: 1.08 }],
    ['Gemini', { torsoScale: 0.94, shoulderScale: 1.06 }],
    ['Grok', { torsoScale: 0.98, shoulderScale: 1.13 }],
  ]);
  for (const record of compiled.records) {
    const expectedFit = expectedFitScales.get(record.displayLabel);
    assert.ok(expectedFit);
    assert.deepEqual(
      {
        schemaVersion: record.bundle.anatomy.upperBody.schemaVersion,
        profile: record.bundle.anatomy.upperBody.profile,
        radialSegments: record.bundle.anatomy.upperBody.radialSegments,
        ringCount: record.bundle.anatomy.upperBody.ringCount,
        vertexCount: record.bundle.anatomy.upperBody.vertexRange.vertexCount,
        indexCount: record.bundle.anatomy.upperBody.indexRange.indexCount,
      },
      {
        schemaVersion: 'holoscript.agent-avatar-upper-body-geometry.v1',
        profile: 'coherent-shoulder-neck-torso-v1',
        radialSegments: 24,
        ringCount: 10,
        vertexCount: 240,
        indexCount: 1296,
      }
    );
    assert.equal(record.bundle.report.stubbed.length, 0);
    assert.deepEqual(
      {
        fitProfile: record.bundle.garment.fitProfile,
        torsoScale: record.bundle.garment.torsoScale,
        shoulderScale: record.bundle.garment.shoulderScale,
        tunicIndexRange: record.bundle.garment.tunicIndexRange,
      },
      {
        fitProfile: 'coherent-upper-body-clearance-v1',
        torsoScale: expectedFit.torsoScale,
        shoulderScale: expectedFit.shoulderScale,
        tunicIndexRange: { indexStart: 0, indexCount: 1008 },
      }
    );
    assert.equal(record.comparisons.strippedUpperBody.baselineReceiptAbsent, true);
    assert.equal(record.comparisons.strippedUpperBody.geometryChanged, true);
    assert.ok(Number.isInteger(record.comparisons.strippedUpperBody.vertexDelta));
    assert.match(record.geometrySha256, /^[0-9a-f]{64}$/);
    assert.match(record.repeatedCompileSha256, /^[0-9a-f]{64}$/);
  }
});

test('H3K proves zero intersections and garment occlusion across all twelve pose pairs', async () => {
  const stack = await parseH3KStack(ROOT, HOLOSCRIPT_ROOT);
  const validation = validateH3KContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'pass', validation.errors.join('\n'));
  const compiled = await compileH3KBundles(stack, validation.plan);
  const modules = await loadModules();
  const clearance = await proveH3KPoseClearance(
    compiled,
    validation.plan,
    HOLOSCRIPT_ROOT,
    OUTPUT_DIR,
    modules
  );
  assert.equal(clearance.receipts.length, 12);
  for (const receipt of clearance.receipts) {
    assert.equal(receipt.triangleIntersectionCount, 0);
    assert.ok(receipt.minimumClearanceMeters >= 0.015);
    assert.ok(receipt.coveredRayRatio >= 0.95);
  }
});

test('H3K fails closed on profile, wardrobe bridge, and realism claim drift', async () => {
  const stack = await parseH3KStack(ROOT, HOLOSCRIPT_ROOT);
  stack.contract.state.upperBodyFoundation.profile = 'provider-body-v9';
  stack.contract.state.presentationWardrobeBridgeUsed = true;
  stack.contract.state.presentationNativeTorsoClipUsed = true;
  stack.contract.state.externalSkinTextureUsed = true;
  stack.contract.state.externalHairTextureUsed = true;
  stack.contract.state.externalWardrobeTextureUsed = true;
  stack.contract.state.productionSkinTexturingClaimed = true;
  stack.contract.state.photorealismClaimed = true;
  stack.contract.state.nativeWebgpuTaaClaimed = true;
  stack.contract.state.questWebxrMeasured = true;
  const validation = validateH3KContract(stack, ROOT, HOLOSCRIPT_ROOT);
  assert.equal(validation.status, 'fail');
  const errors = validation.errors.join('\n');
  assert.match(errors, /upper-body foundation drifted/);
  assert.match(errors, /presentationWardrobeBridgeUsed/);
  assert.match(errors, /presentationNativeTorsoClipUsed/);
  assert.match(errors, /externalSkinTextureUsed/);
  assert.match(errors, /externalHairTextureUsed/);
  assert.match(errors, /externalWardrobeTextureUsed/);
  assert.match(errors, /productionSkinTexturingClaimed/);
  assert.match(errors, /photorealismClaimed/);
  assert.match(errors, /nativeWebgpuTaaClaimed/);
  assert.match(errors, /questWebxrMeasured/);
});
