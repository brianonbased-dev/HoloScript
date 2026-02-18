/** Sprint 4 Acceptance Tests v3.13.0 */
import { describe, test, expect, beforeEach } from 'vitest';
import { HoloScriptTypeChecker } from '../HoloScriptTypeChecker';
import { TypeAliasRegistry } from '../types/TypeAliasRegistry';
import { ParallelParser, parseFilesParallel } from '../parser/ParallelParser';
import { HashCalculator } from '../../../../cli/src/build/cache/HashCalculator';
import { DependencyTracker } from '../../../../cli/src/build/cache/DependencyTracker';
import { CacheManager } from '../../../../cli/src/build/cache/CacheManager';
import { SourceMapV2 } from '../../../../cli/src/build/SourceMapV2';
import { BundleAnalyzer } from '../../../../cli/src/analyze/BundleAnalyzer';
import { DuplicateFinder } from '../../../../cli/src/analyze/DuplicateFinder';
import { TreemapGenerator } from '../../../../cli/src/analyze/TreemapGenerator';

// Exhaustive match
describe('Sprint 4 Exhaustive Match', () => {
  let checker: HoloScriptTypeChecker;
  beforeEach(() => { checker = new HoloScriptTypeChecker(); });
  test('complete union match no errors', () => {
    checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type Phase = "init" | "running" | "done"')!);
    expect(checker.checkExhaustiveMatch({ typeName: 'Phase', coveredPatterns: ['init','running','done'] })).toHaveLength(0);
  });
  test('missing case HSP021', () => {
    checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type Phase = "init" | "running" | "done"')!);
    const errs = checker.checkExhaustiveMatch({ typeName: 'Phase', coveredPatterns: ['init','running'] });
    expect(errs).toHaveLength(1);
    expect(errs[0].code).toBe('HSP021');
    expect(errs[0].severity).toBe('error');
    expect(errs[0].message).toContain("done");
  });
  test('wildcard _ exhaustive', () => {
    checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type Phase = "init" | "running"')!);
    expect(checker.checkExhaustiveMatch({ typeName: 'Phase', coveredPatterns: ['init','_'] })).toHaveLength(0);
  });
  test('unknown type no errors', () => {
    expect(checker.checkExhaustiveMatch({ typeName: 'NoSuch', coveredPatterns: [] })).toHaveLength(0);
  });
  test('suggestions for missing cases', () => {
    checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type S = "a" | "b" | "c"')!);
    const errs = checker.checkExhaustiveMatch({ typeName: 'S', coveredPatterns: ['a'] });
    expect(errs[0].suggestions!.some((s) => s.includes('b'))).toBe(true);
    expect(errs[0].suggestions!.some((s) => s.includes('c'))).toBe(true);
  });
});

// Parallel parsing
describe('Sprint 4 Parallel Parsing', () => {
  test('ParallelParser constructs', () => { expect(new ParallelParser()).toBeDefined(); });
  test('parseFilesParallel empty', async () => {
    const r = await parseFilesParallel([]);
    expect(r).toBeDefined();
  });
  test('parseFilesParallel single file', async () => {
    const r = await parseFilesParallel([{ path: 't.hsplus', content: 'orb "X" {}' }]);
    expect(r.results.size).toBe(1);
  });
  test('parseFilesParallel multiple files', async () => {
    const files = Array.from({ length: 4 }, (_, i) => ({ path: `s.hsplus`, content: `orb "O" {}` }));
    const r = await parseFilesParallel(files);
    expect(r.results.size).toBe(4);
  });
  test('result has successCount and totalTime', async () => {
    const r = await parseFilesParallel([{ path: 'a.hsplus', content: 'orb "A" {}' }]);
    expect(typeof r.successCount).toBe('number');
    expect(r.totalTime).toBeGreaterThanOrEqual(0);
  });
});

// HashCalculator
describe('Sprint 4 HashCalculator', () => {
  const h = new HashCalculator();
  test('returns 64-char hex', () => {
    const r = h.hashContent('hello');
    expect(r).toHaveLength(64);
    expect(r).toMatch(/^[0-9a-f]+$/);
  });
  test('same content same hash', () => { expect(h.hashContent('abc')).toBe(h.hashContent('abc')); });
  test('diff content diff hash', () => { expect(h.hashContent('abc')).not.toBe(h.hashContent('xyz')); });
  test('hashObject deterministic', () => {
    expect(h.hashObject({ a: 1 })).toBe(h.hashObject({ a: 1 }));
  });
  test('hashFile null for missing', () => { expect(h.hashFile('/no/such')).toBeNull(); });
});

// DependencyTracker
describe('Sprint 4 DependencyTracker', () => {
  let t: DependencyTracker;
  beforeEach(() => { t = new DependencyTracker(); });
  test('addDependency records edge', () => {
    t.addDependency('a.ts', 'b.ts');
    expect(t.getDependencies('a.ts')).toContain('b.ts');
    expect(t.getDependents('b.ts')).toContain('a.ts');
  });
  test('removeDependencies clears', () => {
    t.addDependency('a.ts', 'b.ts');
    t.removeDependencies('a.ts');
    expect(t.getDependencies('a.ts')).toHaveLength(0);
  });
  test('transitive deps', () => {
    t.addDependency('a.ts', 'b.ts');
    t.addDependency('b.ts', 'c.ts');
    expect(t.getTransitiveDependencies('a.ts')).toContain('c.ts');
  });
  test('affected files reverse', () => {
    t.addDependency('a.ts', 'b.ts');
    expect(t.getAffectedFiles('b.ts')).toContain('a.ts');
  });
  test('toJSON/fromJSON round-trip', () => {
    t.addDependency('x.ts', 'y.ts');
    const t2 = new DependencyTracker();
    t2.fromJSON(t.toJSON());
    expect(t2.getDependencies('x.ts')).toContain('y.ts');
  });
  test('no infinite loop on cycles', () => {
    t.addDependency('a.ts', 'b.ts');
    t.addDependency('b.ts', 'a.ts');
    expect(() => t.getTransitiveDependencies('a.ts')).not.toThrow();
  });
});

// CacheManager
describe('Sprint 4 CacheManager', () => {
  test('isStale true for unknown', async () => {
    const cm = new CacheManager('.s4cache', '3.13.0');
    await cm.load();
    expect(cm.isStale('/unknown.ts', 'hash')).toBe(true);
  });
  test('isStale false after update same hash', async () => {
    const cm = new CacheManager('.s4cache', '3.13.0');
    await cm.load();
    const hash = 'a'.repeat(64);
    cm.update('f.ts', hash, [], []);
    expect(cm.isStale('f.ts', hash)).toBe(false);
  });
  test('isStale true after hash change', async () => {
    const cm = new CacheManager('.s4cache', '3.13.0');
    await cm.load();
    cm.update('f.ts', 'old', [], []);
    expect(cm.isStale('f.ts', 'new')).toBe(true);
  });
  test('invalidate removes entry', async () => {
    const cm = new CacheManager('.s4cache', '3.13.0');
    await cm.load();
    cm.update('g.ts', 'h1', [], []);
    cm.invalidate('g.ts');
    expect(cm.isStale('g.ts', 'h1')).toBe(true);
  });
  test('depTracker accessible', () => { expect(new CacheManager().depTracker).toBeDefined(); });
});