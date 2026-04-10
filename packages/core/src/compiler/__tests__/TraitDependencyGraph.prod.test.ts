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
    expect(changes.some((c) => c.traitName === 'glowing' && c.changeType === 'added')).toBe(true);
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
    expect(changes.some((c) => c.traitName === 'glowing' && c.changeType === 'removed')).toBe(true);
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
    expect(
      changes.some((c) => c.traitName === 'physics' && c.changeType === 'config_changed')
    ).toBe(true);
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

  // ─── Import Edge Tracking ──────────────────────────────────────────

  describe('Import Edge Tracking (@import cross-file deps)', () => {
    it('registerImport records a forward edge', () => {
      graph.registerImport('/project/a.hs', '/project/b.hs');
      const imported = graph.getImportedFiles('/project/a.hs');
      expect(imported.has('/project/b.hs')).toBe(true);
    });

    it('registerImport records a reverse edge', () => {
      graph.registerImport('/project/a.hs', '/project/b.hs');
      const importers = graph.getFilesThatImport('/project/b.hs');
      expect(importers.has('/project/a.hs')).toBe(true);
    });

    it('registerImport is idempotent', () => {
      graph.registerImport('/a.hs', '/b.hs');
      graph.registerImport('/a.hs', '/b.hs');
      expect(graph.getImportedFiles('/a.hs').size).toBe(1);
    });

    it('getImportedFiles returns empty set for unknown file', () => {
      expect(graph.getImportedFiles('/nope.hs').size).toBe(0);
    });

    it('getFilesThatImport returns empty set for unimported file', () => {
      expect(graph.getFilesThatImport('/nope.hs').size).toBe(0);
    });

    it('getFilesAffectedByChange includes the changed file', () => {
      const affected = graph.getFilesAffectedByChange(['/a.hs']);
      expect(affected.has('/a.hs')).toBe(true);
    });

    it('getFilesAffectedByChange propagates to direct importers', () => {
      graph.registerImport('/scene.hs', '/shared.hs');
      const affected = graph.getFilesAffectedByChange(['/shared.hs']);
      expect(affected.has('/scene.hs')).toBe(true);
      expect(affected.has('/shared.hs')).toBe(true);
    });

    it('getFilesAffectedByChange propagates transitively', () => {
      // a imports b imports c
      graph.registerImport('/a.hs', '/b.hs');
      graph.registerImport('/b.hs', '/c.hs');
      // change c → must recompile b and a
      const affected = graph.getFilesAffectedByChange(['/c.hs']);
      expect(affected.has('/c.hs')).toBe(true);
      expect(affected.has('/b.hs')).toBe(true);
      expect(affected.has('/a.hs')).toBe(true);
    });

    it('getFilesAffectedByChange handles diamond deps without duplicating', () => {
      // a and b both import c; d imports both a and b
      graph.registerImport('/a.hs', '/c.hs');
      graph.registerImport('/b.hs', '/c.hs');
      graph.registerImport('/d.hs', '/a.hs');
      graph.registerImport('/d.hs', '/b.hs');
      const affected = graph.getFilesAffectedByChange(['/c.hs']);
      // d should appear once (not twice)
      expect([...affected].filter((f) => f === '/d.hs').length).toBe(1);
      expect(affected.size).toBe(4); // c, a, b, d
    });

    it('clearImportsForFile removes forward and reverse edges', () => {
      graph.registerImport('/scene.hs', '/shared.hs');
      graph.clearImportsForFile('/scene.hs');
      expect(graph.getImportedFiles('/scene.hs').size).toBe(0);
      expect(graph.getFilesThatImport('/shared.hs').size).toBe(0);
    });

    it('clear() also resets import edges', () => {
      graph.registerImport('/a.hs', '/b.hs');
      graph.clear();
      expect(graph.getImportedFiles('/a.hs').size).toBe(0);
      expect(graph.getStats().importEdges).toBe(0);
    });

    it('getStats.importEdges counts edges', () => {
      graph.registerImport('/a.hs', '/b.hs');
      graph.registerImport('/a.hs', '/c.hs');
      expect(graph.getStats().importEdges).toBe(2);
    });

    it('serialize + deserialize preserves import edges (v2)', () => {
      graph.registerImport('/scene.hs', '/shared.hs');
      graph.registerImport('/scene.hs', '/utils.hs');
      const json = graph.serialize();
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(2);
      const restored = TraitDependencyGraph.deserialize(json);
      expect(restored.getImportedFiles('/scene.hs').has('/shared.hs')).toBe(true);
      expect(restored.getImportedFiles('/scene.hs').has('/utils.hs')).toBe(true);
      expect(restored.getFilesThatImport('/shared.hs').has('/scene.hs')).toBe(true);
    });

    it('deserializes old v1 JSON without crashing', () => {
      // v1 JSON has no importEdges array
      const v1 = JSON.stringify({
        version: 1,
        traitDependencies: [],
        traitConflicts: [],
        objectTraits: [],
        timestamp: 0,
      });
      const restored = TraitDependencyGraph.deserialize(v1);
      expect(restored.getImportedFiles('/x.hs').size).toBe(0);
    });
  });
});
