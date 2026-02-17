import { describe, it, expect, beforeEach } from 'vitest';
import { LootTable, type LootEntry } from '../LootTable';

const entry = (id: string, weight = 10, rarity: 'common' | 'rare' = 'common', guaranteed = false, condition?: string): LootEntry => ({
  itemId: id, weight, rarity, minQuantity: 1, maxQuantity: 3, guaranteed, condition,
});

describe('LootTable', () => {
  let lt: LootTable;

  beforeEach(() => { lt = new LootTable(123); });

  it('addTable and getTable', () => {
    lt.addTable('goblin', [entry('gold')]);
    expect(lt.getTable('goblin')).toBeDefined();
    expect(lt.getTableCount()).toBe(1);
  });

  it('roll returns drops', () => {
    lt.addTable('goblin', [entry('gold', 10), entry('gem', 5, 'rare')]);
    const drops = lt.roll('goblin');
    expect(drops.length).toBeGreaterThan(0);
    expect(drops[0].itemId).toBeDefined();
    expect(drops[0].quantity).toBeGreaterThanOrEqual(1);
  });

  it('roll returns empty for unknown table', () => {
    expect(lt.roll('nope')).toEqual([]);
  });

  it('guaranteed drops always included', () => {
    lt.addTable('boss', [entry('trophy', 1, 'common', true), entry('junk', 100)]);
    const drops = lt.roll('boss');
    expect(drops.some(d => d.itemId === 'trophy')).toBe(true);
  });

  it('conditional drops skipped when condition false', () => {
    lt.addTable('chest', [entry('key', 100, 'common', false, 'has_quest')]);
    const drops = lt.roll('chest');
    // condition not set → defaults to false → filtered out from pool
    expect(drops.filter(d => d.itemId === 'key').length).toBe(0);
  });

  it('setCondition enables conditional drops', () => {
    lt.addTable('chest', [entry('key', 100, 'common', false, 'has_quest')]);
    lt.setCondition('has_quest', true);
    const drops = lt.roll('chest');
    expect(drops.some(d => d.itemId === 'key')).toBe(true);
  });

  it('pity counter tracks rolls', () => {
    lt.addTable('goblin', [entry('gold')]);
    lt.roll('goblin');
    // After rolling common, rare pity should increment
    expect(lt.getPityCounter('goblin', 'rare')).toBeGreaterThanOrEqual(0);
  });

  it('getDropRates computes percentages', () => {
    lt.addTable('t', [entry('a', 30), entry('b', 70)]);
    const rates = lt.getDropRates('t');
    expect(rates.get('a')).toBeCloseTo(30);
    expect(rates.get('b')).toBeCloseTo(70);
  });

  it('getDropRates returns empty for unknown', () => {
    expect(lt.getDropRates('nope').size).toBe(0);
  });

  it('reseed produces reproducible results', () => {
    lt.addTable('t', [entry('a', 50), entry('b', 50)]);
    lt.reseed(42);
    const drops1 = lt.roll('t');
    lt.reseed(42);
    const drops2 = lt.roll('t');
    expect(drops1.map(d => d.itemId)).toEqual(drops2.map(d => d.itemId));
  });

  it('drop quantity within range', () => {
    lt.addTable('t', [entry('a', 100)], 1, 1);
    const drops = lt.roll('t');
    for (const d of drops) {
      expect(d.quantity).toBeGreaterThanOrEqual(1);
      expect(d.quantity).toBeLessThanOrEqual(3);
    }
  });
});
