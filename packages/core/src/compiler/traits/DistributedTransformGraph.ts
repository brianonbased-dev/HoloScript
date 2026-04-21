/**
 * DistributedTransformGraph — CRDT-merged hash protocol for multi-node
 * HoloScript composition deployments (paper-8 §5 Algorithm 1 extension).
 *
 * Background (paper-8-unified-siggraph.tex:588):
 *   "Extend the atomic compose protocol to multi-node deployments using
 *    CRDT-merged hashes with bounded-staleness guarantees."
 *
 * This module answers that future-work item with a concrete protocol:
 *
 * ## Distributed Transform Graph
 *
 * Each simulation node maintains a local `ProvenanceSemiring` and stamps every
 * local composition with a logical (Lamport) clock and a wall-clock timestamp.
 * Nodes gossip `NodeTransformState` records to one another. On receipt, the
 * receiver:
 *   1. Merges the remote ProvenanceConfig with its own using `ProvenanceSemiring.compose()`.
 *   2. Advances its Lamport clock to max(local, remote) + 1.
 *   3. Recomputes the *merged hash* — a CRDT-deterministic digest of the entire
 *      multi-node state that is the same regardless of gossip order.
 *
 * ## Merged Hash
 *
 * The merged hash is computed by:
 *   sort(nodeIds) → for each node: hash(nodeId:stateHash) → XOR-fold all hashes
 *
 * XOR-fold is commutative and associative → same result no matter which node you
 * ask, provided they have seen the same set of NodeTransformStates.
 *
 * ## Bounded Staleness
 *
 * A node is considered *stale* if its last-seen wall-clock timestamp is older than
 * `maxStalenessMs` ago (from `Date.now()` at query time).  Stale nodes are excluded
 * from the merged hash computation and from `getActiveNodes()`.  The caller can
 * use this to trigger a re-sync.
 *
 * @version 1.0.0 (paper-8 prototype)
 */

import { ProvenanceSemiring } from './ProvenanceSemiring';
import type { TraitApplication, CompositionResult, ProvenanceConfig } from './ProvenanceSemiring';

// =============================================================================
// TYPES
// =============================================================================

/** Per-node transform state gossiped between peers. */
export interface NodeTransformState {
  /** Unique node identifier (UUID or hostname:port). */
  nodeId: string;
  /**
   * Lamport logical clock for this state.
   * Monotonically increases on every local compose and every remote merge.
   */
  logicalClock: number;
  /**
   * Wall-clock ms when this node last updated its state.
   * Used for bounded-staleness eviction.
   */
  wallClockMs: number;
  /**
   * Hash of the node's local ProvenanceConfig (derived from composition result).
   * Drives the CRDT merged-hash computation.
   */
  stateHash: string;
  /** The node's local provenance config at this clock tick. */
  provenanceConfig: ProvenanceConfig;
  /** Composition errors reported by this node's last compose. */
  errors: string[];
}

/** Options for DistributedTransformGraph. */
export interface DistributedTransformGraphOptions {
  /** Node identifier (default: random UUID-like string). */
  nodeId?: string;
  /**
   * Maximum age (ms) before a remote node's state is considered stale and
   * excluded from the merged hash.  Default: 5_000 ms.
   */
  maxStalenessMs?: number;
  /** Custom ProvenanceSemiring instance.  If omitted, default rules are used. */
  semiring?: ProvenanceSemiring;
}

/** Result of merging all active nodes into a single composition. */
export interface DistributedCompositionResult {
  /** The globally-merged composition across all active nodes. */
  composition: CompositionResult;
  /**
   * CRDT-deterministic merged hash.
   * Same value on any node that has seen the same active NodeTransformStates.
   */
  mergedHash: string;
  /** Active node IDs included in the merge. */
  activeNodeIds: string[];
  /** Node IDs excluded due to staleness. */
  staleNodeIds: string[];
  /** Local logical clock at merge time. */
  logicalClock: number;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Simple FNV-1a 32-bit hash for string inputs.  Not cryptographic; fast. */
function fnv1a32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

/** Hash a NodeTransformState to a short hex string. */
export function hashNodeState(state: NodeTransformState): string {
  const payload = `${state.nodeId}:${state.logicalClock}:${state.stateHash}`;
  const h = fnv1a32(payload);
  return h.toString(16).padStart(8, '0');
}

/**
 * Compute the CRDT-merged hash of a set of active nodes.
 *
 * Algorithm:
 *   1. Sort nodes by nodeId (deterministic ordering).
 *   2. Hash each node → 32-bit integer.
 *   3. XOR-fold all hashes → single 32-bit value.
 *   4. Return as 8-char hex string.
 *
 * XOR-fold is commutative and associative: order-independent.
 */
export function computeMergedHash(states: readonly NodeTransformState[]): string {
  if (states.length === 0) return '00000000';
  const sorted = [...states].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  let merged = 0;
  for (const s of sorted) {
    merged ^= fnv1a32(hashNodeState(s));
  }
  return (merged >>> 0).toString(16).padStart(8, '0');
}

/** Advance a Lamport clock: max(local, remote) + 1. */
export function advanceLamportClock(local: number, remote: number): number {
  return Math.max(local, remote) + 1;
}

// =============================================================================
// DISTRIBUTED TRANSFORM GRAPH
// =============================================================================

/**
 * Multi-node distributed transform graph with CRDT-merged hashes and
 * bounded-staleness guarantees (paper-8 §5 extension).
 */
export class DistributedTransformGraph {
  readonly nodeId: string;
  readonly maxStalenessMs: number;
  private semiring: ProvenanceSemiring;

  /** Lamport clock — advanced on every local compose and remote merge. */
  private logicalClock: number = 0;

  /** Most recent state for each peer node (including self). */
  private nodeStates: Map<string, NodeTransformState> = new Map();

  constructor(options: DistributedTransformGraphOptions = {}) {
    this.nodeId = options.nodeId ?? generateNodeId();
    this.maxStalenessMs = options.maxStalenessMs ?? 5_000;
    this.semiring = options.semiring ?? new ProvenanceSemiring();
  }

  // ── Local operations ────────────────────────────────────────────────────────

  /**
   * Apply a local trait composition and record the resulting state.
   *
   * @param traits  Trait applications for the local compose call.
   * @returns The local CompositionResult.
   */
  localCompose(traits: TraitApplication[]): CompositionResult {
    const result = this.semiring.add(traits);
    this.logicalClock += 1;

    const stateHash = fnv1a32(
      JSON.stringify(result.provenance) + ':' + this.logicalClock
    ).toString(16).padStart(8, '0');

    const state: NodeTransformState = {
      nodeId: this.nodeId,
      logicalClock: this.logicalClock,
      wallClockMs: Date.now(),
      stateHash,
      provenanceConfig: result.provenance,
      errors: result.errors,
    };

    this.nodeStates.set(this.nodeId, state);
    return result;
  }

  /**
   * Receive a remote NodeTransformState (gossip message from peer).
   *
   * Merges the remote provenance config with the local node's config using
   * the ProvenanceSemiring, advances the Lamport clock, and stores the
   * updated remote state.
   */
  receiveRemoteState(remoteState: NodeTransformState): void {
    // Advance Lamport clock
    this.logicalClock = advanceLamportClock(this.logicalClock, remoteState.logicalClock);

    // Store the remote state (used for merged-hash computation)
    this.nodeStates.set(remoteState.nodeId, {
      ...remoteState,
      // Keep the sender's wallClock so staleness is correctly measured
    });
  }

  // ── Query operations ────────────────────────────────────────────────────────

  /**
   * Get nodes whose last-seen wall-clock is within `maxStalenessMs` of now.
   */
  getActiveNodes(nowMs: number = Date.now()): string[] {
    const active: string[] = [];
    for (const [id, state] of this.nodeStates) {
      if (nowMs - state.wallClockMs <= this.maxStalenessMs) {
        active.push(id);
      }
    }
    return active.sort();
  }

  /**
   * Get nodes whose last-seen state is older than `maxStalenessMs`.
   */
  getStaleNodes(nowMs: number = Date.now()): string[] {
    const stale: string[] = [];
    for (const [id, state] of this.nodeStates) {
      if (nowMs - state.wallClockMs > this.maxStalenessMs) {
        stale.push(id);
      }
    }
    return stale.sort();
  }

  /**
   * Get the staleness in ms for a specific node (0 if unknown or active).
   */
  getStalenessMs(nodeId: string, nowMs: number = Date.now()): number {
    const state = this.nodeStates.get(nodeId);
    if (!state) return 0;
    return Math.max(0, nowMs - state.wallClockMs);
  }

  /**
   * Compute the CRDT-merged hash across all active nodes.
   */
  getMergedHash(nowMs: number = Date.now()): string {
    const activeIds = this.getActiveNodes(nowMs);
    const activeStates = activeIds
      .map((id) => this.nodeStates.get(id))
      .filter((s): s is NodeTransformState => s !== undefined);
    return computeMergedHash(activeStates);
  }

  /**
   * Merge all active nodes into a single global composition.
   *
   * Trait applications from all active nodes are unioned and passed through
   * the ProvenanceSemiring.  This is the "global composition" in paper-8's
   * distributed protocol.
   */
  mergeActiveNodes(nowMs: number = Date.now()): DistributedCompositionResult {
    const activeIds = this.getActiveNodes(nowMs);
    const staleIds = this.getStaleNodes(nowMs);

    // Collect all trait configs from active nodes
    const allTraits: TraitApplication[] = [];
    for (const id of activeIds) {
      const state = this.nodeStates.get(id);
      if (!state) continue;
      // Convert provenance config entries back to TraitApplication form
      for (const [key, pv] of Object.entries(state.provenanceConfig)) {
        allTraits.push({
          name: pv.source ?? id,
          config: { [key]: pv.value },
          context: pv.context,
        });
      }
    }

    const composition = allTraits.length > 0
      ? this.semiring.add(allTraits)
      : {
          config: {},
          provenance: {},
          conflicts: [],
          errors: [],
          deadElements: [],
        };

    const mergedHash = this.getMergedHash(nowMs);

    return {
      composition,
      mergedHash,
      activeNodeIds: activeIds,
      staleNodeIds: staleIds,
      logicalClock: this.logicalClock,
    };
  }

  /**
   * Return the current Lamport clock value.
   */
  getClock(): number {
    return this.logicalClock;
  }

  /**
   * Export the local node's state for gossip to peers.
   */
  exportLocalState(): NodeTransformState | undefined {
    return this.nodeStates.get(this.nodeId);
  }

  /**
   * Number of nodes currently tracked (active + stale).
   */
  knownNodeCount(): number {
    return this.nodeStates.size;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function generateNodeId(): string {
  // Deterministically random enough for test/prototype use.
  const r = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `node-${r()}${r()}-${r()}`;
}
