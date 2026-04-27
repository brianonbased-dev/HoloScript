import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cacheHandler } from '../CacheTrait';
import type { HSPlusNode, TraitContext, TraitEvent } from '../TraitTypes';

function makeNode(): HSPlusNode {
  return {} as HSPlusNode;
}

function makeContext(): TraitContext & { emitted: Array<{ type: string; payload: unknown }> } {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  return {
    emitted,
    emit: (type: string, payload?: unknown) => emitted.push({ type, payload }),
  } as unknown as TraitContext & { emitted: Array<{ type: string; payload: unknown }> };
}

const defaultConfig = cacheHandler.defaultConfig!;

describe('CacheTrait', () => {
  describe('handler metadata', () => {
    it('has name "cache"', () => {
      expect(cacheHandler.name).toBe('cache');
    });

    it('has expected default config', () => {
      expect(cacheHandler.defaultConfig).toEqual({
        max_size: 1000,
        default_ttl_ms: 60000,
        eviction_policy: 'lru',
      });
    });
  });

  describe('onAttach', () => {
    it('initialises __cacheState with empty map and zero counters', () => {
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      const state = node.__cacheState as { entries: Map<string, unknown>; hits: number; misses: number; evictions: number };
      expect(state.entries).toBeInstanceOf(Map);
      expect(state.entries.size).toBe(0);
      expect(state.hits).toBe(0);
      expect(state.misses).toBe(0);
      expect(state.evictions).toBe(0);
    });
  });

  describe('onDetach', () => {
    it('removes __cacheState from node', () => {
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onDetach!(node, defaultConfig, ctx);
      expect(node.__cacheState).toBeUndefined();
    });
  });

  describe('onUpdate — TTL expiry', () => {
    it('removes expired entries on update', () => {
      vi.useFakeTimers();
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'cache:set',
        key: 'mykey',
        value: 'myvalue',
        ttl: 100,
      });
      vi.advanceTimersByTime(200);
      cacheHandler.onUpdate!(node, defaultConfig, ctx, 0.016);
      const state = node.__cacheState as { entries: Map<string, unknown>; evictions: number };
      expect(state.entries.has('mykey')).toBe(false);
      expect(state.evictions).toBe(1);
      vi.useRealTimers();
    });

    it('does not remove entries before they expire', () => {
      vi.useFakeTimers();
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'cache:set',
        key: 'mykey',
        value: 'myvalue',
        ttl: 5000,
      });
      vi.advanceTimersByTime(100);
      cacheHandler.onUpdate!(node, defaultConfig, ctx, 0.016);
      const state = node.__cacheState as { entries: Map<string, unknown> };
      expect(state.entries.has('mykey')).toBe(true);
      vi.useRealTimers();
    });

    it('does not expire entries with ttl 0 (no expiry)', () => {
      vi.useFakeTimers();
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'cache:set',
        key: 'persistent',
        value: 'data',
        ttl: 0,
      });
      vi.advanceTimersByTime(999999);
      cacheHandler.onUpdate!(node, defaultConfig, ctx, 0.016);
      const state = node.__cacheState as { entries: Map<string, unknown> };
      expect(state.entries.has('persistent')).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('onEvent — cache:set', () => {
    it('stores a value in the cache', () => {
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'cache:set',
        key: 'foo',
        value: 42,
      });
      const state = node.__cacheState as { entries: Map<string, unknown> };
      expect(state.entries.has('foo')).toBe(true);
    });

    it('does nothing when key is missing', () => {
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'cache:set',
        key: '',
        value: 'x',
      });
      const state = node.__cacheState as { entries: Map<string, unknown> };
      expect(state.entries.size).toBe(0);
    });

    it('uses default_ttl_ms when ttl not provided', () => {
      vi.useFakeTimers();
      const node = makeNode();
      const ctx = makeContext();
      const cfg = { ...defaultConfig, default_ttl_ms: 500 };
      cacheHandler.onAttach!(node, cfg, ctx);
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:set', key: 'k', value: 1 });
      vi.advanceTimersByTime(600);
      cacheHandler.onUpdate!(node, cfg, ctx, 0.016);
      const state = node.__cacheState as { entries: Map<string, unknown> };
      expect(state.entries.has('k')).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('onEvent — cache:get', () => {
    it('emits cache:result with hit:true for existing entries', () => {
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:set', key: 'x', value: 99 });
      ctx.emitted.length = 0;
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:get', key: 'x' });
      const res = ctx.emitted.find((e) => e.type === 'cache:result');
      expect(res).toBeDefined();
      const p = res!.payload as Record<string, unknown>;
      expect(p.hit).toBe(true);
      expect(p.value).toBe(99);
      expect(p.key).toBe('x');
    });

    it('emits cache:result with hit:false for missing entries', () => {
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:get', key: 'absent' });
      const res = ctx.emitted.find((e) => e.type === 'cache:result');
      expect(res).toBeDefined();
      const p = res!.payload as Record<string, unknown>;
      expect(p.hit).toBe(false);
      expect(p.value).toBeUndefined();
    });

    it('increments hits counter on cache hit', () => {
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:set', key: 'h', value: 1 });
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:get', key: 'h' });
      const state = node.__cacheState as { hits: number };
      expect(state.hits).toBe(1);
    });

    it('increments misses counter on cache miss', () => {
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:get', key: 'nope' });
      const state = node.__cacheState as { misses: number };
      expect(state.misses).toBe(1);
    });

    it('treats expired entry as a miss', () => {
      vi.useFakeTimers();
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, {
        type: 'cache:set',
        key: 'exp',
        value: 'old',
        ttl: 50,
      });
      vi.advanceTimersByTime(100);
      ctx.emitted.length = 0;
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:get', key: 'exp' });
      const res = ctx.emitted.find((e) => e.type === 'cache:result');
      expect((res!.payload as Record<string, unknown>).hit).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('onEvent — cache:invalidate', () => {
    it('removes a specific key', () => {
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:set', key: 'del', value: 1 });
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:invalidate', key: 'del' });
      const state = node.__cacheState as { entries: Map<string, unknown> };
      expect(state.entries.has('del')).toBe(false);
    });

    it('does nothing for a missing key', () => {
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:set', key: 'a', value: 1 });
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:invalidate', key: 'missing' });
      const state = node.__cacheState as { entries: Map<string, unknown> };
      expect(state.entries.has('a')).toBe(true);
    });
  });

  describe('onEvent — cache:clear', () => {
    it('removes all entries', () => {
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:set', key: 'a', value: 1 });
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:set', key: 'b', value: 2 });
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:clear' });
      const state = node.__cacheState as { entries: Map<string, unknown> };
      expect(state.entries.size).toBe(0);
    });
  });

  describe('onEvent — cache:get_stats', () => {
    it('emits cache:stats with current counters', () => {
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:set', key: 'a', value: 1 });
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:get', key: 'a' }); // hit
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:get', key: 'miss' }); // miss
      ctx.emitted.length = 0;
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:get_stats' });
      const stat = ctx.emitted.find((e) => e.type === 'cache:stats');
      expect(stat).toBeDefined();
      const p = stat!.payload as Record<string, unknown>;
      expect(p.hits).toBe(1);
      expect(p.misses).toBe(1);
      expect(p.size).toBe(1);
      expect(p.hitRate).toBe(0.5);
    });

    it('emits hitRate 0 when no gets have been made', () => {
      const node = makeNode();
      const ctx = makeContext();
      cacheHandler.onAttach!(node, defaultConfig, ctx);
      cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:get_stats' });
      const stat = ctx.emitted.find((e) => e.type === 'cache:stats');
      expect((stat!.payload as Record<string, unknown>).hitRate).toBe(0);
    });
  });

  describe('eviction — LRU', () => {
    it('evicts least recently accessed entry when at max_size', () => {
      const node = makeNode();
      const ctx = makeContext();
      const cfg = { max_size: 2, default_ttl_ms: 60000, eviction_policy: 'lru' as const };
      cacheHandler.onAttach!(node, cfg, ctx);
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:set', key: 'old', value: 1 });
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:set', key: 'new', value: 2 });
      // Access 'new' to make 'old' LRU
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:get', key: 'new' });
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:set', key: 'newest', value: 3 });
      const state = node.__cacheState as { entries: Map<string, unknown> };
      expect(state.entries.has('old')).toBe(false);
      expect(state.entries.has('new')).toBe(true);
      expect(state.entries.has('newest')).toBe(true);
    });

    it('increments evictions counter on eviction', () => {
      const node = makeNode();
      const ctx = makeContext();
      const cfg = { max_size: 1, default_ttl_ms: 60000, eviction_policy: 'lru' as const };
      cacheHandler.onAttach!(node, cfg, ctx);
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:set', key: 'first', value: 1 });
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:set', key: 'second', value: 2 });
      const state = node.__cacheState as { evictions: number };
      expect(state.evictions).toBe(1);
    });

    it('emits cache:evict on LRU eviction', () => {
      const node = makeNode();
      const ctx = makeContext();
      const cfg = { max_size: 1, default_ttl_ms: 60000, eviction_policy: 'lru' as const };
      cacheHandler.onAttach!(node, cfg, ctx);
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:set', key: 'first', value: 1 });
      ctx.emitted.length = 0;
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:set', key: 'second', value: 2 });
      const eviction = ctx.emitted.find((e) => e.type === 'cache:evict');
      expect(eviction).toBeDefined();
      expect((eviction!.payload as Record<string, unknown>).key).toBe('first');
      expect((eviction!.payload as Record<string, unknown>).reason).toBe('lru');
    });
  });

  describe('eviction — FIFO', () => {
    it('evicts oldest created entry when at max_size with fifo policy', () => {
      const node = makeNode();
      const ctx = makeContext();
      const cfg = { max_size: 2, default_ttl_ms: 60000, eviction_policy: 'fifo' as const };
      cacheHandler.onAttach!(node, cfg, ctx);
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:set', key: 'first', value: 1 });
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:set', key: 'second', value: 2 });
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:set', key: 'third', value: 3 });
      const state = node.__cacheState as { entries: Map<string, unknown> };
      expect(state.entries.has('first')).toBe(false);
      expect(state.entries.has('second')).toBe(true);
      expect(state.entries.has('third')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('updating an existing key does not trigger eviction', () => {
      const node = makeNode();
      const ctx = makeContext();
      const cfg = { max_size: 2, default_ttl_ms: 60000, eviction_policy: 'lru' as const };
      cacheHandler.onAttach!(node, cfg, ctx);
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:set', key: 'a', value: 1 });
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:set', key: 'b', value: 2 });
      cacheHandler.onEvent!(node, cfg, ctx, { type: 'cache:set', key: 'a', value: 99 });
      const state = node.__cacheState as { entries: Map<string, unknown>; evictions: number };
      expect(state.entries.size).toBe(2);
      expect(state.evictions).toBe(0);
    });

    it('ignores events when __cacheState is missing', () => {
      const node = makeNode();
      const ctx = makeContext();
      expect(() =>
        cacheHandler.onEvent!(node, defaultConfig, ctx, { type: 'cache:get', key: 'x' })
      ).not.toThrow();
    });
  });
});
