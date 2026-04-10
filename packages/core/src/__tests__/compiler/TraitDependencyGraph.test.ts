import { describe, it, expect, beforeEach } from 'vitest';
import {
  TraitDependencyGraph,
  globalTraitGraph,
  type TraitUsage,
  type ObjectTraitInfo,
  type TraitDefinition,
} from '../../compiler/TraitDependencyGraph';

describe('TraitDependencyGraph', () => {
  let graph: TraitDependencyGraph;

  beforeEach(() => {
    graph = new TraitDependencyGraph();
  });

  describe('trait registration', () => {
    it('should register traits with dependencies', () => {
      graph.registerTrait({
        name: 'grabbable',
        requires: ['collidable'],
        conflicts: [],
      });

      const stats = graph.getStats();
      expect(stats.traitCount).toBe(1);
    });

    it('should register traits with conflicts', () => {
      graph.registerTrait({
        name: 'physics',
        requires: [],
        conflicts: ['static'],
      });

      // No direct API to check conflicts, but it should not throw
      expect(graph.getStats().traitCount).toBe(1);
    });

    it('should register builtin traits', () => {
      graph.registerBuiltinTraits();
      const stats = graph.getStats();
      expect(stats.traitCount).toBeGreaterThan(5);
    });
  });

  describe('object registration', () => {
    it('should register objects with traits', () => {
      const info: ObjectTraitInfo = {
        objectName: 'Ball',
        sourceId: 'scene.holo',
        traits: [
          { name: 'physics', config: { mass: 1.0 }, configHash: '' },
          { name: 'grabbable', config: {}, configHash: '' },
        ],
      };

      graph.registerObject(info);

      const stats = graph.getStats();
      expect(stats.objectCount).toBe(1);
    });

    it('should compute config hashes if not provided', () => {
      const info: ObjectTraitInfo = {
        objectName: 'Cube',
        sourceId: 'scene.holo',
        traits: [{ name: 'physics', config: { mass: 2.0 }, configHash: '' }],
      };

      graph.registerObject(info);
      // Internally it should have computed a hash
      const stats = graph.getStats();
      expect(stats.objectCount).toBe(1);
    });

    it('should track trait to object mappings', () => {
      graph.registerObject({
        objectName: 'Ball1',
        sourceId: 'scene.holo',
        traits: [{ name: 'physics', config: {}, configHash: '' }],
      });
      graph.registerObject({
        objectName: 'Ball2',
        sourceId: 'scene.holo',
        traits: [{ name: 'physics', config: {}, configHash: '' }],
      });

      const users = graph.getObjectsUsingTrait('physics');
      expect(users.has('Ball1')).toBe(true);
      expect(users.has('Ball2')).toBe(true);
    });

    it('should track template to object mappings', () => {
      // Register the template itself first
      graph.registerObject({
        objectName: 'BallTemplate',
        sourceId: 'templates.holo',
        traits: [],
      });
      // Then register object using the template
      graph.registerObject({
        objectName: 'MyBall',
        sourceId: 'scene.holo',
        traits: [],
        template: 'BallTemplate',
      });

      // Verify through recompilation set calculation
      const recompileSet = graph.calculateRecompilationSet(['BallTemplate']);
      expect(recompileSet.has('BallTemplate')).toBe(true);
      expect(recompileSet.has('MyBall')).toBe(true);
    });

    it('should unregister objects', () => {
      graph.registerObject({
        objectName: 'Ball',
        sourceId: 'scene.holo',
        traits: [{ name: 'physics', config: {}, configHash: '' }],
      });

      expect(graph.getStats().objectCount).toBe(1);

      graph.unregisterObject('Ball');

      expect(graph.getStats().objectCount).toBe(0);
      expect(graph.getObjectsUsingTrait('physics').size).toBe(0);
    });
  });

  describe('change detection', () => {
    beforeEach(() => {
      graph.registerObject({
        objectName: 'Ball',
        sourceId: 'scene.holo',
        traits: [
          { name: 'physics', config: { mass: 1.0 }, configHash: '' },
          { name: 'grabbable', config: {}, configHash: '' },
        ],
      });
      graph.saveSnapshot();
    });

    it('should detect added traits', () => {
      const newTraits: TraitUsage[] = [
        { name: 'physics', config: { mass: 1.0 }, configHash: '' },
        { name: 'grabbable', config: {}, configHash: '' },
        { name: 'throwable', config: {}, configHash: '' },
      ];

      const changes = graph.detectTraitChanges('Ball', newTraits);

      expect(changes.length).toBe(1);
      expect(changes[0].traitName).toBe('throwable');
      expect(changes[0].changeType).toBe('added');
    });

    it('should detect removed traits', () => {
      const newTraits: TraitUsage[] = [{ name: 'physics', config: { mass: 1.0 }, configHash: '' }];

      const changes = graph.detectTraitChanges('Ball', newTraits);

      expect(changes.length).toBe(1);
      expect(changes[0].traitName).toBe('grabbable');
      expect(changes[0].changeType).toBe('removed');
    });

    it('should detect config changes', () => {
      const newTraits: TraitUsage[] = [
        { name: 'physics', config: { mass: 5.0 }, configHash: '' }, // mass changed
        { name: 'grabbable', config: {}, configHash: '' },
      ];

      const changes = graph.detectTraitChanges('Ball', newTraits);

      expect(changes.length).toBe(1);
      expect(changes[0].traitName).toBe('physics');
      expect(changes[0].changeType).toBe('config_changed');
    });

    it('should detect multiple changes at once', () => {
      const newTraits: TraitUsage[] = [
        { name: 'physics', config: { mass: 5.0 }, configHash: '' }, // config changed
        { name: 'throwable', config: {}, configHash: '' }, // added
        // grabbable removed
      ];

      const changes = graph.detectTraitChanges('Ball', newTraits);

      expect(changes.length).toBe(3);
      expect(changes.some((c) => c.changeType === 'added')).toBe(true);
      expect(changes.some((c) => c.changeType === 'removed')).toBe(true);
      expect(changes.some((c) => c.changeType === 'config_changed')).toBe(true);
    });

    it('should detect no changes when traits are same', () => {
      const newTraits: TraitUsage[] = [
        { name: 'physics', config: { mass: 1.0 }, configHash: '' },
        { name: 'grabbable', config: {}, configHash: '' },
      ];

      const changes = graph.detectTraitChanges('Ball', newTraits);

      expect(changes.length).toBe(0);
    });
  });

  describe('affected set calculation', () => {
    beforeEach(() => {
      graph.registerBuiltinTraits();
      graph.registerObject({
        objectName: 'Ball1',
        sourceId: 'scene1.holo',
        traits: [{ name: 'physics', config: {}, configHash: '' }],
      });
      graph.registerObject({
        objectName: 'Ball2',
        sourceId: 'scene2.holo',
        traits: [{ name: 'physics', config: {}, configHash: '' }],
      });
      graph.registerObject({
        objectName: 'StaticBox',
        sourceId: 'scene1.holo',
        traits: [{ name: 'static', config: {}, configHash: '' }],
      });
    });

    it('should find objects affected by trait change', () => {
      const affected = graph.calculateAffectedSet([
        { traitName: 'physics', changeType: 'config_changed' },
      ]);

      expect(affected.objects.has('Ball1')).toBe(true);
      expect(affected.objects.has('Ball2')).toBe(true);
      expect(affected.objects.has('StaticBox')).toBe(false);
    });

    it('should include source files in affected set', () => {
      const affected = graph.calculateAffectedSet([
        { traitName: 'physics', changeType: 'config_changed' },
      ]);

      expect(affected.sources.has('scene1.holo')).toBe(true);
      expect(affected.sources.has('scene2.holo')).toBe(true);
    });

    it('should provide reasons for affected objects', () => {
      const affected = graph.calculateAffectedSet([{ traitName: 'physics', changeType: 'added' }]);

      const reason = affected.reasons.get('Ball1');
      expect(reason).toBeDefined();
      expect(reason).toContain('physics');
    });

    it('should find objects using dependent traits', () => {
      // grabbable requires collidable
      graph.registerObject({
        objectName: 'GrabbableItem',
        sourceId: 'scene.holo',
        traits: [{ name: 'grabbable', config: {}, configHash: '' }],
      });

      // If collidable behavior changes, grabbable objects are affected
      const affected = graph.calculateAffectedSet([
        { traitName: 'collidable', changeType: 'config_changed' },
      ]);

      expect(affected.objects.has('GrabbableItem')).toBe(true);
    });
  });

  describe('recompilation set calculation', () => {
    it('should include template dependents', () => {
      graph.registerObject({
        objectName: 'Template',
        sourceId: 'templates.holo',
        traits: [],
      });
      graph.registerObject({
        objectName: 'Instance1',
        sourceId: 'scene.holo',
        traits: [],
        template: 'Template',
      });
      graph.registerObject({
        objectName: 'Instance2',
        sourceId: 'scene.holo',
        traits: [],
        template: 'Template',
      });

      const recompileSet = graph.calculateRecompilationSet(['Template']);

      expect(recompileSet.has('Template')).toBe(true);
      expect(recompileSet.has('Instance1')).toBe(true);
      expect(recompileSet.has('Instance2')).toBe(true);
    });

    it('should propagate through template chains', () => {
      graph.registerObject({
        objectName: 'BaseTemplate',
        sourceId: 'templates.holo',
        traits: [],
      });
      graph.registerObject({
        objectName: 'DerivedTemplate',
        sourceId: 'templates.holo',
        traits: [],
        template: 'BaseTemplate',
      });
      graph.registerObject({
        objectName: 'Instance',
        sourceId: 'scene.holo',
        traits: [],
        template: 'DerivedTemplate',
      });

      const recompileSet = graph.calculateRecompilationSet(['BaseTemplate']);

      expect(recompileSet.has('BaseTemplate')).toBe(true);
      expect(recompileSet.has('DerivedTemplate')).toBe(true);
      expect(recompileSet.has('Instance')).toBe(true);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize', () => {
      graph.registerBuiltinTraits();
      graph.registerObject({
        objectName: 'Ball',
        sourceId: 'scene.holo',
        traits: [{ name: 'physics', config: { mass: 1.0 }, configHash: '' }],
      });

      const json = graph.serialize();
      const restored = TraitDependencyGraph.deserialize(json);

      const stats = restored.getStats();
      expect(stats.objectCount).toBe(1);
      expect(stats.traitCount).toBeGreaterThan(0);
    });

    it('should throw on unsupported version', () => {
      const badJson = JSON.stringify({
        version: 99,
        traitDependencies: [],
        traitConflicts: [],
        objectTraits: [],
      });
      expect(() => TraitDependencyGraph.deserialize(badJson)).toThrow('Unsupported');
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      graph.registerBuiltinTraits();
      graph.registerObject({
        objectName: 'Ball',
        sourceId: 'scene.holo',
        traits: [{ name: 'physics', config: {}, configHash: '' }],
      });

      graph.clear();

      const stats = graph.getStats();
      expect(stats.traitCount).toBe(0);
      expect(stats.objectCount).toBe(0);
    });
  });

  describe('globalTraitGraph', () => {
    it('should exist and have builtin traits', () => {
      expect(globalTraitGraph).toBeDefined();
      const stats = globalTraitGraph.getStats();
      expect(stats.traitCount).toBeGreaterThan(0);
    });
  });
});
