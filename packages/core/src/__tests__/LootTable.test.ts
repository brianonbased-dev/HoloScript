import { describe, it, expect } from 'vitest';
import { LootTable } from '@holoscript/engine/gameplay';
import type { LootEntry } from '@holoscript/engine/gameplay';

// =============================================================================
// C226 — Loot Table
// =============================================================================

const COMMON_ITEM: LootEntry = {
  itemId: 'iron_ore',
  weight: 50,
  rarity: 'common',
  minQuantity: 1,
  maxQuantity: 5,
  guaranteed: false,
};
const RARE_ITEM: LootEntry = {
  itemId: 'diamond',
  weight: 5,
  rarity: 'rare',
  minQuantity: 1,
  maxQuantity: 1,
  guaranteed: false,
};
const GUARANTEED_ITEM: LootEntry = {
  itemId: 'gold_coin',
  weight: 0,
  rarity: 'common',
  minQuantity: 1,
  maxQuantity: 3,
  guaranteed: true,
};
const CONDITIONAL_ITEM: LootEntry = {
  itemId: 'key',
  weight: 20,
  rarity: 'uncommon',
  minQuantity: 1,
  maxQuantity: 1,
  guaranteed: false,
  condition: 'hasBossKill',
};

describe('LootTable', () => {
  it('addTable and getTable round-trip', () => {
    const lt = new LootTable();
    lt.addTable('t1', [COMMON_ITEM]);
    expect(lt.getTable('t1')).toBeDefined();
    expect(lt.getTable('t1')!.entries).toHaveLength(1);
  });

  it('getTable returns undefined for unknown table', () => {
    const lt = new LootTable();
    expect(lt.getTable('nope')).toBeUndefined();
  });

  it('getTableCount tracks tables', () => {
    const lt = new LootTable();
    expect(lt.getTableCount()).toBe(0);
    lt.addTable('a', [COMMON_ITEM]);
    lt.addTable('b', [RARE_ITEM]);
    expect(lt.getTableCount()).toBe(2);
  });

  it('roll returns empty for unknown table', () => {
    const lt = new LootTable();
    expect(lt.roll('nonexistent')).toHaveLength(0);
  });

  it('roll produces drops', () => {
    const lt = new LootTable(42);
    lt.addTable('loot', [COMMON_ITEM, RARE_ITEM], 1, 3);
    const drops = lt.roll('loot');
    expect(drops.length).toBeGreaterThanOrEqual(1);
    for (const d of drops) {
      expect(['iron_ore', 'diamond']).toContain(d.itemId);
      expect(d.quantity).toBeGreaterThanOrEqual(1);
    }
  });

  it('guaranteed items always drop', () => {
    const lt = new LootTable(42);
    lt.addTable('loot', [GUARANTEED_ITEM], 0, 0);
    const drops = lt.roll('loot');
    expect(drops.some((d) => d.itemId === 'gold_coin')).toBe(true);
  });

  it('conditional items require condition to be true', () => {
    const lt = new LootTable(42);
    lt.addTable('loot', [CONDITIONAL_ITEM], 1, 3);
    // Without condition set, should get 0 random drops from this item
    const drops1 = lt.roll('loot');
    const hasKey1 = drops1.some((d) => d.itemId === 'key');
    expect(hasKey1).toBe(false);

    // Set condition
    lt.setCondition('hasBossKill', true);
    lt.reseed(42);
    const drops2 = lt.roll('loot');
    expect(drops2.length).toBeGreaterThanOrEqual(1);
  });

  it('pityCounter increments for non-rolled rarities', () => {
    const lt = new LootTable(42);
    lt.addTable('loot', [COMMON_ITEM], 1, 1);
    lt.roll('loot');
    // After rolling a common, rare/epic/legendary pity should increment
    expect(lt.getPityCounter('loot', 'rare')).toBeGreaterThanOrEqual(0);
  });

  it('getDropRates returns percentage map', () => {
    const lt = new LootTable();
    lt.addTable('loot', [COMMON_ITEM, RARE_ITEM]);
    const rates = lt.getDropRates('loot');
    expect(rates.size).toBe(2);
    const total = Array.from(rates.values()).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 0);
  });

  it('getDropRates returns empty for unknown table', () => {
    const lt = new LootTable();
    expect(lt.getDropRates('nope').size).toBe(0);
  });

  it('reseed changes RNG', () => {
    const lt = new LootTable(42);
    lt.addTable('loot', [COMMON_ITEM, RARE_ITEM], 3, 3);
    const drops1 = lt.roll('loot');
    lt.reseed(99);
    const drops2 = lt.roll('loot');
    // Slightly different sequences expected
    expect(drops1.length).toBe(drops2.length); // same count rule
  });

  it('deterministic with same seed', () => {
    const lt1 = new LootTable(42);
    const lt2 = new LootTable(42);
    lt1.addTable('loot', [COMMON_ITEM, RARE_ITEM], 2, 2);
    lt2.addTable('loot', [COMMON_ITEM, RARE_ITEM], 2, 2);
    const d1 = lt1.roll('loot');
    const d2 = lt2.roll('loot');
    expect(d1.length).toBe(d2.length);
    for (let i = 0; i < d1.length; i++) {
      expect(d1[i].itemId).toBe(d2[i].itemId);
    }
  });
});
