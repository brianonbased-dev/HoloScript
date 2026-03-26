// @vitest-environment jsdom
/**
 * Tests for wardrobeStore (Sprint 13 P1 split from characterStore)
 */

import { describe, it, expect, beforeEach } from 'vitest';

const { useWardrobeStore } = await import('@/lib/stores');

function reset() {
  useWardrobeStore.setState({ equippedItems: {}, wardrobeItems: [] });
}

describe('wardrobeStore', () => {
  beforeEach(reset);

  it('starts with empty equipped items', () => {
    expect(useWardrobeStore.getState().equippedItems).toEqual({});
  });

  it('equipItem equips by slot', () => {
    const item = { id: 'h1', name: 'Mohawk', slot: 'hair' as const, thumbnail: '💇', category: 'punk' };
    useWardrobeStore.getState().equipItem(item);
    expect(useWardrobeStore.getState().equippedItems.hair).toEqual(item);
  });

  it('equipItem replaces same slot', () => {
    const a = { id: 'h1', name: 'A', slot: 'hair' as const, thumbnail: '💇', category: 'a' };
    const b = { id: 'h2', name: 'B', slot: 'hair' as const, thumbnail: '💇', category: 'b' };
    useWardrobeStore.getState().equipItem(a);
    useWardrobeStore.getState().equipItem(b);
    expect(useWardrobeStore.getState().equippedItems.hair?.id).toBe('h2');
  });

  it('unequipSlot removes single slot', () => {
    const item = { id: 'h1', name: 'A', slot: 'top' as const, thumbnail: '👕', category: 'x' };
    useWardrobeStore.getState().equipItem(item);
    useWardrobeStore.getState().unequipSlot('top');
    expect(useWardrobeStore.getState().equippedItems.top).toBeUndefined();
  });

  it('clearWardrobe removes all', () => {
    const hair = { id: 'h1', name: 'A', slot: 'hair' as const, thumbnail: '💇', category: 'a' };
    const top = { id: 't1', name: 'B', slot: 'top' as const, thumbnail: '👕', category: 'b' };
    useWardrobeStore.getState().equipItem(hair);
    useWardrobeStore.getState().equipItem(top);
    useWardrobeStore.getState().clearWardrobe();
    expect(useWardrobeStore.getState().equippedItems).toEqual({});
  });

  it('setWardrobeItems sets catalog', () => {
    const items = [
      { id: 'h1', name: 'A', slot: 'hair' as const, thumbnail: '💇', category: 'a' },
    ];
    useWardrobeStore.getState().setWardrobeItems(items);
    expect(useWardrobeStore.getState().wardrobeItems).toHaveLength(1);
  });
});
