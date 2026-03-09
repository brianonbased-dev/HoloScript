/**
 * Last-Write-Wins Register CRDT
 *
 * A register that stores a single value, where concurrent writes are
 * resolved by timestamp (last write wins). Ties are broken by actor DID.
 *
 * @version 1.0.0
 */

import type { DIDSigner, SignedOperation } from '../auth/DIDSigner';
import { CRDTOperationType } from '../auth/DIDSigner';

/**
 * LWW-Register value with metadata
 */
export interface LWWValue<T> {
  /** The actual value */
  value: T;

  /** Timestamp when this value was set */
  timestamp: number;

  /** Actor DID that set this value */
  actorDid: string;

  /** Operation ID that set this value */
  operationId: string;
}

/**
 * Last-Write-Wins Register CRDT
 *
 * Implements a register that automatically resolves conflicts by selecting
 * the value with the highest timestamp. If timestamps are equal (rare but
 * possible), the actor DID is used as a deterministic tiebreaker.
 *
 * Properties:
 * - Strong Eventual Consistency: All replicas converge to same value
 * - Commutative: Operations can be applied in any order
 * - Idempotent: Applying same operation multiple times has same effect
 * - Authenticated: All operations signed with DID
 */
export class LWWRegister<T> {
  private crdtId: string;
  private signer: DIDSigner;
  private current: LWWValue<T> | null = null;

  constructor(crdtId: string, signer: DIDSigner, initialValue?: T) {
    this.crdtId = crdtId;
    this.signer = signer;

    if (initialValue !== undefined) {
      this.current = {
        value: initialValue,
        timestamp: Date.now(),
        actorDid: signer.getDID(),
        operationId: 'initial',
      };
    }
  }

  /**
   * Set register value (local operation)
   *
   * Creates and signs an authenticated operation to set the register value.
   * Returns the signed operation for propagation to other replicas.
   */
  async set(value: T): Promise<SignedOperation> {
    const operation = this.signer.createOperation(CRDTOperationType.LWW_SET, this.crdtId, value);

    // Apply locally
    this.applySet(operation.id, value, operation.timestamp, operation.actorDid);

    // Sign and return for propagation
    return await this.signer.signOperation(operation);
  }

  /**
   * Get current register value
   */
  get(): T | null {
    return this.current?.value ?? null;
  }

  /**
   * Get current value with metadata
   */
  getWithMetadata(): LWWValue<T> | null {
    return this.current;
  }

  /**
   * Apply a remote set operation
   *
   * Merges a remote operation using LWW conflict resolution:
   * 1. If remote timestamp > local timestamp → accept remote
   * 2. If timestamps equal → compare actor DIDs lexicographically
   * 3. If remote timestamp < local timestamp → reject remote
   */
  applyRemoteOperation(
    operationId: string,
    value: T,
    timestamp: number,
    actorDid: string
  ): boolean {
    return this.applySet(operationId, value, timestamp, actorDid);
  }

  /**
   * Internal: Apply set operation with LWW conflict resolution
   */
  private applySet(operationId: string, value: T, timestamp: number, actorDid: string): boolean {
    // First write wins if no current value
    if (!this.current) {
      this.current = { value, timestamp, actorDid, operationId };
      return true;
    }

    // LWW conflict resolution
    if (timestamp > this.current.timestamp) {
      // Remote is newer → accept
      this.current = { value, timestamp, actorDid, operationId };
      return true;
    } else if (timestamp === this.current.timestamp) {
      // Timestamps equal → deterministic tiebreaker using actor DID
      if (actorDid > this.current.actorDid) {
        this.current = { value, timestamp, actorDid, operationId };
        return true;
      }
    }

    // Remote is older or lost tiebreaker → reject
    return false;
  }

  /**
   * Get CRDT instance ID
   */
  getCRDTId(): string {
    return this.crdtId;
  }

  /**
   * Serialize register state for persistence or transmission
   */
  serialize(): string {
    return JSON.stringify(this.current);
  }

  /**
   * Deserialize register state
   */
  static deserialize<T>(crdtId: string, signer: DIDSigner, serialized: string): LWWRegister<T> {
    const register = new LWWRegister<T>(crdtId, signer);
    const current = JSON.parse(serialized) as LWWValue<T> | null;
    if (current) {
      register.current = current;
    }
    return register;
  }
}
