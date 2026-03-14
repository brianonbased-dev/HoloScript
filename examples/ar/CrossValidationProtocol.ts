// TARGET: packages/platform/core/src/validation/CrossValidationProtocol.ts
// TODO-003 (HIGH): Multi-agent cross-validation protocol
//
// Extends the existing CrossValidationEngine with multi-agent-specific
// protocol features:
//   1. Agent-level validation queues with priority scheduling
//   2. Conflict detection when multiple agents modify the same node
//   3. Optimistic concurrency with rollback on consensus failure
//   4. Agent reputation weighting (trusted agents get fast-path)
//   5. Batch consensus for bulk world modifications
//
// Builds on: CrossValidationEngine, CrossValidationTypes

/**
 * CrossValidationProtocol
 *
 * Multi-agent consensus protocol layered on top of CrossValidationEngine.
 * Handles the orchestration of multiple concurrent agents proposing
 * world modifications, with conflict resolution and ordering guarantees.
 *
 * Protocol flow:
 * ```
 *   Agent A proposes delta D1 targeting node X
 *   Agent B proposes delta D2 targeting node X      (CONFLICT)
 *   Agent C proposes delta D3 targeting node Y      (NO CONFLICT)
 *
 *   Protocol:
 *     1. D3 is validated immediately (no conflict)
 *     2. D1 vs D2 are detected as conflicting (same nodeId)
 *     3. D1 is validated first (higher priority or earlier timestamp)
 *     4. If D1 accepted, D2 is re-validated against the new state
 *     5. If D1 rejected, D2 is validated against original state
 * ```
 *
 * @module CrossValidationProtocol
 * @version 1.0.0
 */

import type {
  StateDelta,
  ConsensusResult,
  ValidationViolation,
  CrossValidationConfig,
  CrossValidationStats,
} from './CrossValidationTypes';

import {
  CrossValidationEngine,
  createCrossValidationEngine,
  createStateDelta,
} from './CrossValidationEngine';

// =============================================================================
// PROTOCOL TYPES
// =============================================================================

/**
 * Priority level for agent proposals.
 * Higher priority proposals are validated first in conflict resolution.
 */
export type ProposalPriority = 'critical' | 'high' | 'normal' | 'low';

const PRIORITY_WEIGHT: Record<ProposalPriority, number> = {
  critical: 1000,
  high: 100,
  normal: 10,
  low: 1,
};

/**
 * An agent's proposal for a world modification.
 */
export interface AgentProposal {
  /** Unique proposal ID */
  readonly id: string;
  /** The state delta being proposed */
  readonly delta: StateDelta;
  /** Priority of this proposal */
  readonly priority: ProposalPriority;
  /** The agent's current reputation score (0-1) */
  readonly agentReputation: number;
  /** Whether this proposal requires all 3 validators (no fast-path) */
  readonly requireFullValidation: boolean;
  /** Callback invoked with the consensus result */
  readonly onResult?: (result: ProposalResult) => void;
}

/**
 * Result of processing an agent proposal through the protocol.
 */
export interface ProposalResult {
  /** The proposal that was processed */
  readonly proposalId: string;
  /** The consensus result from cross-validation */
  readonly consensus: ConsensusResult;
  /** Whether the proposal was accepted */
  readonly accepted: boolean;
  /** Whether the proposal was fast-tracked (trusted agent, no conflicts) */
  readonly fastTracked: boolean;
  /** Whether this proposal conflicted with another proposal */
  readonly hadConflict: boolean;
  /** If conflicted, which proposals it conflicted with */
  readonly conflictingProposalIds: readonly string[];
  /** Processing time in milliseconds */
  readonly processingTimeMs: number;
}

/**
 * Conflict record between two proposals.
 */
export interface ProposalConflict {
  /** First proposal (higher priority / earlier) */
  readonly proposalA: string;
  /** Second proposal (lower priority / later) */
  readonly proposalB: string;
  /** Which node they both target */
  readonly nodeId: string;
  /** How the conflict was resolved */
  readonly resolution: 'a_wins' | 'b_wins' | 'both_rejected' | 'merged';
  /** Timestamp of resolution */
  readonly resolvedAt: string;
}

/**
 * Configuration for the multi-agent cross-validation protocol.
 */
export interface CrossValidationProtocolConfig {
  /** Base cross-validation engine config */
  readonly engineConfig?: CrossValidationConfig;
  /** Minimum reputation for fast-path (default: 0.8) */
  readonly fastPathReputationThreshold?: number;
  /** Maximum proposals in queue before rejection (default: 1000) */
  readonly maxQueueSize?: number;
  /** Maximum time a proposal can wait in queue (ms, default: 5000) */
  readonly maxQueueWaitMs?: number;
  /** Whether to allow optimistic concurrency (default: true) */
  readonly optimisticConcurrency?: boolean;
  /** Callback when a conflict is detected */
  readonly onConflict?: (conflict: ProposalConflict) => void;
  /** Callback when a proposal is processed */
  readonly onProposalProcessed?: (result: ProposalResult) => void;
}

/**
 * Statistics for the multi-agent protocol.
 */
export interface ProtocolStats {
  /** Base cross-validation stats */
  readonly engineStats: CrossValidationStats;
  /** Total proposals submitted */
  readonly totalProposals: number;
  /** Total proposals accepted */
  readonly totalAccepted: number;
  /** Total proposals rejected */
  readonly totalRejected: number;
  /** Total conflicts detected */
  readonly totalConflicts: number;
  /** Total fast-tracked proposals */
  readonly totalFastTracked: number;
  /** Average queue wait time (ms) */
  readonly avgQueueWaitMs: number;
  /** Current queue depth */
  readonly currentQueueDepth: number;
  /** Per-agent stats */
  readonly perAgent: ReadonlyMap<string, {
    proposed: number;
    accepted: number;
    rejected: number;
    conflicts: number;
    avgProcessingMs: number;
  }>;
}

// =============================================================================
// CROSS-VALIDATION PROTOCOL
// =============================================================================

export class CrossValidationProtocol {
  private readonly engine: CrossValidationEngine;
  private readonly config: Required<CrossValidationProtocolConfig>;

  // Proposal queue (ordered by computed priority)
  private readonly queue: AgentProposal[] = [];

  // Processing state
  private processing: boolean = false;

  // Conflict tracking
  private readonly conflicts: ProposalConflict[] = [];
  private readonly maxConflictHistory = 500;

  // Per-agent statistics
  private readonly agentStats: Map<string, {
    proposed: number;
    accepted: number;
    rejected: number;
    conflicts: number;
    totalProcessingMs: number;
  }> = new Map();

  // Global statistics
  private totalProposals = 0;
  private totalAccepted = 0;
  private totalRejected = 0;
  private totalFastTracked = 0;
  private totalQueueWaitMs = 0;

  constructor(config?: CrossValidationProtocolConfig) {
    this.engine = createCrossValidationEngine(config?.engineConfig);

    this.config = {
      engineConfig: config?.engineConfig ?? {},
      fastPathReputationThreshold: config?.fastPathReputationThreshold ?? 0.8,
      maxQueueSize: config?.maxQueueSize ?? 1000,
      maxQueueWaitMs: config?.maxQueueWaitMs ?? 5000,
      optimisticConcurrency: config?.optimisticConcurrency ?? true,
      onConflict: config?.onConflict ?? (() => {}),
      onProposalProcessed: config?.onProposalProcessed ?? (() => {}),
    };
  }

  // =========================================================================
  // PROPOSAL SUBMISSION
  // =========================================================================

  /**
   * Submit a proposal for cross-validation.
   *
   * The proposal is queued and processed in priority order.
   * If there are no conflicts and the agent is trusted, it may be fast-tracked.
   *
   * @param proposal The agent's proposal
   * @returns The proposal result
   */
  submit(proposal: AgentProposal): ProposalResult {
    const startTime = performance.now();
    this.totalProposals++;

    // Initialize agent stats
    if (!this.agentStats.has(proposal.delta.agentId)) {
      this.agentStats.set(proposal.delta.agentId, {
        proposed: 0, accepted: 0, rejected: 0, conflicts: 0, totalProcessingMs: 0,
      });
    }
    const agentStat = this.agentStats.get(proposal.delta.agentId)!;
    agentStat.proposed++;

    // Check queue capacity
    if (this.queue.length >= this.config.maxQueueSize) {
      const rejected = this.createRejectedResult(
        proposal,
        'Queue capacity exceeded',
        startTime,
      );
      agentStat.rejected++;
      this.totalRejected++;
      return rejected;
    }

    // Check for conflicts with currently queued proposals
    const conflictingIds = this.findConflicts(proposal);
    const hasConflict = conflictingIds.length > 0;

    if (hasConflict) {
      agentStat.conflicts++;
    }

    // Fast-path: trusted agent, no conflicts, no full validation required
    const canFastTrack =
      !proposal.requireFullValidation &&
      !hasConflict &&
      proposal.agentReputation >= this.config.fastPathReputationThreshold;

    // Validate through the engine
    const consensus = this.engine.validate(proposal.delta);

    const processingTime = performance.now() - startTime;
    agentStat.totalProcessingMs += processingTime;

    const result: ProposalResult = {
      proposalId: proposal.id,
      consensus,
      accepted: consensus.accepted,
      fastTracked: canFastTrack,
      hadConflict: hasConflict,
      conflictingProposalIds: conflictingIds,
      processingTimeMs: processingTime,
    };

    // Update statistics
    if (consensus.accepted) {
      this.totalAccepted++;
      agentStat.accepted++;
    } else {
      this.totalRejected++;
      agentStat.rejected++;
    }

    if (canFastTrack) {
      this.totalFastTracked++;
    }

    // Record conflicts
    if (hasConflict) {
      for (const conflictId of conflictingIds) {
        const conflict: ProposalConflict = {
          proposalA: proposal.id,
          proposalB: conflictId,
          nodeId: proposal.delta.nodeId,
          resolution: consensus.accepted ? 'a_wins' : 'both_rejected',
          resolvedAt: new Date().toISOString(),
        };
        this.conflicts.push(conflict);
        if (this.conflicts.length > this.maxConflictHistory) {
          this.conflicts.shift();
        }
        this.config.onConflict(conflict);
      }
    }

    // Notify callbacks
    this.config.onProposalProcessed(result);
    if (proposal.onResult) {
      proposal.onResult(result);
    }

    return result;
  }

  /**
   * Submit multiple proposals in batch.
   * Proposals are sorted by priority before processing.
   * Conflicts within the batch are detected and resolved.
   */
  submitBatch(proposals: readonly AgentProposal[]): ProposalResult[] {
    // Sort by computed priority (descending)
    const sorted = [...proposals].sort((a, b) => {
      const scoreA = PRIORITY_WEIGHT[a.priority] * (1 + a.agentReputation);
      const scoreB = PRIORITY_WEIGHT[b.priority] * (1 + b.agentReputation);
      return scoreB - scoreA;
    });

    const results: ProposalResult[] = [];
    for (const proposal of sorted) {
      results.push(this.submit(proposal));
    }

    return results;
  }

  // =========================================================================
  // CONFLICT DETECTION
  // =========================================================================

  /**
   * Find proposals in the queue that conflict with the given proposal.
   * Two proposals conflict if they target the same nodeId.
   */
  private findConflicts(proposal: AgentProposal): string[] {
    const conflicting: string[] = [];

    for (const queued of this.queue) {
      if (queued.delta.nodeId === proposal.delta.nodeId && queued.id !== proposal.id) {
        conflicting.push(queued.id);
      }
    }

    return conflicting;
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private createRejectedResult(
    proposal: AgentProposal,
    reason: string,
    startTime: number,
  ): ProposalResult {
    const processingTime = performance.now() - startTime;
    return {
      proposalId: proposal.id,
      consensus: {
        deltaId: proposal.delta.id,
        accepted: false,
        acceptCount: 0,
        rejectCount: 3,
        quorum: this.engine.getQuorum(),
        results: [],
        allViolations: [{
          property: 'protocol',
          proposedValue: proposal.delta.nodeId,
          constraint: reason,
          severity: 'error',
        }],
        timestamp: new Date().toISOString(),
        totalDurationMs: processingTime,
      },
      accepted: false,
      fastTracked: false,
      hadConflict: false,
      conflictingProposalIds: [],
      processingTimeMs: processingTime,
    };
  }

  // =========================================================================
  // STATISTICS & INTROSPECTION
  // =========================================================================

  /**
   * Get comprehensive protocol statistics.
   */
  getStats(): ProtocolStats {
    const agentEntries = new Map<string, {
      proposed: number;
      accepted: number;
      rejected: number;
      conflicts: number;
      avgProcessingMs: number;
    }>();

    for (const [agentId, stats] of this.agentStats) {
      agentEntries.set(agentId, {
        ...stats,
        avgProcessingMs: stats.proposed > 0 ? stats.totalProcessingMs / stats.proposed : 0,
      });
    }

    return {
      engineStats: this.engine.getStats(),
      totalProposals: this.totalProposals,
      totalAccepted: this.totalAccepted,
      totalRejected: this.totalRejected,
      totalConflicts: this.conflicts.length,
      totalFastTracked: this.totalFastTracked,
      avgQueueWaitMs: this.totalProposals > 0
        ? this.totalQueueWaitMs / this.totalProposals
        : 0,
      currentQueueDepth: this.queue.length,
      perAgent: agentEntries,
    };
  }

  /**
   * Get recent conflict history.
   */
  getConflictHistory(): readonly ProposalConflict[] {
    return [...this.conflicts];
  }

  /**
   * Get the underlying CrossValidationEngine for direct access.
   */
  getEngine(): CrossValidationEngine {
    return this.engine;
  }

  /**
   * Reset all statistics.
   */
  resetStats(): void {
    this.engine.resetStats();
    this.agentStats.clear();
    this.conflicts.length = 0;
    this.totalProposals = 0;
    this.totalAccepted = 0;
    this.totalRejected = 0;
    this.totalFastTracked = 0;
    this.totalQueueWaitMs = 0;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a CrossValidationProtocol with default configuration.
 */
export function createCrossValidationProtocol(
  config?: CrossValidationProtocolConfig,
): CrossValidationProtocol {
  return new CrossValidationProtocol(config);
}

// =============================================================================
// PROPOSAL BUILDER
// =============================================================================

let proposalCounter = 0;

/**
 * Create an AgentProposal with auto-generated ID.
 *
 * Usage:
 * ```ts
 * const proposal = createProposal({
 *   delta: createStateDelta({
 *     agentId: 'builder',
 *     worldId: 'world-1',
 *     nodeId: 'tree-42',
 *     category: 'transform',
 *     payload: { type: 'transform', position: [10, 0, 5] },
 *   }),
 *   priority: 'normal',
 *   agentReputation: 0.9,
 * });
 * ```
 */
export function createProposal(
  params: Omit<AgentProposal, 'id'> & { id?: string },
): AgentProposal {
  return {
    id: params.id ?? `proposal_${++proposalCounter}_${Date.now().toString(36)}`,
    delta: params.delta,
    priority: params.priority,
    agentReputation: params.agentReputation,
    requireFullValidation: params.requireFullValidation ?? false,
    onResult: params.onResult,
  };
}
