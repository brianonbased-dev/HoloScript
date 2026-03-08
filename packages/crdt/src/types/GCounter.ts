/**
 * Grow-only Counter CRDT
 *
 * A counter that only supports increment operations. Maintains a vector
 * of per-actor counts, making increments commutative and idempotent.
 *
 * @version 1.0.0
 */

import type { DIDSigner, SignedOperation } from '../auth/DIDSigner';
import { CRDTOperationType } from '../auth/DIDSigner';

/**
 * Per-actor counter state
 */
interface ActorCount {
  /** Actor's DID */
  actorDid: string;

  /** Current count for this actor */
  count: number;

  /** Last operation ID from this actor */
  lastOperationId: string;

  /** Timestamp of last update */
  lastTimestamp: number;
}

/**
 * Grow-only Counter CRDT
 *
 * Implements a counter that only increases. Each actor maintains their
 * own counter, and the total is the sum of all actor counters. This
 * ensures commutativity (operations can be applied in any order) and
 * idempotency (same operation applied twice has same effect).
 *
 * Properties:
 * - Strong Eventual Consistency: All replicas converge
 * - Monotonic: Value only increases
 * - Commutative: Order doesn't matter
 * - Idempotent: Duplicate operations are safe
 * - Authenticated: All increments signed with DID
 */
export class GCounter {
  private crdtId: string;
  private signer: DIDSigner;
  private counters: Map<string, ActorCount> = new Map();

  constructor(crdtId: string, signer: DIDSigner) {
    this.crdtId = crdtId;
    this.signer = signer;

    // Initialize this actor's counter
    this.counters.set(signer.getDID(), {
      actorDid: signer.getDID(),
      count: 0,
      lastOperationId: 'initial',
      lastTimestamp: 0,
    });
  }

  /**
   * Increment counter (local operation)
   *
   * Increments this actor's counter by the specified amount.
   * Returns signed operation for propagation to other replicas.
   */
  async increment(amount: number = 1): Promise<SignedOperation> {
    if (amount < 0) {
      throw new Error('G-Counter only supports positive increments (grow-only)');
    }

    const actorDid = this.signer.getDID();
    const actorCount = this.counters.get(actorDid)!;

    // Increment local counter
    const newCount = actorCount.count + amount;

    const operation = this.signer.createOperation(CRDTOperationType.G_COUNTER_INCREMENT, this.crdtId, {
      amount,
      newCount,
    });

    // Apply locally
    this.applyIncrement(actorDid, newCount, operation.id, operation.timestamp);

    // Sign and return
    return await this.signer.signOperation(operation);
  }

  /**
   * Get current counter value (sum of all actor counters)
   */
  value(): number {
    let total = 0;
    for (const actorCount of this.counters.values()) {
      total += actorCount.count;
    }
    return total;
  }

  /**
   * Get per-actor breakdown
   */
  getActorCounts(): Map<string, number> {
    const result = new Map<string, number>();
    for (const [actorDid, actorCount] of this.counters) {
      result.set(actorDid, actorCount.count);
    }
    return result;
  }

  /**
   * Get count for specific actor
   */
  getActorCount(actorDid: string): number {
    return this.counters.get(actorDid)?.count ?? 0;
  }

  /**
   * Apply remote increment operation
   *
   * Merges remote increment using max-merge semantics:
   * - If remote count > local count for actor → update
   * - If remote count <= local count → ignore (already applied)
   */
  applyRemoteIncrement(
    actorDid: string,
    newCount: number,
    operationId: string,
    timestamp: number,
  ): boolean {
    return this.applyIncrement(actorDid, newCount, operationId, timestamp);
  }

  /**
   * Internal: Apply increment with max-merge
   */
  private applyIncrement(
    actorDid: string,
    newCount: number,
    operationId: string,
    timestamp: number,
  ): boolean {
    let actorCount = this.counters.get(actorDid);

    if (!actorCount) {
      // First time seeing this actor
      this.counters.set(actorDid, {
        actorDid,
        count: newCount,
        lastOperationId: operationId,
        lastTimestamp: timestamp,
      });
      return true;
    }

    // Max-merge: Only update if new count is greater
    if (newCount > actorCount.count) {
      actorCount.count = newCount;
      actorCount.lastOperationId = operationId;
      actorCount.lastTimestamp = timestamp;
      return true;
    }

    // Already applied or older operation
    return false;
  }

  /**
   * Merge with another G-Counter
   *
   * Takes the maximum count for each actor. This is the merge function
   * for G-Counter CRDTs.
   */
  merge(other: GCounter): void {
    for (const [actorDid, otherCount] of other.counters) {
      this.applyIncrement(
        actorDid,
        otherCount.count,
        otherCount.lastOperationId,
        otherCount.lastTimestamp,
      );
    }
  }

  /**
   * Get CRDT instance ID
   */
  getCRDTId(): string {
    return this.crdtId;
  }

  /**
   * Serialize counter state
   */
  serialize(): string {
    const state = Array.from(this.counters.entries()).map(([actorDid, actorCount]) => ({
      actorDid,
      count: actorCount.count,
      lastOperationId: actorCount.lastOperationId,
      lastTimestamp: actorCount.lastTimestamp,
    }));

    return JSON.stringify(state);
  }

  /**
   * Deserialize counter state
   */
  static deserialize(crdtId: string, signer: DIDSigner, serialized: string): GCounter {
    const counter = new GCounter(crdtId, signer);

    const state = JSON.parse(serialized) as Array<{
      actorDid: string;
      count: number;
      lastOperationId: string;
      lastTimestamp: number;
    }>;

    counter.counters.clear();

    for (const item of state) {
      counter.counters.set(item.actorDid, {
        actorDid: item.actorDid,
        count: item.count,
        lastOperationId: item.lastOperationId,
        lastTimestamp: item.lastTimestamp,
      });
    }

    return counter;
  }

  /**
   * Get vector clock (for debugging)
   */
  getVectorClock(): Record<string, number> {
    const vc: Record<string, number> = {};
    for (const [actorDid, actorCount] of this.counters) {
      vc[actorDid] = actorCount.count;
    }
    return vc;
  }
}
