/**
 * HoloScript HoloLand — Multi-agent cross-validation of world state events.
 *
 * Third sibling of the Confabulation Risk story (HoloLand task _nmcd):
 *   - AgentRiskRegistry (`compiler/identity/AgentRiskRegistry.ts`, task _penv,
 *     commit d5cbaa87f): per-agent confabulation risk score + tier.
 *   - PhysicsBoundsRegistry (`hololand/PhysicsBoundsRegistry.ts`, task _ypw8,
 *     commit be3c7c9bd): per-tier runtime envelope on physics mutations.
 *   - CrossValidationRegistry (this file): per-event N-of-M consensus on world
 *     state predictions, with divergence feeding back into AgentRiskRegistry.
 *
 * This module CLOSES THE LOOP. AgentRiskRegistry can score an agent's *own*
 * confabulation history (errors caught by `ConfabulationValidator`). But a
 * CONFABULATING AGENT CAN STILL PRODUCE SCHEMA-CLEAN COMPOSITIONS — it has
 * just learned to dodge the schema gate while hallucinating cross-trait
 * semantics. The only signal that catches THAT class of confabulation is
 * AGREEMENT WITH PEERS: when N agents independently observe/predict a
 * HoloLand world-state event and one of them diverges from the consensus
 * the rest reach, that divergence is itself a confabulation signal.
 *
 * Why this is a separate layer:
 *   - ConfabulationValidator answers "does this composition's TRAIT SCHEMA
 *     look hallucinated?" — single-agent, compile-time.
 *   - AgentRiskRegistry answers "what is this agent's accumulated error
 *     history?" — single-agent, behavioral.
 *   - PhysicsBoundsRegistry answers "given the agent's tier, what runtime
 *     magnitudes are safe?" — single-agent, runtime-bounded.
 *   - CrossValidationRegistry answers "do the agent's outputs AGREE WITH
 *     PEERS observing the same event?" — multi-agent, consensus-driven. It
 *     is the only layer in the stack that can detect a confabulation that
 *     the agent itself can't see.
 *
 * The feedback loop:
 *   1. A HoloLand world-state event happens (e.g. a body crosses a zone
 *      boundary, a script publishes a frame, an environment param changes).
 *   2. N agents each submit an OBSERVATION of that event — a typed
 *      `WorldStateClaim` with numeric fields (position, velocity) or enum
 *      fields (zoneId, weather).
 *   3. The registry buffers observations until quorum is reached
 *      (`minObservers`), then computes the consensus claim.
 *   4. For each observer, the registry computes its DIVERGENCE from the
 *      consensus. The L∞-style divergence over the typed fields maps to a
 *      severity 0–100.
 *   5. Above-threshold divergence is recorded as a `RiskEvent` against the
 *      observer's agentId — propagating back into the existing tier
 *      machinery. PhysicsBoundsRegistry then clamps that agent's next
 *      mutation more aggressively (or rejects it once they hit
 *      QUARANTINED).
 *   6. Within-threshold observations record a SUCCESS, which decays the
 *      observer's risk score over time (positive reinforcement for agents
 *      that match peers).
 *
 * CRDT-friendly shape (TTU feed compatibility — `mcp-server/src/holomesh/
 * ttu-feed.ts`, commit e53ee0b93, gives us SSE fan-out for free):
 *   - Each round is keyed by `(eventId)`. Submissions are merged by
 *     `(eventId, agentId)` with last-write-wins on `submittedAt`.
 *   - `mergeRound(remote)` lets a peer process replay another peer's votes.
 *   - Consensus computation is a PURE FUNCTION of the merged observation
 *     set, so two processes that merge the same set converge to the same
 *     consensus and the same divergence scores. No leader needed.
 *
 * Design contract (matches sibling shape from AgentRiskRegistry +
 * PhysicsBoundsRegistry):
 *   1. Typed surface — `WorldStateClaim`, `Observation`, `RoundSnapshot`,
 *      `ConsensusResult`, `CrossValidationRegistry`.
 *   2. Working pipeline — open round, submit observations, compute
 *      consensus on quorum, feed divergence into AgentRiskRegistry.
 *   3. Tests — CRDT merge convergence + divergence math + AgentRiskRegistry
 *      composition + PhysicsBoundsRegistry round-trip.
 *   4. No gold-plating — no persistence backend, no HTTP/SSE wiring (that
 *      lives in `mcp-server/src/holomesh/`), no policy DSL, no Loro doc
 *      integration. Those land when downstream consumers need them.
 *
 * @version 1.0.0
 * @module @holoscript/core/hololand/CrossValidationRegistry
 */

import {
  AgentRiskRegistry,
  RiskTier,
  getAgentRiskRegistry,
  type RiskEvent,
} from '../compiler/identity/AgentRiskRegistry';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A typed claim about a single HoloLand world-state event.
 *
 * The claim is the *agent's prediction or observation* of what happened. The
 * registry compares peer claims to detect divergence; what counts as a
 * "world-state event" is opaque to this module — it could be a physics tick,
 * a zone trigger, a published TTU frame, a script-emitted analytic event,
 * etc.
 *
 * Two kinds of fields are supported:
 *   - `numeric`: real-valued vectors (position, velocity, energy). Consensus
 *     is the per-component median; divergence is L∞ distance from consensus
 *     normalized by `tolerance`.
 *   - `enum`: categorical labels (zoneId, weatherType, body kind). Consensus
 *     is the plurality (modal) label; divergence is 0 if the observation
 *     matches the plurality, 1 otherwise.
 *
 * Both groups are optional — an event with only enum fields (e.g. "which
 * zone did the body enter?") is valid.
 */
export interface WorldStateClaim {
  /**
   * Real-valued fields. Each value is a vector of numbers; consensus is
   * computed component-wise via median, and divergence is L∞ relative to
   * `tolerance`.
   */
  numeric?: Readonly<Record<string, ReadonlyArray<number>>>;
  /**
   * Categorical fields. Consensus is plurality; divergence is binary.
   */
  enum?: Readonly<Record<string, string>>;
}

/**
 * A single agent's observation of a world-state event.
 */
export interface Observation {
  /** Round this observation belongs to (the world-state event id). */
  eventId: string;
  /** Observing agent's identity (matches `RiskEvent.agentId`). */
  agentId: string;
  /** The agent's claim. */
  claim: WorldStateClaim;
  /** Unix ms when the observation was submitted (used for LWW merge). */
  submittedAt: number;
}

/**
 * Per-numeric-field tolerance bands. Divergence within `tolerance` is
 * counted as agreement (severity 0); divergence equal to `tolerance` is
 * severity 50; divergence at or beyond `2 * tolerance` saturates at
 * severity 100.
 *
 * Tolerances are configured per-field-name. Fields without an explicit
 * tolerance use `defaultNumericTolerance`.
 */
export interface ToleranceConfig {
  defaultNumericTolerance: number;
  perField?: Readonly<Record<string, number>>;
}

/**
 * Result of computing consensus over an observation set.
 *
 * `consensus.claim` is well-defined when there are >=1 observations. With
 * 0 observations the round is `empty`.
 */
export interface ConsensusResult {
  eventId: string;
  /** Number of observations that participated in the consensus. */
  observerCount: number;
  /** The merged consensus claim (median of numerics, plurality of enums). */
  consensus: WorldStateClaim;
  /**
   * Per-observer divergence severity (0–100). 0 means perfect agreement
   * with the consensus; 100 means maximum disagreement.
   */
  divergence: ReadonlyArray<{
    agentId: string;
    severity: number;
    /** Per-field breakdown for diagnostics. */
    breakdown: ReadonlyArray<{
      field: string;
      kind: 'numeric' | 'enum';
      delta: number;
      severity: number;
    }>;
  }>;
}

/**
 * Snapshot of an open round (for CRDT merge + diagnostics).
 *
 * Observations are stored as a map keyed by `agentId` so that re-submission
 * by the same agent is LWW: the newer `submittedAt` wins on `mergeRound`.
 */
export interface RoundSnapshot {
  eventId: string;
  /** When the round was opened (ms). */
  openedAt: number;
  /** Quorum threshold for this round. */
  minObservers: number;
  /** All observations indexed by agent. */
  observations: Readonly<Record<string, Observation>>;
  /**
   * Whether consensus has already been computed and fed back into the risk
   * registry. Once true, late submissions are recorded but DO NOT trigger a
   * second feedback emission for the same agent.
   */
  resolved: boolean;
}

/**
 * Configuration for `CrossValidationRegistry`.
 */
export interface CrossValidationRegistryConfig {
  /**
   * Default minimum number of independent observers required before
   * consensus is computed. Per-round override available on `openRound`.
   * Default: 3 (smallest non-trivial quorum that lets a single dissenter
   * be outvoted).
   */
  defaultMinObservers?: number;
  /**
   * Tolerance configuration for numeric divergence. Default: 1.0 for any
   * field without an explicit per-field tolerance.
   */
  tolerance?: ToleranceConfig;
  /**
   * Severity threshold below which divergence is treated as agreement
   * (records a SUCCESS into AgentRiskRegistry instead of an event).
   * Default: 15.
   */
  agreementSeverityThreshold?: number;
  /**
   * Optional injection of `AgentRiskRegistry`. Defaults to the global
   * singleton from `getAgentRiskRegistry()`.
   */
  riskRegistry?: AgentRiskRegistry;
  /**
   * Maximum number of rounds kept in memory (oldest auto-evicted).
   * Default: 1024. Resolved rounds are still counted.
   */
  maxRounds?: number;
  /**
   * Override the time source. Useful for tests. Default: `Date.now`.
   */
  now?: () => number;
}

/**
 * Outcome of a `submitObservation()` call.
 */
export interface SubmissionResult {
  /** True if this observation closed the quorum and triggered feedback. */
  resolved: boolean;
  /** Number of observers in the round AFTER this submission. */
  observerCount: number;
  /** The consensus result IF this submission closed the quorum, else null. */
  consensus: ConsensusResult | null;
  /**
   * The risk events emitted into `AgentRiskRegistry` as a result of this
   * submission. Empty if `resolved` is false or all observers agreed.
   */
  emittedRiskEvents: ReadonlyArray<RiskEvent>;
}

const DEFAULT_MIN_OBSERVERS = 3;
const DEFAULT_NUMERIC_TOLERANCE = 1.0;
const DEFAULT_AGREEMENT_SEVERITY = 15;
const DEFAULT_MAX_ROUNDS = 1024;

// =============================================================================
// REGISTRY
// =============================================================================

/**
 * Multi-agent cross-validation registry.
 *
 * Stateful: holds an in-memory map of `eventId -> RoundSnapshot`. Process
 * local. Multi-process deployments compose by exchanging `RoundSnapshot`s
 * via `exportRound()` / `mergeRound()` — the merge is order-independent
 * (CRDT-style LWW) so any pair of peers that see the same observation set
 * compute the same consensus and emit the same risk events.
 *
 * Composition (NOT fork):
 *   - Delegates risk scoring to an injected `AgentRiskRegistry`.
 *   - Does not own physics — `PhysicsBoundsRegistry` reads the same
 *     `AgentRiskRegistry` and reflects the new tier on the next mutation.
 */
export class CrossValidationRegistry {
  private readonly defaultMinObservers: number;
  private readonly tolerance: ToleranceConfig;
  private readonly agreementSeverityThreshold: number;
  private readonly riskRegistry: AgentRiskRegistry;
  private readonly maxRounds: number;
  private readonly now: () => number;

  /** eventId -> round state. Insertion order = age order (Map preserves it). */
  private readonly rounds: Map<string, RoundSnapshot> = new Map();

  /**
   * Per-round set of agentIds we have ALREADY emitted feedback for, so a
   * late submission after `resolved=true` doesn't double-count.
   */
  private readonly emittedFor: Map<string, Set<string>> = new Map();

  constructor(config: CrossValidationRegistryConfig = {}) {
    this.defaultMinObservers =
      config.defaultMinObservers ?? DEFAULT_MIN_OBSERVERS;
    this.tolerance = {
      defaultNumericTolerance:
        config.tolerance?.defaultNumericTolerance ?? DEFAULT_NUMERIC_TOLERANCE,
      perField: config.tolerance?.perField,
    };
    this.agreementSeverityThreshold =
      config.agreementSeverityThreshold ?? DEFAULT_AGREEMENT_SEVERITY;
    this.riskRegistry = config.riskRegistry ?? getAgentRiskRegistry();
    this.maxRounds = config.maxRounds ?? DEFAULT_MAX_ROUNDS;
    this.now = config.now ?? (() => Date.now());

    if (this.defaultMinObservers < 2) {
      throw new Error(
        'CrossValidationRegistry: defaultMinObservers must be >= 2 ' +
          '(consensus requires at least two observers)'
      );
    }
    if (
      this.agreementSeverityThreshold < 0 ||
      this.agreementSeverityThreshold > 100
    ) {
      throw new Error(
        'CrossValidationRegistry: agreementSeverityThreshold must be in [0,100]'
      );
    }
    if (this.tolerance.defaultNumericTolerance <= 0) {
      throw new Error(
        'CrossValidationRegistry: defaultNumericTolerance must be > 0'
      );
    }
    if (this.maxRounds < 1) {
      throw new Error('CrossValidationRegistry: maxRounds must be >= 1');
    }
  }

  // ---------------------------------------------------------------------------
  // ROUND LIFECYCLE
  // ---------------------------------------------------------------------------

  /**
   * Open a new validation round for a world-state event.
   *
   * Idempotent: if a round with `eventId` already exists, this is a no-op
   * (returns the existing snapshot). This matters for CRDT correctness: two
   * peers may both call `openRound` on the same event before any
   * observations arrive.
   */
  openRound(eventId: string, minObservers?: number): RoundSnapshot {
    const existing = this.rounds.get(eventId);
    if (existing) return existing;

    const round: RoundSnapshot = {
      eventId,
      openedAt: this.now(),
      minObservers: minObservers ?? this.defaultMinObservers,
      observations: {},
      resolved: false,
    };
    this.rounds.set(eventId, round);
    this.evictIfNeeded();
    return round;
  }

  /**
   * Submit an observation. Implicitly opens the round if it doesn't exist.
   *
   * Returns a `SubmissionResult` describing whether quorum was reached
   * (and therefore whether risk feedback was emitted).
   */
  submitObservation(observation: Omit<Observation, 'submittedAt'> & {
    submittedAt?: number;
  }): SubmissionResult {
    const submittedAt = observation.submittedAt ?? this.now();
    const round = this.openRound(observation.eventId);

    // LWW merge — drop the observation if a NEWER one already exists for
    // this agent (CRDT requirement).
    const existing = round.observations[observation.agentId];
    if (existing && existing.submittedAt > submittedAt) {
      return {
        resolved: round.resolved,
        observerCount: Object.keys(round.observations).length,
        consensus: null,
        emittedRiskEvents: [],
      };
    }

    const merged: Observation = {
      eventId: observation.eventId,
      agentId: observation.agentId,
      claim: observation.claim,
      submittedAt,
    };
    const next: RoundSnapshot = {
      ...round,
      observations: { ...round.observations, [observation.agentId]: merged },
    };
    this.rounds.set(observation.eventId, next);

    return this.maybeResolve(observation.eventId);
  }

  /**
   * Merge a remote round snapshot into the local registry.
   *
   * CRDT semantics:
   *   - Per-agent observations merge by LWW on `submittedAt`.
   *   - The local `resolved` flag is sticky once true (don't un-resolve a
   *     round just because a peer hadn't seen the resolution yet).
   *   - `minObservers` and `openedAt` from the EARLIEST `openedAt` win
   *     (deterministic across peers).
   *   - After merging, attempts to resolve in case the merged observations
   *     just crossed quorum.
   */
  mergeRound(remote: RoundSnapshot): SubmissionResult {
    const local = this.rounds.get(remote.eventId);
    const mergedObservations: Record<string, Observation> = {};

    // Start with whichever side has data for the agent; on conflict take
    // the newer `submittedAt`.
    const allAgents = new Set<string>([
      ...Object.keys(local?.observations ?? {}),
      ...Object.keys(remote.observations),
    ]);
    for (const agentId of allAgents) {
      const l = local?.observations[agentId];
      const r = remote.observations[agentId];
      if (l && r) {
        mergedObservations[agentId] = l.submittedAt >= r.submittedAt ? l : r;
      } else {
        mergedObservations[agentId] = (l ?? r)!;
      }
    }

    const openedAt = local
      ? Math.min(local.openedAt, remote.openedAt)
      : remote.openedAt;
    const minObservers = local
      ? Math.min(local.minObservers, remote.minObservers)
      : remote.minObservers;
    const resolved = (local?.resolved ?? false) || remote.resolved;

    const merged: RoundSnapshot = {
      eventId: remote.eventId,
      openedAt,
      minObservers,
      observations: mergedObservations,
      resolved,
    };
    this.rounds.set(remote.eventId, merged);
    this.evictIfNeeded();

    return this.maybeResolve(remote.eventId);
  }

  /**
   * Force-resolve a round even if the quorum hasn't been met. Used by
   * orchestrators that want to close a round on a deadline. The consensus
   * is computed over whatever observations are present (>=1 required).
   */
  forceResolve(eventId: string): ConsensusResult | null {
    const round = this.rounds.get(eventId);
    if (!round) return null;
    if (Object.keys(round.observations).length === 0) return null;
    const result = this.resolveNow(eventId);
    return result.consensus;
  }

  /**
   * Read-only snapshot of a round (for diagnostics, exports, CRDT sync).
   */
  exportRound(eventId: string): RoundSnapshot | null {
    const r = this.rounds.get(eventId);
    if (!r) return null;
    return {
      eventId: r.eventId,
      openedAt: r.openedAt,
      minObservers: r.minObservers,
      observations: { ...r.observations },
      resolved: r.resolved,
    };
  }

  /**
   * List active rounds (for diagnostics).
   */
  listRounds(): string[] {
    return Array.from(this.rounds.keys());
  }

  /**
   * Compute a consensus result without mutating the round or emitting
   * feedback. Useful for dashboards and tests.
   *
   * Returns null if the round doesn't exist or has no observations.
   */
  previewConsensus(eventId: string): ConsensusResult | null {
    const round = this.rounds.get(eventId);
    if (!round) return null;
    const observations = Object.values(round.observations);
    if (observations.length === 0) return null;
    return computeConsensus(eventId, observations, this.tolerance);
  }

  /**
   * Drop a round from memory. Idempotent.
   */
  clearRound(eventId: string): void {
    this.rounds.delete(eventId);
    this.emittedFor.delete(eventId);
  }

  /**
   * Drop all state (tests).
   */
  clearAll(): void {
    this.rounds.clear();
    this.emittedFor.clear();
  }

  // ---------------------------------------------------------------------------
  // INTERNAL — RESOLUTION + FEEDBACK
  // ---------------------------------------------------------------------------

  private maybeResolve(eventId: string): SubmissionResult {
    const round = this.rounds.get(eventId)!;
    const observerCount = Object.keys(round.observations).length;

    if (round.resolved) {
      // Late submission — record agreement/divergence for the late agent,
      // but don't recompute global consensus (that would be unfair to the
      // already-graded peers).
      const events = this.emitForLateAgents(eventId);
      return {
        resolved: true,
        observerCount,
        consensus: null,
        emittedRiskEvents: events,
      };
    }

    if (observerCount < round.minObservers) {
      return {
        resolved: false,
        observerCount,
        consensus: null,
        emittedRiskEvents: [],
      };
    }

    return this.resolveNow(eventId);
  }

  private resolveNow(eventId: string): SubmissionResult {
    const round = this.rounds.get(eventId)!;
    const observations = Object.values(round.observations);
    const consensus = computeConsensus(eventId, observations, this.tolerance);

    const emitted: RiskEvent[] = [];
    const emittedSet = this.getEmittedSet(eventId);
    for (const div of consensus.divergence) {
      if (emittedSet.has(div.agentId)) continue;
      emittedSet.add(div.agentId);
      const ev = this.emitForObserver(eventId, div.agentId, div.severity);
      if (ev) emitted.push(ev);
    }

    const resolvedRound: RoundSnapshot = { ...round, resolved: true };
    this.rounds.set(eventId, resolvedRound);

    return {
      resolved: true,
      observerCount: observations.length,
      consensus,
      emittedRiskEvents: emitted,
    };
  }

  private emitForLateAgents(eventId: string): RiskEvent[] {
    // Recompute consensus over the existing set (latecomer is INCLUDED so
    // they're scored against the full peer group), but only emit feedback
    // for agents who haven't been graded yet — others are sticky.
    const round = this.rounds.get(eventId)!;
    const observations = Object.values(round.observations);
    const consensus = computeConsensus(eventId, observations, this.tolerance);

    const emitted: RiskEvent[] = [];
    const emittedSet = this.getEmittedSet(eventId);
    for (const div of consensus.divergence) {
      if (emittedSet.has(div.agentId)) continue;
      emittedSet.add(div.agentId);
      const ev = this.emitForObserver(eventId, div.agentId, div.severity);
      if (ev) emitted.push(ev);
    }
    return emitted;
  }

  private emitForObserver(
    eventId: string,
    agentId: string,
    severity: number
  ): RiskEvent | null {
    if (severity < this.agreementSeverityThreshold) {
      // Within agreement band — positive reinforcement.
      this.riskRegistry.recordSuccess(agentId);
      return null;
    }
    const event: RiskEvent = {
      agentId,
      severity: Math.round(severity),
      reason: `cross-validation-divergence:${eventId}`,
      timestamp: this.now(),
    };
    this.riskRegistry.recordEvent(event);
    return event;
  }

  private getEmittedSet(eventId: string): Set<string> {
    let set = this.emittedFor.get(eventId);
    if (!set) {
      set = new Set();
      this.emittedFor.set(eventId, set);
    }
    return set;
  }

  private evictIfNeeded(): void {
    while (this.rounds.size > this.maxRounds) {
      const oldest = this.rounds.keys().next().value;
      if (!oldest) break;
      this.rounds.delete(oldest);
      this.emittedFor.delete(oldest);
    }
  }
}

// =============================================================================
// PURE CONSENSUS MATH (exported for tests / dashboards)
// =============================================================================

/**
 * Compute consensus + per-observer divergence over an observation set.
 *
 * Pure function. Two callers with the same `observations` array (modulo
 * order) produce the same result — the merge inside is sort-stable.
 *
 * Numeric fields:
 *   - Per-component median across all observers that supplied the field.
 *   - Divergence is L∞ over present components, normalized by the
 *     field's tolerance band.
 *   - Severity = saturating linear ramp: 0 at delta=tolerance, 100 at
 *     delta=2*tolerance.
 *
 * Enum fields:
 *   - Plurality (modal) value across all observers that supplied the field.
 *     Ties broken by lexicographic order (deterministic).
 *   - Severity = 0 if observation matches plurality, 100 otherwise.
 *
 * Missing fields:
 *   - An observer that omits a field doesn't get penalized for it.
 *   - The observer's overall severity is the MAX over the fields they
 *     supplied (L∞ aggregation across modalities).
 */
export function computeConsensus(
  eventId: string,
  observations: ReadonlyArray<Observation>,
  tolerance: ToleranceConfig
): ConsensusResult {
  if (observations.length === 0) {
    return {
      eventId,
      observerCount: 0,
      consensus: {},
      divergence: [],
    };
  }

  // Sort for deterministic iteration regardless of insertion order.
  const sorted = [...observations].sort((a, b) =>
    a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0
  );

  // Collect all numeric and enum fields seen across observers.
  const numericFields = new Set<string>();
  const enumFields = new Set<string>();
  for (const obs of sorted) {
    if (obs.claim.numeric) {
      for (const f of Object.keys(obs.claim.numeric)) numericFields.add(f);
    }
    if (obs.claim.enum) {
      for (const f of Object.keys(obs.claim.enum)) enumFields.add(f);
    }
  }

  // Compute consensus for each numeric field (per-component median).
  const consensusNumeric: Record<string, number[]> = {};
  for (const field of numericFields) {
    const samples: number[][] = [];
    let dim = 0;
    for (const obs of sorted) {
      const v = obs.claim.numeric?.[field];
      if (!v) continue;
      samples.push([...v]);
      dim = Math.max(dim, v.length);
    }
    if (samples.length === 0 || dim === 0) continue;
    const median: number[] = [];
    for (let i = 0; i < dim; i++) {
      const col: number[] = [];
      for (const s of samples) {
        if (i < s.length) col.push(s[i]);
      }
      median.push(medianOf(col));
    }
    consensusNumeric[field] = median;
  }

  // Compute consensus for each enum field (plurality, lex tiebreak).
  const consensusEnum: Record<string, string> = {};
  for (const field of enumFields) {
    const counts = new Map<string, number>();
    for (const obs of sorted) {
      const v = obs.claim.enum?.[field];
      if (v === undefined) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    if (counts.size === 0) continue;
    const sortedByCount = Array.from(counts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });
    consensusEnum[field] = sortedByCount[0][0];
  }

  // Compute per-observer divergence.
  const divergence: ConsensusResult['divergence'] = sorted.map((obs) => {
    const breakdown: Array<{
      field: string;
      kind: 'numeric' | 'enum';
      delta: number;
      severity: number;
    }> = [];
    let maxSeverity = 0;

    if (obs.claim.numeric) {
      for (const [field, v] of Object.entries(obs.claim.numeric)) {
        const cons = consensusNumeric[field];
        if (!cons) continue;
        const tol =
          tolerance.perField?.[field] ?? tolerance.defaultNumericTolerance;
        // L∞ over present components.
        let lInf = 0;
        const dim = Math.min(v.length, cons.length);
        for (let i = 0; i < dim; i++) {
          const d = Math.abs(v[i] - cons[i]);
          if (d > lInf) lInf = d;
        }
        const sev = numericSeverity(lInf, tol);
        breakdown.push({ field, kind: 'numeric', delta: lInf, severity: sev });
        if (sev > maxSeverity) maxSeverity = sev;
      }
    }
    if (obs.claim.enum) {
      for (const [field, v] of Object.entries(obs.claim.enum)) {
        const cons = consensusEnum[field];
        if (cons === undefined) continue;
        const matches = v === cons;
        const sev = matches ? 0 : 100;
        breakdown.push({
          field,
          kind: 'enum',
          delta: matches ? 0 : 1,
          severity: sev,
        });
        if (sev > maxSeverity) maxSeverity = sev;
      }
    }

    return {
      agentId: obs.agentId,
      severity: maxSeverity,
      breakdown,
    };
  });

  const consensusClaim: WorldStateClaim = {};
  if (Object.keys(consensusNumeric).length > 0) {
    consensusClaim.numeric = consensusNumeric;
  }
  if (Object.keys(consensusEnum).length > 0) {
    consensusClaim.enum = consensusEnum;
  }

  return {
    eventId,
    observerCount: sorted.length,
    consensus: consensusClaim,
    divergence,
  };
}

/**
 * Severity ramp for a numeric divergence.
 *
 *   delta <= tol           → 0
 *   tol < delta < 2*tol    → linear ramp 0..100
 *   delta >= 2*tol         → 100
 *
 * The ramp midpoint is at delta = 1.5 * tol → severity 50, which lines up
 * with the default `agreementSeverityThreshold = 15` such that a small
 * but non-trivial breach (delta ~ 1.15 * tol) is below the agreement band
 * but a delta of 1.5 * tol is decisively above it.
 */
function numericSeverity(delta: number, tol: number): number {
  if (delta <= tol) return 0;
  if (delta >= 2 * tol) return 100;
  return ((delta - tol) / tol) * 100;
}

/**
 * Median of a number array. For even-length arrays, returns the average of
 * the two middle elements. Empty input returns 0.
 *
 * Stable: same input ordering → same output (sort is total).
 */
function medianOf(xs: ReadonlyArray<number>): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

// =============================================================================
// SINGLETON
// =============================================================================

let globalCrossValidationRegistry: CrossValidationRegistry | null = null;

/**
 * Get or create the global `CrossValidationRegistry` instance.
 *
 * Mirrors the singleton shape of `AgentRiskRegistry` and
 * `PhysicsBoundsRegistry`. The TTU feed (`mcp-server/src/holomesh/
 * ttu-feed.ts`) and any future HoloLand consensus consumer should consult
 * this singleton by default.
 */
export function getCrossValidationRegistry(
  config?: CrossValidationRegistryConfig
): CrossValidationRegistry {
  if (!globalCrossValidationRegistry) {
    globalCrossValidationRegistry = new CrossValidationRegistry(config);
  }
  return globalCrossValidationRegistry;
}

/**
 * Reset the global registry (for testing).
 */
export function resetCrossValidationRegistry(): void {
  globalCrossValidationRegistry = null;
}

// =============================================================================
// TIER-AWARE QUORUM HELPER (consumed by orchestrators)
// =============================================================================

/**
 * Suggested minimum-observer quorum for a round, given the highest tier
 * any observer is currently in.
 *
 * The intuition: if all expected observers are LOW-risk (clean history),
 * a small quorum of 3 is enough to catch a rare divergence. If one or
 * more observers is in HIGH/QUARANTINED tier, we need MORE observers so
 * a single confabulating high-risk agent can't poison the median (a 3-way
 * quorum where one observer is QUARANTINED has no margin for a second
 * dissenter).
 *
 * This is a recommendation; consumers are free to override `minObservers`
 * directly on `openRound`. Bounded above by `maxObservers` (default 9 — a
 * VR session's typical concurrent agent count is small).
 */
export function suggestedQuorum(
  observerTiers: ReadonlyArray<RiskTier>,
  options: { base?: number; maxObservers?: number } = {}
): number {
  const base = options.base ?? 3;
  const maxObservers = options.maxObservers ?? 9;
  let bonus = 0;
  for (const tier of observerTiers) {
    switch (tier) {
      case RiskTier.LOW:
        break;
      case RiskTier.MEDIUM:
        bonus += 1;
        break;
      case RiskTier.HIGH:
        bonus += 2;
        break;
      case RiskTier.QUARANTINED:
        bonus += 3;
        break;
    }
  }
  return Math.min(maxObservers, base + bonus);
}
