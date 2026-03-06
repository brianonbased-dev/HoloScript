'use client';
/**
 * useInventory — Hook for item inventory management
 */
import { useState, useCallback, useRef } from 'react';
import { InventorySystem, type ItemDef, type ItemCategory, type ItemRarity, type InventorySlot } from '@holoscript/core';

const SAMPLE_ITEMS: ItemDef[] = [
  { id: 'sword', name: 'Iron Sword', category: 'weapon', rarity: 'common', weight: 3, maxStack: 1, value: 50, properties: { damage: 10 } },
  { id: 'shield', name: 'Oak Shield', category: 'armor', rarity: 'uncommon', weight: 5, maxStack: 1, value: 80, properties: { defense: 8 } },
  { id: 'potion', name: 'Health Potion', category: 'consumable', rarity: 'common', weight: 0.5, maxStack: 20, value: 10, properties: { heal: 50 } },
  { id: 'gem', name: 'Ruby Gem', category: 'material', rarity: 'rare', weight: 0.2, maxStack: 50, value: 200, properties: {} },
  { id: 'scroll', name: 'Ancient Scroll', category: 'quest', rarity: 'epic', weight: 0.1, maxStack: 1, value: 0, properties: {} },
  { id: 'ring', name: 'Ring of Power', category: 'misc', rarity: 'legendary', weight: 0.05, maxStack: 1, value: 5000, properties: { allStats: 5 } },
];

export interface UseInventoryReturn {
  inventory: InventorySystem;
  slots: InventorySlot[];
  weight: number;
  maxWeight: number;
  slotCount: number;
  maxSlots: number;
  sampleItems: ItemDef[];
  addItem: (item: ItemDef, qty?: number) => { added: number; remaining: number };
  removeItem: (itemId: string, qty?: number) => void;
  sortBy: (by: 'name' | 'rarity' | 'category' | 'weight') => void;
  addRandom: () => void;
  reset: () => void;
}

export function useInventory(): UseInventoryReturn {
  const invRef = useRef(new InventorySystem(20, 50));
  const [slots, setSlots] = useState<InventorySlot[]>([]);
  const [weight, setWeight] = useState(0);
  const [slotCount, setSlotCount] = useState(0);

  const sync = useCallback(() => {
    setSlots(invRef.current.getAllItems());
    setWeight(invRef.current.getCurrentWeight());
    setSlotCount(invRef.current.getSlotCount());
  }, []);

  const addItem = useCallback((item: ItemDef, qty = 1) => { const r = invRef.current.addItem(item, qty); sync(); return r; }, [sync]);
  const removeItem = useCallback((itemId: string, qty = 1) => { invRef.current.removeItem(itemId, qty); sync(); }, [sync]);
  const sortBy = useCallback((by: 'name' | 'rarity' | 'category' | 'weight') => { invRef.current.sort(by); sync(); }, [sync]);
  const addRandom = useCallback(() => { const item = SAMPLE_ITEMS[Math.floor(Math.random() * SAMPLE_ITEMS.length)]; invRef.current.addItem(item, Math.ceil(Math.random() * 3)); sync(); }, [sync]);
  const reset = useCallback(() => { invRef.current = new InventorySystem(20, 50); sync(); }, [sync]);

  return { inventory: invRef.current, slots, weight, maxWeight: 50, slotCount, maxSlots: 20, sampleItems: SAMPLE_ITEMS, addItem, removeItem, sortBy, addRandom, reset };
}
