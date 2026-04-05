/**
 * DistributedClaimer — Optimistic CAS-based task claiming across machines.
 *
 * Uses the MeshDiscovery gossip layer for distributed state.
 * Conflict resolution: priority + first-writer-wins via monotonic timestamps.
 *
 * FW-0.6 — Distributed task claiming across machines.
 *
 * @module distributed-claimer
 */

import type { MeshDiscovery, GossipPacket } from './mesh';
import type { GossipProtocol } from './mesh';

// =============================================================================
// TYPES
// =============================================================================

export interface ClaimResult {
  /** Whether this agent successfully claimed the task */
  success: boolean;
  /** The task ID that was claimed */
  taskId: string;
  /** The agent that holds the claim (may differ from requester on conflict) */
  claimedBy: string;
  /** Monotonic timestamp of the winning claim */
  claimTimestamp: number;
  /** If claim was contested, the losing agent IDs */
  contested?: string[];
}

export interface ClaimRecord {
  taskId: string;
  agentId: string;
  /** Monotonic timestamp (Date.now + counter to guarantee uniqueness) */
  timestamp: number;
  /** Agent priority — lower is higher priority */
  priority: number;
  /** Expiry timestamp — claims expire if not confirmed */
  expiresAt: number;
}

export interface DistributedClaimerConfig {
  /** Claim TTL in ms before auto-expiry (default 30_000) */
  claimTtlMs?: number;
  /** How often to prune expired claims in ms (default 10_000) */
  pruneIntervalMs?: number;
}

// =============================================================================
// CLAIM GOSSIP PAYLOAD
// =============================================================================

interface ClaimGossipPayload {
  type: 'claim' | 'release' | 'confirm';
  record: ClaimRecord;
}

function isClaimPayload(p: unknown): p is ClaimGossipPayload {
  if (!p || typeof p !== 'object') return false;
  const obj = p as Record<string, unknown>;
  return (
    (obj.type === 'claim' || obj.type === 'release' || obj.type === 'confirm') &&
    typeof obj.record === 'object' &&
    obj.record !== null
  );
}

// =============================================================================
// DISTRIBUTED CLAIMER
// =============================================================================

export class DistributedClaimer {
  private claims: Map<string, ClaimRecord> = new Map();
  private claimTtlMs: number;
  private counter = 0;

  constructor(
    private mesh: MeshDiscovery,
    private gossip: GossipProtocol,
    config: DistributedClaimerConfig = {}
  ) {
    this.claimTtlMs = config.claimTtlMs ?? 30_000;
  }

  /**
   * Attempt to claim a task using optimistic CAS.
   *
   * 1. Check local claim state
   * 2. If unclaimed, write optimistic claim + broadcast via gossip
   * 3. If already claimed, compare priority + timestamp (first-writer-wins)
   */
  claim(taskId: string, agentId: string, priority: number = 5): ClaimResult {
    this.pruneExpired();

    const now = Date.now();
    const timestamp = now * 1000 + this.counter++;

    const existing = this.claims.get(taskId);

    // Unclaimed — take it
    if (!existing || existing.expiresAt < now) {
      const record: ClaimRecord = {
        taskId,
        agentId,
        timestamp,
        priority,
        expiresAt: now + this.claimTtlMs,
      };
      this.claims.set(taskId, record);
      this.broadcastClaim('claim', record);
      return { success: true, taskId, claimedBy: agentId, claimTimestamp: timestamp };
    }

    // Already claimed by the same agent — refresh
    if (existing.agentId === agentId) {
      existing.expiresAt = now + this.claimTtlMs;
      return { success: true, taskId, claimedBy: agentId, claimTimestamp: existing.timestamp };
    }

    // Conflict resolution: lower priority number wins; on tie, earlier timestamp wins
    if (
      priority < existing.priority ||
      (priority === existing.priority && timestamp < existing.timestamp)
    ) {
      const loser = existing.agentId;
      const record: ClaimRecord = {
        taskId,
        agentId,
        timestamp,
        priority,
        expiresAt: now + this.claimTtlMs,
      };
      this.claims.set(taskId, record);
      this.broadcastClaim('claim', record);
      return { success: true, taskId, claimedBy: agentId, claimTimestamp: timestamp, contested: [loser] };
    }

    // Lost the conflict
    return { success: false, taskId, claimedBy: existing.agentId, claimTimestamp: existing.timestamp };
  }

  /**
   * Release a claim (task completed or abandoned).
   */
  release(taskId: string, agentId: string): boolean {
    const existing = this.claims.get(taskId);
    if (!existing || existing.agentId !== agentId) return false;
    this.claims.delete(taskId);
    this.broadcastClaim('release', existing);
    return true;
  }

  /**
   * Confirm a claim (mark as committed — extends TTL significantly).
   */
  confirm(taskId: string, agentId: string): boolean {
    const existing = this.claims.get(taskId);
    if (!existing || existing.agentId !== agentId) return false;
    existing.expiresAt = Date.now() + this.claimTtlMs * 10; // 10x TTL for confirmed claims
    this.broadcastClaim('confirm', existing);
    return true;
  }

  /**
   * Get the current claim holder for a task.
   */
  getClaimHolder(taskId: string): ClaimRecord | undefined {
    this.pruneExpired();
    return this.claims.get(taskId);
  }

  /**
   * Get all active claims.
   */
  getActiveClaims(): ClaimRecord[] {
    this.pruneExpired();
    return [...this.claims.values()];
  }

  /**
   * Ingest a gossip packet (called when receiving from peers).
   */
  ingestGossip(packet: GossipPacket): void {
    if (!isClaimPayload(packet.payload)) return;

    const { type, record } = packet.payload;

    if (type === 'release') {
      const existing = this.claims.get(record.taskId);
      if (existing && existing.agentId === record.agentId) {
        this.claims.delete(record.taskId);
      }
      return;
    }

    // claim or confirm — apply CAS logic
    const existing = this.claims.get(record.taskId);
    if (!existing || existing.expiresAt < Date.now()) {
      this.claims.set(record.taskId, { ...record });
      return;
    }

    // Conflict: lower priority wins, then earlier timestamp
    if (
      record.priority < existing.priority ||
      (record.priority === existing.priority && record.timestamp < existing.timestamp)
    ) {
      this.claims.set(record.taskId, { ...record });
    }
  }

  // ── Private ──

  private broadcastClaim(type: ClaimGossipPayload['type'], record: ClaimRecord): void {
    const payload: ClaimGossipPayload = { type, record };
    this.gossip.shareWisdom(`claimer:${this.mesh.localId}`, payload);
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [taskId, record] of this.claims) {
      if (record.expiresAt < now) {
        this.claims.delete(taskId);
      }
    }
  }
}
