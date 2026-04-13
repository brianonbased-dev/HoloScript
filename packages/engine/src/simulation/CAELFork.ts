/**
 * CAELFork + CAELDream — Phase 3: Counterfactual Forking and Offline Replay Perturbation
 *
 * ## Forking (Experiment 2: Counterfactual Planning)
 *
 * An agent at timestep T faces a decision. Instead of committing to one action,
 * it forks the simulation: same state, different actions. Each fork runs under
 * its own contract, producing its own CAEL trace. The agent compares outcomes
 * and chooses the better branch — with proof of both futures.
 *
 *   trace[0..T] → fork → branch A (action X) → outcome A (with provenance)
 *                       → branch B (action Y) → outcome B (with provenance)
 *
 * The fork point links both branches to the same parent hash. Replay of either
 * branch starts from the same verified state.
 *
 * ## Dreaming (Experiment 5: Offline Replay Perturbation)
 *
 * An agent replays its own CAEL trace with perturbations: ±10% load, ±5% material
 * properties, rotated geometry. Each dream is a valid contracted simulation —
 * not noise, but a physically grounded counterfactual. The SNN consolidates
 * across dreams, generalizing from experiences it never had in waking.
 *
 *   waking trace → perturb config → replay under contract → dream trace
 *                → perturb differently → replay → another dream trace
 *                → SNN consolidates across N dream traces
 *
 * Each dream trace has its own hash chain rooted at a dream-genesis entry
 * that references the original waking trace's run ID and fork point.
 */

import type { CAELRecorder } from './CAELRecorder';
import type { CAELTrace, CAELTraceEntry } from './CAELTrace';
import { parseCAELJSONL, verifyCAELHashChain } from './CAELTrace';
import type { SimSolver } from './SimSolver';
import type { ContractConfig } from './SimulationContract';
import type { ActionDecision, CAELAgentConfig } from './CAELAgent';
import { CAELAgentLoop } from './CAELAgent';

// ── Fork Types ──────────────────────────────────────────────────────────────

/**
 * A fork point in a CAEL trace. Identifies where the timeline branches.
 */
export interface CAELForkPoint {
  /** Run ID of the original (parent) trace */
  parentRunId: string;
  /** Index in the parent trace where the fork occurs */
  forkIndex: number;
  /** Hash of the parent entry at fork point (integrity link) */
  parentHash: string;
  /** Simulation time at the fork */
  simTime: number;
}

/**
 * A completed fork branch with its outcome.
 */
export interface CAELForkBranch {
  /** Identifier for this branch (e.g., "branch-A", "reinforce-left") */
  branchId: string;
  /** The action that was taken in this branch */
  action: ActionDecision;
  /** The complete CAEL trace for this branch */
  trace: CAELTrace;
  /** JSONL export of the branch trace */
  jsonl: string;
  /** Summary metrics extracted from the final state */
  outcome: Record<string, unknown>;
}

/**
 * Result of a fork-compare-choose operation.
 */
export interface CAELForkResult {
  /** The fork point in the parent trace */
  forkPoint: CAELForkPoint;
  /** All branches that were explored */
  branches: CAELForkBranch[];
  /** Which branch was chosen (index into branches array) */
  chosenIndex: number;
  /** Why this branch was chosen */
  chosenReason: string;
}

/**
 * Factory that creates a solver from a config snapshot.
 * Used to reconstruct simulation state at a fork point.
 */
export type SolverFactory = (config: Record<string, unknown>) => SimSolver;

/**
 * Evaluates a branch outcome and returns a scalar utility.
 * Used by forkAndChoose to compare branches automatically.
 */
export type BranchEvaluator = (
  branch: CAELForkBranch,
  solver: SimSolver,
) => number;

// ── Fork Operations ─────────────────────────────────────────────────────────

/**
 * Fork a CAEL trace at a given index, creating a new recorder that
 * continues from the fork point with a different action.
 *
 * The new recorder's first entry is a special 'fork' interaction that
 * references the parent trace's run ID and fork hash, establishing
 * the provenance link between timelines.
 *
 * @param parentTrace The original CAEL trace (or JSONL string)
 * @param forkIndex Index in the trace to fork from
 * @param solverFactory Creates a new solver from the original config
 * @param contractConfig Contract configuration for the new branch
 * @returns A new CAELRecorder ready for the alternative timeline
 */
export function forkTrace(
  parentTrace: CAELTrace | string,
  forkIndex: number,
  solverFactory: SolverFactory,
  contractConfig?: ContractConfig,
): { recorder: CAELRecorder; forkPoint: CAELForkPoint } {
  const trace = typeof parentTrace === 'string'
    ? parseCAELJSONL(parentTrace)
    : parentTrace;

  // Validate the trace up to the fork point
  const prefixValid = verifyCAELHashChain(trace.slice(0, forkIndex + 1));
  if (!prefixValid) {
    throw new Error(`CAEL fork failed: trace is corrupted before fork index ${forkIndex}`);
  }

  // Find the init entry to get the original config
  const initEntry = trace.find((e) => e.event === 'init');
  if (!initEntry) {
    throw new Error('CAEL fork failed: no init entry in parent trace');
  }

  const forkEntry = trace[forkIndex];
  const forkPoint: CAELForkPoint = {
    parentRunId: forkEntry.runId,
    forkIndex,
    parentHash: forkEntry.hash,
    simTime: forkEntry.simTime,
  };

  // Reconstruct the solver from the original config
  const config = initEntry.payload.config as Record<string, unknown>;
  const solver = solverFactory(config);

  // Create a new recorder (this creates a fresh contracted simulation)
  const { CAELRecorder: RecorderClass } = require('./CAELRecorder');
  const recorder: CAELRecorder = new RecorderClass(
    solver,
    config,
    contractConfig ?? (initEntry.payload.contractConfig as ContractConfig) ?? {},
  );

  // Record the fork provenance link
  recorder.logInteraction('cael.fork', {
    parentRunId: forkPoint.parentRunId,
    forkIndex: forkPoint.forkIndex,
    parentHash: forkPoint.parentHash,
    forkSimTime: forkPoint.simTime,
  });

  // Replay all steps up to the fork point to reach the same state
  for (const entry of trace.slice(1, forkIndex + 1)) {
    if (entry.event === 'step') {
      const wallDelta = entry.payload.wallDelta as number;
      recorder.step(wallDelta);
    } else if (entry.event === 'interaction') {
      const type = entry.payload.type as string;
      const data = entry.payload.data as Record<string, unknown>;
      if (type && data && !type.startsWith('cael.')) {
        recorder.logInteraction(type, data);
      }
    } else if (entry.event === 'solve') {
      // For steady-state solvers, re-solve
      recorder.solve();
    }
  }

  return { recorder, forkPoint };
}

/**
 * Fork-Compare-Choose: the complete counterfactual planning pattern.
 *
 * 1. Fork the trace at the decision point
 * 2. For each alternative action, run a branch forward N steps
 * 3. Evaluate each branch's outcome
 * 4. Choose the best branch
 * 5. Return all branches with provenance (the proof of both futures)
 *
 * @param parentTrace The original trace up to the decision point
 * @param forkIndex Where to fork
 * @param alternatives Actions to try in each branch
 * @param stepsPerBranch How many simulation steps to run per branch
 * @param dt Time delta per step
 * @param solverFactory Creates solvers for each branch
 * @param evaluator Scores each branch outcome
 * @param agentConfig Optional: run a full agent loop in each branch
 * @param contractConfig Contract config for branches
 */
export async function forkAndChoose(
  parentTrace: CAELTrace | string,
  forkIndex: number,
  alternatives: ActionDecision[],
  stepsPerBranch: number,
  dt: number,
  solverFactory: SolverFactory,
  evaluator: BranchEvaluator,
  agentConfig?: CAELAgentConfig,
  contractConfig?: ContractConfig,
): Promise<CAELForkResult> {
  const branches: CAELForkBranch[] = [];
  let forkPoint: CAELForkPoint | null = null;

  for (let i = 0; i < alternatives.length; i++) {
    const alt = alternatives[i];
    const { recorder, forkPoint: fp } = forkTrace(
      parentTrace, forkIndex, solverFactory, contractConfig,
    );
    if (!forkPoint) forkPoint = fp;

    // Record which action this branch takes
    recorder.logInteraction('cael.branch_action', {
      branchIndex: i,
      branchId: `branch-${i}`,
      action: alt.chosen,
    });

    // Run the branch forward
    if (agentConfig) {
      // Full agent loop in the branch
      const agentLoop = new CAELAgentLoop(recorder, agentConfig);
      for (let s = 0; s < stepsPerBranch; s++) {
        agentLoop.tick(dt);
      }
    } else {
      // Physics-only branch (no agent, just step)
      for (let s = 0; s < stepsPerBranch; s++) {
        recorder.step(dt);
      }
    }

    const prov = recorder.finalize();
    const solver = (recorder as unknown as { solver: SimSolver }).solver;

    branches.push({
      branchId: `branch-${i}`,
      action: alt,
      trace: recorder.getTrace(),
      jsonl: recorder.toJSONL(),
      outcome: {
        finalStats: prov.finalStats,
        totalSimTime: prov.totalSimTime,
        totalSteps: prov.totalSteps,
      },
    });

    recorder.dispose();
  }

  // Evaluate and choose
  const utilities = branches.map((b) => {
    // Create a temporary solver to evaluate (or use outcome metrics)
    return evaluator(b, null as unknown as SimSolver);
  });

  const chosenIndex = utilities.indexOf(Math.max(...utilities));

  return {
    forkPoint: forkPoint!,
    branches,
    chosenIndex,
    chosenReason: `Branch ${chosenIndex} had highest utility: ${utilities[chosenIndex].toFixed(4)} (alternatives: ${utilities.map((u) => u.toFixed(4)).join(', ')})`,
  };
}

// ── Dream Types ─────────────────────────────────────────────────────────────

/**
 * A perturbation applied to a simulation config for dreaming.
 */
export interface DreamPerturbation {
  /** What was perturbed */
  field: string;
  /** Original value */
  original: unknown;
  /** Perturbed value */
  perturbed: unknown;
  /** Perturbation magnitude (e.g., 0.1 for ±10%) */
  magnitude: number;
}

/**
 * Configuration for a dream session.
 */
export interface DreamConfig {
  /** Number of dream episodes to generate */
  episodeCount: number;
  /** Maximum perturbation magnitude (0.1 = ±10%) */
  maxPerturbation: number;
  /** Which config fields to perturb */
  perturbableFields: string[];
  /** Steps per dream episode */
  stepsPerEpisode: number;
  /** Time delta per step */
  dt: number;
  /** Random seed for reproducible dreams (optional) */
  seed?: number;
}

/**
 * Result of a single dream episode.
 */
export interface DreamEpisode {
  /** Episode index */
  index: number;
  /** Perturbations applied */
  perturbations: DreamPerturbation[];
  /** The dream's CAEL trace */
  trace: CAELTrace;
  /** JSONL export */
  jsonl: string;
  /** Whether the dream simulation converged/completed */
  completed: boolean;
}

/**
 * Result of a complete dream session.
 */
export interface DreamSession {
  /** The waking trace this dream session is based on */
  wakingRunId: string;
  /** All dream episodes */
  episodes: DreamEpisode[];
  /** Summary: how many completed, average perturbation magnitude */
  summary: {
    total: number;
    completed: number;
    avgPerturbation: number;
  };
}

// ── Dream Operations ────────────────────────────────────────────────────────

/**
 * Simple seeded PRNG (mulberry32) for reproducible perturbations.
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Apply random perturbations to a simulation config.
 */
function perturbConfig(
  config: Record<string, unknown>,
  fields: string[],
  magnitude: number,
  rng: () => number,
): { perturbed: Record<string, unknown>; perturbations: DreamPerturbation[] } {
  const perturbed = structuredClone(config);
  const perturbations: DreamPerturbation[] = [];

  for (const field of fields) {
    const parts = field.split('.');
    let target: Record<string, unknown> = perturbed;
    for (let i = 0; i < parts.length - 1; i++) {
      if (target[parts[i]] && typeof target[parts[i]] === 'object') {
        target = target[parts[i]] as Record<string, unknown>;
      } else {
        target = perturbed; // field path doesn't exist, skip
        break;
      }
    }

    const key = parts[parts.length - 1];
    const original = target[key];
    if (typeof original === 'number') {
      const perturbFactor = 1 + (rng() * 2 - 1) * magnitude;
      const perturbedValue = original * perturbFactor;
      target[key] = perturbedValue;
      perturbations.push({
        field,
        original,
        perturbed: perturbedValue,
        magnitude: Math.abs(perturbFactor - 1),
      });
    }
  }

  return { perturbed, perturbations };
}

/**
 * Run a dream session: replay a waking trace N times with random perturbations.
 *
 * Each dream episode:
 * 1. Clone the original config
 * 2. Apply random perturbations to specified fields
 * 3. Create a new contracted simulation with the perturbed config
 * 4. Run the simulation for the specified number of steps
 * 5. Record the dream's CAEL trace with a link to the waking trace
 *
 * The SNN agent (if provided via agentConfig) processes each dream,
 * accumulating experiences across physically grounded counterfactuals.
 *
 * @param wakingJSONL The waking trace to dream about
 * @param dreamConfig Dream session parameters
 * @param solverFactory Creates solvers for dream episodes
 * @param agentConfig Optional: run agent loop in dreams
 * @param contractConfig Contract config for dream simulations
 */
export async function dream(
  wakingJSONL: string,
  dreamConfig: DreamConfig,
  solverFactory: SolverFactory,
  agentConfig?: CAELAgentConfig,
  contractConfig?: ContractConfig,
): Promise<DreamSession> {
  const wakingTrace = parseCAELJSONL(wakingJSONL);
  const initEntry = wakingTrace.find((e) => e.event === 'init');
  if (!initEntry) throw new Error('Dream failed: no init entry in waking trace');

  const originalConfig = initEntry.payload.config as Record<string, unknown>;
  const wakingRunId = initEntry.runId;
  const rng = mulberry32(dreamConfig.seed ?? Date.now());

  const episodes: DreamEpisode[] = [];

  for (let i = 0; i < dreamConfig.episodeCount; i++) {
    const { perturbed, perturbations } = perturbConfig(
      originalConfig,
      dreamConfig.perturbableFields,
      dreamConfig.maxPerturbation,
      rng,
    );

    try {
      const solver = solverFactory(perturbed);
      const { CAELRecorder: RecorderClass } = require('./CAELRecorder');
      const recorder: CAELRecorder = new RecorderClass(
        solver,
        perturbed,
        contractConfig ?? (initEntry.payload.contractConfig as ContractConfig) ?? {},
      );

      // Record dream provenance
      recorder.logInteraction('cael.dream', {
        wakingRunId,
        episodeIndex: i,
        perturbations: perturbations.map((p) => ({
          field: p.field,
          original: p.original,
          perturbed: p.perturbed,
          magnitude: Number(p.magnitude.toFixed(6)),
        })),
      });

      // Run the dream
      if (agentConfig) {
        const agentLoop = new CAELAgentLoop(recorder, agentConfig);
        for (let s = 0; s < dreamConfig.stepsPerEpisode; s++) {
          agentLoop.tick(dreamConfig.dt);
        }
      } else {
        for (let s = 0; s < dreamConfig.stepsPerEpisode; s++) {
          recorder.step(dreamConfig.dt);
        }
      }

      recorder.finalize();

      episodes.push({
        index: i,
        perturbations,
        trace: recorder.getTrace(),
        jsonl: recorder.toJSONL(),
        completed: true,
      });

      recorder.dispose();
    } catch {
      // Dream failed (e.g., solver didn't converge with perturbed params)
      episodes.push({
        index: i,
        perturbations,
        trace: [],
        jsonl: '',
        completed: false,
      });
    }
  }

  const completedCount = episodes.filter((e) => e.completed).length;
  const avgPerturbation = episodes
    .flatMap((e) => e.perturbations.map((p) => p.magnitude))
    .reduce((a, b) => a + b, 0) / Math.max(1, episodes.flatMap((e) => e.perturbations).length);

  return {
    wakingRunId,
    episodes,
    summary: {
      total: dreamConfig.episodeCount,
      completed: completedCount,
      avgPerturbation,
    },
  };
}
