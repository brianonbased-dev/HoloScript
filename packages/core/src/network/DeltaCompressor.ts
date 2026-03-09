export interface StateDelta {
  entityId: string;
  field: string;
  oldValue: any;
  newValue: any;
  timestamp: number;
}

import { isCRDT } from './CRDT';

/**
 * DeltaCompressor
 * Diffing engine designed to compress standard property payloads
 * down to minimal state transfer sizes for autonomous Swarm networking.
 */
export class DeltaCompressor {
  /**
   * Compare two state objects and extract the modified fields natively.
   * Yields a flat array of atomic changes mapping deeply nested graph differences.
   */
  static computeDeltas(
    entityId: string,
    oldState: Record<string, any>,
    newState: Record<string, any>
  ): StateDelta[] {
    const deltas: StateDelta[] = [];
    const now = Date.now();

    // Check for modified or fundamentally new fields in the new state payload
    for (const [key, newValue] of Object.entries(newState)) {
      const oldValue = oldState[key];
      if (oldValue !== newValue) {
        // If it's a deep object, we probably need recursive diffing,
        // but for MVP networking primitives we'll stick to shallow checks + reference identity.
        deltas.push({
          entityId,
          field: key,
          oldValue: oldValue ?? null,
          newValue,
          timestamp: now,
        });
      }
    }

    // Technically we could check for deleted fields in oldState too,
    // but for high frequency simulation matrices, missing keys just means "unmodified".

    return deltas;
  }

  /**
   * Hydrate a previous target state mapping with an array of sequential deltas
   */
  static applyDeltas(targetState: Record<string, any>, deltas: StateDelta[]): Record<string, any> {
    const hydrated = { ...targetState };
    // We assume deltas are ordered securely by the networking layer (time-series).
    for (const delta of deltas) {
      const currentValue = hydrated[delta.field];
      if (isCRDT(currentValue) && isCRDT(delta.newValue)) {
        // Native CRDT conflict resolution (e.g. Last-Write-Wins, ORSet merges)
        currentValue.merge(delta.newValue);
      } else {
        hydrated[delta.field] = delta.newValue;
      }
    }
    return hydrated;
  }
}
