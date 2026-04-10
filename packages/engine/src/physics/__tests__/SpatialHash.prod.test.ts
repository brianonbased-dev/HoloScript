/**
 * SpatialHash — Production Test Suite
 *
 * Covers: insert, remove, update, queryPoint, queryRadius,
 * getNearbyPairs, multi-cell entries, stats, clear.
 */
import { describe, it, expect } from 'vitest';
import { SpatialHash, type SpatialEntry } from '@holoscript/core';

function entry(id: string, x: number, y: number, z = 0, radius = 0): SpatialEntry {
  return { id, x, y, z, radius };
}

describe('SpatialHash — Production', () => {
  // ─── Insert / Remove ──────────────────────────────────────────────
  it('insert registers entry', () => {
    const sh = new SpatialHash(10);
    sh.insert(entry('a', 5, 5));
    expect(sh.getEntryCount()).toBe(1);
  });

  it('remove cleans up entry', () => {
    const sh = new SpatialHash(10);
    sh.insert(entry('a', 5, 5));
    sh.remove('a');
    expect(sh.getEntryCount()).toBe(0);
  });

  // ─── Point Query ──────────────────────────────────────────────────
  it('queryPoint finds entry in same cell', () => {
    const sh = new SpatialHash(10);
    sh.insert(entry('a', 5, 5));
    const r = sh.queryPoint(5, 5, 0);
    expect(r).toContain('a');
  });

  it('queryPoint misses entry in different cell', () => {
    const sh = new SpatialHash(10);
    sh.insert(entry('a', 5, 5));
    const r = sh.queryPoint(25, 25, 0);
    expect(r).not.toContain('a');
  });

  // ─── Radius Query ─────────────────────────────────────────────────
  it('queryRadius finds nearby entries', () => {
    const sh = new SpatialHash(10);
    sh.insert(entry('a', 0, 0));
    sh.insert(entry('b', 100, 100));
    const r = sh.queryRadius(0, 0, 0, 15);
    expect(r).toContain('a');
    expect(r).not.toContain('b');
  });

  it('queryRadius includes entry radius', () => {
    const sh = new SpatialHash(10);
    sh.insert(entry('a', 12, 0, 0, 5)); // entry radius = 5
    const r = sh.queryRadius(0, 0, 0, 10); // search radius 10 → total reach 15
    expect(r).toContain('a');
  });

  // ─── Nearby Pairs ─────────────────────────────────────────────────
  it('getNearbyPairs returns pairs in same cell', () => {
    const sh = new SpatialHash(10);
    sh.insert(entry('a', 1, 1));
    sh.insert(entry('b', 2, 2));
    const pairs = sh.getNearbyPairs();
    expect(pairs.length).toBe(1);
  });

  it('getNearbyPairs no duplicate pairs', () => {
    const sh = new SpatialHash(10);
    sh.insert(entry('a', 1, 1));
    sh.insert(entry('b', 2, 2));
    sh.insert(entry('c', 3, 3));
    const pairs = sh.getNearbyPairs();
    expect(pairs.length).toBe(3); // ab, ac, bc
  });

  // ─── Update ───────────────────────────────────────────────────────
  it('update moves entry to new cell', () => {
    const sh = new SpatialHash(10);
    sh.insert(entry('a', 1, 1));
    sh.update('a', 100, 100, 0);
    expect(sh.queryPoint(1, 1, 0)).not.toContain('a');
    expect(sh.queryPoint(100, 100, 0)).toContain('a');
  });

  // ─── Clear ────────────────────────────────────────────────────────
  it('clear removes all entries and cells', () => {
    const sh = new SpatialHash(10);
    sh.insert(entry('a', 1, 1));
    sh.insert(entry('b', 2, 2));
    sh.clear();
    expect(sh.getEntryCount()).toBe(0);
    expect(sh.getCellCount()).toBe(0);
  });
});
