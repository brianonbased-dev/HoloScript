import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialHash } from '../physics/SpatialHash';
import type { SpatialEntry } from '../physics/SpatialHash';

// =============================================================================
// C235 — Spatial Hash
// =============================================================================

describe('SpatialHash', () => {
  let sh: SpatialHash;
  beforeEach(() => {
    sh = new SpatialHash(10);
  }); // cellSize = 10

  it('insert and getEntryCount', () => {
    sh.insert({ id: 'a', x: 5, y: 5, z: 5, radius: 0 });
    expect(sh.getEntryCount()).toBe(1);
  });

  it('remove decreases count', () => {
    sh.insert({ id: 'a', x: 5, y: 5, z: 5, radius: 0 });
    sh.remove('a');
    expect(sh.getEntryCount()).toBe(0);
  });

  it('queryPoint finds entries in the same cell', () => {
    sh.insert({ id: 'a', x: 3, y: 3, z: 3, radius: 0 });
    sh.insert({ id: 'b', x: 7, y: 7, z: 7, radius: 0 });
    // Both in cell (0,0,0) with cellSize 10
    const results = sh.queryPoint(5, 5, 5);
    expect(results).toContain('a');
    expect(results).toContain('b');
  });

  it('queryPoint returns empty for empty cell', () => {
    sh.insert({ id: 'a', x: 5, y: 5, z: 5, radius: 0 });
    const results = sh.queryPoint(100, 100, 100);
    expect(results).toHaveLength(0);
  });

  it('queryRadius finds entries within radius', () => {
    sh.insert({ id: 'a', x: 0, y: 0, z: 0, radius: 1 });
    sh.insert({ id: 'b', x: 8, y: 0, z: 0, radius: 1 });
    sh.insert({ id: 'far', x: 100, y: 100, z: 100, radius: 1 });
    const results = sh.queryRadius(0, 0, 0, 15);
    expect(results).toContain('a');
    expect(results).toContain('b');
    expect(results).not.toContain('far');
  });

  it('queryRadius considers entry radius', () => {
    sh.insert({ id: 'large', x: 20, y: 0, z: 0, radius: 10 });
    // Search from origin with radius 15, entry at 20 with radius 10 → dist 20 <= 15+10 = 25
    const results = sh.queryRadius(0, 0, 0, 15);
    expect(results).toContain('large');
  });

  it('update moves entry to new cell', () => {
    sh.insert({ id: 'a', x: 5, y: 5, z: 5, radius: 0 });
    sh.update('a', 50, 50, 50);
    expect(sh.queryPoint(5, 5, 5)).not.toContain('a');
    expect(sh.queryPoint(50, 50, 50)).toContain('a');
  });

  it('getNearbyPairs returns pairs in same cells', () => {
    sh.insert({ id: 'a', x: 1, y: 1, z: 1, radius: 0 });
    sh.insert({ id: 'b', x: 2, y: 2, z: 2, radius: 0 });
    const pairs = sh.getNearbyPairs();
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    const hasAB = pairs.some(([p, q]) => (p === 'a' && q === 'b') || (p === 'b' && q === 'a'));
    expect(hasAB).toBe(true);
  });

  it('getNearbyPairs deduplicates', () => {
    sh.insert({ id: 'a', x: 1, y: 1, z: 1, radius: 5 }); // spans multiple cells
    sh.insert({ id: 'b', x: 2, y: 2, z: 2, radius: 5 });
    const pairs = sh.getNearbyPairs();
    const keys = pairs.map(([p, q]) => (p < q ? `${p}:${q}` : `${q}:${p}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('large radius entry spans multiple cells', () => {
    sh.insert({ id: 'big', x: 5, y: 5, z: 5, radius: 15 });
    expect(sh.getCellCount()).toBeGreaterThan(1);
  });

  it('clear removes everything', () => {
    sh.insert({ id: 'a', x: 0, y: 0, z: 0, radius: 0 });
    sh.insert({ id: 'b', x: 5, y: 5, z: 5, radius: 0 });
    sh.clear();
    expect(sh.getEntryCount()).toBe(0);
    expect(sh.getCellCount()).toBe(0);
  });

  it('remove non-existent entry is safe', () => {
    sh.remove('nope');
    expect(sh.getEntryCount()).toBe(0);
  });
});
