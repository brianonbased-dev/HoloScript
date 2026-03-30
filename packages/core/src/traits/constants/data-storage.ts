/**
 * Data & Storage Traits
 *
 * Trait names for persistence, caching, streaming, state snapshots,
 * migrations, queries, and secondary indexing. Gives HoloScript compositions
 * first-class storage primitives — no more falling back to raw TypeScript
 * for data layer concerns.
 *
 * @version 1.0.0
 */
export const DATA_STORAGE_TRAITS = [
  // ─── Persistence ──────────────────────────────────────────────────
  'database', // Key-value / document store with CRUD lifecycle
  'snapshot', // State snapshot capture and restore
  'migrate', // Schema / data migration runner

  // ─── Caching ──────────────────────────────────────────────────────
  'cache', // In-memory cache with TTL, LRU eviction, invalidation

  // ─── Streaming ────────────────────────────────────────────────────
  'stream', // Event stream pub/sub with backpressure + replay

  // ─── Query ────────────────────────────────────────────────────────
  'query', // Structured query builder (filter, sort, paginate)
  'index', // Secondary index for fast lookups by field
] as const;

export type DataStorageTraitName = (typeof DATA_STORAGE_TRAITS)[number];
