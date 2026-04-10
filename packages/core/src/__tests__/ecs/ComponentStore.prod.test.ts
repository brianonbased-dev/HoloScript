/**
 * ComponentStore Production Tests
 *
 * Covers: registerPool/getPool/hasPool/getPoolTypes, add/remove/get/has/set,
 * forEach iteration, getEntitiesWithComponent, getEntitiesWithAll (intersection),
 * removeAllForEntity, getComponentCount, getTotalComponentCount, clear.
 */

import { describe, it, expect } from 'vitest';
import { ComponentStore } from '@holoscript/engine/ecs/ComponentStore';

function makeCS() {
  return new ComponentStore();
}

// ── pool management ───────────────────────────────────────────────────────────

describe('ComponentStore — pool management', () => {
  it('registerPool creates a typed pool', () => {
    const cs = makeCS();
    const pool = cs.registerPool<{ x: number }>('Position');
    expect(pool.type).toBe('Position');
    expect(pool.data).toBeDefined();
  });

  it('getPool returns undefined for unregistered type', () => {
    const cs = makeCS();
    expect(cs.getPool('Unknown')).toBeUndefined();
  });

  it('hasPool returns true after registerPool', () => {
    const cs = makeCS();
    cs.registerPool('Mesh');
    expect(cs.hasPool('Mesh')).toBe(true);
  });

  it('hasPool returns false for unregistered type', () => {
    const cs = makeCS();
    expect(cs.hasPool('Ghost')).toBe(false);
  });

  it('getPoolTypes lists all registered pools', () => {
    const cs = makeCS();
    cs.registerPool('A');
    cs.registerPool('B');
    const types = cs.getPoolTypes();
    expect(types).toContain('A');
    expect(types).toContain('B');
  });
});

// ── add ───────────────────────────────────────────────────────────────────────

describe('ComponentStore — add', () => {
  it('add returns true and stores component', () => {
    const cs = makeCS();
    expect(cs.add('Transform', 1, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(cs.get('Transform', 1)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('add auto-creates pool if not pre-registered', () => {
    const cs = makeCS();
    cs.add('Health', 5, { hp: 100 });
    expect(cs.hasPool('Health')).toBe(true);
  });

  it('add returns false when component already exists for entity', () => {
    const cs = makeCS();
    cs.add('Tag', 1, { name: 'A' });
    expect(cs.add('Tag', 1, { name: 'B' })).toBe(false);
  });

  it('add keeps original data when dupe is rejected', () => {
    const cs = makeCS();
    cs.add('Tag', 1, { name: 'A' });
    cs.add('Tag', 1, { name: 'B' });
    expect(cs.get('Tag', 1)).toEqual({ name: 'A' });
  });
});

// ── remove / has ──────────────────────────────────────────────────────────────

describe('ComponentStore — remove / has', () => {
  it('has returns true after add', () => {
    const cs = makeCS();
    cs.add('X', 1, { v: 1 });
    expect(cs.has('X', 1)).toBe(true);
  });

  it('has returns false for unknown entity', () => {
    const cs = makeCS();
    expect(cs.has('X', 999)).toBe(false);
  });

  it('remove returns true and component is gone', () => {
    const cs = makeCS();
    cs.add('Y', 2, { v: 42 });
    expect(cs.remove('Y', 2)).toBe(true);
    expect(cs.has('Y', 2)).toBe(false);
  });

  it('remove returns false for unknown type', () => {
    const cs = makeCS();
    expect(cs.remove('NoPool', 1)).toBe(false);
  });

  it('remove returns false for unknown entity in existing pool', () => {
    const cs = makeCS();
    cs.registerPool('Z');
    expect(cs.remove('Z', 99)).toBe(false);
  });
});

// ── get / set ─────────────────────────────────────────────────────────────────

describe('ComponentStore — get / set', () => {
  it('get returns undefined for missing component', () => {
    const cs = makeCS();
    expect(cs.get('HP', 1)).toBeUndefined();
  });

  it('set merges partial data', () => {
    const cs = makeCS();
    cs.add('Stats', 1, { hp: 100, mp: 50 });
    cs.set('Stats', 1, { hp: 80 });
    expect(cs.get('Stats', 1)).toEqual({ hp: 80, mp: 50 });
  });

  it('set returns false for unknown pool', () => {
    const cs = makeCS();
    expect(cs.set('NoPool', 1, {})).toBe(false);
  });

  it('set returns false for missing entity', () => {
    const cs = makeCS();
    cs.registerPool('Mesh');
    expect(cs.set('Mesh', 99, { visible: true })).toBe(false);
  });
});

// ── forEach ───────────────────────────────────────────────────────────────────

describe('ComponentStore — forEach', () => {
  it('iterates over all components in pool', () => {
    const cs = makeCS();
    cs.add('Pos', 1, { x: 1 });
    cs.add('Pos', 2, { x: 2 });
    const seen: number[] = [];
    cs.forEach('Pos', (id) => seen.push(id));
    expect(seen).toContain(1);
    expect(seen).toContain(2);
  });

  it('forEach on unknown pool does not throw', () => {
    const cs = makeCS();
    expect(() => cs.forEach('Ghost', () => {})).not.toThrow();
  });
});

// ── getEntitiesWithComponent ──────────────────────────────────────────────────

describe('ComponentStore — getEntitiesWithComponent', () => {
  it('returns entity ids in pool', () => {
    const cs = makeCS();
    cs.add('Light', 10, { intensity: 1 });
    cs.add('Light', 20, { intensity: 2 });
    const ids = cs.getEntitiesWithComponent('Light');
    expect(ids).toContain(10);
    expect(ids).toContain(20);
  });

  it('returns empty array for unknown type', () => {
    const cs = makeCS();
    expect(cs.getEntitiesWithComponent('UnknownPool')).toHaveLength(0);
  });
});

// ── getEntitiesWithAll ────────────────────────────────────────────────────────

describe('ComponentStore — getEntitiesWithAll', () => {
  it('returns entities with all listed components', () => {
    const cs = makeCS();
    cs.add('A', 1, {});
    cs.add('B', 1, {});
    cs.add('A', 2, {}); // B missing for entity 2
    const result = cs.getEntitiesWithAll('A', 'B');
    expect(result).toContain(1);
    expect(result).not.toContain(2);
  });

  it('returns empty array for zero types', () => {
    const cs = makeCS();
    cs.add('X', 1, {});
    expect(cs.getEntitiesWithAll()).toHaveLength(0);
  });

  it('returns empty array when first component pool is missing', () => {
    const cs = makeCS();
    expect(cs.getEntitiesWithAll('Ghost')).toHaveLength(0);
  });
});

// ── removeAllForEntity ────────────────────────────────────────────────────────

describe('ComponentStore — removeAllForEntity', () => {
  it('removes all components for given entity across pools', () => {
    const cs = makeCS();
    cs.add('Transform', 5, {});
    cs.add('Mesh', 5, {});
    cs.add('Physics', 5, {});
    const count = cs.removeAllForEntity(5);
    expect(count).toBe(3);
    expect(cs.has('Transform', 5)).toBe(false);
    expect(cs.has('Mesh', 5)).toBe(false);
  });

  it('returns 0 when entity has no components', () => {
    const cs = makeCS();
    cs.registerPool('P'); // pool exists but no entity 99
    expect(cs.removeAllForEntity(99)).toBe(0);
  });
});

// ── counts ────────────────────────────────────────────────────────────────────

describe('ComponentStore — counts', () => {
  it('getComponentCount returns count for a specific pool', () => {
    const cs = makeCS();
    cs.add('M', 1, {});
    cs.add('M', 2, {});
    expect(cs.getComponentCount('M')).toBe(2);
  });

  it('getComponentCount returns 0 for unknown pool', () => {
    const cs = makeCS();
    expect(cs.getComponentCount('Unknown')).toBe(0);
  });

  it('getTotalComponentCount sums all pools', () => {
    const cs = makeCS();
    cs.add('A', 1, {});
    cs.add('A', 2, {});
    cs.add('B', 1, {});
    expect(cs.getTotalComponentCount()).toBe(3);
  });
});

// ── clear ─────────────────────────────────────────────────────────────────────

describe('ComponentStore — clear', () => {
  it('clear(type) removes all entries in that pool', () => {
    const cs = makeCS();
    cs.add('X', 1, {});
    cs.add('X', 2, {});
    cs.clear('X');
    expect(cs.getComponentCount('X')).toBe(0);
  });

  it('clear() clears all pools', () => {
    const cs = makeCS();
    cs.add('A', 1, {});
    cs.add('B', 2, {});
    cs.clear();
    expect(cs.getTotalComponentCount()).toBe(0);
  });
});
