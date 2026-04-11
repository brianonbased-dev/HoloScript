/**
 * Idempotent A2A Transport Adapter
 *
 * Wraps any base A2ATransportAdapter to provide exactly-once delivery
 * semantics via request deduplication and response caching.
 *
 * Features:
 * - Request deduplication using message ID + TTL cache
 * - Idempotency key header (X-Idempotency-Key)
 * - Response caching for retried requests (returns cached response)
 * - Configurable TTL, max cache size, retry detection
 */

/** Mirrors the A2ATransportAdapter interface from @holoscript/framework */
export interface A2ATransportLike {
  send(input: {
    endpointUrl: string;
    requestBody: Record<string, unknown>;
    idempotencyKey: string;
    fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  }): Promise<unknown>;
}

export interface IdempotentTransportConfig {
  /** Time-to-live for cached responses in milliseconds. Default: 300_000 (5 min) */
  ttlMs?: number;
  /** Maximum number of entries in the dedup cache. Default: 10_000 */
  maxCacheSize?: number;
  /** Header name for the idempotency key. Default: 'X-Idempotency-Key' */
  idempotencyHeader?: string;
  /** Custom clock for testing. Returns epoch ms. */
  now?: () => number;
}

interface CacheEntry {
  response: unknown;
  createdAt: number;
  idempotencyKey: string;
}

/** Status of a send operation for observability */
export type DeliveryStatus = 'fresh' | 'deduped' | 'error';

export interface DeliveryResult {
  status: DeliveryStatus;
  response: unknown;
  idempotencyKey: string;
  cached: boolean;
}

/**
 * Wraps a base A2A transport to guarantee exactly-once processing.
 *
 * When a request arrives with an idempotency key that has already been
 * processed (and the cached response hasn't expired), the adapter returns
 * the cached response without forwarding to the base transport.
 *
 * The adapter also injects the `X-Idempotency-Key` header (configurable)
 * into outgoing fetch calls by wrapping the provided `fetchFn`.
 */
export class IdempotentTransportAdapter implements A2ATransportLike {
  private readonly base: A2ATransportLike;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxCacheSize: number;
  private readonly idempotencyHeader: string;
  private readonly now: () => number;

  /** In-flight promises keyed by idempotency key — coalesces concurrent retries */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(base: A2ATransportLike, config: IdempotentTransportConfig = {}) {
    this.base = base;
    this.ttlMs = config.ttlMs ?? 300_000;
    this.maxCacheSize = config.maxCacheSize ?? 10_000;
    this.idempotencyHeader = config.idempotencyHeader ?? 'X-Idempotency-Key';
    this.now = config.now ?? (() => Date.now());
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async send(input: {
    endpointUrl: string;
    requestBody: Record<string, unknown>;
    idempotencyKey: string;
    fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  }): Promise<unknown> {
    const { endpointUrl, requestBody, idempotencyKey, fetchFn } = input;

    // 1. Check cache — return immediately if we have a non-expired hit
    const cached = this.cache.get(idempotencyKey);
    if (cached && !this.isExpired(cached)) {
      return cached.response;
    }

    // 2. Coalesce concurrent in-flight requests with the same key
    const existing = this.inflight.get(idempotencyKey);
    if (existing) {
      return existing;
    }

    // 3. Wrap fetchFn to inject the idempotency header
    const wrappedFetch = (url: string, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      headers.set(this.idempotencyHeader, idempotencyKey);
      return fetchFn(url, { ...init, headers });
    };

    // 4. Delegate to base transport
    const promise = this.base
      .send({
        endpointUrl,
        requestBody,
        idempotencyKey,
        fetchFn: wrappedFetch,
      })
      .then((response) => {
        // Cache successful response
        this.evictIfNeeded();
        this.cache.set(idempotencyKey, {
          response,
          createdAt: this.now(),
          idempotencyKey,
        });
        this.inflight.delete(idempotencyKey);
        return response;
      })
      .catch((err: unknown) => {
        // Don't cache errors — allow retry
        this.inflight.delete(idempotencyKey);
        throw err;
      });

    this.inflight.set(idempotencyKey, promise);
    return promise;
  }

  /**
   * Send with enriched delivery metadata.
   * Useful for observability / tracing.
   */
  async sendWithStatus(input: {
    endpointUrl: string;
    requestBody: Record<string, unknown>;
    idempotencyKey: string;
    fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  }): Promise<DeliveryResult> {
    const { idempotencyKey } = input;

    const cached = this.cache.get(idempotencyKey);
    if (cached && !this.isExpired(cached)) {
      return {
        status: 'deduped',
        response: cached.response,
        idempotencyKey,
        cached: true,
      };
    }

    try {
      const response = await this.send(input);
      return {
        status: 'fresh',
        response,
        idempotencyKey,
        cached: false,
      };
    } catch (err) {
      return {
        status: 'error',
        response: err,
        idempotencyKey,
        cached: false,
      };
    }
  }

  /** Returns true if the given idempotency key has a cached (non-expired) response */
  has(idempotencyKey: string): boolean {
    const entry = this.cache.get(idempotencyKey);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.cache.delete(idempotencyKey);
      return false;
    }
    return true;
  }

  /** Current number of cached entries */
  get size(): number {
    return this.cache.size;
  }

  /** Manually clear the cache */
  clear(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  /** Remove expired entries (call periodically if cache is long-lived) */
  prune(): number {
    let pruned = 0;
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private isExpired(entry: CacheEntry): boolean {
    return this.now() - entry.createdAt > this.ttlMs;
  }

  private evictIfNeeded(): void {
    if (this.cache.size < this.maxCacheSize) return;

    // Evict expired first
    this.prune();

    // If still over limit, evict oldest entries (FIFO — Map preserves insertion order)
    if (this.cache.size >= this.maxCacheSize) {
      const excess = this.cache.size - this.maxCacheSize + 1;
      const keys = this.cache.keys();
      for (let i = 0; i < excess; i++) {
        const next = keys.next();
        if (!next.done) {
          this.cache.delete(next.value);
        }
      }
    }
  }
}
