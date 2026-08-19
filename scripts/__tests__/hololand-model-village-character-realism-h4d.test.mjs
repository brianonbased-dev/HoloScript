import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildReactiveMask,
  deriveH4DHarnessSource,
  validateH4DBrowserState,
} from '../check-hololand-model-village-character-realism-h4d.mjs';
import { deriveH4AHarnessSource } from '../check-hololand-model-village-character-appearance-h4a.mjs';
import { deriveH3YHarnessSource } from '../check-hololand-model-village-character-appearance-h3y.mjs';
import { deriveH3ZHarnessSource } from '../check-hololand-model-village-character-appearance-h3z.mjs';
import { deriveH4BHarnessSource } from '../check-hololand-model-village-character-realism-h4b.mjs';
import { deriveH4CHarnessSource } from '../check-hololand-model-village-character-realism-h4c.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4d-production-temporal-convergence.holo';

test('H4D source authors temporal accumulation for the named model families', () => {
  const source = readFileSync(path.join(ROOT, SOURCE_REL), 'utf8');
  for (const resident of ['OpenAI', 'Claude', 'Gemini', 'Grok']) {
    assert.match(source, new RegExp(`displayLabel: "${resident}"`));
  }
  assert.equal((source.match(/@temporal_accumulation\(/g) || []).length, 4);
  assert.match(source, /motionVectorSpace: "current_minus_previous_pixels"/);
  assert.match(source, /depthDisocclusionRequired: true/);
  assert.match(source, /reactiveMaskRequired: true/);
  assert.match(source, /readbackBackedVerification: true/);
  assert.match(source, /zeroCopyFrameGraphMeasured: false/);
  assert.match(source, /gpuTimestampMeasured: false/);
});

test('H4D harness exposes H4C compiled resident payloads without changing source custody', () => {
  const base = readFileSync(
    path.join(ROOT, 'scripts/check-hololand-model-village-character-appearance-h3x.mjs'),
    'utf8'
  );
  const h4c = deriveH4CHarnessSource(
    deriveH4BHarnessSource(
      deriveH4AHarnessSource(deriveH3ZHarnessSource(deriveH3YHarnessSource(base)))
    ),
    0.84
  );
  const h4d = deriveH4DHarnessSource(h4c);
  assert.match(h4d, /export async function buildCompiledPayload/);
  assert.match(h4d, /model-village-character-realism-h4c-native-gaze-breathing\.holo/);
  assert.doesNotMatch(h4d, /export export async function/);
});

test('H4D reactive mask is deterministic and bounded by pixel motion', () => {
  const mask = buildReactiveMask({
    width: 2,
    height: 2,
    data: new Float32Array([0, 0, 2, 0, 0, 9, 20, 20]),
  });
  assert.deepEqual(
    Array.from(mask, (value) => Number(value.toFixed(3))),
    [0, 0.125, 0.35, 0.35]
  );
});

test('H4D browser admission fails closed when temporal inputs are not consumed', () => {
  const resident = {
    displayLabel: 'OpenAI',
    rasterReceipt: {
      deviceExecutionMeasured: true,
      movingPixelCount: 32,
      motionVectorSpace: 'current-minus-previous-pixels',
      gpuTimestampMeasured: false,
    },
    temporalReceipt: {
      deviceExecutionMeasured: true,
      motionVectorsConsumed: true,
      neighborhoodClamping: true,
      disocclusionInputConsumed: true,
      reactiveMaskConsumed: true,
      gpuTimestampMeasured: false,
    },
    controllerReceipt: { motionVectorResidentFramesAdmitted: 1 },
    resolvedDifference: { changedPixelCount: 16 },
  };
  const state = {
    status: 'pass',
    gpu: { navigatorGpu: true, adapterAcquired: true, deviceCreated: true },
    residents: ['OpenAI', 'Claude', 'Gemini', 'Grok'].map((displayLabel) => ({
      ...structuredClone(resident),
      displayLabel,
    })),
  };
  assert.equal(validateH4DBrowserState(state).status, 'pass');
  state.residents[0].temporalReceipt.motionVectorsConsumed = false;
  assert.equal(validateH4DBrowserState(state).status, 'fail');
});

test('H4D typed policy and flat seed preserve the performance boundary', () => {
  const policy = readFileSync(
    path.join(
      ROOT,
      'source/proofs/model-village-character-realism-h4d-production-temporal-convergence-policy.hsplus'
    ),
    'utf8'
  );
  const seed = readFileSync(
    path.join(
      ROOT,
      'source/proofs/model-village-character-realism-h4d-production-temporal-convergence-seed.hs'
    ),
    'utf8'
  );
  assert.match(policy, /nativeHsplusActionExecutionClaimed: false/);
  assert.match(policy, /motion_reprojection_missing/);
  assert.match(policy, /history_rejection_missing/);
  assert.match(policy, /performance_boundary_overclaimed/);
  assert.match(seed, /productionTemporalEntrypointsIntegrated: true/);
  assert.match(seed, /readbackBackedVerification: true/);
  assert.match(seed, /zeroCopyFrameGraphMeasured: false/);
  assert.match(seed, /freshRtxBenchmarkClaimed: false/);
});
