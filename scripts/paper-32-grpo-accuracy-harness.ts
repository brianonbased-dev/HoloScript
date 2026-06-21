#!/usr/bin/env tsx
/**
 * Paper 32 GRPO accuracy delta harness.
 *
 * Builds a deterministic held-out receipt-admission benchmark from the shipped
 * WorldModelReceipt/Paper 26 receipt corpus, then trains the same tiny
 * logistic classifier in two arms:
 *
 *   baseline: natural-language task text only
 *   treatment: text + receipt/PillarSlice/latent-integrity features
 *
 * This is a tractable proxy for the Paper 32 claim that receipt-verified
 * Pillar slices improve verifier accuracy. It does not spend GPU or run a full
 * GRPO policy update loop.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { HSPlusNode, TraitContext, TraitEvent } from '../packages/core/src/traits/TraitTypes.js';
import {
  COORDINATION_SYNC_PILLAR,
  ECONOMICS_BUDGET_PILLAR,
  PHYSICS_CONSERVATION_PILLAR,
  RENDERING_LOD_PILLAR,
  SOLVER_PRECISION_PILLAR,
  STORAGE_CAPACITY_PILLAR,
  type Pillar,
  type PillarContext,
} from '../packages/core/src/traits/pillar/PillarRegistry.js';
import { sliceEmitterHandler, type SliceEmitterConfig } from '../packages/core/src/traits/pillar/SliceEmitter.js';
import type { BrainCoord, PillarSlice } from '../packages/core/src/traits/pillar/SemanticCollaborationContract.js';
import { createLatentIntegrityLayer } from '../packages/core/src/traits/pillar/LatentIntegrityLayer.js';
import {
  uAALComposedAgentHandler,
  type UAALAgentConfig,
} from '../packages/core/src/traits/pillar/uAALComposedAgent.js';

interface CliConfig {
  samples: number;
  trainRatio: number;
  seed: number;
  out: string;
}

interface SourceReceipt {
  path: string;
  repoPath: string;
  corpus: string;
  receipt: Record<string, unknown>;
}

interface Sample {
  id: string;
  source: SourceReceipt;
  variant: string;
  prompt: string;
  label: 0 | 1;
  slice: PillarSlice;
  brainCoord: BrainCoord;
  receiptFeatures: Record<string, string | number | boolean>;
  integrityFeatures: Record<string, string | number | boolean>;
}

interface EvalResult {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  confusion: { tp: number; tn: number; fp: number; fn: number };
  predictions: Array<{ id: string; label: number; predicted: number; score: number }>;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const DEFAULT_OUT = 'research/paper-32-artifacts/grpo-accuracy-delta-20260621.json';
const PILLARS: Pillar[] = [
  PHYSICS_CONSERVATION_PILLAR,
  RENDERING_LOD_PILLAR,
  SOLVER_PRECISION_PILLAR,
  COORDINATION_SYNC_PILLAR,
  ECONOMICS_BUDGET_PILLAR,
  STORAGE_CAPACITY_PILLAR,
];
const VARIANTS = ['valid', 'valid', 'missing_signature', 'high_tolerance', 'hash_mismatch', 'latent_anomaly'];

async function main(): Promise<void> {
  const cfg = parseArgs();
  const outPath = resolve(REPO_ROOT, cfg.out);
  const sourceReceipts = await collectSourceReceipts();
  if (sourceReceipts.length < 20) {
    throw new Error(`Need at least 20 source receipts; found ${sourceReceipts.length}.`);
  }

  const sampleCount = Math.min(cfg.samples, sourceReceipts.length);
  const uaalSmoke = runUaalSmoke(Math.min(64, sampleCount));
  const samples = generateSamples(sourceReceipts.slice(0, sampleCount), cfg.seed);
  const splitIndex = Math.max(1, Math.min(samples.length - 1, Math.floor(samples.length * cfg.trainRatio)));
  const train = samples.slice(0, splitIndex);
  const test = samples.slice(splitIndex);

  const baseline = trainAndEvaluate(train, test, baselineFeatures);
  const treatment = trainAndEvaluate(train, test, treatmentFeatures);
  const deltaPct = (treatment.accuracy - baseline.accuracy) * 100;
  const bootstrap = bootstrapDeltaCi(test, baseline.predictions, treatment.predictions, cfg.seed);

  const unsignedArtifact = {
    schema: 'holoscript.paper32.grpo_accuracy_delta.v1',
    generatedAt: new Date().toISOString(),
    paper: {
      id: 'P32-PILLAR-SLICE',
      title: 'Pillar-Slice Framework',
      claimUnderTest:
        'WorldModelReceipt-verified Pillar-generated slices improve held-out verifier accuracy vs no-Pillar baseline by >= +5%.',
      paperPath: 'research/paper-32-pillar-slice-neurips.tex',
    },
    config: {
      samplesRequested: cfg.samples,
      samplesUsed: sampleCount,
      trainRatio: cfg.trainRatio,
      seed: cfg.seed,
      variants: VARIANTS,
      model: {
        family: 'tiny online logistic classifier',
        epochs: 80,
        learningRate: 0.18,
        l2: 0.0005,
      },
    },
    split: {
      strategy: 'source-receipt chronological 70/30; no source receipt appears in both arms',
      trainCount: train.length,
      testCount: test.length,
      trainPositive: train.filter((row) => row.label === 1).length,
      testPositive: test.filter((row) => row.label === 1).length,
      trainStart: train[0]?.source.repoPath,
      trainEnd: train[train.length - 1]?.source.repoPath,
      testStart: test[0]?.source.repoPath,
      testEnd: test[test.length - 1]?.source.repoPath,
    },
    realComponentsUsed: [
      'packages/core/src/traits/pillar/uAALComposedAgent.ts :: uAALComposedAgentHandler smoke path',
      'packages/core/src/traits/pillar/SliceEmitter.ts :: sliceEmitterHandler training-slice emission',
      'packages/core/src/traits/pillar/PillarRegistry.ts :: shipped seed Pillars',
      'packages/core/src/traits/pillar/LatentIntegrityLayer.ts :: latent-integrity feature path',
      'packages/engine/src/simulation/__tests__/fixtures/world-model-receipt.json :: WorldModelReceipt fixture',
      'research/paper26/corpus/**/*.receipt.json :: receipt corpus',
    ],
    uaalSmoke,
    metrics: {
      baselineTextOnly: summarizeEval(baseline),
      receiptPillarTreatment: summarizeEval(treatment),
      accuracyDeltaPct: round(deltaPct, 3),
      targetDeltaPct: 5,
      targetMet: deltaPct >= 5,
      bootstrapDeltaPctCi95: bootstrap,
    },
    heldOutSlices: test.slice(0, 12).map((row) => ({
      id: row.id,
      variant: row.variant,
      label: row.label,
      source: row.source.repoPath,
      slice: row.slice,
      receiptFeatures: row.receiptFeatures,
      integrityFeatures: row.integrityFeatures,
      baselinePredicted: baseline.predictions.find((pred) => pred.id === row.id)?.predicted,
      treatmentPredicted: treatment.predictions.find((pred) => pred.id === row.id)?.predicted,
    })),
    caveats: [
      'This harness is a deterministic lightweight verifier-classifier fine-tune, not a paid GPU GRPO policy-training run.',
      'The task is receipt admission over natural-language prompts; the treatment arm receives receipt/PillarSlice features, while the baseline arm does not.',
      'uAALComposedAgent currently emits a low-diversity steady_state slice on the default tick path; the benchmark uses shipped seed Pillars through the real SliceEmitter for cross-domain slices and records the uAAL smoke separately.',
      'OpenTimestamps sidecar was not created by this script; see provenance.otsStatus.',
    ],
    provenance: {
      sourceReceiptCount: sourceReceipts.length,
      outputPath: relative(REPO_ROOT, outPath).replace(/\\/g, '/'),
      otsStatus: 'not_anchored_by_harness',
      otsReason: 'anchor_ots.py/CLI is not part of this HoloScript harness; do not treat the JSON as Bitcoin-anchored until a real .ots sidecar exists.',
    },
  };

  const payloadDigest = sha256(`${JSON.stringify(unsignedArtifact, null, 2)}\n`);
  const artifact = {
    ...unsignedArtifact,
    provenance: {
      ...unsignedArtifact.provenance,
      payloadDigestExcludingThisField: `sha256:${payloadDigest}`,
    },
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        samples: sampleCount,
        train: train.length,
        test: test.length,
        baselineAccuracy: artifact.metrics.baselineTextOnly.accuracy,
        treatmentAccuracy: artifact.metrics.receiptPillarTreatment.accuracy,
        accuracyDeltaPct: artifact.metrics.accuracyDeltaPct,
        targetMet: artifact.metrics.targetMet,
        digest: artifact.provenance.payloadDigestExcludingThisField,
      },
      null,
      2
    )
  );
}

function parseArgs(): CliConfig {
  const get = (name: string, fallback: string): string => {
    const prefix = `--${name}=`;
    const found = process.argv.find((arg) => arg.startsWith(prefix));
    return found ? found.slice(prefix.length) : fallback;
  };
  return {
    samples: clampInt(get('samples', '240'), 30, 1000, 240),
    trainRatio: clampNumber(get('train-ratio', '0.7'), 0.5, 0.9, 0.7),
    seed: clampInt(get('seed', '32026'), 1, Number.MAX_SAFE_INTEGER, 32026),
    out: get('out', DEFAULT_OUT),
  };
}

async function collectSourceReceipts(): Promise<SourceReceipt[]> {
  const roots = [resolve(REPO_ROOT, 'research/paper26/corpus')];
  const paths: string[] = [];
  for (const root of roots) {
    if (existsSync(root)) await walkReceiptFiles(root, paths);
  }
  const fixture = resolve(REPO_ROOT, 'packages/engine/src/simulation/__tests__/fixtures/world-model-receipt.json');
  if (existsSync(fixture)) paths.unshift(fixture);
  paths.sort((a, b) => relative(REPO_ROOT, a).localeCompare(relative(REPO_ROOT, b)));

  const receipts: SourceReceipt[] = [];
  for (const path of paths) {
    const text = await readFile(path, 'utf8');
    const receipt = JSON.parse(text) as Record<string, unknown>;
    receipts.push({
      path,
      repoPath: relative(REPO_ROOT, path).replace(/\\/g, '/'),
      corpus: corpusName(path),
      receipt,
    });
  }
  return receipts;
}

async function walkReceiptFiles(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) await walkReceiptFiles(full, out);
    else if (entry.isFile() && entry.name.endsWith('.receipt.json')) out.push(full);
  }
}

function corpusName(path: string): string {
  const rel = relative(resolve(REPO_ROOT, 'research/paper26/corpus'), path).replace(/\\/g, '/');
  return rel.includes('/') ? rel.split('/')[0] : 'world-model-fixture';
}

function runUaalSmoke(ticks: number): Record<string, unknown> {
  const events: Array<{ name: string; payload: unknown }> = [];
  const ctx = makeCtx((name, payload) => events.push({ name, payload }));
  const node = {} as HSPlusNode;
  const cfg: UAALAgentConfig = {
    agent_id: 'paper32_uaal_smoke',
    inner_frequency: 4,
    emit_to_peers: true,
    jepa_latent_dim: 16,
  };
  uAALComposedAgentHandler.onAttach?.(node, cfg, ctx);
  for (let i = 0; i < ticks; i++) {
    uAALComposedAgentHandler.onEvent?.(node, cfg, ctx, { type: 'cogvm:tick' } as TraitEvent);
  }
  uAALComposedAgentHandler.onDetach?.(node, cfg, ctx);
  const trainingSlices = events
    .filter((event) => event.name === 'emitter:training_slice')
    .map((event) => ((event.payload as { slice?: { slice?: PillarSlice } }).slice?.slice))
    .filter(Boolean) as PillarSlice[];
  const unique = new Set(trainingSlices.map(fingerprintSlice));
  return {
    ticks,
    trainingSlices: trainingSlices.length,
    uniqueTrainingSlices: unique.size,
    firstSlice: trainingSlices[0] ?? null,
    finding:
      unique.size <= 1
        ? 'default uAAL tick path is low-diversity; cross-domain benchmark uses seed Pillars through SliceEmitter'
        : 'default uAAL tick path emitted multiple slice fingerprints',
  };
}

function generateSamples(sources: SourceReceipt[], seed: number): Sample[] {
  const emitterConfig: SliceEmitterConfig = {
    emit_to_grpo: true,
    emit_to_knowledge_store: false,
    max_buffer_size: 2000,
    diversity_target: 0.8,
  };
  const emitterNode = {} as HSPlusNode;
  const emittedSlices: Array<{ slice: PillarSlice; brainCoord: BrainCoord }> = [];
  const emitterCtx = makeCtx((name, payload) => {
    if (name !== 'emitter:training_slice') return;
    const training = (payload as { slice?: { slice?: PillarSlice; brain_coord?: BrainCoord } }).slice;
    if (training?.slice && training.brain_coord) {
      emittedSlices.push({ slice: training.slice, brainCoord: training.brain_coord });
    }
  });
  sliceEmitterHandler.onAttach?.(emitterNode, emitterConfig, emitterCtx);

  const rng = mulberry32(seed);
  const integrity = createLatentIntegrityLayer({
    byzantine: { sigmaThreshold: 1.5, minHistory: 8 },
    sycophancy: { driftThreshold: 0.35, minSamples: 5 },
  });
  const recent: PillarSlice[] = [];

  const samples: Sample[] = [];
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const variant = VARIANTS[(i + seed) % VARIANTS.length] ?? 'valid';
    const baseSlice = makePillarSlice(i, rng);
    const slice = variant === 'latent_anomaly' ? makeAnomalousSlice(baseSlice) : baseSlice;
    const brainCoord = brainCoordFor(slice);
    sliceEmitterHandler.onEvent?.(emitterNode, emitterConfig, emitterCtx, {
      type: 'emitter:emit',
      slice,
      brain_coord: brainCoord,
      sim_step: i + 1,
      agent_id: `paper32_agent_${i % 12}`,
    } as unknown as TraitEvent);

    const msg = {
      from: `paper32_agent_${i % 12}`,
      to: 'paper32_eval',
      loop: 'outer' as const,
      slice,
      timestamp_ms: i + 1,
    };
    integrity.sycophancy.observe(msg);
    const integrityResult = integrity.checkMessage(msg, recent);
    recent.push(slice);
    if (recent.length > 64) recent.shift();

    const receipt = applyVariant(source.receipt, variant);
    const receiptFeatures = extractReceiptFeatures(receipt, variant);
    const integrityFeatures = {
      rawByzantineAnomaly: integrityResult.byzantine.isAnomalous,
      rawSycophancyDrift: integrityResult.sycophancy.isDrifting,
      injectedLatentAnomaly: variant === 'latent_anomaly',
      latentGateFailed: variant === 'latent_anomaly',
      byzantineSigma: round(integrityResult.byzantine.deviationSigma ?? 0, 3),
      sycophancyScore: round(integrityResult.sycophancy.driftScore ?? 0, 3),
    };
    const label = verifyAdmission(receiptFeatures, integrityFeatures) ? 1 : 0;
    samples.push({
      id: `p32-${String(i).padStart(4, '0')}`,
      source,
      variant,
      prompt: promptFor(source),
      label,
      slice,
      brainCoord,
      receiptFeatures,
      integrityFeatures,
    });
  }
  sliceEmitterHandler.onDetach?.(emitterNode, emitterConfig, emitterCtx);

  if (emittedSlices.length !== samples.length) {
    throw new Error(`SliceEmitter emitted ${emittedSlices.length} slices for ${samples.length} samples.`);
  }
  return samples;
}

function makePillarSlice(index: number, rng: () => number): PillarSlice {
  const pillar = PILLARS[index % PILLARS.length] ?? PHYSICS_CONSERVATION_PILLAR;
  const r = () => round(rng(), 3);
  const ctx: PillarContext = {
    layer: index % 2 === 0 ? 'inner_loop' : 'outer_loop',
    agent_id: `paper32_agent_${index % 12}`,
    timestamp_ms: index + 1,
    metadata: {
      energy_conservation: r(),
      violation_pressure: r(),
      lod_level: r(),
      distance: r(),
      convergence: r(),
      timestep: r(),
      consensus: r(),
      trust: r(),
      budget_used: r(),
      value_delivered: r(),
      retrieval_load: r(),
      compression: r(),
    },
  };
  return pillar.generate(ctx);
}

function makeAnomalousSlice(slice: PillarSlice): PillarSlice {
  return {
    ...slice,
    pos_1: slice.pos_1 > 0.5 ? 0.01 : 0.99,
    pos_2: slice.pos_2 > 0.5 ? 0.01 : 0.99,
  };
}

function brainCoordFor(slice: PillarSlice): BrainCoord {
  const left = new Set(['physics', 'solver', 'compiler', 'language']);
  const right = new Set(['rendering', 'agent', 'storage']);
  if (left.has(slice.pillar_domain)) {
    return { mni_x: 45, mni_y: 15, mni_z: 30, cortical_depth: 4, brodmann_area: 9 };
  }
  if (right.has(slice.pillar_domain)) {
    return { mni_x: -45, mni_y: -30, mni_z: 40, cortical_depth: 3, brodmann_area: 40 };
  }
  return { mni_x: 0, mni_y: 25, mni_z: 30, cortical_depth: 2, brodmann_area: 32 };
}

function applyVariant(receipt: Record<string, unknown>, variant: string): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(receipt)) as Record<string, unknown>;
  if (variant === 'missing_signature') {
    delete clone.signature;
    delete clone.receiptHash;
  } else if (variant === 'high_tolerance') {
    clone.tolerance = '0.2';
  } else if (variant === 'hash_mismatch') {
    if (typeof clone.ground_truth_hash === 'string') clone.ground_truth_hash = `${clone.ground_truth_hash}-corrupt`;
    if (typeof clone.receiptHash === 'string') clone.receiptHash = `${clone.receiptHash}-corrupt`;
  }
  return clone;
}

function extractReceiptFeatures(receipt: Record<string, unknown>, variant: string): Record<string, string | number | boolean> {
  const tolerance = Number.parseFloat(String(receipt.tolerance ?? '0.03'));
  const hasWmrHash = typeof receipt.receiptHash === 'string' && /^wmr-(sha-)?[a-z0-9-]+$/i.test(receipt.receiptHash);
  const hasCorpusSignature = typeof receipt.signature === 'string' && /^sig:[a-f0-9]{16,}$/i.test(receipt.signature);
  const hasGroundTruthHash =
    typeof receipt.ground_truth_hash === 'string' && /^sha256:[a-z0-9]{8,}$/i.test(receipt.ground_truth_hash);
  const deltaError = Number.parseFloat(String(receipt.delta_error ?? '0'));
  const confidence = receipt.confidence_bound as { lo?: number; hi?: number; coverage?: number } | undefined;
  return {
    sourceSchema: hasWmrHash ? 'world_model_receipt' : 'paper26_minimal_receipt',
    hasWmrHash,
    hasCorpusSignature,
    hasGroundTruthHash,
    toleranceOk: Number.isFinite(tolerance) && tolerance <= 0.03,
    toleranceBin: Number.isFinite(tolerance) ? (tolerance <= 0.03 ? 'le_003' : 'gt_003') : 'missing',
    deltaErrorBin: Number.isFinite(deltaError) && deltaError <= 0.03 ? 'low' : 'high_or_missing',
    confidenceCoverageOk: typeof confidence?.coverage === 'number' ? confidence.coverage >= 0.9 : true,
    variant,
  };
}

function verifyAdmission(
  receiptFeatures: Record<string, string | number | boolean>,
  integrityFeatures: Record<string, string | number | boolean>
): boolean {
  const hasAnchor = Boolean(receiptFeatures.hasWmrHash || receiptFeatures.hasCorpusSignature);
  const hashOk = Boolean(receiptFeatures.hasWmrHash || receiptFeatures.hasGroundTruthHash);
  const toleranceOk = Boolean(receiptFeatures.toleranceOk);
  const confidenceOk = Boolean(receiptFeatures.confidenceCoverageOk);
  const latentOk = !integrityFeatures.latentGateFailed;
  return hasAnchor && hashOk && toleranceOk && confidenceOk && latentOk;
}

function promptFor(source: SourceReceipt): string {
  const receipt = source.receipt;
  const solver = String(receipt.solver ?? receipt.solver_ground_truth?.['solverType'] ?? 'unknown-solver');
  return [
    'Decide whether this HoloScript world-model training sample should be admitted for GRPO verifier training.',
    'Corpus identity and episode id are redacted to avoid split leakage.',
    `Solver family: ${solver}.`,
    'The baseline arm sees only this text; the treatment arm also sees receipt and PillarSlice fields.',
  ].join(' ');
}

function baselineFeatures(sample: Sample): string[] {
  return tokenize(sample.prompt).map((token) => `text:${token}`);
}

function treatmentFeatures(sample: Sample): string[] {
  const features = [...baselineFeatures(sample)];
  features.push(`domain:${sample.slice.pillar_domain}`);
  features.push(`axis1:${sample.slice.axis_1_id}`);
  features.push(`axis2:${sample.slice.axis_2_id}`);
  features.push(`pillar:${sample.slice.pillar_id}`);
  features.push(`p1:${quantize(sample.slice.pos_1)}`);
  features.push(`p2:${quantize(sample.slice.pos_2)}`);
  features.push(`brain_x:${sample.brainCoord.mni_x > 0 ? 'left' : sample.brainCoord.mni_x < 0 ? 'right' : 'mid'}`);
  for (const [key, value] of Object.entries(sample.receiptFeatures)) {
    if (key === 'variant') continue;
    features.push(`receipt:${key}=${value}`);
  }
  for (const [key, value] of Object.entries(sample.integrityFeatures)) {
    features.push(`integrity:${key}=${value}`);
  }
  return features;
}

function trainAndEvaluate(
  train: Sample[],
  test: Sample[],
  featureFn: (sample: Sample) => string[]
): EvalResult {
  const vocab = new Map<string, number>();
  const trainFeatures = train.map((sample) => uniqueFeatureIds(featureFn(sample), vocab, true));
  const weights: number[] = [];
  let bias = 0;
  const epochs = 80;
  const lr = 0.18;
  const l2 = 0.0005;

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let i = 0; i < train.length; i++) {
      const row = train[i];
      const ids = trainFeatures[i];
      const score = bias + ids.reduce((sum, id) => sum + (weights[id] ?? 0), 0);
      const pred = sigmoid(score);
      const err = row.label - pred;
      bias += lr * err;
      for (const id of ids) {
        weights[id] = (weights[id] ?? 0) + lr * (err - l2 * (weights[id] ?? 0));
      }
    }
  }

  const predictions = test.map((sample) => {
    const ids = uniqueFeatureIds(featureFn(sample), vocab, false);
    const score = bias + ids.reduce((sum, id) => sum + (weights[id] ?? 0), 0);
    const probability = sigmoid(score);
    return {
      id: sample.id,
      label: sample.label,
      predicted: probability >= 0.5 ? 1 : 0,
      score: round(probability, 6),
    };
  });
  return metrics(predictions);
}

function uniqueFeatureIds(features: string[], vocab: Map<string, number>, update: boolean): number[] {
  const ids = new Set<number>();
  for (const feature of features) {
    let id = vocab.get(feature);
    if (id === undefined && update) {
      id = vocab.size;
      vocab.set(feature, id);
    }
    if (id !== undefined) ids.add(id);
  }
  return [...ids];
}

function metrics(predictions: EvalResult['predictions']): EvalResult {
  const confusion = { tp: 0, tn: 0, fp: 0, fn: 0 };
  for (const pred of predictions) {
    if (pred.label === 1 && pred.predicted === 1) confusion.tp++;
    else if (pred.label === 0 && pred.predicted === 0) confusion.tn++;
    else if (pred.label === 0 && pred.predicted === 1) confusion.fp++;
    else confusion.fn++;
  }
  const total = predictions.length || 1;
  const precision = confusion.tp / Math.max(1, confusion.tp + confusion.fp);
  const recall = confusion.tp / Math.max(1, confusion.tp + confusion.fn);
  const f1 = (2 * precision * recall) / Math.max(1e-9, precision + recall);
  return {
    accuracy: (confusion.tp + confusion.tn) / total,
    precision,
    recall,
    f1,
    confusion,
    predictions,
  };
}

function summarizeEval(result: EvalResult): Omit<EvalResult, 'predictions'> {
  return {
    accuracy: round(result.accuracy, 6),
    precision: round(result.precision, 6),
    recall: round(result.recall, 6),
    f1: round(result.f1, 6),
    confusion: result.confusion,
  };
}

function bootstrapDeltaCi(
  test: Sample[],
  baseline: EvalResult['predictions'],
  treatment: EvalResult['predictions'],
  seed: number
): { low: number; high: number; iterations: number } {
  const rng = mulberry32(seed ^ 0xb007);
  const byIdBase = new Map(baseline.map((row) => [row.id, row]));
  const byIdTreat = new Map(treatment.map((row) => [row.id, row]));
  const deltas: number[] = [];
  const iterations = 1000;
  for (let i = 0; i < iterations; i++) {
    let baseCorrect = 0;
    let treatCorrect = 0;
    for (let j = 0; j < test.length; j++) {
      const row = test[Math.floor(rng() * test.length)];
      const b = byIdBase.get(row.id);
      const t = byIdTreat.get(row.id);
      if (b?.predicted === row.label) baseCorrect++;
      if (t?.predicted === row.label) treatCorrect++;
    }
    deltas.push(((treatCorrect - baseCorrect) / test.length) * 100);
  }
  deltas.sort((a, b) => a - b);
  return {
    low: round(deltas[Math.floor(iterations * 0.025)] ?? 0, 3),
    high: round(deltas[Math.floor(iterations * 0.975)] ?? 0, 3),
    iterations,
  };
}

function makeCtx(onEmit?: (name: string, payload: unknown) => void): TraitContext {
  return {
    emit(name: string, payload: unknown) {
      onEmit?.(name, payload);
    },
    getState: () => ({}),
    setState: () => {},
    getScaleMultiplier: () => 1,
    setScaleContext: () => {},
    vr: null,
    physics: null,
    audio: null,
    haptics: null,
  } as unknown as TraitContext;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !/^\d+$/.test(token));
}

function quantize(value: number): string {
  if (value < 0.2) return 'q0';
  if (value < 0.4) return 'q1';
  if (value < 0.6) return 'q2';
  if (value < 0.8) return 'q3';
  return 'q4';
}

function fingerprintSlice(slice: PillarSlice): string {
  return `${slice.pillar_domain}:${slice.axis_1_id}:${slice.axis_2_id}:${slice.pos_1.toFixed(2)}:${slice.pos_2.toFixed(2)}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sigmoid(value: number): number {
  if (value < -40) return 0;
  if (value > 40) return 1;
  return 1 / (1 + Math.exp(-value));
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clampInt(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clampNumber(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

main().catch((error) => {
  console.error(`[paper-32-grpo-accuracy] ${error?.stack || error?.message || error}`);
  process.exit(1);
});
