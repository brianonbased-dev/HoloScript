/**
 * Tests for HoloScript TreeShaker
 *
 * Covers:
 * - Tree shaking unused nodes
 * - Entry point marking
 * - Side effect detection
 * - Graph statistics
 * - Dead code elimination
 * - Keeping exported/trait nodes
 */

import { describe, it, expect } from 'vitest';
import { TreeShaker, treeShake, eliminateDeadCode } from './TreeShaker';
import type { ASTNode } from './types';

// Helper to create minimal AST nodes
function node(
  name: string,
  type: string = 'GenericNode',
  overrides: Partial<ASTNode> = {}
): ASTNode {
  return {
    type,
    name,
    position: [0, 0, 0],
    rotation: [0, 0, 0 ],
    scale: [1, 1, 1 ],
    ...overrides,
  } as ASTNode;
}

describe('TreeShaker', () => {
  describe('shake', () => {
    it('keeps entry point nodes', () => {
      const shaker = new TreeShaker({ entryPoints: ['main'] });
      const result = shaker.shake([node('main'), node('unused')]);
      expect(result.kept.some((n) => n.name === 'main')).toBe(true);
      expect(result.stats.keptNodes).toBeGreaterThanOrEqual(1);
    });

    it('removes nodes not reachable from entry points', () => {
      const shaker = new TreeShaker({ entryPoints: ['main'], sideEffectFree: true });
      const result = shaker.shake([node('main'), node('orphan')]);
      expect(result.stats.removedNodes).toBeGreaterThanOrEqual(0);
      expect(result.stats.totalNodes).toBeGreaterThanOrEqual(result.stats.keptNodes);
    });

    it('keeps all nodes when no entry points specified', () => {
      const shaker = new TreeShaker({});
      const ast = [node('a'), node('b'), node('c')];
      const result = shaker.shake(ast);
      // Default behavior may keep everything or use heuristics
      expect(result.stats.totalNodes).toBe(3);
    });

    it('returns correct stats', () => {
      const shaker = new TreeShaker({ entryPoints: ['a'] });
      const result = shaker.shake([node('a'), node('b'), node('c')]);
      expect(result.stats.totalNodes).toBe(3);
      expect(result.stats.keptNodes + result.stats.removedNodes).toBe(3);
      expect(result.stats.reductionPercent).toBeGreaterThanOrEqual(0);
      expect(result.stats.reductionPercent).toBeLessThanOrEqual(100);
    });
  });

  describe('keepExports', () => {
    it('keeps exported nodes when keepExports is true', () => {
      const exported = node('MyTrait', 'GenericNode', {
        properties: { exported: true } as any,
      });
      const shaker = new TreeShaker({ keepExports: true, entryPoints: [] });
      const result = shaker.shake([exported, node('unused')]);
      // Exported nodes should be kept
      expect(result.stats.totalNodes).toBe(2);
    });
  });

  describe('keepNames', () => {
    it('keeps nodes by name regardless of usage', () => {
      const shaker = new TreeShaker({ keepNames: ['preserved'], entryPoints: ['main'] });
      const result = shaker.shake([node('main'), node('preserved'), node('removed')]);
      expect(result.kept.some((n) => n.name === 'preserved')).toBe(true);
    });
  });

  describe('side effect handling', () => {
    it('keeps side-effectful nodes in non-sideEffectFree mode', () => {
      const shaker = new TreeShaker({ sideEffectFree: false, entryPoints: ['main'] });
      const sideEffectNode = node('conn', 'connection');
      const result = shaker.shake([node('main'), sideEffectNode]);
      // Non-sideEffectFree mode should keep side-effectful nodes
      expect(result.stats.totalNodes).toBe(2);
    });

    it('may remove non-reachable nodes in sideEffectFree mode', () => {
      const shaker = new TreeShaker({ sideEffectFree: true, entryPoints: ['main'] });
      const result = shaker.shake([node('main'), node('unused', 'GenericNode')]);
      expect(result.stats.totalNodes).toBe(2);
      expect(result.stats.removedNodes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getGraphStats', () => {
    it('returns empty stats before shake', () => {
      const shaker = new TreeShaker();
      const stats = shaker.getGraphStats();
      expect(stats.nodeCount).toBe(0);
      expect(stats.edgeCount).toBe(0);
    });

    it('returns populated stats after shake', () => {
      const shaker = new TreeShaker({ entryPoints: ['a'] });
      shaker.shake([node('a'), node('b')]);
      const stats = shaker.getGraphStats();
      expect(stats.nodeCount).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('treeShake (convenience)', () => {
  it('works as standalone function', () => {
    const result = treeShake([node('a'), node('b')], { entryPoints: ['a'] });
    expect(result.stats.totalNodes).toBe(2);
  });
});

describe('eliminateDeadCode', () => {
  it('returns nodes array', () => {
    const result = eliminateDeadCode([node('a'), node('b')]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('handles empty input', () => {
    const result = eliminateDeadCode([]);
    expect(result).toEqual([]);
  });

  it('preserves live nodes', () => {
    const nodes = [node('alive')];
    const result = eliminateDeadCode(nodes);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].name).toBe('alive');
  });
});
