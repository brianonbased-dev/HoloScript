import { describe, it, expect, beforeEach } from 'vitest';
import { CraftingSystem } from '../gameplay/CraftingSystem';
import type { CraftingRecipe } from '../gameplay/CraftingSystem';

// =============================================================================
// C228 — Crafting System
// =============================================================================

const SWORD_RECIPE: CraftingRecipe = {
  id: 'sword',
  name: 'Iron Sword',
  ingredients: [
    { itemId: 'iron', quantity: 3 },
    { itemId: 'wood', quantity: 1 },
  ],
  output: { itemId: 'iron_sword', quantity: 1 },
  workbenchType: 'forge',
  craftTime: 2,
  discovered: true,
  level: 1,
};

const POTION_RECIPE: CraftingRecipe = {
  id: 'potion',
  name: 'Health Potion',
  ingredients: [{ itemId: 'herb', quantity: 2 }],
  output: { itemId: 'health_potion', quantity: 1 },
  workbenchType: null,
  craftTime: 1,
  discovered: false,
  level: 1,
};

describe('CraftingSystem', () => {
  let cs: CraftingSystem;
  beforeEach(() => {
    cs = new CraftingSystem();
  });

  it('addRecipe and getRecipe', () => {
    cs.addRecipe(SWORD_RECIPE);
    expect(cs.getRecipe('sword')).toBeDefined();
    expect(cs.getRecipeCount()).toBe(1);
  });

  it('discoverRecipe marks recipe as discovered', () => {
    cs.addRecipe({ ...POTION_RECIPE });
    expect(cs.getDiscoveredCount()).toBe(0);
    expect(cs.discoverRecipe('potion')).toBe(true);
    expect(cs.getDiscoveredCount()).toBe(1);
  });

  it('discoverRecipe returns false for unknown', () => {
    expect(cs.discoverRecipe('nope')).toBe(false);
  });

  it('canCraft checks ingredients and discovery', () => {
    cs.addRecipe({ ...SWORD_RECIPE });
    const inv = new Map([
      ['iron', 5],
      ['wood', 2],
    ]);
    expect(cs.canCraft('sword', inv)).toBe(true);
  });

  it('canCraft fails with insufficient materials', () => {
    cs.addRecipe({ ...SWORD_RECIPE });
    const inv = new Map([
      ['iron', 1],
      ['wood', 0],
    ]);
    expect(cs.canCraft('sword', inv)).toBe(false);
  });

  it('canCraft fails for undiscovered recipe', () => {
    cs.addRecipe({ ...POTION_RECIPE }); // discovered: false
    const inv = new Map([['herb', 10]]);
    expect(cs.canCraft('potion', inv)).toBe(false);
  });

  it('canCraft fails when level too low', () => {
    cs.addRecipe({ ...SWORD_RECIPE, level: 5 });
    cs.setPlayerLevel(1);
    const inv = new Map([
      ['iron', 10],
      ['wood', 10],
    ]);
    expect(cs.canCraft('sword', inv)).toBe(false);
  });

  it('startCraft consumes ingredients and queues', () => {
    cs.addRecipe({ ...SWORD_RECIPE });
    const inv = new Map([
      ['iron', 5],
      ['wood', 2],
    ]);
    expect(cs.startCraft('sword', inv)).toBe(true);
    expect(inv.get('iron')).toBe(2);
    expect(inv.get('wood')).toBe(1);
    expect(cs.getQueueLength()).toBe(1);
  });

  it('update completes craft after enough time', () => {
    cs.addRecipe({ ...SWORD_RECIPE });
    const inv = new Map([
      ['iron', 5],
      ['wood', 2],
    ]);
    cs.startCraft('sword', inv);
    const done = cs.update(3); // craftTime is 2
    expect(done).toHaveLength(1);
    expect(done[0].itemId).toBe('iron_sword');
    expect(cs.getQueueLength()).toBe(0);
  });

  it('update does not complete before craft time', () => {
    cs.addRecipe({ ...SWORD_RECIPE });
    const inv = new Map([
      ['iron', 5],
      ['wood', 2],
    ]);
    cs.startCraft('sword', inv);
    expect(cs.update(1)).toHaveLength(0);
    expect(cs.getQueueLength()).toBe(1);
  });

  it('checkDiscovery discovers recipes when all ingredients held', () => {
    cs.addRecipe({ ...POTION_RECIPE });
    const discovered = cs.checkDiscovery(['herb']);
    expect(discovered).toHaveLength(1);
    expect(discovered[0].id).toBe('potion');
  });

  it('getAvailableRecipes filters by craftability', () => {
    cs.addRecipe({ ...SWORD_RECIPE });
    cs.addRecipe({ ...POTION_RECIPE });
    const inv = new Map([
      ['iron', 10],
      ['wood', 10],
    ]);
    const available = cs.getAvailableRecipes(inv);
    expect(available.length).toBe(1); // only sword is discovered
  });

  it('getRecipesByWorkbench filters by workbench', () => {
    cs.addRecipe({ ...SWORD_RECIPE });
    cs.discoverRecipe('sword');
    expect(cs.getRecipesByWorkbench('forge')).toHaveLength(1);
    expect(cs.getRecipesByWorkbench('anvil')).toHaveLength(0);
  });

  it('setPlayerLevel and getPlayerLevel', () => {
    cs.setPlayerLevel(5);
    expect(cs.getPlayerLevel()).toBe(5);
  });
});
