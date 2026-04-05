import { describe, it, expect, beforeEach } from 'vitest';
import { IslandDetector } from '@holoscript/core';

describe('IslandDetector', () => {
  let det: IslandDetector;

  beforeEach(() => {
    det = new IslandDetector();
  });

  it('no bodies → no islands', () => {
    expect(det.detectIslands()).toEqual([]);
  });

  it('isolated bodies → one island per body', () => {
    det.addBody('a');
    det.addBody('b');
    det.addBody('c');
    const islands = det.detectIslands();
    expect(islands.length).toBe(3);
  });

  it('connected bodies form single island', () => {
    det.addBody('a');
    det.addBody('b');
    det.addBody('c');
    det.addConnection('a', 'b');
    det.addConnection('b', 'c');
    const islands = det.detectIslands();
    expect(islands.length).toBe(1);
    expect(islands[0].sort()).toEqual(['a', 'b', 'c']);
  });

  it('two disconnected groups form two islands', () => {
    det.addBody('a');
    det.addBody('b');
    det.addBody('x');
    det.addBody('y');
    det.addConnection('a', 'b');
    det.addConnection('x', 'y');
    const islands = det.detectIslands();
    expect(islands.length).toBe(2);
  });

  it('chain connection merges all into one island', () => {
    det.addBody('a');
    det.addBody('b');
    det.addBody('c');
    det.addBody('d');
    det.addConnection('a', 'b');
    det.addConnection('c', 'd');
    det.addConnection('b', 'c');
    const islands = det.detectIslands();
    expect(islands.length).toBe(1);
    expect(islands[0].length).toBe(4);
  });

  it('reset clears state', () => {
    det.addBody('a');
    det.addBody('b');
    det.addConnection('a', 'b');
    det.reset();
    expect(det.detectIslands()).toEqual([]);
  });

  it('single body forms single island', () => {
    det.addBody('solo');
    const islands = det.detectIslands();
    expect(islands.length).toBe(1);
    expect(islands[0]).toEqual(['solo']);
  });

  it('star topology (central hub) forms one island', () => {
    det.addBody('hub');
    for (let i = 0; i < 5; i++) {
      det.addBody(`spoke_${i}`);
      det.addConnection('hub', `spoke_${i}`);
    }
    const islands = det.detectIslands();
    expect(islands.length).toBe(1);
    expect(islands[0].length).toBe(6);
  });

  it('multiple identical connections still form one island', () => {
    det.addBody('a');
    det.addBody('b');
    det.addConnection('a', 'b');
    det.addConnection('a', 'b');
    det.addConnection('b', 'a');
    const islands = det.detectIslands();
    expect(islands.length).toBe(1);
  });
});

