import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressionTree } from '../ProgressionTree';

const skill = (id: string, tier = 1, cost = 1, prereqs: string[] = [], effects: Record<string, number> = {}) => ({
  id, name: id, description: 'Test', tier, maxLevel: 3, cost,
  prerequisites: prereqs, icon: '⚔️', category: 'combat', effects,
});

describe('ProgressionTree', () => {
  let pt: ProgressionTree;

  beforeEach(() => { pt = new ProgressionTree(); });

  it('addNode creates node', () => {
    const n = pt.addNode(skill('slash'));
    expect(n.currentLevel).toBe(0);
    expect(pt.getNodeCount()).toBe(1);
  });

  it('node with no prereqs is auto-unlocked', () => {
    const n = pt.addNode(skill('slash'));
    expect(n.unlocked).toBe(true);
  });

  it('node with prereqs starts locked', () => {
    pt.addNode(skill('slash'));
    const n = pt.addNode(skill('combo', 2, 1, ['slash']));
    expect(n.unlocked).toBe(false);
  });

  it('invest allocates points', () => {
    pt.addNode(skill('slash'));
    pt.addPoints(5);
    expect(pt.invest('slash')).toBe(true);
    expect(pt.getNode('slash')?.currentLevel).toBe(1);
    expect(pt.getAvailablePoints()).toBe(4);
    expect(pt.getTotalSpent()).toBe(1);
  });

  it('invest multiple levels', () => {
    pt.addNode(skill('slash'));
    pt.addPoints(10);
    expect(pt.invest('slash', 3)).toBe(true);
    expect(pt.getNode('slash')?.currentLevel).toBe(3);
  });

  it('invest fails when not enough points', () => {
    pt.addNode(skill('slash', 1, 5));
    pt.addPoints(3);
    expect(pt.invest('slash')).toBe(false);
  });

  it('invest fails when locked', () => {
    pt.addNode(skill('slash'));
    pt.addNode(skill('combo', 2, 1, ['slash']));
    pt.addPoints(10);
    expect(pt.invest('combo')).toBe(false);
  });

  it('invest fails when max level reached', () => {
    pt.addNode(skill('slash'));
    pt.addPoints(10);
    pt.invest('slash', 3);
    expect(pt.invest('slash')).toBe(false);
  });

  it('investing unlocks downstream nodes', () => {
    pt.addNode(skill('slash'));
    pt.addNode(skill('combo', 2, 1, ['slash']));
    pt.addPoints(10);
    pt.invest('slash');
    expect(pt.getNode('combo')?.unlocked).toBe(true);
  });

  it('canInvest checks all rules', () => {
    pt.addNode(skill('slash'));
    expect(pt.canInvest('slash')).toBe(false); // no points
    pt.addPoints(5);
    expect(pt.canInvest('slash')).toBe(true);
  });

  it('respec refunds all points', () => {
    pt.addNode(skill('slash', 1, 2));
    pt.addPoints(10);
    pt.invest('slash', 3);
    expect(pt.getAvailablePoints()).toBe(4);
    pt.respec();
    expect(pt.getAvailablePoints()).toBe(10);
    expect(pt.getNode('slash')?.currentLevel).toBe(0);
    expect(pt.getRespecCount()).toBe(1);
  });

  it('getByTier filters', () => {
    pt.addNode(skill('a', 1));
    pt.addNode(skill('b', 2));
    expect(pt.getByTier(1).length).toBe(1);
  });

  it('getByCategory filters', () => {
    pt.addNode(skill('a'));
    pt.addNode({ ...skill('b'), category: 'magic' });
    expect(pt.getByCategory('combat').length).toBe(1);
  });

  it('getUnlocked returns unlocked nodes', () => {
    pt.addNode(skill('a'));
    pt.addNode(skill('b', 2, 1, ['a']));
    expect(pt.getUnlocked().length).toBe(1);
  });

  it('getInvested returns leveled nodes', () => {
    pt.addNode(skill('a'));
    pt.addPoints(5);
    pt.invest('a');
    expect(pt.getInvested().length).toBe(1);
  });

  it('getEffectTotal sums effects', () => {
    pt.addNode(skill('a', 1, 1, [], { damage: 5 }));
    pt.addNode(skill('b', 1, 1, [], { damage: 3 }));
    pt.addPoints(10);
    pt.invest('a', 2);
    pt.invest('b', 1);
    expect(pt.getEffectTotal('damage')).toBe(5 * 2 + 3 * 1);
  });

  it('getTiers returns sorted unique tiers', () => {
    pt.addNode(skill('a', 3));
    pt.addNode(skill('b', 1));
    pt.addNode(skill('c', 2));
    expect(pt.getTiers()).toEqual([1, 2, 3]);
  });
});
