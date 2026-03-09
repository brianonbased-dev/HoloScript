/**
 * IslandDetector — Production Test Suite
 *
 * Covers: addBody, addConnection, detectIslands (DSU), reset.
 */
import { describe, it, expect } from 'vitest';
import { IslandDetector } from '../IslandDetector';

describe('IslandDetector — Production', () => {
  it('single body forms one island', () => {
    const d = new IslandDetector();
    d.addBody('A');
    const islands = d.detectIslands();
    expect(islands.length).toBe(1);
    expect(islands[0]).toContain('A');
  });

  it('disconnected bodies form separate islands', () => {
    const d = new IslandDetector();
    d.addBody('A');
    d.addBody('B');
    d.addBody('C');
    const islands = d.detectIslands();
    expect(islands.length).toBe(3);
  });

  it('connected bodies merge into one island', () => {
    const d = new IslandDetector();
    d.addBody('A');
    d.addBody('B');
    d.addBody('C');
    d.addConnection('A', 'B');
    d.addConnection('B', 'C');
    const islands = d.detectIslands();
    expect(islands.length).toBe(1);
    expect(islands[0].length).toBe(3);
  });

  it('two separate groups form two islands', () => {
    const d = new IslandDetector();
    d.addBody('A');
    d.addBody('B');
    d.addBody('C');
    d.addBody('D');
    d.addConnection('A', 'B');
    d.addConnection('C', 'D');
    const islands = d.detectIslands();
    expect(islands.length).toBe(2);
  });

  it('chain connections merge correctly', () => {
    const d = new IslandDetector();
    for (let i = 0; i < 5; i++) d.addBody(`B${i}`);
    d.addConnection('B0', 'B1');
    d.addConnection('B1', 'B2');
    d.addConnection('B2', 'B3');
    d.addConnection('B3', 'B4');
    const islands = d.detectIslands();
    expect(islands.length).toBe(1);
    expect(islands[0].length).toBe(5);
  });

  it('reset clears all state', () => {
    const d = new IslandDetector();
    d.addBody('A');
    d.addBody('B');
    d.addConnection('A', 'B');
    d.reset();
    const islands = d.detectIslands();
    expect(islands.length).toBe(0);
  });

  it('complex multi-island graph', () => {
    const d = new IslandDetector();
    // Island 1: A-B-C
    d.addBody('A');
    d.addBody('B');
    d.addBody('C');
    d.addConnection('A', 'B');
    d.addConnection('B', 'C');
    // Island 2: D-E
    d.addBody('D');
    d.addBody('E');
    d.addConnection('D', 'E');
    // Island 3: F alone
    d.addBody('F');
    const islands = d.detectIslands();
    expect(islands.length).toBe(3);
    const sizes = islands.map((i) => i.length).sort();
    expect(sizes).toEqual([1, 2, 3]);
  });
});
