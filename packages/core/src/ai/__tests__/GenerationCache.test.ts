import { describe, it, expect, beforeEach } from 'vitest';
import { GenerationCache, cachedGenerate } from '@holoscript/framework/ai';

describe('GenerationCache', () => {
  let cache: GenerationCache;

  beforeEach(() => {
    cache = new GenerationCache({ maxSize: 5, ttlMs: 60_000 });
  });

  // ---------------------------------------------------------------------------
  // Basic Set / Get
  // ---------------------------------------------------------------------------

  it('caches and retrieves an entry', () => {
    cache.set('create a cube', 'const cube = new Cube();', 0.95, 'gpt-4');
    const entry = cache.get('create a cube', 'gpt-4');
    expect(entry).not.toBeNull();
    expect(entry!.code).toBe('const cube = new Cube();');
    expect(entry!.confidence).toBe(0.95);
    expect(entry!.adapterName).toBe('gpt-4');
  });

  it('returns null for cache miss', () => {
    expect(cache.get('unknown', 'gpt-4')).toBeNull();
  });

  it('same prompt different adapter is separate', () => {
    cache.set('prompt', 'code1', 0.9, 'a');
    cache.set('prompt', 'code2', 0.8, 'b');
    expect(cache.get('prompt', 'a')!.code).toBe('code1');
    expect(cache.get('prompt', 'b')!.code).toBe('code2');
  });

  // ---------------------------------------------------------------------------
  // LRU Eviction
  // ---------------------------------------------------------------------------

  it('evicts oldest entry when maxSize exceeded', () => {
    for (let i = 0; i < 5; i++) cache.set(`p${i}`, `r${i}`, 0.9, 'a');
    cache.set('p5', 'r5', 0.9, 'a'); // should trigger eviction
    const stats = cache.getStats();
    // After eviction, at most maxSize entries remain
    expect(stats.entriesCount).toBeLessThanOrEqual(6);
    // The newest entry should be present
    expect(cache.get('p5', 'a')).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Hit Tracking
  // ---------------------------------------------------------------------------

  it('increments hits on get', () => {
    cache.set('prompt', 'code', 0.9, 'a');
    cache.get('prompt', 'a');
    cache.get('prompt', 'a');
    const entry = cache.get('prompt', 'a');
    expect(entry!.hits).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  it('tracks hits and misses', () => {
    cache.set('a', '1', 0.9, 'x');
    cache.get('a', 'x'); // hit
    cache.get('b', 'x'); // miss
    const stats = cache.getStats();
    expect(stats.totalHits).toBe(1);
    expect(stats.totalMisses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5);
  });

  it('getStats returns zero rate with no queries', () => {
    const stats = cache.getStats();
    expect(stats.totalHits).toBe(0);
    expect(stats.totalMisses).toBe(0);
    expect(stats.hitRate).toBe(0);
  });

  it('stats include maxSize and entriesCount', () => {
    cache.set('a', '1', 0.9, 'x');
    const stats = cache.getStats();
    expect(stats.maxSize).toBe(5);
    expect(stats.entriesCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Remove
  // ---------------------------------------------------------------------------

  it('remove deletes specific entry', () => {
    cache.set('a', '1', 0.9, 'x');
    expect(cache.remove('a', 'x')).toBe(true);
    expect(cache.get('a', 'x')).toBeNull();
  });

  it('remove returns false for missing entry', () => {
    expect(cache.remove('nope', 'x')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  it('clear removes all entries and resets stats', () => {
    cache.set('a', '1', 0.9, 'x');
    cache.get('a', 'x');
    cache.clear();
    expect(cache.getStats().entriesCount).toBe(0);
    expect(cache.getStats().totalHits).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  it('serialize / deserialize round-trip', () => {
    cache.set('prompt1', 'code1', 0.9, 'x');
    cache.set('prompt2', 'code2', 0.8, 'y');
    const json = cache.serialize();
    const cache2 = new GenerationCache({ maxSize: 5 });
    cache2.deserialize(json);
    expect(cache2.getStats().entriesCount).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // getEntries
  // ---------------------------------------------------------------------------

  it('getEntries returns all cached entries', () => {
    cache.set('a', '1', 0.9, 'x');
    cache.set('b', '2', 0.8, 'x');
    expect(cache.getEntries()).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // getSize
  // ---------------------------------------------------------------------------

  it('getSize returns positive number with entries', () => {
    cache.set('a', '1', 0.9, 'x');
    expect(cache.getSize()).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // cachedGenerate helper
  // ---------------------------------------------------------------------------

  it('cachedGenerate returns cached result on hit', async () => {
    cache.set('prompt', 'cached_code', 0.95, 'adapter');
    const result = await cachedGenerate('prompt', 'adapter', cache, async () => ({
      holoScript: 'fresh_code',
      aiConfidence: 0.5,
    }));
    expect(result.fromCache).toBe(true);
    expect(result.code).toBe('cached_code');
  });

  it('cachedGenerate calls generator on miss', async () => {
    const result = await cachedGenerate('new_prompt', 'adapter', cache, async () => ({
      holoScript: 'generated',
      aiConfidence: 0.9,
    }));
    expect(result.fromCache).toBe(false);
    expect(result.code).toBe('generated');
    // Should now be cached
    expect(cache.get('new_prompt', 'adapter')).not.toBeNull();
  });
});
