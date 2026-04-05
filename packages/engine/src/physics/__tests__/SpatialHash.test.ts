import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialHash } from '@holoscript/core';

describe('SpatialHash', () => {
  let hash: SpatialHash;

  beforeEach(() => {
    hash = new SpatialHash(1.0); // 1m cells
  });

  // ---------- Insert / Remove ----------
  it('inserts an entry', () => {
    hash.insert({ id: 'a', x: 0, y: 0, z: 0, radius: 0.1 });
    expect(hash.getEntryCount()).toBe(1);
  });

  it('removes an entry', () => {
    hash.insert({ id: 'b', x: 0, y: 0, z: 0, radius: 0.1 });
    hash.remove('b');
    expect(hash.getEntryCount()).toBe(0);
  });

  it('remove is idempotent for missing id', () => {
    hash.remove('nonexistent');
    expect(hash.getEntryCount()).toBe(0);
  });

  it('clears all entries', () => {
    hash.insert({ id: 'c', x: 1, y: 0, z: 0, radius: 0 });
    hash.insert({ id: 'd', x: 2, y: 0, z: 0, radius: 0 });
    hash.clear();
    expect(hash.getEntryCount()).toBe(0);
    expect(hash.getCellCount()).toBe(0);
  });

  // ---------- Update ----------
  it('updates entry position', () => {
    hash.insert({ id: 'e', x: 0, y: 0, z: 0, radius: 0 });
    hash.update('e', 5, 5, 5);
    // Old cell should be empty, new cell should contain 'e'
    expect(hash.queryPoint(0, 0, 0)).not.toContain('e');
    expect(hash.queryPoint(5, 5, 5)).toContain('e');
  });

  // ---------- Query Point ----------
  it('queryPoint returns entries in the same cell', () => {
    hash.insert({ id: 'f', x: 0.1, y: 0.2, z: 0.3, radius: 0 });
    const results = hash.queryPoint(0.5, 0.5, 0.5);
    expect(results).toContain('f');
  });

  it('queryPoint returns empty for unoccupied cells', () => {
    expect(hash.queryPoint(100, 100, 100)).toEqual([]);
  });

  // ---------- Query Radius ----------
  it('queryRadius finds entries within distance', () => {
    hash.insert({ id: 'g', x: 0, y: 0, z: 0, radius: 0.1 });
    hash.insert({ id: 'h', x: 10, y: 10, z: 10, radius: 0.1 });
    const near = hash.queryRadius(0, 0, 0, 1);
    expect(near).toContain('g');
    expect(near).not.toContain('h');
  });

  it('queryRadius accounts for entry radius', () => {
    hash.insert({ id: 'i', x: 2, y: 0, z: 0, radius: 1.5 });
    // Entry at x=2 with radius=1.5 extends to x=0.5
    // Query at origin with radius 0.5 should overlap
    const results = hash.queryRadius(0, 0, 0, 0.6);
    expect(results).toContain('i');
  });

  // ---------- Nearby Pairs ----------
  it('getNearbyPairs finds entities sharing a cell', () => {
    hash.insert({ id: 'j', x: 0.1, y: 0, z: 0, radius: 0 });
    hash.insert({ id: 'k', x: 0.2, y: 0, z: 0, radius: 0 });
    const pairs = hash.getNearbyPairs();
    expect(pairs.length).toBe(1);
    const [a, b] = pairs[0];
    expect([a, b].sort()).toEqual(['j', 'k']);
  });

  it('getNearbyPairs deduplicates', () => {
    // Large radii cause entries to span multiple cells
    hash.insert({ id: 'l', x: 0, y: 0, z: 0, radius: 0.6 });
    hash.insert({ id: 'm', x: 0.5, y: 0, z: 0, radius: 0.6 });
    const pairs = hash.getNearbyPairs();
    // Should only have one pair even if they share multiple cells
    expect(pairs.length).toBe(1);
  });

  it('getNearbyPairs returns empty for single entry', () => {
    hash.insert({ id: 'solo', x: 0, y: 0, z: 0, radius: 0 });
    expect(hash.getNearbyPairs().length).toBe(0);
  });

  // ---------- Multi-cell ----------
  it('inserts large-radius entry into multiple cells', () => {
    hash.insert({ id: 'big', x: 0, y: 0, z: 0, radius: 2 });
    // Should occupy cells from -2 to +2 in each dimension
    expect(hash.getCellCount()).toBeGreaterThan(1);
  });

  // ---------- Stats ----------
  it('tracks entry and cell counts', () => {
    hash.insert({ id: 'n', x: 0, y: 0, z: 0, radius: 0 });
    hash.insert({ id: 'o', x: 5, y: 5, z: 5, radius: 0 });
    expect(hash.getEntryCount()).toBe(2);
    expect(hash.getCellCount()).toBe(2);
  });
});

