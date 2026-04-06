import { describe, it, expect, beforeEach } from 'vitest';
import { IslandDetector } from '@holoscript/engine/physics/IslandDetector';

describe('IslandDetector - Phase 17 (Mass Physics)', () => {
  let detector: IslandDetector;

  beforeEach(() => {
    detector = new IslandDetector();
  });

  it('should group connected bodies into a single island', () => {
    detector.addBody('a');
    detector.addBody('b');
    detector.addBody('c');

    // a connected to b
    detector.addConnection('a', 'b');

    const islands = detector.detectIslands();

    // Expect two islands: [a, b] and [c]
    expect(islands).toHaveLength(2);
    const sortedIslands = islands.map((i) => i.sort()).sort((a, b) => a.length - b.length);
    expect(sortedIslands[0]).toEqual(['c']);
    expect(sortedIslands[1]).toEqual(['a', 'b']);
  });

  it('should handle complex connectivity chains', () => {
    detector.addBody('a');
    detector.addBody('b');
    detector.addBody('c');
    detector.addBody('d');

    detector.addConnection('a', 'b');
    detector.addConnection('b', 'c');
    detector.addConnection('c', 'd');

    const islands = detector.detectIslands();

    // All should be in one island
    expect(islands).toHaveLength(1);
    expect(islands[0]).toHaveLength(4);
    expect(islands[0]).toContain('a');
    expect(islands[0]).toContain('d');
  });

  it('should handle disjoint sets correctly', () => {
    detector.addBody('1');
    detector.addBody('2');
    detector.addBody('3');
    detector.addBody('4');

    detector.addConnection('1', '2');
    detector.addConnection('3', '4');

    const islands = detector.detectIslands();

    expect(islands).toHaveLength(2);
    expect(islands.every((i) => i.length === 2)).toBe(true);
  });

  it('should handle empty connections', () => {
    detector.addBody('a');
    detector.addBody('b');

    const islands = detector.detectIslands();
    expect(islands).toHaveLength(2);
  });

  it('should be efficient with large number of bodies (stress test)', () => {
    const count = 1000;
    for (let i = 0; i < count; i++) {
      detector.addBody(i.toString());
      if (i > 0) {
        detector.addConnection(i.toString(), (i - 1).toString());
      }
    }

    const start = Date.now();
    const islands = detector.detectIslands();
    const end = Date.now();

    expect(islands).toHaveLength(1);
    expect(islands[0]).toHaveLength(count);
    expect(end - start).toBeLessThan(50); // Should be very fast (<50ms for 1000 bodies)
  });
});
