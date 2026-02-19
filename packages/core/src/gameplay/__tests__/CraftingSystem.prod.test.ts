/**
 * CraftingSystem.prod.test.ts
 *
 * Production-grade test suite for CraftingSystem.
 * Covers: recipe CRUD, discovery, canCraft prerequisites,
 *         startCraft (ingredient consumption), update (timer),
 *         checkDiscovery, workbench filter, and queries.
 *
 * Sprint CXXXVI  |  @module gameplay
 */

import { describe, it, expect } from 'vitest';
import { CraftingSystem } from '../CraftingSystem';
import type { CraftingRecipe } from '../CraftingSystem';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRecipe(overrides: Partial<CraftingRecipe> = {}): CraftingRecipe {
  return {
    id: 'iron-sword',
    name: 'Iron Sword',
    ingredients: [
      { itemId: 'iron-ingot', quantity: 3 },
      { itemId: 'wood', quantity: 1 },
    ],
    output: { itemId: 'iron-sword', quantity: 1 },
    workbenchType: 'forge',
    craftTime: 5,
    discovered: true,
    level: 1,
    ...overrides,
  };
}

function itemMap(items: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(items));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CraftingSystem', () => {

  // ── Construction ──────────────────────────────────────────────────────────
  describe('construction', () => {
    it('starts empty', () => {
      const cs = new CraftingSystem();
      expect(cs.getRecipeCount()).toBe(0);
      expect(cs.getDiscoveredCount()).toBe(0);
      expect(cs.getQueueLength()).toBe(0);
      expect(cs.getPlayerLevel()).toBe(1);
    });
  });

  // ── Recipe management ─────────────────────────────────────────────────────
  describe('addRecipe / getRecipe', () => {
    it('adds a recipe and returns it via getRecipe', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe());
      expect(cs.getRecipeCount()).toBe(1);
      expect(cs.getRecipe('iron-sword')).toBeDefined();
    });

    it('discovered=true auto-registers in discovered set', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ discovered: true }));
      expect(cs.getDiscoveredCount()).toBe(1);
    });

    it('discovered=false does not count as discovered', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ discovered: false }));
      expect(cs.getDiscoveredCount()).toBe(0);
    });

    it('getRecipe returns undefined for unknown id', () => {
      const cs = new CraftingSystem();
      expect(cs.getRecipe('ghost')).toBeUndefined();
    });
  });

  // ── Discovery ─────────────────────────────────────────────────────────────
  describe('discoverRecipe', () => {
    it('discovers an undiscovered recipe', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ id: 'bow', discovered: false }));
      expect(cs.discoverRecipe('bow')).toBe(true);
      expect(cs.getDiscoveredCount()).toBe(1);
    });

    it('returns false for unknown recipe', () => {
      const cs = new CraftingSystem();
      expect(cs.discoverRecipe('nope')).toBe(false);
    });

    it('marks the recipe.discovered flag', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ id: 'bow', discovered: false }));
      cs.discoverRecipe('bow');
      expect(cs.getRecipe('bow')!.discovered).toBe(true);
    });
  });

  // ── canCraft ──────────────────────────────────────────────────────────────
  describe('canCraft', () => {
    it('returns true when all ingredients available and discovered', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe());
      const items = itemMap({ 'iron-ingot': 3, wood: 1 });
      expect(cs.canCraft('iron-sword', items)).toBe(true);
    });

    it('returns false when ingredient quantity insufficient', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe());
      const items = itemMap({ 'iron-ingot': 2, wood: 1 }); // needs 3
      expect(cs.canCraft('iron-sword', items)).toBe(false);
    });

    it('returns false when recipe not discovered', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ discovered: false }));
      const items = itemMap({ 'iron-ingot': 3, wood: 1 });
      expect(cs.canCraft('iron-sword', items)).toBe(false);
    });

    it('returns false when player level too low', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ level: 5 }));
      const items = itemMap({ 'iron-ingot': 3, wood: 1 });
      expect(cs.canCraft('iron-sword', items)).toBe(false);
    });

    it('returns true when player level is exactly met', () => {
      const cs = new CraftingSystem();
      cs.setPlayerLevel(5);
      cs.addRecipe(makeRecipe({ level: 5 }));
      const items = itemMap({ 'iron-ingot': 3, wood: 1 });
      expect(cs.canCraft('iron-sword', items)).toBe(true);
    });
  });

  // ── startCraft ────────────────────────────────────────────────────────────
  describe('startCraft', () => {
    it('starts a craft and consumes ingredients', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe());
      const items = itemMap({ 'iron-ingot': 5, wood: 2 });
      expect(cs.startCraft('iron-sword', items)).toBe(true);
      expect(items.get('iron-ingot')).toBe(2);
      expect(items.get('wood')).toBe(1);
      expect(cs.getQueueLength()).toBe(1);
    });

    it('returns false if canCraft fails', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe());
      const items = itemMap({ 'iron-ingot': 1 }); // not enough
      expect(cs.startCraft('iron-sword', items)).toBe(false);
      expect(cs.getQueueLength()).toBe(0);
    });

    it('multiple concurrent crafts allowed', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe());
      const items = itemMap({ 'iron-ingot': 9, wood: 3 });
      cs.startCraft('iron-sword', items);
      cs.startCraft('iron-sword', items);
      cs.startCraft('iron-sword', items);
      expect(cs.getQueueLength()).toBe(3);
    });
  });

  // ── update (time-based completion) ────────────────────────────────────────
  describe('update', () => {
    it('craft not completed before craftTime elapses', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ craftTime: 10 }));
      const items = itemMap({ 'iron-ingot': 3, wood: 1 });
      cs.startCraft('iron-sword', items);
      const done = cs.update(5);
      expect(done).toHaveLength(0);
      expect(cs.getQueueLength()).toBe(1);
    });

    it('craft completes after sufficient time', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ craftTime: 5 }));
      const items = itemMap({ 'iron-ingot': 3, wood: 1 });
      cs.startCraft('iron-sword', items);
      const done = cs.update(5);
      expect(done).toHaveLength(1);
      expect(done[0].itemId).toBe('iron-sword');
      expect(cs.getQueueLength()).toBe(0);
    });

    it('partial tick does not complete craft early', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ craftTime: 10 }));
      const items = itemMap({ 'iron-ingot': 3, wood: 1 });
      cs.startCraft('iron-sword', items);
      cs.update(4);
      cs.update(4); // total 8 < 10
      expect(cs.getQueueLength()).toBe(1);
    });

    it('accumulates dt across multiple updates', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ craftTime: 10 }));
      const items = itemMap({ 'iron-ingot': 3, wood: 1 });
      cs.startCraft('iron-sword', items);
      cs.update(6);
      const done = cs.update(5); // total 11 ≥ 10
      expect(done).toHaveLength(1);
    });
  });

  // ── checkDiscovery ────────────────────────────────────────────────────────
  describe('checkDiscovery', () => {
    it('discovers recipe when all ingredient items held', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ id: 'potion', discovered: false, ingredients: [{ itemId: 'herb', quantity: 1 }, { itemId: 'water', quantity: 1 }] }));
      const discovered = cs.checkDiscovery(['herb', 'water', 'stone']);
      expect(discovered).toHaveLength(1);
      expect(discovered[0].id).toBe('potion');
    });

    it('does not discover recipe when missing an ingredient', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ id: 'potion', discovered: false, ingredients: [{ itemId: 'herb', quantity: 1 }, { itemId: 'water', quantity: 1 }] }));
      const discovered = cs.checkDiscovery(['herb']); // missing water
      expect(discovered).toHaveLength(0);
    });

    it('already-discovered recipes are not returned again', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ discovered: true }));
      const discovered = cs.checkDiscovery(['iron-ingot', 'wood']);
      expect(discovered).toHaveLength(0);
    });
  });

  // ── Queries ───────────────────────────────────────────────────────────────
  describe('queries', () => {
    it('getAvailableRecipes returns only craftable discovered recipes', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ id: 'sword', discovered: true }));
      cs.addRecipe(makeRecipe({ id: 'bow', discovered: false }));
      const items = itemMap({ 'iron-ingot': 3, wood: 1 });
      const available = cs.getAvailableRecipes(items);
      expect(available.map(r => r.id)).toContain('sword');
      expect(available.map(r => r.id)).not.toContain('bow');
    });

    it('getRecipesByWorkbench filters by workbench type', () => {
      const cs = new CraftingSystem();
      cs.addRecipe(makeRecipe({ id: 'sword', workbenchType: 'forge' }));
      cs.addRecipe(makeRecipe({ id: 'potion', workbenchType: 'alchemy' }));
      expect(cs.getRecipesByWorkbench('forge').map(r => r.id)).toContain('sword');
      expect(cs.getRecipesByWorkbench('alchemy').map(r => r.id)).toContain('potion');
      expect(cs.getRecipesByWorkbench('sawmill')).toHaveLength(0);
    });

    it('setPlayerLevel / getPlayerLevel round-trips', () => {
      const cs = new CraftingSystem();
      cs.setPlayerLevel(10);
      expect(cs.getPlayerLevel()).toBe(10);
    });
  });
});
