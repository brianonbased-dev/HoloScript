import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResourceCache } from '../ResourceCache';

describe('ResourceCache', () => {
  let cache: ResourceCache<string>;

  beforeEach(() => {
    cache = new ResourceCache<string>(1000); // 1000 byte budget
  });

  // ---- Put / Get ----

  it('put and get stores data', () => {
    cache.put('a', 'hello', 100);
    expect(cache.get('a')).toBe('hello');
  });

  it('has returns true for existing key', () => {
    cache.put('a', 'val', 50);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('tracks byte usage', () => {
    cache.put('a', 'val', 200);
    expect(cache.getCurrentBytes()).toBe(200);
    cache.put('b', 'val', 300);
    expect(cache.getCurrentBytes()).toBe(500);
  });

  // ---- LRU Eviction ----

  it('evicts LRU entry when over budget', () => {
    cache.put('old', 'data1', 600);
    cache.put('new', 'data2', 600); // Over 1000, should evict 'old'
    expect(cache.has('old')).toBe(false);
    expect(cache.has('new')).toBe(true);
  });

  it('does not evict referenced entries', () => {
    cache.put('ref', 'data1', 600);
    cache.addRef('ref');
    cache.put('other', 'data2', 600);
    // 'ref' should survive because it's referenced
    expect(cache.has('ref')).toBe(true);
  });

  // ---- Reference Counting ----

  it('addRef / release tracks count', () => {
    cache.put('a', 'val', 100);
    expect(cache.getRefCount('a')).toBe(0);
    cache.addRef('a');
    expect(cache.getRefCount('a')).toBe(1);
    cache.release('a');
    expect(cache.getRefCount('a')).toBe(0);
  });

  it('release does not go below 0', () => {
    cache.put('a', 'val', 100);
    cache.release('a');
    expect(cache.getRefCount('a')).toBe(0);
  });

  // ---- TTL ----

  it('expired entries return undefined on get', () => {
    vi.useFakeTimers();
    cache.put('ttl', 'val', 100, 500); // 500ms ttl
    vi.advanceTimersByTime(600);
    expect(cache.get('ttl')).toBeUndefined();
    vi.useRealTimers();
  });

  it('purgeExpired removes expired entries', () => {
    vi.useFakeTimers();
    cache.put('e1', 'v1', 100, 200);
    cache.put('e2', 'v2', 100, 2000);
    vi.advanceTimersByTime(300);
    const purged = cache.purgeExpired();
    expect(purged).toBe(1);
    expect(cache.has('e1')).toBe(false);
    expect(cache.has('e2')).toBe(true);
    vi.useRealTimers();
  });

  // ---- Remove / Clear ----

  it('remove deletes entry and frees bytes', () => {
    cache.put('a', 'val', 100);
    cache.remove('a');
    expect(cache.has('a')).toBe(false);
    expect(cache.getCurrentBytes()).toBe(0);
  });

  it('clear resets everything', () => {
    cache.put('a', 'val', 100);
    cache.put('b', 'val', 200);
    cache.clear();
    expect(cache.getEntryCount()).toBe(0);
    expect(cache.getCurrentBytes()).toBe(0);
  });

  // ---- Queries ----

  it('getUsageRatio returns fraction', () => {
    cache.put('a', 'val', 500);
    expect(cache.getUsageRatio()).toBe(0.5);
  });

  it('getMaxBytes returns max', () => {
    expect(cache.getMaxBytes()).toBe(1000);
  });
});
