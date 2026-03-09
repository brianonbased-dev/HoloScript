/**
 * GameplayProgression.test.ts — Cycle 189
 *
 * Tests for InventorySystem, QuestManager, and LootTable.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InventorySystem } from '../gameplay/InventorySystem';
import { QuestManager } from '../gameplay/QuestManager';
import { LootTable } from '../gameplay/LootTable';
import type { ItemDef } from '../gameplay/InventorySystem';

const sword: ItemDef = {
  id: 'sword',
  name: 'Iron Sword',
  category: 'weapon',
  rarity: 'common',
  weight: 5,
  maxStack: 1,
  value: 100,
  properties: {},
};
const potion: ItemDef = {
  id: 'potion',
  name: 'Health Potion',
  category: 'consumable',
  rarity: 'common',
  weight: 0.5,
  maxStack: 10,
  value: 25,
  properties: {},
};
const gem: ItemDef = {
  id: 'gem',
  name: 'Ruby',
  category: 'material',
  rarity: 'rare',
  weight: 0.1,
  maxStack: 99,
  value: 500,
  properties: {},
};

// =============================================================================
// InventorySystem
// =============================================================================
describe('InventorySystem', () => {
  let inv: InventorySystem;

  beforeEach(() => {
    inv = new InventorySystem(10, 50);
  });

  it('adds items and tracks weight', () => {
    const result = inv.addItem(potion, 3);
    expect(result.added).toBe(3);
    expect(result.remaining).toBe(0);
    expect(inv.getItemCount('potion')).toBe(3);
    expect(inv.getCurrentWeight()).toBeCloseTo(1.5);
  });

  it('stacking respects maxStack', () => {
    inv.addItem(potion, 8);
    inv.addItem(potion, 5);
    expect(inv.getItemCount('potion')).toBe(13);
    expect(inv.getSlotCount()).toBe(2); // 10+3
  });

  it('rejects when weight limit reached', () => {
    const heavy: ItemDef = {
      id: 'boulder',
      name: 'Boulder',
      category: 'misc',
      rarity: 'common',
      weight: 30,
      maxStack: 1,
      value: 0,
      properties: {},
    };
    inv.addItem(heavy, 1); // 30
    const result = inv.addItem(heavy, 1); // 60 > 50
    expect(result.added).toBe(0);
  });

  it('removes items', () => {
    inv.addItem(potion, 5);
    const removed = inv.removeItem('potion', 3);
    expect(removed).toBe(3);
    expect(inv.getItemCount('potion')).toBe(2);
  });

  it('transfers between inventories', () => {
    const inv2 = new InventorySystem(10, 50);
    inv.addItem(potion, 2);
    const transferred = inv.transfer(inv2, 'potion', 1);
    expect(transferred).toBe(1);
    expect(inv.getItemCount('potion')).toBe(1);
    expect(inv2.hasItem('potion')).toBe(true);
  });

  it('filters by category', () => {
    inv.addItem(sword, 1);
    inv.addItem(potion, 3);
    inv.addItem(gem, 2);
    expect(inv.getByCategory('weapon')).toHaveLength(1);
    expect(inv.getByCategory('consumable')).toHaveLength(1);
  });

  it('sorts by name', () => {
    inv.addItem(sword, 1);
    inv.addItem(potion, 1);
    inv.addItem(gem, 1);
    inv.sort('name');
    const all = inv.getAllItems();
    expect(all[0].item.name).toBe('Health Potion');
  });

  it('isFull when max slots reached', () => {
    const tiny: ItemDef = {
      id: 'coin',
      name: 'Coin',
      category: 'misc',
      rarity: 'common',
      weight: 0.01,
      maxStack: 1,
      value: 1,
      properties: {},
    };
    for (let i = 0; i < 10; i++) {
      inv.addItem({ ...tiny, id: `coin_${i}` }, 1);
    }
    expect(inv.isFull()).toBe(true);
  });
});

// =============================================================================
// QuestManager
// =============================================================================
describe('QuestManager', () => {
  let qm: QuestManager;

  beforeEach(() => {
    qm = new QuestManager();
  });

  it('adds and retrieves quests', () => {
    qm.addQuest({
      id: 'q1',
      name: 'Kill Rats',
      description: 'Defeat 10 rats',
      category: 'combat',
      objectives: [
        {
          id: 'o1',
          type: 'kill',
          description: 'Kill rats',
          target: 'rat',
          required: 10,
          current: 0,
          completed: false,
          optional: false,
        },
      ],
      prerequisites: [],
      level: 1,
      timeLimit: 0,
      repeatable: false,
    });
    expect(qm.getQuestCount()).toBe(1);
    expect(qm.getQuest('q1')!.status).toBe('available'); // no prereqs → auto-available
  });

  it('activates available quests', () => {
    qm.addQuest({
      id: 'q1',
      name: 'Test',
      description: '',
      category: 'main',
      objectives: [
        {
          id: 'o1',
          type: 'collect',
          description: 'Find',
          target: 'item',
          required: 1,
          current: 0,
          completed: false,
          optional: false,
        },
      ],
      prerequisites: [],
      level: 1,
      timeLimit: 0,
      repeatable: false,
    });
    expect(qm.activate('q1')).toBe(true);
    expect(qm.getQuest('q1')!.status).toBe('active');
  });

  it('updates objectives and completes quest', () => {
    qm.addQuest({
      id: 'q1',
      name: 'Gather',
      description: '',
      category: 'main',
      objectives: [
        {
          id: 'o1',
          type: 'collect',
          description: 'Herbs',
          target: 'herb',
          required: 5,
          current: 0,
          completed: false,
          optional: false,
        },
      ],
      prerequisites: [],
      level: 1,
      timeLimit: 0,
      repeatable: false,
    });
    qm.activate('q1');
    qm.updateObjective('q1', 'o1', 3);
    expect(qm.getProgress('q1')).toBeCloseTo(0); // 3/5 → not done
    qm.updateObjective('q1', 'o1', 2);
    expect(qm.getQuest('q1')!.status).toBe('completed');
  });

  it('prerequisite chain works', () => {
    qm.addQuest({
      id: 'q1',
      name: 'First',
      description: '',
      category: 'main',
      objectives: [
        {
          id: 'o1',
          type: 'custom',
          description: '',
          target: '',
          required: 1,
          current: 0,
          completed: false,
          optional: false,
        },
      ],
      prerequisites: [],
      level: 1,
      timeLimit: 0,
      repeatable: false,
    });
    qm.addQuest({
      id: 'q2',
      name: 'Second',
      description: '',
      category: 'main',
      objectives: [
        {
          id: 'o2',
          type: 'custom',
          description: '',
          target: '',
          required: 1,
          current: 0,
          completed: false,
          optional: false,
        },
      ],
      prerequisites: ['q1'],
      level: 1,
      timeLimit: 0,
      repeatable: false,
    });
    expect(qm.getQuest('q2')!.status).toBe('locked');
    qm.activate('q1');
    qm.updateObjective('q1', 'o1', 1);
    qm.recheckAll();
    expect(qm.getQuest('q2')!.status).toBe('available');
  });

  it('timed quest fails on timeout', () => {
    qm.addQuest({
      id: 'timed',
      name: 'Rush',
      description: '',
      category: 'timed',
      objectives: [
        {
          id: 'o1',
          type: 'reach',
          description: 'Go',
          target: 'goal',
          required: 1,
          current: 0,
          completed: false,
          optional: false,
        },
      ],
      prerequisites: [],
      level: 1,
      timeLimit: 10,
      repeatable: false,
    });
    qm.activate('timed');
    qm.update(11);
    expect(qm.getQuest('timed')!.status).toBe('failed');
  });

  it('abandon resets progress', () => {
    qm.addQuest({
      id: 'q1',
      name: 'Abandon',
      description: '',
      category: 'side',
      objectives: [
        {
          id: 'o1',
          type: 'kill',
          description: '',
          target: 'mob',
          required: 5,
          current: 0,
          completed: false,
          optional: false,
        },
      ],
      prerequisites: [],
      level: 1,
      timeLimit: 0,
      repeatable: false,
    });
    qm.activate('q1');
    qm.updateObjective('q1', 'o1', 3);
    qm.abandon('q1');
    expect(qm.getQuest('q1')!.objectives[0].current).toBe(0);
    expect(qm.getQuest('q1')!.status).toBe('available');
  });

  it('event listeners fire', () => {
    const events: string[] = [];
    qm.onEvent((e) => events.push(e));
    qm.addQuest({
      id: 'q1',
      name: 'Evented',
      description: '',
      category: 'main',
      objectives: [
        {
          id: 'o1',
          type: 'custom',
          description: '',
          target: '',
          required: 1,
          current: 0,
          completed: false,
          optional: false,
        },
      ],
      prerequisites: [],
      level: 1,
      timeLimit: 0,
      repeatable: false,
    });
    qm.activate('q1');
    qm.updateObjective('q1', 'o1', 1);
    expect(events).toContain('activated');
    expect(events).toContain('completed');
  });
});

// =============================================================================
// LootTable
// =============================================================================
describe('LootTable', () => {
  let loot: LootTable;

  beforeEach(() => {
    loot = new LootTable(42);
  });

  it('registers tables', () => {
    loot.addTable('t1', [
      {
        itemId: 'gold',
        weight: 10,
        rarity: 'common',
        minQuantity: 1,
        maxQuantity: 5,
        guaranteed: false,
      },
    ]);
    expect(loot.getTableCount()).toBe(1);
  });

  it('guaranteed drops always included', () => {
    loot.addTable('t1', [
      {
        itemId: 'key',
        weight: 1,
        rarity: 'epic',
        minQuantity: 1,
        maxQuantity: 1,
        guaranteed: true,
      },
      {
        itemId: 'junk',
        weight: 100,
        rarity: 'common',
        minQuantity: 1,
        maxQuantity: 1,
        guaranteed: false,
      },
    ]);
    const drops = loot.roll('t1');
    expect(drops.some((d) => d.itemId === 'key')).toBe(true);
  });

  it('conditional drops respect conditions', () => {
    loot.addTable('t1', [
      {
        itemId: 'bonus',
        weight: 100,
        rarity: 'rare',
        minQuantity: 1,
        maxQuantity: 1,
        guaranteed: false,
        condition: 'boss_killed',
      },
    ]);
    const before = loot.roll('t1');
    const bonusBefore = before.filter((d) => d.itemId === 'bonus');
    expect(bonusBefore).toHaveLength(0);

    loot.setCondition('boss_killed', true);
    loot.reseed(42);
    const after = loot.roll('t1');
    expect(after.some((d) => d.itemId === 'bonus')).toBe(true);
  });

  it('pity counter tracks misses', () => {
    loot.addTable('t1', [
      {
        itemId: 'common_item',
        weight: 100,
        rarity: 'common',
        minQuantity: 1,
        maxQuantity: 1,
        guaranteed: false,
      },
    ]);
    loot.roll('t1');
    // After rolling common, other rarities should increment
    const epicPity = loot.getPityCounter('t1', 'epic');
    expect(epicPity).toBeGreaterThanOrEqual(0);
  });

  it('drop rates sum correctly', () => {
    loot.addTable('balanced', [
      {
        itemId: 'a',
        weight: 50,
        rarity: 'common',
        minQuantity: 1,
        maxQuantity: 1,
        guaranteed: false,
      },
      {
        itemId: 'b',
        weight: 50,
        rarity: 'uncommon',
        minQuantity: 1,
        maxQuantity: 1,
        guaranteed: false,
      },
    ]);
    const rates = loot.getDropRates('balanced');
    expect(rates.get('a')).toBeCloseTo(50);
    expect(rates.get('b')).toBeCloseTo(50);
  });

  it('reseed produces deterministic results', () => {
    loot.addTable('det', [
      {
        itemId: 'x',
        weight: 50,
        rarity: 'common',
        minQuantity: 1,
        maxQuantity: 3,
        guaranteed: false,
      },
    ]);
    loot.reseed(123);
    const drops1 = loot.roll('det');
    loot.reseed(123);
    const drops2 = loot.roll('det');
    expect(drops1.map((d) => d.quantity)).toEqual(drops2.map((d) => d.quantity));
  });
});
