import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  computeTimingStatistics,
  validateH4GBrowserState,
} from '../check-hololand-model-village-character-realism-h4g.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4g-shared-character-world-frame.holo';
const RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];

function temporalReceipt(id) {
  return {
    id,
    temporalFrame: {
      historyConsumed: true,
      intermediateFrameReadbackCount: 0,
      evidenceFrameReadbackCount: 0,
      timestampMetadataReadbackCount: 0,
      motionDerivation: { movingVertexCount: 200 },
      resolve: { motionVectorsConsumed: true, disocclusionInputConsumed: true },
    },
  };
}

function admittedFrame(overrides = {}) {
  return {
    residentCount: 4,
    tileWidth: 512,
    tileHeight: 512,
    outputWidth: 1024,
    outputHeight: 1024,
    layout: 'two-by-two',
    fixedTopology: true,
    persistentGpuResources: true,
    residentReceiptsShareCommandBuffer: true,
    intermediateFrameReadbackCount: 0,
    evidenceFrameReadbackCount: 0,
    commandBufferCount: 1,
    queueSubmissionCount: 1,
    gpuTimestampMeasured: true,
    timedScope: 'four-character-color-motion-depth-temporal-through-composite-gpu-scope',
    composite: {
      inputTextureCount: 4,
      zeroCopyResidentTextureInputs: true,
      persistentPipeline: true,
      persistentBindGroup: true,
      persistentOutputTexture: true,
    },
    durations: {
      residents: RESIDENTS.map((id) => ({
        id,
        characterColorNanoseconds: 300000,
        motionDepthNanoseconds: 100000,
        temporalResolveNanoseconds: 100000,
        aggregateNanoseconds: 500000,
      })),
      compositeNanoseconds: 80000,
      aggregateNanoseconds: 2200000,
    },
    residents: RESIDENTS.map(temporalReceipt),
    ...overrides,
  };
}

function admittedState() {
  const sharedValues = Array.from({ length: 32 }, () => 2200000);
  const compositeValues = Array.from({ length: 32 }, () => 80000);
  const residentValues = Array.from({ length: 32 }, () => 500000);
  const residentStageTimingStatistics = Object.fromEntries(
    RESIDENTS.map((name) => [
      name,
      {
        characterColorNanoseconds: computeTimingStatistics(residentValues),
        motionDepthNanoseconds: computeTimingStatistics(residentValues),
        temporalResolveNanoseconds: computeTimingStatistics(residentValues),
        aggregateNanoseconds: computeTimingStatistics(residentValues),
      },
    ])
  );
  return {
    status: 'pass',
    gpu: {
      navigatorGpu: true,
      adapterAcquired: true,
      deviceCreated: true,
      timestampQuerySupported: true,
      timestampQueryEnabled: true,
    },
    residents: RESIDENTS.map((displayLabel) => ({ displayLabel })),
    warmupFrameCount: 4,
    measuredFrames: Array.from({ length: 32 }, () => admittedFrame()),
    finalEvidence: admittedFrame({ evidenceFrameReadbackCount: 1 }),
    outputDigest: 'a'.repeat(64),
    stageTimingStatistics: {
      compositeNanoseconds: computeTimingStatistics(compositeValues),
      aggregateNanoseconds: computeTimingStatistics(sharedValues),
    },
    residentStageTimingStatistics,
    boundaries: {
      boundedSharedCharacterCompositeRtxBenchmarkClaimed: true,
      fullHoloLandWorldFrameClaimed: false,
      productionWholeFrameTimeClaimed: false,
      wallClockUsedAsGpuTime: false,
      questHeadsetMeasured: false,
      photorealismClaimed: false,
    },
  };
}

test('H4G source authors four named model-family residents in one shared world frame', () => {
  const source = readFileSync(path.join(ROOT, SOURCE_REL), 'utf8');
  for (const resident of RESIDENTS) {
    assert.match(source, new RegExp(`displayLabel: "${resident}"`));
  }
  assert.match(source, /sharedCommandBufferCountRequired: 1/);
  assert.match(source, /zeroCopyResidentOutputsToCompositeRequired: true/);
  assert.match(source, /timestampQueryCount: 26/);
  assert.match(source, /fullHoloLandWorldFrameClaimed: false/);
  assert.match(source, /productionWholeFrameTimeClaimed: false/);
});

test('H4G timing statistics retain exact samples and nearest-rank p95', () => {
  assert.deepEqual(computeTimingStatistics([100, 400, 200, 300]), {
    unit: 'nanoseconds',
    sampleCount: 4,
    minimum: 100,
    median: 250,
    mean: 250,
    p95: 400,
    maximum: 400,
  });
});

test('H4G browser admission accepts the bounded shared four-resident witness', () => {
  assert.deepEqual(validateH4GBrowserState(admittedState()), { status: 'pass', errors: [] });
});

test('H4G browser admission fails closed on stage, readback, or scope drift', () => {
  const state = admittedState();
  state.measuredFrames[0].durations.residents[0].motionDepthNanoseconds = 0;
  assert.match(
    validateH4GBrowserState(state).errors.join('\n'),
    /resident 0 motionDepthNanoseconds missing/
  );
  state.measuredFrames[0].durations.residents[0].motionDepthNanoseconds = 100000;
  state.measuredFrames[0].intermediateFrameReadbackCount = 1;
  assert.match(
    validateH4GBrowserState(state).errors.join('\n'),
    /measured pixel readback detected/
  );
  state.measuredFrames[0].intermediateFrameReadbackCount = 0;
  state.measuredFrames[0].queueSubmissionCount = 4;
  assert.match(
    validateH4GBrowserState(state).errors.join('\n'),
    /shared command\/submission count drifted/
  );
  state.measuredFrames[0].queueSubmissionCount = 1;
  state.boundaries.fullHoloLandWorldFrameClaimed = true;
  assert.match(validateH4GBrowserState(state).errors.join('\n'), /benchmark boundary drifted/);
});

test('H4G policy and seed preserve shared timestamp and claim boundaries', () => {
  const policy = readFileSync(
    path.join(
      ROOT,
      'source/proofs/model-village-character-realism-h4g-shared-character-world-frame-policy.hsplus'
    ),
    'utf8'
  );
  const seed = readFileSync(
    path.join(
      ROOT,
      'source/proofs/model-village-character-realism-h4g-shared-character-world-frame-seed.hs'
    ),
    'utf8'
  );
  assert.match(policy, /shared_gpu_timestamp_missing/);
  assert.match(policy, /shared_submission_count_drifted/);
  assert.match(policy, /shared_benchmark_scope_overclaimed/);
  assert.match(seed, /timestampQueryCount: 26/);
  assert.match(seed, /intermediateFrameReadbackCountRequired: 0/);
  assert.match(seed, /fullHoloLandWorldFrameClaimed: false/);
});
