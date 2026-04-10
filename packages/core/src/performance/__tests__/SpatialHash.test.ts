import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialHash } from '../SpatialHash';

describe('SpatialHash', () => {
  let hash: SpatialHash;

  beforeEach(() => {
    hash = new SpatialHash(5);
  });

  it('starts empty', () => {
    expect(hash.count).toBe(0);
  });

  it('inserts an entity', () => {
    hash.insert({ id: 'a', x: 1, y: 2, z: 3 });
    expect(hash.count).toBe(1);
  });

  it('removes an entity', () => {
    hash.insert({ id: 'a', x: 1, y: 2, z: 3 });
    hash.remove('a');
    expect(hash.count).toBe(0);
  });

  it('remove on non-existent id does nothing', () => {
    hash.remove('nonexistent');
    expect(hash.count).toBe(0);
  });

  it('queries entities within radius', () => {
    hash.insert({ id: 'a', x: 0, y: 0, z: 0 });
    hash.insert({ id: 'b', x: 3, y: 0, z: 0 });
    hash.insert({ id: 'c', x: 100, y: 0, z: 0 });

    const nearby = hash.queryRadius(0, 0, 0, 5);
    const ids = nearby.map((e) => e.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).not.toContain('c');
  });

  it('respects entity radius in query', () => {
    hash.insert({ id: 'big', x: 8, y: 0, z: 0, radius: 5 });
    const results = hash.queryRadius(0, 0, 0, 4);
    // Distance 8, but entity radius 5 + query radius 4 = 9 > 8 → should match
    expect(results.some((e) => e.id === 'big')).toBe(true);
  });

  it('does not duplicate results for multi-cell entities', () => {
    hash.insert({ id: 'big', x: 0, y: 0, z: 0, radius: 10 });
    const results = hash.queryRadius(0, 0, 0, 15);
    const ids = results.filter((e) => e.id === 'big');
    expect(ids).toHaveLength(1);
  });

  it('updates entity position on re-insert', () => {
    hash.insert({ id: 'a', x: 0, y: 0, z: 0 });
    hash.insert({ id: 'a', x: 50, y: 0, z: 0 });
    expect(hash.count).toBe(1);

    const nearOld = hash.queryRadius(0, 0, 0, 2);
    expect(nearOld.some((e) => e.id === 'a')).toBe(false);

    const nearNew = hash.queryRadius(50, 0, 0, 2);
    expect(nearNew.some((e) => e.id === 'a')).toBe(true);
  });

  it('clears all entities', () => {
    hash.insert({ id: 'a', x: 0, y: 0, z: 0 });
    hash.insert({ id: 'b', x: 1, y: 0, z: 0 });
    hash.clear();
    expect(hash.count).toBe(0);
    expect(hash.queryRadius(0, 0, 0, 100)).toHaveLength(0);
  });

  it('works with different cell sizes', () => {
    const smallHash = new SpatialHash(1);
    smallHash.insert({ id: 'a', x: 0.5, y: 0, z: 0 });
    smallHash.insert({ id: 'b', x: 1.5, y: 0, z: 0 });
    expect(smallHash.queryRadius(0, 0, 0, 1)).toHaveLength(1);
  });
});
