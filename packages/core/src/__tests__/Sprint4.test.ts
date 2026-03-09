/**
 * Sprint 4 Acceptance Tests — v3.13.0
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { HoloScriptTypeChecker } from '../HoloScriptTypeChecker';
import { TypeAliasRegistry } from '../types/TypeAliasRegistry';
import { ParallelParser, createParallelParser } from '../parser/ParallelParser';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';

/** Pre-initialized sequential parser (bypasses worker thread init in test env) */
function makeSeqParser(): ParallelParser {
  const p = createParallelParser({ fallbackToSequential: true, workerCount: 0, debug: false });
  (p as any).fallbackParser = new HoloScriptPlusParser({});
  (p as any).isInitialized = true;
  return p;
}
import { HashCalculator } from '../../../cli/src/build/cache/HashCalculator';
import { DependencyTracker } from '../../../cli/src/build/cache/DependencyTracker';
import { CacheManager } from '../../../cli/src/build/cache/CacheManager';
import { SourceMapV2 } from '../../../cli/src/build/SourceMapV2';
import { BundleAnalyzer } from '../../../cli/src/analyze/BundleAnalyzer';
import { DuplicateFinder } from '../../../cli/src/analyze/DuplicateFinder';
import { TreemapGenerator } from '../../../cli/src/analyze/TreemapGenerator';

// ─── 1. Exhaustive match ─────────────────────────────────────────────────────

describe('Sprint 4 Exhaustive Match', () => {
  let checker: HoloScriptTypeChecker;
  beforeEach(() => {
    checker = new HoloScriptTypeChecker();
  });

  test('complete union - no errors', () => {
    checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type P = "a" | "b" | "c"')!);
    expect(
      checker.checkExhaustiveMatch({ typeName: 'P', coveredPatterns: ['a', 'b', 'c'] })
    ).toHaveLength(0);
  });
  test('missing case - HSP021', () => {
    checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type P = "a" | "b" | "c"')!);
    const errs = checker.checkExhaustiveMatch({ typeName: 'P', coveredPatterns: ['a', 'b'] });
    expect(errs).toHaveLength(1);
    expect(errs[0].code).toBe('HSP021');
    expect(errs[0].severity).toBe('error');
  });
  test('wildcard _ exhaustive', () => {
    checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type P = "a" | "b"')!);
    expect(
      checker.checkExhaustiveMatch({ typeName: 'P', coveredPatterns: ['a', '_'] })
    ).toHaveLength(0);
  });
  test('unknown type no errors', () => {
    expect(checker.checkExhaustiveMatch({ typeName: 'NoSuch', coveredPatterns: [] })).toHaveLength(
      0
    );
  });
  test('suggestions list missing cases', () => {
    checker.typeAliasRegistry.register(TypeAliasRegistry.parse('type S = "x" | "y" | "z"')!);
    const errs = checker.checkExhaustiveMatch({ typeName: 'S', coveredPatterns: ['x'] });
    expect(errs[0].suggestions).toBeDefined();
    expect(errs[0].suggestions!.some((s) => s.includes('y'))).toBe(true);
  });
});

// ─── 2. Parallel parsing ─────────────────────────────────────────────────────
describe('Sprint 4 Parallel Parsing', () => {
  let parser: ParallelParser;
  beforeEach(() => {
    parser = makeSeqParser();
  });
  afterEach(async () => {
    await parser.shutdown();
  });

  test('ParallelParser constructs', () => {
    expect(new ParallelParser()).toBeDefined();
  });

  test('parses empty array', async () => {
    const r = await parser.parseFiles([]);
    expect(r).toBeDefined();
    expect(r.successCount + r.failCount).toBe(0);
  });

  test('parses single file', async () => {
    const r = await parser.parseFiles([{ path: 't.hsplus', content: 'orb "X" {}' }]);
    expect(r.results.size).toBe(1);
    const entry = r.results.get('t.hsplus');
    expect(entry).toBeDefined();
  });

  test('parses multiple files', async () => {
    const files = Array.from({ length: 4 }, (_, i) => ({
      path: `s${i}.hsplus`,
      content: `orb "O${i}" {}`,
    }));
    const r = await parser.parseFiles(files);
    expect(r.results.size).toBe(4);
  });

  test('result has successCount and totalTime', async () => {
    const r = await parser.parseFiles([{ path: 'a.hsplus', content: 'orb "A" {}' }]);
    expect(typeof r.successCount).toBe('number');
    expect(r.totalTime).toBeGreaterThanOrEqual(0);
  });
});

// ─── 3. Build caching ─────────────────────────────────────────────────────────
describe('Sprint 4 HashCalculator', () => {
  const h = new HashCalculator();
  test('64-char hex', () => {
    expect(h.hashContent('hello')).toMatch(/^[0-9a-f]{64}$/);
  });
  test('same input same hash', () => {
    expect(h.hashContent('abc')).toBe(h.hashContent('abc'));
  });
  test('different input different hash', () => {
    expect(h.hashContent('abc')).not.toBe(h.hashContent('xyz'));
  });
  test('hashObject deterministic', () => {
    expect(h.hashObject({ a: 1 })).toBe(h.hashObject({ a: 1 }));
  });
  test('hashFile null for missing', () => {
    expect(h.hashFile('/no/such/file.ts')).toBeNull();
  });
});

describe('Sprint 4 DependencyTracker', () => {
  let t: DependencyTracker;
  beforeEach(() => {
    t = new DependencyTracker();
  });
  test('records edge', () => {
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
  test('round-trip JSON', () => {
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

describe('Sprint 4 CacheManager', () => {
  test('isStale true for unknown', async () => {
    const cm = new CacheManager('.s4cache', '3.13.0');
    await cm.load();
    expect(cm.isStale('/unknown.ts', 'hash')).toBe(true);
  });
  test('isStale false after same hash', async () => {
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
  test('depTracker accessible', () => {
    expect(new CacheManager().depTracker).toBeDefined();
  });
});

// ─── 4. Source maps v2 ───────────────────────────────────────────────────────
describe('Sprint 4 SourceMapV2', () => {
  test('construct', () => {
    expect(new SourceMapV2()).toBeDefined();
  });
  test('addSource returns 0', () => {
    expect(new SourceMapV2().addSource('a.ts')).toBe(0);
  });
  test('addSource stable for dup', () => {
    const sm = new SourceMapV2();
    expect(sm.addSource('a.ts')).toBe(sm.addSource('a.ts'));
  });
  test('addMapping no throw', () => {
    const sm = new SourceMapV2();
    const s = sm.addSource('t.ts');
    expect(() =>
      sm.addMapping({ line: 1, column: 0 }, { line: 1, column: 0 }, s, -1)
    ).not.toThrow();
  });
  test('toJSON version 3', () => {
    expect(new SourceMapV2().toJSON()).toMatchObject({ version: 3 });
  });
  test('toString valid JSON', () => {
    expect(() => JSON.parse(new SourceMapV2().toString())).not.toThrow();
  });
  test('toInlineComment has base64', () => {
    expect(new SourceMapV2().toInlineComment()).toContain('base64,');
  });
  test('toExternalComment URL', () => {
    expect(new SourceMapV2().toExternalComment('out.map')).toBe('//# sourceMappingURL=out.map');
  });
  test('sourcesContent inline', () => {
    const sm = new SourceMapV2({ includeSourceContent: true });
    sm.addSource('a.ts', 'orb X {}');
    const map = sm.toJSON() as Record<string, unknown>;
    expect((map.sourcesContent as string[])[0]).toBe('orb X {}');
  });
});

// ─── 5. Bundle analyzer ──────────────────────────────────────────────────────
describe('Sprint 4 DuplicateFinder', () => {
  const f = new DuplicateFinder();
  test('no dups when content differs', () => {
    expect(
      f.findExactDuplicates(
        new Map([
          ['a.ts', 'alpha content here'],
          ['b.ts', 'beta content here!!'],
        ])
      )
    ).toHaveLength(0);
  });
  test('detects dup content', () => {
    const c = 'z'.repeat(100);
    const groups = f.findExactDuplicates(
      new Map([
        ['a.ts', c],
        ['b.ts', c],
      ])
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].paths).toContain('a.ts');
  });
  test('wastedBytes on group', () => {
    const c = 'z'.repeat(200);
    const groups = f.findExactDuplicates(
      new Map([
        ['a.ts', c],
        ['b.ts', c],
        ['c.ts', c],
      ])
    );
    expect(groups[0].wastedBytes).toBe(groups[0].sizePerCopy * 2);
  });
  test('below minSize ignored', () => {
    const c = 'tiny';
    expect(
      f.findExactDuplicates(
        new Map([
          ['a.ts', c],
          ['b.ts', c],
        ]),
        100
      )
    ).toHaveLength(0);
  });
});

describe('Sprint 4 TreemapGenerator', () => {
  const g = new TreemapGenerator();
  test('generates valid HTML', () => {
    expect(g.generate([{ name: 'a.ts', size: 1000 }])).toContain('<!DOCTYPE html>');
  });
  test('custom title', () => {
    expect(g.generate([{ name: 'a.ts', size: 1 }], 'MyTitle')).toContain('MyTitle');
  });
  test('toJSON parseable', () => {
    expect(JSON.parse(g.toJSON([{ name: 'a.ts', size: 1 }]))[0].name).toBe('a.ts');
  });
  test('empty no throw', () => {
    expect(() => g.generate([])).not.toThrow();
  });
});

describe('Sprint 4 BundleAnalyzer', () => {
  const a = new BundleAnalyzer();
  const mk = (e: Array<[string, number]>) => new Map(e.map(([p, s]) => [p, 'x'.repeat(s)]));

  test('totalSize correct', () => {
    expect(
      a.analyze(
        mk([
          ['a.ts', 300],
          ['b.ts', 200],
        ])
      ).totalSize
    ).toBe(500);
  });
  test('fileCount correct', () => {
    expect(
      a.analyze(
        mk([
          ['a.ts', 1],
          ['b.ts', 2],
          ['c.ts', 3],
        ])
      ).fileCount
    ).toBe(3);
  });
  test('entries sorted desc', () => {
    const r = a.analyze(
      mk([
        ['s.ts', 100],
        ['l.ts', 900],
        ['m.ts', 500],
      ])
    );
    expect(r.entries[0].path).toBe('l.ts');
  });
  test('detects duplicates', () => {
    const c = 'z'.repeat(200);
    const r = a.analyze(
      new Map([
        ['a.ts', c],
        ['b.ts', c],
        ['c.ts', 'different long content here ok'],
      ])
    );
    expect(r.duplicates.length).toBeGreaterThan(0);
  });
  test('formatTerminal non-empty', () => {
    expect(a.formatTerminal(a.analyze(mk([['a.ts', 500]])))).toContain('Bundle Analysis');
  });
  test('formatJSON parseable', () => {
    expect(() => JSON.parse(a.formatJSON(a.analyze(mk([['a.ts', 1]]))))).not.toThrow();
  });
  test('toHTML valid HTML', () => {
    expect(a.toHTML(a.analyze(mk([['a.ts', 1000]])))).toContain('<!DOCTYPE html>');
  });
  test('byCategory populated', () => {
    const r = a.analyze(
      mk([
        ['scene/x.ts', 1000],
        ['traits/y.ts', 500],
      ])
    );
    expect(Object.keys(r.byCategory).length).toBeGreaterThan(0);
  });
});
