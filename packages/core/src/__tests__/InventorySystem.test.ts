import { describe, it, expect, beforeEach } from 'vitest';
import { InventorySystem, type ItemDef } from '@holoscript/engine/gameplay';

// =============================================================================
// C302 — InventorySystem
// =============================================================================

function item(overrides: Partial<ItemDef> = {}): ItemDef {
  return {
    id: 'sword',
    name: 'Iron Sword',
    category: 'weapon',
    rarity: 'common',
    weight: 3,
    maxStack: 1,
    value: 100,
    properties: {},
    ...overrides,
  };
}

describe('InventorySystem', () => {
  let inv: InventorySystem;
  beforeEach(() => {
    inv = new InventorySystem(10, 50);
  });

  it('adds an item and tracks slot count', () => {
    inv.addItem(item());
    expect(inv.getSlotCount()).toBe(1);
    expect(inv.hasItem('sword')).toBe(true);
  });

  it('stacks items up to maxStack', () => {
    inv.addItem(item({ id: 'arrow', name: 'Arrow', maxStack: 64, weight: 0.1 }), 100);
    // 64 in slot 0, 36 in slot 1
    expect(inv.getSlotCount()).toBe(2);
    expect(inv.getItemCount('arrow')).toBe(100);
  });

  it('respects weight limit', () => {
    // Each weighs 10, max is 50 → can fit 5
    const result = inv.addItem(item({ id: 'stone', maxStack: 99, weight: 10 }), 8);
    expect(result.added).toBe(5);
    expect(result.remaining).toBe(3);
  });

  it('respects max slots', () => {
    for (let i = 0; i < 10; i++) {
      inv.addItem(item({ id: `item${i}`, weight: 0.1 }));
    }
    expect(inv.isFull()).toBe(true);
    const r = inv.addItem(item({ id: 'extra', weight: 0.1 }));
    expect(r.added).toBe(0);
  });

  it('removes items and frees weight', () => {
    inv.addItem(item({ id: 'potion', maxStack: 10, weight: 0.5 }), 5);
    const removed = inv.removeItem('potion', 3);
    expect(removed).toBe(3);
    expect(inv.getItemCount('potion')).toBe(2);
    expect(inv.getCurrentWeight()).toBeCloseTo(1.0);
  });

  it('transfers items between inventories', () => {
    const other = new InventorySystem(10, 50);
    inv.addItem(item({ id: 'gem', maxStack: 10, weight: 1 }), 5);
    const transferred = inv.transfer(other, 'gem', 3);
    expect(transferred).toBe(3);
    expect(inv.getItemCount('gem')).toBe(2);
    expect(other.getItemCount('gem')).toBe(3);
  });

  it('getByCategory filters items', () => {
    inv.addItem(item({ id: 'a', category: 'weapon', weight: 1 }));
    inv.addItem(item({ id: 'b', category: 'consumable', weight: 1 }));
    inv.addItem(item({ id: 'c', category: 'weapon', weight: 1 }));
    const weapons = inv.getByCategory('weapon');
    expect(weapons.length).toBe(2);
  });

  it('sorts by rarity (descending)', () => {
    inv.addItem(item({ id: 'a', name: 'Common', rarity: 'common', weight: 1 }));
    inv.addItem(item({ id: 'b', name: 'Epic', rarity: 'epic', weight: 1 }));
    inv.addItem(item({ id: 'c', name: 'Rare', rarity: 'rare', weight: 1 }));
    inv.sort('rarity');
    const all = inv.getAllItems();
    expect(all[0].item.rarity).toBe('epic');
    expect(all[1].item.rarity).toBe('rare');
    expect(all[2].item.rarity).toBe('common');
  });

  it('sorts by name (alphabetical)', () => {
    inv.addItem(item({ id: 'c', name: 'Zephyr', weight: 1 }));
    inv.addItem(item({ id: 'a', name: 'Alpha', weight: 1 }));
    inv.sort('name');
    const all = inv.getAllItems();
    expect(all[0].item.name).toBe('Alpha');
    expect(all[1].item.name).toBe('Zephyr');
  });

  it('remove clears empty slots', () => {
    inv.addItem(item({ id: 'x', weight: 1, maxStack: 5 }), 3);
    inv.removeItem('x', 3);
    expect(inv.getSlotCount()).toBe(0);
  });

  it('getCurrentWeight tracks weight accurately', () => {
    inv.addItem(item({ id: 'a', weight: 2.5, maxStack: 10 }), 4);
    expect(inv.getCurrentWeight()).toBeCloseTo(10);
  });
});
