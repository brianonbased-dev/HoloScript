/**
 * InventorySystem.prod.test.ts
 *
 * Production-grade test suite for InventorySystem.
 * Covers: construction, add/remove (stacking, weight, slot limits),
 *         transfer, queries, category filter, and sort.
 *
 * Sprint CXXXIV  |  @module gameplay
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InventorySystem } from '../InventorySystem';
import type { ItemDef } from '../InventorySystem';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ItemDef> = {}): ItemDef {
  return {
    id: 'iron-sword',
    name: 'Iron Sword',
    category: 'weapon',
    rarity: 'common',
    weight: 2,
    maxStack: 1,
    value: 50,
    properties: {},
    ...overrides,
  };
}

function makeStackable(overrides: Partial<ItemDef> = {}): ItemDef {
  return makeItem({
    id: 'arrow',
    name: 'Arrow',
    category: 'misc',
    weight: 0.05,
    maxStack: 100,
    ...overrides,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InventorySystem', () => {
  // ── Construction ──────────────────────────────────────────────────────────
  describe('construction', () => {
    it('starts empty with defaults', () => {
      const inv = new InventorySystem();
      expect(inv.getSlotCount()).toBe(0);
      expect(inv.getMaxSlots()).toBe(40);
      expect(inv.getCurrentWeight()).toBe(0);
      expect(inv.getMaxWeight()).toBe(100);
      expect(inv.isFull()).toBe(false);
    });

    it('respects custom maxSlots and maxWeight', () => {
      const inv = new InventorySystem(5, 20);
      expect(inv.getMaxSlots()).toBe(5);
      expect(inv.getMaxWeight()).toBe(20);
    });
  });

  // ── addItem ───────────────────────────────────────────────────────────────
  describe('addItem', () => {
    it('adds a single non-stackable item', () => {
      const inv = new InventorySystem();
      const result = inv.addItem(makeItem());
      expect(result.added).toBe(1);
      expect(result.remaining).toBe(0);
      expect(inv.getSlotCount()).toBe(1);
    });

    it('stacks items up to maxStack in the same slot', () => {
      const inv = new InventorySystem();
      const arrow = makeStackable();
      inv.addItem(arrow, 50);
      inv.addItem(arrow, 30);
      expect(inv.getItemCount('arrow')).toBe(80);
      expect(inv.getSlotCount()).toBe(1); // same slot
    });

    it('opens a new slot when stack is full', () => {
      const inv = new InventorySystem(10, 1000);
      const arrow = makeStackable({ maxStack: 10 });
      inv.addItem(arrow, 10); // fills slot 0
      inv.addItem(arrow, 5); // opens slot 1
      expect(inv.getSlotCount()).toBe(2);
      expect(inv.getItemCount('arrow')).toBe(15);
    });

    it('respects max weight limit', () => {
      const inv = new InventorySystem(40, 5);
      const heavy = makeItem({ id: 'rock', weight: 3 });
      const result = inv.addItem(heavy, 3); // 9 kg total → capped at 1
      expect(result.added).toBeLessThanOrEqual(2);
      expect(inv.getCurrentWeight()).toBeLessThanOrEqual(5);
    });

    it('returns remaining when slot cap reached', () => {
      const inv = new InventorySystem(2, 1000); // only 2 slots
      const sword = makeItem({ id: 's1', maxStack: 1 });
      inv.addItem(sword);
      const sword2 = makeItem({ id: 's2', maxStack: 1 });
      inv.addItem(sword2);
      expect(inv.isFull()).toBe(true);
      const sword3 = makeItem({ id: 's3', maxStack: 1 });
      const r = inv.addItem(sword3);
      expect(r.remaining).toBe(1);
    });

    it('updates currentWeight correctly', () => {
      const inv = new InventorySystem();
      inv.addItem(makeItem({ id: 'sword', weight: 3 }));
      inv.addItem(makeItem({ id: 'shield', weight: 2 }));
      expect(inv.getCurrentWeight()).toBeCloseTo(5);
    });
  });

  // ── removeItem ────────────────────────────────────────────────────────────
  describe('removeItem', () => {
    it('removes a quantity and returns removed count', () => {
      const inv = new InventorySystem();
      inv.addItem(makeStackable(), 10);
      const removed = inv.removeItem('arrow', 4);
      expect(removed).toBe(4);
      expect(inv.getItemCount('arrow')).toBe(6);
    });

    it('deletes slot when quantity reaches 0', () => {
      const inv = new InventorySystem();
      inv.addItem(makeItem());
      inv.removeItem('iron-sword', 1);
      expect(inv.getSlotCount()).toBe(0);
    });

    it('returns 0 for item not in inventory', () => {
      const inv = new InventorySystem();
      expect(inv.removeItem('ghost', 1)).toBe(0);
    });

    it('decreases currentWeight on removal', () => {
      const inv = new InventorySystem();
      inv.addItem(makeItem({ weight: 5 }));
      inv.removeItem('iron-sword', 1);
      expect(inv.getCurrentWeight()).toBeCloseTo(0);
    });
  });

  // ── transfer ──────────────────────────────────────────────────────────────
  describe('transfer', () => {
    it('moves items between inventories', () => {
      const src = new InventorySystem();
      const dst = new InventorySystem();
      src.addItem(makeStackable(), 5);
      const transferred = src.transfer(dst, 'arrow', 3);
      expect(transferred).toBe(3);
      expect(src.getItemCount('arrow')).toBe(2);
      expect(dst.getItemCount('arrow')).toBe(3);
    });

    it('returns 0 if source lacks the item', () => {
      const src = new InventorySystem();
      const dst = new InventorySystem();
      expect(src.transfer(dst, 'nonexistent', 1)).toBe(0);
    });
  });

  // ── Queries ───────────────────────────────────────────────────────────────
  describe('queries', () => {
    it('hasItem returns true when sufficient quantity', () => {
      const inv = new InventorySystem();
      inv.addItem(makeStackable(), 5);
      expect(inv.hasItem('arrow', 5)).toBe(true);
      expect(inv.hasItem('arrow', 6)).toBe(false);
    });

    it('getByCategory filters correctly', () => {
      const inv = new InventorySystem();
      inv.addItem(makeItem({ id: 'sword', category: 'weapon' }));
      inv.addItem(makeItem({ id: 'potion', category: 'consumable' }));
      expect(inv.getByCategory('weapon')).toHaveLength(1);
      expect(inv.getByCategory('consumable')).toHaveLength(1);
      expect(inv.getByCategory('armor')).toHaveLength(0);
    });

    it('getAllItems returns all slots', () => {
      const inv = new InventorySystem();
      inv.addItem(makeItem({ id: 'a' }));
      inv.addItem(makeItem({ id: 'b' }));
      expect(inv.getAllItems()).toHaveLength(2);
    });

    it('getSlot returns correct slot data', () => {
      const inv = new InventorySystem();
      inv.addItem(makeItem());
      const slot = inv.getSlot(0);
      expect(slot).toBeDefined();
      expect(slot!.item.id).toBe('iron-sword');
    });
  });

  // ── Sort ──────────────────────────────────────────────────────────────────
  describe('sort', () => {
    it('sort by name orders items alphabetically', () => {
      const inv = new InventorySystem();
      inv.addItem(makeItem({ id: 'z', name: 'Zephyr Blade' }));
      inv.addItem(makeItem({ id: 'a', name: 'Ancient Scroll', category: 'misc' }));
      inv.sort('name');
      const names = inv.getAllItems().map((s) => s.item.name);
      expect(names[0]).toBe('Ancient Scroll');
    });

    it('sort by rarity orders highest rarity first', () => {
      const inv = new InventorySystem();
      inv.addItem(makeItem({ id: 'c', rarity: 'common' }));
      inv.addItem(makeItem({ id: 'l', name: 'Legend', rarity: 'legendary' }));
      inv.sort('rarity');
      const first = inv.getSlot(0)!.item.rarity;
      expect(first).toBe('legendary');
    });

    it('sort by weight orders heaviest first', () => {
      const inv = new InventorySystem(40, 1000);
      inv.addItem(makeItem({ id: 'light', name: 'Light', weight: 1 }));
      inv.addItem(makeItem({ id: 'heavy', name: 'Heavy', weight: 10 }));
      inv.sort('weight');
      expect(inv.getSlot(0)!.item.id).toBe('heavy');
    });
  });
});
