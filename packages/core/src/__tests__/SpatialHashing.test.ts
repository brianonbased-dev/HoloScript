/**
 * Cycle 203 — Spatial Hashing
 *
 * Covers SpatialHash (insert/remove, radius query, multi-cell, clear, edge cases)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialHash } from '../performance/SpatialHash';

describe('SpatialHash', () => {
  let grid: SpatialHash;

  beforeEach(() => {
    grid = new SpatialHash(10); // 10-unit cells
  });

  // --- Insert ---
  it('insert increases count', () => {
    grid.insert({ id: 'a', x: 0, y: 0, z: 0 });
    expect(grid.count).toBe(1);
  });

  it('insert multiple entities', () => {
    grid.insert({ id: 'a', x: 0, y: 0, z: 0 });
    grid.insert({ id: 'b', x: 5, y: 5, z: 5 });
    grid.insert({ id: 'c', x: 20, y: 20, z: 20 });
    expect(grid.count).toBe(3);
  });

  it('insert same id updates position (no duplicate)', () => {
    grid.insert({ id: 'a', x: 0, y: 0, z: 0 });
    grid.insert({ id: 'a', x: 100, y: 100, z: 100 });
    expect(grid.count).toBe(1);
  });

  // --- Remove ---
  it('remove decreases count', () => {
    grid.insert({ id: 'a', x: 0, y: 0, z: 0 });
    grid.remove('a');
    expect(grid.count).toBe(0);
  });

  it('remove nonexistent id does nothing', () => {
    grid.remove('nonexistent');
    expect(grid.count).toBe(0);
  });

  it('removed entity is not found by query', () => {
    grid.insert({ id: 'a', x: 0, y: 0, z: 0 });
    grid.remove('a');
    const results = grid.queryRadius(0, 0, 0, 100);
    expect(results).toHaveLength(0);
  });

  // --- Query ---
  it('queryRadius returns entities within radius', () => {
    grid.insert({ id: 'near', x: 3, y: 0, z: 0 });
    grid.insert({ id: 'far', x: 100, y: 0, z: 0 });
    const results = grid.queryRadius(0, 0, 0, 5);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('near');
  });

  it('queryRadius includes entity radius in distance check', () => {
    // Entity at distance 8 with radius 3 → effective distance = 8, threshold = 5 + 3 = 8
    grid.insert({ id: 'a', x: 8, y: 0, z: 0, radius: 3 });
    const results = grid.queryRadius(0, 0, 0, 5);
    expect(results).toHaveLength(1);
  });

  it('queryRadius returns empty for no matches', () => {
    grid.insert({ id: 'a', x: 100, y: 100, z: 100 });
    const results = grid.queryRadius(0, 0, 0, 5);
    expect(results).toHaveLength(0);
  });

  it('queryRadius on empty grid returns empty', () => {
    const results = grid.queryRadius(0, 0, 0, 100);
    expect(results).toHaveLength(0);
  });

  it('queryRadius deduplicates multi-cell entities', () => {
    // Entity with large radius spans multiple cells
    grid.insert({ id: 'big', x: 0, y: 0, z: 0, radius: 25 });
    const results = grid.queryRadius(0, 0, 0, 50);
    // Should appear exactly once
    expect(results.filter((e) => e.id === 'big')).toHaveLength(1);
  });

  // --- Negative coordinates ---
  it('works with negative coordinates', () => {
    grid.insert({ id: 'neg', x: -15, y: -20, z: -5 });
    const results = grid.queryRadius(-15, -20, -5, 1);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('neg');
  });

  // --- Update position ---
  it('re-insert moves entity to new cell', () => {
    grid.insert({ id: 'moving', x: 0, y: 0, z: 0 });
    grid.insert({ id: 'moving', x: 50, y: 50, z: 50 });
    // Should NOT be found at old position
    const oldResults = grid.queryRadius(0, 0, 0, 5);
    expect(oldResults).toHaveLength(0);
    // Should be found at new position
    const newResults = grid.queryRadius(50, 50, 50, 5);
    expect(newResults).toHaveLength(1);
  });

  // --- Clear ---
  it('clear removes all entities', () => {
    grid.insert({ id: 'a', x: 0, y: 0, z: 0 });
    grid.insert({ id: 'b', x: 10, y: 10, z: 10 });
    grid.clear();
    expect(grid.count).toBe(0);
    expect(grid.queryRadius(0, 0, 0, 100)).toHaveLength(0);
  });

  // --- Multiple nearby entities ---
  it('queryRadius returns all entities within range', () => {
    for (let i = 0; i < 10; i++) {
      grid.insert({ id: `e${i}`, x: i, y: 0, z: 0 });
    }
    const results = grid.queryRadius(5, 0, 0, 3);
    // Entities at x=2,3,4,5,6,7,8 are within distance 3 of x=5
    expect(results.length).toBeGreaterThanOrEqual(5);
  });

  // --- Large grid stress ---
  it('handles 100 entities correctly', () => {
    for (let i = 0; i < 100; i++) {
      grid.insert({ id: `e${i}`, x: i * 5, y: 0, z: 0 });
    }
    expect(grid.count).toBe(100);
    // Query around origin with small radius should find few
    const results = grid.queryRadius(0, 0, 0, 10);
    expect(results.length).toBeLessThan(10);
  });
});
