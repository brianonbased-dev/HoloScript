import { describe, it, expect } from 'vitest';
import { InventorySystem } from '@holoscript/engine/gameplay';
import { CraftingSystem } from '@holoscript/engine/gameplay';
import { LootTable } from '@holoscript/engine/gameplay';

const sword = {
  id: 'sword',
  name: 'Iron Sword',
  category: 'weapon' as const,
  rarity: 'common' as const,
  weight: 5,
  maxStack: 1,
  value: 50,
  properties: {},
};
const potion = {
  id: 'potion',
  name: 'Health Potion',
  category: 'consumable' as const,
  rarity: 'common' as const,
  weight: 0.5,
  maxStack: 10,
  value: 10,
  properties: {},
};
const ore = {
  id: 'ore',
  name: 'Iron Ore',
  category: 'material' as const,
  rarity: 'common' as const,
  weight: 2,
  maxStack: 20,
  value: 5,
  properties: {},
};
const wood = {
  id: 'wood',
  name: 'Wood',
  category: 'material' as const,
  rarity: 'common' as const,
  weight: 1,
  maxStack: 50,
  value: 2,
  properties: {},
};

describe('Cycle 130: Inventory & Crafting', () => {
  // -------------------------------------------------------------------------
  // InventorySystem
  // -------------------------------------------------------------------------

  it('should add, stack, and remove items', () => {
    const inv = new InventorySystem(10, 100);
    inv.addItem(potion, 5);
    inv.addItem(potion, 3);

    expect(inv.getItemCount('potion')).toBe(8);
    expect(inv.getSlotCount()).toBe(1); // Stacked

    inv.removeItem('potion', 3);
    expect(inv.getItemCount('potion')).toBe(5);
  });

  it('should enforce weight limits', () => {
    const inv = new InventorySystem(10, 10); // Max 10 weight
    const result = inv.addItem(sword, 3); // 3 * 5 = 15 > 10

    expect(result.added).toBe(2); // Only 2 fit
    expect(result.remaining).toBe(1);
    expect(inv.getCurrentWeight()).toBe(10);
  });

  it('should filter by category and sort', () => {
    const inv = new InventorySystem();
    inv.addItem(sword);
    inv.addItem(potion, 5);
    inv.addItem(ore, 3);

    expect(inv.getByCategory('weapon')).toHaveLength(1);
    expect(inv.getByCategory('consumable')).toHaveLength(1);

    inv.sort('name');
    const items = inv.getAllItems();
    expect(items[0].item.name).toBe('Health Potion');
  });

  // -------------------------------------------------------------------------
  // CraftingSystem
  // -------------------------------------------------------------------------

  it('should craft when ingredients available', () => {
    const craft = new CraftingSystem();
    craft.addRecipe({
      id: 'iron_sword',
      name: 'Iron Sword',
      ingredients: [
        { itemId: 'ore', quantity: 3 },
        { itemId: 'wood', quantity: 2 },
      ],
      output: { itemId: 'sword', quantity: 1 },
      workbenchType: 'forge',
      craftTime: 0.1,
      discovered: true,
      level: 1,
    });

    const items = new Map([
      ['ore', 5],
      ['wood', 3],
    ]);
    expect(craft.canCraft('iron_sword', items)).toBe(true);

    craft.startCraft('iron_sword', items);
    expect(items.get('ore')).toBe(2); // Consumed
    expect(items.get('wood')).toBe(1);

    const completed = craft.update(0.2); // Enough time
    expect(completed).toHaveLength(1);
    expect(completed[0].itemId).toBe('sword');
  });

  it('should discover recipes from held items', () => {
    const craft = new CraftingSystem();
    craft.addRecipe({
      id: 'basic_potion',
      name: 'Basic Potion',
      ingredients: [
        { itemId: 'herb', quantity: 1 },
        { itemId: 'water', quantity: 1 },
      ],
      output: { itemId: 'potion', quantity: 1 },
      workbenchType: null,
      craftTime: 0.5,
      discovered: false,
      level: 1,
    });

    expect(craft.getDiscoveredCount()).toBe(0);
    const found = craft.checkDiscovery(['herb', 'water', 'ore']);
    expect(found).toHaveLength(1);
    expect(craft.getDiscoveredCount()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // LootTable
  // -------------------------------------------------------------------------

  it('should roll drops with weighted probabilities', () => {
    const loot = new LootTable(123);
    loot.addTable(
      'goblin',
      [
        {
          itemId: 'gold',
          weight: 80,
          rarity: 'common',
          minQuantity: 1,
          maxQuantity: 5,
          guaranteed: true,
        },
        {
          itemId: 'sword',
          weight: 15,
          rarity: 'uncommon',
          minQuantity: 1,
          maxQuantity: 1,
          guaranteed: false,
        },
        {
          itemId: 'gem',
          weight: 5,
          rarity: 'rare',
          minQuantity: 1,
          maxQuantity: 1,
          guaranteed: false,
        },
      ],
      1,
      2
    );

    const drops = loot.roll('goblin');
    expect(drops.length).toBeGreaterThanOrEqual(1); // At least guaranteed
    expect(drops.some((d) => d.itemId === 'gold')).toBe(true); // Guaranteed
  });

  it('should report drop rates', () => {
    const loot = new LootTable();
    loot.addTable('chest', [
      {
        itemId: 'common_item',
        weight: 70,
        rarity: 'common',
        minQuantity: 1,
        maxQuantity: 1,
        guaranteed: false,
      },
      {
        itemId: 'rare_item',
        weight: 30,
        rarity: 'rare',
        minQuantity: 1,
        maxQuantity: 1,
        guaranteed: false,
      },
    ]);

    const rates = loot.getDropRates('chest');
    expect(rates.get('common_item')).toBe(70);
    expect(rates.get('rare_item')).toBe(30);
  });

  it('should track pity counters', () => {
    const loot = new LootTable(42);
    loot.addTable(
      'boss',
      [
        {
          itemId: 'common_loot',
          weight: 90,
          rarity: 'common',
          minQuantity: 1,
          maxQuantity: 3,
          guaranteed: false,
        },
        {
          itemId: 'legendary_drop',
          weight: 10,
          rarity: 'legendary',
          minQuantity: 1,
          maxQuantity: 1,
          guaranteed: false,
        },
      ],
      1,
      1
    );

    // Roll several times
    for (let i = 0; i < 5; i++) loot.roll('boss');

    const commonPity = loot.getPityCounter('boss', 'common');
    const legendaryPity = loot.getPityCounter('boss', 'legendary');
    // At least one counter should be > 0
    expect(commonPity + legendaryPity).toBeGreaterThan(0);
  });
});
