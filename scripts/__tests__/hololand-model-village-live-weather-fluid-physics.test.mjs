import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildLivePhysicsHtml,
  summarizeTimings,
  validateBrowserSnapshot,
} from '../check-hololand-model-village-live-weather-fluid-physics.mjs';
import {
  loadLivePhysicsContracts,
  materializeFluidParticles,
  runDeterministicLivePhysicsReplays,
} from '../lib/model-village-live-physics.mjs';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..', '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript';

let cached;
async function fixture() {
  cached ??= loadLivePhysicsContracts({
    repoRoot: REPO_ROOT,
    holoScriptRoot: HOLOSCRIPT_ROOT,
  });
  return cached;
}

test('MV-S3 assigns distinct parser-verified roles to .holo, .hsplus, and .hs', async () => {
  const contracts = await fixture();
  assert.equal(contracts.source.metadata.milestone, 'MV-S3');
  assert.equal(contracts.source.weather.type, 'convective_rain_shower');
  assert.equal(contracts.source.fluidTrait.solverType, 'sph');
  assert.equal(contracts.source.clothTrait.width * contracts.source.clothTrait.height, 140);
  assert.equal(contracts.policy.formatRoles.holoParser, 'HoloCompositionParser');
  assert.equal(contracts.policy.formatRoles.hsplusParser, 'HoloScriptPlusParser');
  assert.equal(contracts.policy.formatRoles.hsParser, 'HoloScriptCodeParser');
  assert.equal(contracts.policy.formatRoles.interchangeableFormatsClaimed, false);
  assert.equal(
    contracts.manifest.metadata.worldSourceSha256,
    contracts.sourceHashes.source
  );
  assert.equal(contracts.manifest.state.replayRuns, 3);
});

test('seeded fluid lattice is stable and owns exactly 96 particles', async () => {
  const contracts = await fixture();
  const left = materializeFluidParticles(contracts.seed);
  const right = materializeFluidParticles(contracts.seed);
  assert.equal(left.length, 96);
  assert.deepEqual(left, right);
  assert.equal(new Set(left.map((particle) => particle.id)).size, 96);
});

test('three HoloScript trait/runtime replays match across every digest lane', async () => {
  const contracts = await fixture();
  const replay = runDeterministicLivePhysicsReplays(contracts);
  assert.equal(replay.accepted, true);
  assert.equal(replay.runCount, 3);
  assert.deepEqual(replay.digestAgreement, {
    fluid: true,
    cloth: true,
    rigid: true,
    events: true,
    combined: true,
  });
  assert.equal(replay.firstRun.counts.fluidParticles, 96);
  assert.equal(replay.firstRun.counts.clothParticles, 140);
  assert.equal(replay.firstRun.counts.rigidBodies, 2);
  assert.ok(replay.firstRun.counts.rigidContacts >= 1);
  assert.equal(replay.firstRun.metrics.clothTearCount, 0);
  assert.equal(
    replay.firstRun.stateDigests.combined,
    contracts.manifest.state.replayCombinedSha256
  );
});

test('browser surface makes the CPU/GPU and causal lane boundaries visible', () => {
  const payload = {
    sourceDigest: 'a'.repeat(64),
    weather: { deterministic_seed: 641031 },
    rain: { presentation_particle_count: 320 },
    cloth: { width: 14, height: 10 },
    physics: {
      counts: { fluidParticles: 96, clothParticles: 140, rigidContacts: 3 },
      timings: { total: { p95Ms: 1.2 } },
      stateDigests: { combined: 'b'.repeat(64) },
      finalState: { fluid: [], cloth: [], rigid: [] },
      visualFrame: { fluid: [], cloth: [], rigid: [] },
    },
  };
  const html = buildLivePhysicsHtml(payload);
  assert.match(html, /Live physics · MV-S3/);
  assert.match(html, /WebGPU presentation/);
  assert.match(html, /Separate from MV-P10 receipts/);
  assert.match(html, /No village causal feedback/);
  assert.match(html, /does not pretend to solve it/);
  assert.match(html, /\.holo world · \.hsplus behavior policy · \.hs deterministic seed/);
});

test('browser snapshot requires real WebGPU draw evidence and timestamp samples when supported', () => {
  const payload = { physics: { stateDigests: { combined: 'c'.repeat(64) } } };
  const snapshot = {
    status: 'pass',
    error: null,
    gpu: {
      navigatorGpu: true,
      adapterAcquired: true,
      deviceCreated: true,
      canvasContextCreated: true,
      renderPipelinesCreated: 3,
      commandEncoderUsed: true,
      timestampQuerySupported: true,
    },
    drawCounts: {
      fluidInstances: 96,
      rainInstances: 320,
      rigidInstances: 2,
      clothVertices: 702,
    },
    metrics: {
      cpuSubmit: { samples: 24 },
      gpuPass: { samples: 24, p95Ms: 0.04 },
    },
    labels: [
      'Live physics · MV-S3',
      'CPU SPH + PBD + rigid',
      'WebGPU presentation',
      'Separate from MV-P10 receipts',
      'No village causal feedback',
    ],
    replayDigest: 'c'.repeat(64),
  };
  assert.equal(validateBrowserSnapshot(snapshot, payload), true);
});

test('timing summary reports bounded ordered percentiles without entering replay state', () => {
  assert.deepEqual(summarizeTimings([4, 1, 3, 2]), {
    samples: 4,
    p50Ms: 3,
    p95Ms: 4,
    p99Ms: 4,
    maxMs: 4,
  });
});
