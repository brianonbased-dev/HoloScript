import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressionTree } from '@holoscript/engine/gameplay';
import type { SkillNode } from '@holoscript/engine/gameplay';

// =============================================================================
// C231 — Progression Tree (Skill Tree)
// =============================================================================

const BASE_SKILL: Omit<SkillNode, 'currentLevel' | 'unlocked'> = {
  id: 'fireball',
  name: 'Fireball',
  description: 'Launch a fireball',
  tier: 1,
  maxLevel: 5,
  cost: 1,
  prerequisites: [],
  icon: '🔥',
  category: 'magic',
  effects: { damage: 10 },
};

describe('ProgressionTree', () => {
  let tree: ProgressionTree;
  beforeEach(() => {
    tree = new ProgressionTree();
  });

  it('addNode creates a node', () => {
    tree.addNode(BASE_SKILL);
    expect(tree.getNode('fireball')).toBeDefined();
    expect(tree.getNodeCount()).toBe(1);
  });

  it('node without prerequisites is auto-unlocked', () => {
    const node = tree.addNode(BASE_SKILL);
    expect(node.unlocked).toBe(true);
  });

  it('node with unmet prerequisites stays locked', () => {
    const node = tree.addNode({ ...BASE_SKILL, id: 'meteor', prerequisites: ['fireball'] });
    expect(node.unlocked).toBe(false);
  });

  it('invest allocates points', () => {
    tree.addNode(BASE_SKILL);
    tree.addPoints(5);
    expect(tree.invest('fireball', 3)).toBe(true);
    expect(tree.getNode('fireball')!.currentLevel).toBe(3);
    expect(tree.getAvailablePoints()).toBe(2);
    expect(tree.getTotalSpent()).toBe(3);
  });

  it('invest fails with insufficient points', () => {
    tree.addNode(BASE_SKILL);
    tree.addPoints(1);
    expect(tree.invest('fireball', 3)).toBe(false);
  });

  it('invest fails beyond maxLevel', () => {
    tree.addNode(BASE_SKILL);
    tree.addPoints(10);
    expect(tree.invest('fireball', 6)).toBe(false); // max is 5
  });

  it('invest fails on locked node', () => {
    tree.addNode({ ...BASE_SKILL, id: 'meteor', prerequisites: ['fireball'] });
    tree.addPoints(10);
    expect(tree.invest('meteor')).toBe(false);
  });

  it('investing in prerequisite unlocks downstream nodes', () => {
    tree.addNode(BASE_SKILL);
    tree.addNode({
      ...BASE_SKILL,
      id: 'meteor',
      name: 'Meteor',
      tier: 2,
      prerequisites: ['fireball'],
    });
    tree.addPoints(10);
    tree.invest('fireball'); // level 1 → unlocks meteor
    expect(tree.getNode('meteor')!.unlocked).toBe(true);
  });

  it('canInvest checks all conditions', () => {
    tree.addNode(BASE_SKILL);
    tree.addPoints(1);
    expect(tree.canInvest('fireball')).toBe(true);
    expect(tree.canInvest('fireball', 5)).toBe(false); // not enough points
  });

  it('respec refunds all points', () => {
    tree.addNode(BASE_SKILL);
    tree.addPoints(5);
    tree.invest('fireball', 3);
    tree.respec();
    expect(tree.getAvailablePoints()).toBe(5);
    expect(tree.getNode('fireball')!.currentLevel).toBe(0);
    expect(tree.getRespecCount()).toBe(1);
  });

  it('getByTier filters by tier', () => {
    tree.addNode(BASE_SKILL);
    tree.addNode({ ...BASE_SKILL, id: 'shield', tier: 2 });
    expect(tree.getByTier(1)).toHaveLength(1);
    expect(tree.getByTier(2)).toHaveLength(1);
  });

  it('getByCategory filters by category', () => {
    tree.addNode(BASE_SKILL);
    tree.addNode({ ...BASE_SKILL, id: 'sword', category: 'melee' });
    expect(tree.getByCategory('magic')).toHaveLength(1);
  });

  it('getEffectTotal sums effects across invested nodes', () => {
    tree.addNode({ ...BASE_SKILL, effects: { damage: 10 } });
    tree.addNode({ ...BASE_SKILL, id: 'bolt', effects: { damage: 5 } });
    tree.addPoints(5);
    tree.invest('fireball', 2);
    tree.invest('bolt', 1);
    expect(tree.getEffectTotal('damage')).toBe(25); // 10*2 + 5*1
  });

  it('getTiers returns sorted unique tiers', () => {
    tree.addNode({ ...BASE_SKILL, tier: 3 });
    tree.addNode({ ...BASE_SKILL, id: 'b', tier: 1 });
    tree.addNode({ ...BASE_SKILL, id: 'c', tier: 2 });
    expect(tree.getTiers()).toEqual([1, 2, 3]);
  });

  it('getUnlocked and getInvested return correct lists', () => {
    tree.addNode(BASE_SKILL);
    tree.addNode({ ...BASE_SKILL, id: 'locked', prerequisites: ['nonexistent'] });
    tree.addPoints(5);
    tree.invest('fireball');
    expect(tree.getUnlocked()).toHaveLength(1);
    expect(tree.getInvested()).toHaveLength(1);
  });
});
