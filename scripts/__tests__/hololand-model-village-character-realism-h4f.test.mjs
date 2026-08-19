import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  computeTimingStatistics,
  validateH4FBrowserState,
} from '../check-hololand-model-village-character-realism-h4f.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4f-character-temporal-frame-graph.holo';

function admittedFrame(overrides = {}) {
  return {
    width: 512,
    height: 512,
    fixedTopology: true,
    persistentGpuResources: true,
    zeroCopyColorToTemporalResolve: true,
    zeroCopyMotionDepthToTemporalResolve: true,
    zeroCopyResolveToHistory: true,
    intermediateFrameReadbackCount: 0,
    evidenceFrameReadbackCount: 0,
    commandBufferCount: 1,
    queueSubmissionCount: 1,
    gpuTimestampMeasured: true,
    timedScope: 'character-color-through-temporal-resolve-gpu-scope',
    historyConsumed: true,
    durations: {
      characterColorNanoseconds: 300000,
      motionDepthNanoseconds: 100000,
      temporalResolveNanoseconds: 100000,
      aggregateNanoseconds: 500000,
    },
    motionDerivation: { movingVertexCount: 200 },
    resolve: { motionVectorsConsumed: true, disocclusionInputConsumed: true },
    ...overrides,
  };
}

function admittedState() {
  const residentNames = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
  const values = Array.from({ length: 64 }, () => 500000);
  return {
    status: 'pass',
    gpu: {
      navigatorGpu: true,
      adapterAcquired: true,
      deviceCreated: true,
      timestampQuerySupported: true,
      timestampQueryEnabled: true,
    },
    residents: residentNames.map((displayLabel) => ({
      displayLabel,
      warmupFrameCount: 4,
      measuredFrames: Array.from({ length: 16 }, () => admittedFrame()),
      finalEvidence: admittedFrame({ evidenceFrameReadbackCount: 1 }),
      outputDigest: 'a'.repeat(64),
    })),
    stageTimingStatistics: {
      characterColorNanoseconds: computeTimingStatistics(values),
      motionDepthNanoseconds: computeTimingStatistics(values),
      temporalResolveNanoseconds: computeTimingStatistics(values),
      aggregateNanoseconds: computeTimingStatistics(values),
    },
    boundaries: {
      boundedPerCharacterRtxBenchmarkClaimed: true,
      fourCharactersInOneSubmissionClaimed: false,
      productionWholeFrameTimeClaimed: false,
      wallClockUsedAsGpuTime: false,
      questHeadsetMeasured: false,
      photorealismClaimed: false,
    },
  };
}

test('H4F source authors four named model-family character graphs', () => {
  const source = readFileSync(path.join(ROOT, SOURCE_REL), 'utf8');
  for (const resident of ['OpenAI', 'Claude', 'Gemini', 'Grok']) {
    assert.match(source, new RegExp(`displayLabel: "${resident}"`));
  }
  assert.match(source, /singleCommandBufferPerCharacterFrameRequired: true/);
  assert.match(source, /zeroCopyMotionDepthToTemporalRequired: true/);
  assert.match(source, /fourCharactersInOneSubmissionClaimed: false/);
  assert.match(source, /productionWholeFrameTimeClaimed: false/);
});

test('H4F timing statistics retain exact samples and nearest-rank p95', () => {
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

test('H4F browser admission accepts the bounded four-resident witness', () => {
  assert.deepEqual(validateH4FBrowserState(admittedState()), { status: 'pass', errors: [] });
});

test('H4F browser admission fails closed on stage, readback, or scope drift', () => {
  const state = admittedState();
  state.residents[0].measuredFrames[0].durations.motionDepthNanoseconds = 0;
  assert.match(
    validateH4FBrowserState(state).errors.join('\n'),
    /motionDepthNanoseconds duration missing/
  );
  state.residents[0].measuredFrames[0].durations.motionDepthNanoseconds = 100000;
  state.residents[0].measuredFrames[0].intermediateFrameReadbackCount = 1;
  assert.match(
    validateH4FBrowserState(state).errors.join('\n'),
    /measured pixel readback detected/
  );
  state.residents[0].measuredFrames[0].intermediateFrameReadbackCount = 0;
  state.boundaries.fourCharactersInOneSubmissionClaimed = true;
  assert.match(validateH4FBrowserState(state).errors.join('\n'), /benchmark boundary drifted/);
});

test('H4F policy and seed preserve timestamp and claim boundaries', () => {
  const policy = readFileSync(
    path.join(
      ROOT,
      'source/proofs/model-village-character-realism-h4f-character-temporal-frame-graph-policy.hsplus'
    ),
    'utf8'
  );
  const seed = readFileSync(
    path.join(
      ROOT,
      'source/proofs/model-village-character-realism-h4f-character-temporal-frame-graph-seed.hs'
    ),
    'utf8'
  );
  assert.match(policy, /aggregate_gpu_timestamp_missing/);
  assert.match(policy, /per_character_submission_count_drifted/);
  assert.match(policy, /benchmark_scope_overclaimed/);
  assert.match(seed, /timestampQueryCount: 6/);
  assert.match(seed, /intermediateFrameReadbackCountRequired: 0/);
  assert.match(seed, /fourCharactersInOneSubmissionClaimed: false/);
});
