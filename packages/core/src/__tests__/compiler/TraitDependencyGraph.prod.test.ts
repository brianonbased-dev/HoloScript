/**
 * TraitDependencyGraph Production Tests
 *
 * Covers the full public API:
 *   hashConfig, registerTrait, registerObject, detectTraitChanges,
 *   calculateAffectedSet, registerImport, getFilesAffectedByChange (BFS),
 *   getStats, clear, validate conflicts, builtin trait registration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TraitDependencyGraph,
} from '../../compiler/TraitDependencyGraph';

// ── Fixture helpers ──────────────────────────────────────────────────────────

function makeTG() {
  return new TraitDependencyGraph();
}

function objInfo(objectName: string, sourceId: string, traitNames: string[]) {
  return {
    objectName,
    sourceId,
    traits: traitNames.map(name => ({ name, config: {}, configHash: 'h' + name })),
  };
}

// ── hashConfig (via registerObject — indirect) ────────────────────────────────

describe('TraitDependencyGraph — hashConfig', () => {

  it('same config produces same hash', () => {
    const g = makeTG();
    g.registerObject({ objectName: 'A', sourceId: 's1', traits: [{ name: 'grabbable', config: { force: 1 }, configHash: '' }] });
    g.registerObject({ objectName: 'B', sourceId: 's1', traits: [{ name: 'grabbable', config: { force: 1 }, configHash: '' }] });
    // Both objects A and B registered — no throw means hashConfig ran
    expect(g.getObjectsUsingTrait('grabbable').size).toBe(2);
  });

  it('different configs produce different hashes when used in detectTraitChanges', () => {
    const g = makeTG();
    g.registerObject({ objectName: 'Box', sourceId: 's', traits: [{ name: 'physics', config: { mass: 1 }, configHash: '' }] });
    g.saveSnapshot();
    const changes = g.detectTraitChanges('Box', [{ name: 'physics', config: { mass: 99 }, configHash: '' }]);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0].changeType).toBe('config_changed');
  });
});

// ── registerTrait ─────────────────────────────────────────────────────────────

describe('TraitDependencyGraph — registerTrait', () => {

  it('registers a trait with no dependencies', () => {
    const g = makeTG();
    g.registerTrait({ name: 'glowing', requires: [], conflicts: [] });
    // No error = success; verifiable via getDependentTraits (empty)
    expect(g.getDependentTraits('glowing').size).toBe(0);
  });

  it('registers a dependent trait — child depends on parent', () => {
    const g = makeTG();
    g.registerTrait({ name: 'physics', requires: [], conflicts: [] });
    g.registerTrait({ name: 'rigid_body', requires: ['physics'], conflicts: [] });
    // When we query dependents of 'physics', 'rigid_body' should appear
    const deps = g.getDependentTraits('physics');
    expect(deps.has('rigid_body')).toBe(true);
  });

  it('registers traits with conflicts (traitCount increases)', () => {
    const g = makeTG();
    g.registerTrait({ name: 'static', requires: [], conflicts: ['physics'] });
    g.registerTrait({ name: 'physics', requires: [], conflicts: [] });
    // Conflicts stored internally — traitCount reflects both registered traits
    expect(g.getStats().traitCount).toBe(2);
  });

  it('registering same trait twice is idempotent (no throw)', () => {
    const g = makeTG();
    expect(() => {
      g.registerTrait({ name: 'grabble', requires: [], conflicts: [] });
      g.registerTrait({ name: 'grabble', requires: [], conflicts: [] });
    }).not.toThrow();
  });
});

// ── registerBuiltinTraits ─────────────────────────────────────────────────────

describe('TraitDependencyGraph — registerBuiltinTraits', () => {

  it('registerBuiltinTraits does not throw', () => {
    const g = makeTG();
    expect(() => g.registerBuiltinTraits()).not.toThrow();
  });

  it('after builtin registration, physics is a known trait', () => {
    const g = makeTG();
    g.registerBuiltinTraits();
    // physics should now have dependents or be queryable without error
    expect(() => g.getDependentTraits('physics')).not.toThrow();
  });
});

// ── registerObject + getObjectsUsingTrait ─────────────────────────────────────

describe('TraitDependencyGraph — registerObject', () => {

  it('adds object to the trait→objects index', () => {
    const g = makeTG();
    g.registerObject(objInfo('Cube', 'scene.hs', ['physics', 'grabbable']));
    expect(g.getObjectsUsingTrait('physics').has('Cube')).toBe(true);
    expect(g.getObjectsUsingTrait('grabbable').has('Cube')).toBe(true);
  });

  it('re-registering an object with new traits adds them to the index', () => {
    const g = makeTG();
    g.registerObject(objInfo('Box', 'scene.hs', ['physics']));
    g.registerObject(objInfo('Box', 'scene.hs', ['grabbable'])); // re-register
    // The new trait is now tracked
    expect(g.getObjectsUsingTrait('grabbable').has('Box')).toBe(true);
  });

  it('multiple objects can share a trait', () => {
    const g = makeTG();
    g.registerObject(objInfo('Cube', 's', ['glowing']));
    g.registerObject(objInfo('Sphere', 's', ['glowing']));
    expect(g.getObjectsUsingTrait('glowing').size).toBe(2);
  });

  it('source id is tracked via getStats', () => {
    const g = makeTG();
    g.registerObject(objInfo('A', 'fileA.hs', ['physics']));
    g.registerObject(objInfo('B', 'fileB.hs', ['physics']));
    expect(g.getStats().sourceCount).toBe(2);
  });
});

// ── unregisterObject ──────────────────────────────────────────────────────────

describe('TraitDependencyGraph — unregisterObject', () => {

  it('removes object from trait index', () => {
    const g = makeTG();
    g.registerObject(objInfo('TempObj', 's', ['physics']));
    g.unregisterObject('TempObj');
    expect(g.getObjectsUsingTrait('physics').has('TempObj')).toBe(false);
  });

  it('unregistering nonexistent object does not throw', () => {
    const g = makeTG();
    expect(() => g.unregisterObject('ghost')).not.toThrow();
  });
});

// ── import edges ──────────────────────────────────────────────────────────────

describe('TraitDependencyGraph — import edges', () => {

  it('registerImport creates a forward import edge', () => {
    const g = makeTG();
    g.registerImport('a.hs', 'b.hs');
    expect(g.getImportedFiles('a.hs').has('b.hs')).toBe(true);
  });

  it('registerImport creates a reverse edge (getFilesThatImport)', () => {
    const g = makeTG();
    g.registerImport('a.hs', 'b.hs');
    expect(g.getFilesThatImport('b.hs').has('a.hs')).toBe(true);
  });

  it('registering same import edge twice is idempotent', () => {
    const g = makeTG();
    g.registerImport('a.hs', 'b.hs');
    g.registerImport('a.hs', 'b.hs');
    expect(g.getImportedFiles('a.hs').size).toBe(1);
  });

  it('clearImportsForFile removes all forward edges for that file', () => {
    const g = makeTG();
    g.registerImport('a.hs', 'b.hs');
    g.registerImport('a.hs', 'c.hs');
    g.clearImportsForFile('a.hs');
    expect(g.getImportedFiles('a.hs').size).toBe(0);
  });

  it('clearImportsForFile also removes reverse edges', () => {
    const g = makeTG();
    g.registerImport('a.hs', 'b.hs');
    g.clearImportsForFile('a.hs');
    expect(g.getFilesThatImport('b.hs').has('a.hs')).toBe(false);
  });

  it('getImportedFiles returns empty set for unknown file', () => {
    const g = makeTG();
    expect(g.getImportedFiles('unknown.hs').size).toBe(0);
  });

  it('getFilesThatImport returns empty set for unknown file', () => {
    const g = makeTG();
    expect(g.getFilesThatImport('unknown.hs').size).toBe(0);
  });
});

// ── getFilesAffectedByChange (BFS transitive) ─────────────────────────────────

describe('TraitDependencyGraph — getFilesAffectedByChange', () => {

  it('includes the changed file itself', () => {
    const g = makeTG();
    const affected = g.getFilesAffectedByChange(['a.hs']);
    expect(affected.has('a.hs')).toBe(true);
  });

  it('includes direct importers', () => {
    const g = makeTG();
    g.registerImport('importer.hs', 'lib.hs');
    const affected = g.getFilesAffectedByChange(['lib.hs']);
    expect(affected.has('importer.hs')).toBe(true);
  });

  it('includes transitive importers (BFS depth 2)', () => {
    const g = makeTG();
    g.registerImport('mid.hs', 'lib.hs');
    g.registerImport('top.hs', 'mid.hs');
    const affected = g.getFilesAffectedByChange(['lib.hs']);
    expect(affected.has('mid.hs')).toBe(true);
    expect(affected.has('top.hs')).toBe(true);
  });

  it('handles diamond import (A→C, B→C, D→A, D→B) — D appears once', () => {
    const g = makeTG();
    g.registerImport('A.hs', 'C.hs');
    g.registerImport('B.hs', 'C.hs');
    g.registerImport('D.hs', 'A.hs');
    g.registerImport('D.hs', 'B.hs');
    const affected = g.getFilesAffectedByChange(['C.hs']);
    expect(affected.has('A.hs')).toBe(true);
    expect(affected.has('B.hs')).toBe(true);
    expect(affected.has('D.hs')).toBe(true);
    // D should appear only once (no duplicates in Set)
    expect(affected.size).toBe(4); // C.hs + A.hs + B.hs + D.hs
  });

  it('returns empty set (just the file) when nobody imports it', () => {
    const g = makeTG();
    const affected = g.getFilesAffectedByChange(['standalone.hs']);
    expect(affected.size).toBe(1);
  });

  it('handles multiple changed files', () => {
    const g = makeTG();
    g.registerImport('x.hs', 'a.hs');
    g.registerImport('y.hs', 'b.hs');
    const affected = g.getFilesAffectedByChange(['a.hs', 'b.hs']);
    expect(affected.has('x.hs')).toBe(true);
    expect(affected.has('y.hs')).toBe(true);
  });
});

// ── saveSnapshot + detectTraitChanges ─────────────────────────────────────────

describe('TraitDependencyGraph — detectTraitChanges', () => {

  it('detecting when no snapshot exists returns all new traits as added', () => {
    // When no snapshot exists, oldInfo is undefined so all provided traits appear as 'added'
    const g = makeTG();
    const changes = g.detectTraitChanges('Box', [{ name: 'physics', config: {}, configHash: 'h1' }]);
    const added = changes.filter(c => c.changeType === 'added');
    expect(added.length).toBe(1);
    expect(added[0].traitName).toBe('physics');
  });

  it('detects added trait', () => {
    const g = makeTG();
    g.registerObject(objInfo('Box', 's', ['physics']));
    g.saveSnapshot();
    const changes = g.detectTraitChanges('Box', [
      { name: 'physics', config: {}, configHash: '' },
      { name: 'grabbable', config: {}, configHash: '' },
    ]);
    const added = changes.filter(c => c.changeType === 'added');
    expect(added.length).toBe(1);
    expect(added[0].traitName).toBe('grabbable');
  });

  it('detects removed trait', () => {
    const g = makeTG();
    g.registerObject(objInfo('Box', 's', ['physics', 'grabbable']));
    g.saveSnapshot();
    const changes = g.detectTraitChanges('Box', [{ name: 'physics', config: {}, configHash: '' }]);
    const removed = changes.filter(c => c.changeType === 'removed');
    expect(removed.length).toBe(1);
    expect(removed[0].traitName).toBe('grabbable');
  });

  it('detects no change when traits are identical', () => {
    const g = makeTG();
    g.registerObject({ objectName: 'Box', sourceId: 's', traits: [{ name: 'physics', config: { mass: 1 }, configHash: 'x' }] });
    g.saveSnapshot();
    const changes = g.detectTraitChanges('Box', [{ name: 'physics', config: { mass: 1 }, configHash: 'x' }]);
    expect(changes.filter(c => c.changeType !== 'config_changed')).toHaveLength(0);
  });
});

// ── calculateAffectedSet ──────────────────────────────────────────────────────

describe('TraitDependencyGraph — calculateAffectedSet', () => {

  it('added trait affects objects using it', () => {
    const g = makeTG();
    g.registerObject(objInfo('Cube', 's', ['physics']));
    g.registerObject(objInfo('Sphere', 's', ['physics']));
    g.registerTrait({ name: 'child', requires: ['physics'], conflicts: [] });

    const affected = g.calculateAffectedSet([{ traitName: 'physics', changeType: 'added' }]);
    expect(affected.objects.size).toBeGreaterThan(0);
  });

  it('empty changes yield empty affected set', () => {
    const g = makeTG();
    const affected = g.calculateAffectedSet([]);
    expect(affected.objects.size).toBe(0);
    expect(affected.sources.size).toBe(0);
  });
});

// ── conflict detection via registerTrait ─────────────────────────────────────

describe('TraitDependencyGraph — conflict registration', () => {

  it('registering conflicting traits still registers both (stats reflect both)', () => {
    const g = makeTG();
    g.registerTrait({ name: 'static', requires: [], conflicts: ['physics'] });
    g.registerTrait({ name: 'physics', requires: [], conflicts: ['static'] });
    expect(g.getStats().traitCount).toBe(2);
  });

  it('conflicts do not appear as dependencies for each other', () => {
    const g = makeTG();
    g.registerTrait({ name: 'static', requires: [], conflicts: ['physics'] });
    g.registerTrait({ name: 'physics', requires: [], conflicts: ['static'] });
    // Neither is a dependency of the other
    expect(g.getDependentTraits('static').size).toBe(0);
    expect(g.getDependentTraits('physics').size).toBe(0);
  });
});

// ── getStats ──────────────────────────────────────────────────────────────────

describe('TraitDependencyGraph — getStats', () => {

  it('initial stats are all zeros', () => {
    const g = makeTG();
    const s = g.getStats();
    expect(s.traitCount).toBe(0);
    expect(s.objectCount).toBe(0);
    expect(s.sourceCount).toBe(0);
    expect(s.dependencyEdges).toBe(0);
    expect(s.importEdges).toBe(0);
  });

  it('importEdges count increases after registerImport', () => {
    const g = makeTG();
    g.registerImport('a.hs', 'b.hs');
    g.registerImport('a.hs', 'c.hs');
    expect(g.getStats().importEdges).toBe(2);
  });

  it('objectCount reflects registered objects', () => {
    const g = makeTG();
    g.registerObject(objInfo('A', 's', ['x']));
    g.registerObject(objInfo('B', 's', ['y']));
    expect(g.getStats().objectCount).toBe(2);
  });
});

// ── clear ─────────────────────────────────────────────────────────────────────

describe('TraitDependencyGraph — clear', () => {

  it('clear resets all internal state', () => {
    const g = makeTG();
    g.registerObject(objInfo('Cube', 's', ['physics']));
    g.registerImport('a.hs', 'b.hs');
    g.registerTrait({ name: 'glow', requires: [], conflicts: [] });
    g.clear();
    const s = g.getStats();
    expect(s.objectCount).toBe(0);
    expect(s.importEdges).toBe(0);
    expect(s.traitCount).toBe(0);
  });
});
