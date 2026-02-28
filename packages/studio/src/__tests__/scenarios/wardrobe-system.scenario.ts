/**
 * Scenario: Wardrobe System (Phase 2)
 *
 * Tests for the wardrobe equip/unequip system:
 * - Store: equipItem, unequipSlot, clearWardrobe, panelMode
 * - Built-in items catalogue
 * - Slot management
 */

import { describe, it, expect, beforeEach } from 'vitest';

const { useCharacterStore } = await import('@/lib/store');
const { BUILTIN_ITEMS } = await import('@/components/character/WardrobePanel');

// ── Helpers ─────────────────────────────────────────────────────────────────

function resetStore() {
  useCharacterStore.setState({
    glbUrl: null,
    equippedItems: {},
    wardrobeItems: [],
    panelMode: 'skeleton',
    customizeMode: false,
    morphTargets: {},
    skinColor: '#e8beac',
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Scenario: Wardrobe System — Store', () => {
  beforeEach(resetStore);

  it('equippedItems starts empty', () => {
    expect(useCharacterStore.getState().equippedItems).toEqual({});
  });

  it('equipItem() equips a hair item', () => {
    const item = BUILTIN_ITEMS.find((i) => i.slot === 'hair')!;
    useCharacterStore.getState().equipItem(item);
    expect(useCharacterStore.getState().equippedItems.hair).toEqual(item);
  });

  it('equipItem() replaces existing item in same slot', () => {
    const items = BUILTIN_ITEMS.filter((i) => i.slot === 'hair');
    useCharacterStore.getState().equipItem(items[0]);
    useCharacterStore.getState().equipItem(items[1]);
    expect(useCharacterStore.getState().equippedItems.hair?.id).toBe(items[1].id);
  });

  it('equipping different slots preserves all', () => {
    const hair = BUILTIN_ITEMS.find((i) => i.slot === 'hair')!;
    const top = BUILTIN_ITEMS.find((i) => i.slot === 'top')!;
    const shoes = BUILTIN_ITEMS.find((i) => i.slot === 'shoes')!;
    useCharacterStore.getState().equipItem(hair);
    useCharacterStore.getState().equipItem(top);
    useCharacterStore.getState().equipItem(shoes);
    const eq = useCharacterStore.getState().equippedItems;
    expect(eq.hair?.id).toBe(hair.id);
    expect(eq.top?.id).toBe(top.id);
    expect(eq.shoes?.id).toBe(shoes.id);
  });

  it('unequipSlot() removes item from specific slot', () => {
    const item = BUILTIN_ITEMS.find((i) => i.slot === 'top')!;
    useCharacterStore.getState().equipItem(item);
    useCharacterStore.getState().unequipSlot('top');
    expect(useCharacterStore.getState().equippedItems.top).toBeUndefined();
  });

  it('unequipSlot() preserves other slots', () => {
    const hair = BUILTIN_ITEMS.find((i) => i.slot === 'hair')!;
    const top = BUILTIN_ITEMS.find((i) => i.slot === 'top')!;
    useCharacterStore.getState().equipItem(hair);
    useCharacterStore.getState().equipItem(top);
    useCharacterStore.getState().unequipSlot('top');
    expect(useCharacterStore.getState().equippedItems.hair?.id).toBe(hair.id);
  });

  it('clearWardrobe() removes all equipped items', () => {
    const hair = BUILTIN_ITEMS.find((i) => i.slot === 'hair')!;
    const top = BUILTIN_ITEMS.find((i) => i.slot === 'top')!;
    useCharacterStore.getState().equipItem(hair);
    useCharacterStore.getState().equipItem(top);
    useCharacterStore.getState().clearWardrobe();
    expect(useCharacterStore.getState().equippedItems).toEqual({});
  });
});

describe('Scenario: Wardrobe System — Panel Mode', () => {
  beforeEach(resetStore);

  it('panelMode defaults to skeleton', () => {
    expect(useCharacterStore.getState().panelMode).toBe('skeleton');
  });

  it('setPanelMode("wardrobe") switches to wardrobe', () => {
    useCharacterStore.getState().setPanelMode('wardrobe');
    expect(useCharacterStore.getState().panelMode).toBe('wardrobe');
  });

  it('setPanelMode("customize") sets customizeMode to true', () => {
    useCharacterStore.getState().setPanelMode('customize');
    expect(useCharacterStore.getState().customizeMode).toBe(true);
  });

  it('setPanelMode("wardrobe") sets customizeMode to false', () => {
    useCharacterStore.getState().setPanelMode('customize');
    useCharacterStore.getState().setPanelMode('wardrobe');
    expect(useCharacterStore.getState().customizeMode).toBe(false);
  });

  it('setCustomizeMode(true) syncs panelMode to customize', () => {
    useCharacterStore.getState().setCustomizeMode(true);
    expect(useCharacterStore.getState().panelMode).toBe('customize');
  });

  it('setCustomizeMode(false) syncs panelMode to skeleton', () => {
    useCharacterStore.getState().setCustomizeMode(true);
    useCharacterStore.getState().setCustomizeMode(false);
    expect(useCharacterStore.getState().panelMode).toBe('skeleton');
  });
});

describe('Scenario: Wardrobe System — Built-in Catalogue', () => {
  it('has 20 built-in items', () => {
    expect(BUILTIN_ITEMS.length).toBe(20);
  });

  it('covers 5 unique slot types', () => {
    const slots = new Set(BUILTIN_ITEMS.map((i) => i.slot));
    expect(slots.size).toBe(5);
  });

  it('has 4 hair items', () => {
    expect(BUILTIN_ITEMS.filter((i) => i.slot === 'hair').length).toBe(4);
  });

  it('has 4 top items', () => {
    expect(BUILTIN_ITEMS.filter((i) => i.slot === 'top').length).toBe(4);
  });

  it('has 3 bottom items', () => {
    expect(BUILTIN_ITEMS.filter((i) => i.slot === 'bottom').length).toBe(3);
  });

  it('has 3 shoe items', () => {
    expect(BUILTIN_ITEMS.filter((i) => i.slot === 'shoes').length).toBe(3);
  });

  it('has items with required fields', () => {
    for (const item of BUILTIN_ITEMS) {
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.slot).toBeTruthy();
      expect(item.thumbnail).toBeTruthy();
      expect(item.category).toBeTruthy();
    }
  });

  it('all item IDs are unique', () => {
    const ids = BUILTIN_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
