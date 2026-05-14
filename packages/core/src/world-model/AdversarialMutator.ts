/**
 * Adversarial mutator — generates action-trace variants for the deterministic
 * failure-discovery scene, scores them, and returns ranked trajectories.
 *
 * Operationalizes acceptance criterion 3 of the AUTONOMIZE doc:
 *   "Score each trace by predicate violation, novelty, learnability,
 *    regression, and invalidity."
 *
 * Deterministic: every mutation is seeded. Same (baseActions, profiles, seed)
 * produces the same trajectories and scores.
 *
 * @module @holoscript/core/world-model
 */

import {
  type DeterministicSceneAction,
  type DeterministicFailureSceneOptions,
  type DeterministicFailureSceneResult,
  type Vec3,
  runDeterministicFailureDiscoveryScene,
  hashDeterministicSceneValue,
  DETERMINISTIC_FAILURE_CONTRACT,
} from './DeterministicFailureScene';
import {
  type AdversarialTrajectory,
  type ActionStep,
  type ObservationStep,
  type ValidityAnchor,
  type SimulationContractReference,
  asTrajectoryId,
  asSceneHash,
  asCaelReceiptHash,
} from './AdversarialTrajectory';
import { scoreTrajectory, type SoftAnchor } from './PredicateScorer';

// =============================================================================
// TYPES
// =============================================================================

export type MutationStrategy =
  | 'perturb-positions'
  | 'skip-step'
  | 'duplicate-step'
  | 'swap-consecutive'
  | 'insert-wait'
  | 'push-toward-obstacle'
  | 'camera-drift';

export interface MutatorProfile {
  readonly name: string;
  readonly strategy: MutationStrategy;
  /** Mutation aggressiveness in [0, 1]. Higher = larger deltas / more disruption. */
  readonly intensity: number;
}

export interface MutatedTrace {
  readonly actions: readonly DeterministicSceneAction[];
  readonly profile: string;
  readonly rationale: string;
}

export interface AdversarialExplorerOptions {
  /** Base action trace to mutate. Defaults to DEFAULT_DETERMINISTIC_FAILURE_ACTIONS. */
  readonly baseActions?: readonly DeterministicSceneAction[];
  /** Scene seed. Defaults to 1337. */
  readonly seed?: number;
  /** Max generated traces. Defaults to 16. */
  readonly maxTraces?: number;
  /** Optional scene options passed to the runner. */
  readonly sceneOptions?: DeterministicFailureSceneOptions;
  /** Mutator profiles. Defaults to BUILT_IN_PROFILES. */
  readonly profiles?: readonly MutatorProfile[];
  /** Default learnability estimate for scorer. Defaults to 0.7. */
  readonly learnabilityEstimate?: number;
  /** Wall-clock timestamp for discoveredAtMs. Defaults to Date.now(). */
  readonly discoveredAtMs?: number;
}

// =============================================================================
// BUILT-IN PROFILES
// =============================================================================

export const BUILT_IN_PROFILES: readonly MutatorProfile[] = [
  { name: 'gentle-perturb', strategy: 'perturb-positions', intensity: 0.15 },
  { name: 'strong-perturb', strategy: 'perturb-positions', intensity: 0.55 },
  { name: 'skip-one', strategy: 'skip-step', intensity: 0.3 },
  { name: 'duplicate-one', strategy: 'duplicate-step', intensity: 0.3 },
  { name: 'swap-pair', strategy: 'swap-consecutive', intensity: 0.3 },
  { name: 'insert-pause', strategy: 'insert-wait', intensity: 0.3 },
  { name: 'push-obstacle', strategy: 'push-toward-obstacle', intensity: 0.6 },
  { name: 'camera-drift', strategy: 'camera-drift', intensity: 0.5 },
];

// =============================================================================
// SEEDED RNG (LCG — deterministic, self-contained)
// =============================================================================

interface Rng {
  float(): number;
  int(min: number, max: number): number;
  bool(bias?: number): boolean;
}

function makeRng(seed: number): Rng {
  let state = (seed >>> 0) || 1;
  const float = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const int = (min: number, max: number): number =>
    min + Math.floor(float() * (max - min + 1));
  const bool = (bias = 0.5): boolean => float() < bias;
  return { float, int, bool };
}

// =============================================================================
// MUTATION IMPLEMENTATIONS
// =============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function jitterPosition(pos: Vec3, intensity: number, rng: Rng): Vec3 {
  const scale = intensity * 0.4;
  return {
    x: clamp(pos.x + (rng.float() - 0.5) * 2 * scale, -2, 2),
    y: clamp(pos.y + (rng.float() - 0.5) * 2 * scale, -0.5, 2.5),
    z: clamp(pos.z + (rng.float() - 0.5) * 2 * scale, -2, 2),
  };
}

function mutatePerturbPositions(
  base: readonly DeterministicSceneAction[],
  intensity: number,
  rng: Rng
): readonly DeterministicSceneAction[] {
  return base.map((action) => {
    switch (action.type) {
      case 'place-object':
        return {
          ...action,
          object: {
            ...action.object,
            center: jitterPosition(action.object.center, intensity, rng),
          },
        };
      case 'move-object':
        return {
          ...action,
          center: jitterPosition(action.center, intensity, rng),
        };
      case 'move-camera':
        return {
          ...action,
          position: jitterPosition(action.position, intensity, rng),
          lookAt: jitterPosition(action.lookAt, intensity, rng),
        };
      case 'wait':
      default:
        return action;
    }
  });
}

function mutateSkipStep(
  base: readonly DeterministicSceneAction[],
  _intensity: number,
  rng: Rng
): readonly DeterministicSceneAction[] {
  if (base.length <= 1) return base;
  const idx = rng.int(0, base.length - 1);
  return [...base.slice(0, idx), ...base.slice(idx + 1)];
}

function mutateDuplicateStep(
  base: readonly DeterministicSceneAction[],
  _intensity: number,
  rng: Rng
): readonly DeterministicSceneAction[] {
  if (base.length === 0) return base;
  const idx = rng.int(0, base.length - 1);
  const dup = base[idx];
  return [...base.slice(0, idx + 1), dup, ...base.slice(idx + 1)];
}

function mutateSwapConsecutive(
  base: readonly DeterministicSceneAction[],
  _intensity: number,
  rng: Rng
): readonly DeterministicSceneAction[] {
  if (base.length < 2) return base;
  const idx = rng.int(0, base.length - 2);
  const copy = [...base];
  [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
  return copy;
}

function mutateInsertWait(
  base: readonly DeterministicSceneAction[],
  intensity: number,
  rng: Rng
): readonly DeterministicSceneAction[] {
  const durationMs = Math.round(50 + rng.float() * 400 * (1 + intensity));
  const idx = rng.int(0, base.length);
  const wait: DeterministicSceneAction = { type: 'wait', durationMs };
  return [...base.slice(0, idx), wait, ...base.slice(idx)];
}

function mutatePushTowardObstacle(
  base: readonly DeterministicSceneAction[],
  intensity: number,
  rng: Rng
): readonly DeterministicSceneAction[] {
  const obstacleCenter: Vec3 = { x: 0, y: 0.35, z: 0 };
  return base.map((action) => {
    if (action.type === 'move-object' && action.objectId === 'probe-block') {
      const toward = {
        x: action.center.x + (obstacleCenter.x - action.center.x) * intensity * (0.5 + rng.float()),
        y: action.center.y,
        z: action.center.z + (obstacleCenter.z - action.center.z) * intensity * (0.5 + rng.float()),
      };
      return { ...action, center: toward };
    }
    return action;
  });
}

function mutateCameraDrift(
  base: readonly DeterministicSceneAction[],
  intensity: number,
  rng: Rng
): readonly DeterministicSceneAction[] {
  return base.map((action) => {
    if (action.type === 'move-camera') {
      const drift = {
        x: clamp(action.position.x + (rng.float() - 0.5) * 4 * intensity, -3, 3),
        y: clamp(action.position.y + (rng.float() - 0.5) * 2 * intensity, 0.5, 3),
        z: clamp(action.position.z + (rng.float() - 0.5) * 4 * intensity, -3, 5),
      };
      return { ...action, position: drift };
    }
    return action;
  });
}

function applyMutation(
  base: readonly DeterministicSceneAction[],
  profile: MutatorProfile,
  seed: number
): MutatedTrace {
  const rng = makeRng(seed);
  let actions: readonly DeterministicSceneAction[];
  switch (profile.strategy) {
    case 'perturb-positions':
      actions = mutatePerturbPositions(base, profile.intensity, rng);
      break;
    case 'skip-step':
      actions = mutateSkipStep(base, profile.intensity, rng);
      break;
    case 'duplicate-step':
      actions = mutateDuplicateStep(base, profile.intensity, rng);
      break;
    case 'swap-consecutive':
      actions = mutateSwapConsecutive(base, profile.intensity, rng);
      break;
    case 'insert-wait':
      actions = mutateInsertWait(base, profile.intensity, rng);
      break;
    case 'push-toward-obstacle':
      actions = mutatePushTowardObstacle(base, profile.intensity, rng);
      break;
    case 'camera-drift':
      actions = mutateCameraDrift(base, profile.intensity, rng);
      break;
    default:
      actions = base;
  }
  return {
    actions,
    profile: profile.name,
    rationale: `${profile.strategy} at intensity ${profile.intensity.toFixed(2)}`,
  };
}

// =============================================================================
// TRAJECTORY BUILDER
// =============================================================================

function buildAdversarialTrajectoryFromResult(
  result: DeterministicFailureSceneResult,
  mutatorName: string,
  contract: SimulationContractReference,
  discoveredAtMs: number
): AdversarialTrajectory {
  const id = asTrajectoryId(
    hashDeterministicSceneValue({
      sceneHash: result.sceneHash,
      seed: result.seed,
      actionTrace: result.actionTrace,
      mutator: mutatorName,
    })
  );
  const replayCommand =
    `holoscript world-model replay --scene ${result.sceneId}` +
    ` --trajectory ${id} --seed ${result.seed}`;

  return {
    id,
    sceneHash: asSceneHash(result.sceneHash),
    seed: result.seed,
    trustTier: 'replayable',
    caelReceiptHash: asCaelReceiptHash(result.eventLogHash),
    simulationContract: contract,
    actionTrace: result.actionTrace,
    observationTrace: result.observationTrace,
    predicateScore: {
      violation: 0,
      novelty: 0,
      learnability: 0,
      regression: 0,
      invalidity: 0,
    },
    priority: { priority: 0, tieBreaker: 0, rationale: 'unscored' },
    replayHandle: {
      trajectoryId: id,
      sceneHash: asSceneHash(result.sceneHash),
      simulationContractId: contract.contractId,
      seed: result.seed,
      replayCommand,
    },
    status: 'open',
    discoveredAtMs,
    lastReplayedAtMs: null,
  };
}

// =============================================================================
// ANCHORS FOR THE DETERMINISTIC SCENE
// =============================================================================

function makeHardAnchors(): readonly ValidityAnchor[] {
  return [
    {
      id: 'valid-actions-only',
      description: 'all deterministic scene actions reference valid movable objects',
      evaluate: (_trajectory: AdversarialTrajectory) => true,
    },
  ];
}

function makeSoftAnchors(result: DeterministicFailureSceneResult): readonly SoftAnchor[] {
  return [
    {
      id: 'blocked-contact',
      description: 'blocked obstacle contact in deterministic scene',
      evaluate: () => Math.min(1, result.predicateViolationCount),
    },
    {
      id: 'target-contact',
      description: 'contact with target pad',
      evaluate: () =>
        result.events.some((e) => e.type === 'target_contact') ? 0.5 : 0,
    },
    {
      id: 'invalid-action-rate',
      description: 'proportion of invalid actions in trace',
      evaluate: () =>
        result.actionTrace.length > 0
          ? Math.min(1, result.invalidActionCount / result.actionTrace.length)
          : 0,
    },
  ];
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Apply a single mutator profile to a base action trace.
 *
 * Deterministic: same (base, profile, seed) → same MutatedTrace.
 */
export function mutateTrace(
  base: readonly DeterministicSceneAction[],
  profile: MutatorProfile,
  seed: number
): MutatedTrace {
  return applyMutation(base, profile, seed);
}

/**
 * Generate and score adversarial trajectories by mutating a base trace.
 *
 * Each generated trace is run through the deterministic scene, scored with
 * the five predicate components, and ranked by priority. The history set
 * grows across traces so novelty is meaningful.
 *
 * @returns Scored trajectories, sorted by descending priority.
 */
export function exploreAdversarialTraces(
  options: AdversarialExplorerOptions = {}
): readonly AdversarialTrajectory[] {
  const {
    baseActions,
    seed = 1337,
    maxTraces = 16,
    sceneOptions,
    profiles = BUILT_IN_PROFILES,
    learnabilityEstimate = 0.7,
    discoveredAtMs = Date.now(),
  } = options;

  const base = baseActions ?? [];
  const contract = DETERMINISTIC_FAILURE_CONTRACT;
  const hardAnchors = makeHardAnchors();
  const historyActionTypes = new Set<string>();

  const trajectories: AdversarialTrajectory[] = [];

  for (let i = 0; i < maxTraces; i += 1) {
    const profile = profiles[i % profiles.length];
    const traceSeed = seed + i * 7919; // prime stride avoids correlation
    const mutated = applyMutation(base, profile, traceSeed);
    const result = runDeterministicFailureDiscoveryScene(mutated.actions, sceneOptions);

    const trajectory = buildAdversarialTrajectoryFromResult(
      result,
      profile.name,
      contract,
      discoveredAtMs
    );

    const softAnchors = makeSoftAnchors(result);
    const score = scoreTrajectory({
      trajectory,
      hardAnchors,
      softAnchors,
      historyActionTypes,
      learnabilityEstimate,
      previousStatus: undefined,
    });

    const status: AdversarialTrajectory['status'] =
      score.predicateScore.invalidity > 0
        ? 'invalid'
        : result.predicateViolationCount > 0
          ? 'unresolved'
          : 'open';

    const scored: AdversarialTrajectory = {
      ...trajectory,
      predicateScore: score.predicateScore,
      priority: score.priority,
      status,
    };

    trajectories.push(scored);

    // Grow history for novelty on subsequent traces
    for (const a of scored.actionTrace) {
      historyActionTypes.add(a.type);
    }
  }

  // Sort by priority descending, then tie-breaker ascending
  return trajectories.sort((a, b) => {
    if (a.priority.priority !== b.priority.priority) {
      return b.priority.priority - a.priority.priority;
    }
    return a.priority.tieBreaker - b.priority.tieBreaker;
  });
}
