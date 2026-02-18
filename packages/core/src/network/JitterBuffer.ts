/**
 * JitterBuffer.ts
 *
 * Reorders out-of-sequence network states and holds them for a configurable
 * jitter window before emitting in-sequence order.
 *
 * Two-step flow:
 *   1. Incoming state → insert() → returns any states now ready to apply
 *   2. Each render frame → tick(now) → returns states whose hold time expired
 *
 * Usage:
 *   const buf = new JitterBuffer({ holdTimeMs: 80 });
 *   const ready = buf.insert(state);
 *   // ...also call buf.tick(Date.now()) once per frame for timeout-driven flush
 *
 * @module network
 */

export interface JitterBufferConfig {
  /** How long (ms) to hold a state before emitting regardless of gaps */
  holdTimeMs: number;
  /** Maximum buffered states per object before oldest is dropped (default 64) */
  maxSize?: number;
  /**
   * If a sequence gap persists for this many × holdTimeMs, skip ahead
   * rather than waiting forever for the missing packet (default 2)
   */
  gapSkipMultiplier?: number;
}

interface JitterEntry<T> {
  state: T;
  receivedAt: number;
}

type NetworkState = {
  sequenceNumber: number;
  objectId: string;
  timestamp: number;
};

export class JitterBuffer<T extends NetworkState> {
  private buffers: Map<string, JitterEntry<T>[]> = new Map();
  private nextExpected: Map<string, number> = new Map();

  private readonly holdTimeMs: number;
  private readonly maxSize: number;
  private readonly gapSkipMultiplier: number;

  constructor(config: JitterBufferConfig) {
    this.holdTimeMs        = config.holdTimeMs;
    this.maxSize           = config.maxSize           ?? 64;
    this.gapSkipMultiplier = config.gapSkipMultiplier ?? 2;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Insert an incoming state.
   * Returns all states that are in-sequence AND have been held long enough.
   */
  insert(state: T): T[] {
    const id  = state.objectId;
    const now = Date.now();

    if (!this.buffers.has(id)) {
      this.buffers.set(id, []);
      this.nextExpected.set(id, state.sequenceNumber);
    }

    const buf = this.buffers.get(id)!;

    // Discard duplicate sequence numbers
    if (buf.some((e) => e.state.sequenceNumber === state.sequenceNumber)) {
      return this.flush(id, now);
    }

    // Insert sorted by sequence number
    buf.push({ state, receivedAt: now });
    buf.sort((a, b) => a.state.sequenceNumber - b.state.sequenceNumber);

    // Trim overflow — drop the oldest
    if (buf.length > this.maxSize) {
      buf.splice(0, buf.length - this.maxSize);
      this.nextExpected.set(id, buf[0].state.sequenceNumber);
    }

    return this.flush(id, now);
  }

  /**
   * Call once per render frame.
   * Emits states whose hold time has expired even if earlier packets are missing
   * (gap-skip logic).
   */
  tick(now: number): T[] {
    const out: T[] = [];
    for (const id of this.buffers.keys()) {
      out.push(...this.flush(id, now));
    }
    return out;
  }

  /**
   * Force-flush all held states (e.g., on reconnect or object despawn).
   * @param objectId If provided, only flush that object; otherwise flush all.
   */
  forceFlush(objectId?: string): T[] {
    const out: T[] = [];
    const ids = objectId ? [objectId] : [...this.buffers.keys()];
    for (const id of ids) {
      const buf = this.buffers.get(id) ?? [];
      out.push(...buf.map((e) => e.state));
      this.buffers.set(id, []);
    }
    return out;
  }

  /** Remove all buffered state for an object (cleanup on despawn). */
  remove(objectId: string): void {
    this.buffers.delete(objectId);
    this.nextExpected.delete(objectId);
  }

  /** Number of states currently buffered for an object. */
  pendingCount(objectId: string): number {
    return this.buffers.get(objectId)?.length ?? 0;
  }

  /** Total states buffered across all objects. */
  totalPending(): number {
    let total = 0;
    for (const buf of this.buffers.values()) total += buf.length;
    return total;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private flush(id: string, now: number): T[] {
    const buf      = this.buffers.get(id)!;
    const ready: T[] = [];
    let expected   = this.nextExpected.get(id)!;

    while (buf.length > 0) {
      const head = buf[0];
      const seq  = head.state.sequenceNumber;
      const age  = now - head.receivedAt;

      if (seq === expected) {
        // In-sequence: emit once held long enough
        if (age >= this.holdTimeMs) {
          buf.shift();
          ready.push(head.state);
          expected++;
        } else {
          break; // Not yet ready — wait
        }
      } else if (seq < expected) {
        // Already passed — late duplicate, drop silently
        buf.shift();
      } else {
        // Gap: seq > expected — wait unless the gap is too stale
        if (age >= this.holdTimeMs * this.gapSkipMultiplier) {
          // Gap timed out — skip ahead to this packet
          expected = seq;
        } else {
          break; // Wait for the missing packet or timeout
        }
      }
    }

    this.nextExpected.set(id, expected);
    return ready;
  }
}
