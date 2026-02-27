/**
 * LRUCache
 * 
 * A generic Least-Recently-Used cache with TTL (Time-To-Live) tracking.
 * Used to deduplicate identical semantic memory queries to backend databases.
 */
export class LRUCache<K, V> {
    private capacity: number;
    private ttlMs: number;
    private cache: Map<K, { value: V, expiry: number }>;

    constructor(capacity: number = 100, ttlMs: number = 60000) {
        this.capacity = capacity;
        this.ttlMs = ttlMs;
        this.cache = new Map();
    }

    get(key: K): V | undefined {
        const item = this.cache.get(key);
        if (!item) return undefined;

        // Check TTL Expiration
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return undefined;
        }

        // Refresh recency by re-inserting at the end of the Map
        this.cache.delete(key);
        this.cache.set(key, item);
        return item.value;
    }

    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.capacity) {
            // Drop the oldest item (first entry in the Map)
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }

        this.cache.set(key, {
            value,
            expiry: Date.now() + this.ttlMs
        });
    }

    clear(): void {
        this.cache.clear();
    }
}
