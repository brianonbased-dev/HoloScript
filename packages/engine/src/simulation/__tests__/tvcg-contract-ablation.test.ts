/**
 * TVCG Trust-by-Construction per-guarantee ablation.
 *
 * Measures a TET4-shaped contract step operation with one guarantee removed at
 * a time. The benchmark intentionally isolates the contract shell from the
 * structural solver's PCG loop, because the paper's full-solver table is
 * dominated by V8/GC scheduling variance.
 *
 * Run:
 *   $env:TVCG_ABLATION_WRITE='1'; pnpm --filter @holoscript/engine exec vitest run src/simulation/__tests__/tvcg-contract-ablation.test.ts
 *
 * Optional:
 *   $env:TVCG_ABLATION_SAMPLES='40'
 *   $env:TVCG_ABLATION_ITERATIONS='50'
 *   $env:TVCG_ABLATION_STEPS='10'
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FieldData, SimSolver } from '../SimSolver';
import {
  computeStateDigest,
  DeterministicStepper,
  hashGeometry,
  validateMeshSanity,
  validatePhysicsSanity,
  validateUnits,
  type ContractViolation,
} from '../SimulationContract';

type GuaranteeId =
  | 'geometry-integrity'
  | 'unit-validation'
  | 'deterministic-stepping'
  | 'interaction-provenance'
  | 'auto-provenance'
  | 'exact-replay';

interface GuaranteeSpec {
  id: GuaranteeId;
  label: string;
  behavioralConsequence: string;
}

const GUARANTEES: readonly GuaranteeSpec[] = [
  {
    id: 'geometry-integrity',
    label: 'Geometry integrity',
    behavioralConsequence:
      'Mesh/render divergence and malformed connectivity are no longer rejected.',
  },
  {
    id: 'unit-validation',
    label: 'Unit validation',
    behavioralConsequence: 'Out-of-range physical quantities can pass as raw numbers.',
  },
  {
    id: 'deterministic-stepping',
    label: 'Deterministic stepping',
    behavioralConsequence: 'Frame-rate-dependent stepping can change replayed state trajectories.',
  },
  {
    id: 'interaction-provenance',
    label: 'Interaction provenance',
    behavioralConsequence: 'User actions that changed solver state disappear from the receipt.',
  },
  {
    id: 'auto-provenance',
    label: 'Auto-provenance',
    behavioralConsequence: 'The run no longer emits a config/result/timing evidence record.',
  },
  {
    id: 'exact-replay',
    label: 'Exact replay',
    behavioralConsequence: 'A reviewer cannot reconstruct the run from a replay envelope.',
  },
];

interface TvcgMesh {
  vertices: Float32Array;
  tetrahedra: Uint32Array;
  nodeCount: number;
  elementCount: number;
}

interface TvcgConfig {
  vertices: Float32Array;
  tetrahedra: Uint32Array;
  elementType: 'tet4';
  material: {
    density: number;
    youngs_modulus: number;
    poisson_ratio: number;
    yield_strength: number;
  };
  loads: Array<{ id: string; type: 'point'; nodeIndex: number; force: [number, number, number] }>;
  constraints: Array<{ id: string; type: 'fixed'; nodes: number[] }>;
}

interface TimingStats {
  medianMsPerStep: number;
  p99MsPerStep: number;
  opsPerSecond: number;
}

interface AblationRow extends TimingStats {
  guarantee: GuaranteeId;
  label: string;
  pairedFullMsPerStep: number;
  disabledMsPerStep: number;
  contributionMsPerStep: number;
  contributionP99MsPerStep: number;
  contributionPctOfFull: number;
  contributionPctOfContractOverhead: number;
  behavioralConsequence: string;
}

interface AblationArtifact {
  generatedAt: string;
  schema: 'tvcg.contract-ablation.v1';
  harness: string;
  method: {
    samples: number;
    iterationsPerSample: number;
    stepsPerRun: number;
    fixedDt: number;
    warmupSamples: number;
    timing: string;
  };
  host: {
    platform: NodeJS.Platform;
    arch: string;
    node: string;
    vitest: string;
  };
  workload: {
    mesh: {
      nodeCount: number;
      elementCount: number;
      dof: number;
      geometryHash: string;
    };
    note: string;
  };
  baselineBare: TimingStats;
  fullContract: TimingStats & {
    overheadVsBarePct: number;
    overheadVsBareMsPerStep: number;
  };
  rows: AblationRow[];
  artifactSha256?: string;
}

const FIXED_DT = 1 / 60;
const DEFAULT_SAMPLES = 16;
const DEFAULT_ITERATIONS = 30;
const DEFAULT_STEPS = 10;
const WARMUP_SAMPLES = 4;
const require = createRequire(import.meta.url);

function vitestVersion(): string {
  const packageInfo = require('vitest/package.json') as { version?: unknown };
  return typeof packageInfo.version === 'string' ? packageInfo.version : 'unknown';
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function makeIndependentTetMesh(elementCount: number): TvcgMesh {
  const vertices = new Float32Array(elementCount * 4 * 3);
  const tetrahedra = new Uint32Array(elementCount * 4);

  for (let e = 0; e < elementCount; e++) {
    const baseNode = e * 4;
    const offset = e * 2.5;
    const coords = [
      [offset, 0, 0],
      [offset + 1, 0, 0],
      [offset, 1, 0],
      [offset, 0, 1],
    ];
    for (let n = 0; n < coords.length; n++) {
      const [x, y, z] = coords[n];
      const vi = (baseNode + n) * 3;
      vertices[vi] = x;
      vertices[vi + 1] = y;
      vertices[vi + 2] = z;
      tetrahedra[baseNode + n] = baseNode + n;
    }
  }

  return {
    vertices,
    tetrahedra,
    nodeCount: vertices.length / 3,
    elementCount,
  };
}

function makeConfig(mesh: TvcgMesh): TvcgConfig {
  return {
    vertices: mesh.vertices,
    tetrahedra: mesh.tetrahedra,
    elementType: 'tet4',
    material: {
      density: 7850,
      youngs_modulus: 210_000,
      poisson_ratio: 0.3,
      yield_strength: 400,
    },
    loads: [{ id: 'p0', type: 'point', nodeIndex: mesh.nodeCount - 1, force: [10, 0, 0] }],
    constraints: [{ id: 'fix0', type: 'fixed', nodes: [0, 1, 2] }],
  };
}

function cloneConfig(config: TvcgConfig): TvcgConfig {
  return {
    ...config,
    vertices: new Float32Array(config.vertices),
    tetrahedra: new Uint32Array(config.tetrahedra),
    material: { ...config.material },
    loads: config.loads.map((load) => ({ ...load, force: [...load.force] })),
    constraints: config.constraints.map((constraint) => ({
      ...constraint,
      nodes: [...constraint.nodes],
    })),
  };
}

class TvcgProbeSolver implements SimSolver {
  readonly mode = 'transient' as const;
  readonly fieldNames = ['displacement', 'stress'] as const;

  private readonly displacement: Float32Array;
  private readonly stress: Float32Array;
  private time = 0;
  private steps = 0;

  constructor(private readonly mesh: TvcgMesh) {
    this.displacement = new Float32Array(mesh.nodeCount * 3);
    this.stress = new Float32Array(mesh.elementCount);
  }

  step(dt: number): void {
    this.time += dt;
    this.steps++;
    const t = this.time;
    for (let i = 0; i < this.displacement.length; i += 3) {
      const node = i / 3;
      this.displacement[i] += dt * (1 + (node % 7) * 0.001);
      this.displacement[i + 1] += dt * 0.5;
      this.displacement[i + 2] += Math.sin(t + node * 0.01) * 1e-5;
    }
    for (let e = 0; e < this.stress.length; e++) {
      this.stress[e] = 1000 + e * 0.01 + this.steps * 0.1;
    }
  }

  solve(): void {
    this.step(FIXED_DT);
  }

  getField(name: string): FieldData | null {
    if (name === 'displacement') return this.displacement;
    if (name === 'stress') return this.stress;
    return null;
  }

  getStats(): Record<string, unknown> {
    return {
      currentTime: this.time,
      steps: this.steps,
      nodeCount: this.mesh.nodeCount,
      elementCount: this.mesh.elementCount,
      converged: true,
    };
  }

  dispose(): void {}
}

function runBareProbe(mesh: TvcgMesh, steps: number): void {
  const solver = new TvcgProbeSolver(mesh);
  for (let i = 0; i < steps; i++) solver.step(FIXED_DT);
  solver.dispose();
}

function runContractShell(
  mesh: TvcgMesh,
  config: TvcgConfig,
  steps: number,
  disabled?: GuaranteeId
): void {
  const configForRun = disabled === 'auto-provenance' ? config : cloneConfig(config);
  const solver = new TvcgProbeSolver(mesh);
  const violations: ContractViolation[] = [];
  let geometryHash = 'geometry-disabled';

  if (disabled !== 'geometry-integrity') {
    geometryHash = hashGeometry(configForRun.vertices, configForRun.tetrahedra);
    violations.push(...validateMeshSanity(configForRun.vertices, configForRun.tetrahedra));
    violations.push(
      ...validatePhysicsSanity(configForRun.vertices, configForRun.tetrahedra, configForRun)
    );
  }

  if (disabled !== 'unit-validation') {
    violations.push(...validateUnits(configForRun));
  }

  const stateDigests: string[] = [];
  const interactions: Array<Record<string, unknown>> = [];
  const stepper = new DeterministicStepper(FIXED_DT, 0.1);

  for (let i = 0; i < steps; i++) {
    if (disabled !== 'geometry-integrity') {
      const currentHash = hashGeometry(configForRun.vertices, configForRun.tetrahedra);
      if (currentHash !== geometryHash) throw new Error('geometry hash drift');
    }

    if (disabled === 'deterministic-stepping') {
      solver.step(FIXED_DT);
    } else {
      stepper.advance(FIXED_DT, (dt) => {
        solver.step(dt);
        stateDigests.push(computeStateDigest(solver, 'fnv1a'));
      });
    }

    if (disabled !== 'interaction-provenance') {
      interactions.push({
        id: i,
        simTime: i * FIXED_DT,
        type: 'load-adjust',
        nodeIndex: mesh.nodeCount - 1,
        forceX: 10 + i,
      });
    }
  }

  let provenance: Record<string, unknown> | undefined;
  if (disabled !== 'auto-provenance') {
    provenance = {
      geometryHash,
      config: configForRun,
      totalSteps: disabled === 'deterministic-stepping' ? steps : stepper.getStepCount(),
      totalSimTime: disabled === 'deterministic-stepping' ? steps * FIXED_DT : stepper.getSimTime(),
      interactions,
      finalStats: solver.getStats(),
      contractViolations: violations,
      finalStateDigest: stateDigests[stateDigests.length - 1] ?? '',
      verified: !violations.some((v) => v.severity === 'error'),
    };
  }

  if (disabled !== 'exact-replay') {
    const replay = {
      config: configForRun,
      geometryHash,
      interactions,
      totalSteps: disabled === 'deterministic-stepping' ? steps : stepper.getStepCount(),
      provenancePresent: provenance !== undefined,
    };
    if (disabled !== 'geometry-integrity') {
      const replayHash = hashGeometry(replay.config.vertices, replay.config.tetrahedra);
      if (replayHash !== replay.geometryHash) throw new Error('replay geometry mismatch');
    }
  }

  solver.dispose();
}

function median(sorted: number[]): number {
  const n = sorted.length;
  return n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
}

function timeVariant(
  fn: () => void,
  samples: number,
  iterationsPerSample: number,
  stepsPerRun: number
): TimingStats {
  for (let i = 0; i < WARMUP_SAMPLES; i++) {
    for (let j = 0; j < iterationsPerSample; j++) fn();
  }

  const sampleMsPerStep: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    for (let j = 0; j < iterationsPerSample; j++) fn();
    const elapsedMs = performance.now() - start;
    sampleMsPerStep.push(elapsedMs / iterationsPerSample / stepsPerRun);
  }

  const sorted = [...sampleMsPerStep].sort((a, b) => a - b);
  const medianMsPerStep = median(sorted);
  const p99MsPerStep = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
  return {
    medianMsPerStep,
    p99MsPerStep,
    opsPerSecond: 1000 / medianMsPerStep,
  };
}

function measureSampleMsPerStep(
  fn: () => void,
  iterationsPerSample: number,
  stepsPerRun: number
): number {
  const start = performance.now();
  for (let j = 0; j < iterationsPerSample; j++) fn();
  return (performance.now() - start) / iterationsPerSample / stepsPerRun;
}

function statsFromSamples(sampleMsPerStep: number[]): TimingStats {
  const sorted = [...sampleMsPerStep].sort((a, b) => a - b);
  const medianMsPerStep = median(sorted);
  const p99MsPerStep = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
  return {
    medianMsPerStep,
    p99MsPerStep,
    opsPerSecond: 1000 / medianMsPerStep,
  };
}

function timePairedVariant(
  fullFn: () => void,
  disabledFn: () => void,
  samples: number,
  iterationsPerSample: number,
  stepsPerRun: number
): {
  full: TimingStats;
  disabled: TimingStats;
  contribution: { medianMsPerStep: number; p99MsPerStep: number };
} {
  for (let i = 0; i < WARMUP_SAMPLES; i++) {
    for (let j = 0; j < iterationsPerSample; j++) {
      fullFn();
      disabledFn();
    }
  }

  const disabledSamples: number[] = [];
  const fullSamples: number[] = [];
  const contributionSamples: number[] = [];
  for (let i = 0; i < samples; i++) {
    let fullMs: number;
    let disabledMs: number;
    if (i % 2 === 0) {
      fullMs = measureSampleMsPerStep(fullFn, iterationsPerSample, stepsPerRun);
      disabledMs = measureSampleMsPerStep(disabledFn, iterationsPerSample, stepsPerRun);
    } else {
      disabledMs = measureSampleMsPerStep(disabledFn, iterationsPerSample, stepsPerRun);
      fullMs = measureSampleMsPerStep(fullFn, iterationsPerSample, stepsPerRun);
    }
    fullSamples.push(fullMs);
    disabledSamples.push(disabledMs);
    contributionSamples.push(fullMs - disabledMs);
  }

  const contributionSorted = [...contributionSamples].sort((a, b) => a - b);
  return {
    full: statsFromSamples(fullSamples),
    disabled: statsFromSamples(disabledSamples),
    contribution: {
      medianMsPerStep: median(contributionSorted),
      p99MsPerStep:
        contributionSorted[
          Math.min(contributionSorted.length - 1, Math.floor(contributionSorted.length * 0.99))
        ],
    },
  };
}

function formatStamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function repoRootFromTestFile(): string {
  const __dir = dirname(fileURLToPath(import.meta.url));
  return resolve(__dir, '..', '..', '..', '..', '..');
}

function writeArtifact(artifact: AblationArtifact): string | null {
  if (process.env.TVCG_ABLATION_WRITE !== '1') return null;
  const repoRoot = repoRootFromTestFile();
  const benchLogsDir = resolve(repoRoot, '.bench-logs');
  if (!existsSync(benchLogsDir)) mkdirSync(benchLogsDir, { recursive: true });
  const stamp = process.env.TVCG_ABLATION_STAMP ?? formatStamp();
  const artifactPath = resolve(benchLogsDir, `tvcg-ablation-${stamp}.json`);
  const bodyWithoutHash = JSON.stringify(artifact, null, 2) + '\n';
  const sha256 = createHash('sha256').update(bodyWithoutHash).digest('hex');
  const withHash = { ...artifact, artifactSha256: sha256 };
  writeFileSync(artifactPath, JSON.stringify(withHash, null, 2) + '\n', 'utf8');
  return relative(repoRoot, artifactPath).replace(/\\/g, '/');
}

describe('TVCG contract per-guarantee ablation', () => {
  it('measures per-guarantee contract-shell contribution and optionally writes artifact', () => {
    const samples = envInt('TVCG_ABLATION_SAMPLES', DEFAULT_SAMPLES);
    const iterationsPerSample = envInt('TVCG_ABLATION_ITERATIONS', DEFAULT_ITERATIONS);
    const stepsPerRun = envInt('TVCG_ABLATION_STEPS', DEFAULT_STEPS);
    const mesh = makeIndependentTetMesh(40);
    const config = makeConfig(mesh);
    const geometryHash = hashGeometry(config.vertices, config.tetrahedra);

    const baselineBare = timeVariant(
      () => runBareProbe(mesh, stepsPerRun),
      samples,
      iterationsPerSample,
      stepsPerRun
    );
    const fullContract = timeVariant(
      () => runContractShell(mesh, config, stepsPerRun),
      samples,
      iterationsPerSample,
      stepsPerRun
    );

    const contractOverheadMs = fullContract.medianMsPerStep - baselineBare.medianMsPerStep;
    const rows = GUARANTEES.map((guarantee): AblationRow => {
      const paired = timePairedVariant(
        () => runContractShell(mesh, config, stepsPerRun),
        () => runContractShell(mesh, config, stepsPerRun, guarantee.id),
        samples,
        iterationsPerSample,
        stepsPerRun
      );
      const contributionMsPerStep = paired.contribution.medianMsPerStep;
      return {
        guarantee: guarantee.id,
        label: guarantee.label,
        ...paired.disabled,
        pairedFullMsPerStep: paired.full.medianMsPerStep,
        disabledMsPerStep: paired.disabled.medianMsPerStep,
        contributionMsPerStep,
        contributionP99MsPerStep: paired.contribution.p99MsPerStep,
        contributionPctOfFull: (contributionMsPerStep / paired.full.medianMsPerStep) * 100,
        contributionPctOfContractOverhead:
          contractOverheadMs === 0 ? 0 : (contributionMsPerStep / contractOverheadMs) * 100,
        behavioralConsequence: guarantee.behavioralConsequence,
      };
    });

    const artifact: AblationArtifact = {
      generatedAt: new Date().toISOString(),
      schema: 'tvcg.contract-ablation.v1',
      harness: 'packages/engine/src/simulation/__tests__/tvcg-contract-ablation.test.ts',
      method: {
        samples,
        iterationsPerSample,
        stepsPerRun,
        fixedDt: FIXED_DT,
        warmupSamples: WARMUP_SAMPLES,
        timing:
          'median/p99 of per-step wall time; row contributions use paired full-vs-disabled samples with alternating order',
      },
      host: {
        platform: process.platform,
        arch: process.arch,
        node: process.versions.node,
        vitest: vitestVersion(),
      },
      workload: {
        mesh: {
          nodeCount: mesh.nodeCount,
          elementCount: mesh.elementCount,
          dof: mesh.nodeCount * 3,
          geometryHash,
        },
        note: 'TET4-shaped transient probe isolates contract-shell overhead from the structural PCG solver loop.',
      },
      baselineBare,
      fullContract: {
        ...fullContract,
        overheadVsBareMsPerStep: contractOverheadMs,
        overheadVsBarePct: (contractOverheadMs / baselineBare.medianMsPerStep) * 100,
      },
      rows,
    };

    const path = writeArtifact(artifact);
    if (path) {
      console.log(`[tvcg-ablation] wrote ${path}`);
    }

    expect(rows).toHaveLength(6);
    expect(fullContract.medianMsPerStep).toBeGreaterThan(0);
    expect(baselineBare.medianMsPerStep).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Number.isFinite(row.contributionPctOfFull)).toBe(true);
      expect(row.opsPerSecond).toBeGreaterThan(0);
    }
  });
});
