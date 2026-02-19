/**
 * ComponentStore — Production Test Suite
 *
 * Covers: registerPool, getPool, hasPool, getPoolTypes,
 * add/remove/get/has/set, forEach, getEntitiesWithComponent,
 * getEntitiesWithAll, removeAllForEntity, counts, clear.
 */
import { describe, it, expect, vi } from 'vitest';
import { ComponentStore } from '../ComponentStore';

describe('ComponentStore — Production', () => {
  // ─── Pool Management ──────────────────────────────────────────────
  it('registerPool creates a new pool', () => {
    const cs = new ComponentStore();
    const pool = cs.registerPool('position');
    expect(pool.type).toBe('position');
    expect(cs.hasPool('position')).toBe(true);
  });

  it('getPool returns pool or undefined', () => {
    const cs = new ComponentStore();
    expect(cs.getPool('nope')).toBeUndefined();
    cs.registerPool('vel');
    expect(cs.getPool('vel')).toBeDefined();
  });

  it('getPoolTypes lists all registered types', () => {
    const cs = new ComponentStore();
    cs.registerPool('a');
    cs.registerPool('b');
    expect(cs.getPoolTypes()).toEqual(expect.arrayContaining(['a', 'b']));
  });

  // ─── CRUD ─────────────────────────────────────────────────────────
  it('add stores component for entity', () => {
    const cs = new ComponentStore();
    expect(cs.add('pos', 1, { x: 10 })).toBe(true);
    expect(cs.has('pos', 1)).toBe(true);
    expect(cs.get('pos', 1)).toEqual({ x: 10 });
  });

  it('add returns false for duplicate', () => {
    const cs = new ComponentStore();
    cs.add('pos', 1, { x: 0 });
    expect(cs.add('pos', 1, { x: 99 })).toBe(false);
  });

  it('remove deletes component', () => {
    const cs = new ComponentStore();
    cs.add('pos', 1, { x: 0 });
    expect(cs.remove('pos', 1)).toBe(true);
    expect(cs.has('pos', 1)).toBe(false);
  });

  it('remove returns false for missing', () => {
    const cs = new ComponentStore();
    expect(cs.remove('pos', 999)).toBe(false);
  });

  it('set merges partial data', () => {
    const cs = new ComponentStore();
    cs.add('pos', 1, { x: 0, y: 0 });
    expect(cs.set('pos', 1, { y: 5 })).toBe(true);
    expect(cs.get('pos', 1)).toEqual({ x: 0, y: 5 });
  });

  it('set returns false for missing pool/entity', () => {
    const cs = new ComponentStore();
    expect(cs.set('pos', 1, { x: 0 })).toBe(false);
  });

  // ─── Iteration ────────────────────────────────────────────────────
  it('forEach iterates all entities in pool', () => {
    const cs = new ComponentStore();
    cs.add('pos', 1, { x: 1 });
    cs.add('pos', 2, { x: 2 });
    const cb = vi.fn();
    cs.forEach('pos', cb);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('getEntitiesWithComponent returns entity IDs', () => {
    const cs = new ComponentStore();
    cs.add('pos', 10, { x: 0 });
    cs.add('pos', 20, { x: 0 });
    expect(cs.getEntitiesWithComponent('pos')).toEqual(expect.arrayContaining([10, 20]));
  });

  it('getEntitiesWithAll returns intersection', () => {
    const cs = new ComponentStore();
    cs.add('pos', 1, { x: 0 });
    cs.add('vel', 1, { vx: 0 });
    cs.add('pos', 2, { x: 0 });
    expect(cs.getEntitiesWithAll('pos', 'vel')).toEqual([1]);
  });

  // ─── Bulk Ops ─────────────────────────────────────────────────────
  it('removeAllForEntity clears all pools for entity', () => {
    const cs = new ComponentStore();
    cs.add('pos', 1, { x: 0 });
    cs.add('vel', 1, { vx: 0 });
    expect(cs.removeAllForEntity(1)).toBe(2);
    expect(cs.has('pos', 1)).toBe(false);
  });

  it('getComponentCount and getTotalComponentCount work', () => {
    const cs = new ComponentStore();
    cs.add('pos', 1, { x: 0 });
    cs.add('pos', 2, { x: 0 });
    cs.add('vel', 1, { vx: 0 });
    expect(cs.getComponentCount('pos')).toBe(2);
    expect(cs.getTotalComponentCount()).toBe(3);
  });

  it('clear removes all data from specified or all pools', () => {
    const cs = new ComponentStore();
    cs.add('pos', 1, { x: 0 });
    cs.add('vel', 1, { vx: 0 });
    cs.clear('pos');
    expect(cs.getComponentCount('pos')).toBe(0);
    expect(cs.getComponentCount('vel')).toBe(1);
    cs.clear();
    expect(cs.getTotalComponentCount()).toBe(0);
  });
});
