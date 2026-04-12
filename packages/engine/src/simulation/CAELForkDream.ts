import { CAELRecorder } from './CAELRecorder';
import { type SimSolver } from './SimSolver';
import { type ContractConfig, type SimulationProvenance } from './SimulationContract';
import {
  decodeCAELValue,
  parseCAELJSONL,
  type CAELTrace,
  type CAELTraceEntry,
  verifyCAELHashChain,
} from './CAELTrace';

export type CAELSolverFactory = (config: Record<string, unknown>) => SimSolver;

export interface ForkAlternative {
  id: string;
  apply: (recorder: CAELRecorder, branchIndex: number) => void | Promise<void>;
  metadata?: Record<string, unknown>;
}

export interface ForkBranchResult {
  id: string;
  completed: boolean;
  score: number;
  provenance: SimulationProvenance;
  traceJSONL: string;
  error?: string;
}

export interface ForkAndChooseResult {
  winnerId: string | null;
  branches: ForkBranchResult[];
}

export interface DreamConfig {
  episodes: number;
  steps: number;
  dt: number;
  fields: string[];
  perturbationPercent: number;
  seed: number;
  contractConfigOverride?: ContractConfig;
}

export interface DreamEpisodeResult {
  episode: number;
  completed: boolean;
  perturbations: Array<{ field: string; before: number; after: number }>;
  provenance: SimulationProvenance;
  traceJSONL: string;
  error?: string;
}

export interface DreamResult {
  wakingRunId: string;
  seed: number;
  episodes: DreamEpisodeResult[];
}

function normalizeTrace(trace: string | CAELTrace): CAELTrace {
  return typeof trace === 'string' ? parseCAELJSONL(trace) : trace;
}

function assertValidTrace(trace: CAELTrace): void {
  const result = verifyCAELHashChain(trace);
  if (!result.valid) {
    throw new Error(`Invalid CAEL trace: ${result.reason ?? 'unknown hash-chain error'}`);
  }
}

function readInit(trace: CAELTrace): {
  config: Record<string, unknown>;
  contractConfig: ContractConfig;
  parentRunId: string;
} {
  if (trace.length === 0 || trace[0].event !== 'init') {
    throw new Error('CAEL trace must start with init event');
  }

  const init = trace[0];
  const config = decodeCAELValue(init.payload.config) as Record<string, unknown>;
  const contractConfig =
    (decodeCAELValue(init.payload.contractConfig) as ContractConfig | undefined) ?? {};

  return { config, contractConfig, parentRunId: init.runId };
}

async function replayEntry(recorder: CAELRecorder, entry: CAELTraceEntry): Promise<void> {
  switch (entry.event) {
    case 'step': {
      const wallDelta = entry.payload.wallDelta;
      if (typeof wallDelta !== 'number') {
        throw new Error(`Fork replay step entry ${entry.index} missing numeric wallDelta`);
      }
      recorder.step(wallDelta);
      break;
    }
    case 'interaction': {
      const type = entry.payload.type;
      const data = decodeCAELValue(entry.payload.data);
      if (typeof type !== 'string' || !data || typeof data !== 'object') {
        throw new Error(`Fork replay interaction entry ${entry.index} has invalid payload`);
      }
      recorder.logInteraction(type, data as Record<string, unknown>);
      break;
    }
    case 'solve': {
      await recorder.solve();
      break;
    }
    case 'init':
    case 'final':
      // Informational for replaying to intermediate state.
      break;
    default:
      throw new Error(`Unknown CAEL event at index ${entry.index}`);
  }
}

/** Seeded deterministic PRNG for reproducible dream perturbations. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getAtPath(root: unknown, path: string): unknown {
  const parts = path.split('.');
  let cursor: unknown = root;
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    if (Array.isArray(cursor)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cursor.length) return undefined;
      cursor = cursor[idx];
      continue;
    }
    if (typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function setAtPath(root: unknown, path: string, value: unknown): boolean {
  const parts = path.split('.');
  let cursor: unknown = root;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (Array.isArray(cursor)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cursor.length) return false;
      cursor = cursor[idx];
      continue;
    }
    if (!cursor || typeof cursor !== 'object') return false;
    cursor = (cursor as Record<string, unknown>)[part];
  }

  const leaf = parts[parts.length - 1];
  if (Array.isArray(cursor)) {
    const idx = Number(leaf);
    if (!Number.isInteger(idx) || idx < 0 || idx >= cursor.length) return false;
    cursor[idx] = value;
    return true;
  }
  if (!cursor || typeof cursor !== 'object') return false;
  (cursor as Record<string, unknown>)[leaf] = value;
  return true;
}

export async function forkTrace(
  trace: string | CAELTrace,
  index: number,
  solverFactory: CAELSolverFactory
): Promise<CAELRecorder> {
  const parsed = normalizeTrace(trace);
  assertValidTrace(parsed);

  if (index < 0 || index >= parsed.length) {
    throw new Error(`fork index ${index} out of bounds for trace length ${parsed.length}`);
  }

  const { config, contractConfig, parentRunId } = readInit(parsed);
  const recorder = new CAELRecorder(solverFactory(config), config, contractConfig);

  for (let i = 1; i <= index; i++) {
    await replayEntry(recorder, parsed[i]);
  }

  recorder.logInteraction('cael.fork', {
    parentRunId,
    forkIndex: index,
    forkSourceHash: parsed[index].hash,
  });

  return recorder;
}

export async function forkAndChoose(
  trace: string | CAELTrace,
  index: number,
  alternatives: ForkAlternative[],
  steps: number,
  dt: number,
  solverFactory: CAELSolverFactory,
  evaluator: (recorder: CAELRecorder) => number | Promise<number>
): Promise<ForkAndChooseResult> {
  const branches: ForkBranchResult[] = [];

  for (let i = 0; i < alternatives.length; i++) {
    const alternative = alternatives[i];
    const recorder = await forkTrace(trace, index, solverFactory);

    try {
      recorder.logInteraction('cael.fork.branch', {
        branchId: alternative.id,
        branchIndex: i,
        metadata: alternative.metadata ?? null,
      });

      await alternative.apply(recorder, i);

      for (let s = 0; s < steps; s++) {
        recorder.step(dt);
      }

      const score = await evaluator(recorder);
      const provenance = recorder.finalize();
      branches.push({
        id: alternative.id,
        completed: true,
        score,
        provenance,
        traceJSONL: recorder.toJSONL(),
      });
    } catch (err: unknown) {
      recorder.logInteraction('cael.fork.branch.failed', {
        branchId: alternative.id,
        message: err instanceof Error ? err.message : String(err),
      });
      const provenance = recorder.finalize();
      branches.push({
        id: alternative.id,
        completed: false,
        score: Number.NEGATIVE_INFINITY,
        provenance,
        traceJSONL: recorder.toJSONL(),
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      recorder.dispose();
    }
  }

  let winnerId: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const branch of branches) {
    if (branch.completed && branch.score > bestScore) {
      bestScore = branch.score;
      winnerId = branch.id;
    }
  }

  return { winnerId, branches };
}

export async function dream(
  wakingJSONL: string,
  dreamConfig: DreamConfig,
  solverFactory: CAELSolverFactory
): Promise<DreamResult> {
  const wakingTrace = parseCAELJSONL(wakingJSONL);
  assertValidTrace(wakingTrace);

  const { config: wakingConfig, contractConfig: wakingContract, parentRunId } = readInit(wakingTrace);
  const rng = mulberry32(dreamConfig.seed);

  const episodes: DreamEpisodeResult[] = [];
  const percent = dreamConfig.perturbationPercent;

  for (let episode = 0; episode < dreamConfig.episodes; episode++) {
    const perturbedConfig = structuredClone(wakingConfig);
    const perturbations: Array<{ field: string; before: number; after: number }> = [];

    for (const fieldPath of dreamConfig.fields) {
      const before = getAtPath(perturbedConfig, fieldPath);
      if (typeof before !== 'number' || !Number.isFinite(before)) continue;

      const scale = 1 + (rng() * 2 - 1) * percent;
      const after = before * scale;
      if (setAtPath(perturbedConfig, fieldPath, after)) {
        perturbations.push({ field: fieldPath, before, after });
      }
    }

    const contractConfig = dreamConfig.contractConfigOverride ?? wakingContract;
    const recorder = new CAELRecorder(solverFactory(perturbedConfig), perturbedConfig, contractConfig);

    recorder.logInteraction('cael.dream', {
      wakingRunId: parentRunId,
      episode,
      seed: dreamConfig.seed,
      perturbations,
    });

    try {
      for (let s = 0; s < dreamConfig.steps; s++) {
        recorder.step(dreamConfig.dt);
      }

      const provenance = recorder.finalize();
      episodes.push({
        episode,
        completed: true,
        perturbations,
        provenance,
        traceJSONL: recorder.toJSONL(),
      });
    } catch (err: unknown) {
      recorder.logInteraction('cael.dream.failed', {
        wakingRunId: parentRunId,
        episode,
        seed: dreamConfig.seed,
        message: err instanceof Error ? err.message : String(err),
      });

      const provenance = recorder.finalize();
      episodes.push({
        episode,
        completed: false,
        perturbations,
        provenance,
        traceJSONL: recorder.toJSONL(),
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      recorder.dispose();
    }
  }

  return {
    wakingRunId: parentRunId,
    seed: dreamConfig.seed,
    episodes,
  };
}
