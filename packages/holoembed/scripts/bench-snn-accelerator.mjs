#!/usr/bin/env node
/**
 * HoloEmbed SnnAccelerator evidence benchmark.
 *
 * Runs the same char-trigram block workload through:
 * - CPU LIF reference (`encodeLifPopulationCpu`)
 * - WebGPU SnnAccelerator shader path
 *
 * The production CPU fallback remains identity passthrough. This benchmark is
 * intentionally apples-to-apples for the LIF transform so speed and recall
 * claims are measured instead of inferred from GPU availability.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SnnAccelerator,
  SUBWORD_BINS,
  encodeLifPopulationCpu,
  trigramHistogram,
} from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');

const args = process.argv.slice(2);
const outputPath = path.resolve(
  repoRoot,
  argValue('--out') ??
    process.env.HOLOEMBED_SNN_BENCH_OUTPUT ??
    '.bench-logs/holoembed-snn-accelerator-bench.json',
);
const iterations = numberArg('--iterations', process.env.HOLOEMBED_SNN_BENCH_ITERS, 8);
const warmups = numberArg('--warmups', process.env.HOLOEMBED_SNN_BENCH_WARMUPS, 2);
const batchSize = numberArg('--batch-size', process.env.HOLOEMBED_SNN_BENCH_BATCH, 96);
const timeSteps = numberArg('--timesteps', process.env.HOLOEMBED_SNN_TIMESTEPS, 64);
const currentScale = numberArg('--current-scale', process.env.HOLOEMBED_SNN_CURRENT_SCALE, 240);
const requireWebGpu = hasFlag('--require-webgpu') || process.env.HOLOEMBED_SNN_REQUIRE_WEBGPU === '1';

const lifParams = { currentScale };
const texts = buildWorkloadTexts(batchSize);
const histograms = texts.map(buildHistogram);
const recallCases = buildRecallCases();

const accel = new SnnAccelerator();
await accel.initialize({ enableSnn: true, snnTimesteps: timeSteps }, lifParams);

if (!accel.available) {
  const artifact = {
    schemaVersion: 'holoembed-snn-accelerator-bench/v0.1.0',
    generatedAt: new Date().toISOString(),
    status: 'skipped',
    reason: 'WebGPU unavailable; CPU passthrough remains active.',
    parameters: { iterations, warmups, batchSize, timeSteps, lifParams },
  };
  await writeArtifact(artifact);
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
  process.exit(requireWebGpu ? 1 : 0);
}

const cpuLatency = await measure('cpu-lif-reference', warmups, iterations, () =>
  histograms.map((hist) => encodeLifPopulationCpu(hist, { timeSteps, lifParams })),
);
const gpuLatency = await measure('webgpu-lif-shader', warmups, iterations, () =>
  accel.encodeBatch(histograms),
);

const parity = await measureParity(accel, histograms);
const recall = await measureRecall(accel, recallCases);
const adapter = await describeAdapter();

accel.dispose();

const speedupMean = cpuLatency.meanMs / gpuLatency.meanMs;
const artifact = {
  schemaVersion: 'holoembed-snn-accelerator-bench/v0.1.0',
  generatedAt: new Date().toISOString(),
  status: 'passed',
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    webgpu: adapter,
  },
  parameters: {
    iterations,
    warmups,
    batchSize,
    timeSteps,
    lifParams,
    workload: 'HoloEmbed char-trigram 128-bin blocks',
  },
  latency: {
    cpuLifReference: cpuLatency,
    webgpuLifShader: gpuLatency,
    speedupMean,
  },
  parity,
  recall,
  verdict: {
    shaderParityPass: parity.maxAbsDiff <= 1e-6,
    recallEquivalent: recall.deltaAt1 === 0 && recall.deltaAt3 === 0,
    speedupObserved: speedupMean > 1,
    speedupClaim: speedupMean > 1
      ? 'WebGPU faster than CPU LIF reference on this measured run.'
      : 'No WebGPU speedup observed on this measured run; do not market as acceleration.',
  },
};

await writeArtifact(artifact);
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);

if (!artifact.verdict.shaderParityPass || !artifact.verdict.recallEquivalent) {
  process.exit(1);
}

function buildHistogram(text) {
  const hist = new Float32Array(SUBWORD_BINS);
  trigramHistogram(text, hist, 0, SUBWORD_BINS);
  return hist;
}

function buildWorkloadTexts(size) {
  const roots = [
    'PillarSliceEmitter class emits pillar spike events',
    'BrainCoordNodeMapper maps spatial memories',
    'SnnAccelerator encodes trigram blocks through LIF neurons',
    'SimulationContractReceipt records solver evidence',
    'MultiTargetTrackingTrait assigns detections with kalman hungarian reid',
    'FabricSimulationTrait models cloth weave drape stretch',
    'EnergyGridOptimizer balances battery solar feeder topology',
    'QaoaDerPlanner optimizes distributed energy resources',
    'AlphaFoldDockingBridge predicts binding affinity admet risk',
    'HoloMapSpatialAnchor reconstructs location based ar proof',
    'AerospaceTrajectorySolver integrates orbital reentry thermal loads',
    'DomainSimulationReceipt binds physics solver provenance',
  ];

  return Array.from({ length: size }, (_, i) => {
    const base = roots[i % roots.length];
    const suffix = roots[(i * 5 + 3) % roots.length];
    return `${base} ${suffix} sample${i % 7}`;
  });
}

function buildRecallCases() {
  return [
    ['pillar-slice-emitter', 'PillarSliceEmitter event class', 'pillar slice emitter'],
    ['brain-coord-node-mapper', 'BrainCoordNodeMapper spatial memory mapper', 'brain coord node mapper'],
    ['snn-accelerator', 'SnnAccelerator LIF WebGPU trigram encoder', 'snn accelerator webgpu'],
    ['simulation-contract-receipt', 'SimulationContractReceipt CAEL solver evidence', 'simulation contract receipt'],
    ['multi-target-tracking', 'MultiTargetTrackingTrait kalman hungarian reid assignment', 'multi target tracking'],
    ['fabric-simulation', 'FabricSimulationTrait cloth weave stretch drape', 'fabric simulation cloth'],
    ['energy-grid-optimizer', 'EnergyGridOptimizer solar battery feeder topology', 'energy grid optimizer'],
    ['alphafold-docking', 'AlphaFoldDockingBridge binding affinity admet', 'alphafold docking bridge'],
  ].map(([id, document, query]) => ({ id, document, query }));
}

async function measure(name, warmupCount, sampleCount, fn) {
  let checksum = 0;
  for (let i = 0; i < warmupCount; i++) {
    checksum += checksumBatch(await fn());
  }

  const samples = [];
  for (let i = 0; i < sampleCount; i++) {
    const start = performance.now();
    const output = await fn();
    samples.push(performance.now() - start);
    checksum += checksumBatch(output);
  }

  samples.sort((a, b) => a - b);
  return {
    name,
    samples,
    meanMs: mean(samples),
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    checksum: Number(checksum.toFixed(6)),
  };
}

async function measureParity(accelerator, inputs) {
  const gpu = await accelerator.encodeBatch(inputs);
  const cpu = inputs.map((hist) => encodeLifPopulationCpu(hist, { timeSteps, lifParams }));
  let maxAbsDiff = 0;
  let meanAbsDiff = 0;
  let compared = 0;

  for (let i = 0; i < cpu.length; i++) {
    const a = cpu[i];
    const b = gpu[i];
    for (let j = 0; j < a.length; j++) {
      const diff = Math.abs((a[j] ?? 0) - (b?.[j] ?? 0));
      maxAbsDiff = Math.max(maxAbsDiff, diff);
      meanAbsDiff += diff;
      compared++;
    }
  }

  return {
    maxAbsDiff,
    meanAbsDiff: compared > 0 ? meanAbsDiff / compared : 0,
    comparedValues: compared,
  };
}

async function measureRecall(accelerator, cases) {
  const documentHists = cases.map((c) => buildHistogram(c.document));
  const queryHists = cases.map((c) => buildHistogram(c.query));

  const cpuDocuments = documentHists.map((hist) => encodeLifPopulationCpu(hist, { timeSteps, lifParams }));
  const cpuQueries = queryHists.map((hist) => encodeLifPopulationCpu(hist, { timeSteps, lifParams }));
  const gpuDocuments = await accelerator.encodeBatch(documentHists);
  const gpuQueries = await accelerator.encodeBatch(queryHists);

  const cpuAt1 = recallAtK(cpuQueries, cpuDocuments, cases, 1);
  const gpuAt1 = recallAtK(gpuQueries, gpuDocuments, cases, 1);
  const cpuAt3 = recallAtK(cpuQueries, cpuDocuments, cases, 3);
  const gpuAt3 = recallAtK(gpuQueries, gpuDocuments, cases, 3);

  return {
    queryCount: cases.length,
    cpuAt1,
    gpuAt1,
    deltaAt1: gpuAt1 - cpuAt1,
    cpuAt3,
    gpuAt3,
    deltaAt3: gpuAt3 - cpuAt3,
  };
}

function recallAtK(queries, documents, cases, k) {
  let hits = 0;
  for (let queryIndex = 0; queryIndex < queries.length; queryIndex++) {
    const ranking = documents
      .map((doc, docIndex) => ({
        id: cases[docIndex].id,
        score: cosine(queries[queryIndex], doc),
      }))
      .sort((a, b) => b.score - a.score);
    if (ranking.slice(0, k).some((entry) => entry.id === cases[queryIndex].id)) {
      hits++;
    }
  }
  return hits / queries.length;
}

function cosine(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function checksumBatch(batch) {
  let sum = 0;
  for (const vec of batch) {
    for (let i = 0; i < vec.length; i += 17) {
      sum += vec[i] ?? 0;
    }
  }
  return sum;
}

async function describeAdapter() {
  const gpu = globalThis.navigator?.gpu;
  if (!gpu?.requestAdapter) return { available: false };
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  return {
    available: Boolean(adapter),
    info: adapter?.info ?? {},
    features: adapter?.features ? [...adapter.features].sort() : [],
    limits: adapter?.limits
      ? {
          maxBufferSize: adapter.limits.maxBufferSize,
          maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
          maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        }
      : {},
  };
}

async function writeArtifact(artifact) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
}

function argValue(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function hasFlag(name) {
  return args.includes(name);
}

function numberArg(name, envValue, defaultValue) {
  const raw = argValue(name) ?? envValue;
  if (raw == null) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.ceil(values.length * p) - 1);
  return values[index];
}
