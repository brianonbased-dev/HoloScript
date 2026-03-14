/**
 * GenerationCache (LRU) — Production Test Suite
 *
 * Covers: set/get, key generation, TTL expiry, LRU eviction,
 * statistics, serialization, entries, remove, getSize, clear.
 *
 * Note: GenerationCache uses node's crypto module for hashing,
 * which Vitest supports natively.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenerationCache } from '../GenerationCache';

describe('GenerationCache — Production', () => {
  // Helper function to mock Date.now with offset or counter
  const mockDateNow = (offsetMs: number) => {
    const originalNow = Date.now;
    Date.now = vi.fn(() => originalNow() + offsetMs);
    return () => { Date.now = originalNow; };
  };
  
  const mockDateNowIncrementing = (startOffset: number = 0) => {
    const originalNow = Date.now;
    let counter = startOffset;
    Date.now = vi.fn(() => originalNow() + counter++);
    return () => { Date.now = originalNow; };
  };

  // ─── Basic Get/Set ────────────────────────────────────────────────
  it('set + get returns cached entry', () => {
    const cache = new GenerationCache();
    cache.set('prompt1', 'code1', 0.9, 'openai');
    const entry = cache.get('prompt1', 'openai');
    expect(entry).not.toBeNull();
    expect(entry!.code).toBe('code1');
    expect(entry!.confidence).toBe(0.9);
  });

  it('get returns null on miss', () => {
    const cache = new GenerationCache();
    expect(cache.get('unknown', 'openai')).toBeNull();
  });

  it('different adapters have different keys', () => {
    const cache = new GenerationCache();
    cache.set('prompt', 'code-oai', 0.9, 'openai');
    cache.set('prompt', 'code-cl', 0.8, 'claude');
    expect(cache.get('prompt', 'openai')!.code).toBe('code-oai');
    expect(cache.get('prompt', 'claude')!.code).toBe('code-cl');
  });

  // ─── Hit Tracking ─────────────────────────────────────────────────
  it('get increments hit count', () => {
    const cache = new GenerationCache();
    cache.set('p', 'c', 0.9, 'a');
    cache.get('p', 'a');
    cache.get('p', 'a');
    const entry = cache.get('p', 'a');
    expect(entry!.hits).toBe(3);
  });

  // ─── TTL Expiry ───────────────────────────────────────────────────
  it('expired entries are not returned', () => {
    const cache = new GenerationCache({ ttlMs: 100 });
    cache.set('p', 'c', 0.9, 'a');

    // Fast-forward time
    const restoreDateNow = mockDateNow(200);
    expect(cache.get('p', 'a')).toBeNull();
    restoreDateNow();
  });

  // ─── LRU Eviction ─────────────────────────────────────────────────
  it('evicts oldest when maxSize reached', () => {
    const cache = new GenerationCache({ maxSize: 2 });
    cache.set('first', 'c1', 0.9, 'a');

    // Ensure "second" and "third" are newer with incrementing timestamps
    const restoreDateNow = mockDateNowIncrementing(1);

    cache.set('second', 'c2', 0.9, 'a');
    cache.set('third', 'c3', 0.9, 'a'); // should evict 'first'

    restoreDateNow();

    expect(cache.get('first', 'a')).toBeNull();
    expect(cache.get('third', 'a')).not.toBeNull();
  });

  // ─── Statistics ───────────────────────────────────────────────────
  it('getStats tracks hits and misses', () => {
    const cache = new GenerationCache();
    cache.set('p', 'c', 0.9, 'a');
    cache.get('p', 'a'); // hit
    cache.get('x', 'a'); // miss
    const stats = cache.getStats();
    expect(stats.totalHits).toBe(1);
    expect(stats.totalMisses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5);
    expect(stats.entriesCount).toBe(1);
  });

  // ─── Serialization ───────────────────────────────────────────────
  it('serialize produces valid JSON', () => {
    const cache = new GenerationCache();
    cache.set('p', 'c', 0.9, 'a');
    const json = cache.serialize();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  // ─── Entries / Remove / Size ──────────────────────────────────────
  it('getEntries returns all cached entries', () => {
    const cache = new GenerationCache();
    cache.set('a', 'ca', 0.9, 'openai');
    cache.set('b', 'cb', 0.8, 'openai');
    expect(cache.getEntries().length).toBe(2);
  });

  it('remove deletes specific entry', () => {
    const cache = new GenerationCache();
    cache.set('p', 'c', 0.9, 'a');
    expect(cache.remove('p', 'a')).toBe(true);
    expect(cache.get('p', 'a')).toBeNull();
  });

  it('getSize returns approximate byte size', () => {
    const cache = new GenerationCache();
    cache.set('p', 'c', 0.9, 'a');
    expect(cache.getSize()).toBeGreaterThan(0);
  });

  // ─── Clear ────────────────────────────────────────────────────────
  it('clear empties cache and resets stats', () => {
    const cache = new GenerationCache();
    cache.set('p', 'c', 0.9, 'a');
    cache.get('p', 'a');
    cache.clear();
    expect(cache.getEntries().length).toBe(0);
    expect(cache.getStats().totalHits).toBe(0);
  });
});
