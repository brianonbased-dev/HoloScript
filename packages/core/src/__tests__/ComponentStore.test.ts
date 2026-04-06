import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentStore } from '@holoscript/engine/ecs/ComponentStore';

// =============================================================================
// C251 — Component Store
// =============================================================================

interface Position {
  x: number;
  y: number;
  z: number;
}
interface Health {
  hp: number;
  maxHp: number;
}

describe('ComponentStore', () => {
  let store: ComponentStore;
  beforeEach(() => {
    store = new ComponentStore();
  });

  it('registerPool creates new pool', () => {
    store.registerPool<Position>('position');
    expect(store.hasPool('position')).toBe(true);
  });

  it('getPoolTypes lists registered pools', () => {
    store.registerPool('position');
    store.registerPool('health');
    expect(store.getPoolTypes()).toContain('position');
    expect(store.getPoolTypes()).toContain('health');
  });

  it('add stores component for entity', () => {
    expect(store.add('position', 1, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(store.has('position', 1)).toBe(true);
  });

  it('add returns false for duplicate', () => {
    store.add('position', 1, { x: 0, y: 0, z: 0 });
    expect(store.add('position', 1, { x: 1, y: 1, z: 1 })).toBe(false);
  });

  it('add auto-creates pool if needed', () => {
    store.add('velocity', 1, { vx: 0, vy: 0 });
    expect(store.hasPool('velocity')).toBe(true);
  });

  it('get retrieves stored data', () => {
    store.add<Position>('position', 1, { x: 5, y: 10, z: 15 });
    const pos = store.get<Position>('position', 1);
    expect(pos?.x).toBe(5);
    expect(pos?.y).toBe(10);
  });

  it('get returns undefined for missing', () => {
    expect(store.get('position', 999)).toBeUndefined();
  });

  it('remove deletes component', () => {
    store.add('hp', 1, { hp: 100 });
    expect(store.remove('hp', 1)).toBe(true);
    expect(store.has('hp', 1)).toBe(false);
  });

  it('set updates partial data', () => {
    store.add<Health>('health', 1, { hp: 100, maxHp: 100 });
    expect(store.set<Health>('health', 1, { hp: 50 })).toBe(true);
    expect(store.get<Health>('health', 1)?.hp).toBe(50);
    expect(store.get<Health>('health', 1)?.maxHp).toBe(100);
  });

  it('forEach iterates all entities with component', () => {
    store.add('position', 1, { x: 0 });
    store.add('position', 2, { x: 1 });
    const ids: number[] = [];
    store.forEach('position', (id) => ids.push(id));
    expect(ids).toContain(1);
    expect(ids).toContain(2);
  });

  it('getEntitiesWithComponent returns entity ids', () => {
    store.add('hp', 10, { hp: 100 });
    store.add('hp', 20, { hp: 200 });
    expect(store.getEntitiesWithComponent('hp')).toEqual(expect.arrayContaining([10, 20]));
  });

  it('getEntitiesWithAll returns intersection', () => {
    store.add('pos', 1, {});
    store.add('pos', 2, {});
    store.add('vel', 1, {});
    const result = store.getEntitiesWithAll('pos', 'vel');
    expect(result).toEqual([1]);
  });

  it('removeAllForEntity removes from all pools', () => {
    store.add('pos', 1, {});
    store.add('hp', 1, {});
    store.add('vel', 1, {});
    expect(store.removeAllForEntity(1)).toBe(3);
    expect(store.has('pos', 1)).toBe(false);
    expect(store.has('hp', 1)).toBe(false);
  });

  it('getComponentCount returns count for type', () => {
    store.add('pos', 1, {});
    store.add('pos', 2, {});
    expect(store.getComponentCount('pos')).toBe(2);
  });

  it('getTotalComponentCount sums all pools', () => {
    store.add('pos', 1, {});
    store.add('hp', 1, {});
    store.add('hp', 2, {});
    expect(store.getTotalComponentCount()).toBe(3);
  });

  it('clear with type clears only that pool', () => {
    store.add('pos', 1, {});
    store.add('hp', 1, {});
    store.clear('pos');
    expect(store.getComponentCount('pos')).toBe(0);
    expect(store.getComponentCount('hp')).toBe(1);
  });

  it('clear without type clears all pools', () => {
    store.add('pos', 1, {});
    store.add('hp', 1, {});
    store.clear();
    expect(store.getTotalComponentCount()).toBe(0);
  });
});
