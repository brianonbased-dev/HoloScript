import type { Gate } from './EvolveProgramBackend';

export interface WasmFitnessArtifact {
  wat: string;
  memoryLayout: {
    totalSize: number;
  };
}

export interface WasmFitnessBaseline {
  scenarioId: string;
  score: number;
  watLength?: number;
  memoryTotalSize?: number;
  source?: string;
}

export interface WasmFitnessMeasurement {
  passed: boolean;
  score: number;
  watLength: number;
  memoryTotalSize: number;
  baselineScore: number | null;
  improvementPct: number | null;
  note: string;
}

export interface WasmFitnessOptions {
  baseline?: WasmFitnessBaseline | null;
  minMemoryTotalSize?: number;
  requireImprovement?: boolean;
}

export type WasmCompileCandidate = (
  candidateCode: string
) => WasmFitnessArtifact | Promise<WasmFitnessArtifact>;

export type WasmCandidateCorrectness = (
  candidateCode: string
) => { passed: boolean; note?: string } | Promise<{ passed: boolean; note?: string }>;

export interface WasmFitnessGateOptions extends WasmFitnessOptions {
  correctness?: WasmCandidateCorrectness;
}

function numberField(obj: Record<string, unknown>, key: string): number | null {
  const value = obj[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function roundScore(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function improvementPct(baselineScore: number | null, score: number): number | null {
  if (baselineScore === null || baselineScore <= 0) return null;
  return Math.round(((baselineScore - score) / baselineScore) * 1000) / 10;
}

export function wasmFitnessBaselineFromScenario(
  scenarioId: string,
  scenario: Record<string, unknown>,
  source = 'benchmarks/baseline.json'
): WasmFitnessBaseline | null {
  const directScore = numberField(scenario, 'wasmDensity') ?? numberField(scenario, 'fitnessScore');
  const watLength = numberField(scenario, 'watLength');
  const memoryTotalSize = numberField(scenario, 'memoryTotalSize');
  if (directScore !== null) {
    return {
      scenarioId,
      score: directScore,
      ...(watLength !== null ? { watLength } : {}),
      ...(memoryTotalSize !== null ? { memoryTotalSize } : {}),
      source,
    };
  }
  if (watLength !== null && memoryTotalSize !== null && memoryTotalSize > 0) {
    return {
      scenarioId,
      score: roundScore(watLength / memoryTotalSize),
      watLength,
      memoryTotalSize,
      source,
    };
  }
  return null;
}

export function scoreWasmCompilerArtifact(
  artifact: WasmFitnessArtifact,
  opts: WasmFitnessOptions = {}
): WasmFitnessMeasurement {
  const watLength = artifact.wat.length;
  const memoryTotalSize = artifact.memoryLayout.totalSize;
  const minMemoryTotalSize = opts.minMemoryTotalSize ?? 1;
  if (watLength <= 0) {
    return {
      passed: false,
      score: Infinity,
      watLength,
      memoryTotalSize,
      baselineScore: opts.baseline?.score ?? null,
      improvementPct: null,
      note: 'empty_wat',
    };
  }
  if (!Number.isFinite(memoryTotalSize) || memoryTotalSize < minMemoryTotalSize) {
    return {
      passed: false,
      score: Infinity,
      watLength,
      memoryTotalSize,
      baselineScore: opts.baseline?.score ?? null,
      improvementPct: null,
      note: 'invalid_memory_layout',
    };
  }
  const score = roundScore(watLength / memoryTotalSize);
  const baselineScore = opts.baseline?.score ?? null;
  const pct = improvementPct(baselineScore, score);
  const passesImprovementGate = !opts.requireImprovement || (pct !== null && pct > 0);
  return {
    passed: passesImprovementGate,
    score,
    watLength,
    memoryTotalSize,
    baselineScore,
    improvementPct: pct,
    note: passesImprovementGate ? 'wasm_density_measured' : 'no_baseline_improvement',
  };
}

export function makeWasmCompilerFitnessGate(
  compileCandidate: WasmCompileCandidate,
  opts: WasmFitnessGateOptions = {}
): Gate {
  return async (candidateCode) => {
    const correctness = opts.correctness ? await opts.correctness(candidateCode) : { passed: true };
    if (!correctness.passed) {
      return { passed: false, score: Infinity };
    }
    try {
      const artifact = await compileCandidate(candidateCode);
      const measured = scoreWasmCompilerArtifact(artifact, opts);
      return { passed: measured.passed, score: measured.score };
    } catch {
      return { passed: false, score: Infinity };
    }
  };
}
