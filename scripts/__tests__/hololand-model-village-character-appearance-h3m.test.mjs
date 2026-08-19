import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  compileH3MBundles,
  parseH3MStack,
  runCharacterAppearanceH3M,
  validateH3MContract,
} from '../check-hololand-model-village-character-appearance-h3m.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const HOLOSCRIPT_ROOT = process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const TEST_OUTPUT = path.join(ROOT, '.tmp/hololand/model-village/character-appearance-h3m-test');

test('H3M parses all three HoloScript formats and binds four symbolic model families', async () => {
  const stack = await parseH3MStack(ROOT, HOLOSCRIPT_ROOT, TEST_OUTPUT);
  try {
    const validation = validateH3MContract(stack, ROOT, HOLOSCRIPT_ROOT);
    assert.equal(validation.status, 'pass', validation.errors.join('\n'));
    assert.equal(
      stack.contract.metadata.upstreamHoloScriptCommit,
      'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2'
    );
    assert.deepEqual(
      validation.plan.residents.map((resident) => resident.displayLabel),
      ['OpenAI', 'Claude', 'Gemini', 'Grok']
    );
    const manifest = new stack.toolchain.HoloCompositionParser().parse(
      readFileSync(
        path.join(
          ROOT,
          'source/layers/vr/frontier/model-village/model-village-character-appearance-h3m-anatomical-hands-manifest.holo'
        ),
        'utf8'
      )
    );
    assert.equal(manifest.success, true, JSON.stringify(manifest.errors));
    assert.deepEqual(manifest.errors, []);
  } finally {
    stack.esbuild.stop?.();
  }
});

test('H3M compiles 40 articulated digit receipts through the native character target', async () => {
  const stack = await parseH3MStack(ROOT, HOLOSCRIPT_ROOT, TEST_OUTPUT);
  try {
    const validation = validateH3MContract(stack, ROOT, HOLOSCRIPT_ROOT);
    assert.equal(validation.status, 'pass', validation.errors.join('\n'));
    const compiled = await compileH3MBundles(stack, validation.plan);
    assert.equal(compiled.records.length, 4);
    for (const record of compiled.records) {
      assert.equal(record.bundle.anatomy.upperBody.profile, 'anatomical-shoulder-neck-torso-v2');
      assert.equal(record.bundle.anatomy.upperBody.upperLimbs.length, 2);
      assert.equal(record.digitTopology.length, 10);
      assert.ok(record.digitTopology.every((digit) => digit.connectedVertexCount === 41));
      assert.ok(record.digitTopology.every((digit) => digit.uniqueJointCount >= 3));
      assert.ok(record.digitTopology.every((digit) => digit.palmAttachmentMeters <= 0.04));
      assert.equal(record.comparisons.strippedAnatomy.geometryChanged, true);
    }
  } finally {
    stack.esbuild.stop?.();
  }
});

test('H3M proves pose-safe tailoring for all 12 resident and pose pairs', async () => {
  const { receipt } = await runCharacterAppearanceH3M({
    root: ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
    outputDir: TEST_OUTPUT,
    requireManifest: false,
  });
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.admission.nativeBundleCount, 4);
  assert.equal(receipt.admission.digitReceiptCount, 40);
  assert.equal(receipt.admission.connectedSurfaceCount, 48);
  assert.equal(receipt.admission.poseClearanceReceiptCount, 12);
  assert.equal(receipt.admission.triangleIntersectionCount, 0);
  assert.ok(receipt.admission.minimumClearanceMeters >= 0.015);
  assert.ok(receipt.admission.minimumCoveredRayRatio >= 0.95);
  assert.ok(receipt.admission.minimumDigitUniqueJointCount >= 3);
  assert.ok(receipt.admission.maximumDigitPalmAttachmentMeters <= 0.04);
});

test('H3M fails closed on profile, topology, and capability-claim drift', async () => {
  const stack = await parseH3MStack(ROOT, HOLOSCRIPT_ROOT, TEST_OUTPUT);
  try {
    stack.contract.state.anatomyFoundation.limbProfile = 'provider-hands-v9';
    stack.contract.state.anatomyFoundation.connectedSurfaceCountPerLimb = 1;
    stack.contract.state.palmToDigitSharedTopologyClaimed = true;
    stack.contract.state.freshRtxBenchmarkClaimed = true;
    stack.contract.state.nativeWebgpuTaaClaimed = true;
    stack.contract.state.photorealismClaimed = true;
    const validation = validateH3MContract(stack, ROOT, HOLOSCRIPT_ROOT);
    assert.equal(validation.status, 'fail');
    const errors = validation.errors.join('\n');
    assert.match(errors, /anatomy foundation drifted/);
    assert.match(errors, /palmToDigitSharedTopologyClaimed/);
    assert.match(errors, /freshRtxBenchmarkClaimed/);
    assert.match(errors, /nativeWebgpuTaaClaimed/);
    assert.match(errors, /photorealismClaimed/);
  } finally {
    stack.esbuild.stop?.();
  }
});
