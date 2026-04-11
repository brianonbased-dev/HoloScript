/**
 * CRDT Type Primitives: LWW-Register, G-Counter, OR-Set
 * Standard library implementations for conflict-free replicated data types.
 * @version 1.0.0
 */

/** LWW-Register: Last-Writer-Wins Register */
export class LWWRegister<T> {
  private value: T;
  private timestamp: number;
  private nodeId: string;
  constructor(initial: T, nodeId: string) {
    this.value = initial;
    this.timestamp = 0;
    this.nodeId = nodeId;
  }
  get(): T {
    return this.value;
  }
  set(value: T, timestamp?: number): void {
    const ts = timestamp ?? Date.now();
    if (ts > this.timestamp || (ts === this.timestamp && this.nodeId > this.nodeId)) {
      this.value = value;
      this.timestamp = ts;
    }
  }
  merge(other: { value: T; timestamp: number; nodeId: string }): void {
    if (
      other.timestamp > this.timestamp ||
      (other.timestamp === this.timestamp && other.nodeId > this.nodeId)
    ) {
      this.value = other.value;
      this.timestamp = other.timestamp;
    }
  }
  getState(): { value: T; timestamp: number; nodeId: string } {
    return { value: this.value, timestamp: this.timestamp, nodeId: this.nodeId };
  }
}

/** G-Counter: Grow-only Counter */
export class GCounter {
  private counts: Map<string, number> = new Map();
  private nodeId: string;
  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.counts.set(nodeId, 0);
  }
  increment(amount: number = 1): void {
    if (amount < 0) throw new Error('G-Counter only supports non-negative increments');
    const current = this.counts.get(this.nodeId) ?? 0;
    this.counts.set(this.nodeId, current + amount);
  }
  value(): number {
    let sum = 0;
    for (const v of this.counts.values()) sum += v;
    return sum;
  }
  merge(other: Map<string, number>): void {
    for (const [node, count] of other) {
      const current = this.counts.get(node) ?? 0;
      this.counts.set(node, Math.max(current, count));
    }
  }
  getState(): Map<string, number> {
    return new Map(this.counts);
  }
}

/** PN-Counter: Positive-Negative Counter (grow + shrink) */
export class PNCounter {
  private pos: GCounter;
  private neg: GCounter;
  constructor(nodeId: string) {
    this.pos = new GCounter(nodeId);
    this.neg = new GCounter(nodeId);
  }
  increment(amount: number = 1): void {
    this.pos.increment(amount);
  }
  decrement(amount: number = 1): void {
    this.neg.increment(amount);
  }
  value(): number {
    return this.pos.value() - this.neg.value();
  }
  merge(other: { pos: Map<string, number>; neg: Map<string, number> }): void {
    this.pos.merge(other.pos);
    this.neg.merge(other.neg);
  }
  getState(): { pos: Map<string, number>; neg: Map<string, number> } {
    return { pos: this.pos.getState(), neg: this.neg.getState() };
  }
}

/** OR-Set: Observed-Remove Set */
export class ORSet<T> {
  private elements: Map<string, { value: T; tag: string }> = new Map();
  private tombstones: Set<string> = new Set();
  private nodeId: string;
  private tagCounter: number = 0;
  constructor(nodeId: string) {
    this.nodeId = nodeId;
  }
  private generateTag(): string {
    return `${this.nodeId}:${++this.tagCounter}:${Date.now()}`;
  }
  add(value: T): string {
    const tag = this.generateTag();
    const _key = JSON.stringify(value);
    this.elements.set(tag, { value, tag });
    return tag;
  }
  remove(value: T): void {
    const key = JSON.stringify(value);
    for (const [tag, entry] of this.elements) {
      if (JSON.stringify(entry.value) === key) {
        this.tombstones.add(tag);
        this.elements.delete(tag);
      }
    }
  }
  has(value: T): boolean {
    const key = JSON.stringify(value);
    for (const entry of this.elements.values()) {
      if (JSON.stringify(entry.value) === key) return true;
    }
    return false;
  }
  values(): T[] {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const entry of this.elements.values()) {
      const key = JSON.stringify(entry.value);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(entry.value);
      }
    }
    return result;
  }
  size(): number {
    return this.values().length;
  }
  merge(other: {
    elements: Map<string, { value: T; tag: string }>;
    tombstones: Set<string>;
  }): void {
    for (const [tag, entry] of other.elements) {
      if (!this.tombstones.has(tag) && !other.tombstones.has(tag)) {
        this.elements.set(tag, entry);
      }
    }
    for (const tag of other.tombstones) {
      this.tombstones.add(tag);
      this.elements.delete(tag);
    }
  }
  getState(): { elements: Map<string, { value: T; tag: string }>; tombstones: Set<string> } {
    return { elements: new Map(this.elements), tombstones: new Set(this.tombstones) };
  }
}
