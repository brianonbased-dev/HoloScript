/**
 * HybridSigner - Convenience wrapper over HybridCryptoProvider
 * for Ed25519 + ML-DSA dual-signing with a simplified API.
 *
 * Extended capabilities:
 *   - Batch signing (sign multiple messages efficiently)
 *   - Signature caching with configurable TTL
 *   - Key rotation with grace period (old signatures still verify)
 *   - Serialization (toJSON / fromJSON for persistence)
 *   - Metrics tracking (sign count, verify count, cache hit rate)
 *
 * @version 2.0.0
 */
import {
  HybridCryptoProvider, Ed25519CryptoProvider, MLDSACryptoProvider,
  type HybridKeyPair, type CompositeSignature, type CompositeVerificationResult,
  isPostQuantumAvailable,
} from './HybridCryptoProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for constructing a HybridSigner. */
export interface HybridSignerOptions {
  /** Enable post-quantum signing (default: true). */
  enablePQ?: boolean;
  /** Default cache TTL in milliseconds (default: 300_000 = 5 minutes). */
  cacheTTLMs?: number;
  /** Grace period in milliseconds during which old keys still verify after rotation (default: 600_000 = 10 minutes). */
  keyRotationGracePeriodMs?: number;
}

/** A single entry in the batch signing result. */
export interface BatchSignResult {
  /** Index in the original input array. */
  index: number;
  /** The composite signature, or null if signing failed. */
  signature: CompositeSignature | null;
  /** Error message if signing failed for this item. */
  error?: string;
}

/** Metrics snapshot from the signer. */
export interface SignerMetrics {
  /** Total sign() and signBatch() individual operations. */
  signCount: number;
  /** Total verify() calls. */
  verifyCount: number;
  /** Cache hit count (signatures served from cache). */
  cacheHits: number;
  /** Cache miss count (signatures computed fresh). */
  cacheMisses: number;
  /** Computed cache hit rate (0..1). Returns 0 if no lookups occurred. */
  cacheHitRate: number;
  /** Number of key rotations performed. */
  keyRotationCount: number;
  /** Number of entries currently in the signature cache. */
  cacheSize: number;
  /** Timestamp of last sign operation (ISO 8601), or null. */
  lastSignAt: string | null;
  /** Timestamp of last verify operation (ISO 8601), or null. */
  lastVerifyAt: string | null;
}

/** Serialized form of a HybridSigner for persistence. */
export interface SerializedHybridSigner {
  version: number;
  enablePQ: boolean;
  cacheTTLMs: number;
  keyRotationGracePeriodMs: number;
  currentKeyPair: HybridKeyPair | null;
  retiredKeyPairs: Array<{ keyPair: HybridKeyPair; retiredAt: string; expiresAt: string }>;
  metrics: Omit<SignerMetrics, 'cacheHitRate' | 'cacheSize'>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface CacheEntry {
  signature: CompositeSignature;
  createdAt: number;
}

function messageToKey(message: Uint8Array): string {
  // Use a fast base64 fingerprint as cache key. For large messages
  // we hash the first 256 + last 256 bytes plus the length to avoid
  // storing giant keys while still minimising collisions.
  if (message.length <= 512) {
    return Buffer.from(message).toString('base64');
  }
  const head = message.slice(0, 256);
  const tail = message.slice(message.length - 256);
  const combined = new Uint8Array(head.length + tail.length + 4);
  combined.set(head, 0);
  combined.set(tail, head.length);
  // Embed length as 4 big-endian bytes
  const view = new DataView(combined.buffer, combined.byteOffset + head.length + tail.length, 4);
  view.setUint32(0, message.length, false);
  return Buffer.from(combined).toString('base64');
}

// ---------------------------------------------------------------------------
// HybridSigner
// ---------------------------------------------------------------------------

export class HybridSigner {
  private provider: HybridCryptoProvider;
  private keyPair: HybridKeyPair | null = null;

  // -- Key rotation state --
  private retiredKeyPairs: Array<{ keyPair: HybridKeyPair; retiredAt: number; expiresAt: number }> = [];
  private readonly gracePeriodMs: number;

  // -- Signature cache --
  private readonly signatureCache: Map<string, CacheEntry> = new Map();
  private readonly cacheTTLMs: number;

  // -- Metrics --
  private _signCount = 0;
  private _verifyCount = 0;
  private _cacheHits = 0;
  private _cacheMisses = 0;
  private _keyRotationCount = 0;
  private _lastSignAt: string | null = null;
  private _lastVerifyAt: string | null = null;

  // -- Options (for serialisation) --
  private readonly _enablePQ: boolean;

  constructor(options: HybridSignerOptions = {}) {
    this._enablePQ = options.enablePQ !== false;
    this.cacheTTLMs = options.cacheTTLMs ?? 300_000;
    this.gracePeriodMs = options.keyRotationGracePeriodMs ?? 600_000;

    const classical = new Ed25519CryptoProvider();
    const pq = this._enablePQ ? new MLDSACryptoProvider() : undefined;
    this.provider = new HybridCryptoProvider(classical, pq);
  }

  // =========================================================================
  // Key management
  // =========================================================================

  /**
   * Generate a new hybrid key pair.
   *
   * If a key pair already exists, it is retired (moved to the retired list
   * with a grace period during which its signatures can still be verified).
   */
  async generateKeys(kid?: string): Promise<HybridKeyPair> {
    if (this.keyPair) {
      // Retire the current key pair
      const now = Date.now();
      this.retiredKeyPairs.push({
        keyPair: this.keyPair,
        retiredAt: now,
        expiresAt: now + this.gracePeriodMs,
      });
      this._keyRotationCount++;

      // Purge expired retired keys
      this.purgeExpiredKeys();
    }

    // Clear signature cache on key rotation — signatures from old key are
    // still verifiable via retired list but we don't want to serve them for
    // new sign() calls.
    this.signatureCache.clear();

    this.keyPair = await this.provider.generateHybridKeyPair(kid);
    return this.keyPair;
  }

  /**
   * Explicitly rotate the key pair, returning the new key pair.
   *
   * Equivalent to calling generateKeys() when a key pair already exists,
   * but throws if no initial key pair has been created.
   */
  async rotateKeys(kid?: string): Promise<HybridKeyPair> {
    if (!this.keyPair) {
      throw new Error('Cannot rotate keys: no existing key pair. Call generateKeys() first.');
    }
    return this.generateKeys(kid);
  }

  /** Remove expired retired key pairs. */
  private purgeExpiredKeys(): void {
    const now = Date.now();
    this.retiredKeyPairs = this.retiredKeyPairs.filter(rk => rk.expiresAt > now);
  }

  /** Get the list of retired key pairs still within their grace period. */
  getRetiredKeyPairs(): ReadonlyArray<{ keyPair: HybridKeyPair; retiredAt: number; expiresAt: number }> {
    this.purgeExpiredKeys();
    return this.retiredKeyPairs;
  }

  // =========================================================================
  // Signing
  // =========================================================================

  /**
   * Sign a single message, using the cache when available.
   */
  async sign(message: string | Uint8Array): Promise<CompositeSignature> {
    if (!this.keyPair) throw new Error('Call generateKeys() first');
    const bytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;

    // Check cache
    const cacheKey = messageToKey(bytes);
    const cached = this.getCachedSignature(cacheKey);
    if (cached) {
      this._cacheHits++;
      this._signCount++;
      this._lastSignAt = new Date().toISOString();
      return cached;
    }

    this._cacheMisses++;
    const sig = await this.provider.signComposite(bytes, this.keyPair);

    // Store in cache
    this.signatureCache.set(cacheKey, { signature: sig, createdAt: Date.now() });
    this._signCount++;
    this._lastSignAt = new Date().toISOString();
    return sig;
  }

  /**
   * Sign multiple messages efficiently in a single batch.
   *
   * All messages are signed with the current key pair. The method returns
   * results for each message (including per-item errors without aborting
   * the entire batch).
   */
  async signBatch(messages: Array<string | Uint8Array>): Promise<BatchSignResult[]> {
    if (!this.keyPair) throw new Error('Call generateKeys() first');

    const results: BatchSignResult[] = [];

    for (let i = 0; i < messages.length; i++) {
      try {
        const sig = await this.sign(messages[i]);
        results.push({ index: i, signature: sig });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        results.push({ index: i, signature: null, error: errorMessage });
      }
    }

    return results;
  }

  // =========================================================================
  // Verification
  // =========================================================================

  /**
   * Verify a signature against a message.
   *
   * If keyPair is not provided, the signer checks the current key pair
   * first, then falls back to retired key pairs still within their grace
   * period. This enables seamless key rotation: signatures made with the
   * previous key continue to verify during the grace window.
   */
  async verify(
    message: string | Uint8Array,
    signature: CompositeSignature,
    keyPair?: HybridKeyPair,
  ): Promise<CompositeVerificationResult> {
    this._verifyCount++;
    this._lastVerifyAt = new Date().toISOString();
    const bytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;

    // If an explicit key pair is provided, just use that.
    if (keyPair) {
      return this.provider.verifyComposite(bytes, signature, keyPair);
    }

    // Try current key pair
    if (this.keyPair) {
      const result = await this.provider.verifyComposite(bytes, signature, this.keyPair);
      if (result.valid) return result;
    }

    // Try retired key pairs (grace period)
    this.purgeExpiredKeys();
    for (const retired of this.retiredKeyPairs) {
      const result = await this.provider.verifyComposite(bytes, signature, retired.keyPair);
      if (result.valid) return result;
    }

    // Nothing verified
    return {
      valid: false,
      classicalValid: false,
      pqValid: null,
      algorithm: signature.algorithm,
      error: 'Signature did not verify against current or any retired key pair',
    };
  }

  // =========================================================================
  // Cache management
  // =========================================================================

  /** Retrieve a cached signature if it exists and has not expired. */
  private getCachedSignature(cacheKey: string): CompositeSignature | null {
    const entry = this.signatureCache.get(cacheKey);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > this.cacheTTLMs) {
      this.signatureCache.delete(cacheKey);
      return null;
    }
    return entry.signature;
  }

  /** Evict all entries from the signature cache. */
  clearCache(): void {
    this.signatureCache.clear();
  }

  /** Evict only expired entries from the signature cache. */
  pruneCache(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.signatureCache) {
      if (now - entry.createdAt > this.cacheTTLMs) {
        this.signatureCache.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  // =========================================================================
  // Metrics
  // =========================================================================

  /** Return a snapshot of current metrics. */
  getMetrics(): SignerMetrics {
    const totalLookups = this._cacheHits + this._cacheMisses;
    return {
      signCount: this._signCount,
      verifyCount: this._verifyCount,
      cacheHits: this._cacheHits,
      cacheMisses: this._cacheMisses,
      cacheHitRate: totalLookups > 0 ? this._cacheHits / totalLookups : 0,
      keyRotationCount: this._keyRotationCount,
      cacheSize: this.signatureCache.size,
      lastSignAt: this._lastSignAt,
      lastVerifyAt: this._lastVerifyAt,
    };
  }

  /** Reset all metrics counters to zero. */
  resetMetrics(): void {
    this._signCount = 0;
    this._verifyCount = 0;
    this._cacheHits = 0;
    this._cacheMisses = 0;
    this._keyRotationCount = 0;
    this._lastSignAt = null;
    this._lastVerifyAt = null;
  }

  // =========================================================================
  // Serialization
  // =========================================================================

  /**
   * Serialize the signer state for persistence.
   *
   * The signature cache is NOT serialized (it is ephemeral). The provider
   * instance is not serializable either — it will be reconstructed on
   * fromJSON().
   */
  toJSON(): SerializedHybridSigner {
    return {
      version: 2,
      enablePQ: this._enablePQ,
      cacheTTLMs: this.cacheTTLMs,
      keyRotationGracePeriodMs: this.gracePeriodMs,
      currentKeyPair: this.keyPair,
      retiredKeyPairs: this.retiredKeyPairs.map(rk => ({
        keyPair: rk.keyPair,
        retiredAt: new Date(rk.retiredAt).toISOString(),
        expiresAt: new Date(rk.expiresAt).toISOString(),
      })),
      metrics: {
        signCount: this._signCount,
        verifyCount: this._verifyCount,
        cacheHits: this._cacheHits,
        cacheMisses: this._cacheMisses,
        keyRotationCount: this._keyRotationCount,
        lastSignAt: this._lastSignAt,
        lastVerifyAt: this._lastVerifyAt,
      },
    };
  }

  /**
   * Restore a HybridSigner from its serialized form.
   *
   * Reconstructs the provider (Ed25519 + optional ML-DSA) and restores
   * key pairs, retired keys (still within grace period), and metrics.
   */
  static fromJSON(data: SerializedHybridSigner): HybridSigner {
    const signer = new HybridSigner({
      enablePQ: data.enablePQ,
      cacheTTLMs: data.cacheTTLMs,
      keyRotationGracePeriodMs: data.keyRotationGracePeriodMs,
    });

    signer.keyPair = data.currentKeyPair;

    // Restore retired key pairs, filtering out any that have already expired
    const now = Date.now();
    signer.retiredKeyPairs = data.retiredKeyPairs
      .map(rk => ({
        keyPair: rk.keyPair,
        retiredAt: new Date(rk.retiredAt).getTime(),
        expiresAt: new Date(rk.expiresAt).getTime(),
      }))
      .filter(rk => rk.expiresAt > now);

    // Restore metrics
    if (data.metrics) {
      signer._signCount = data.metrics.signCount ?? 0;
      signer._verifyCount = data.metrics.verifyCount ?? 0;
      signer._cacheHits = data.metrics.cacheHits ?? 0;
      signer._cacheMisses = data.metrics.cacheMisses ?? 0;
      signer._keyRotationCount = data.metrics.keyRotationCount ?? 0;
      signer._lastSignAt = data.metrics.lastSignAt ?? null;
      signer._lastVerifyAt = data.metrics.lastVerifyAt ?? null;
    }

    return signer;
  }

  // =========================================================================
  // Accessors (preserved from v1)
  // =========================================================================

  getKeyPair(): HybridKeyPair | null { return this.keyPair; }
  hasPQ(): boolean { return this.provider.hasPQProvider(); }
  static async isPQAvailable(): Promise<boolean> { return isPostQuantumAvailable(); }
}
