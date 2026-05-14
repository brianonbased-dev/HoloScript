/**
 * Adversarial trajectory buffer schema — PROWL response substrate.
 *
 * Operationalizes the schema layer of the AUTONOMIZE recommendation from
 * `research/2026-05-13_odyssey-prowl-competitor-brief-AUTONOMIZE.md`.
 *
 * Scope (this file): types + interfaces only. The buffer implementation,
 * predicate evaluator, mutator, and replay command land in sibling files
 * (`AdversarialTrajectoryBuffer.ts`, `PredicateScorer.ts`, etc.) so the
 * schema can stabilize and consumers can compile against it independently.
 *
 * Wedge over Odyssey PROWL (per peer's W.PROWL.AUTO.001): semantic,
 * replayable, contract-aware failure discovery — every trajectory pins
 * to a CAEL receipt hash and a replay command, and validity anchors
 * filter prediction-error junk per G.PROWL.AUTO.001.
 *
 * Trust-tier alignment (W.GOLD.013 Trust by Construction): every
 * trajectory carries a `trustTier` field so consumers can filter by
 * deterministic-replayable vs adapter-bound vs unsigned receipts.
 *
 * @module @holoscript/core/world-model
 */

// =============================================================================
// PRIMITIVES
// =============================================================================

/**
 * Opaque trajectory id. The string form is implementation-defined but
 * MUST be content-addressable (typically `sha256(actionTrace + seed +
 * sceneHash)`) so replay commands are reproducible across machines.
 */
export type TrajectoryId = string & { readonly __brand: 'TrajectoryId' };

/**
 * Opaque scene hash. Pins a trajectory to a specific deterministic scene
 * state so the replay can re-create the exact starting conditions.
 */
export type SceneHash = string & { readonly __brand: 'SceneHash' };

/**
 * CAEL receipt hash — links the trajectory to a Causal Affordance Evidence
 * Layer receipt for provenance. See W.GOLD.189 (Algebraic Trust).
 */
export type CaelReceiptHash = string & { readonly __brand: 'CaelReceiptHash' };

/**
 * Trust-tier of the trajectory's receipt. Mirrors W.GOLD.013:
 *   - 'replayable':  bit-exact deterministic replay from seed + scene hash
 *   - 'adapter-bound': ε-tolerant replay through a specific adapter (W.GOLD.192)
 *   - 'unsigned':    observed but not receipt-attested (lowest trust)
 */
export type TrustTier = 'replayable' | 'adapter-bound' | 'unsigned';

/**
 * Hash mode recorded by SimulationContract / CAEL. Duplicated here as a
 * lightweight schema type so @holoscript/core/world-model can stay independent
 * from the optional @holoscript/engine peer dependency.
 */
export type SimulationContractHashMode = 'fnv1a' | 'sha256';

/**
 * Digest enforcement mode for replay. Same-adapter replays can require exact
 * state-digest equality; cross-adapter replays use W.GOLD.192 ε-tolerance.
 */
export type ReplayDigestMode =
  | 'strict-same-adapter'
  | 'epsilon-cross-adapter'
  | 'unsigned-observed';

/**
 * Per-field quantization exposed as part of the replay contract. Route 2b
 * requires q_f to be visible to downstream oracles, not hidden in producer
 * code, so consumers can compare decisions at the right granularity.
 */
export interface SimulationFieldQuantum {
  readonly fieldPattern: string;
  readonly quantum: number;
  readonly units?: string;
}

/**
 * Minimal SimulationContract identity pinned to a trajectory. This is the
 * bridge from world-model curriculum data back to the runtime evidence layer:
 * contract id, CAEL hash mode, adapter identity, replay digest mode, and the
 * field quantization contract used for ε-tolerant replay.
 */
export interface SimulationContractReference {
  readonly contractId: string;
  readonly hashMode: SimulationContractHashMode;
  readonly adapterFingerprint: string | null;
  readonly replayDigestMode: ReplayDigestMode;
  readonly fieldQuantization: readonly SimulationFieldQuantum[];
}

/**
 * Single action step in the action trace. Domain-agnostic by design —
 * the `payload` is interpreted by the scene's action handler.
 */
export interface ActionStep {
  readonly stepIndex: number;
  readonly timestampMs: number;
  /** Action type name (e.g. 'move', 'grasp', 'speak') */
  readonly type: string;
  /** Action-specific payload; opaque to the buffer */
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Single observation step paired with an action step. The buffer keeps
 * traces in parallel arrays so consumers can stream-process either side.
 */
export interface ObservationStep {
  readonly stepIndex: number;
  readonly timestampMs: number;
  /** Observation-type name (e.g. 'frame', 'pose', 'sensor') */
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

// =============================================================================
// PREDICATE SCORING (peer's AUTONOMIZE §3)
// =============================================================================

/**
 * Per-predicate score components. Each is normalized to [0, 1] where
 * 1 = strongest signal in that direction. The aggregate priority is
 * computed in `CurriculumPriority`.
 *
 * Components (per AUTONOMIZE §3):
 *   - violation:   predicate violation magnitude (constraint break)
 *   - novelty:     scene/action novelty relative to history
 *   - learnability: estimated training-signal value
 *   - regression:  detects re-introduction of previously-fixed failures
 *   - invalidity:  signals trajectory should be discarded (validity anchor failed)
 */
export interface SemanticPredicateScore {
  readonly violation: number;
  readonly novelty: number;
  readonly learnability: number;
  readonly regression: number;
  readonly invalidity: number;
}

/**
 * Curriculum priority — derived from the predicate score, history, and
 * outstanding-failure state. Higher values mean the trajectory should be
 * prioritized for replay/training. `invalidity` MUST short-circuit
 * priority to 0 (G.PROWL.AUTO.001).
 */
export interface CurriculumPriority {
  /** Aggregate priority in [0, 1]. 0 means do-not-replay (invalid). */
  readonly priority: number;
  /** Tie-breaker rank for equal-priority trajectories (lower wins) */
  readonly tieBreaker: number;
  /** Rationale string for debuggability (human-readable, not load-bearing) */
  readonly rationale: string;
}

// =============================================================================
// VALIDITY ANCHORS (peer's G.PROWL.AUTO.001 — anti-gaming)
// =============================================================================

/**
 * A validity anchor is a hard constraint that the trajectory must satisfy
 * to be eligible for the curriculum. Trajectories failing ANY anchor get
 * `invalidity = 1` and `priority = 0`.
 *
 * Anchors are declarative — the scorer evaluates them against the
 * trajectory state. Examples: "no NaN observations", "scene hash matches
 * advertised", "action trace ≤ maxSteps".
 */
export interface ValidityAnchor {
  readonly id: string;
  readonly description: string;
  /** Returns true if the trajectory satisfies the anchor */
  evaluate(trajectory: AdversarialTrajectory): boolean;
}

// =============================================================================
// REPLAY HANDLE
// =============================================================================

/**
 * Opaque replay handle. Consumers pass this to the runtime's replay
 * command; the runtime resolves it back to the trajectory and re-runs
 * the action trace under the deterministic scene.
 *
 * Stringification (toString) MUST be stable and reversible — the buffer
 * uses it for CLI replay commands.
 */
export interface ReplayHandle {
  readonly trajectoryId: TrajectoryId;
  readonly sceneHash: SceneHash;
  readonly simulationContractId: string;
  readonly seed: number;
  /** CLI command snippet, e.g. `holo replay --id=...` */
  readonly replayCommand: string;
}

// =============================================================================
// TRAJECTORY STATUS
// =============================================================================

/**
 * Trajectory lifecycle status. Drives curriculum filtering and JSON
 * report grouping per peer's AUTONOMIZE acceptance criterion 5.
 */
export type TrajectoryStatus =
  | 'open' // discovered, not yet replayed against the latest model
  | 'solved' // replayed and predicates passed (failure resolved)
  | 'unresolved' // replayed and predicates still fail
  | 'invalid' // failed validity anchor; do not replay
  | 'archived'; // out of curriculum (e.g. predicate scope changed)

// =============================================================================
// ADVERSARIAL TRAJECTORY
// =============================================================================

/**
 * Top-level adversarial trajectory record. The buffer stores arrays of
 * these and exposes priority-ordered iteration for the curriculum loop.
 */
export interface AdversarialTrajectory {
  readonly id: TrajectoryId;
  readonly sceneHash: SceneHash;
  readonly seed: number;
  readonly trustTier: TrustTier;
  readonly caelReceiptHash: CaelReceiptHash | null;
  readonly simulationContract: SimulationContractReference;

  readonly actionTrace: readonly ActionStep[];
  readonly observationTrace: readonly ObservationStep[];

  readonly predicateScore: SemanticPredicateScore;
  readonly priority: CurriculumPriority;
  readonly replayHandle: ReplayHandle;
  readonly status: TrajectoryStatus;

  /** Wall-clock timestamp the trajectory was first discovered */
  readonly discoveredAtMs: number;
  /** Optional last-replay timestamp; null if never replayed */
  readonly lastReplayedAtMs: number | null;
}

// =============================================================================
// JSON REPORT (peer's AUTONOMIZE §5 — JSON first, UI later)
// =============================================================================

/**
 * Roll-up report for a curriculum snapshot. Buffer.exportReport()
 * produces this; the dashboard reads it. Counts MUST be derivable from
 * `trajectories.filter(t => t.status === ...).length` so the JSON is
 * self-validating.
 */
export interface AdversarialTrajectoryReport {
  readonly generatedAtMs: number;
  readonly sceneHash: SceneHash;
  readonly trajectories: readonly AdversarialTrajectory[];
  readonly counts: {
    readonly open: number;
    readonly solved: number;
    readonly unresolved: number;
    readonly invalid: number;
    readonly archived: number;
  };
  readonly topPriority: readonly TrajectoryId[];
}

// =============================================================================
// HELPER PREDICATES (pure, side-effect free)
// =============================================================================

/**
 * True when the trajectory's validity anchors all pass AND priority > 0.
 * Use this to filter the curriculum before training/eval.
 */
export function isCurriculumEligible(trajectory: AdversarialTrajectory): boolean {
  return trajectory.status !== 'invalid' && trajectory.priority.priority > 0;
}

/**
 * True when the trajectory has enough replay evidence to route back through
 * SimulationContract / CAEL. This catches stale schema producers that fill the
 * trajectory data but omit the command or mismatch the replay handle's contract
 * id against the SimulationContract reference.
 */
export function hasReplayEvidence(trajectory: AdversarialTrajectory): boolean {
  const contract = trajectory.simulationContract;
  const handle = trajectory.replayHandle;
  return (
    contract.contractId.trim().length > 0 &&
    handle.simulationContractId === contract.contractId &&
    handle.replayCommand.trim().length > 0 &&
    (contract.replayDigestMode === 'unsigned-observed' ||
      contract.fieldQuantization.length > 0)
  );
}

/**
 * Construct a `TrajectoryId` brand from a raw string. Callers are
 * responsible for ensuring the string is the canonical content-addressed
 * form (sha256 of action trace + seed + scene hash).
 */
export function asTrajectoryId(s: string): TrajectoryId {
  return s as TrajectoryId;
}

export function asSceneHash(s: string): SceneHash {
  return s as SceneHash;
}

export function asCaelReceiptHash(s: string): CaelReceiptHash {
  return s as CaelReceiptHash;
}
