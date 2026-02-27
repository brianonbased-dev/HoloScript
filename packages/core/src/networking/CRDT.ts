/**
 * Conflict-free Replicated Data Types (CRDTs)
 * 
 * Provides native structures for mathematical, set, and register resolution 
 * preventing distributed state overrides across the Swarm layer.
 */

// 1. Last-Write-Wins Register (LWW-Register)
export class LWWRegister<T> {
    public value: T;
    public timestamp: number;

    constructor(initialValue: T, timestamp: number = Date.now()) {
        this.value = initialValue;
        this.timestamp = timestamp;
    }

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

// 2. Positive-Negative Counter (PN-Counter)
export class PNCounter {
    // Map of ActorID -> Increments
    private p: Map<string, number> = new Map();
    // Map of ActorID -> Decrements
    private n: Map<string, number> = new Map();

    constructor(initialIncrements?: Record<string, number>, initialDecrements?: Record<string, number>) {
        if (initialIncrements) {
            for (const [k, v] of Object.entries(initialIncrements)) this.p.set(k, v);
        }
        if (initialDecrements) {
            for (const [k, v] of Object.entries(initialDecrements)) this.n.set(k, v);
        }
    }

    increment(actorId: string, amount: number = 1): void {
        const current = this.p.get(actorId) || 0;
        this.p.set(actorId, current + Math.abs(amount));
    }

    decrement(actorId: string, amount: number = 1): void {
        const current = this.n.get(actorId) || 0;
        this.n.set(actorId, current + Math.abs(amount));
    }

    value(): number {
        let positive = 0;
        for (const v of this.p.values()) positive += v;
        let negative = 0;
        for (const v of this.n.values()) negative += v;
        return positive - negative;
    }

    merge(other: PNCounter): void {
        for (const [k, v] of other.p.entries()) {
            this.p.set(k, Math.max(this.p.get(k) || 0, v));
        }
        for (const [k, v] of other.n.entries()) {
            this.n.set(k, Math.max(this.n.get(k) || 0, v));
        }
    }
}

// 3. Observed-Remove Set (OR-Set)
export class ORSet<T> {
    // Set of unique tags (element + unique ID) for added elements
    private added: Set<string> = new Set();
    // Set of unique tags that have been removed
    private removed: Set<string> = new Set();

    add(element: T, uniqueId: string = Math.random().toString(36).substring(2, 9)): void {
        const tag = JSON.stringify({ e: element, id: uniqueId });
        this.added.add(tag);
    }

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

    merge(other: ORSet<T>): void {
        for (const tag of other.added) {
            this.added.add(tag);
        }
        for (const tag of other.removed) {
            this.removed.add(tag);
        }
    }
}

// Type guard to check if an object implements the basic CRDT interface
export function isCRDT(obj: any): boolean {
    return obj && typeof obj === 'object' && typeof obj.merge === 'function';
}
