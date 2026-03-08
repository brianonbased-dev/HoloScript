/**
 * DecisionHistory - G-Set CRDT for append-only decision log
 *
 * Tracks agent decisions across sessions with causal relationships.
 * Uses G-Set (Grow-only Set) CRDT semantics for conflict-free merging.
 *
 * Target: <2KB compressed
 * @version 1.0.0
 */

/**
 * Single decision entry
 */
export interface DecisionEntry {
  /** Unique decision ID (UUID v4) */
  id: string;

  /** Unix timestamp in milliseconds */
  timestamp: number;

  /** Decision type category */
  type: 'task' | 'preference' | 'strategy' | 'resource' | 'social';

  /** Brief decision description (max 200 chars) */
  description: string;

  /** Chosen option/action (max 100 chars) */
  choice: string;

  /** Optional: Parent decision ID for causal chains */
  parentId?: string;

  /** Optional: Agent DID that made this decision */
  agentDid?: string;

  /** Optional: Outcome result (success/failure/pending) */
  outcome?: 'success' | 'failure' | 'pending';

  /** Optional: Numeric confidence score (0-1) */
  confidence?: number;
}

/**
 * DecisionHistory CRDT (G-Set)
 *
 * Grow-only set of decisions. Uses CRDT G-Set semantics:
 * - Add-only (no removes)
 * - Merge = union of all entries
 * - Idempotent: duplicate adds are safe
 * - Commutative: order doesn't matter
 */
export interface DecisionHistory {
  /** CRDT type identifier */
  crdtType: 'g-set';

  /** Unique CRDT instance ID */
  crdtId: string;

  /** Set of all decision entries */
  decisions: DecisionEntry[];

  /** Vector clock for causality tracking */
  vectorClock: Record<string, number>;

  /** Last update timestamp */
  lastUpdated: number;
}

/**
 * DecisionHistory metadata for compression optimization
 */
export interface DecisionHistoryMetadata {
  /** Total number of decisions */
  count: number;

  /** Earliest decision timestamp */
  oldestTimestamp: number;

  /** Latest decision timestamp */
  newestTimestamp: number;

  /** Participating agent DIDs */
  agentDids: string[];

  /** Decision type distribution */
  typeDistribution: Record<DecisionEntry['type'], number>;
}
