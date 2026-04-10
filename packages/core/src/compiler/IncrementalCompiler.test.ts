/**
 * IncrementalCompiler Tests
 *
 * Tests for hot reload and incremental compilation support.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  IncrementalCompiler,
  type DiffResult,
  type ASTChange,
  type CacheEntry,
  type StateSnapshot,
} from './IncrementalCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

describe('IncrementalCompiler', () => {
  let compiler: IncrementalCompiler;

  beforeEach(() => {
    compiler = new IncrementalCompiler();
  });

  // ==========================================================================
  // AST Diffing
  // ==========================================================================

  describe('diff()', () => {
    it('should detect no changes for identical ASTs', () => {
      const ast: HoloComposition = {
        version: 1,
        objects: [
          {
            name: 'myOrb',
            type: 'orb',
            properties: [{ type: 'ObjectProperty', key: 'radius', value: 1 }],
          },
        ],
      };

      const result = compiler.diff(ast, ast);

      expect(result.hasChanges).toBe(false);
      expect(result.addedObjects).toHaveLength(0);
      expect(result.removedObjects).toHaveLength(0);
      expect(result.modifiedObjects).toHaveLength(0);
    });

    it('should detect added objects', () => {
      const oldAST: HoloComposition = {
        version: 1,
        objects: [],
      };

      const newAST: HoloComposition = {
        version: 1,
        objects: [{ name: 'newOrb', type: 'orb', properties: [] }],
      };

      const result = compiler.diff(oldAST, newAST);

      expect(result.hasChanges).toBe(true);
      expect(result.addedObjects).toContain('newOrb');
    });

    it('should detect removed objects', () => {
      const oldAST: HoloComposition = {
        version: 1,
        objects: [{ name: 'oldOrb', type: 'orb', properties: [] }],
      };

      const newAST: HoloComposition = {
        version: 1,
        objects: [],
      };

      const result = compiler.diff(oldAST, newAST);

      expect(result.hasChanges).toBe(true);
      expect(result.removedObjects).toContain('oldOrb');
    });

    it('should detect modified objects (property changes)', () => {
      const oldAST: HoloComposition = {
        version: 1,
        objects: [
          {
            name: 'myOrb',
            type: 'orb',
            properties: [{ type: 'ObjectProperty', key: 'radius', value: 1 }],
          },
        ],
      };

      const newAST: HoloComposition = {
        version: 1,
        objects: [
          {
            name: 'myOrb',
            type: 'orb',
            properties: [{ type: 'ObjectProperty', key: 'radius', value: 2 }],
          },
        ],
      };

      const result = compiler.diff(oldAST, newAST);

      expect(result.hasChanges).toBe(true);
      expect(result.modifiedObjects).toContain('myOrb');
    });

    it('should detect added properties', () => {
      const oldAST: HoloComposition = {
        version: 1,
        objects: [{ name: 'myOrb', type: 'orb', properties: [] }],
      };

      const newAST: HoloComposition = {
        version: 1,
        objects: [
          {
            name: 'myOrb',
            type: 'orb',
            properties: [{ type: 'ObjectProperty', key: 'color', value: 'red' }],
          },
        ],
      };

      const result = compiler.diff(oldAST, newAST);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.some((c) => c.type === 'added' && c.nodeName === 'color')).toBe(true);
    });

    it('should detect removed properties', () => {
      const oldAST: HoloComposition = {
        version: 1,
        objects: [
          {
            name: 'myOrb',
            type: 'orb',
            properties: [{ type: 'ObjectProperty', key: 'color', value: 'red' }],
          },
        ],
      };

      const newAST: HoloComposition = {
        version: 1,
        objects: [{ name: 'myOrb', type: 'orb', properties: [] }],
      };

      const result = compiler.diff(oldAST, newAST);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.some((c) => c.type === 'removed' && c.nodeName === 'color')).toBe(true);
    });

    it('should handle null old AST (initial compilation)', () => {
      const newAST: HoloComposition = {
        version: 1,
        objects: [{ name: 'firstOrb', type: 'orb', properties: [] }],
      };

      const result = compiler.diff(null, newAST);

      expect(result.hasChanges).toBe(true);
      expect(result.addedObjects).toContain('firstOrb');
    });

    it('should detect trait additions', () => {
      const oldAST: HoloComposition = {
        version: 1,
        objects: [{ name: 'myOrb', type: 'orb', properties: [], traits: [] }],
      };

      const newAST: HoloComposition = {
        version: 1,
        objects: [{ name: 'myOrb', type: 'orb', properties: [], traits: ['grabbable'] }],
      };

      const result = compiler.diff(oldAST, newAST);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.some((c) => c.nodeType === 'trait' && c.type === 'added')).toBe(true);
    });

    it('should detect trait removals', () => {
      const oldAST: HoloComposition = {
        version: 1,
        objects: [{ name: 'myOrb', type: 'orb', properties: [], traits: ['grabbable'] }],
      };

      const newAST: HoloComposition = {
        version: 1,
        objects: [{ name: 'myOrb', type: 'orb', properties: [], traits: [] }],
      };

      const result = compiler.diff(oldAST, newAST);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.some((c) => c.nodeType === 'trait' && c.type === 'removed')).toBe(true);
    });

    it('should track unchanged objects', () => {
      const ast: HoloComposition = {
        version: 1,
        objects: [
          {
            name: 'unchangedOrb',
            type: 'orb',
            properties: [{ type: 'ObjectProperty', key: 'radius', value: 1 }],
          },
          {
            name: 'changedOrb',
            type: 'orb',
            properties: [{ type: 'ObjectProperty', key: 'radius', value: 1 }],
          },
        ],
      };

      const newAST: HoloComposition = {
        version: 1,
        objects: [
          {
            name: 'unchangedOrb',
            type: 'orb',
            properties: [{ type: 'ObjectProperty', key: 'radius', value: 1 }],
          },
          {
            name: 'changedOrb',
            type: 'orb',
            properties: [{ type: 'ObjectProperty', key: 'radius', value: 2 }],
          },
        ],
      };

      const result = compiler.diff(ast, newAST);

      expect(result.unchangedObjects).toContain('unchangedOrb');
      expect(result.modifiedObjects).toContain('changedOrb');
    });
  });

  // ==========================================================================
  // Caching
  // ==========================================================================

  describe('Caching', () => {
    it('should store and retrieve cached entries', () => {
      const hash = 'abc123';
      const code = 'compiled code';
      const deps = ['dep1', 'dep2'];

      compiler.setCached('myObject', hash, code, deps);
      const cached = compiler.getCached('myObject', hash);

      expect(cached).not.toBeNull();
      expect(cached?.hash).toBe(hash);
      expect(cached?.compiledCode).toBe(code);
      expect(cached?.dependencies).toEqual(deps);
    });

    it('should return null for cache miss (different hash)', () => {
      compiler.setCached('myObject', 'hash1', 'code', []);
      const cached = compiler.getCached('myObject', 'hash2');

      expect(cached).toBeNull();
    });

    it('should return null for non-existent cache entry', () => {
      const cached = compiler.getCached('nonExistent', 'hash');

      expect(cached).toBeNull();
    });

    it('should update cache entry on re-set', () => {
      compiler.setCached('myObject', 'hash1', 'old code', ['dep1']);
      compiler.setCached('myObject', 'hash2', 'new code', ['dep2', 'dep3']);

      const cached = compiler.getCached('myObject', 'hash2');

      expect(cached?.compiledCode).toBe('new code');
      expect(cached?.dependencies).toEqual(['dep2', 'dep3']);
    });

    it('should record timestamp on cache set', () => {
      const before = Date.now();
      compiler.setCached('myObject', 'hash', 'code', []);
      const after = Date.now();

      const cached = compiler.getCached('myObject', 'hash');

      expect(cached?.timestamp).toBeGreaterThanOrEqual(before);
      expect(cached?.timestamp).toBeLessThanOrEqual(after);
    });
  });

  // ==========================================================================
  // State Management
  // ==========================================================================

  describe('State Management', () => {
    it('should save and restore state', () => {
      const states = new Map<string, Record<string, unknown>>([
        ['orb1', { position: { x: 1, y: 2, z: 3 }, color: 'red' }],
        ['orb2', { visible: true }],
      ]);

      compiler.saveState(states);
      const restored = compiler.restoreState();

      expect(restored).not.toBeNull();
      expect(restored?.objectStates.get('orb1')).toEqual({
        position: { x: 1, y: 2, z: 3 },
        color: 'red',
      });
      expect(restored?.objectStates.get('orb2')).toEqual({ visible: true });
    });

    it('should record timestamp on state save', () => {
      const before = Date.now();
      compiler.saveState(new Map());
      const after = Date.now();

      const restored = compiler.restoreState();

      expect(restored?.timestamp).toBeGreaterThanOrEqual(before);
      expect(restored?.timestamp).toBeLessThanOrEqual(after);
    });

    it('should return null when no state is saved', () => {
      const restored = compiler.restoreState();

      expect(restored).toBeNull();
    });

    it('should clear saved state', () => {
      compiler.saveState(new Map([['orb', { x: 1 }]]));
      compiler.clearState();

      const restored = compiler.restoreState();

      expect(restored).toBeNull();
    });

    it('should not mutate original state map', () => {
      const originalStates = new Map<string, Record<string, unknown>>([['orb', { value: 1 }]]);

      compiler.saveState(originalStates);

      // Modify original
      originalStates.set('orb', { value: 999 });

      const restored = compiler.restoreState();

      expect(restored?.objectStates.get('orb')).toEqual({ value: 1 });
    });
  });

  // ==========================================================================
  // Dependency Tracking
  // ==========================================================================

  describe('Dependency Tracking', () => {
    it('should track object dependencies', () => {
      compiler.updateDependencies('child', ['parent1', 'parent2']);

      const dependents = compiler.getDependents('parent1');

      expect(dependents).toContain('child');
    });

    it('should return empty array for objects with no dependents', () => {
      compiler.updateDependencies('object1', ['object2']);

      const dependents = compiler.getDependents('object1');

      expect(dependents).toEqual([]);
    });

    it('should handle multiple dependents', () => {
      compiler.updateDependencies('child1', ['parent']);
      compiler.updateDependencies('child2', ['parent']);
      compiler.updateDependencies('child3', ['parent']);

      const dependents = compiler.getDependents('parent');

      expect(dependents).toHaveLength(3);
      expect(dependents).toContain('child1');
      expect(dependents).toContain('child2');
      expect(dependents).toContain('child3');
    });

    it('should update dependencies correctly', () => {
      compiler.updateDependencies('child', ['oldParent']);
      compiler.updateDependencies('child', ['newParent']);

      const oldDependents = compiler.getDependents('oldParent');
      const newDependents = compiler.getDependents('newParent');

      expect(oldDependents).not.toContain('child');
      expect(newDependents).toContain('child');
    });

    it('should handle circular dependencies gracefully', () => {
      compiler.updateDependencies('a', ['b']);
      compiler.updateDependencies('b', ['a']);

      // Should not throw
      expect(compiler.getDependents('a')).toContain('b');
      expect(compiler.getDependents('b')).toContain('a');
    });
  });

  // ==========================================================================
  // Child Objects
  // ==========================================================================

  describe('Child Objects', () => {
    it('should detect added child objects', () => {
      const oldAST: HoloComposition = {
        version: 1,
        objects: [{ name: 'parent', type: 'orb', properties: [], children: [] }],
      };

      const newAST: HoloComposition = {
        version: 1,
        objects: [
          {
            name: 'parent',
            type: 'orb',
            properties: [],
            children: [{ name: 'child', type: 'orb', properties: [] }],
          },
        ],
      };

      const result = compiler.diff(oldAST, newAST);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.some((c) => c.nodeName === 'child' && c.type === 'added')).toBe(true);
    });

    it('should detect removed child objects', () => {
      const oldAST: HoloComposition = {
        version: 1,
        objects: [
          {
            name: 'parent',
            type: 'orb',
            properties: [],
            children: [{ name: 'child', type: 'orb', properties: [] }],
          },
        ],
      };

      const newAST: HoloComposition = {
        version: 1,
        objects: [{ name: 'parent', type: 'orb', properties: [], children: [] }],
      };

      const result = compiler.diff(oldAST, newAST);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.some((c) => c.nodeName === 'child' && c.type === 'removed')).toBe(true);
    });
  });

  // ==========================================================================
  // Spatial Groups
  // ==========================================================================

  describe('Spatial Groups', () => {
    it('should detect objects in spatial groups', () => {
      const oldAST: HoloComposition = {
        version: 1,
        objects: [],
        spatialGroups: [],
      };

      const newAST: HoloComposition = {
        version: 1,
        objects: [],
        spatialGroups: [
          {
            name: 'group1',
            position: { x: 0, y: 0, z: 0 },
            objects: [{ name: 'groupedOrb', type: 'orb', properties: [] }],
          },
        ],
      };

      const result = compiler.diff(oldAST, newAST);

      expect(result.hasChanges).toBe(true);
      expect(result.addedObjects).toContain('groupedOrb');
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty compositions', () => {
      const ast: HoloComposition = { version: 1 };

      const result = compiler.diff(ast, ast);

      expect(result.hasChanges).toBe(false);
    });

    it('should handle objects with no properties', () => {
      const ast: HoloComposition = {
        version: 1,
        objects: [{ name: 'emptyOrb', type: 'orb' } as HoloObjectDecl],
      };

      // Should not throw
      expect(() => compiler.diff(ast, ast)).not.toThrow();
    });

    it('should handle deeply nested children', () => {
      const ast: HoloComposition = {
        version: 1,
        objects: [
          {
            name: 'level1',
            type: 'orb',
            properties: [],
            children: [
              {
                name: 'level2',
                type: 'orb',
                properties: [],
                children: [
                  {
                    name: 'level3',
                    type: 'orb',
                    properties: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = compiler.diff(null, ast);

      expect(result.addedObjects).toContain('level1');
      expect(result.addedObjects).toContain('level2');
      expect(result.addedObjects).toContain('level3');
    });

    it('should handle trait config changes', () => {
      const oldAST: HoloComposition = {
        version: 1,
        objects: [
          {
            name: 'myOrb',
            type: 'orb',
            properties: [],
            traits: [{ physics: { mass: 1 } }],
          },
        ],
      };

      const newAST: HoloComposition = {
        version: 1,
        objects: [
          {
            name: 'myOrb',
            type: 'orb',
            properties: [],
            traits: [{ physics: { mass: 2 } }],
          },
        ],
      };

      const result = compiler.diff(oldAST, newAST);

      expect(result.hasChanges).toBe(true);
      expect(result.modifiedObjects).toContain('myOrb');
    });
  });
});
