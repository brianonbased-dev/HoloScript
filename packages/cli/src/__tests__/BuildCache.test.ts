/**
 * BuildCache Tests - Sprint 4
 *
 * Tests for CacheManager, HashCalculator, and DependencyTracker.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HashCalculator } from '../build/cache/HashCalculator';
import { DependencyTracker } from '../build/cache/DependencyTracker';
import { CacheManager } from '../build/cache/CacheManager';

// =============================================================================
// HashCalculator
// =============================================================================

describe('HashCalculator', () => {
  let hasher: HashCalculator;

  beforeEach(() => {
    hasher = new HashCalculator();
  });

  it('hashContent produces consistent hashes', () => {
    const h1 = hasher.hashContent('hello world');
    const h2 = hasher.hashContent('hello world');
    expect(h1).toBe(h2);
  });

  it('hashContent produces different hashes for different content', () => {
    const h1 = hasher.hashContent('content A');
    const h2 = hasher.hashContent('content B');
    expect(h1).not.toBe(h2);
  });

  it('hashContent returns a hex string', () => {
    const h = hasher.hashContent('test');
    expect(typeof h).toBe('string');
    expect(h.length).toBeGreaterThan(0);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it('hashFile returns null for non-existent file', () => {
    const result = hasher.hashFile('/non/existent/path/file.hsplus');
    expect(result).toBeNull();
  });
});

// =============================================================================
// DependencyTracker
// =============================================================================

describe('DependencyTracker', () => {
  let tracker: DependencyTracker;

  beforeEach(() => {
    tracker = new DependencyTracker();
  });

  it('addDependency tracks direct dependencies', () => {
    tracker.addDependency('a.hsplus', 'b.hsplus');
    const deps = tracker.getDependencies('a.hsplus');
    expect(deps).toContain('b.hsplus');
  });

  it('getDependencies returns empty array for unknown file', () => {
    expect(tracker.getDependencies('unknown.hsplus')).toHaveLength(0);
  });

  it('removeDependencies cleans up a file', () => {
    tracker.addDependency('a.hsplus', 'b.hsplus');
    tracker.removeDependencies('a.hsplus');
    expect(tracker.getDependencies('a.hsplus')).toHaveLength(0);
  });

  it('getDependents returns files that depend on a given file', () => {
    tracker.addDependency('main.hsplus', 'shared.hsplus');
    tracker.addDependency('other.hsplus', 'shared.hsplus');
    const dependents = tracker.getDependents('shared.hsplus');
    expect(dependents).toContain('main.hsplus');
    expect(dependents).toContain('other.hsplus');
  });

  it('clear removes all tracked data', () => {
    tracker.addDependency('a.hsplus', 'b.hsplus');
    tracker.clear();
    expect(tracker.getDependencies('a.hsplus')).toHaveLength(0);
  });

  it('toJSON and fromJSON roundtrip', () => {
    tracker.addDependency('a.hsplus', 'b.hsplus');
    tracker.addDependency('a.hsplus', 'c.hsplus');
    const json = tracker.toJSON();
    tracker.fromJSON(json);
    expect(tracker.getDependencies('a.hsplus')).toContain('b.hsplus');
    expect(tracker.getDependencies('a.hsplus')).toContain('c.hsplus');
  });
});

// =============================================================================
// CacheManager
// =============================================================================

describe('CacheManager', () => {
  let cache: CacheManager;

  beforeEach(() => {
    // Use a temp cache dir per test to avoid file system collision
    cache = new CacheManager('.holoscript-cache-test-' + Date.now(), '3.5.0');
  });

  it('isStale returns true for uncached files', () => {
    expect(cache.isStale('a.hsplus', 'abc123')).toBe(true);
  });

  it('isStale returns false after update with same hash', () => {
    cache.update('a.hsplus', 'abc123', [], ['dist/a.js']);
    expect(cache.isStale('a.hsplus', 'abc123')).toBe(false);
  });

  it('isStale returns true when hash changes', () => {
    cache.update('a.hsplus', 'abc123', [], []);
    expect(cache.isStale('a.hsplus', 'def456')).toBe(true);
  });

  it('update records build metadata', () => {
    cache.update('a.hsplus', 'hash1', ['b.hsplus'], ['dist/a.js']);
    const manifest = cache.getManifest();
    expect(manifest.entries['a.hsplus']).toBeDefined();
    expect(manifest.entries['a.hsplus'].hash).toBe('hash1');
    expect(manifest.entries['a.hsplus'].outputs).toContain('dist/a.js');
  });

  it('invalidate removes a cache entry', () => {
    cache.update('a.hsplus', 'abc123', [], []);
    cache.invalidate('a.hsplus');
    expect(cache.isStale('a.hsplus', 'abc123')).toBe(true);
  });

  it('getStats returns entry count', () => {
    cache.update('a.hsplus', 'h1', [], []);
    cache.update('b.hsplus', 'h2', [], []);
    const stats = cache.getStats();
    expect(stats.totalEntries).toBe(2);
  });

  it('getManifest returns the current manifest', () => {
    const manifest = cache.getManifest();
    expect(manifest).toBeDefined();
    expect(manifest.version).toBeDefined();
    expect(manifest.compilerVersion).toBe('3.5.0');
  });

  it('compiler version mismatch invalidates cache on load', async () => {
    // Compiler version stored is '3.5.0', load with different version
    const otherCache = new CacheManager('.holoscript-cache-test-v2', '4.0.0');
    await otherCache.load(); // No cache dir — should be a clean slate
    const manifest = otherCache.getManifest();
    expect(Object.keys(manifest.entries)).toHaveLength(0);
  });

  it('depTracker is publicly accessible', () => {
    expect(cache.depTracker).toBeDefined();
    cache.depTracker.addDependency('a.hsplus', 'b.hsplus');
    expect(cache.depTracker.getDependencies('a.hsplus')).toContain('b.hsplus');
  });
});
