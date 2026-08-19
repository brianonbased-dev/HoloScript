import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildLodStressSchedule,
  computeTimingStatistics,
  validateH4EBrowserState,
} from '../check-hololand-model-village-character-realism-h4e.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4e-zero-copy-temporal-frame-graph.holo';

function admittedFrame(overrides = {}) {
  return {
    width: 1400,
    height: 900,
    zeroCopyTextureInputs: true,
    zeroCopyHistory: true,
    intermediateFrameReadbackCount: 0,
    evidenceFrameReadbackCount: 0,
    commandBufferCount: 1,
    queueSubmissionCount: 1,
    gpuTimestampQuerySupported: true,
    gpuTimestampQueryEnabled: true,
    gpuTimestampMeasured: true,
    resolveDurationNanoseconds: 250000,
    timedScope: 'temporal-resolve-compute-pass',
    readbackExcludedFromTimedScope: true,
    resolve: {
      persistentPipelineConsumed: true,
      zeroCopyTextureInputs: true,
      intermediateCpuReadbackCount: 0,
      gpuTimestampWritesEncoded: true,
    },
    ...overrides,
  };
}

function admittedState() {
  const schedule = buildLodStressSchedule();
  let previousLod = 0;
  const stressFrames = schedule.map((scheduled) => {
    const changed = scheduled.lodLevel !== previousLod;
    previousLod = scheduled.lodLevel;
    return {
      ...scheduled,
      plan: {
        invalidationReason: changed ? 'lod-change' : null,
        historyValid: !changed,
      },
      receipt: admittedFrame({ historyConsumed: !changed }),
    };
  });
  return {
    status: 'pass',
    gpu: {
      navigatorGpu: true,
      adapterAcquired: true,
      deviceCreated: true,
      timestampQuerySupported: true,
      timestampQueryEnabled: true,
    },
    measuredFrames: Array.from({ length: 40 }, () => admittedFrame()),
    stressFrames,
    timingStatistics: computeTimingStatistics(Array.from({ length: 40 }, () => 250000)),
    finalEvidence: admittedFrame({ evidenceFrameReadbackCount: 1 }),
    boundaries: {
      generalRtxPerformanceClaimed: false,
      productionFrameTimeClaimed: false,
      wallClockUsedAsGpuTime: false,
    },
  };
}

test('H4E source authors the zero-copy timestamp boundary for four named families', () => {
  const source = readFileSync(path.join(ROOT, SOURCE_REL), 'utf8');
  for (const resident of ['OpenAI', 'Claude', 'Gemini', 'Grok']) {
    assert.match(source, new RegExp(`displayLabel: "${resident}"`));
  }
  assert.match(source, /persistentPipelineRequired: true/);
  assert.match(source, /persistentColorHistoryRequired: true/);
  assert.match(source, /persistentDepthHistoryRequired: true/);
  assert.match(source, /intermediateFrameReadbackCountRequired: 0/);
  assert.match(source, /gpuTimestampQueryRequired: true/);
  assert.match(source, /boundedRtxTemporalKernelBenchmarkClaimed: true/);
  assert.match(source, /generalRtxPerformanceClaimed: false/);
  assert.match(source, /productionFrameTimeClaimed: false/);
});

test('H4E LOD stress schedule is deterministic and changes every three frames', () => {
  const schedule = buildLodStressSchedule();
  assert.equal(schedule.length, 24);
  assert.deepEqual(
    schedule.map((entry) => entry.lodLevel),
    [0, 0, 0, 2, 2, 2, 0, 0, 0, 2, 2, 2, 0, 0, 0, 2, 2, 2, 0, 0, 0, 2, 2, 2]
  );
});

test('H4E timestamp statistics use exact samples and nearest-rank p95', () => {
  const stats = computeTimingStatistics([100, 400, 200, 300]);
  assert.deepEqual(stats, {
    unit: 'nanoseconds',
    sampleCount: 4,
    minimum: 100,
    median: 250,
    mean: 250,
    p95: 400,
    maximum: 400,
  });
});

test('H4E browser admission fails closed on timestamp or submission drift', () => {
  const state = admittedState();
  assert.equal(validateH4EBrowserState(state).status, 'pass');
  state.measuredFrames[0].gpuTimestampMeasured = false;
  assert.match(validateH4EBrowserState(state).errors.join('\n'), /GPU timestamp missing/);
  state.measuredFrames[0].gpuTimestampMeasured = true;
  state.measuredFrames[0].queueSubmissionCount = 2;
  assert.match(validateH4EBrowserState(state).errors.join('\n'), /command\/submission count drifted/);
});

test('H4E browser admission rejects stale history across a LOD transition', () => {
  const state = admittedState();
  const transition = state.stressFrames.find(
    (frame) => frame.plan.invalidationReason === 'lod-change'
  );
  transition.receipt.historyConsumed = true;
  assert.match(validateH4EBrowserState(state).errors.join('\n'), /stale history was consumed/);
});

test('H4E policy and flat seed preserve measurement and claim boundaries', () => {
  const policy = readFileSync(
    path.join(ROOT, 'source/proofs/model-village-character-realism-h4e-zero-copy-temporal-frame-graph-policy.hsplus'),
    'utf8'
  );
  const seed = readFileSync(
    path.join(ROOT, 'source/proofs/model-village-character-realism-h4e-zero-copy-temporal-frame-graph-seed.hs'),
    'utf8'
  );
  assert.match(policy, /gpu_timestamp_missing/);
  assert.match(policy, /stale_lod_history_consumed/);
  assert.match(policy, /benchmark_scope_overclaimed/);
  assert.match(seed, /timestampQueryRequired: true/);
  assert.match(seed, /intermediateFrameReadbackCountRequired: 0/);
  assert.match(seed, /generalRtxPerformanceClaimed: false/);
  assert.match(seed, /productionFrameTimeClaimed: false/);
});
