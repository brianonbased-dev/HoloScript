import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveHoloScriptRoot } from '../lib/model-village-holoscript-root.mjs';

import {
  parseH3UStack,
  runCharacterAppearanceH3U,
  validateH3UContract,
} from '../check-hololand-model-village-character-appearance-h3u.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H3U.TEST',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h3u-temporal-convergence'],
});
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];

test('H3U parses all formats and pins browser/Quest claim boundaries', async () => {
  const stack = await parseH3UStack(ROOT, HOLOSCRIPT_ROOT);
  try {
    assert.equal(stack.h3uSource.success, true);
    assert.equal(stack.h3uPolicy.success, true);
    assert.equal(stack.h3uSeed.success, true);
    const validation = validateH3UContract(stack, ROOT, HOLOSCRIPT_ROOT);
    assert.deepEqual(validation.errors, []);
    assert.deepEqual(
      validation.plan.map((resident) => resident.displayLabel),
      EXPECTED_RESIDENTS
    );
    assert.equal(stack.h3uContract.state.browserWebgpuMeasured, true);
    assert.equal(stack.h3uContract.state.questHeadsetMeasured, false);
    assert.equal(stack.h3uContract.state.gpuTimestampFrameTimeClaimed, false);
  } finally {
    stack.esbuild.stop?.();
  }
});

test('H3U witnesses native Chrome WebGPU convergence and every history reset', async () => {
  const { receipt } = await runCharacterAppearanceH3U({
    root: ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
    skipManifest: true,
  });
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.compilerAdmission.residentCount, 4);
  assert.equal(receipt.browserWebgpuAdmission.gpu.navigatorGpu, true);
  assert.equal(receipt.browserWebgpuAdmission.gpu.adapterAcquired, true);
  assert.equal(receipt.browserWebgpuAdmission.gpu.deviceCreated, true);
  assert.deepEqual(
    receipt.browserWebgpuAdmission.residents.map((resident) => resident.displayLabel),
    EXPECTED_RESIDENTS
  );
  for (const compiler of receipt.compilerAdmission.records) {
    assert.ok(compiler.vertexReductionRatio > 0);
    assert.deepEqual(
      compiler.lods.map((lod) => lod.lodLevel),
      [0, 2]
    );
  }
  for (const resident of receipt.browserWebgpuAdmission.residents) {
    for (const profile of [resident.browserProfile, resident.questBudgetProfile]) {
      assert.deepEqual(
        profile.stages.map((stage) => stage.invalidationReason),
        ['initial', 'camera-motion', 'resident-motion', 'lod-change']
      );
      for (const stage of profile.stages) {
        assert.equal(stage.deviceExecutionMeasured, true);
        assert.equal(stage.historyDiscardPixelDelta, 0);
        assert.equal(stage.converged, true);
        assert.equal(stage.gpuTimestampMeasured, false);
      }
    }
    assert.equal(resident.browserProfile.config.sampleCount, 8);
    assert.equal(resident.questBudgetProfile.config.sampleCount, 4);
    assert.equal(
      resident.questBudgetProfile.executedOn,
      'same_browser_gpu_device_not_quest_headset'
    );
  }
  assert.equal(receipt.boundaries.browserWebgpuMeasured, true);
  assert.equal(receipt.boundaries.questHeadsetMeasured, false);
  assert.equal(receipt.boundaries.gpuTimestampMeasured, false);
  assert.equal(receipt.boundaries.freshRtxBenchmarkClaimed, false);
});
