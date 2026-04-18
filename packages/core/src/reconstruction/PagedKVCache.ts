/**
 * PagedKVCache — page-based key/value cache for streaming attention.
 *
 * Mirrors the FlashInfer paged-KV approach used by lingbot-map, but targets
 * WebGPU buffers instead of CUDA. Fixed-size pages keep allocation predictable
 * and let the runtime evict oldest pages past `maxSequenceLength`.
 *
 * Scope (Sprint 1): TS interfaces + page-table scaffold. Actual GPU buffer
 * management lands in Sprint 2 alongside the attention shader.
 *
 * @version 0.0.1 (scaffold)
 */

// =============================================================================
// TYPES
// =============================================================================

export interface KVCacheConfig {
  /** Tokens per page (must align with attention block size) */
  pageSize: number;
  /** Max pages resident on GPU — oldest pages evict to CPU when exceeded */
  maxResidentPages: number;
  /** Hidden dim of the attention layer */
  hiddenDim: number;
  /** Number of attention heads */
  numHeads: number;
  /** Number of transformer layers */
  numLayers: number;
}

export interface PageRef {
  /** Page index in the global page table */
  pageId: number;
  /** Layer index this page belongs to */
  layer: number;
  /** Residency: on-device, on-host (CPU), or evicted */
  residency: 'device' | 'host' | 'evicted';
  /** First token index covered by this page */
  firstToken: number;
  /** Last token index covered by this page */
  lastToken: number;
}

export interface PagedKVCache {
  readonly config: KVCacheConfig;

  /** Reserve a new page for the given layer */
  allocatePage(layer: number, firstToken: number): PageRef;

  /** Look up all resident pages for a layer, in token order */
  residentPagesForLayer(layer: number): PageRef[];

  /** Evict oldest pages past the residency cap; return evicted refs */
  evictOldest(count: number): PageRef[];

  /** Total resident memory in bytes (device + host) */
  memoryUsage(): { device: number; host: number };

  /** Release all pages and free GPU buffers */
  dispose(): Promise<void>;
}

// =============================================================================
// FACTORY (stub)
// =============================================================================

export function createPagedKVCache(_config: KVCacheConfig): PagedKVCache {
  throw new Error(
    'PagedKVCache is scaffolded in Sprint 1; implementation lands in Sprint 2. See reconstruction/RFC-HoloMap.md §KV-Cache'
  );
}
