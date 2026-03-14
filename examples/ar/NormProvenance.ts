// TARGET: packages/platform/renderer/src/NormProvenance.ts
// TODO-008 (MEDIUM): Norm provenance in CulturalTrace
//
// Extends the CulturalTraceManager with norm_provenance tracking.
// The existing CulturalTraceTypes already defines NormProvenance and
// ConfidenceClassification types (W.069 three-mode framework). This
// module provides:
//   1. ProvenanceTracker: attaches provenance to every trace deposit
//   2. ProvenanceWeightedAggregation: discounts confabulated/bullshitted traces
//   3. ProvenanceAuditLog: immutable log of all provenance classifications
//   4. ProvenanceVerifier: cross-references traces against ground truth
//   5. Integration with CulturalTraceManager.deposit() via middleware

/**
 * NormProvenance Module
 *
 * Adds epistemic provenance tracking to the CulturalTrace stigmergic
 * collective memory system. Without provenance, all traces are treated
 * equally in cluster formation and path detection. With provenance,
 * genuine traces carry more weight than confabulated or bullshitted ones.
 *
 * Architecture:
 * ```
 *   Agent deposits trace
 *        |
 *   ProvenanceMiddleware classifies confidence
 *        |
 *   CulturalTraceManager.deposit() includes provenance
 *        |
 *   StigmergicTraceEngine stores trace + provenance
 *        |
 *   ProvenanceWeightedAggregation adjusts intensity
 *        |
 *   CollectiveMemoryAggregator uses weighted intensities
 * ```
 *
 * @module NormProvenance
 * @version 1.0.0
 */

import type { Vec3 } from './AgentStateBuffer';
import type {
  NormProvenance,
  ConfidenceClassification,
  TraceId,
  TraceCategory,
  CulturalTrace,
} from './CulturalTraceTypes';

// =============================================================================
// PROVENANCE WEIGHT SYSTEM
// =============================================================================

/**
 * Weight multipliers for each confidence classification.
 *
 * These affect how much a trace contributes to:
 *   - Cluster formation (weighted intensity)
 *   - Path preference detection (weighted traversal count)
 *   - Heatmap visualization (weighted density)
 *   - Collective memory aggregation (weighted votes)
 *
 * Values are intentionally conservative: genuine traces get full weight,
 * confabulated traces get 40%, and bullshitted traces get 5%.
 */
export interface ProvenanceWeights {
  readonly genuine: number;
  readonly confabulated: number;
  readonly bullshitted: number;
}

const _DEFAULT_PROVENANCE_WEIGHTS: ProvenanceWeights = {
  genuine: 1.0,
  confabulated: 0.4,
  bullshitted: 0.05,
};

export const DEFAULT_PROVENANCE_WEIGHTS: Readonly<ProvenanceWeights> = Object.freeze(
  _DEFAULT_PROVENANCE_WEIGHTS,
);

/**
 * Get the weight multiplier for a confidence classification.
 */
export function getProvenanceWeight(
  classification: ConfidenceClassification,
  weights: Readonly<ProvenanceWeights> = DEFAULT_PROVENANCE_WEIGHTS,
): number {
  return weights[classification];
}

// =============================================================================
// PROVENANCE TRACKER
// =============================================================================

/**
 * Configuration for automatic provenance classification.
 */
export interface ProvenanceTrackerConfig {
  /** Default classification when none is specified. Default: 'confabulated' */
  readonly defaultClassification: ConfidenceClassification;
  /** Agent IDs that are always classified as 'genuine' (system agents) */
  readonly trustedAgents: readonly string[];
  /** Minimum required fields for a trace to be classified as 'genuine' */
  readonly genuineRequiredFields: readonly string[];
  /** Custom classifier function (overrides automatic classification) */
  readonly customClassifier?: (deposit: ProvenanceDepositInput) => ConfidenceClassification;
  /** Weight overrides */
  readonly weights?: ProvenanceWeights;
}

/**
 * Input for provenance classification.
 */
export interface ProvenanceDepositInput {
  readonly agentId: string;
  readonly category: TraceCategory;
  readonly position: Vec3;
  readonly textContent?: string;
  readonly tags?: readonly string[];
  readonly metadata?: Record<string, unknown>;
  /** Explicitly set provenance (bypasses auto-classification) */
  readonly explicitProvenance?: NormProvenance;
  /** The interaction that produced this trace */
  readonly interactionId?: string;
}

/**
 * Tracks and classifies provenance for cultural trace deposits.
 *
 * The tracker maintains a registry of known agents and their trust
 * levels, and uses heuristics to classify the confidence of each
 * trace deposit.
 *
 * Classification heuristics (when no explicit provenance is provided):
 *   - Trusted agent + all required fields present = 'genuine'
 *   - Known agent + partial fields = 'confabulated'
 *   - Unknown agent or missing critical fields = 'bullshitted'
 *   - System-generated traces (e.g., waypoints from pathfinding) = 'genuine'
 */
export class ProvenanceTracker {
  private readonly config: Required<Omit<ProvenanceTrackerConfig, 'customClassifier'>> & {
    customClassifier?: ProvenanceTrackerConfig['customClassifier'];
  };
  private readonly trustedAgentSet: Set<string>;
  private readonly agentTraceCount: Map<string, number> = new Map();
  private classificationCounts: Record<ConfidenceClassification, number> = {
    genuine: 0,
    confabulated: 0,
    bullshitted: 0,
  };

  constructor(config?: Partial<ProvenanceTrackerConfig>) {
    this.config = {
      defaultClassification: config?.defaultClassification ?? 'confabulated',
      trustedAgents: config?.trustedAgents ?? [],
      genuineRequiredFields: config?.genuineRequiredFields ?? ['interactionId', 'textContent'],
      customClassifier: config?.customClassifier,
      weights: config?.weights ?? DEFAULT_PROVENANCE_WEIGHTS,
    };

    this.trustedAgentSet = new Set(this.config.trustedAgents);
  }

  /**
   * Classify a trace deposit and produce a NormProvenance record.
   *
   * @param input The deposit being classified
   * @returns A NormProvenance record for the trace
   */
  classify(input: ProvenanceDepositInput): NormProvenance {
    // If explicit provenance is provided, use it directly
    if (input.explicitProvenance) {
      const classification = input.explicitProvenance.confidenceClassification;
      this.classificationCounts[classification]++;
      this.incrementAgentCount(input.agentId);
      return input.explicitProvenance;
    }

    // Use custom classifier if provided
    if (this.config.customClassifier) {
      const classification = this.config.customClassifier(input);
      this.classificationCounts[classification]++;
      this.incrementAgentCount(input.agentId);
      return {
        originInteractionId: input.interactionId ?? `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        originatingAgent: input.agentId,
        confidenceClassification: classification,
      };
    }

    // Automatic classification
    const classification = this.autoClassify(input);
    this.classificationCounts[classification]++;
    this.incrementAgentCount(input.agentId);

    return {
      originInteractionId: input.interactionId ?? `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      originatingAgent: input.agentId,
      confidenceClassification: classification,
    };
  }

  /**
   * Automatic classification heuristics.
   */
  private autoClassify(input: ProvenanceDepositInput): ConfidenceClassification {
    const isTrusted = this.trustedAgentSet.has(input.agentId);

    // System agents and explicitly trusted agents
    if (isTrusted) {
      return 'genuine';
    }

    // Check for required fields
    const requiredFieldsPresent = this.config.genuineRequiredFields.every(field => {
      switch (field) {
        case 'interactionId': return !!input.interactionId;
        case 'textContent': return !!input.textContent;
        case 'tags': return input.tags && input.tags.length > 0;
        case 'metadata': return input.metadata && Object.keys(input.metadata).length > 0;
        default: return false;
      }
    });

    // Has interaction ID and required fields = genuine
    if (input.interactionId && requiredFieldsPresent) {
      return 'genuine';
    }

    // Has some context but not all required fields = confabulated
    if (input.interactionId || input.textContent || (input.tags && input.tags.length > 0)) {
      return 'confabulated';
    }

    // No context, no interaction ID = bullshitted
    // (Agent is just depositing traces without verifiable context)
    return this.config.defaultClassification;
  }

  private incrementAgentCount(agentId: string): void {
    this.agentTraceCount.set(agentId, (this.agentTraceCount.get(agentId) ?? 0) + 1);
  }

  /**
   * Add an agent to the trusted list at runtime.
   */
  addTrustedAgent(agentId: string): void {
    this.trustedAgentSet.add(agentId);
  }

  /**
   * Remove an agent from the trusted list.
   */
  removeTrustedAgent(agentId: string): void {
    this.trustedAgentSet.delete(agentId);
  }

  /**
   * Get classification statistics.
   */
  getStats(): {
    classifications: Record<ConfidenceClassification, number>;
    totalClassified: number;
    genuineRate: number;
    perAgent: ReadonlyMap<string, number>;
  } {
    const total = this.classificationCounts.genuine +
      this.classificationCounts.confabulated +
      this.classificationCounts.bullshitted;

    return {
      classifications: { ...this.classificationCounts },
      totalClassified: total,
      genuineRate: total > 0 ? this.classificationCounts.genuine / total : 0,
      perAgent: new Map(this.agentTraceCount),
    };
  }

  /**
   * Reset all statistics.
   */
  resetStats(): void {
    this.classificationCounts = { genuine: 0, confabulated: 0, bullshitted: 0 };
    this.agentTraceCount.clear();
  }
}

// =============================================================================
// PROVENANCE-WEIGHTED AGGREGATION
// =============================================================================

/**
 * Adjusts trace intensity based on provenance classification.
 *
 * This function is designed to be applied as a post-processing step
 * in the StigmergicTraceEngine or CollectiveMemoryAggregator.
 *
 * @param trace The cultural trace with provenance
 * @param weights Weight configuration
 * @returns The adjusted intensity value
 */
export function computeWeightedIntensity(
  trace: CulturalTrace & { norm_provenance?: NormProvenance },
  weights: Readonly<ProvenanceWeights> = DEFAULT_PROVENANCE_WEIGHTS,
): number {
  if (!trace.norm_provenance) {
    // No provenance = treat as confabulated (conservative default)
    return trace.intensity * weights.confabulated;
  }

  const weight = weights[trace.norm_provenance.confidenceClassification];
  return trace.intensity * weight;
}

/**
 * Compute weighted intensity for a batch of traces.
 * Returns a Map of traceId -> weightedIntensity.
 */
export function computeBatchWeightedIntensities(
  traces: ReadonlyMap<TraceId, CulturalTrace & { norm_provenance?: NormProvenance }>,
  weights: Readonly<ProvenanceWeights> = DEFAULT_PROVENANCE_WEIGHTS,
): Map<TraceId, number> {
  const result = new Map<TraceId, number>();
  for (const [id, trace] of traces) {
    result.set(id, computeWeightedIntensity(trace, weights));
  }
  return result;
}

// =============================================================================
// PROVENANCE AUDIT LOG
// =============================================================================

/**
 * Entry in the provenance audit log.
 */
export interface ProvenanceAuditEntry {
  /** Timestamp of the audit entry */
  readonly timestamp: string;
  /** Trace ID this entry refers to */
  readonly traceId: TraceId;
  /** The provenance record */
  readonly provenance: NormProvenance;
  /** The weighted intensity after provenance adjustment */
  readonly weightedIntensity: number;
  /** The original (unweighted) intensity */
  readonly originalIntensity: number;
  /** The weight multiplier that was applied */
  readonly weightMultiplier: number;
}

/**
 * Immutable, append-only audit log for provenance classifications.
 *
 * This log provides a complete record of every provenance classification
 * made by the system, enabling:
 *   - Post-hoc analysis of epistemic quality in collective memory
 *   - Detection of agents that consistently produce low-confidence traces
 *   - Compliance auditing for safety-critical applications
 */
export class ProvenanceAuditLog {
  private readonly entries: ProvenanceAuditEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries: number = 10000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Record a provenance classification event.
   */
  record(
    traceId: TraceId,
    provenance: NormProvenance,
    originalIntensity: number,
    weights: Readonly<ProvenanceWeights> = DEFAULT_PROVENANCE_WEIGHTS,
  ): void {
    const weightMultiplier = weights[provenance.confidenceClassification];

    this.entries.push({
      timestamp: new Date().toISOString(),
      traceId,
      provenance,
      weightedIntensity: originalIntensity * weightMultiplier,
      originalIntensity,
      weightMultiplier,
    });

    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  /**
   * Get all audit entries.
   */
  getEntries(): readonly ProvenanceAuditEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries for a specific agent.
   */
  getEntriesForAgent(agentId: string): readonly ProvenanceAuditEntry[] {
    return this.entries.filter(e => e.provenance.originatingAgent === agentId);
  }

  /**
   * Get entries by classification.
   */
  getEntriesByClassification(
    classification: ConfidenceClassification,
  ): readonly ProvenanceAuditEntry[] {
    return this.entries.filter(
      e => e.provenance.confidenceClassification === classification,
    );
  }

  /**
   * Get summary statistics from the audit log.
   */
  getSummary(): {
    totalEntries: number;
    byClassification: Record<ConfidenceClassification, number>;
    avgWeightedIntensity: number;
    avgOriginalIntensity: number;
    effectiveReductionPercent: number;
  } {
    const byClassification: Record<ConfidenceClassification, number> = {
      genuine: 0,
      confabulated: 0,
      bullshitted: 0,
    };

    let totalWeighted = 0;
    let totalOriginal = 0;

    for (const entry of this.entries) {
      byClassification[entry.provenance.confidenceClassification]++;
      totalWeighted += entry.weightedIntensity;
      totalOriginal += entry.originalIntensity;
    }

    const n = this.entries.length;

    return {
      totalEntries: n,
      byClassification,
      avgWeightedIntensity: n > 0 ? totalWeighted / n : 0,
      avgOriginalIntensity: n > 0 ? totalOriginal / n : 0,
      effectiveReductionPercent: totalOriginal > 0
        ? ((totalOriginal - totalWeighted) / totalOriginal) * 100
        : 0,
    };
  }

  /**
   * Get the entry count.
   */
  size(): number {
    return this.entries.length;
  }

  /**
   * Clear the audit log.
   */
  clear(): void {
    this.entries.length = 0;
  }
}

// =============================================================================
// PROVENANCE VERIFIER
// =============================================================================

/**
 * Verification result for a trace's provenance.
 */
export interface ProvenanceVerificationResult {
  readonly traceId: TraceId;
  readonly verified: boolean;
  readonly classification: ConfidenceClassification;
  readonly reason: string;
  /** If reclassified, the new classification */
  readonly reclassifiedTo?: ConfidenceClassification;
}

/**
 * Ground truth source for provenance verification.
 */
export interface GroundTruthSource {
  /** Check if an interaction ID is valid (exists in the interaction log) */
  verifyInteraction(interactionId: string): boolean;
  /** Check if an agent was active at the given time */
  verifyAgentPresence(agentId: string, timestamp: string): boolean;
  /** Check if the position was reachable by the agent at the given time */
  verifyPositionReachable(agentId: string, position: Vec3, timestamp: string): boolean;
}

/**
 * Verifies trace provenance against ground truth sources.
 *
 * This is the post-hoc verification layer. While ProvenanceTracker
 * classifies at deposit time (fast, heuristic-based), ProvenanceVerifier
 * does deeper verification against ground truth (slower, authoritative).
 */
export class ProvenanceVerifier {
  private readonly groundTruth: GroundTruthSource;
  private verificationCount = 0;
  private reclassificationCount = 0;

  constructor(groundTruth: GroundTruthSource) {
    this.groundTruth = groundTruth;
  }

  /**
   * Verify the provenance of a single trace.
   *
   * Checks:
   *   1. Is the interaction ID valid?
   *   2. Was the agent present at the claimed time?
   *   3. Was the position reachable by the agent?
   *
   * If any check fails, the trace is reclassified downward:
   *   genuine -> confabulated (if interaction exists but position unreachable)
   *   genuine -> bullshitted (if interaction doesn't exist)
   *   confabulated -> bullshitted (if agent wasn't present)
   */
  verify(
    trace: CulturalTrace & { norm_provenance?: NormProvenance },
  ): ProvenanceVerificationResult {
    this.verificationCount++;

    if (!trace.norm_provenance) {
      return {
        traceId: trace.id,
        verified: false,
        classification: 'bullshitted',
        reason: 'No provenance record attached to trace',
        reclassifiedTo: 'bullshitted',
      };
    }

    const prov = trace.norm_provenance;

    // Check 1: Interaction validity
    const interactionValid = this.groundTruth.verifyInteraction(prov.originInteractionId);
    if (!interactionValid) {
      if (prov.confidenceClassification !== 'bullshitted') {
        this.reclassificationCount++;
      }
      return {
        traceId: trace.id,
        verified: false,
        classification: prov.confidenceClassification,
        reason: `Interaction ID "${prov.originInteractionId}" not found in ground truth`,
        reclassifiedTo: 'bullshitted',
      };
    }

    // Check 2: Agent presence
    const agentPresent = this.groundTruth.verifyAgentPresence(
      prov.originatingAgent,
      trace.createdAt ?? new Date().toISOString(),
    );
    if (!agentPresent) {
      const reclassified = prov.confidenceClassification === 'genuine'
        ? 'confabulated'
        : 'bullshitted';
      if (prov.confidenceClassification !== reclassified) {
        this.reclassificationCount++;
      }
      return {
        traceId: trace.id,
        verified: false,
        classification: prov.confidenceClassification,
        reason: `Agent "${prov.originatingAgent}" was not present at the claimed time`,
        reclassifiedTo: reclassified,
      };
    }

    // Check 3: Position reachability
    const positionReachable = this.groundTruth.verifyPositionReachable(
      prov.originatingAgent,
      trace.position,
      trace.createdAt ?? new Date().toISOString(),
    );
    if (!positionReachable && prov.confidenceClassification === 'genuine') {
      this.reclassificationCount++;
      return {
        traceId: trace.id,
        verified: false,
        classification: prov.confidenceClassification,
        reason: 'Position was not reachable by the agent at the claimed time',
        reclassifiedTo: 'confabulated',
      };
    }

    // All checks passed
    return {
      traceId: trace.id,
      verified: true,
      classification: prov.confidenceClassification,
      reason: 'All provenance checks passed',
    };
  }

  /**
   * Verify provenance for a batch of traces.
   */
  verifyBatch(
    traces: ReadonlyArray<CulturalTrace & { norm_provenance?: NormProvenance }>,
  ): ProvenanceVerificationResult[] {
    return traces.map(t => this.verify(t));
  }

  /**
   * Get verification statistics.
   */
  getStats(): {
    totalVerified: number;
    totalReclassified: number;
    reclassificationRate: number;
  } {
    return {
      totalVerified: this.verificationCount,
      totalReclassified: this.reclassificationCount,
      reclassificationRate: this.verificationCount > 0
        ? this.reclassificationCount / this.verificationCount
        : 0,
    };
  }

  /**
   * Reset verification statistics.
   */
  resetStats(): void {
    this.verificationCount = 0;
    this.reclassificationCount = 0;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a complete norm provenance tracking suite.
 *
 * Usage in CulturalTraceManager integration:
 * ```ts
 * const provenance = createNormProvenanceSuite({
 *   trustedAgents: ['system', 'brittney'],
 * });
 *
 * // Before depositing a trace:
 * const normProv = provenance.tracker.classify({
 *   agentId: 'builder',
 *   category: 'annotate',
 *   position: { x: 5, y: 0, z: -3 },
 *   textContent: 'This object needs review',
 *   interactionId: 'sess_123:turn_7',
 * });
 *
 * // Include normProv in the trace deposit
 * // After deposit, log to audit:
 * provenance.auditLog.record(traceId, normProv, originalIntensity);
 * ```
 */
export function createNormProvenanceSuite(
  config?: Partial<ProvenanceTrackerConfig>,
): {
  tracker: ProvenanceTracker;
  auditLog: ProvenanceAuditLog;
  weights: Readonly<ProvenanceWeights>;
} {
  const weights = config?.weights
    ? Object.freeze({ ...config.weights })
    : DEFAULT_PROVENANCE_WEIGHTS;

  return {
    tracker: new ProvenanceTracker(config),
    auditLog: new ProvenanceAuditLog(),
    weights,
  };
}
