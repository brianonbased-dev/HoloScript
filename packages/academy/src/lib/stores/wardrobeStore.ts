'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ─── Wardrobe Store ──────────────────────────────────────────────────────────
// Manages equipped items and available wardrobe catalog.
// Split from characterStore (Sprint 13 P1) to reduce coupling.

export type WardrobeSlot = 'hair' | 'top' | 'bottom' | 'shoes' | 'accessory_1' | 'accessory_2';

export interface WardrobeItem {
  id: string;
  name: string;
  slot: WardrobeSlot;
  thumbnail: string;
  modelUrl?: string;
  category: string;
}

interface WardrobeState {
  /** Equipped items by slot */
  equippedItems: Partial<Record<WardrobeSlot, WardrobeItem>>;
  /** Available wardrobe items */
  wardrobeItems: WardrobeItem[];

  // Actions
  equipItem: (item: WardrobeItem) => void;
  unequipSlot: (slot: WardrobeSlot) => void;
  clearWardrobe: () => void;
  setWardrobeItems: (items: WardrobeItem[]) => void;
}

export const useWardrobeStore = create<WardrobeState>()(
  devtools(
    (set) => ({
      equippedItems: {},
      wardrobeItems: [],

      equipItem: (item) =>
        set((s) => ({ equippedItems: { ...s.equippedItems, [item.slot]: item } })),
      unequipSlot: (slot) =>
        set((s) => {
          const next = { ...s.equippedItems };
          delete next[slot];
          return { equippedItems: next };
        }),
      clearWardrobe: () => set({ equippedItems: {} }),
      setWardrobeItems: (wardrobeItems) => set({ wardrobeItems }),
    }),
    { name: 'wardrobe-store' }
  )
);
