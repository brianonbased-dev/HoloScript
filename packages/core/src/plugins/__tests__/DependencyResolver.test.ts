/**
 * DependencyResolver tests — v5.7 "Open Ecosystem"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyResolver, type PluginEntry } from '../DependencyResolver';

describe('DependencyResolver', () => {
  let resolver: DependencyResolver;

  beforeEach(() => {
    resolver = new DependencyResolver();
  });

  // ===========================================================================
  // BASIC RESOLUTION
  // ===========================================================================

  describe('basic resolution', () => {
    it('resolves empty set', () => {
      const result = resolver.resolve();
      expect(result.success).toBe(true);
      expect(result.installOrder).toHaveLength(0);
    });

    it('resolves single plugin with no deps', () => {
      resolver.addPlugin({ id: 'a', version: '1.0.0', dependencies: {} });
      const result = resolver.resolve();
      expect(result.success).toBe(true);
      expect(result.installOrder).toEqual(['a']);
    });

    it('resolves linear dependency chain', () => {
      resolver.addPlugins([
        { id: 'c', version: '1.0.0', dependencies: { b: '^1.0.0' } },
        { id: 'b', version: '1.0.0', dependencies: { a: '^1.0.0' } },
        { id: 'a', version: '1.0.0', dependencies: {} },
      ]);
      const result = resolver.resolve();
      expect(result.success).toBe(true);

      const aIdx = result.installOrder.indexOf('a');
      const bIdx = result.installOrder.indexOf('b');
      const cIdx = result.installOrder.indexOf('c');
      expect(aIdx).toBeLessThan(bIdx);
      expect(bIdx).toBeLessThan(cIdx);
    });

    it('handles diamond dependency', () => {
      resolver.addPlugins([
        { id: 'a', version: '1.0.0', dependencies: {} },
        { id: 'b', version: '1.0.0', dependencies: { a: '^1.0.0' } },
        { id: 'c', version: '1.0.0', dependencies: { a: '^1.0.0' } },
        { id: 'd', version: '1.0.0', dependencies: { b: '^1.0.0', c: '^1.0.0' } },
      ]);
      const result = resolver.resolve();
      expect(result.success).toBe(true);

      const aIdx = result.installOrder.indexOf('a');
      const dIdx = result.installOrder.indexOf('d');
      expect(aIdx).toBeLessThan(dIdx);
    });
  });

  // ===========================================================================
  // PARALLEL GROUPS
  // ===========================================================================

  describe('parallel groups', () => {
    it('groups independent plugins together', () => {
      resolver.addPlugins([
        { id: 'a', version: '1.0.0', dependencies: {} },
        { id: 'b', version: '1.0.0', dependencies: {} },
        { id: 'c', version: '1.0.0', dependencies: {} },
      ]);
      const result = resolver.resolve();
      expect(result.parallelGroups).toHaveLength(1);
      expect(result.parallelGroups[0].sort()).toEqual(['a', 'b', 'c']);
    });

    it('creates multiple layers for dependencies', () => {
      resolver.addPlugins([
        { id: 'a', version: '1.0.0', dependencies: {} },
        { id: 'b', version: '1.0.0', dependencies: { a: '^1.0.0' } },
        { id: 'c', version: '1.0.0', dependencies: { a: '^1.0.0' } },
        { id: 'd', version: '1.0.0', dependencies: { b: '^1.0.0', c: '^1.0.0' } },
      ]);
      const result = resolver.resolve();

      // Layer 1: a
      // Layer 2: b, c (both depend only on a)
      // Layer 3: d (depends on b and c)
      expect(result.parallelGroups.length).toBeGreaterThanOrEqual(3);
      expect(result.parallelGroups[0]).toContain('a');
    });
  });

  // ===========================================================================
  // CYCLE DETECTION
  // ===========================================================================

  describe('cycle detection', () => {
    it('detects simple cycle', () => {
      resolver.addPlugins([
        { id: 'a', version: '1.0.0', dependencies: { b: '^1.0.0' } },
        { id: 'b', version: '1.0.0', dependencies: { a: '^1.0.0' } },
      ]);
      const result = resolver.resolve();
      expect(result.success).toBe(false);
      expect(result.cycles.length).toBeGreaterThan(0);
    });

    it('detects 3-node cycle', () => {
      resolver.addPlugins([
        { id: 'a', version: '1.0.0', dependencies: { b: '^1.0.0' } },
        { id: 'b', version: '1.0.0', dependencies: { c: '^1.0.0' } },
        { id: 'c', version: '1.0.0', dependencies: { a: '^1.0.0' } },
      ]);
      const result = resolver.resolve();
      expect(result.success).toBe(false);
      expect(result.cycles.length).toBeGreaterThan(0);
    });

    it('wouldCreateCycle detects prospective cycle', () => {
      resolver.addPlugin({ id: 'a', version: '1.0.0', dependencies: { b: '^1.0.0' } });
      resolver.addPlugin({ id: 'b', version: '1.0.0', dependencies: {} });

      expect(resolver.wouldCreateCycle({
        id: 'b',
        version: '1.0.0',
        dependencies: { a: '^1.0.0' },
      })).toBe(true);
    });
  });

  // ===========================================================================
  // MISSING DEPENDENCIES
  // ===========================================================================

  describe('missing dependencies', () => {
    it('reports missing dependencies', () => {
      resolver.addPlugin({
        id: 'a', version: '1.0.0',
        dependencies: { 'not-installed': '^1.0.0' },
      });
      const result = resolver.resolve();
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].pluginId).toBe('not-installed');
      expect(result.missing[0].requiredBy).toBe('a');
    });

    it('fails resolution when required deps are missing', () => {
      resolver.addPlugin({
        id: 'a', version: '1.0.0',
        dependencies: { 'missing': '^1.0.0' },
      });
      const result = resolver.resolve();
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // VERSION CONFLICTS
  // ===========================================================================

  describe('version conflicts', () => {
    it('detects version conflict', () => {
      resolver.addPlugins([
        { id: 'core', version: '1.0.0', dependencies: {} },
        { id: 'a', version: '1.0.0', dependencies: { core: '^1.0.0' } },
        { id: 'b', version: '1.0.0', dependencies: { core: '^2.0.0' } },
      ]);
      const result = resolver.resolve();
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].dependency).toBe('core');
      expect(result.conflicts[0].requirements).toHaveLength(2);
    });

    it('no conflict when constraints are compatible', () => {
      resolver.addPlugins([
        { id: 'core', version: '1.5.0', dependencies: {} },
        { id: 'a', version: '1.0.0', dependencies: { core: '^1.0.0' } },
        { id: 'b', version: '1.0.0', dependencies: { core: '^1.2.0' } },
      ]);
      const result = resolver.resolve();
      expect(result.conflicts).toHaveLength(0);
    });
  });

  // ===========================================================================
  // TRANSITIVE DEPENDENCIES
  // ===========================================================================

  describe('transitive dependencies', () => {
    it('computes transitive dependency set', () => {
      resolver.addPlugins([
        { id: 'a', version: '1.0.0', dependencies: {} },
        { id: 'b', version: '1.0.0', dependencies: { a: '^1.0.0' } },
        { id: 'c', version: '1.0.0', dependencies: { b: '^1.0.0' } },
      ]);
      const result = resolver.resolve();
      const cDeps = result.transitiveDeps.get('c');
      expect(cDeps).toBeDefined();
      expect(cDeps!.has('b')).toBe(true);
      expect(cDeps!.has('a')).toBe(true);
    });
  });

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  describe('queries', () => {
    it('getDependents returns plugins that depend on a given plugin', () => {
      resolver.addPlugins([
        { id: 'a', version: '1.0.0', dependencies: {} },
        { id: 'b', version: '1.0.0', dependencies: { a: '^1.0.0' } },
        { id: 'c', version: '1.0.0', dependencies: { a: '^1.0.0' } },
      ]);
      const dependents = resolver.getDependents('a');
      expect(dependents.sort()).toEqual(['b', 'c']);
    });

    it('manages plugin set correctly', () => {
      resolver.addPlugin({ id: 'x', version: '1.0.0', dependencies: {} });
      expect(resolver.getPluginIds()).toEqual(['x']);

      resolver.removePlugin('x');
      expect(resolver.getPluginIds()).toEqual([]);
    });
  });
});
