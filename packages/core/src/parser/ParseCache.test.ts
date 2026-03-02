/**
 * ParseCache — Comprehensive Unit Tests
 *
 * Covers:
 * - Constructor / initialization with custom and default maxEntries
 * - Static hash method (determinism, uniqueness, empty input)
 * - get/set contract (hit, miss, hash mismatch, overwrite)
 * - LRU eviction when capacity exceeded
 * - clear() empties the cache
 * - getStats() returns correct size, evictions, maxEntries
 * - Clock-based LRU ordering (recently-used entries survive eviction)
 * - Edge cases: empty strings, large entries, rapid set/get cycles
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ParseCache, globalParseCache } from './ParseCache';
import type { CachedNode, ParseCacheStats } from './ParseCache';

// =============================================================================
// Helpers
// =============================================================================

function mockNode(type: string): any {
  return { type, children: [], properties: {}, directives: [], traits: new Map() };
}

// =============================================================================
// Constructor / Initialization
// =============================================================================

describe('ParseCache - Constructor', () => {
  it('creates a cache with default maxEntries (500)', () => {
    const cache = new ParseCache();
    const stats = cache.getStats();
    expect(stats.maxEntries).toBe(500);
    expect(stats.size).toBe(0);
    expect(stats.evictions).toBe(0);
  });

  it('creates a cache with custom maxEntries', () => {
    const cache = new ParseCache(10);
    const stats = cache.getStats();
    expect(stats.maxEntries).toBe(10);
  });

  it('creates a cache with maxEntries of 1', () => {
    const cache = new ParseCache(1);
    const stats = cache.getStats();
    expect(stats.maxEntries).toBe(1);
  });
});

// =============================================================================
// Static hash
// =============================================================================

describe('ParseCache.hash', () => {
  it('produces a hex string', () => {
    const h = ParseCache.hash('hello world');
    expect(typeof h).toBe('string');
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it('returns a 64-character SHA-256 hex digest', () => {
    const h = ParseCache.hash('test');
    expect(h.length).toBe(64);
  });

  it('is deterministic (same input produces same hash)', () => {
    expect(ParseCache.hash('deterministic')).toBe(ParseCache.hash('deterministic'));
  });

  it('returns different hashes for different inputs', () => {
    expect(ParseCache.hash('alpha')).not.toBe(ParseCache.hash('beta'));
  });

  it('handles empty string', () => {
    const h = ParseCache.hash('');
    expect(typeof h).toBe('string');
    expect(h.length).toBe(64);
  });

  it('handles unicode content', () => {
    const h = ParseCache.hash('orb "CubeEmoji" {\n  emoji: "\u{1F4A1}"\n}');
    expect(typeof h).toBe('string');
    expect(h.length).toBe(64);
  });

  it('handles very long strings', () => {
    const longStr = 'a'.repeat(100_000);
    const h = ParseCache.hash(longStr);
    expect(h.length).toBe(64);
  });

  it('is sensitive to whitespace differences', () => {
    expect(ParseCache.hash('a b')).not.toBe(ParseCache.hash('a  b'));
  });
});

// =============================================================================
// get / set
// =============================================================================

describe('ParseCache - get/set', () => {
  let cache: ParseCache;

  beforeEach(() => {
    cache = new ParseCache();
  });

  it('returns null for an unknown id', () => {
    expect(cache.get('nonexistent', 'hash1')).toBeNull();
  });

  it('returns null when hash does not match', () => {
    cache.set('chunk1', 'hashA', mockNode('Orb'));
    expect(cache.get('chunk1', 'hashB')).toBeNull();
  });

  it('returns the node when id and hash both match', () => {
    const node = mockNode('Template');
    cache.set('chunk1', 'hashA', node);
    const result = cache.get('chunk1', 'hashA');
    expect(result).toBe(node);
  });

  it('overwrites an existing entry with the same id', () => {
    const nodeA = mockNode('A');
    const nodeB = mockNode('B');
    cache.set('chunk1', 'h1', nodeA);
    cache.set('chunk1', 'h2', nodeB);

    expect(cache.get('chunk1', 'h1')).toBeNull();
    expect(cache.get('chunk1', 'h2')).toBe(nodeB);
  });

  it('stores multiple entries with different ids', () => {
    const node1 = mockNode('Orb1');
    const node2 = mockNode('Orb2');
    const node3 = mockNode('Orb3');

    cache.set('a', 'ha', node1);
    cache.set('b', 'hb', node2);
    cache.set('c', 'hc', node3);

    expect(cache.get('a', 'ha')).toBe(node1);
    expect(cache.get('b', 'hb')).toBe(node2);
    expect(cache.get('c', 'hc')).toBe(node3);
  });

  it('updates lastUsed on get (LRU touch)', () => {
    const node1 = mockNode('Old');
    const node2 = mockNode('New');
    const cache = new ParseCache(2);

    cache.set('a', 'ha', node1);
    cache.set('b', 'hb', node2);

    // Touch 'a' so it becomes more recently used than 'b'
    cache.get('a', 'ha');

    // Adding 'c' should evict 'b' (the oldest), not 'a' (recently touched)
    cache.set('c', 'hc', mockNode('C'));

    expect(cache.get('a', 'ha')).toBe(node1); // survived because recently accessed
    expect(cache.get('b', 'hb')).toBeNull(); // evicted
    expect(cache.get('c', 'hc')).toBeDefined();
  });
});

// =============================================================================
// clear
// =============================================================================

describe('ParseCache - clear', () => {
  it('removes all entries', () => {
    const cache = new ParseCache();
    cache.set('x', 'hx', mockNode('X'));
    cache.set('y', 'hy', mockNode('Y'));
    cache.clear();

    expect(cache.get('x', 'hx')).toBeNull();
    expect(cache.get('y', 'hy')).toBeNull();
    expect(cache.getStats().size).toBe(0);
  });

  it('is safe to call on an already-empty cache', () => {
    const cache = new ParseCache();
    expect(() => cache.clear()).not.toThrow();
    expect(cache.getStats().size).toBe(0);
  });

  it('allows new entries after clear', () => {
    const cache = new ParseCache();
    cache.set('a', 'ha', mockNode('A'));
    cache.clear();
    cache.set('b', 'hb', mockNode('B'));

    expect(cache.get('b', 'hb')).toBeDefined();
    expect(cache.getStats().size).toBe(1);
  });
});

// =============================================================================
// getStats
// =============================================================================

describe('ParseCache - getStats', () => {
  it('returns correct initial stats', () => {
    const cache = new ParseCache(100);
    const stats = cache.getStats();
    expect(stats).toEqual({ size: 0, evictions: 0, maxEntries: 100 });
  });

  it('tracks size correctly after insertions', () => {
    const cache = new ParseCache();
    cache.set('a', 'h1', mockNode('A'));
    cache.set('b', 'h2', mockNode('B'));
    expect(cache.getStats().size).toBe(2);
  });

  it('tracks evictions correctly', () => {
    const cache = new ParseCache(2);
    cache.set('a', 'h1', mockNode('A'));
    cache.set('b', 'h2', mockNode('B'));
    cache.set('c', 'h3', mockNode('C')); // triggers eviction

    const stats = cache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.evictions).toBe(1);
  });
});

// =============================================================================
// LRU Eviction
// =============================================================================

describe('ParseCache - LRU Eviction', () => {
  it('evicts the least recently used entry when full', () => {
    const cache = new ParseCache(3);

    cache.set('a', 'ha', mockNode('A'));
    cache.set('b', 'hb', mockNode('B'));
    cache.set('c', 'hc', mockNode('C'));

    // Cache is full (3/3). Adding 'd' should evict 'a' (oldest).
    cache.set('d', 'hd', mockNode('D'));

    expect(cache.get('a', 'ha')).toBeNull(); // evicted
    expect(cache.get('b', 'hb')).toBeDefined();
    expect(cache.get('c', 'hc')).toBeDefined();
    expect(cache.get('d', 'hd')).toBeDefined();
  });

  it('respects access order for eviction', () => {
    const cache = new ParseCache(3);

    cache.set('a', 'ha', mockNode('A'));
    cache.set('b', 'hb', mockNode('B'));
    cache.set('c', 'hc', mockNode('C'));

    // Access 'a' to make it recently used
    cache.get('a', 'ha');

    // Now 'b' is least recently used
    cache.set('d', 'hd', mockNode('D'));

    expect(cache.get('a', 'ha')).toBeDefined(); // recently accessed
    expect(cache.get('b', 'hb')).toBeNull(); // evicted (LRU)
    expect(cache.get('c', 'hc')).toBeDefined();
    expect(cache.get('d', 'hd')).toBeDefined();
  });

  it('handles rapid eviction cycles', () => {
    const cache = new ParseCache(2);

    for (let i = 0; i < 100; i++) {
      cache.set(`id-${i}`, `hash-${i}`, mockNode(`Node${i}`));
    }

    const stats = cache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.evictions).toBe(98); // 100 inserts - 2 capacity = 98 evictions
  });

  it('eviction count increments correctly with capacity 1', () => {
    const cache = new ParseCache(1);

    cache.set('a', 'ha', mockNode('A'));
    cache.set('b', 'hb', mockNode('B')); // evicts a
    cache.set('c', 'hc', mockNode('C')); // evicts b

    expect(cache.getStats().evictions).toBe(2);
    expect(cache.getStats().size).toBe(1);
    expect(cache.get('c', 'hc')).toBeDefined();
    expect(cache.get('a', 'ha')).toBeNull();
    expect(cache.get('b', 'hb')).toBeNull();
  });

  it('set with same id may trigger eviction due to Map size check before overwrite', () => {
    // ParseCache checks cache.size >= maxEntries BEFORE calling cache.set(),
    // so overwriting an existing key when at capacity triggers eviction
    // because Map.size hasn't decreased yet.
    const cache = new ParseCache(2);

    cache.set('a', 'h1', mockNode('A1'));
    cache.set('b', 'h2', mockNode('B'));
    // At capacity (2/2). Setting 'a' again checks size (2 >= 2) -> evicts oldest -> then sets.
    cache.set('a', 'h3', mockNode('A2'));

    expect(cache.getStats().size).toBe(2);
    // One eviction occurred because the size check fires before the overwrite
    expect(cache.getStats().evictions).toBe(1);
  });
});

// =============================================================================
// globalParseCache singleton
// =============================================================================

describe('globalParseCache', () => {
  it('is an instance of ParseCache', () => {
    expect(globalParseCache).toBeInstanceOf(ParseCache);
  });

  it('has default capacity of 500', () => {
    expect(globalParseCache.getStats().maxEntries).toBe(500);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('ParseCache - Edge Cases', () => {
  it('handles ids with special characters', () => {
    const cache = new ParseCache();
    cache.set('orb:MyCube#123', 'h1', mockNode('Special'));
    expect(cache.get('orb:MyCube#123', 'h1')).toBeDefined();
  });

  it('handles empty string as id', () => {
    const cache = new ParseCache();
    cache.set('', 'h1', mockNode('Empty'));
    expect(cache.get('', 'h1')).toBeDefined();
  });

  it('handles empty string as hash', () => {
    const cache = new ParseCache();
    cache.set('id', '', mockNode('EmptyHash'));
    expect(cache.get('id', '')).toBeDefined();
  });

  it('does not confuse entries with similar ids', () => {
    const cache = new ParseCache();
    cache.set('orb:A', 'h1', mockNode('A'));
    cache.set('orb:AB', 'h1', mockNode('AB'));

    expect(cache.get('orb:A', 'h1')?.type).toBe('A');
    expect(cache.get('orb:AB', 'h1')?.type).toBe('AB');
  });
});
