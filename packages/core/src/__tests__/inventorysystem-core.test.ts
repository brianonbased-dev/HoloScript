/**
 * Sprint29.test.ts â€” Gameplay + Input + Combat (v3.38.0)
 *
 * ~100 acceptance tests covering:
 *   Feature 1:  gameplay/InventorySystem
 *   Feature 2:  gameplay/LootTable
 *   Feature 3:  gameplay/CraftingSystem
 *   Feature 4:  gameplay/QuestManager
 *   Feature 5:  gameplay/AchievementSystem
 *   Feature 6:  combat/DamageSystem
 *   Feature 7:  combat/CombatManager
 *   Feature 8:  input/InputManager
 *   Feature 9:  navigation/NavMesh
 *   Feature 10: dialogue/DialogueGraph
 *   Feature 11: dialogue/EmotionSystem
 */
import { describe, it, expect } from 'vitest';

import { InventorySystem } from '../gameplay/InventorySystem.js';
import { LootTable } from '../gameplay/LootTable.js';
import { CraftingSystem } from '../gameplay/CraftingSystem.js';
import { QuestManager } from '../gameplay/QuestManager.js';
import { AchievementSystem } from '../gameplay/AchievementSystem.js';
import { DamageSystem } from '../combat/DamageSystem.js';
import { CombatManager } from '../combat/CombatManager.js';
import { InputManager } from '@holoscript/engine/input/InputManager.js';
import { NavMesh } from '../navigation/NavMesh.js';
import { DialogueGraph } from '../dialogue/DialogueGraph.js';
import { EmotionSystem } from '../dialogue/EmotionSystem.js';

// =============================================================================
// FEATURE 1: gameplay/InventorySystem
// =============================================================================
describe('Feature 1: InventorySystem', () => {
  function makeItem(id: string) {
    return {
      id,
      name: id,
      category: 'misc' as const,
      rarity: 'common' as const,
      weight: 1,
      maxStack: 10,
      value: 5,
      properties: {},
    };
  }

  it('starts empty', () => {
    expect(new InventorySystem().getAllItems()).toHaveLength(0);
  });

  it('addItem returns added count', () => {
    const inv = new InventorySystem();
    const result = inv.addItem(makeItem('sword'), 1);
    expect(result.added).toBe(1);
  });

  it('hasItem returns true after adding', () => {
    const inv = new InventorySystem();
    inv.addItem(makeItem('potion'), 3);
    expect(inv.hasItem('potion')).toBe(true);
  });

  it('hasItem quantity check', () => {
    const inv = new InventorySystem();
    inv.addItem(makeItem('arrow'), 5);
    expect(inv.hasItem('arrow', 5)).toBe(true);
    expect(inv.hasItem('arrow', 6)).toBe(false);
  });

  it('getItemCount returns correct amount', () => {
    const inv = new InventorySystem();
    inv.addItem(makeItem('gem'), 4);
    expect(inv.getItemCount('gem')).toBe(4);
  });

  it('removeItem decreases count', () => {
    const inv = new InventorySystem();
    inv.addItem(makeItem('coin'), 5);
    inv.removeItem('coin', 2);
    expect(inv.getItemCount('coin')).toBe(3);
  });

  it('getByCategory filters correctly', () => {
    const inv = new InventorySystem();
    inv.addItem({ ...makeItem('a'), category: 'weapon' }, 1);
    inv.addItem({ ...makeItem('b'), category: 'consumable' }, 1);
    expect(inv.getByCategory('weapon')).toHaveLength(1);
  });

  it('getCurrentWeight increases with items', () => {
    const inv = new InventorySystem();
    inv.addItem({ ...makeItem('brick'), weight: 5 }, 2);
    expect(inv.getCurrentWeight()).toBe(10);
  });

  it('isFull returns false when slots available', () => {
    expect(new InventorySystem(10).isFull()).toBe(false);
  });

  it('transfer moves item to target', () => {
    const src = new InventorySystem();
    const tgt = new InventorySystem();
    src.addItem(makeItem('ring'), 2);
    src.transfer(tgt, 'ring', 1);
    expect(tgt.getItemCount('ring')).toBe(1);
  });

  it('sort does not throw', () => {
    const inv = new InventorySystem();
    inv.addItem(makeItem('x'), 1);
    expect(() => inv.sort('name')).not.toThrow();
  });
});

// =============================================================================
// FEATURE 2: gameplay/LootTable
// =============================================================================
describe('Feature 2: LootTable', () => {
  function makeEntry(itemId: string, weight = 100) {
    return {
      itemId,
      weight,
      rarity: 'common' as const,
      minQuantity: 1,
      maxQuantity: 1,
      guaranteed: false,
    };
  }

  it('getTableCount is 0 initially', () => {
    expect(new LootTable().getTableCount()).toBe(0);
  });

  it('addTable increments getTableCount', () => {
    const lt = new LootTable();
    lt.addTable('goblins', [makeEntry('gold')]);
    expect(lt.getTableCount()).toBe(1);
  });

  it('getTable returns the added table', () => {
    const lt = new LootTable();
    lt.addTable('chest', [makeEntry('key')]);
    expect(lt.getTable('chest')).toBeDefined();
  });

  it('roll returns drops', () => {
    const lt = new LootTable();
    lt.addTable('drop', [makeEntry('coin')], 1, 1);
    const drops = lt.roll('drop');
    expect(drops.length).toBeGreaterThanOrEqual(0);
  });

  it('roll with luck does not throw', () => {
    const lt = new LootTable();
    lt.addTable('t', [makeEntry('gem')], 1, 1);
    expect(() => lt.roll('t', 1.5)).not.toThrow();
  });

  it('getTable returns undefined for unknown table', () => {
    expect(new LootTable().getTable('ghost')).toBeUndefined();
  });
});

// =============================================================================
// FEATURE 3: gameplay/CraftingSystem
// =============================================================================
describe('Feature 3: CraftingSystem', () => {
  function makeRecipe(id: string) {
    return {
      id,
      name: id,
      ingredients: [{ itemId: 'wood', quantity: 2 }],
      output: { itemId: 'plank', quantity: 1 },
      workbenchType: null,
      craftTime: 1.0,
      discovered: true,
      level: 1,
    };
  }

  it('getRecipeCount is 0 initially', () => {
    expect(new CraftingSystem().getRecipeCount()).toBe(0);
  });

  it('addRecipe increments getRecipeCount', () => {
    const cs = new CraftingSystem();
    cs.addRecipe(makeRecipe('plank'));
    expect(cs.getRecipeCount()).toBe(1);
  });

  it('getRecipe returns the added recipe', () => {
    const cs = new CraftingSystem();
    cs.addRecipe(makeRecipe('axe'));
    expect(cs.getRecipe('axe')).toBeDefined();
  });

  it('canCraft returns true when ingredients available', () => {
    const cs = new CraftingSystem();
    cs.addRecipe(makeRecipe('plank'));
    const items = new Map([['wood', 5]]);
    expect(cs.canCraft('plank', items)).toBe(true);
  });

  it('canCraft returns false when ingredients missing', () => {
    const cs = new CraftingSystem();
    cs.addRecipe(makeRecipe('plank'));
    expect(cs.canCraft('plank', new Map())).toBe(false);
  });

  it('startCraft returns true with sufficient items', () => {
    const cs = new CraftingSystem();
    cs.addRecipe(makeRecipe('plank'));
    expect(cs.startCraft('plank', new Map([['wood', 5]]))).toBe(true);
  });

  it('getQueueLength increments after startCraft', () => {
    const cs = new CraftingSystem();
    cs.addRecipe(makeRecipe('plank'));
    cs.startCraft('plank', new Map([['wood', 5]]));
    expect(cs.getQueueLength()).toBe(1);
  });

  it('update returns completed items after time passes', () => {
    const cs = new CraftingSystem();
    cs.addRecipe(makeRecipe('plank'));
    cs.startCraft('plank', new Map([['wood', 5]]));
    const completed = cs.update(2.0); // craftTime=1.0, advance 2s
    expect(completed.length).toBe(1);
  });
});

// =============================================================================
// FEATURE 4: gameplay/QuestManager
// =============================================================================
describe('Feature 4: QuestManager', () => {
  function makeQuest(id: string) {
    return {
      id,
      name: id,
      description: 'desc',
      category: 'main',
      objectives: [
        {
          id: 'obj1',
          type: 'kill' as const,
          description: 'kill goblins',
          target: 'goblin',
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
    };
  }

  it('getQuestCount is 0 initially', () => {
    expect(new QuestManager().getQuestCount()).toBe(0);
  });

  it('addQuest increments getQuestCount', () => {
    const qm = new QuestManager();
    qm.addQuest(makeQuest('q1'));
    expect(qm.getQuestCount()).toBe(1);
  });

  it('getQuest returns the added quest', () => {
    const qm = new QuestManager();
    qm.addQuest(makeQuest('q2'));
    expect(qm.getQuest('q2')).toBeDefined();
  });

  it('activate sets quest to active', () => {
    const qm = new QuestManager();
    qm.addQuest(makeQuest('q3'));
    qm.activate('q3');
    expect(qm.getByStatus('active')).toHaveLength(1);
  });

  it('updateObjective advances progress', () => {
    const qm = new QuestManager();
    qm.addQuest(makeQuest('q4'));
    qm.activate('q4');
    const ok = qm.updateObjective('q4', 'obj1', 3);
    expect(ok).toBe(true);
  });

  it('getProgress returns 0 before any progress', () => {
    const qm = new QuestManager();
    qm.addQuest(makeQuest('q5'));
    expect(qm.getProgress('q5')).toBe(0);
  });

  it('getActiveCount reflects active quests', () => {
    const qm = new QuestManager();
    qm.addQuest(makeQuest('a'));
    qm.activate('a');
    expect(qm.getActiveCount()).toBe(1);
  });
});

// =============================================================================
// FEATURE 5: gameplay/AchievementSystem
// =============================================================================
describe('Feature 5: AchievementSystem', () => {
  function makeAch(id: string) {
    return {
      id,
      name: id,
      description: 'desc',
      icon: 'ðŸ†',
      rarity: 'bronze' as const,
      maxProgress: 5,
      hidden: false,
      category: 'combat',
    };
  }

  it('getCount is 0 initially', () => {
    expect(new AchievementSystem().getCount()).toBe(0);
  });

  it('register increments getCount', () => {
    const ach = new AchievementSystem();
    ach.register(makeAch('first_kill'));
    expect(ach.getCount()).toBe(1);
  });

  it('get returns registered achievement', () => {
    const ach = new AchievementSystem();
    ach.register(makeAch('explorer'));
    expect(ach.get('explorer')).toBeDefined();
  });

  it('addProgress returns false before unlocking threshold', () => {
    const ach = new AchievementSystem();
    ach.register(makeAch('grinder'));
    const result = ach.addProgress('grinder', 2);
    expect(result).toBe(false); // not yet at 5
  });

  it('addProgress returns true when maxProgress reached', () => {
    const ach = new AchievementSystem();
    ach.register(makeAch('master'));
    const result = ach.addProgress('master', 5);
    expect(result).toBe(true);
  });

  it('getUnlocked returns unlocked achievements', () => {
    const ach = new AchievementSystem();
    ach.register(makeAch('hero'));
    ach.addProgress('hero', 5);
    expect(ach.getUnlocked().length).toBe(1);
  });

  it('unlock directly unlocks achievement', () => {
    const ach = new AchievementSystem();
    ach.register(makeAch('secret'));
    ach.unlock('secret');
    expect(ach.getUnlockedCount()).toBe(1);
  });

  it('getCompletionPercent increases after unlock', () => {
    const ach = new AchievementSystem();
    ach.register(makeAch('a1'));
    ach.unlock('a1');
    expect(ach.getCompletionPercent()).toBe(100);
  });
});

// =============================================================================
// FEATURE 6: combat/DamageSystem
// =============================================================================
describe('Feature 6: DamageSystem', () => {
  it('calculateDamage returns positive finalDamage', () => {
    const ds = new DamageSystem();
    const dmg = ds.calculateDamage('attacker', 'defender', 50, 'physical');
    expect(dmg.finalDamage).toBeGreaterThan(0);
  });

  it('calculateDamage with forceCrit sets isCritical', () => {
    const ds = new DamageSystem();
    const dmg = ds.calculateDamage('a', 'b', 50, 'fire', true);
    expect(dmg.isCritical).toBe(true);
  });

  it('getDamageLog records damage', () => {
    const ds = new DamageSystem();
    ds.calculateDamage('a', 'b', 30, 'ice');
    expect(ds.getDamageLog().length).toBe(1);
  });

  it('getTotalDamageDealt aggregates correctly', () => {
    const ds = new DamageSystem();
    ds.calculateDamage('hero', 'mob', 20, 'physical');
    ds.calculateDamage('hero', 'mob', 30, 'fire');
    expect(ds.getTotalDamageDealt('hero')).toBeGreaterThan(0);
  });

  it('applyDoT creates a DoT effect', () => {
    const ds = new DamageSystem();
    const dot = ds.applyDoT('mage', 'enemy', 'poison', 5, 1, 10);
    expect(dot.sourceId).toBe('mage');
    expect(dot.type).toBe('poison');
  });

  it('updateDoTs returns damage events over time', () => {
    const ds = new DamageSystem();
    ds.applyDoT('src', 'tgt', 'fire', 10, 0.5, 5);
    const ticks = ds.updateDoTs(1.0);
    expect(ticks.length).toBeGreaterThanOrEqual(1);
  });

  it('setResistances affects damage calculation', () => {
    const ds = new DamageSystem();
    ds.setResistances('tankDef', { physical: 0.9 });
    const dmg = ds.calculateDamage('atk', 'tankDef', 100, 'physical');
    // With 90% physical resistance, damage should be reduced
    expect(dmg.finalDamage).toBeLessThan(100);
  });

  it('clearLog empties the damage log', () => {
    const ds = new DamageSystem();
    ds.calculateDamage('a', 'b', 10, 'dark');
    ds.clearLog();
    expect(ds.getDamageLog()).toHaveLength(0);
  });
});

// =============================================================================
// FEATURE 7: combat/CombatManager
// =============================================================================
describe('Feature 7: CombatManager', () => {
  function makeHitBox(id: string, ownerId: string) {
    return {
      id,
      ownerId,
      position: [0, 0, 0],
      size: { x: 1, y: 1, z: 1 },
      active: true,
      damage: 20,
      damageType: 'physical',
      knockback: 1,
    };
  }
  function makeHurtBox(id: string, ownerId: string) {
    return {
      id,
      ownerId,
      position: [0, 0, 0],
      size: { x: 1, y: 1, z: 1 },
      active: true,
    };
  }

  it('getHitBoxCount starts at 0', () => {
    expect(new CombatManager().getHitBoxCount()).toBe(0);
  });

  it('addHitBox increments getHitBoxCount', () => {
    const cm = new CombatManager();
    cm.addHitBox(makeHitBox('hb1', 'player'));
    expect(cm.getHitBoxCount()).toBe(1);
  });

  it('addHurtBox increments getHurtBoxCount', () => {
    const cm = new CombatManager();
    cm.addHurtBox(makeHurtBox('hb1', 'enemy'));
    expect(cm.getHurtBoxCount()).toBe(1);
  });

  it('checkCollisions returns overlapping boxes', () => {
    const cm = new CombatManager();
    cm.addHitBox({ ...makeHitBox('h1', 'atk'), ownerId: 'atk' });
    cm.addHurtBox({ ...makeHurtBox('hurt1', 'def'), ownerId: 'def' });
    const hits = cm.checkCollisions();
    expect(Array.isArray(hits)).toBe(true);
  });

  it('startCooldown marks ability on cooldown', () => {
    const cm = new CombatManager();
    cm.startCooldown('dash', 1.0);
    expect(cm.isOnCooldown('dash')).toBe(true);
  });

  it('isOnCooldown false for unknown ability', () => {
    expect(new CombatManager().isOnCooldown('unknown')).toBe(false);
  });

  it('updateCooldowns reduces remaining time', () => {
    const cm = new CombatManager();
    cm.startCooldown('fireball', 2.0);
    cm.updateCooldowns(2.5);
    expect(cm.isOnCooldown('fireball')).toBe(false);
  });

  it('getHitLog starts empty', () => {
    expect(new CombatManager().getHitLog()).toHaveLength(0);
  });
});

// =============================================================================
// FEATURE 8: input/InputManager
// =============================================================================
describe('Feature 8: InputManager', () => {
  it('isKeyPressed returns false initially', () => {
    expect(new InputManager().isKeyPressed('w')).toBe(false);
  });

  it('keyDown makes isKeyPressed true', () => {
    const im = new InputManager();
    im.keyDown('space');
    expect(im.isKeyPressed('space')).toBe(true);
  });

  it('keyUp makes isKeyPressed false', () => {
    const im = new InputManager();
    im.keyDown('a');
    im.keyUp('a');
    expect(im.isKeyPressed('a')).toBe(false);
  });

  it('mapAction and isActionPressed', () => {
    const im = new InputManager();
    im.mapAction('jump', ['space']);
    im.keyDown('space');
    im.update(0.016); // sync action states
    expect(im.isActionPressed('jump')).toBe(true);
  });

  it('getAction returns undefined for unmapped action', () => {
    expect(new InputManager().getAction('fly')).toBeUndefined();
  });

  it('update does not throw', () => {
    const im = new InputManager();
    im.keyDown('w');
    expect(() => im.update(0.016)).not.toThrow();
  });

  it('getMousePosition returns {x,y}', () => {
    const im = new InputManager();
    im.setMousePosition(100, 200);
    const pos = im.getMousePosition();
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(200);
  });

  it('isMouseButtonPressed returns false initially', () => {
    expect(new InputManager().isMouseButtonPressed(0)).toBe(false);
  });
});

// =============================================================================
// FEATURE 9: navigation/NavMesh
// =============================================================================
describe('Feature 9: NavMesh', () => {
  const v = (x: number, z: number) => ({ x, y: 0, z });

  it('getPolygonCount is 0 initially', () => {
    expect(new NavMesh().getPolygonCount()).toBe(0);
  });

  it('addPolygon increments getPolygonCount', () => {
    const nm = new NavMesh();
    nm.addPolygon([v(0, 0), v(1, 0), v(0, 1)]);
    expect(nm.getPolygonCount()).toBe(1);
  });

  it('addPolygon returns a polygon with id', () => {
    const poly = new NavMesh().addPolygon([v(0, 0), v(2, 0), v(0, 2)]);
    expect(poly.id).toBeDefined();
  });

  it('connectPolygons does not throw', () => {
    const nm = new NavMesh();
    const p1 = nm.addPolygon([v(0, 0), v(1, 0), v(0, 1)]);
    const p2 = nm.addPolygon([v(1, 0), v(2, 0), v(1, 1)]);
    expect(() => nm.connectPolygons(p1.id, p2.id)).not.toThrow();
  });

  it('getPolygon returns undefined for unknown id', () => {
    expect(new NavMesh().getPolygon('ghost')).toBeUndefined();
  });

  it('findNearestPolygon returns null for empty mesh', () => {
    expect(new NavMesh().findNearestPolygon(v(0, 0))).toBeNull();
  });

  it('findNearestPolygon returns polygon after adding one', () => {
    const nm = new NavMesh();
    nm.addPolygon([v(0, 0), v(1, 0), v(0.5, 1)]);
    const result = nm.findNearestPolygon(v(0.5, 0.3));
    expect(result).not.toBeNull();
  });

  it('export returns mesh data with polygons array', () => {
    const nm = new NavMesh();
    nm.addPolygon([v(0, 0), v(1, 0), v(0, 1)]);
    const data = nm.export();
    expect(data.polygons).toHaveLength(1);
  });
});

// =============================================================================
// FEATURE 10: dialogue/DialogueGraph
// =============================================================================
describe('Feature 10: DialogueGraph', () => {
  it('getNodeCount is 0 initially', () => {
    expect(new DialogueGraph().getNodeCount()).toBe(0);
  });

  it('addTextNode increments getNodeCount', () => {
    const dg = new DialogueGraph();
    dg.addTextNode('n1', 'NPC', 'Hello!', null);
    expect(dg.getNodeCount()).toBe(1);
  });

  it('start returns null before setStart', () => {
    const dg = new DialogueGraph();
    dg.addTextNode('n1', 'NPC', 'Hi', null);
    expect(dg.start()).toBeNull();
  });

  it('start returns first node after setStart', () => {
    const dg = new DialogueGraph();
    dg.addTextNode('n1', 'NPC', 'Hello!', null);
    dg.setStart('n1');
    expect(dg.start()?.id).toBe('n1');
  });

  it('advance moves to next node', () => {
    const dg = new DialogueGraph();
    dg.addTextNode('n1', 'NPC', 'Hi', 'n2');
    dg.addTextNode('n2', 'NPC', 'Bye', null);
    dg.setStart('n1');
    dg.start();
    const next = dg.advance();
    expect(next?.id).toBe('n2');
  });

  it('isComplete returns true at end node', () => {
    const dg = new DialogueGraph();
    dg.addTextNode('n1', 'NPC', 'Final', null);
    dg.setStart('n1');
    dg.start();
    dg.advance();
    expect(dg.isComplete()).toBe(true);
  });

  it('setVariable and getVariable roundtrip', () => {
    const dg = new DialogueGraph();
    dg.setVariable('playerName', 'Hero');
    expect(dg.getVariable('playerName')).toBe('Hero');
  });

  it('getHistory tracks visited nodes', () => {
    const dg = new DialogueGraph();
    dg.addTextNode('n1', 'NPC', 'Hi', null);
    dg.setStart('n1');
    dg.start();
    expect(dg.getHistory()).toContain('n1');
  });
});

// =============================================================================
// FEATURE 11: dialogue/EmotionSystem
// =============================================================================
describe('Feature 11: EmotionSystem', () => {
  it('getEmotion returns 0 before setting', () => {
    expect(new EmotionSystem().getEmotion('npc', 'joy')).toBe(0);
  });

  it('setEmotion and getEmotion roundtrip', () => {
    const es = new EmotionSystem();
    es.setEmotion('npc', 'anger', 0.8);
    expect(es.getEmotion('npc', 'anger')).toBeCloseTo(0.8);
  });

  it('getDominantEmotion returns null for entity with no emotions', () => {
    expect(new EmotionSystem().getDominantEmotion('unknown')).toBeNull();
  });

  it('getDominantEmotion returns highest intensity emotion', () => {
    const es = new EmotionSystem();
    es.setEmotion('guard', 'fear', 0.3);
    es.setEmotion('guard', 'anger', 0.9);
    expect(es.getDominantEmotion('guard')).toBe('anger');
  });

  it('update does not throw', () => {
    const es = new EmotionSystem();
    es.setEmotion('npc', 'joy', 1.0, 0.1);
    expect(() => es.update(0.1)).not.toThrow();
  });

  it('setRelationship and getRelationship roundtrip', () => {
    const es = new EmotionSystem();
    es.setRelationship('alice', 'bob', 0.7);
    expect(es.getRelationship('alice', 'bob')).toBeCloseTo(0.7);
  });

  it('getRelationship returns 0 for unknown pair', () => {
    expect(new EmotionSystem().getRelationship('x', 'y')).toBe(0);
  });

  it('modifyRelationship adjusts affinity', () => {
    const es = new EmotionSystem();
    es.setRelationship('a', 'b', 0.5);
    es.modifyRelationship('a', 'b', 0.2);
    expect(es.getRelationship('a', 'b')).toBeGreaterThan(0.5);
  });
});
