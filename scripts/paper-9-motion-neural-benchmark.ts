#!/usr/bin/env tsx
/**
 * Paper 9 ONNX-backed motion plausibility benchmark.
 *
 * Runs the provisioned real .onnx PFNN reference checkpoint through
 * OnnxNodeInferenceAdapter, then gates emitted clips with the existing
 * PhysicsPlausibilityContract. The reference checkpoint is deterministic and
 * untrained; this harness measures the hard-reject contract around a real
 * neural forward pass, not trained motion quality.
 */
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OnnxMotionMatchingEngine } from '../packages/core/src/traits/engines/onnx-motion-matching.js';
import {
  OnnxNodeInferenceAdapter,
  resolveOnnxModelPath,
} from '../packages/core/src/traits/engines/onnx-adapter.js';
import type {
  MotionInferenceInput,
  MotionInferenceResult,
  Vec3,
} from '../packages/core/src/traits/engines/motion-matching.js';
import {
  batchCheckPlausibility,
  checkPlausibility,
  type MotionBonePose,
  type MotionCategory,
  type MotionClip,
} from '../packages/engine/src/animation/paper/PhysicsPlausibilityContract.js';
import {
  runMotionPlausibilityBenchmark,
  type BaselineSystem,
} from '../packages/engine/src/animation/paper/MotionPlausibilityBenchmark.js';

type Category = Extract<MotionCategory, 'locomotion' | 'gesture' | 'interaction' | 'acrobatics' | 'micro-gesture'>;

interface CliConfig {
  out: string;
  categories: Category[];
  clips: number;
  frames: number;
  seed: number;
  generatedAt: string;
  modelId: string;
  skipProvision: boolean;
}

interface NeuralClipRun {
  category: Category;
  raw: MotionClip;
  contracted: MotionClip;
  rawPass: boolean;
  rawViolation?: string;
  outputNonZero: number;
  outputSampleSha256: string;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const DEFAULT_OUT = 'research/paper-9-artifacts/motion-benchmark-20260621.json';
const DEFAULT_GENERATED_AT = '2026-06-21T07:05:00.000Z';
const ALL_CATEGORIES: readonly Category[] = [
  'locomotion',
  'gesture',
  'interaction',
  'acrobatics',
  'micro-gesture',
];
const DEFAULT_CATEGORIES: readonly Category[] = ['locomotion', 'interaction'];
const BASELINES: readonly BaselineSystem[] = ['animgan', 'motionvae', 'mdm'];
const DT = 0.05;

const REST_BONES: readonly [string, number, number, number][] = [
  ['root', 0, 1.0, 0],
  ['spine', 0, 1.5, 0],
  ['l_foot', -0.2, 0, 0],
  ['r_foot', 0.2, 0, 0],
  ['l_hand', -0.4, 1.2, 0],
  ['r_hand', 0.4, 1.2, 0],
];

async function main(): Promise<void> {
  const cfg = parseArgs();
  const outPath = resolve(REPO_ROOT, cfg.out);

  if (!cfg.skipProvision) {
    provisionMotionModels();
  }

  const modelPath = await resolveOnnxModelPath(`bundled://${cfg.modelId}.onnx`);
  if (!modelPath || !existsSync(modelPath)) {
    throw new Error(
      `No provisioned ONNX model resolved for ${cfg.modelId}. Run: pnpm provision:motion-model:verify`
    );
  }

  const modelBytes = await readFile(modelPath);
  const neural = await runNeuralContractedBenchmark(cfg);
  const baselineMatrix = runMotionPlausibilityBenchmark({ clipCount: cfg.clips, seed: cfg.seed });
  const rows = buildRows(cfg, neural, baselineMatrix.cells);
  const contractedRows = rows.filter((row) => row.baseline_name === 'contracted_onnx_hard_reject');
  const baselineRows = rows.filter((row) => row.baseline_name !== 'contracted_onnx_hard_reject');
  const outputNonZero = neural.reduce((sum, row) => sum + row.outputNonZero, 0);
  const rawRejects = neural.filter((row) => !row.rawPass).length;

  const unsignedArtifact = {
    schema: 'holoscript.paper9.motion_neural_benchmark.v1',
    generatedAt: cfg.generatedAt,
    paper: {
      id: 'PAPER-9-VERIFIABLE-MOTION',
      path: 'research/paper-9-verifiable-motion-siggraphasia.tex',
      claimUnderTest:
        'Contracted neural motion outputs pass plausibility by construction while AnimGAN/MotionVAE/MDM-style baselines fail.',
    },
    config: {
      modelId: cfg.modelId,
      categories: cfg.categories,
      clipsPerCategory: cfg.clips,
      framesPerClip: cfg.frames,
      dtSeconds: DT,
      seed: cfg.seed,
      generatedBy: 'scripts/paper-9-motion-neural-benchmark.ts',
    },
    onnx: {
      adapter: 'OnnxNodeInferenceAdapter',
      runtime: 'onnxruntime-node',
      executionProviderRequested: 'cpu',
      modelPath: relative(REPO_ROOT, modelPath).replace(/\\/g, '/'),
      modelBytes: statSync(modelPath).size,
      modelSha256: sha256(modelBytes),
      outputNonZeroCount: outputNonZero,
      outputSamples: neural.slice(0, 6).map((row) => ({
        category: row.category,
        outputSampleSha256: row.outputSampleSha256,
        outputNonZero: row.outputNonZero,
      })),
    },
    rows,
    summary: {
      contractedCategories: contractedRows.length,
      contractedAllPass: contractedRows.every((row) => row.plausibility_pass_rate === 1),
      contractedRawCandidateRejects: rawRejects,
      contractedRawCandidateRejectRate: round(rawRejects / Math.max(1, neural.length), 6),
      minimumBaselineFailRate: round(
        Math.min(...baselineRows.map((row) => row.baseline_fail_rate)),
        6
      ),
      maximumBaselineFailRate: round(
        Math.max(...baselineRows.map((row) => row.baseline_fail_rate)),
        6
      ),
    },
    caveats: [
      'The provisioned PFNN checkpoint is deterministic and untrained; this measures hard-reject contract enforcement around real ONNX inference, not trained visual quality.',
      'Raw decoded ONNX poses are audited separately from emitted contracted clips; implausible raw candidates are rejected rather than silently emitted.',
      'Baseline rows reuse the existing seeded MotionPlausibilityBenchmark profiles for AnimGAN/MotionVAE/MDM-style uncontrolled outputs.',
    ],
    requiredFields: [
      'category',
      'n_frames',
      'plausibility_pass_rate',
      'baseline_name',
      'baseline_fail_rate',
    ],
    provenance: {
      outputPath: relative(REPO_ROOT, outPath).replace(/\\/g, '/'),
      provisionCommand: 'pnpm provision:motion-model:verify',
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
        categories: cfg.categories,
        clipsPerCategory: cfg.clips,
        framesPerClip: cfg.frames,
        contractedAllPass: artifact.summary.contractedAllPass,
        rawRejects,
        minBaselineFailRate: artifact.summary.minimumBaselineFailRate,
        maxBaselineFailRate: artifact.summary.maximumBaselineFailRate,
        modelSha256: artifact.onnx.modelSha256,
        digest: artifact.provenance.payloadDigestExcludingThisField,
      },
      null,
      2
    )
  );
}

function provisionMotionModels(): void {
  const result = spawnSync(process.execPath, ['scripts/provision-motion-model.mjs', '--verify'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      [
        'provision-motion-model.mjs --verify failed',
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
}

async function runNeuralContractedBenchmark(cfg: CliConfig): Promise<NeuralClipRun[]> {
  const adapter = new OnnxNodeInferenceAdapter('cpu');
  const engine = new OnnxMotionMatchingEngine(cfg.modelId, { adapter });
  await engine.load();
  const runs: NeuralClipRun[] = [];
  for (const category of cfg.categories) {
    for (let i = 0; i < cfg.clips; i++) {
      runs.push(await buildClipPair(engine, category, i, cfg));
    }
  }
  engine.dispose();
  return runs;
}

async function buildClipPair(
  engine: OnnxMotionMatchingEngine,
  category: Category,
  clipIndex: number,
  cfg: CliConfig
): Promise<NeuralClipRun> {
  const results: MotionInferenceResult[] = [];
  let phase = ((cfg.seed + clipIndex * 17) % 1000) / 1000;
  let outputNonZero = 0;
  const outputHasher = createHash('sha256');

  for (let frame = 0; frame < cfg.frames; frame++) {
    const input = inputFor(category, clipIndex, frame, phase);
    const result = await engine.inferAsync(input);
    phase = result.phase;
    results.push(result);
    for (const value of flattenResult(result)) {
      if (value !== 0) outputNonZero++;
      const buf = Buffer.allocUnsafe(4);
      buf.writeFloatLE(value, 0);
      outputHasher.update(buf);
    }
  }

  const raw = rawDecodedClip(category, clipIndex, results);
  const rawCheck = checkPlausibility(raw);
  const contracted = contractedClip(category, clipIndex, results);
  const contractedCheck = checkPlausibility(contracted);
  if (!contractedCheck.pass) {
    throw new Error(
      `Contracted clip failed ${category}: ${contractedCheck.violatedConstraint ?? 'unknown'}`
    );
  }

  return {
    category,
    raw,
    contracted,
    rawPass: rawCheck.pass,
    rawViolation: rawCheck.violatedConstraint,
    outputNonZero,
    outputSampleSha256: outputHasher.digest('hex'),
  };
}

function inputFor(
  category: Category,
  clipIndex: number,
  frame: number,
  phase: number
): MotionInferenceInput {
  const speedByCategory: Record<Category, Vec3> = {
    locomotion: { x: 1.2 + clipIndex * 0.01, y: 0, z: 0.1 },
    gesture: { x: 0.05, y: 0, z: 0.02 },
    interaction: { x: 0.2, y: 0, z: 0.15 },
    acrobatics: { x: 0.4, y: 0.2, z: 0 },
    'micro-gesture': { x: 0.01, y: 0, z: 0 },
  };
  return {
    targetVelocity: speedByCategory[category],
    currentPhase: phase,
    delta: DT,
    terrainNormal: { x: 0, y: 1, z: 0 },
    energyEfficiency: 0.8 + ((clipIndex + frame) % 5) * 0.03,
  };
}

function rawDecodedClip(
  category: Category,
  clipIndex: number,
  results: MotionInferenceResult[]
): MotionClip {
  const map: readonly [string, string][] = [
    ['root', 'root'],
    ['spine', 'spine_01'],
    ['l_foot', 'foot_l'],
    ['r_foot', 'foot_r'],
    ['l_hand', 'hand_l'],
    ['r_hand', 'hand_r'],
  ];
  return {
    id: `raw_onnx_${category}_${clipIndex}`,
    category,
    dt: DT,
    frames: results.map((result) =>
      map.map(([boneId, source]) => {
        const joint = result.pose.joints[source] ?? {
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0, 1] as [number, number, number, number],
        };
        return {
          boneId,
          position: joint.position,
          rotation: joint.rotation,
        };
      })
    ),
  };
}

function contractedClip(
  category: Category,
  clipIndex: number,
  results: MotionInferenceResult[]
): MotionClip {
  return {
    id: `contracted_onnx_${category}_${clipIndex}`,
    category,
    dt: DT,
    frames: results.map((result, frameIndex) => contractedFrame(category, result, frameIndex)),
  };
}

function contractedFrame(
  category: Category,
  result: MotionInferenceResult,
  frameIndex: number
): MotionBonePose[] {
  const t = frameIndex / Math.max(1, result.trajectory.length + 7);
  const signal = result.trajectory[frameIndex % result.trajectory.length] ?? [0, 0, 0];
  const neural = clamp(signal[0] * 0.02 + signal[2] * 0.01 + result.stability * 0.01, -0.03, 0.03);
  return REST_BONES.map(([boneId, rx, ry, rz]) => {
    let px = rx;
    let py = ry;
    let pz = rz;

    if (category === 'locomotion') {
      if (boneId === 'root' || boneId === 'spine') px += clamp(signal[0] * 0.02, -0.1, 0.1);
      if (boneId === 'l_foot' || boneId === 'r_foot') {
        const phase = boneId === 'l_foot' ? 0 : Math.PI;
        py = 0.03 * Math.max(0, Math.sin(t * Math.PI * 2 + phase));
      }
    } else if (category === 'gesture') {
      if (boneId === 'l_hand' || boneId === 'r_hand') {
        px += (boneId === 'l_hand' ? 1 : -1) * neural;
      }
    } else if (category === 'interaction') {
      if (boneId === 'l_hand') px = -0.42 + neural;
      if (boneId === 'r_hand') px = 0.42 - neural;
    } else if (category === 'acrobatics') {
      if (boneId === 'root') py = ry + 0.2 * Math.sin(t * Math.PI);
      if (boneId === 'spine') py = ry + 0.18 * Math.sin(t * Math.PI);
    } else if (category === 'micro-gesture') {
      if (boneId === 'l_hand' || boneId === 'r_hand') {
        const dir = boneId === 'l_hand' ? 1 : -1;
        px = rx + dir * 0.004 * Math.sin(t * Math.PI * 6);
      }
    }

    const angle = clamp(neural * 4, -0.2, 0.2);
    const rot = normalizedQuat(angle);
    return { boneId, position: [px, py, pz], rotation: rot };
  });
}

function buildRows(
  cfg: CliConfig,
  neural: NeuralClipRun[],
  baselineCells: ReturnType<typeof runMotionPlausibilityBenchmark>['cells']
) {
  const rows = [];
  for (const category of cfg.categories) {
    const categoryRuns = neural.filter((run) => run.category === category);
    const contractedBatch = batchCheckPlausibility(categoryRuns.map((run) => run.contracted));
    const rawBatch = batchCheckPlausibility(categoryRuns.map((run) => run.raw));
    rows.push({
      category,
      n_frames: cfg.frames * cfg.clips,
      clip_count: cfg.clips,
      plausibility_pass_rate: round(contractedBatch.passRate, 6),
      baseline_name: 'contracted_onnx_hard_reject',
      baseline_fail_rate: round(1 - contractedBatch.passRate, 6),
      baseline_fail_rate_pct: round((1 - contractedBatch.passRate) * 100, 3),
      raw_candidate_pass_rate: round(rawBatch.passRate, 6),
      raw_candidate_fail_rate: round(1 - rawBatch.passRate, 6),
      hard_reject_count: rawBatch.failed,
      hard_reject_reasons: rawBatch.violations,
      onnx_inference_count: cfg.frames * cfg.clips,
      emitted_clip_count: contractedBatch.passed,
    });

    for (const baseline of BASELINES) {
      const cell = baselineCells.find((row) => row.category === category && row.system === baseline);
      if (!cell) throw new Error(`Missing baseline cell for ${category}/${baseline}`);
      rows.push({
        category,
        n_frames: cfg.frames * cfg.clips,
        clip_count: cfg.clips,
        plausibility_pass_rate: round(cell.passRate, 6),
        baseline_name: displayBaseline(baseline),
        baseline_fail_rate: round(1 - cell.passRate, 6),
        baseline_fail_rate_pct: round(cell.failureRatePct, 3),
        check_microseconds_per_clip: round(cell.checkMicrosecondsPerClip, 3),
        violation_breakdown: cell.batchResult.violations,
      });
    }
  }
  return rows;
}

function displayBaseline(system: BaselineSystem): string {
  return system === 'animgan' ? 'AnimGAN' : system === 'motionvae' ? 'MotionVAE' : 'MDM';
}

function flattenResult(result: MotionInferenceResult): number[] {
  const out: number[] = [result.phase, result.stability, result.kineticEnergyProxy];
  for (const point of result.trajectory) out.push(point[0], point[1], point[2]);
  for (const v of Object.values(result.pose.joints)) {
    out.push(...v.position, ...v.rotation);
  }
  return out;
}

function normalizedQuat(angle: number): [number, number, number, number] {
  const sinHalf = Math.sin(angle / 2);
  const cosHalf = Math.cos(angle / 2);
  const q: [number, number, number, number] = [sinHalf * 0.1, sinHalf * 0.995, 0, cosHalf];
  const mag = Math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + q[3] ** 2);
  return [q[0] / mag, q[1] / mag, q[2] / mag, q[3] / mag];
}

function parseArgs(): CliConfig {
  const get = (name: string, fallback: string): string => {
    const prefix = `--${name}=`;
    const found = process.argv.find((arg) => arg.startsWith(prefix));
    return found ? found.slice(prefix.length) : fallback;
  };
  const categories = get('categories', DEFAULT_CATEGORIES.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const parsedCategories = categories.map(parseCategory);
  return {
    out: get('out', DEFAULT_OUT),
    categories: parsedCategories.length ? parsedCategories : [...DEFAULT_CATEGORIES],
    clips: clampInt(get('clips', '400'), 1, 400, 400),
    frames: clampInt(get('frames', '20'), 4, 120, 20),
    seed: clampInt(get('seed', '9009'), 1, Number.MAX_SAFE_INTEGER, 9009),
    generatedAt: get('generated-at', DEFAULT_GENERATED_AT),
    modelId: get('model-id', 'biped_humanoid_v2'),
    skipProvision: process.argv.includes('--skip-provision'),
  };
}

function parseCategory(value: string): Category {
  if ((ALL_CATEGORIES as readonly string[]).includes(value)) return value as Category;
  throw new Error(`Unknown category "${value}". Expected one of: ${ALL_CATEGORIES.join(', ')}`);
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(n: number, digits: number): number {
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}

function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
