/**
 * TraitDependencyGraph Production Tests
 *
 * Tests trait registration, object tracking, change detection,
 * affected set calculation, serialization, and stats.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TraitDependencyGraph } from '../../compiler/TraitDependencyGraph';
import type { ObjectTraitInfo } from '../../compiler/TraitDependencyGraph';

// Use simple string hashes since hashConfig is private
const h = (s: string) => s;

describe('TraitDependencyGraph — Production', () => {
  let graph: TraitDependencyGraph;

  beforeEach(() => {
    graph = new TraitDependencyGraph();
  });

  // ─── Trait Registration ─────────────────────────────────────────────

  it('registerTrait stores trait definition', () => {
    graph.registerTrait({ name: 'grabbable', requires: [], conflicts: [] });
    const stats = graph.getStats();
    expect(stats.traitCount).toBeGreaterThanOrEqual(1);
  });

  it('registerTrait with dependencies', () => {
    graph.registerTrait({ name: 'throwable', requires: ['grabbable'], conflicts: [] });
    graph.registerTrait({ name: 'grabbable', requires: [], conflicts: [] });
    const deps = graph.getDependentTraits('grabbable');
    expect(deps.has('throwable')).toBe(true);
  });

  it('registerBuiltinTraits populates graph', () => {
    graph.registerBuiltinTraits();
    const stats = graph.getStats();
    expect(stats.traitCount).toBeGreaterThanOrEqual(10);
  });

  // ─── Object Registration ────────────────────────────────────────────

  it('registerObject tracks object traits', () => {
    const info: ObjectTraitInfo = {
      objectName: 'ball',
      sourceId: 'ball.holo',
      traits: [{ name: 'physics', config: {}, configHash: h('empty') }],
    };
    graph.registerObject(info);
    const objects = graph.getObjectsUsingTrait('physics');
    expect(objects.has('ball')).toBe(true);
  });

  it('unregisterObject removes tracking', () => {
    graph.registerObject({
      objectName: 'box',
      sourceId: 'box.holo',
      traits: [{ name: 'collidable', config: {}, configHash: h('empty') }],
    });
    graph.unregisterObject('box');
    expect(graph.getObjectsUsingTrait('collidable').has('box')).toBe(false);
  });

  it('getObjectsUsingTrait returns empty set for unknown trait', () => {
    const objects = graph.getObjectsUsingTrait('nonexistent');
    expect(objects.size).toBe(0);
  });

  // ─── Change Detection ──────────────────────────────────────────────

  it('detectTraitChanges finds added traits', () => {
    graph.registerObject({
      objectName: 'obj1',
      sourceId: 'obj1.holo',
      traits: [{ name: 'physics', config: {}, configHash: h('h1') }],
    });
    graph.saveSnapshot();

    const changes = graph.detectTraitChanges('obj1', [
      { name: 'physics', config: {}, configHash: h('h1') },
      { name: 'glowing', config: {}, configHash: h('h2') },
    ]);
    expect(changes.some(c => c.traitName === 'glowing' && c.changeType === 'added')).toBe(true);
  });

  it('detectTraitChanges finds removed traits', () => {
    graph.registerObject({
      objectName: 'obj2',
      sourceId: 'obj2.holo',
      traits: [
        { name: 'physics', config: {}, configHash: h('h1') },
        { name: 'glowing', config: {}, configHash: h('h2') },
      ],
    });
    graph.saveSnapshot();

    const changes = graph.detectTraitChanges('obj2', [
      { name: 'physics', config: {}, configHash: h('h1') },
    ]);
    expect(changes.some(c => c.traitName === 'glowing' && c.changeType === 'removed')).toBe(true);
  });

  it('detectTraitChanges finds config changes', () => {
    graph.registerObject({
      objectName: 'obj3',
      sourceId: 'obj3.holo',
      traits: [{ name: 'physics', config: { gravity: 9.8 }, configHash: h('old') }],
    });
    graph.saveSnapshot();

    const changes = graph.detectTraitChanges('obj3', [
      { name: 'physics', config: { gravity: 5.0 }, configHash: h('new') },
    ]);
    expect(changes.some(c => c.traitName === 'physics' && c.changeType === 'config_changed')).toBe(true);
  });

  // ─── Affected Set ──────────────────────────────────────────────────

  it('calculateAffectedSet returns affected objects', () => {
    graph.registerObject({
      objectName: 'ball',
      sourceId: 'ball.holo',
      traits: [{ name: 'physics', config: {}, configHash: h('h1') }],
    });

    const affected = graph.calculateAffectedSet([
      { traitName: 'physics', changeType: 'config_changed' },
    ]);
    expect(affected.objects.has('ball')).toBe(true);
    expect(affected.sources.has('ball.holo')).toBe(true);
  });

  it('calculateAffectedSet includes dependent trait users', () => {
    graph.registerTrait({ name: 'grabbable', requires: ['collidable'], conflicts: [] });
    graph.registerTrait({ name: 'collidable', requires: [], conflicts: [] });
    graph.registerObject({
      objectName: 'cube',
      sourceId: 'cube.holo',
      traits: [{ name: 'grabbable', config: {}, configHash: h('h1') }],
    });

    const affected = graph.calculateAffectedSet([
      { traitName: 'collidable', changeType: 'config_changed' },
    ]);
    // cube uses grabbable which depends on collidable
    expect(affected.objects.has('cube')).toBe(true);
  });

  // ─── Serialization ─────────────────────────────────────────────────

  it('serialize + deserialize roundtrip', () => {
    graph.registerTrait({ name: 'test_trait', requires: [], conflicts: [] });
    graph.registerObject({
      objectName: 'testObj',
      sourceId: 'test.holo',
      traits: [{ name: 'test_trait', config: { x: 1 }, configHash: h('hx1') }],
    });

    const json = graph.serialize();
    const restored = TraitDependencyGraph.deserialize(json);
    const stats = restored.getStats();
    expect(stats.objectCount).toBe(1);
    expect(stats.traitCount).toBeGreaterThanOrEqual(1);
  });

  // ─── Recompilation Set ─────────────────────────────────────────────

  it('calculateRecompilationSet includes template dependents', () => {
    graph.registerObject({
      objectName: 'baseTemplate',
      sourceId: 'base.holo',
      traits: [],
    });
    graph.registerObject({
      objectName: 'child1',
      sourceId: 'child.holo',
      traits: [],
      template: 'baseTemplate',
    });

    const recompile = graph.calculateRecompilationSet(['baseTemplate']);
    expect(recompile.has('baseTemplate')).toBe(true);
    expect(recompile.has('child1')).toBe(true);
  });

  // ─── Stats + Clear ─────────────────────────────────────────────────

  it('getStats returns counts', () => {
    graph.registerTrait({ name: 't1', requires: [], conflicts: [] });
    graph.registerObject({ objectName: 'o1', sourceId: 's1.holo', traits: [] });
    const stats = graph.getStats();
    expect(stats.traitCount).toBeGreaterThanOrEqual(1);
    expect(stats.objectCount).toBe(1);
    expect(stats.sourceCount).toBe(1);
  });

  it('clear resets everything', () => {
    graph.registerTrait({ name: 'x', requires: [], conflicts: [] });
    graph.registerObject({ objectName: 'y', sourceId: 'y.holo', traits: [] });
    graph.clear();
    expect(graph.getStats().objectCount).toBe(0);
    expect(graph.getStats().traitCount).toBe(0);
  });
});
