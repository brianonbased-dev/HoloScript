import { describe, it, expect } from 'vitest';
import { CharacterInventory } from '../CharacterInventory';
import type { InventoryItem } from '../CharacterInventory';

function sword(): InventoryItem {
  return {
    id: 'sword-01',
    name: 'Iron Sword',
    slots: ['weapon'],
    bonuses: { strength: 5, speed: -1 },
    weight: 3,
  };
}

function helmet(): InventoryItem {
  return {
    id: 'helm-01',
    name: 'Steel Helmet',
    slots: ['head'],
    bonuses: { defense: 3, maxHealth: 10 },
    weight: 2,
  };
}

function potion(): InventoryItem {
  return {
    id: 'potion-hp',
    name: 'Health Potion',
    slots: [],
    bonuses: {},
    weight: 0.5,
    stackable: true,
    count: 5,
  };
}

describe('CharacterInventory', () => {
  it('starts with empty bag and no equipped items', () => {
    const inv = new CharacterInventory();
    expect(inv.bagCount).toBe(0);
    expect(inv.totalWeight).toBe(0);
    expect(inv.getEquipped('weapon')).toBeNull();
  });

  it('addItem puts item in bag', () => {
    const inv = new CharacterInventory();
    expect(inv.addItem(sword())).toBe(true);
    expect(inv.bagCount).toBe(1);
    expect(inv.findItem('sword-01')).not.toBeNull();
  });

  it('stackable items merge counts', () => {
    const inv = new CharacterInventory();
    inv.addItem(potion()); // count 5
    inv.addItem({ ...potion(), count: 3 }); // merge
    expect(inv.bagCount).toBe(1);
    const p = inv.findItem('potion-hp');
    expect(p?.count).toBe(8);
  });

  it('equip moves item from bag to slot', () => {
    const inv = new CharacterInventory();
    inv.addItem(sword());
    expect(inv.equip('sword-01', 'weapon')).toBe(true);
    expect(inv.getEquipped('weapon')?.id).toBe('sword-01');
    expect(inv.bagCount).toBe(0);
    expect(inv.isEquipped('sword-01')).toBe(true);
  });

  it('equip to wrong slot fails', () => {
    const inv = new CharacterInventory();
    inv.addItem(sword());
    expect(inv.equip('sword-01', 'head')).toBe(false);
    expect(inv.getEquipped('head')).toBeNull();
  });

  it('equip swaps if slot is occupied', () => {
    const inv = new CharacterInventory();
    const s1 = sword();
    const s2: InventoryItem = { ...sword(), id: 'sword-02', name: 'Steel Sword' };
    inv.addItem(s1);
    inv.addItem(s2);
    inv.equip('sword-01', 'weapon');
    inv.equip('sword-02', 'weapon');
    expect(inv.getEquipped('weapon')?.id).toBe('sword-02');
    // Old sword back in bag
    expect(inv.findItem('sword-01')).not.toBeNull();
    expect(inv.bagCount).toBe(1);
  });

  it('unequip returns item to bag', () => {
    const inv = new CharacterInventory();
    inv.addItem(helmet());
    inv.equip('helm-01', 'head');
    expect(inv.unequip('head')).toBe(true);
    expect(inv.getEquipped('head')).toBeNull();
    expect(inv.bagCount).toBe(1);
  });

  it('unequip empty slot returns false', () => {
    const inv = new CharacterInventory();
    expect(inv.unequip('weapon')).toBe(false);
  });

  it('getEquipmentBonuses sums all equipped bonuses', () => {
    const inv = new CharacterInventory();
    inv.addItem(sword());
    inv.addItem(helmet());
    inv.equip('sword-01', 'weapon');
    inv.equip('helm-01', 'head');
    const b = inv.getEquipmentBonuses();
    expect(b.strength).toBe(5);
    expect(b.defense).toBe(3);
    expect(b.maxHealth).toBe(10);
    expect(b.speed).toBe(-1);
  });

  it('maxWeight prevents adding heavy items', () => {
    const inv = new CharacterInventory({ maxWeight: 5 });
    inv.addItem(sword()); // weight 3
    expect(inv.addItem({ ...sword(), id: 'sword-02', weight: 3 })).toBe(false);
    expect(inv.bagCount).toBe(1);
  });

  it('maxSlots prevents adding too many items', () => {
    const inv = new CharacterInventory({ maxSlots: 1 });
    inv.addItem(sword());
    expect(inv.addItem(helmet())).toBe(false);
  });

  it('removeItem removes from bag', () => {
    const inv = new CharacterInventory();
    inv.addItem(sword());
    const removed = inv.removeItem('sword-01');
    expect(removed?.id).toBe('sword-01');
    expect(inv.bagCount).toBe(0);
  });

  it('removeItem partial stack', () => {
    const inv = new CharacterInventory();
    inv.addItem(potion()); // count 5
    const removed = inv.removeItem('potion-hp', 2);
    expect(removed?.count).toBe(2);
    expect(inv.findItem('potion-hp')?.count).toBe(3);
  });

  it('removeItem nonexistent returns null', () => {
    const inv = new CharacterInventory();
    expect(inv.removeItem('nope')).toBeNull();
  });

  it('clear empties everything', () => {
    const inv = new CharacterInventory();
    inv.addItem(sword());
    inv.addItem(helmet());
    inv.equip('sword-01', 'weapon');
    inv.clear();
    expect(inv.bagCount).toBe(0);
    expect(inv.getEquipped('weapon')).toBeNull();
    expect(inv.totalWeight).toBe(0);
  });

  it('getAllEquipped returns copy of equipped map', () => {
    const inv = new CharacterInventory();
    inv.addItem(sword());
    inv.equip('sword-01', 'weapon');
    const all = inv.getAllEquipped();
    expect(all.size).toBe(1);
    expect(all.get('weapon')?.id).toBe('sword-01');
  });

  it('totalWeight accounts for equipped and bag items', () => {
    const inv = new CharacterInventory();
    inv.addItem(sword()); // weight 3
    inv.addItem(helmet()); // weight 2
    inv.equip('sword-01', 'weapon');
    // sword equipped (3) + helmet in bag (2) = 5
    expect(inv.totalWeight).toBe(5);
  });
});
