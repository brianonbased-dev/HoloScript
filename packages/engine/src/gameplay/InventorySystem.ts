/**
 * InventorySystem.ts
 *
 * Item inventory: slots, stacking, weight limits,
 * categories, filters, transfer, and sorting.
 *
 * @module gameplay
 */

// =============================================================================
// TYPES
// =============================================================================

export type ItemCategory = 'weapon' | 'armor' | 'consumable' | 'material' | 'quest' | 'misc';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  weight: number;
  maxStack: number;
  value: number;
  properties: Record<string, unknown>;
}

export interface InventorySlot {
  item: ItemDef;
  quantity: number;
  slotIndex: number;
}

// =============================================================================
// INVENTORY SYSTEM
// =============================================================================

export class InventorySystem {
  private slots: Map<number, InventorySlot> = new Map();
  private maxSlots: number;
  private maxWeight: number;
  private currentWeight = 0;

  constructor(maxSlots = 40, maxWeight = 100) {
    this.maxSlots = maxSlots;
    this.maxWeight = maxWeight;
  }

  // ---------------------------------------------------------------------------
  // Add / Remove
  // ---------------------------------------------------------------------------

  addItem(item: ItemDef, quantity = 1): { added: number; remaining: number } {
    let remaining = quantity;

    // Try stacking on existing slots first
    for (const [, slot] of this.slots) {
      if (slot.item.id === item.id && slot.quantity < item.maxStack) {
        const space = item.maxStack - slot.quantity;
        const toAdd = Math.min(space, remaining);
        const weightNeeded = toAdd * item.weight;

        if (this.currentWeight + weightNeeded > this.maxWeight) {
          const canAdd = Math.floor((this.maxWeight - this.currentWeight) / item.weight);
          if (canAdd <= 0) break;
          slot.quantity += canAdd;
          this.currentWeight += canAdd * item.weight;
          remaining -= canAdd;
          break;
        }

        slot.quantity += toAdd;
        this.currentWeight += weightNeeded;
        remaining -= toAdd;
        if (remaining <= 0) break;
      }
    }

    // Fill new slots
    while (remaining > 0 && this.slots.size < this.maxSlots) {
      const toAdd = Math.min(item.maxStack, remaining);
      const weightNeeded = toAdd * item.weight;

      if (this.currentWeight + weightNeeded > this.maxWeight) {
        const canAdd = Math.floor((this.maxWeight - this.currentWeight) / item.weight);
        if (canAdd <= 0) break;
        const slotIndex = this.getNextFreeSlot();
        this.slots.set(slotIndex, { item: { ...item }, quantity: canAdd, slotIndex });
        this.currentWeight += canAdd * item.weight;
        remaining -= canAdd;
        break;
      }

      const slotIndex = this.getNextFreeSlot();
      this.slots.set(slotIndex, { item: { ...item }, quantity: toAdd, slotIndex });
      this.currentWeight += weightNeeded;
      remaining -= toAdd;
    }

    return { added: quantity - remaining, remaining };
  }

  removeItem(itemId: string, quantity = 1): number {
    let remaining = quantity;

    for (const [idx, slot] of this.slots) {
      if (slot.item.id !== itemId) continue;

      const toRemove = Math.min(slot.quantity, remaining);
      slot.quantity -= toRemove;
      this.currentWeight -= toRemove * slot.item.weight;
      remaining -= toRemove;

      if (slot.quantity <= 0) this.slots.delete(idx);
      if (remaining <= 0) break;
    }

    return quantity - remaining;
  }

  // ---------------------------------------------------------------------------
  // Transfer
  // ---------------------------------------------------------------------------

  transfer(target: InventorySystem, itemId: string, quantity = 1): number {
    const removed = this.removeItem(itemId, quantity);
    if (removed === 0) return 0;

    const item = this.findItemDef(itemId);
    if (!item) return 0;

    const { added } = target.addItem(item, removed);
    // Return unaccepted items
    if (added < removed) {
      this.addItem(item, removed - added);
    }
    return added;
  }

  private findItemDef(itemId: string): ItemDef | undefined {
    for (const slot of this.slots.values()) {
      if (slot.item.id === itemId) return slot.item;
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getSlot(index: number): InventorySlot | undefined {
    return this.slots.get(index);
  }
  getSlotCount(): number {
    return this.slots.size;
  }
  getMaxSlots(): number {
    return this.maxSlots;
  }
  getCurrentWeight(): number {
    return Math.round(this.currentWeight * 100) / 100;
  }
  getMaxWeight(): number {
    return this.maxWeight;
  }
  isFull(): boolean {
    return this.slots.size >= this.maxSlots;
  }

  getItemCount(itemId: string): number {
    let count = 0;
    for (const slot of this.slots.values()) {
      if (slot.item.id === itemId) count += slot.quantity;
    }
    return count;
  }

  hasItem(itemId: string, quantity = 1): boolean {
    return this.getItemCount(itemId) >= quantity;
  }

  getByCategory(category: ItemCategory): InventorySlot[] {
    return [...this.slots.values()].filter((s) => s.item.category === category);
  }

  getAllItems(): InventorySlot[] {
    return [...this.slots.values()];
  }

  sort(by: 'name' | 'rarity' | 'category' | 'weight' = 'name'): void {
    const items = [...this.slots.values()];
    const rarityOrder: ItemRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

    items.sort((a, b) => {
      switch (by) {
        case 'name':
          return a.item.name.localeCompare(b.item.name);
        case 'rarity':
          return rarityOrder.indexOf(b.item.rarity) - rarityOrder.indexOf(a.item.rarity);
        case 'category':
          return a.item.category.localeCompare(b.item.category);
        case 'weight':
          return b.item.weight - a.item.weight;
      }
    });

    this.slots.clear();
    items.forEach((item, i) => {
      item.slotIndex = i;
      this.slots.set(i, item);
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getNextFreeSlot(): number {
    for (let i = 0; i < this.maxSlots; i++) {
      if (!this.slots.has(i)) return i;
    }
    return this.slots.size;
  }
}

