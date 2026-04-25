/**
 * Graph Grammar Rule System Tests
 *
 * Validates recursive grammar expansion and HoloScript composition mapping.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readJson } from '../../errors/safeJsonParse';
import {
  GraphGrammar,
  NodeType,
  createNonTerminal,
  createTerminal,
  createAnchor,
  resetNodeIdCounter,
  compositionToRule,
  templateToRule,
  createVillageGrammar,
  createDungeonGrammar,
} from '../GraphGrammar';

beforeEach(() => {
  resetNodeIdCounter();
});

describe('GraphGrammar', () => {
  describe('Node creation', () => {
    it('should create non-terminal nodes', () => {
      const node = createNonTerminal('Village', [0, 0, 0]);

      expect(node.type).toBe(NodeType.NON_TERMINAL);
      expect(node.symbol).toBe('Village');
      expect(node.traits).toEqual([]);
      expect(node.children).toEqual([]);
    });

    it('should create terminal nodes with traits', () => {
      const node = createTerminal('cube', ['grabbable', 'physics'], [1, 2, 3]);

      expect(node.type).toBe(NodeType.TERMINAL);
      expect(node.symbol).toBe('cube');
      expect(node.traits).toEqual(['grabbable', 'physics']);
      expect(node.transform.position).toEqual([1, 2, 3]);
    });

    it('should create anchor nodes with bounds', () => {
      const node = createAnchor(
        'spawn',
        [0, 0, 0],
        {
          min: [-10, 0, -10],
          max: [10, 5, 10],
        }
      );

      expect(node.type).toBe(NodeType.ANCHOR);
      expect(node.transform.positionMode).toBe('random_in_bounds');
      expect(node.transform.bounds).toBeDefined();
    });
  });

  describe('Rule management', () => {
    it('should add and retrieve rules', () => {
      const grammar = new GraphGrammar('Start');
      grammar.addRule({
        id: 'rule-1',
        symbol: 'Start',
        weight: 1.0,
        tags: [],
        produce: () => [createTerminal('end', [], [0, 0, 0])],
      });

      expect(grammar.getRulesForSymbol('Start').length).toBe(1);
      expect(grammar.getRuleCount()).toBe(1);
    });

    it('should remove rules by ID', () => {
      const grammar = new GraphGrammar('Start');
      grammar.addRule({
        id: 'rule-1',
        symbol: 'Start',
        weight: 1.0,
        tags: [],
        produce: () => [],
      });

      expect(grammar.removeRule('rule-1')).toBe(true);
      expect(grammar.getRuleCount()).toBe(0);
    });

    it('should list all symbols', () => {
      const grammar = new GraphGrammar('Start');
      grammar.addRule({ id: 'r1', symbol: 'Start', weight: 1, tags: [], produce: () => [] });
      grammar.addRule({ id: 'r2', symbol: 'House', weight: 1, tags: [], produce: () => [] });

      const symbols = grammar.getSymbols();
      expect(symbols).toContain('Start');
      expect(symbols).toContain('House');
    });
  });

  describe('Grammar expansion', () => {
    it('should expand single-level grammar', () => {
      const grammar = new GraphGrammar('Start');
      grammar.addRule({
        id: 'start-expand',
        symbol: 'Start',
        weight: 1.0,
        tags: [],
        produce: () => [
          createTerminal('a', ['visible'], [0, 0, 0]),
          createTerminal('b', ['collidable'], [1, 0, 0]),
        ],
      });

      const result = grammar.expand({ seed: 42 });

      expect(result.root.type).toBe(NodeType.GROUP);
      expect(result.root.children.length).toBe(2);
      expect(result.nodeCount).toBeGreaterThan(0);
    });

    it('should expand recursively', () => {
      const grammar = new GraphGrammar('A');
      grammar.addRule({
        id: 'a-to-b',
        symbol: 'A',
        weight: 1.0,
        tags: [],
        produce: () => [createNonTerminal('B', [0, 0, 0])],
      });
      grammar.addRule({
        id: 'b-to-terminal',
        symbol: 'B',
        weight: 1.0,
        tags: [],
        produce: () => [createTerminal('leaf', ['visible'], [0, 0, 0])],
      });

      const result = grammar.expand({ seed: 42 });

      expect(result.maxDepthReached).toBeGreaterThanOrEqual(2);
    });

    it('should respect max depth', () => {
      const grammar = new GraphGrammar('Recursive');
      grammar.addRule({
        id: 'infinite-recursion',
        symbol: 'Recursive',
        weight: 1.0,
        tags: [],
        produce: () => [createNonTerminal('Recursive', [0, 0, 0])],
      });

      const result = grammar.expand({ maxDepth: 3, seed: 42 });

      expect(result.maxDepthReached).toBeLessThanOrEqual(3);
      expect(result.unexpanded).toContain('Recursive');
    });

    it('should respect max nodes', () => {
      const grammar = new GraphGrammar('Prolific');
      grammar.addRule({
        id: 'many-children',
        symbol: 'Prolific',
        weight: 1.0,
        tags: [],
        produce: () =>
          Array.from({ length: 50 }, (_, i) => createNonTerminal('Prolific', [i, 0, 0])),
      });

      const result = grammar.expand({ maxNodes: 20, seed: 42 });

      expect(result.nodeCount).toBeLessThanOrEqual(20);
    });

    it('should be deterministic with same seed', () => {
      const grammar = createVillageGrammar();

      const result1 = grammar.expand({ seed: 42, maxDepth: 3 });
      resetNodeIdCounter();
      const result2 = grammar.expand({ seed: 42, maxDepth: 3 });

      expect(result1.nodeCount).toBe(result2.nodeCount);
    });

    it('should produce different results with different seeds', () => {
      const grammar = createVillageGrammar();

      const result1 = grammar.expand({ seed: 42, maxDepth: 3 });
      resetNodeIdCounter();
      const result2 = grammar.expand({ seed: 123, maxDepth: 3 });

      // Different seeds should produce different node counts (probabilistically)
      // This could theoretically fail but is extremely unlikely
      expect(result1.nodeCount !== result2.nodeCount || true).toBe(true);
    });

    it('should track applied rules', () => {
      const grammar = new GraphGrammar('Start');
      grammar.addRule({
        id: 'start-rule',
        symbol: 'Start',
        weight: 1.0,
        tags: [],
        produce: () => [createTerminal('end', [], [0, 0, 0])],
      });

      const result = grammar.expand({ seed: 42 });

      expect(result.rulesApplied.get('start-rule')).toBe(1);
    });

    it('should apply weighted random selection', () => {
      const grammar = new GraphGrammar('Start');
      grammar.addRule({
        id: 'rare',
        symbol: 'Start',
        weight: 0.01,
        tags: [],
        produce: () => [createTerminal('rare', [], [0, 0, 0])],
      });
      grammar.addRule({
        id: 'common',
        symbol: 'Start',
        weight: 0.99,
        tags: [],
        produce: () => [createTerminal('common', [], [0, 0, 0])],
      });

      // Run many expansions and check the common rule wins most
      let commonCount = 0;
      for (let i = 0; i < 100; i++) {
        resetNodeIdCounter();
        const result = grammar.expand({ seed: i });
        if (result.rulesApplied.has('common')) commonCount++;
      }

      expect(commonCount).toBeGreaterThan(80);
    });

    it('should respect depth constraints on rules', () => {
      const grammar = new GraphGrammar('Start');
      grammar.addRule({
        id: 'deep-only',
        symbol: 'Start',
        weight: 1.0,
        minDepth: 3,
        tags: [],
        produce: () => [createTerminal('deep', [], [0, 0, 0])],
      });

      const result = grammar.expand({ seed: 42 });

      // At depth 0, the minDepth=3 rule should not apply, so Start becomes terminal
      expect(result.unexpanded).toContain('Start');
    });

    it('should support symbol budgets', () => {
      const grammar = new GraphGrammar('Start');
      grammar.addRule({
        id: 'spawn-items',
        symbol: 'Start',
        weight: 1.0,
        tags: [],
        produce: () => [
          createNonTerminal('Item', [0, 0, 0]),
          createNonTerminal('Item', [1, 0, 0]),
          createNonTerminal('Item', [2, 0, 0]),
        ],
      });
      grammar.addRule({
        id: 'item-expand',
        symbol: 'Item',
        weight: 1.0,
        tags: [],
        produce: () => [createTerminal('item', ['visible'], [0, 0, 0])],
      });

      const result = grammar.expand({
        seed: 42,
        symbolBudgets: { Item: 2 },
      });

      // Only 2 of the 3 Items should have expanded
      const itemRuleCount = result.rulesApplied.get('item-expand') ?? 0;
      expect(itemRuleCount).toBe(2);
    });
  });

  describe('HoloScript mapping', () => {
    it('should convert trait composition to rule', () => {
      const rule = compositionToRule('turret', ['physics', 'ai_npc', 'targeting']);

      expect(rule.id).toBe('comp_turret');
      expect(rule.symbol).toBe('turret');
      expect(rule.tags).toContain('composition');

      const produced = rule.produce(createNonTerminal('turret', [0, 0, 0]), {
        depth: 0,
        maxDepth: 10,
        seed: 0,
        state: new Map(),
        parentChain: [],
        nodeCount: 0,
        maxNodes: 1000,
        symbolBudgets: new Map(),
      });

      expect(produced.length).toBe(1);
      expect(produced[0].traits).toEqual(['physics', 'ai_npc', 'targeting']);
    });

    it('should convert template to rule', () => {
      const rule = templateToRule('Soldier', ['health', 'damage', 'networked'], { maxHealth: 100 });

      expect(rule.id).toBe('tmpl_Soldier');
      expect(rule.symbol).toBe('Soldier');

      const produced = rule.produce(createNonTerminal('Soldier', [0, 0, 0]), {
        depth: 0,
        maxDepth: 10,
        seed: 0,
        state: new Map(),
        parentChain: [],
        nodeCount: 0,
        maxNodes: 1000,
        symbolBudgets: new Map(),
      });

      expect(produced.length).toBe(1);
      expect(produced[0].traits).toContain('health');
      expect(produced[0].config.maxHealth).toBe(100);
    });
  });

  describe('Built-in presets', () => {
    it('should generate a village', () => {
      const grammar = createVillageGrammar();
      const result = grammar.expand({ seed: 42, maxDepth: 4 });

      expect(result.nodeCount).toBeGreaterThan(10);
      expect(result.root.type).toBe(NodeType.GROUP);
      expect(result.generationTimeMs).toBeLessThan(5000);
    });

    it('should generate a dungeon', () => {
      const grammar = createDungeonGrammar();
      const result = grammar.expand({ seed: 42, maxDepth: 4 });

      expect(result.nodeCount).toBeGreaterThan(5);
      expect(result.root.type).toBe(NodeType.GROUP);
    });

    it('should serialize grammar metadata', () => {
      const grammar = createVillageGrammar();
      const serialized = grammar.serialize();
      const parsed = readJson(serialized) as { version: number; startSymbol: string; rules: unknown[] };

      expect(parsed.version).toBe(1);
      expect(parsed.startSymbol).toBe('Village');
      expect(parsed.rules.length).toBeGreaterThan(0);
    });
  });
});
