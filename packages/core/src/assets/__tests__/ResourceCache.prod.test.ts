/**
 * ResourceCache — Production Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ResourceCache } from '../ResourceCache';

describe('ResourceCache — construction', () => {
  it('starts empty', () => {
    const c = new ResourceCache(1000);
    expect(c.getEntryCount()).toBe(0);
    expect(c.getCurrentBytes()).toBe(0);
  });

  it('getMaxBytes returns constructor argument', () => {
    expect(new ResourceCache(512).getMaxBytes()).toBe(512);
  });

  it('getUsageRatio is 0 when empty', () => {
    expect(new ResourceCache(1000).getUsageRatio()).toBe(0);
  });
});

describe('ResourceCache — put / get / has / remove', () => {
  let cache: ResourceCache<string>;
  beforeEach(() => { cache = new ResourceCache<string>(10000); });

  it('put and get round-trip', () => {
    cache.put('k1', 'hello', 100);
    expect(cache.get('k1')).toBe('hello');
  });

  it('has returns true for stored key', () => {
    cache.put('k1', 'v', 50);
    expect(cache.has('k1')).toBe(true);
  });

  it('has returns false for missing key', () => {
    expect(cache.has('ghost')).toBe(false);
  });

  it('get returns undefined for missing key', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('overwrite replaces existing entry', () => {
    cache.put('k1', 'first', 100);
    cache.put('k1', 'second', 100);
    expect(cache.get('k1')).toBe('second');
  });

  it('overwrite updates currentBytes correctly', () => {
    cache.put('k1', 'v', 100);
    cache.put('k1', 'v2', 200);
    expect(cache.getCurrentBytes()).toBe(200);
  });

  it('remove returns true and frees bytes', () => {
    cache.put('k1', 'v', 300);
    expect(cache.remove('k1')).toBe(true);
    expect(cache.getCurrentBytes()).toBe(0);
    expect(cache.has('k1')).toBe(false);
  });

  it('remove returns false for missing key', () => {
    expect(cache.remove('unknown')).toBe(false);
  });

  it('multiple entries track currentBytes', () => {
    cache.put('a', 'v', 100);
    cache.put('b', 'v', 200);
    expect(cache.getCurrentBytes()).toBe(300);
    expect(cache.getEntryCount()).toBe(2);
  });

  it('clear resets all state', () => {
    cache.put('a', 'v', 100);
    cache.put('b', 'v', 100);
    cache.clear();
    expect(cache.getEntryCount()).toBe(0);
    expect(cache.getCurrentBytes()).toBe(0);
  });
});

describe('ResourceCache — TTL expiry', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns value before TTL expires', () => {
    vi.useFakeTimers();
    const c = new ResourceCache<string>(10000);
    c.put('k', 'v', 100, 5000);
    vi.advanceTimersByTime(4000);
    expect(c.get('k')).toBe('v');
  });

  it('returns undefined and removes entry after TTL', () => {
    vi.useFakeTimers();
    const c = new ResourceCache<string>(10000);
    c.put('k', 'v', 100, 1000);
    vi.advanceTimersByTime(2000);
    expect(c.get('k')).toBeUndefined();
    expect(c.has('k')).toBe(false);
  });

  it('ttlMs=0 means no expiry', () => {
    vi.useFakeTimers();
    const c = new ResourceCache<string>(10000);
    c.put('k', 'v', 100, 0);
    vi.advanceTimersByTime(9999999);
    expect(c.get('k')).toBe('v');
  });

  it('purgeExpired removes expired entries and returns count', () => {
    vi.useFakeTimers();
    const c = new ResourceCache<string>(10000);
    c.put('a', 'v', 100, 1000);
    c.put('b', 'v', 100, 1000);
    c.put('c', 'v', 100, 0); // no expiry
    vi.advanceTimersByTime(2000);
    const purged = c.purgeExpired();
    expect(purged).toBe(2);
    expect(c.getEntryCount()).toBe(1);
  });
});

describe('ResourceCache — reference counting', () => {
  let cache: ResourceCache<string>;
  beforeEach(() => { cache = new ResourceCache<string>(10000); });

  it('starts with refCount=0', () => {
    cache.put('k', 'v', 100);
    expect(cache.getRefCount('k')).toBe(0);
  });

  it('addRef increments refCount', () => {
    cache.put('k', 'v', 100);
    cache.addRef('k');
    cache.addRef('k');
    expect(cache.getRefCount('k')).toBe(2);
  });

  it('release decrements refCount', () => {
    cache.put('k', 'v', 100);
    cache.addRef('k');
    cache.addRef('k');
    cache.release('k');
    expect(cache.getRefCount('k')).toBe(1);
  });

  it('release does not go below 0', () => {
    cache.put('k', 'v', 100);
    cache.release('k');
    expect(cache.getRefCount('k')).toBe(0);
  });

  it('getRefCount for unknown key returns 0', () => {
    expect(cache.getRefCount('ghost')).toBe(0);
  });
});

describe('ResourceCache — LRU eviction', () => {
  it('evicts oldest unreferenced entry to make room', () => {
    const c = new ResourceCache<string>(300);
    c.put('old', 'v', 100);
    c.put('mid', 'v', 100);
    // Adding 150 bytes requires eviction
    c.put('new', 'v', 150);
    // 'old' should be evicted (oldest)
    expect(c.has('old')).toBe(false);
    expect(c.has('new')).toBe(true);
  });

  it('does not evict pinned (refCount > 0) entries', () => {
    const c = new ResourceCache<string>(200);
    c.put('pinned', 'v', 100);
    c.addRef('pinned');
    c.put('free', 'v', 100);
    // Now add something that needs eviction — pinned is skip, free is evicted
    c.put('newcomer', 'v', 100);
    expect(c.has('pinned')).toBe(true);
    expect(c.has('free')).toBe(false);
    expect(c.has('newcomer')).toBe(true);
  });

  it('usage ratio updates after eviction', () => {
    const c = new ResourceCache<string>(200);
    c.put('a', 'v', 100);
    c.put('b', 'v', 100); // full
    c.put('c', 'v', 100); // triggers eviction
    expect(c.getUsageRatio()).toBeLessThanOrEqual(1);
  });
});
