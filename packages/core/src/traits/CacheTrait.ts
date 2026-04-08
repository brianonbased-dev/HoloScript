/**
 * CacheTrait — v5.1
 *
 * In-memory cache with TTL, LRU eviction, and invalidation patterns.
 *
 * Events:
 *  cache:set       { key, value, ttl }
 *  cache:get       { key }
 *  cache:result    { key, value, hit }
 *  cache:evict     { key, reason }
 *  cache:clear     (command)
 *  cache:stats     { hits, misses, size, evictions }
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface CacheConfig {
  max_size: number;
  default_ttl_ms: number;
  eviction_policy: 'lru' | 'fifo';
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
  accessedAt: number;
  createdAt: number;
}

export interface CacheState {
  entries: Map<string, CacheEntry>;
  hits: number;
  misses: number;
  evictions: number;
}

export const cacheHandler: TraitHandler<CacheConfig> = {
  name: 'cache',

  defaultConfig: {
    max_size: 1000,
    default_ttl_ms: 60000,
    eviction_policy: 'lru',
  },

  onAttach(node: HSPlusNode, _config: CacheConfig, _context: TraitContext): void {
    node.__cacheState = {
      entries: new Map(),
      hits: 0,
      misses: 0,
      evictions: 0,
    } as CacheState;
  },

  onDetach(node: HSPlusNode): void {
    delete node.__cacheState;
  },

  onUpdate(node: HSPlusNode, config: CacheConfig, _context: TraitContext, _delta: number): void {
    // @ts-expect-error
    const state: CacheState | undefined = node.__cacheState;
    if (!state) return;
    // Expire entries
    const now = Date.now();
    for (const [key, entry] of state.entries) {
      if (entry.expiresAt > 0 && now >= entry.expiresAt) {
        state.entries.delete(key);
        state.evictions++;
      }
    }
  },

  onEvent(node: HSPlusNode, config: CacheConfig, context: TraitContext, event: TraitEvent): void {
    // @ts-expect-error
    const state: CacheState | undefined = node.__cacheState;
    if (!state) return;
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'cache:set': {
        const key = event.key as string;
        if (!key) break;
        const ttl = (event.ttl as number) ?? config.default_ttl_ms;
        // Evict if at capacity
        if (state.entries.size >= config.max_size && !state.entries.has(key)) {
          evictOne(state, config, context);
        }
        const now = Date.now();
        state.entries.set(key, {
          value: event.value,
          expiresAt: ttl > 0 ? now + ttl : 0,
          accessedAt: now,
          createdAt: now,
        });
        break;
      }
      case 'cache:get': {
        const key = event.key as string;
        if (!key) break;
        const entry = state.entries.get(key);
        if (entry && (entry.expiresAt === 0 || Date.now() < entry.expiresAt)) {
          state.hits++;
          entry.accessedAt = Date.now();
          context.emit?.('cache:result', { key, value: entry.value, hit: true });
        } else {
          state.misses++;
          if (entry) state.entries.delete(key);
          context.emit?.('cache:result', { key, value: undefined, hit: false });
        }
        break;
      }
      case 'cache:invalidate': {
        const key = event.key as string;
        if (key) state.entries.delete(key);
        break;
      }
      case 'cache:clear': {
        state.entries.clear();
        break;
      }
      case 'cache:get_stats': {
        context.emit?.('cache:stats', {
          hits: state.hits,
          misses: state.misses,
          size: state.entries.size,
          evictions: state.evictions,
          hitRate: state.hits + state.misses > 0 ? state.hits / (state.hits + state.misses) : 0,
        });
        break;
      }
    }
  },
};

function evictOne(state: CacheState, config: CacheConfig, context: TraitContext): void {
  if (state.entries.size === 0) return;

  let oldest: { key: string; time: number } | null = null;
  for (const [key, entry] of state.entries) {
    const time = config.eviction_policy === 'lru' ? entry.accessedAt : entry.createdAt;
    if (!oldest || time < oldest.time) {
      oldest = { key, time };
    }
  }
  if (oldest) {
    state.entries.delete(oldest.key);
    state.evictions++;
    context.emit?.('cache:evict', { key: oldest.key, reason: config.eviction_policy });
  }
}

export default cacheHandler;
