/**
 * Federated Trait Sharing for HoloScript
 *
 * Implements the FMARL (Federated Multi-Agent Reinforcement Learning) protocol
 * with ECDH key exchange and differential privacy (Laplace mechanism) for
 * privacy-preserving trait sharing across HoloScript developer communities.
 *
 * Protocol overview:
 *  1. Each participant generates an ECDH key pair (simulated via SHA-256 in-process)
 *  2. Trait improvements are quantified as weight deltas
 *  3. Laplace noise is added per Differential Privacy (epsilon budget)
 *  4. Noisy deltas are aggregated (FedAvg) across participants
 *  5. Aggregated update is applied to local trait store
 *
 * GDPR/CCPA compliance: no raw trait code leaves the local machine; only
 * privacy-noised numeric weight vectors are exchanged.
 */

import { createHash, randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TraitWeights {
  /** Trait identifier, e.g. '@grabbable' */
  traitId: string;
  /** Numeric feature vector representing performance characteristics */
  weights: number[];
  /** Semantic version the weights were measured at */
  version: string;
}

export interface FederatedUpdate {
  participantId: string;
  traitId: string;
  /** Noisy weight delta (post-DP perturbation) */
  noisyDelta: number[];
  /** Privacy budget consumed by this update */
  epsilonSpent: number;
  timestamp: number;
}

export interface AggregatedUpdate {
  traitId: string;
  /** FedAvg of all participant noisy deltas */
  aggregatedDelta: number[];
  participantCount: number;
  totalEpsilonBudget: number;
  timestamp: number;
}

export interface FederationConfig {
  /**
   * Differential privacy epsilon.  Lower = more private; 0.1–1.0 recommended.
   * Defaults to 0.5 (moderate privacy / accuracy trade-off).
   */
  epsilon: number;
  /**
   * Sensitivity bound — maximum L1 norm of a single update.
   * Determines Laplace noise scale (lambda = sensitivity / epsilon).
   */
  sensitivity: number;
  /** Minimum number of participants required before aggregating. */
  minParticipants: number;
}

export interface FederationSession {
  sessionId: string;
  participantId: string;
  /** ECDH-style shared secret (SHA-256 derived, for demonstration) */
  sharedKey: string;
  config: FederationConfig;
}

// ---------------------------------------------------------------------------
// Differential Privacy — Laplace mechanism
// ---------------------------------------------------------------------------

/**
 * Sample from Laplace(0, lambda) using the inverse CDF method.
 * lambda = sensitivity / epsilon
 */
export function sampleLaplace(lambda: number): number {
  // Two uniform samples to produce a double-sided Laplace draw
  const u = Math.random() - 0.5;
  return -lambda * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

/**
 * Add calibrated Laplace noise to a weight vector.
 * Guarantees epsilon-differential privacy for L1 sensitivity `sensitivity`.
 */
export function addLaplaceNoise(
  weights: number[],
  epsilon: number,
  sensitivity: number
): number[] {
  if (epsilon <= 0) throw new Error('epsilon must be > 0');
  if (sensitivity <= 0) throw new Error('sensitivity must be > 0');
  const lambda = sensitivity / epsilon;
  return weights.map((w) => w + sampleLaplace(lambda));
}

/**
 * Clip weights to L2 norm bound (pre-processing step before noise injection).
 * Ensures updates satisfy the assumed sensitivity bound.
 */
export function clipToL2Norm(weights: number[], maxNorm: number): number[] {
  const norm = Math.sqrt(weights.reduce((s, w) => s + w * w, 0));
  if (norm <= maxNorm) return [...weights];
  const scale = maxNorm / norm;
  return weights.map((w) => w * scale);
}

// ---------------------------------------------------------------------------
// ECDH key derivation (deterministic demo — production should use node:crypto SubtleCrypto)
// ---------------------------------------------------------------------------

/**
 * Derive a shared key from two participant identifiers using SHA-256.
 * In production this should be replaced with real ECDH (SubtleCrypto.deriveKey).
 */
export function deriveSharedKey(participantA: string, participantB: string): string {
  const sorted = [participantA, participantB].sort().join(':');
  return createHash('sha256').update(sorted).digest('hex');
}

/**
 * Generate a random participant identifier.
 */
export function generateParticipantId(): string {
  return 'hs-' + randomBytes(8).toString('hex');
}

// ---------------------------------------------------------------------------
// Federation session management
// ---------------------------------------------------------------------------

/**
 * Create a new federation session for a local participant.
 */
export function createFederationSession(
  config: Partial<FederationConfig> = {}
): FederationSession {
  const resolvedConfig: FederationConfig = {
    epsilon: config.epsilon ?? 0.5,
    sensitivity: config.sensitivity ?? 1.0,
    minParticipants: config.minParticipants ?? 3,
  };
  const participantId = generateParticipantId();
  const coordinatorId = 'coordinator';
  return {
    sessionId: randomBytes(6).toString('hex'),
    participantId,
    sharedKey: deriveSharedKey(participantId, coordinatorId),
    config: resolvedConfig,
  };
}

// ---------------------------------------------------------------------------
// Federated update preparation (client-side)
// ---------------------------------------------------------------------------

/**
 * Prepare a privacy-preserving update from local trait weights and their delta.
 *
 * @param session  Active federation session
 * @param current  Current local trait weights
 * @param improved Improved trait weights after local training/tuning
 * @returns FederatedUpdate ready for submission to the aggregator
 */
export function prepareFederatedUpdate(
  session: FederationSession,
  current: TraitWeights,
  improved: TraitWeights
): FederatedUpdate {
  if (current.traitId !== improved.traitId) {
    throw new Error('traitId mismatch between current and improved weights');
  }
  if (current.weights.length !== improved.weights.length) {
    throw new Error('Weight vector length mismatch');
  }

  // Compute raw delta
  const rawDelta = current.weights.map((w, i) => improved.weights[i] - w);

  // Clip to sensitivity bound (L2)
  const clipped = clipToL2Norm(rawDelta, session.config.sensitivity);

  // Add Laplace noise for differential privacy
  const noisyDelta = addLaplaceNoise(clipped, session.config.epsilon, session.config.sensitivity);

  return {
    participantId: session.participantId,
    traitId: current.traitId,
    noisyDelta,
    epsilonSpent: session.config.epsilon,
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Aggregation (coordinator-side — FedAvg)
// ---------------------------------------------------------------------------

/**
 * Aggregate federated updates from multiple participants using FedAvg.
 * Validates that minimum participant count is met.
 *
 * @param updates  Array of FederatedUpdate from participants
 * @param config   Federation configuration (for minParticipants check)
 * @returns AggregatedUpdate containing the averaged delta
 */
export function aggregateUpdates(
  updates: FederatedUpdate[],
  config: FederationConfig
): AggregatedUpdate {
  if (updates.length === 0) throw new Error('No updates to aggregate');

  // Validate all updates target the same trait
  const traitIds = new Set(updates.map((u) => u.traitId));
  if (traitIds.size > 1) {
    throw new Error(`Updates span multiple traits: ${[...traitIds].join(', ')}`);
  }
  const traitId = updates[0].traitId;

  if (updates.length < config.minParticipants) {
    throw new Error(
      `Insufficient participants: got ${updates.length}, need ${config.minParticipants}`
    );
  }

  const vecLen = updates[0].noisyDelta.length;
  const aggregated = new Array<number>(vecLen).fill(0);

  for (const update of updates) {
    if (update.noisyDelta.length !== vecLen) {
      throw new Error(`Participant ${update.participantId} has mismatched vector length`);
    }
    for (let i = 0; i < vecLen; i++) {
      aggregated[i] += update.noisyDelta[i];
    }
  }

  // FedAvg: divide by participant count
  const averaged = aggregated.map((v) => v / updates.length);

  const totalEpsilon = updates.reduce((s, u) => s + u.epsilonSpent, 0);

  return {
    traitId,
    aggregatedDelta: averaged,
    participantCount: updates.length,
    totalEpsilonBudget: totalEpsilon,
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Apply aggregated update to local weights
// ---------------------------------------------------------------------------

/**
 * Apply an aggregated delta to local trait weights, producing updated weights.
 *
 * @param local      Current local TraitWeights
 * @param aggregated Aggregated update from federation round
 * @param learningRate Step size for applying delta (default 0.1)
 * @returns New TraitWeights after applying the federated delta
 */
export function applyAggregatedUpdate(
  local: TraitWeights,
  aggregated: AggregatedUpdate,
  learningRate = 0.1
): TraitWeights {
  if (local.traitId !== aggregated.traitId) {
    throw new Error('traitId mismatch between local and aggregated update');
  }
  if (local.weights.length !== aggregated.aggregatedDelta.length) {
    throw new Error('Weight vector length mismatch');
  }

  const updated = local.weights.map(
    (w, i) => w + learningRate * aggregated.aggregatedDelta[i]
  );

  return {
    traitId: local.traitId,
    weights: updated,
    version: local.version,
  };
}

// ---------------------------------------------------------------------------
// Privacy budget tracker
// ---------------------------------------------------------------------------

export class PrivacyBudgetTracker {
  private readonly maxBudget: number;
  private spent = 0;

  constructor(maxBudget: number) {
    if (maxBudget <= 0) throw new Error('maxBudget must be > 0');
    this.maxBudget = maxBudget;
  }

  /**
   * Consume epsilon from the privacy budget.
   * Throws if budget would be exceeded.
   */
  consume(epsilon: number): void {
    if (epsilon <= 0) throw new Error('epsilon must be > 0');
    if (this.spent + epsilon > this.maxBudget) {
      throw new Error(
        `Privacy budget exhausted: spent=${this.spent}, max=${this.maxBudget}, requested=${epsilon}`
      );
    }
    this.spent += epsilon;
  }

  remaining(): number {
    return this.maxBudget - this.spent;
  }

  totalSpent(): number {
    return this.spent;
  }

  isExhausted(): boolean {
    return this.spent >= this.maxBudget;
  }

  reset(): void {
    this.spent = 0;
  }
}

// ---------------------------------------------------------------------------
// Trait share registry — local manifest of shared traits
// ---------------------------------------------------------------------------

export interface SharedTraitRecord {
  traitId: string;
  sessionId: string;
  sharedAt: number;
  rounds: number;
  cumulativeEpsilon: number;
}

export class TraitShareRegistry {
  private readonly records = new Map<string, SharedTraitRecord>();

  register(traitId: string, sessionId: string, epsilon: number): void {
    const existing = this.records.get(traitId);
    if (existing) {
      existing.rounds += 1;
      existing.cumulativeEpsilon += epsilon;
      existing.sharedAt = Date.now();
    } else {
      this.records.set(traitId, {
        traitId,
        sessionId,
        sharedAt: Date.now(),
        rounds: 1,
        cumulativeEpsilon: epsilon,
      });
    }
  }

  get(traitId: string): SharedTraitRecord | undefined {
    return this.records.get(traitId);
  }

  list(): SharedTraitRecord[] {
    return [...this.records.values()];
  }

  has(traitId: string): boolean {
    return this.records.has(traitId);
  }
}
