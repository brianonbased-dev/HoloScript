import { describe, it, expect, beforeEach } from 'vitest';
import { CraftingSystem, type CraftingRecipe } from '../CraftingSystem';

const recipe = (id: string, discovered = true, level = 1): CraftingRecipe => ({
  id,
  name: id,
  ingredients: [
    { itemId: 'wood', quantity: 2 },
    { itemId: 'stone', quantity: 1 },
  ],
  output: { itemId: `${id}_out`, quantity: 1 },
  workbenchType: null,
  craftTime: 1,
  discovered,
  level,
});

const items = (wood = 10, stone = 5) =>
  new Map([
    ['wood', wood],
    ['stone', stone],
  ]);

describe('CraftingSystem', () => {
  let cs: CraftingSystem;

  beforeEach(() => {
    cs = new CraftingSystem();
  });

  it('addRecipe and getRecipe', () => {
    cs.addRecipe(recipe('axe'));
    expect(cs.getRecipe('axe')).toBeDefined();
    expect(cs.getRecipeCount()).toBe(1);
  });

  it('discovered recipe auto-registered', () => {
    cs.addRecipe(recipe('axe', true));
    expect(cs.getDiscoveredCount()).toBe(1);
  });

  it('undiscovered recipe not in discovered', () => {
    cs.addRecipe(recipe('axe', false));
    expect(cs.getDiscoveredCount()).toBe(0);
  });

  it('discoverRecipe marks as discovered', () => {
    cs.addRecipe(recipe('axe', false));
    expect(cs.discoverRecipe('axe')).toBe(true);
    expect(cs.getDiscoveredCount()).toBe(1);
  });

  it('discoverRecipe returns false for unknown', () => {
    expect(cs.discoverRecipe('nope')).toBe(false);
  });

  it('canCraft checks ingredients', () => {
    cs.addRecipe(recipe('axe'));
    expect(cs.canCraft('axe', items())).toBe(true);
    expect(cs.canCraft('axe', items(0, 0))).toBe(false);
  });

  it('canCraft checks discovery', () => {
    cs.addRecipe(recipe('axe', false));
    expect(cs.canCraft('axe', items())).toBe(false);
  });

  it('canCraft checks player level', () => {
    cs.addRecipe(recipe('axe', true, 5));
    expect(cs.canCraft('axe', items())).toBe(false);
    cs.setPlayerLevel(5);
    expect(cs.canCraft('axe', items())).toBe(true);
  });

  it('startCraft consumes ingredients', () => {
    cs.addRecipe(recipe('axe'));
    const inv = items();
    expect(cs.startCraft('axe', inv)).toBe(true);
    expect(inv.get('wood')).toBe(8);
    expect(inv.get('stone')).toBe(4);
    expect(cs.getQueueLength()).toBe(1);
  });

  it('startCraft returns false if cannot craft', () => {
    cs.addRecipe(recipe('axe'));
    expect(cs.startCraft('axe', items(0, 0))).toBe(false);
  });

  it('update completes craft after craftTime', () => {
    cs.addRecipe(recipe('axe'));
    cs.startCraft('axe', items());
    expect(cs.update(0.5)).toEqual([]);
    const completed = cs.update(0.6);
    expect(completed.length).toBe(1);
    expect(completed[0].itemId).toBe('axe_out');
    expect(cs.getQueueLength()).toBe(0);
  });

  it('checkDiscovery discovers matching recipes', () => {
    cs.addRecipe(recipe('axe', false));
    const discovered = cs.checkDiscovery(['wood', 'stone']);
    expect(discovered.length).toBe(1);
    expect(discovered[0].id).toBe('axe');
  });

  it('checkDiscovery skips already discovered', () => {
    cs.addRecipe(recipe('axe', true));
    expect(cs.checkDiscovery(['wood', 'stone']).length).toBe(0);
  });

  it('getAvailableRecipes filters by craftable', () => {
    cs.addRecipe(recipe('axe'));
    cs.addRecipe(recipe('pick', true, 99));
    expect(cs.getAvailableRecipes(items()).length).toBe(1);
  });

  it('getRecipesByWorkbench filters', () => {
    cs.addRecipe({ ...recipe('axe'), workbenchType: 'forge' });
    cs.addRecipe(recipe('pick'));
    expect(cs.getRecipesByWorkbench('forge').length).toBe(1);
  });

  it('setPlayerLevel / getPlayerLevel', () => {
    cs.setPlayerLevel(10);
    expect(cs.getPlayerLevel()).toBe(10);
  });
});
