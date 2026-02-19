/**
 * IslandDetector — Production Test Suite
 *
 * Covers: body registration, connection tracking, Disjoint Set Union
 * island detection, path compression, reset behavior.
 */
import { describe, it, expect } from 'vitest';
import { IslandDetector } from '../IslandDetector';

describe('IslandDetector — Production', () => {
  // ─── Empty / Reset ────────────────────────────────────────────────
  it('returns empty array when no bodies', () => {
    const det = new IslandDetector();
    expect(det.detectIslands()).toEqual([]);
  });

  it('reset clears all state', () => {
    const det = new IslandDetector();
    det.addBody('a');
    det.addBody('b');
    det.addConnection('a', 'b');
    det.reset();
    expect(det.detectIslands()).toEqual([]);
  });

  // ─── Single Body ──────────────────────────────────────────────────
  it('single body forms its own island', () => {
    const det = new IslandDetector();
    det.addBody('solo');
    const islands = det.detectIslands();
    expect(islands).toEqual([['solo']]);
  });

  // ─── Disconnected Bodies ──────────────────────────────────────────
  it('disconnected bodies form separate islands', () => {
    const det = new IslandDetector();
    det.addBody('a');
    det.addBody('b');
    det.addBody('c');
    const islands = det.detectIslands();
    expect(islands.length).toBe(3);
    expect(islands.every(i => i.length === 1)).toBe(true);
  });

  // ─── Connected Pair ───────────────────────────────────────────────
  it('connected pair forms one island', () => {
    const det = new IslandDetector();
    det.addBody('a');
    det.addBody('b');
    det.addConnection('a', 'b');
    const islands = det.detectIslands();
    expect(islands.length).toBe(1);
    expect(islands[0].sort()).toEqual(['a', 'b']);
  });

  // ─── Chain Connection ─────────────────────────────────────────────
  it('chain A-B-C-D merges into one island', () => {
    const det = new IslandDetector();
    ['a', 'b', 'c', 'd'].forEach(id => det.addBody(id));
    det.addConnection('a', 'b');
    det.addConnection('b', 'c');
    det.addConnection('c', 'd');
    const islands = det.detectIslands();
    expect(islands.length).toBe(1);
    expect(islands[0].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  // ─── Two Separate Islands ─────────────────────────────────────────
  it('two groups form two islands', () => {
    const det = new IslandDetector();
    ['a', 'b', 'c', 'd'].forEach(id => det.addBody(id));
    det.addConnection('a', 'b');
    det.addConnection('c', 'd');
    const islands = det.detectIslands();
    expect(islands.length).toBe(2);
    const sorted = islands.map(i => i.sort()).sort((a, b) => a[0].localeCompare(b[0]));
    expect(sorted).toEqual([['a', 'b'], ['c', 'd']]);
  });

  // ─── Large-Scale Union ────────────────────────────────────────────
  it('handles 100 bodies in a line', () => {
    const det = new IslandDetector();
    for (let i = 0; i < 100; i++) det.addBody(`b${i}`);
    for (let i = 0; i < 99; i++) det.addConnection(`b${i}`, `b${i + 1}`);
    const islands = det.detectIslands();
    expect(islands.length).toBe(1);
    expect(islands[0].length).toBe(100);
  });

  // ─── Redundant Connections ────────────────────────────────────────
  it('handles duplicate connections gracefully', () => {
    const det = new IslandDetector();
    det.addBody('a');
    det.addBody('b');
    det.addConnection('a', 'b');
    det.addConnection('a', 'b');
    det.addConnection('b', 'a');
    const islands = det.detectIslands();
    expect(islands.length).toBe(1);
    expect(islands[0].sort()).toEqual(['a', 'b']);
  });

  // ─── Cycle (Triangle) ────────────────────────────────────────────
  it('cyclic connections merge correctly', () => {
    const det = new IslandDetector();
    det.addBody('a');
    det.addBody('b');
    det.addBody('c');
    det.addConnection('a', 'b');
    det.addConnection('b', 'c');
    det.addConnection('c', 'a');
    const islands = det.detectIslands();
    expect(islands.length).toBe(1);
    expect(islands[0].sort()).toEqual(['a', 'b', 'c']);
  });

  // ─── Mixed: One Island + Lone Bodies ──────────────────────────────
  it('mixed scenario: island + lone bodies', () => {
    const det = new IslandDetector();
    ['a', 'b', 'c', 'lone1', 'lone2'].forEach(id => det.addBody(id));
    det.addConnection('a', 'b');
    det.addConnection('b', 'c');
    const islands = det.detectIslands();
    expect(islands.length).toBe(3); // {a,b,c}, {lone1}, {lone2}
    const biggest = islands.find(i => i.length === 3)!;
    expect(biggest.sort()).toEqual(['a', 'b', 'c']);
  });

  // ─── Star Topology ───────────────────────────────────────────────
  it('star topology: center connected to all spokes', () => {
    const det = new IslandDetector();
    det.addBody('center');
    for (let i = 0; i < 5; i++) {
      det.addBody(`spoke${i}`);
      det.addConnection('center', `spoke${i}`);
    }
    const islands = det.detectIslands();
    expect(islands.length).toBe(1);
    expect(islands[0].length).toBe(6);
  });
});
