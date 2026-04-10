/**
 * OctreeSystem — production test suite
 *
 * Tests spatial partitioning: insert, remove, radius queries,
 * automatic node subdivision, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OctreeSystem, OctreeEntry } from '../OctreeSystem';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEntry(id: string, x: number, y: number, z: number, radius = 0.5): OctreeEntry {
  return { id, x, y, z, radius };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('OctreeSystem: production', () => {
  let oct: OctreeSystem;

  beforeEach(() => {
    // 100-unit half-size octree centred at origin
    oct = new OctreeSystem(0, 0, 0, 100);
  });

  // ─── Construction ───────────────────────────────────────────────────────
  it('constructs with zero entries', () => {
    expect(oct.getEntryCount()).toBe(0);
  });

  // ─── Insert ─────────────────────────────────────────────────────────────
  it('inserts an entry inside bounds and returns true', () => {
    const inserted = oct.insert(makeEntry('a', 0, 0, 0));
    expect(inserted).toBe(true);
    expect(oct.getEntryCount()).toBe(1);
  });

  it('returns false when entry is outside bounds', () => {
    const inserted = oct.insert(makeEntry('out', 200, 0, 0));
    expect(inserted).toBe(false);
    expect(oct.getEntryCount()).toBe(0);
  });

  it('inserts multiple entries', () => {
    for (let i = 0; i < 5; i++) oct.insert(makeEntry(`e${i}`, i * 10, 0, 0));
    expect(oct.getEntryCount()).toBe(5);
  });

  // ─── Remove ─────────────────────────────────────────────────────────────
  it('removes an existing entry and returns true', () => {
    oct.insert(makeEntry('x', 5, 5, 5));
    const removed = oct.remove('x');
    expect(removed).toBe(true);
    expect(oct.getEntryCount()).toBe(0);
  });

  it('returns false when removing a non-existent entry', () => {
    expect(oct.remove('ghost')).toBe(false);
  });

  it('does not affect other entries on remove', () => {
    oct.insert(makeEntry('a', 10, 0, 0));
    oct.insert(makeEntry('b', -10, 0, 0));
    oct.remove('a');
    expect(oct.getEntryCount()).toBe(1);
    const hits = oct.queryRadius(-10, 0, 0, 2);
    expect(hits.some((e) => e.id === 'b')).toBe(true);
  });

  // ─── Queries ────────────────────────────────────────────────────────────
  it('queryRadius returns entry within range', () => {
    oct.insert(makeEntry('near', 5, 0, 0));
    oct.insert(makeEntry('far', 80, 0, 0));
    const results = oct.queryRadius(0, 0, 0, 10);
    expect(results.some((e) => e.id === 'near')).toBe(true);
    expect(results.some((e) => e.id === 'far')).toBe(false);
  });

  it('queryRadius returns empty when no entries in range', () => {
    oct.insert(makeEntry('far', 90, 0, 0));
    const results = oct.queryRadius(0, 0, 0, 5);
    expect(results).toHaveLength(0);
  });

  it('queryRadius includes entries whose radius overlaps the query sphere', () => {
    // Entry at x=12, radius=3 → overlaps query sphere at x=0 r=10 (dist=12, 10+3=13 > 12)
    oct.insert(makeEntry('overlap', 12, 0, 0, 3));
    const results = oct.queryRadius(0, 0, 0, 10);
    expect(results.some((e) => e.id === 'overlap')).toBe(true);
  });

  it('queryRadius returns all entries inside large radius', () => {
    for (let i = 0; i < 10; i++) oct.insert(makeEntry(`e${i}`, i * 5, 0, 0));
    const results = oct.queryRadius(0, 0, 0, 100);
    expect(results.length).toBe(10);
  });

  // ─── Subdivision ────────────────────────────────────────────────────────
  it('handles subdivision when more than 8 entries are in one node', () => {
    // Force subdivision by packing 10 entries together
    for (let i = 0; i < 10; i++) oct.insert(makeEntry(`sub${i}`, i * 0.1, 0, 0));
    // All entries should still be found
    const results = oct.queryRadius(0.5, 0, 0, 5);
    expect(results.length).toBe(10);
    expect(oct.getEntryCount()).toBe(10);
  });

  // ─── Clear ──────────────────────────────────────────────────────────────
  it('clear removes all entries', () => {
    for (let i = 0; i < 5; i++) oct.insert(makeEntry(`c${i}`, i, 0, 0));
    oct.clear();
    expect(oct.getEntryCount()).toBe(0);
    expect(oct.queryRadius(0, 0, 0, 100)).toHaveLength(0);
  });

  it('can insert again after clear', () => {
    oct.insert(makeEntry('before', 1, 0, 0));
    oct.clear();
    oct.insert(makeEntry('after', 2, 0, 0));
    expect(oct.getEntryCount()).toBe(1);
  });

  // ─── Edge Cases ─────────────────────────────────────────────────────────
  it('allows entry exactly on boundary (half-size distance)', () => {
    const inserted = oct.insert(makeEntry('boundary', 100, 0, 0));
    expect(inserted).toBe(true);
  });

  it('handles 3D queries correctly', () => {
    oct.insert(makeEntry('z-pos', 0, 0, 30));
    oct.insert(makeEntry('z-neg', 0, 0, -30));
    const results = oct.queryRadius(0, 0, 25, 10);
    expect(results.some((e) => e.id === 'z-pos')).toBe(true);
    expect(results.some((e) => e.id === 'z-neg')).toBe(false);
  });
});
