/**
 * ParseCache + BaseDeployer Validation Production Tests
 *
 * Tests LRU cache behavior (hash, get, set, eviction, stats)
 * and deployer configuration validation.
 */

import { describe, it, expect } from 'vitest';
import { ParseCache } from '../../parser/ParseCache';
import type { HSPlusNode } from '../../types/AdvancedTypeSystem';

// ─── ParseCache ──────────────────────────────────────────────────────────

const makeFakeNode = (kind: string): HSPlusNode =>
  ({ kind, children: [] }) as unknown as HSPlusNode;

describe('ParseCache — Production', () => {
  it('hash produces consistent hex string', () => {
    const h1 = ParseCache.hash('hello world');
    const h2 = ParseCache.hash('hello world');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hash differs for different content', () => {
    expect(ParseCache.hash('a')).not.toBe(ParseCache.hash('b'));
  });

  it('get returns null for missing entry', () => {
    const cache = new ParseCache();
    expect(cache.get('missing', 'hash')).toBeNull();
  });

  it('set + get roundtrip', () => {
    const cache = new ParseCache();
    const node = makeFakeNode('composition');
    const hash = ParseCache.hash('source');
    cache.set('chunk1', hash, node);
    expect(cache.get('chunk1', hash)).toBe(node);
  });

  it('get returns null when hash mismatches', () => {
    const cache = new ParseCache();
    const node = makeFakeNode('composition');
    cache.set('chunk1', 'hash-a', node);
    expect(cache.get('chunk1', 'hash-b')).toBeNull();
  });

  it('evicts oldest when full', () => {
    const cache = new ParseCache(3);
    cache.set('a', 'h1', makeFakeNode('a'));
    cache.set('b', 'h2', makeFakeNode('b'));
    cache.set('c', 'h3', makeFakeNode('c'));
    // This should evict 'a'
    cache.set('d', 'h4', makeFakeNode('d'));
    expect(cache.get('a', 'h1')).toBeNull();
    expect(cache.get('d', 'h4')).not.toBeNull();
  });

  it('getStats reports size and evictions', () => {
    const cache = new ParseCache(2);
    cache.set('a', 'h1', makeFakeNode('a'));
    cache.set('b', 'h2', makeFakeNode('b'));
    cache.set('c', 'h3', makeFakeNode('c'));
    const stats = cache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.evictions).toBe(1);
    expect(stats.maxEntries).toBe(2);
  });

  it('clear empties cache', () => {
    const cache = new ParseCache();
    cache.set('a', 'h1', makeFakeNode('a'));
    cache.clear();
    expect(cache.getStats().size).toBe(0);
    expect(cache.get('a', 'h1')).toBeNull();
  });

  it('LRU: recently accessed items survive eviction', () => {
    const cache = new ParseCache(3);
    cache.set('a', 'h1', makeFakeNode('a'));
    cache.set('b', 'h2', makeFakeNode('b'));
    cache.set('c', 'h3', makeFakeNode('c'));
    // Access 'a' to make it most recent
    cache.get('a', 'h1');
    // Insert 'd' — should evict 'b' (oldest unused)
    cache.set('d', 'h4', makeFakeNode('d'));
    expect(cache.get('a', 'h1')).not.toBeNull();
    expect(cache.get('b', 'h2')).toBeNull();
  });
});
