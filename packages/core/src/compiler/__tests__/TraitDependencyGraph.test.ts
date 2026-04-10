import { describe, it, expect, beforeEach } from 'vitest';
import { TraitDependencyGraph } from '../TraitDependencyGraph';
import type { TraitUsage, ObjectTraitInfo } from '../TraitDependencyGraph';

/**
 * Local re-implementation of the module-private hashConfig for tests.
 * Uses stable JSON + DJB2, matching the source implementation.
 */
function hashConfig(config: Record<string, unknown>): string {
  const keys = Object.keys(config).sort();
  const parts: string[] = [];
  for (const key of keys) {
    parts.push(`${key}:${JSON.stringify(config[key])}`);
  }
  const str = parts.join('|');
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

describe('hashConfig (local replica)', () => {
  it('produces consistent hash for same input', () => {
    const cfg = { a: 1, b: 'hello' };
    expect(hashConfig(cfg)).toBe(hashConfig(cfg));
  });

  it('same keys in different order produce same hash', () => {
    expect(hashConfig({ a: 1, b: 2 })).toBe(hashConfig({ b: 2, a: 1 }));
  });

  it('different configs produce different hashes', () => {
    expect(hashConfig({ a: 1 })).not.toBe(hashConfig({ a: 2 }));
  });
});

describe('TraitDependencyGraph', () => {
  let graph: TraitDependencyGraph;

  beforeEach(() => {
    graph = new TraitDependencyGraph();
  });

  // Registration
  it('registers trait definition', () => {
    graph.registerTrait({ name: 'Renderable', requires: [], conflicts: [] });
    const stats = graph.getStats();
    expect(stats.traitCount).toBeGreaterThanOrEqual(1);
  });

  it('registers trait with dependencies', () => {
    graph.registerTrait({ name: 'Physics', requires: ['Transform'], conflicts: [] });
    graph.registerTrait({ name: 'Transform', requires: [], conflicts: [] });
    const deps = graph.getDependentTraits('Transform');
    expect(deps.has('Physics')).toBe(true);
  });

  it('registers builtin traits', () => {
    graph.registerBuiltinTraits();
    const stats = graph.getStats();
    expect(stats.traitCount).toBeGreaterThan(0);
  });

  // Object registration
  it('registers and queries objects', () => {
    const obj: ObjectTraitInfo = {
      objectName: 'Orb1',
      sourceId: 'scene.hsplus',
      traits: [
        { name: 'Renderable', config: { color: 'red' }, configHash: hashConfig({ color: 'red' }) },
      ],
    };
    graph.registerObject(obj);
    const using = graph.getObjectsUsingTrait('Renderable');
    expect(using.has('Orb1')).toBe(true);
  });

  it('unregisters objects', () => {
    graph.registerObject({
      objectName: 'Orb2',
      sourceId: 'scene.hsplus',
      traits: [{ name: 'Physics', config: {}, configHash: hashConfig({}) }],
    });
    graph.unregisterObject('Orb2');
    expect(graph.getObjectsUsingTrait('Physics').has('Orb2')).toBe(false);
  });

  // Change detection
  it('detects added traits', () => {
    graph.registerObject({
      objectName: 'Box',
      sourceId: 's.hsplus',
      traits: [{ name: 'Renderable', config: {}, configHash: hashConfig({}) }],
    });
    graph.saveSnapshot();

    const newTraits: TraitUsage[] = [
      { name: 'Renderable', config: {}, configHash: hashConfig({}) },
      { name: 'Physics', config: {}, configHash: hashConfig({}) },
    ];
    const changes = graph.detectTraitChanges('Box', newTraits);
    expect(
      changes.find((c) => c.traitName === 'Physics' && c.changeType === 'added')
    ).toBeDefined();
  });

  it('detects removed traits', () => {
    graph.registerObject({
      objectName: 'Box',
      sourceId: 's.hsplus',
      traits: [
        { name: 'Renderable', config: {}, configHash: hashConfig({}) },
        { name: 'Physics', config: {}, configHash: hashConfig({}) },
      ],
    });
    graph.saveSnapshot();

    const newTraits: TraitUsage[] = [
      { name: 'Renderable', config: {}, configHash: hashConfig({}) },
    ];
    const changes = graph.detectTraitChanges('Box', newTraits);
    expect(
      changes.find((c) => c.traitName === 'Physics' && c.changeType === 'removed')
    ).toBeDefined();
  });

  it('detects config changes', () => {
    graph.registerObject({
      objectName: 'Box',
      sourceId: 's.hsplus',
      traits: [
        { name: 'Renderable', config: { color: 'red' }, configHash: hashConfig({ color: 'red' }) },
      ],
    });
    graph.saveSnapshot();

    const newTraits: TraitUsage[] = [
      { name: 'Renderable', config: { color: 'blue' }, configHash: hashConfig({ color: 'blue' }) },
    ];
    const changes = graph.detectTraitChanges('Box', newTraits);
    expect(changes.find((c) => c.changeType === 'config_changed')).toBeDefined();
  });

  // Affected set
  it('calculates affected set for direct users', () => {
    graph.registerTrait({ name: 'Transform', requires: [], conflicts: [] });
    graph.registerObject({
      objectName: 'Ball',
      sourceId: 'game.hsplus',
      traits: [{ name: 'Transform', config: {}, configHash: hashConfig({}) }],
    });
    const affected = graph.calculateAffectedSet([
      { traitName: 'Transform', changeType: 'config_changed' },
    ]);
    expect(affected.objects.has('Ball')).toBe(true);
    expect(affected.sources.has('game.hsplus')).toBe(true);
  });

  it('calculates affected set with trait dependencies', () => {
    graph.registerTrait({ name: 'Transform', requires: [], conflicts: [] });
    graph.registerTrait({ name: 'Physics', requires: ['Transform'], conflicts: [] });
    graph.registerObject({
      objectName: 'Ball',
      sourceId: 'game.hsplus',
      traits: [{ name: 'Physics', config: {}, configHash: hashConfig({}) }],
    });
    const affected = graph.calculateAffectedSet([
      { traitName: 'Transform', changeType: 'config_changed' },
    ]);
    // Ball uses Physics which depends on Transform
    expect(affected.objects.has('Ball')).toBe(true);
  });

  // Recompilation set
  it('calculates recompilation set', () => {
    graph.registerObject({
      objectName: 'A',
      sourceId: 'a.hsplus',
      traits: [{ name: 'T1', config: {}, configHash: hashConfig({}) }],
    });
    graph.registerObject({
      objectName: 'B',
      sourceId: 'b.hsplus',
      traits: [{ name: 'T2', config: {}, configHash: hashConfig({}) }],
    });
    const set = graph.calculateRecompilationSet(['A']);
    expect(set.has('A')).toBe(true);
    expect(set.has('B')).toBe(false);
  });

  // Serialization
  it('serialize/deserialize roundtrip', () => {
    graph.registerTrait({ name: 'MyTrait', requires: ['Base'], conflicts: ['Conflict'] });
    graph.registerObject({
      objectName: 'Obj1',
      sourceId: 'file.hsplus',
      traits: [{ name: 'MyTrait', config: { x: 1 }, configHash: hashConfig({ x: 1 }) }],
    });

    const json = graph.serialize();
    const restored = TraitDependencyGraph.deserialize(json);
    expect(restored.getStats().traitCount).toBeGreaterThanOrEqual(1);
    expect(restored.getObjectsUsingTrait('MyTrait').has('Obj1')).toBe(true);
  });

  // Stats
  it('getStats returns correct counts', () => {
    graph.registerTrait({ name: 'A', requires: [], conflicts: [] });
    graph.registerTrait({ name: 'B', requires: ['A'], conflicts: [] });
    graph.registerObject({
      objectName: 'Obj',
      sourceId: 'src.hsplus',
      traits: [{ name: 'A', config: {}, configHash: hashConfig({}) }],
    });
    const stats = graph.getStats();
    expect(stats.traitCount).toBeGreaterThanOrEqual(2);
    expect(stats.objectCount).toBe(1);
    expect(stats.sourceCount).toBe(1);
  });

  // Clear
  it('clear removes all data', () => {
    graph.registerTrait({ name: 'X', requires: [], conflicts: [] });
    graph.registerObject({
      objectName: 'Obj',
      sourceId: 'f.hsplus',
      traits: [{ name: 'X', config: {}, configHash: hashConfig({}) }],
    });
    graph.clear();
    const stats = graph.getStats();
    expect(stats.traitCount).toBe(0);
    expect(stats.objectCount).toBe(0);
  });
});
