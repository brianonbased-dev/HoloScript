import { describe, it, expect, beforeEach } from 'vitest';
import { OctreeSystem } from '../OctreeSystem';

describe('OctreeSystem', () => {
  let tree: OctreeSystem;

  beforeEach(() => {
    tree = new OctreeSystem(0, 0, 0, 100);
  });

  it('insert and getEntryCount', () => {
    tree.insert({ id: 'a', x: 0, y: 0, z: 0, radius: 1 });
    expect(tree.getEntryCount()).toBe(1);
  });

  it('insert multiple entries', () => {
    for (let i = 0; i < 20; i++) {
      tree.insert({ id: `e${i}`, x: i * 5 - 50, y: 0, z: 0, radius: 1 });
    }
    expect(tree.getEntryCount()).toBe(20);
  });

  it('insert outside bounds returns false', () => {
    expect(tree.insert({ id: 'far', x: 999, y: 999, z: 999, radius: 1 })).toBe(false);
    expect(tree.getEntryCount()).toBe(0);
  });

  it('remove by id', () => {
    tree.insert({ id: 'a', x: 0, y: 0, z: 0, radius: 1 });
    expect(tree.remove('a')).toBe(true);
    expect(tree.getEntryCount()).toBe(0);
  });

  it('remove non-existent returns false', () => {
    expect(tree.remove('nope')).toBe(false);
  });

  it('queryRadius finds entries in range', () => {
    tree.insert({ id: 'near', x: 1, y: 0, z: 0, radius: 0.5 });
    tree.insert({ id: 'far', x: 90, y: 0, z: 0, radius: 0.5 });
    const results = tree.queryRadius(0, 0, 0, 5);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('near');
  });

  it('queryRadius returns empty when nothing nearby', () => {
    tree.insert({ id: 'a', x: 50, y: 50, z: 50, radius: 1 });
    expect(tree.queryRadius(-50, -50, -50, 1)).toHaveLength(0);
  });

  it('queryRadius respects entry radius', () => {
    tree.insert({ id: 'big', x: 10, y: 0, z: 0, radius: 5 });
    const results = tree.queryRadius(0, 0, 0, 6); // 6+5=11 > 10 distance
    expect(results).toHaveLength(1);
  });

  it('clear empties the tree', () => {
    tree.insert({ id: 'a', x: 0, y: 0, z: 0, radius: 1 });
    tree.insert({ id: 'b', x: 1, y: 0, z: 0, radius: 1 });
    tree.clear();
    expect(tree.getEntryCount()).toBe(0);
    expect(tree.queryRadius(0, 0, 0, 100)).toHaveLength(0);
  });

  it('handles many objects triggering subdivision', () => {
    for (let i = 0; i < 100; i++) {
      tree.insert({
        id: `o${i}`,
        x: (i % 10) * 10 - 45,
        y: Math.floor(i / 10) * 10 - 45,
        z: 0,
        radius: 1,
      });
    }
    expect(tree.getEntryCount()).toBe(100);
    const results = tree.queryRadius(0, 0, 0, 15);
    expect(results.length).toBeGreaterThan(0);
  });
});
