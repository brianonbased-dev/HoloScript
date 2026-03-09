import { describe, it, expect, beforeEach } from 'vitest';
import { IslandDetector } from '../physics/IslandDetector';

// =============================================================================
// C237 — Island Detector (DSU)
// =============================================================================

describe('IslandDetector', () => {
  let det: IslandDetector;
  beforeEach(() => {
    det = new IslandDetector();
  });

  it('single body forms one island', () => {
    det.addBody('a');
    const islands = det.detectIslands();
    expect(islands).toHaveLength(1);
    expect(islands[0]).toContain('a');
  });

  it('disconnected bodies form separate islands', () => {
    det.addBody('a');
    det.addBody('b');
    det.addBody('c');
    const islands = det.detectIslands();
    expect(islands).toHaveLength(3);
  });

  it('connected bodies merge into one island', () => {
    det.addBody('a');
    det.addBody('b');
    det.addConnection('a', 'b');
    const islands = det.detectIslands();
    expect(islands).toHaveLength(1);
    expect(islands[0]).toContain('a');
    expect(islands[0]).toContain('b');
  });

  it('chain connections form single island', () => {
    det.addBody('a');
    det.addBody('b');
    det.addBody('c');
    det.addBody('d');
    det.addConnection('a', 'b');
    det.addConnection('b', 'c');
    det.addConnection('c', 'd');
    const islands = det.detectIslands();
    expect(islands).toHaveLength(1);
    expect(islands[0]).toHaveLength(4);
  });

  it('two separate clusters form two islands', () => {
    det.addBody('a');
    det.addBody('b');
    det.addBody('c');
    det.addBody('d');
    det.addConnection('a', 'b');
    det.addConnection('c', 'd');
    const islands = det.detectIslands();
    expect(islands).toHaveLength(2);
  });

  it('star topology forms one island', () => {
    det.addBody('center');
    det.addBody('arm1');
    det.addBody('arm2');
    det.addBody('arm3');
    det.addConnection('center', 'arm1');
    det.addConnection('center', 'arm2');
    det.addConnection('center', 'arm3');
    const islands = det.detectIslands();
    expect(islands).toHaveLength(1);
    expect(islands[0]).toHaveLength(4);
  });

  it('reset clears everything', () => {
    det.addBody('a');
    det.addBody('b');
    det.addConnection('a', 'b');
    det.reset();
    const islands = det.detectIslands();
    expect(islands).toHaveLength(0);
  });

  it('redundant connections do not create extra islands', () => {
    det.addBody('a');
    det.addBody('b');
    det.addConnection('a', 'b');
    det.addConnection('b', 'a');
    det.addConnection('a', 'b');
    const islands = det.detectIslands();
    expect(islands).toHaveLength(1);
  });

  it('large graph with mixed connectivity', () => {
    for (let i = 0; i < 10; i++) det.addBody(`b${i}`);
    // Group 1: b0-b1-b2-b3
    det.addConnection('b0', 'b1');
    det.addConnection('b1', 'b2');
    det.addConnection('b2', 'b3');
    // Group 2: b4-b5
    det.addConnection('b4', 'b5');
    // b6-b9 are isolated
    const islands = det.detectIslands();
    expect(islands).toHaveLength(6); // 1 group of 4, 1 group of 2, 4 singles
  });
});
