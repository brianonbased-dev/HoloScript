/**
 * ProgressionTree.prod.test.ts
 *
 * Production tests for ProgressionTree.
 * Pure in-memory, zero I/O, deterministic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressionTree, type SkillNode } from '../ProgressionTree';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addNode(
  tree: ProgressionTree,
  id: string,
  opts: {
    tier?: number;
    maxLevel?: number;
    cost?: number;
    prerequisites?: string[];
    category?: string;
    effects?: Record<string, number>;
  } = {}
): SkillNode {
  return tree.addNode({
    id,
    name: `Node ${id}`,
    description: 'A skill node',
    tier: opts.tier ?? 1,
    maxLevel: opts.maxLevel ?? 3,
    cost: opts.cost ?? 1,
    prerequisites: opts.prerequisites ?? [],
    icon: 'icon',
    category: opts.category ?? 'combat',
    effects: opts.effects ?? {},
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProgressionTree', () => {
  let tree: ProgressionTree;

  beforeEach(() => {
    tree = new ProgressionTree();
  });

  // ── Node Management ───────────────────────────────────────────────────────

  describe('addNode / getNode', () => {
    it('adds a node with currentLevel=0', () => {
      const node = addNode(tree, 'slash');
      expect(node.currentLevel).toBe(0);
    });

    it('auto-unlocks node with no prerequisites', () => {
      const node = addNode(tree, 'slash');
      expect(node.unlocked).toBe(true);
    });

    it('does NOT unlock node with unmet prerequisites', () => {
      addNode(tree, 'a');
      const b = addNode(tree, 'b', { prerequisites: ['a'] });
      expect(b.unlocked).toBe(false);
    });

    it('unlocks dependent node when prerequisite invested', () => {
      tree.addPoints(10);
      addNode(tree, 'a');
      addNode(tree, 'b', { prerequisites: ['a'] });
      tree.invest('a');
      expect(tree.getNode('b')!.unlocked).toBe(true);
    });

    it('getNode() returns undefined for unknown id', () => {
      expect(tree.getNode('bad')).toBeUndefined();
    });
  });

  // ── Points ────────────────────────────────────────────────────────────────

  describe('addPoints / getAvailablePoints', () => {
    it('starts at 0 points', () => {
      expect(tree.getAvailablePoints()).toBe(0);
    });

    it('addPoints increases available', () => {
      tree.addPoints(5);
      expect(tree.getAvailablePoints()).toBe(5);
    });

    it('addPoints accumulates', () => {
      tree.addPoints(3);
      tree.addPoints(7);
      expect(tree.getAvailablePoints()).toBe(10);
    });
  });

  // ── Invest ────────────────────────────────────────────────────────────────

  describe('invest / canInvest', () => {
    beforeEach(() => {
      tree.addPoints(20);
      addNode(tree, 'slash', { maxLevel: 3, cost: 2 });
    });

    it('invest returns true and decreases available points', () => {
      expect(tree.invest('slash')).toBe(true);
      expect(tree.getNode('slash')!.currentLevel).toBe(1);
      expect(tree.getAvailablePoints()).toBe(18);
    });

    it('invest increases totalSpent', () => {
      tree.invest('slash');
      expect(tree.getTotalSpent()).toBe(2);
    });

    it('invest returns false when not enough points', () => {
      const empty = new ProgressionTree();
      addNode(empty, 'slash', { maxLevel: 3, cost: 10 });
      expect(empty.invest('slash')).toBe(false);
    });

    it('invest returns false when already at max level', () => {
      tree.invest('slash');
      tree.invest('slash');
      tree.invest('slash');
      expect(tree.invest('slash')).toBe(false);
    });

    it('invest returns false for unlocked=false node', () => {
      addNode(tree, 'gated', { prerequisites: ['slash'] });
      expect(tree.invest('gated')).toBe(false);
    });

    it('invest returns false for unknown id', () => {
      expect(tree.invest('bad')).toBe(false);
    });

    it('canInvest returns true when conditions met', () => {
      expect(tree.canInvest('slash')).toBe(true);
    });

    it('canInvest returns false when insufficient points', () => {
      const poor = new ProgressionTree();
      addNode(poor, 'slash', { cost: 10 });
      expect(poor.canInvest('slash')).toBe(false);
    });

    it('multi-level invest works', () => {
      expect(tree.invest('slash', 3)).toBe(true);
      expect(tree.getNode('slash')!.currentLevel).toBe(3);
      expect(tree.getAvailablePoints()).toBe(14); // 20 - 6
    });
  });

  // ── Respec ────────────────────────────────────────────────────────────────

  describe('respec', () => {
    it('refunds all spent points', () => {
      tree.addPoints(10);
      addNode(tree, 'a', { cost: 3 });
      tree.invest('a', 2);
      expect(tree.getAvailablePoints()).toBe(4);
      tree.respec();
      expect(tree.getAvailablePoints()).toBe(10);
    });

    it('resets all currentLevel to 0', () => {
      tree.addPoints(10);
      addNode(tree, 'a', { cost: 1 });
      tree.invest('a', 3);
      tree.respec();
      expect(tree.getNode('a')!.currentLevel).toBe(0);
    });

    it('respecCount increments', () => {
      tree.addPoints(10);
      addNode(tree, 'a');
      tree.invest('a');
      tree.respec();
      expect(tree.getRespecCount()).toBe(1);
    });

    it('totalSpent resets to 0 after respec', () => {
      tree.addPoints(10);
      addNode(tree, 'a', { cost: 5 });
      tree.invest('a');
      tree.respec();
      expect(tree.getTotalSpent()).toBe(0);
    });
  });

  // ── Queries ───────────────────────────────────────────────────────────────

  describe('queries', () => {
    beforeEach(() => {
      tree.addPoints(20);
      addNode(tree, 'slash', { tier: 1, category: 'combat', effects: { damage: 5 } });
      addNode(tree, 'block', { tier: 1, category: 'defense', effects: { armor: 3 } });
      addNode(tree, 'parry', { tier: 2, category: 'combat', prerequisites: ['slash'] });
      tree.invest('slash', 2);
    });

    it('getByTier returns correct nodes', () => {
      expect(tree.getByTier(1)).toHaveLength(2);
      expect(tree.getByTier(2)).toHaveLength(1);
    });

    it('getByCategory returns correct nodes', () => {
      expect(tree.getByCategory('combat')).toHaveLength(2);
      expect(tree.getByCategory('defense')).toHaveLength(1);
    });

    it('getUnlocked returns unlocked nodes', () => {
      const unlocked = tree.getUnlocked();
      // slash (unlocked no prereqs), block (no prereqs), parry (unlocked because slash invested)
      expect(unlocked.length).toBeGreaterThanOrEqual(2);
    });

    it('getInvested returns nodes with currentLevel > 0', () => {
      const invested = tree.getInvested();
      expect(invested).toHaveLength(1);
      expect(invested[0].id).toBe('slash');
    });

    it('getNodeCount returns total', () => {
      expect(tree.getNodeCount()).toBe(3);
    });

    it('getEffectTotal sums effect across invested nodes', () => {
      // slash invested 2 levels × 5 damage = 10
      expect(tree.getEffectTotal('damage')).toBe(10);
    });

    it('getEffectTotal returns 0 for unknown stat', () => {
      expect(tree.getEffectTotal('speed')).toBe(0);
    });

    it('getTiers returns sorted unique tiers', () => {
      expect(tree.getTiers()).toEqual([1, 2]);
    });
  });
});
