import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResourceCache } from '../assets/ResourceCache';

describe('ResourceCache', () => {
  let cache: ResourceCache<string>;

  beforeEach(() => {
    cache = new ResourceCache<string>(1000);
  });

  it('put and get item', () => {
    cache.put('a', 'hello', 100);
    expect(cache.get('a')).toBe('hello');
  });

  it('has returns true for stored key', () => {
    cache.put('a', 'val', 50);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('evicts LRU when over capacity', () => {
    cache.put('a', 'A', 500);
    cache.put('b', 'B', 400);
    // Total 900. Add 200 → 1100 > 1000 → evict LRU (a)
    cache.put('c', 'C', 200);
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
  });

  it('does not evict referenced items', () => {
    cache.put('a', 'A', 600);
    cache.addRef('a');
    cache.put('b', 'B', 500);
    // Needs eviction but 'a' is referenced → can't evict
    expect(cache.has('a')).toBe(true);
  });

  it('release decrements refCount', () => {
    cache.put('a', 'A', 100);
    cache.addRef('a');
    cache.addRef('a');
    expect(cache.getRefCount('a')).toBe(2);
    cache.release('a');
    expect(cache.getRefCount('a')).toBe(1);
  });

  it('remove deletes entry and frees bytes', () => {
    cache.put('a', 'A', 100);
    expect(cache.getCurrentBytes()).toBe(100);
    cache.remove('a');
    expect(cache.getCurrentBytes()).toBe(0);
    expect(cache.has('a')).toBe(false);
  });

  it('TTL expires entries on get', () => {
    vi.useFakeTimers();
    cache.put('a', 'A', 100, 500); // 500ms TTL
    vi.advanceTimersByTime(600);
    expect(cache.get('a')).toBeUndefined();
    vi.useRealTimers();
  });

  it('purgeExpired removes expired entries', () => {
    vi.useFakeTimers();
    cache.put('a', 'A', 100, 200);
    cache.put('b', 'B', 100, 0); // no TTL
    vi.advanceTimersByTime(300);
    const purged = cache.purgeExpired();
    expect(purged).toBe(1);
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    vi.useRealTimers();
  });

  it('clear removes all entries', () => {
    cache.put('a', 'A', 100);
    cache.put('b', 'B', 200);
    cache.clear();
    expect(cache.getEntryCount()).toBe(0);
    expect(cache.getCurrentBytes()).toBe(0);
  });

  it('getUsageRatio returns fraction', () => {
    cache.put('a', 'A', 250);
    expect(cache.getUsageRatio()).toBeCloseTo(0.25);
  });

  it('replacing existing key updates bytes', () => {
    cache.put('a', 'A', 100);
    cache.put('a', 'AA', 200);
    expect(cache.getCurrentBytes()).toBe(200);
    expect(cache.get('a')).toBe('AA');
  });
});
