import { describe, it, expect, beforeEach } from 'vitest';
import { InventorySystem, ItemDef } from '../InventorySystem';

function item(id: string, overrides: Partial<ItemDef> = {}): ItemDef {
  return {
    id,
    name: id,
    category: 'misc',
    rarity: 'common',
    weight: 1,
    maxStack: 10,
    value: 5,
    properties: {},
    ...overrides,
  };
}

describe('InventorySystem', () => {
  let inv: InventorySystem;
  beforeEach(() => {
    inv = new InventorySystem(10, 50);
  });

  // --- Add ---
  it('addItem creates a slot', () => {
    const r = inv.addItem(item('sword', { maxStack: 1 }));
    expect(r.added).toBe(1);
    expect(r.remaining).toBe(0);
    expect(inv.getSlotCount()).toBe(1);
  });

  it('addItem stacks items', () => {
    inv.addItem(item('arrow'), 5);
    inv.addItem(item('arrow'), 3);
    expect(inv.getItemCount('arrow')).toBe(8);
    expect(inv.getSlotCount()).toBe(1);
  });

  it('addItem respects maxStack', () => {
    inv.addItem(item('arrow', { maxStack: 5 }), 12);
    expect(inv.getItemCount('arrow')).toBe(12);
    expect(inv.getSlotCount()).toBe(3); // 5+5+2
  });

  it('addItem respects weight limit', () => {
    const r = inv.addItem(item('rock', { weight: 10 }), 10);
    expect(r.added).toBe(5); // 5*10=50
    expect(r.remaining).toBe(5);
    expect(inv.getCurrentWeight()).toBe(50);
  });

  it('addItem respects slot limit', () => {
    for (let i = 0; i < 10; i++) inv.addItem(item(`it${i}`, { maxStack: 1, weight: 0.1 }));
    expect(inv.isFull()).toBe(true);
    const r = inv.addItem(item('extra', { maxStack: 1, weight: 0.1 }));
    expect(r.added).toBe(0);
  });

  // --- Remove ---
  it('removeItem decreases count', () => {
    inv.addItem(item('potion'), 5);
    const removed = inv.removeItem('potion', 3);
    expect(removed).toBe(3);
    expect(inv.getItemCount('potion')).toBe(2);
  });

  it('removeItem removes slot when empty', () => {
    inv.addItem(item('key', { maxStack: 1 }));
    inv.removeItem('key');
    expect(inv.getSlotCount()).toBe(0);
  });

  it('removeItem returns 0 for missing', () => {
    expect(inv.removeItem('ghost')).toBe(0);
  });

  // --- Transfer ---
  it('transfer moves items between inventories', () => {
    inv.addItem(item('gem'), 5);
    const inv2 = new InventorySystem(10, 50);
    const moved = inv.transfer(inv2, 'gem', 3);
    expect(moved).toBe(3);
    expect(inv.getItemCount('gem')).toBe(2);
    expect(inv2.getItemCount('gem')).toBe(3);
  });

  // --- Queries ---
  it('hasItem checks quantity', () => {
    inv.addItem(item('coin'), 5);
    expect(inv.hasItem('coin', 5)).toBe(true);
    expect(inv.hasItem('coin', 6)).toBe(false);
  });

  it('getByCategory filters', () => {
    inv.addItem(item('sword', { category: 'weapon' }));
    inv.addItem(item('shield', { category: 'armor' }));
    expect(inv.getByCategory('weapon')).toHaveLength(1);
  });

  it('getAllItems returns all', () => {
    inv.addItem(item('a'));
    inv.addItem(item('b'));
    expect(inv.getAllItems()).toHaveLength(2);
  });

  // --- Sorting ---
  it('sort by name reorders', () => {
    inv.addItem(item('zeta'));
    inv.addItem(item('alpha'));
    inv.sort('name');
    const names = inv.getAllItems().map((s) => s.item.name);
    expect(names[0]).toBe('alpha');
  });

  it('sort by rarity puts legendary first', () => {
    inv.addItem(item('a', { rarity: 'common' }));
    inv.addItem(item('b', { rarity: 'legendary' }));
    inv.sort('rarity');
    expect(inv.getAllItems()[0].item.rarity).toBe('legendary');
  });

  // --- Weight ---
  it('getCurrentWeight tracks additions', () => {
    inv.addItem(item('stone', { weight: 3 }), 4);
    expect(inv.getCurrentWeight()).toBe(12);
  });

  it('removeItem decreases weight', () => {
    inv.addItem(item('stone', { weight: 5 }), 4);
    inv.removeItem('stone', 2);
    expect(inv.getCurrentWeight()).toBe(10);
  });
});
