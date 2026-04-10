/**
 * Dedup Filter
 *
 * Dual-layer deduplication for the absorb pipeline:
 * - Layer 1: SHA-256 exact match (catches 38% of known duplicates)
 * - Layer 2: MinHash LSH semantic near-duplicate detection (catches template-based duplication)
 * - Layer 3: Quality-weighted retention (keep highest quality version)
 *
 * Gap 4: Absorb pipeline dedup.
 *
 * @version 1.0.0
 */

import { createHash } from 'crypto';

/**
 * An item that can be deduplicated
 */
export interface Dedupable {
  id: string;
  content: string;
  quality?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Report of deduplication results
 */
export interface DedupReport {
  totalInput: number;
  exactDuplicates: number;
  semanticDuplicates: number;
  retained: number;
  removedDetails: DedupRemoval[];
  processingTimeMs: number;
}

/**
 * Details about a removed duplicate
 */
export interface DedupRemoval {
  removedId: string;
  keptId: string;
  reason: 'exact' | 'semantic';
  similarity?: number;
}

/**
 * Configuration for the dedup filter
 */
export interface DedupConfig {
  /** Semantic similarity threshold (default: 0.92) */
  semanticThreshold: number;
  /** Number of hash functions for MinHash (default: 128) */
  numHashFunctions: number;
  /** Number of bands for LSH (default: 16) */
  numBands: number;
  /** N-gram size for shingling (default: 3) */
  shingleSize: number;
  /** Enable quality-weighted retention (default: true) */
  qualityWeighted: boolean;
}

const DEFAULT_CONFIG: DedupConfig = {
  semanticThreshold: 0.92,
  numHashFunctions: 128,
  numBands: 16,
  shingleSize: 3,
  qualityWeighted: true,
};

/**
 * DedupFilter - Dual-layer deduplication engine
 */
export class DedupFilter {
  private config: DedupConfig;

  constructor(config?: Partial<DedupConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run full dedup pipeline on a set of items
   */
  dedup(items: Dedupable[]): { retained: Dedupable[]; report: DedupReport } {
    const startTime = Date.now();
    const removals: DedupRemoval[] = [];

    // Layer 1: Exact dedup via SHA-256
    const { unique: exactUnique, removals: exactRemovals } = this.exactDedup(items);
    removals.push(...exactRemovals);

    // Layer 2: Semantic near-dedup via MinHash LSH
    const { unique: semanticUnique, removals: semanticRemovals } = this.semanticDedup(exactUnique);
    removals.push(...semanticRemovals);

    const report: DedupReport = {
      totalInput: items.length,
      exactDuplicates: exactRemovals.length,
      semanticDuplicates: semanticRemovals.length,
      retained: semanticUnique.length,
      removedDetails: removals,
      processingTimeMs: Date.now() - startTime,
    };

    return { retained: semanticUnique, report };
  }

  /**
   * Layer 1: Exact dedup via SHA-256 hash
   */
  exactDedup(items: Dedupable[]): { unique: Dedupable[]; removals: DedupRemoval[] } {
    const hashMap = new Map<string, Dedupable>();
    const removals: DedupRemoval[] = [];

    for (const item of items) {
      const hash = this.sha256(item.content);
      const existing = hashMap.get(hash);

      if (existing) {
        // Quality-weighted retention: keep higher quality version
        if (this.config.qualityWeighted && (item.quality ?? 0) > (existing.quality ?? 0)) {
          removals.push({ removedId: existing.id, keptId: item.id, reason: 'exact' });
          hashMap.set(hash, item);
        } else {
          removals.push({ removedId: item.id, keptId: existing.id, reason: 'exact' });
        }
      } else {
        hashMap.set(hash, item);
      }
    }

    return { unique: Array.from(hashMap.values()), removals };
  }

  /**
   * Layer 2: Semantic near-dedup via MinHash LSH (Jaccard similarity)
   */
  semanticDedup(items: Dedupable[]): { unique: Dedupable[]; removals: DedupRemoval[] } {
    if (items.length <= 1) return { unique: items, removals: [] };

    const removals: DedupRemoval[] = [];
    const removed = new Set<string>();

    // Generate MinHash signatures for all items
    const signatures = items.map((item) => ({
      item,
      shingles: this.shingle(item.content),
      minhash: this.minhash(this.shingle(item.content)),
    }));

    // LSH: group candidates by band hashing
    const bandSize = Math.floor(this.config.numHashFunctions / this.config.numBands);
    const candidatePairs = new Set<string>();

    for (let band = 0; band < this.config.numBands; band++) {
      const buckets = new Map<string, number[]>();
      const start = band * bandSize;
      const end = start + bandSize;

      for (let i = 0; i < signatures.length; i++) {
        const bandHash = signatures[i].minhash.slice(start, end).join(',');
        const bucket = buckets.get(bandHash) ?? [];
        bucket.push(i);
        buckets.set(bandHash, bucket);
      }

      // Collect candidate pairs from same bucket
      for (const bucket of buckets.values()) {
        for (let i = 0; i < bucket.length; i++) {
          for (let j = i + 1; j < bucket.length; j++) {
            const key = `${Math.min(bucket[i], bucket[j])},${Math.max(bucket[i], bucket[j])}`;
            candidatePairs.add(key);
          }
        }
      }
    }

    // Verify candidates with exact Jaccard similarity
    for (const pair of candidatePairs) {
      const [iStr, jStr] = pair.split(',');
      const i = parseInt(iStr, 10);
      const j = parseInt(jStr, 10);

      if (removed.has(signatures[i].item.id) || removed.has(signatures[j].item.id)) continue;

      const similarity = this.jaccardSimilarity(signatures[i].shingles, signatures[j].shingles);

      if (similarity >= this.config.semanticThreshold) {
        const itemA = signatures[i].item;
        const itemB = signatures[j].item;

        // Quality-weighted: keep higher quality
        if (this.config.qualityWeighted && (itemA.quality ?? 0) >= (itemB.quality ?? 0)) {
          removed.add(itemB.id);
          removals.push({ removedId: itemB.id, keptId: itemA.id, reason: 'semantic', similarity });
        } else {
          removed.add(itemA.id);
          removals.push({ removedId: itemA.id, keptId: itemB.id, reason: 'semantic', similarity });
        }
      }
    }

    const unique = items.filter((item) => !removed.has(item.id));
    return { unique, removals };
  }

  // ---- Private helpers ----

  private sha256(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private shingle(text: string): Set<string> {
    const shingles = new Set<string>();
    const words = text.toLowerCase().split(/\s+/);
    for (let i = 0; i <= words.length - this.config.shingleSize; i++) {
      shingles.add(words.slice(i, i + this.config.shingleSize).join(' '));
    }
    return shingles;
  }

  private minhash(shingles: Set<string>): number[] {
    const signature: number[] = new Array(this.config.numHashFunctions).fill(Infinity);

    for (const shingle of shingles) {
      for (let i = 0; i < this.config.numHashFunctions; i++) {
        const hash = this.hashWithSeed(shingle, i);
        if (hash < signature[i]) {
          signature[i] = hash;
        }
      }
    }

    return signature;
  }

  private hashWithSeed(value: string, seed: number): number {
    // FNV-1a hash with seed
    let hash = 2166136261 ^ seed;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    let intersection = 0;
    for (const item of a) {
      if (b.has(item)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}

/**
 * Create a dedup filter with the given configuration
 */
export function createDedupFilter(config?: Partial<DedupConfig>): DedupFilter {
  return new DedupFilter(config);
}
