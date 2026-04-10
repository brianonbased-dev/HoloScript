/**
 * CharacterInventory — equip slots, stat bonuses from equipped items.
 * Self-contained. No external dependencies.
 */

export type EquipSlot = 'head' | 'body' | 'hands' | 'feet' | 'weapon';

export interface StatBonuses {
  maxHealth?: number;
  maxMana?: number;
  maxStamina?: number;
  strength?: number;
  defense?: number;
  speed?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  /** Which slot(s) this item can be equipped in. */
  slots: EquipSlot[];
  /** Stat bonuses when equipped. */
  bonuses: StatBonuses;
  /** Item weight (for capacity checks). */
  weight?: number;
  /** Whether the item is stackable. */
  stackable?: boolean;
  /** Stack count (only meaningful if stackable). */
  count?: number;
}

export interface InventoryConfig {
  /** Maximum total weight capacity. 0 = unlimited. */
  maxWeight?: number;
  /** Maximum number of bag slots. 0 = unlimited. */
  maxSlots?: number;
}

export class CharacterInventory {
  private _equipped: Map<EquipSlot, InventoryItem> = new Map();
  private _bag: InventoryItem[] = [];
  private _maxWeight: number;
  private _maxSlots: number;

  constructor(config: InventoryConfig = {}) {
    this._maxWeight = config.maxWeight ?? 0;
    this._maxSlots = config.maxSlots ?? 0;
  }

  /** Get the item equipped in a given slot, or null. */
  getEquipped(slot: EquipSlot): InventoryItem | null {
    return this._equipped.get(slot) ?? null;
  }

  /** Get all equipped items as a map. */
  getAllEquipped(): ReadonlyMap<EquipSlot, InventoryItem> {
    return new Map(this._equipped);
  }

  /** Get all items in the bag (unequipped). */
  getBag(): ReadonlyArray<InventoryItem> {
    return [...this._bag];
  }

  /** Total weight of bag + equipped items. */
  get totalWeight(): number {
    let w = 0;
    for (const item of this._bag) w += (item.weight ?? 0) * (item.count ?? 1);
    for (const [, item] of this._equipped) w += item.weight ?? 0;
    return w;
  }

  /** Number of distinct bag slot entries. */
  get bagCount(): number {
    return this._bag.length;
  }

  /**
   * Add an item to the bag.
   * Returns false if capacity exceeded.
   */
  addItem(item: InventoryItem): boolean {
    // Stack check
    if (item.stackable) {
      const existing = this._bag.find((i) => i.id === item.id);
      if (existing) {
        existing.count = (existing.count ?? 1) + (item.count ?? 1);
        return true;
      }
    }

    // Slot capacity check
    if (this._maxSlots > 0 && this._bag.length >= this._maxSlots) return false;

    // Weight capacity check
    const addedWeight = (item.weight ?? 0) * (item.count ?? 1);
    if (this._maxWeight > 0 && this.totalWeight + addedWeight > this._maxWeight) return false;

    this._bag.push({ ...item, count: item.count ?? 1 });
    return true;
  }

  /**
   * Remove an item from the bag by id.
   * For stackable items, removes `count` from the stack (default 1).
   * Returns the removed item or null if not found.
   */
  removeItem(id: string, count: number = 1): InventoryItem | null {
    const idx = this._bag.findIndex((i) => i.id === id);
    if (idx === -1) return null;

    const item = this._bag[idx];
    if (item.stackable && (item.count ?? 1) > count) {
      item.count = (item.count ?? 1) - count;
      return { ...item, count };
    }

    return this._bag.splice(idx, 1)[0];
  }

  /**
   * Equip an item from the bag into the appropriate slot.
   * If the slot is occupied, the current item is unequipped back to the bag.
   * Returns false if the item is not in the bag or can't fit the slot.
   */
  equip(itemId: string, slot: EquipSlot): boolean {
    const bagIdx = this._bag.findIndex((i) => i.id === itemId);
    if (bagIdx === -1) return false;

    const item = this._bag[bagIdx];
    if (!item.slots.includes(slot)) return false;

    // Unequip current occupant
    const current = this._equipped.get(slot);
    if (current) {
      this._bag.push(current);
    }

    // Remove from bag (unstackable or take 1 from stack)
    if (item.stackable && (item.count ?? 1) > 1) {
      item.count = (item.count ?? 1) - 1;
      this._equipped.set(slot, { ...item, count: 1 });
    } else {
      this._bag.splice(bagIdx, 1);
      this._equipped.set(slot, item);
    }

    return true;
  }

  /**
   * Unequip an item from a slot back to the bag.
   * Returns false if the slot is empty or bag is full.
   */
  unequip(slot: EquipSlot): boolean {
    const item = this._equipped.get(slot);
    if (!item) return false;

    if (this._maxSlots > 0 && this._bag.length >= this._maxSlots) return false;

    this._equipped.delete(slot);
    this._bag.push(item);
    return true;
  }

  /**
   * Compute the total stat bonuses from all equipped items.
   */
  getEquipmentBonuses(): Required<StatBonuses> {
    const totals: Required<StatBonuses> = {
      maxHealth: 0,
      maxMana: 0,
      maxStamina: 0,
      strength: 0,
      defense: 0,
      speed: 0,
    };

    for (const [, item] of this._equipped) {
      totals.maxHealth += item.bonuses.maxHealth ?? 0;
      totals.maxMana += item.bonuses.maxMana ?? 0;
      totals.maxStamina += item.bonuses.maxStamina ?? 0;
      totals.strength += item.bonuses.strength ?? 0;
      totals.defense += item.bonuses.defense ?? 0;
      totals.speed += item.bonuses.speed ?? 0;
    }

    return totals;
  }

  /** Find an item in the bag by id. */
  findItem(id: string): InventoryItem | null {
    return this._bag.find((i) => i.id === id) ?? null;
  }

  /** Check if an item is equipped in any slot. */
  isEquipped(itemId: string): boolean {
    for (const [, item] of this._equipped) {
      if (item.id === itemId) return true;
    }
    return false;
  }

  /** Clear all equipped items and bag. */
  clear(): void {
    this._equipped.clear();
    this._bag = [];
  }
}
