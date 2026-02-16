import { describe, it, expect, beforeEach } from 'vitest';
import { OctreeSystem } from '../spatial/OctreeSystem';

describe('OctreeSystem', () => {
  let oct: OctreeSystem;

  beforeEach(() => { oct = new OctreeSystem(0, 0, 0, 50); });

  it('insert adds an entry and increments count', () => {
    expect(oct.insert({ id: 'a', x: 1, y: 2, z: 3, radius: 1 })).toBe(true);
    expect(oct.getEntryCount()).toBe(1);
  });

  it('insert rejects out-of-bounds entries', () => {
    expect(oct.insert({ id: 'far', x: 200, y: 0, z: 0, radius: 1 })).toBe(false);
    expect(oct.getEntryCount()).toBe(0);
  });

  it('remove deletes an entry by id', () => {
    oct.insert({ id: 'a', x: 1, y: 2, z: 3, radius: 1 });
    expect(oct.remove('a')).toBe(true);
    expect(oct.getEntryCount()).toBe(0);
  });

  it('remove returns false for unknown id', () => {
    expect(oct.remove('nope')).toBe(false);
  });

  it('queryRadius finds entries within range', () => {
    oct.insert({ id: 'a', x: 5, y: 0, z: 0, radius: 1 });
    oct.insert({ id: 'b', x: 40, y: 0, z: 0, radius: 1 });
    const results = oct.queryRadius(0, 0, 0, 10);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('a');
  });

  it('queryRadius returns empty when nothing in range', () => {
    oct.insert({ id: 'a', x: 40, y: 40, z: 40, radius: 1 });
    expect(oct.queryRadius(0, 0, 0, 5).length).toBe(0);
  });

  it('queryRadius considers entry radius', () => {
    oct.insert({ id: 'big', x: 12, y: 0, z: 0, radius: 5 });
    // distance 12, entry radius 5, query radius 8 => 12 <= 8+5=13 => in range
    const results = oct.queryRadius(0, 0, 0, 8);
    expect(results.length).toBe(1);
  });

  it('handles many inserts triggering subdivision', () => {
    for (let i = 0; i < 20; i++) {
      oct.insert({ id: `e${i}`, x: (i % 5) * 5 - 10, y: Math.floor(i / 5) * 5 - 10, z: 0, radius: 0.5 });
    }
    expect(oct.getEntryCount()).toBe(20);
    const results = oct.queryRadius(0, 0, 0, 100);
    expect(results.length).toBe(20);
  });

  it('clear resets the octree', () => {
    oct.insert({ id: 'a', x: 1, y: 2, z: 3, radius: 1 });
    oct.insert({ id: 'b', x: -1, y: -2, z: -3, radius: 1 });
    oct.clear();
    expect(oct.getEntryCount()).toBe(0);
    expect(oct.queryRadius(0, 0, 0, 100).length).toBe(0);
  });

  it('inserts multiple entries at same position', () => {
    oct.insert({ id: 'a', x: 0, y: 0, z: 0, radius: 1 });
    oct.insert({ id: 'b', x: 0, y: 0, z: 0, radius: 1 });
    expect(oct.getEntryCount()).toBe(2);
  });

  it('queryRadius works in 3D with diagonal entries', () => {
    oct.insert({ id: 'diag', x: 5, y: 5, z: 5, radius: 0 });
    const dist = Math.sqrt(75); // ~8.66
    expect(oct.queryRadius(0, 0, 0, 9).length).toBe(1);
    expect(oct.queryRadius(0, 0, 0, 8).length).toBe(0);
  });
});
