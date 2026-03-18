/**
 * Conflict-free Replicated Data Types (CRDTs)
 *
 * Provides native structures for mathematical, set, and register resolution
 * preventing distributed state overrides across the Swarm layer.
 */

/**
 * Last-Write-Wins Register (LWW-Register)
 * 
 * A CRDT that resolves conflicts by keeping the value with the latest timestamp.
 * When timestamps are equal, uses deterministic lexical comparison for consistency.
 * 
 * @template T The type of value stored in the register
 */
export class LWWRegister<T> {
  /** The current value stored in this register */
  public value: T;
  /** Timestamp indicating when this value was written */
  public timestamp: number;

  /**
   * Creates a new LWW-Register with an initial value and timestamp
   * 
   * @param initialValue - The initial value to store
   * @param timestamp - Optional timestamp (defaults to current time)
   * 
   * @example
   * ```typescript
   * const register = new LWWRegister("hello", 1000);
   * ```
   */
  constructor(initialValue: T, timestamp: number = Date.now()) {
    this.value = initialValue;
    this.timestamp = timestamp;
  }

  /**
   * Merges this register with another LWW-Register
   * 
   * Uses last-write-wins semantics with deterministic tie-breaking
   * when timestamps are equal.
   * 
   * @param other - The other LWW-Register to merge with
   */
  merge(other: LWWRegister<T>): void {
    if (other.timestamp > this.timestamp) {
      this.value = other.value;
      this.timestamp = other.timestamp;
    } else if (other.timestamp === this.timestamp) {
      // Deterministic fallback (e.g. lexical or stringified comparison)
      if (JSON.stringify(other.value) > JSON.stringify(this.value)) {
        this.value = other.value;
      }
    }
  }
}

/**
 * Positive-Negative Counter (PN-Counter)
 * 
 * A CRDT counter that supports both increment and decrement operations
 * by maintaining separate increment/decrement maps per actor.
 */
export class PNCounter {
  /** Map of ActorID -> Increments */
  private p: Map<string, number> = new Map();
  /** Map of ActorID -> Decrements */
  private n: Map<string, number> = new Map();

  /**
   * Creates a new PN-Counter with optional initial state
   * 
   * @param initialIncrements - Optional initial increment values per actor
   * @param initialDecrements - Optional initial decrement values per actor
   * 
   * @example
   * ```typescript
   * const counter = new PNCounter(
   *   { "actor1": 5 },
   *   { "actor2": 2 }
   * );
   * ```
   */
  constructor(
    initialIncrements?: Record<string, number>,
    initialDecrements?: Record<string, number>
  ) {
    if (initialIncrements) {
      for (const [k, v] of Object.entries(initialIncrements)) this.p.set(k, v);
    }
    if (initialDecrements) {
      for (const [k, v] of Object.entries(initialDecrements)) this.n.set(k, v);
    }
  }

  /**
   * Increments the counter for a specific actor
   * 
   * @param actorId - Unique identifier for the actor performing the increment
   * @param amount - Amount to increment by (defaults to 1, always treated as positive)
   */
  increment(actorId: string, amount: number = 1): void {
    const current = this.p.get(actorId) || 0;
    this.p.set(actorId, current + Math.abs(amount));
  }

  /**
   * Decrements the counter for a specific actor
   * 
   * @param actorId - Unique identifier for the actor performing the decrement
   * @param amount - Amount to decrement by (defaults to 1, always treated as positive)
   */
  decrement(actorId: string, amount: number = 1): void {
    const current = this.n.get(actorId) || 0;
    this.n.set(actorId, current + Math.abs(amount));
  }

  /**
   * Computes the current value of the counter
   * 
   * @returns The current counter value (sum of increments minus sum of decrements)
   */
  value(): number {
    let positive = 0;
    for (const v of this.p.values()) positive += v;
    let negative = 0;
    for (const v of this.n.values()) negative += v;
    return positive - negative;
  }

  /**
   * Merges this counter with another PN-Counter
   * 
   * Takes the maximum value for each actor in both increment and decrement maps.
   * 
   * @param other - The other PN-Counter to merge with
   */
  merge(other: PNCounter): void {
    for (const [k, v] of other.p.entries()) {
      this.p.set(k, Math.max(this.p.get(k) || 0, v));
    }
    for (const [k, v] of other.n.entries()) {
      this.n.set(k, Math.max(this.n.get(k) || 0, v));
    }
  }
}

/**
 * Observed-Remove Set (OR-Set)
 * 
 * A CRDT set that supports both add and remove operations.
 * Each element is tagged with a unique ID to handle concurrent operations.
 * 
 * @template T The type of elements stored in the set
 */
export class ORSet<T> {
  /** Set of unique tags (element + unique ID) for added elements */
  private added: Set<string> = new Set();
  /** Set of unique tags that have been removed */
  private removed: Set<string> = new Set();

  /**
   * Adds an element to the set with a unique identifier
   * 
   * @param element - The element to add
   * @param uniqueId - Optional unique identifier (auto-generated if not provided)
   * 
   * @example
   * ```typescript
   * const set = new ORSet<string>();
   * set.add("hello", "unique-id-1");
   * ```
   */
  add(element: T, uniqueId: string = Math.random().toString(36).substring(2, 9)): void {
    const tag = JSON.stringify({ e: element, id: uniqueId });
    this.added.add(tag);
  }

  /**
   * Removes an element from the set
   * 
   * Marks all current observations of this element as removed.
   * 
   * @param element - The element to remove
   */
  remove(element: T): void {
    // Remove all current observations of this element
    for (const tagStr of this.added) {
      const tag = JSON.parse(tagStr);
      // Deep equality or identity check
      if (JSON.stringify(tag.e) === JSON.stringify(element)) {
        this.removed.add(tagStr);
      }
    }
  }

  /**
   * Returns the current value of the set
   * 
   * @returns Array of elements currently in the set (deduplicated)
   */
  value(): T[] {
    const result: T[] = [];
    const seen = new Set<string>();

    for (const tagStr of this.added) {
      if (!this.removed.has(tagStr)) {
        const tag = JSON.parse(tagStr);
        const eStr = JSON.stringify(tag.e);
        if (!seen.has(eStr)) {
          result.push(tag.e);
          seen.add(eStr);
        }
      }
    }
    return result;
  }

  /**
   * Merges this set with another OR-Set
   * 
   * Combines both added and removed tag sets from both instances.
   * 
   * @param other - The other OR-Set to merge with
   */
  merge(other: ORSet<T>): void {
    for (const tag of other.added) {
      this.added.add(tag);
    }
    for (const tag of other.removed) {
      this.removed.add(tag);
    }
  }
}

/**
 * Type guard to check if an object implements the basic CRDT interface
 * 
 * @param obj - The object to check
 * @returns True if the object has a merge method (basic CRDT requirement)
 * 
 * @example
 * ```typescript
 * if (isCRDT(someObject)) {
 *   someObject.merge(anotherCRDT);
 * }
 * ```
 */
export function isCRDT(obj: any): boolean {
  return obj && typeof obj === 'object' && typeof obj.merge === 'function';
}