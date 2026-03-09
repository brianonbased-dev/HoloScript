import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentStore } from '../ComponentStore';

describe('ComponentStore', () => {
  let store: ComponentStore;

  beforeEach(() => {
    store = new ComponentStore();
  });

  // ---------------------------------------------------------------------------
  // Pool Management
  // ---------------------------------------------------------------------------

  it('registerPool creates a named pool', () => {
    const pool = store.registerPool('transform');
    expect(pool.type).toBe('transform');
    expect(store.hasPool('transform')).toBe(true);
  });

  it('getPool returns undefined for unregistered', () => {
    expect(store.getPool('nope')).toBeUndefined();
  });

  it('getPoolTypes lists all pool names', () => {
    store.registerPool('a');
    store.registerPool('b');
    expect(store.getPoolTypes().sort()).toEqual(['a', 'b']);
  });

  // ---------------------------------------------------------------------------
  // Add / Get / Has / Remove
  // ---------------------------------------------------------------------------

  it('add stores component data for entity', () => {
    expect(store.add('pos', 1, { x: 10, y: 20 })).toBe(true);
    expect(store.get('pos', 1)).toEqual({ x: 10, y: 20 });
  });

  it('add returns false if entity already has component', () => {
    store.add('pos', 1, { x: 0 });
    expect(store.add('pos', 1, { x: 5 })).toBe(false);
  });

  it('add auto-creates pool if missing', () => {
    store.add('auto', 1, { val: 1 });
    expect(store.hasPool('auto')).toBe(true);
  });

  it('has returns correct state', () => {
    store.add('hp', 1, { val: 100 });
    expect(store.has('hp', 1)).toBe(true);
    expect(store.has('hp', 2)).toBe(false);
  });

  it('remove deletes component data', () => {
    store.add('hp', 1, { val: 50 });
    expect(store.remove('hp', 1)).toBe(true);
    expect(store.has('hp', 1)).toBe(false);
  });

  it('remove returns false when nothing to remove', () => {
    expect(store.remove('hp', 999)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Set (partial update)
  // ---------------------------------------------------------------------------

  it('set merges partial data into existing component', () => {
    store.add('pos', 1, { x: 0, y: 0, z: 0 });
    expect(store.set('pos', 1, { x: 5 })).toBe(true);
    expect(store.get('pos', 1)).toEqual({ x: 5, y: 0, z: 0 });
  });

  it('set returns false if entity or pool missing', () => {
    expect(store.set('pos', 1, { x: 5 })).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Iteration
  // ---------------------------------------------------------------------------

  it('forEach iterates all entities in a pool', () => {
    store.add('score', 1, { val: 10 });
    store.add('score', 2, { val: 20 });
    const entries: number[] = [];
    store.forEach<{ val: number }>('score', (id, d) => entries.push(d.val));
    expect(entries.sort()).toEqual([10, 20]);
  });

  it('forEach does nothing for missing pool', () => {
    store.forEach('nope', () => {
      throw new Error('should not run');
    });
  });

  // ---------------------------------------------------------------------------
  // Entity Queries
  // ---------------------------------------------------------------------------

  it('getEntitiesWithComponent returns entity ids', () => {
    store.add('a', 1, {});
    store.add('a', 2, {});
    expect(store.getEntitiesWithComponent('a').sort()).toEqual([1, 2]);
  });

  it('getEntitiesWithAll returns intersection', () => {
    store.add('a', 1, {});
    store.add('b', 1, {});
    store.add('a', 2, {});
    expect(store.getEntitiesWithAll('a', 'b')).toEqual([1]);
  });

  it('getEntitiesWithAll returns empty for no types', () => {
    expect(store.getEntitiesWithAll()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Bulk Operations
  // ---------------------------------------------------------------------------

  it('removeAllForEntity cleans all pools', () => {
    store.add('a', 1, {});
    store.add('b', 1, {});
    store.add('c', 1, {});
    expect(store.removeAllForEntity(1)).toBe(3);
    expect(store.has('a', 1)).toBe(false);
  });

  it('getComponentCount returns pool size', () => {
    store.add('hp', 1, {});
    store.add('hp', 2, {});
    expect(store.getComponentCount('hp')).toBe(2);
    expect(store.getComponentCount('nope')).toBe(0);
  });

  it('getTotalComponentCount sums all pools', () => {
    store.add('a', 1, {});
    store.add('b', 1, {});
    store.add('b', 2, {});
    expect(store.getTotalComponentCount()).toBe(3);
  });

  it('clear(type) clears specific pool', () => {
    store.add('a', 1, {});
    store.add('b', 1, {});
    store.clear('a');
    expect(store.getComponentCount('a')).toBe(0);
    expect(store.getComponentCount('b')).toBe(1);
  });

  it('clear() clears all pools', () => {
    store.add('a', 1, {});
    store.add('b', 1, {});
    store.clear();
    expect(store.getTotalComponentCount()).toBe(0);
  });
});
