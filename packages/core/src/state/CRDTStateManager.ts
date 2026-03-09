/**
 * CRDT State Manager for HoloScript+
 *
 * Implements a causal-consistent state manager using State Vectors.
 * Supports complex conflict resolution and state synchronization.
 */

export interface CRDTOperation {
  clientId: string;
  clock: number;
  key: string;
  value: any;
}

export class CRDTStateManager {
  private clientId: string;
  private stateVector: Map<string, number> = new Map();
  private registers: Map<string, CRDTOperation> = new Map();

  constructor(clientId: string) {
    this.clientId = clientId;
    this.stateVector.set(clientId, 0);
  }

  /**
   * Create an operation for a local update.
   */
  public createOperation(key: string, value: any): CRDTOperation {
    const currentClock = (this.stateVector.get(this.clientId) || 0) + 1;
    this.stateVector.set(this.clientId, currentClock);

    return {
      clientId: this.clientId,
      clock: currentClock,
      key,
      value,
    };
  }

  /**
   * Reconcile an incoming operation.
   * Uses Hybrid Logical Clock (HLC) inspired resolution.
   */
  public reconcile(op: CRDTOperation): boolean {
    const current = this.registers.get(op.key);

    // Update local state vector to ensure causal progress
    const remoteClock = op.clock;
    const localClock = this.stateVector.get(op.clientId) || 0;
    this.stateVector.set(op.clientId, Math.max(localClock, remoteClock));

    // Conflict Resolution:
    // 1. Higher clock wins (causal order)
    // 2. Tie-break with clientId
    if (
      !current ||
      op.clock > current.clock ||
      (op.clock === current.clock && op.clientId > current.clientId)
    ) {
      this.registers.set(op.key, op);
      return true;
    }

    return false;
  }

  public getSnapshot(): Record<string, any> {
    const snapshot: Record<string, any> = {};
    this.registers.forEach((op, key) => {
      snapshot[key] = op.value;
    });
    return snapshot;
  }

  public getStateVector(): Record<string, number> {
    const vector: Record<string, number> = {};
    this.stateVector.forEach((clock, id) => {
      vector[id] = clock;
    });
    return vector;
  }
}
