/**
 * InventorySystem — slot-based inventory with stacking, weight limits, and sorting.
 * @module gameplay
 */

export interface ItemDef {
  id: string;
  name: string;
  category: string;
  rarity: string;
  weight: number;
  maxStack: number;
  value: number;
  properties: Record<string, unknown>;
}

export interface InventorySlot {
  item: ItemDef;
  quantity: number;
}

export interface AddResult {
  added: number;
  remaining: number;
}

const RARITY_ORDER: Record<string, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  uncommon: 3,
  common: 4,
};

export class InventorySystem {
  private slots: InventorySlot[] = [];
  private maxSlots: number;
  private maxWeight: number;
  private currentWeight = 0;

  constructor(maxSlots = 40, maxWeight = 100) {
    this.maxSlots = maxSlots;
    this.maxWeight = maxWeight;
  }

  getMaxSlots(): number {
    return this.maxSlots;
  }

  getMaxWeight(): number {
    return this.maxWeight;
  }

  getSlotCount(): number {
    return this.slots.length;
  }

  getCurrentWeight(): number {
    return this.currentWeight;
  }

  isFull(): boolean {
    return this.slots.length >= this.maxSlots;
  }

  getSlot(index: number): InventorySlot | undefined {
    return this.slots[index];
  }

  addItem(item: ItemDef, quantity = 1): AddResult {
    let added = 0;
    let remaining = quantity;

    // Try to stack into existing slots first
    for (const slot of this.slots) {
      if (remaining <= 0) break;
      if (slot.item.id === item.id) {
        const canAdd = slot.item.maxStack - slot.quantity;
        if (canAdd > 0) {
          const byWeight =
            item.weight > 0
              ? Math.floor((this.maxWeight - this.currentWeight) / item.weight)
              : remaining;
          const toAdd = Math.min(canAdd, remaining, byWeight);
          if (toAdd <= 0) break;
          slot.quantity += toAdd;
          this.currentWeight += toAdd * item.weight;
          added += toAdd;
          remaining -= toAdd;
        }
      }
    }

    // Create new slots for remainder
    while (remaining > 0 && this.slots.length < this.maxSlots) {
      const byWeight =
        item.weight > 0
          ? Math.floor((this.maxWeight - this.currentWeight) / item.weight)
          : remaining;
      if (byWeight <= 0) break;
      const toAdd = Math.min(item.maxStack, remaining, byWeight);
      if (toAdd <= 0) break;
      this.slots.push({ item: { ...item }, quantity: toAdd });
      this.currentWeight += toAdd * item.weight;
      added += toAdd;
      remaining -= toAdd;
    }

    return { added, remaining };
  }

  removeItem(itemId: string, quantity = 1): number {
    let removed = 0;
    for (let i = this.slots.length - 1; i >= 0; i--) {
      if (this.slots[i].item.id !== itemId) continue;
      const slot = this.slots[i];
      const toRemove = Math.min(slot.quantity, quantity - removed);
      slot.quantity -= toRemove;
      this.currentWeight -= toRemove * slot.item.weight;
      removed += toRemove;
      if (slot.quantity <= 0) {
        this.slots.splice(i, 1);
      }
      if (removed >= quantity) break;
    }
    return removed;
  }

  transfer(target: InventorySystem, itemId: string, quantity: number): number {
    // Find the item def from source
    const slot = this.slots.find((s) => s.item.id === itemId);
    if (!slot) return 0;
    const actualRemove = Math.min(slot.quantity, quantity);
    if (actualRemove <= 0) return 0;
    // Calculate how many items across all slots
    const totalAvailable = this.getItemCount(itemId);
    const toTransfer = Math.min(totalAvailable, quantity);
    const result = target.addItem(slot.item, toTransfer);
    if (result.added > 0) {
      this.removeItem(itemId, result.added);
    }
    return result.added;
  }

  hasItem(itemId: string, quantity = 1): boolean {
    return this.getItemCount(itemId) >= quantity;
  }

  getItemCount(itemId: string): number {
    let count = 0;
    for (const slot of this.slots) {
      if (slot.item.id === itemId) count += slot.quantity;
    }
    return count;
  }

  getByCategory(category: string): InventorySlot[] {
    return this.slots.filter((s) => s.item.category === category);
  }

  getAllItems(): InventorySlot[] {
    return [...this.slots];
  }

  sort(by: 'name' | 'rarity' | 'weight'): void {
    switch (by) {
      case 'name':
        this.slots.sort((a, b) => a.item.name.localeCompare(b.item.name));
        break;
      case 'rarity':
        this.slots.sort(
          (a, b) => (RARITY_ORDER[a.item.rarity] ?? 99) - (RARITY_ORDER[b.item.rarity] ?? 99)
        );
        break;
      case 'weight':
        this.slots.sort((a, b) => b.item.weight - a.item.weight);
        break;
    }
  }
}
