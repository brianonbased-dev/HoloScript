import { describe, it, expect, beforeEach } from 'vitest';
import {
  IncrementalCompiler,
  createIncrementalCompiler,
  type DiffResult,
  type ASTChange,
} from '../../compiler/IncrementalCompiler';
import type { HoloComposition, HoloObject } from '../../parser/HoloCompositionTypes';

describe('IncrementalCompiler', () => {
  let compiler: IncrementalCompiler;

  beforeEach(() => {
    compiler = new IncrementalCompiler();
  });

  const createComposition = (objects: HoloObject[]): HoloComposition => ({
    name: 'TestScene',
    objects,
  });

  const createObject = (name: string, props: Record<string, unknown> = {}): HoloObject => ({
    name,
    properties: Object.entries(props).map(([key, value]) => ({ key, value })),
  });

  describe('initialization', () => {
    it('should create compiler instance', () => {
      expect(compiler).toBeDefined();
    });

    it('should create compiler via factory', () => {
      const factoryCompiler = createIncrementalCompiler();
      expect(factoryCompiler).toBeDefined();
    });
  });

  describe('diff', () => {
    it('should detect all objects as added on first compile', () => {
      const composition = createComposition([
        createObject('Cube', { mesh: 'cube' }),
        createObject('Sphere', { mesh: 'sphere' }),
      ]);

      const result = compiler.diff(null, composition);

      expect(result.hasChanges).toBe(true);
      expect(result.addedObjects).toContain('Cube');
      expect(result.addedObjects).toContain('Sphere');
      expect(result.removedObjects).toHaveLength(0);
      expect(result.modifiedObjects).toHaveLength(0);
    });

    it('should detect added objects', () => {
      const oldComposition = createComposition([createObject('Cube', { mesh: 'cube' })]);
      const newComposition = createComposition([
        createObject('Cube', { mesh: 'cube' }),
        createObject('Sphere', { mesh: 'sphere' }),
      ]);

      // First compile to set previous AST
      compiler.diff(null, oldComposition);
      const result = compiler.diff(oldComposition, newComposition);

      expect(result.hasChanges).toBe(true);
      expect(result.addedObjects).toContain('Sphere');
      expect(result.removedObjects).toHaveLength(0);
    });

    it('should detect removed objects', () => {
      const oldComposition = createComposition([
        createObject('Cube', { mesh: 'cube' }),
        createObject('Sphere', { mesh: 'sphere' }),
      ]);
      const newComposition = createComposition([createObject('Cube', { mesh: 'cube' })]);

      const result = compiler.diff(oldComposition, newComposition);

      expect(result.hasChanges).toBe(true);
      expect(result.removedObjects).toContain('Sphere');
      expect(result.addedObjects).toHaveLength(0);
    });

    it('should detect modified objects', () => {
      const oldComposition = createComposition([
        createObject('Cube', { mesh: 'cube', color: '#ff0000' }),
      ]);
      const newComposition = createComposition([
        createObject('Cube', { mesh: 'cube', color: '#00ff00' }),
      ]);

      const result = compiler.diff(oldComposition, newComposition);

      expect(result.hasChanges).toBe(true);
      expect(result.modifiedObjects).toContain('Cube');
      expect(result.unchangedObjects).toHaveLength(0);
    });

    it('should detect unchanged objects', () => {
      const oldComposition = createComposition([
        createObject('Cube', { mesh: 'cube', color: '#ff0000' }),
        createObject('Sphere', { mesh: 'sphere' }),
      ]);
      const newComposition = createComposition([
        createObject('Cube', { mesh: 'cube', color: '#00ff00' }),
        createObject('Sphere', { mesh: 'sphere' }),
      ]);

      const result = compiler.diff(oldComposition, newComposition);

      expect(result.unchangedObjects).toContain('Sphere');
      expect(result.modifiedObjects).toContain('Cube');
    });

    it('should detect property additions', () => {
      const oldComposition = createComposition([createObject('Cube', { mesh: 'cube' })]);
      const newComposition = createComposition([
        createObject('Cube', { mesh: 'cube', color: '#ff0000' }),
      ]);

      const result = compiler.diff(oldComposition, newComposition);

      const colorChange = result.changes.find((c) => c.nodeName === 'color' && c.type === 'added');
      expect(colorChange).toBeDefined();
    });

    it('should detect property removals', () => {
      const oldComposition = createComposition([
        createObject('Cube', { mesh: 'cube', color: '#ff0000' }),
      ]);
      const newComposition = createComposition([createObject('Cube', { mesh: 'cube' })]);

      const result = compiler.diff(oldComposition, newComposition);

      const colorChange = result.changes.find(
        (c) => c.nodeName === 'color' && c.type === 'removed'
      );
      expect(colorChange).toBeDefined();
    });

    it('should detect trait changes', () => {
      const oldObj: HoloObject = {
        name: 'Cube',
        properties: [{ key: 'mesh', value: 'cube' }],
        traits: ['grabbable'],
      };
      const newObj: HoloObject = {
        name: 'Cube',
        properties: [{ key: 'mesh', value: 'cube' }],
        traits: ['grabbable', 'physics'],
      };

      const oldComposition = createComposition([oldObj]);
      const newComposition = createComposition([newObj]);

      const result = compiler.diff(oldComposition, newComposition);

      const traitChange = result.changes.find(
        (c) => c.nodeName === 'physics' && c.type === 'added'
      );
      expect(traitChange).toBeDefined();
    });

    it('should handle nested children', () => {
      const oldComposition: HoloComposition = {
        name: 'Scene',
        objects: [
          {
            name: 'Parent',
            properties: [],
            children: [createObject('Child', { mesh: 'cube' })],
          },
        ],
      };
      const newComposition: HoloComposition = {
        name: 'Scene',
        objects: [
          {
            name: 'Parent',
            properties: [],
            children: [
              createObject('Child', { mesh: 'cube' }),
              createObject('NewChild', { mesh: 'sphere' }),
            ],
          },
        ],
      };

      const result = compiler.diff(oldComposition, newComposition);

      expect(result.hasChanges).toBe(true);
      const addedChild = result.changes.find(
        (c) => c.nodeName === 'NewChild' && c.type === 'added'
      );
      expect(addedChild).toBeDefined();
    });
  });

  describe('caching', () => {
    it('should cache and retrieve compilation results', () => {
      const hash = 'abc123';
      const compiled = 'function Cube() { return <mesh />; }';

      compiler.setCached('Cube', hash, compiled, []);
      const cached = compiler.getCached('Cube', hash);

      expect(cached).not.toBeNull();
      expect(cached!.compiledCode).toBe(compiled);
    });

    it('should return null for invalid hash', () => {
      compiler.setCached('Cube', 'hash1', 'code', []);
      const cached = compiler.getCached('Cube', 'different-hash');

      expect(cached).toBeNull();
    });

    it('should return null for missing cache entry', () => {
      const cached = compiler.getCached('NonExistent', 'any-hash');
      expect(cached).toBeNull();
    });
  });

  describe('state management', () => {
    it('should save and restore state', () => {
      const states = new Map<string, Record<string, unknown>>();
      states.set('Counter', { count: 5 });
      states.set('Toggle', { active: true });

      compiler.saveState(states);
      const restored = compiler.restoreState();

      expect(restored).not.toBeNull();
      expect(restored!.objectStates.get('Counter')).toEqual({ count: 5 });
      expect(restored!.objectStates.get('Toggle')).toEqual({ active: true });
    });

    it('should clear state', () => {
      const states = new Map();
      states.set('Test', { value: 1 });
      compiler.saveState(states);

      compiler.clearState();

      expect(compiler.restoreState()).toBeNull();
    });
  });

  describe('dependency tracking', () => {
    it('should track dependencies', () => {
      compiler.updateDependencies('Button', ['Theme', 'i18n']);
      compiler.updateDependencies('Card', ['Theme']);

      const themeDependents = compiler.getDependents('Theme');

      expect(themeDependents).toContain('Button');
      expect(themeDependents).toContain('Card');
    });

    it('should compute recompilation set', () => {
      compiler.updateDependencies('Button', ['Theme']);
      compiler.updateDependencies('Card', ['Theme']);
      compiler.updateDependencies('Header', ['Card']);

      const recompileSet = compiler.getRecompilationSet(['Theme']);

      expect(recompileSet.has('Theme')).toBe(true);
      expect(recompileSet.has('Button')).toBe(true);
      expect(recompileSet.has('Card')).toBe(true);
      expect(recompileSet.has('Header')).toBe(true);
    });
  });

  describe('compile', () => {
    it('should compile all objects on first run', async () => {
      const composition = createComposition([
        createObject('Cube', { mesh: 'cube' }),
        createObject('Sphere', { mesh: 'sphere' }),
      ]);

      const mockCompile = (obj: HoloObject) => `function ${obj.name}() {}`;

      const result = await compiler.compile(composition, mockCompile);

      expect(result.fullRecompile).toBe(true);
      expect(result.recompiledObjects).toContain('Cube');
      expect(result.recompiledObjects).toContain('Sphere');
      expect(result.cachedObjects).toHaveLength(0);
    });

    it('should use cache for unchanged objects', async () => {
      const composition1 = createComposition([
        createObject('Cube', { mesh: 'cube' }),
        createObject('Sphere', { mesh: 'sphere' }),
      ]);
      const composition2 = createComposition([
        createObject('Cube', { mesh: 'cube' }),
        createObject('Sphere', { mesh: 'sphere', color: '#ff0000' }),
      ]);

      const mockCompile = (obj: HoloObject) => `function ${obj.name}() {}`;

      // First compile
      await compiler.compile(composition1, mockCompile);

      // Second compile with one change
      const result = await compiler.compile(composition2, mockCompile);

      expect(result.fullRecompile).toBe(false);
      expect(result.cachedObjects).toContain('Cube');
      expect(result.recompiledObjects).toContain('Sphere');
    });

    it('should force recompile specified objects', async () => {
      const composition = createComposition([createObject('Cube', { mesh: 'cube' })]);

      const mockCompile = (obj: HoloObject) => `function ${obj.name}() {}`;

      // First compile
      await compiler.compile(composition, mockCompile);

      // Second compile with force
      const result = await compiler.compile(composition, mockCompile, {
        forceRecompile: ['Cube'],
      });

      expect(result.recompiledObjects).toContain('Cube');
    });
  });

  describe('reset', () => {
    it('should clear all state', async () => {
      const composition = createComposition([createObject('Cube', { mesh: 'cube' })]);
      await compiler.compile(composition, () => 'code');
      compiler.saveState(new Map([['Test', { x: 1 }]]));
      compiler.updateDependencies('A', ['B']);

      compiler.reset();

      const stats = await compiler.getStats();
      expect(stats.cacheSize).toBe(0);
      expect(stats.dependencyEdges).toBe(0);
      expect(compiler.restoreState()).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      compiler.setCached('Obj1', 'h1', 'code1', []);
      compiler.setCached('Obj2', 'h2', 'code2', []);
      compiler.updateDependencies('A', ['B', 'C']);

      const stats = await compiler.getStats();

      expect(stats.cacheSize).toBe(2);
      expect(stats.objectsCached).toContain('Obj1');
      expect(stats.objectsCached).toContain('Obj2');
      expect(stats.dependencyEdges).toBe(2);
    });

    it('should include trait graph statistics', async () => {
      const composition = createComposition([
        {
          name: 'Cube',
          properties: [{ key: 'mesh', value: 'cube' }],
          traits: ['physics', 'grabbable'],
        },
      ]);
      await compiler.compile(composition, () => 'code');

      const stats = await compiler.getStats();

      expect(stats.traitGraphStats).toBeDefined();
      expect(stats.traitGraphStats.objectCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('trait config change detection', () => {
    it('should detect trait config changes', () => {
      // Object with trait that has config
      const oldObj: HoloObject = {
        name: 'Ball',
        properties: [],
        traits: [{ name: 'physics', mass: 1.0, restitution: 0.5 }],
      };
      const newObj: HoloObject = {
        name: 'Ball',
        properties: [],
        traits: [{ name: 'physics', mass: 2.0, restitution: 0.5 }], // mass changed
      };

      const oldComposition = createComposition([oldObj]);
      const newComposition = createComposition([newObj]);

      const result = compiler.diff(oldComposition, newComposition);

      expect(result.hasChanges).toBe(true);
      expect(result.modifiedObjects).toContain('Ball');

      // Should have a trait modification change
      const traitChange = result.changes.find(
        (c) => c.nodeName === 'physics' && c.type === 'modified'
      );
      expect(traitChange).toBeDefined();
    });

    it('should not detect changes when trait config is unchanged', () => {
      const obj: HoloObject = {
        name: 'Ball',
        properties: [],
        traits: [{ name: 'physics', mass: 1.0 }],
      };

      const oldComposition = createComposition([obj]);
      const newComposition = createComposition([obj]);

      const result = compiler.diff(oldComposition, newComposition);

      // Same config should not produce changes
      expect(result.hasChanges).toBe(false);
      expect(result.unchangedObjects).toContain('Ball');
    });

    it('should handle mixed trait formats (string and object)', () => {
      const oldObj: HoloObject = {
        name: 'Cube',
        properties: [],
        traits: ['grabbable', { name: 'physics', mass: 1.0 }],
      };
      const newObj: HoloObject = {
        name: 'Cube',
        properties: [],
        traits: ['grabbable', { name: 'physics', mass: 2.0 }],
      };

      const oldComposition = createComposition([oldObj]);
      const newComposition = createComposition([newObj]);

      const result = compiler.diff(oldComposition, newComposition);

      expect(result.hasChanges).toBe(true);
      // grabbable should be unchanged, physics config should be modified
      const physicsChange = result.changes.find((c) => c.nodeName === 'physics');
      expect(physicsChange).toBeDefined();
      expect(physicsChange!.type).toBe('modified');
    });

    it('should detect trait addition with config', () => {
      const oldObj: HoloObject = {
        name: 'Cube',
        properties: [],
        traits: ['grabbable'],
      };
      const newObj: HoloObject = {
        name: 'Cube',
        properties: [],
        traits: ['grabbable', { name: 'physics', mass: 5.0 }],
      };

      const oldComposition = createComposition([oldObj]);
      const newComposition = createComposition([newObj]);

      const result = compiler.diff(oldComposition, newComposition);

      expect(result.hasChanges).toBe(true);
      const physicsChange = result.changes.find((c) => c.nodeName === 'physics');
      expect(physicsChange).toBeDefined();
      expect(physicsChange!.type).toBe('added');
    });

    it('should detect trait removal with config', () => {
      const oldObj: HoloObject = {
        name: 'Cube',
        properties: [],
        traits: ['grabbable', { name: 'physics', mass: 5.0 }],
      };
      const newObj: HoloObject = {
        name: 'Cube',
        properties: [],
        traits: ['grabbable'],
      };

      const oldComposition = createComposition([oldObj]);
      const newComposition = createComposition([newObj]);

      const result = compiler.diff(oldComposition, newComposition);

      expect(result.hasChanges).toBe(true);
      const physicsChange = result.changes.find((c) => c.nodeName === 'physics');
      expect(physicsChange).toBeDefined();
      expect(physicsChange!.type).toBe('removed');
    });

    it('should handle trait config with nested objects', () => {
      const oldObj: HoloObject = {
        name: 'Cube',
        properties: [],
        traits: [{ name: 'audio', volume: 0.8, spatial: { maxDistance: 10 } }],
      };
      const newObj: HoloObject = {
        name: 'Cube',
        properties: [],
        traits: [{ name: 'audio', volume: 0.8, spatial: { maxDistance: 20 } }],
      };

      const oldComposition = createComposition([oldObj]);
      const newComposition = createComposition([newObj]);

      const result = compiler.diff(oldComposition, newComposition);

      expect(result.hasChanges).toBe(true);
      const audioChange = result.changes.find((c) => c.nodeName === 'audio');
      expect(audioChange).toBeDefined();
      expect(audioChange!.type).toBe('modified');
    });
  });

  describe('trait graph access', () => {
    it('should provide access to trait graph', () => {
      const graph = compiler.getTraitGraph();
      expect(graph).toBeDefined();
      expect(typeof graph.getStats).toBe('function');
    });

    it('should register objects with trait graph during compile', async () => {
      const composition = createComposition([
        {
          name: 'Ball',
          properties: [],
          traits: ['physics', 'grabbable'],
        },
      ]);

      await compiler.compile(composition, () => 'code');
      const stats = compiler.getTraitGraph().getStats();

      expect(stats.objectCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('cache persistence', () => {
    it('should serialize and deserialize compiler state', async () => {
      // Set up compiler with cache and dependencies
      compiler.setCached('Cube', 'hash1', 'function Cube() {}', []);
      compiler.setCached('Sphere', 'hash2', 'function Sphere() {}', ['Cube']);
      compiler.updateDependencies('Sphere', ['Cube']);

      // Serialize
      const json = compiler.serialize();
      expect(json).toBeDefined();

      // Deserialize
      const restored = IncrementalCompiler.deserialize(json);

      // Verify cache was restored
      const stats = await restored.getStats();
      expect(stats.cacheSize).toBe(2);
      expect(stats.objectsCached).toContain('Cube');
      expect(stats.objectsCached).toContain('Sphere');
    });

    it('should restore cache entries with correct data', () => {
      const compiledCode = 'function MyComponent() { return <mesh />; }';
      compiler.setCached('MyComponent', 'abc123', compiledCode, ['dep1']);

      const json = compiler.serialize();
      const restored = IncrementalCompiler.deserialize(json);

      const cached = restored.getCached('MyComponent', 'abc123');
      expect(cached).not.toBeNull();
      expect(cached!.compiledCode).toBe(compiledCode);
    });

    it('should restore dependency graph', () => {
      compiler.updateDependencies('Button', ['Theme', 'i18n']);
      compiler.updateDependencies('Card', ['Theme']);

      const json = compiler.serialize();
      const restored = IncrementalCompiler.deserialize(json);

      const dependents = restored.getDependents('Theme');
      expect(dependents).toContain('Button');
      expect(dependents).toContain('Card');
    });

    it('should restore trait graph', async () => {
      const composition = createComposition([
        {
          name: 'Ball',
          properties: [],
          traits: ['physics', 'grabbable'],
        },
      ]);
      await compiler.compile(composition, () => 'code');

      const json = compiler.serialize();
      const restored = IncrementalCompiler.deserialize(json);

      // Trait graph should have data
      const stats = restored.getTraitGraph().getStats();
      expect(stats.objectCount).toBeGreaterThanOrEqual(1);
    });

    it('should throw on unsupported cache version', () => {
      const badJson = JSON.stringify({
        version: 99,
        entries: [],
        dependencies: [],
        traitGraph:
          '{"version":1,"traitDependencies":[],"traitConflicts":[],"objectTraits":[],"timestamp":0}',
        timestamp: Date.now(),
      });

      expect(() => IncrementalCompiler.deserialize(badJson)).toThrow('Unsupported');
    });

    it('should handle empty cache serialization', async () => {
      const json = compiler.serialize();
      const restored = IncrementalCompiler.deserialize(json);

      const stats = await restored.getStats();
      expect(stats.cacheSize).toBe(0);
      expect(stats.dependencyEdges).toBe(0);
    });
  });
});
