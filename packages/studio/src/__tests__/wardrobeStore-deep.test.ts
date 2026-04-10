// @vitest-environment jsdom
/**
 * Deep tests for wardrobeStore (Sprint 17 P1)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { WardrobeItem, WardrobeSlot } from '@/lib/stores/wardrobeStore';

const { useWardrobeStore } = await import('@/lib/stores/wardrobeStore');

function reset() {
  useWardrobeStore.setState({ equippedItems: {}, wardrobeItems: [] });
}

function makeItem(overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  return {
    id: overrides.id ?? 'item-1',
    name: overrides.name ?? 'Test Hat',
    slot: overrides.slot ?? 'hair',
    thumbnail: overrides.thumbnail ?? '/thumbs/hat.png',
    modelUrl: overrides.modelUrl,
    category: overrides.category ?? 'hats',
  };
}

describe('wardrobeStore — defaults', () => {
  beforeEach(reset);

  it('equippedItems defaults to empty object', () => {
    expect(useWardrobeStore.getState().equippedItems).toEqual({});
  });

  it('wardrobeItems defaults to empty array', () => {
    expect(useWardrobeStore.getState().wardrobeItems).toEqual([]);
  });
});

describe('wardrobeStore — equipItem', () => {
  beforeEach(reset);

  it('equips item to its slot', () => {
    const hat = makeItem({ id: 'hat-1', slot: 'hair' });
    useWardrobeStore.getState().equipItem(hat);
    expect(useWardrobeStore.getState().equippedItems.hair).toEqual(hat);
  });

  it('replaces item in same slot', () => {
    const hat1 = makeItem({ id: 'hat-1', name: 'Fedora', slot: 'hair' });
    const hat2 = makeItem({ id: 'hat-2', name: 'Beanie', slot: 'hair' });
    useWardrobeStore.getState().equipItem(hat1);
    useWardrobeStore.getState().equipItem(hat2);
    expect(useWardrobeStore.getState().equippedItems.hair?.id).toBe('hat-2');
  });

  it('equips to multiple slots independently', () => {
    const hat = makeItem({ id: 'hat-1', slot: 'hair' });
    const shirt = makeItem({ id: 'shirt-1', slot: 'top', name: 'T-Shirt' });
    const shoes = makeItem({ id: 'shoes-1', slot: 'shoes', name: 'Sneakers' });
    useWardrobeStore.getState().equipItem(hat);
    useWardrobeStore.getState().equipItem(shirt);
    useWardrobeStore.getState().equipItem(shoes);
    expect(Object.keys(useWardrobeStore.getState().equippedItems)).toHaveLength(3);
  });

  it('supports accessory slots', () => {
    const ring = makeItem({ id: 'ring-1', slot: 'accessory_1', name: 'Ring' });
    const bracelet = makeItem({ id: 'bracelet-1', slot: 'accessory_2', name: 'Bracelet' });
    useWardrobeStore.getState().equipItem(ring);
    useWardrobeStore.getState().equipItem(bracelet);
    expect(useWardrobeStore.getState().equippedItems.accessory_1?.id).toBe('ring-1');
    expect(useWardrobeStore.getState().equippedItems.accessory_2?.id).toBe('bracelet-1');
  });
});

describe('wardrobeStore — unequipSlot', () => {
  beforeEach(reset);

  it('removes item from slot', () => {
    useWardrobeStore.getState().equipItem(makeItem({ slot: 'hair' }));
    useWardrobeStore.getState().unequipSlot('hair');
    expect(useWardrobeStore.getState().equippedItems.hair).toBeUndefined();
  });

  it('does not affect other slots', () => {
    useWardrobeStore.getState().equipItem(makeItem({ id: 'h', slot: 'hair' }));
    useWardrobeStore.getState().equipItem(makeItem({ id: 't', slot: 'top' }));
    useWardrobeStore.getState().unequipSlot('hair');
    expect(useWardrobeStore.getState().equippedItems.top).toBeDefined();
  });

  it('no-op for empty slot', () => {
    useWardrobeStore.getState().unequipSlot('shoes');
    expect(useWardrobeStore.getState().equippedItems).toEqual({});
  });
});

describe('wardrobeStore — clearWardrobe', () => {
  beforeEach(reset);

  it('removes all equipped items', () => {
    useWardrobeStore.getState().equipItem(makeItem({ id: 'h', slot: 'hair' }));
    useWardrobeStore.getState().equipItem(makeItem({ id: 't', slot: 'top' }));
    useWardrobeStore.getState().equipItem(makeItem({ id: 's', slot: 'shoes' }));
    useWardrobeStore.getState().clearWardrobe();
    expect(useWardrobeStore.getState().equippedItems).toEqual({});
  });
});

describe('wardrobeStore — setWardrobeItems (catalog)', () => {
  beforeEach(reset);

  it('sets the wardrobe catalog', () => {
    const items = [
      makeItem({ id: 'a', name: 'Fedora' }),
      makeItem({ id: 'b', name: 'Beanie' }),
      makeItem({ id: 'c', name: 'Cap' }),
    ];
    useWardrobeStore.getState().setWardrobeItems(items);
    expect(useWardrobeStore.getState().wardrobeItems).toHaveLength(3);
  });

  it('replaces existing catalog', () => {
    useWardrobeStore.getState().setWardrobeItems([makeItem({ id: 'old' })]);
    useWardrobeStore.getState().setWardrobeItems([makeItem({ id: 'new' })]);
    expect(useWardrobeStore.getState().wardrobeItems).toHaveLength(1);
    expect(useWardrobeStore.getState().wardrobeItems[0].id).toBe('new');
  });
});

describe('wardrobeStore — WardrobeSlot type', () => {
  it('all 6 slots are valid', () => {
    const slots: WardrobeSlot[] = ['hair', 'top', 'bottom', 'shoes', 'accessory_1', 'accessory_2'];
    expect(slots).toHaveLength(6);
    for (const slot of slots) {
      const item = makeItem({ slot });
      useWardrobeStore.getState().equipItem(item);
      expect(useWardrobeStore.getState().equippedItems[slot]).toBeDefined();
    }
  });
});
