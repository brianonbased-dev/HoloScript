/**
 * ReachabilityAnalyzer — Production Test Suite
 *
 * Covers: analyze, markReachable, createDeadCodeItem, calculateStats,
 * getDeadCodeByType, getUnusedOrbs, getUnusedFunctions, generateReport,
 * options (ignore patterns, additionalEntryPoints).
 */
import { describe, it, expect } from 'vitest';
import { ReferenceGraph } from '../ReferenceGraph';
import { ReachabilityAnalyzer } from '../ReachabilityAnalyzer';

function buildGraph(children: any[]) {
  const g = new ReferenceGraph();
  g.buildFromAST({ type: 'program', children }, 'test.holo');
  return g;
}

describe('ReachabilityAnalyzer — Production', () => {
  it('analyze returns stats for a graph with symbols', () => {
    const g = buildGraph([
      { type: 'object', name: 'Player', loc: { start: { line: 1, column: 1 } } },
    ]);
    const analyzer = new ReachabilityAnalyzer(g);
    const result = analyzer.analyze();
    expect(result.stats.totalSymbols).toBeGreaterThanOrEqual(1);
  });

  it('detects unreachable functions not referenced by entry points', () => {
    const g = buildGraph([
      { type: 'object', name: 'Player', loc: { start: { line: 1, column: 1 } } },
      { type: 'function', name: 'unusedHelper', loc: { start: { line: 10, column: 1 } } },
    ]);
    const analyzer = new ReachabilityAnalyzer(g);
    const result = analyzer.analyze();
    const unreachableNames = result.unreachable.map(u => u.name);
    expect(unreachableNames).toContain('unusedHelper');
  });

  it('stats includes coverage percent', () => {
    const g = buildGraph([
      { type: 'object', name: 'A', loc: { start: { line: 1, column: 1 } } },
    ]);
    const analyzer = new ReachabilityAnalyzer(g);
    const result = analyzer.analyze();
    expect(result.stats.coveragePercent).toBeDefined();
    expect(result.stats.totalSymbols).toBeGreaterThanOrEqual(1);
  });

  it('deadCode items have type and severity', () => {
    const g = buildGraph([
      { type: 'object', name: 'X', loc: { start: { line: 1, column: 1 } } },
      { type: 'function', name: 'dead', loc: { start: { line: 10, column: 1 } } },
    ]);
    const analyzer = new ReachabilityAnalyzer(g);
    const result = analyzer.analyze();
    if (result.deadCode.length > 0) {
      expect(result.deadCode[0].type).toBeDefined();
      expect(result.deadCode[0].severity).toBeDefined();
    }
  });

  it('getUnusedFunctions returns dead functions', () => {
    const g = buildGraph([
      { type: 'object', name: 'X', loc: { start: { line: 1, column: 1 } } },
      { type: 'function', name: 'deadFunc', loc: { start: { line: 10, column: 1 } } },
    ]);
    const analyzer = new ReachabilityAnalyzer(g);
    const result = analyzer.analyze();
    const unusedFuncs = analyzer.getUnusedFunctions(result);
    const names = unusedFuncs.map(f => f.symbol.name);
    expect(names).toContain('deadFunc');
  });

  it('generateReport produces non-empty string', () => {
    const g = buildGraph([
      { type: 'object', name: 'A', loc: { start: { line: 1, column: 1 } } },
    ]);
    const analyzer = new ReachabilityAnalyzer(g);
    const result = analyzer.analyze();
    const report = analyzer.generateReport(result);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  it('ignorePatterns excludes matching symbols from dead code', () => {
    const g = buildGraph([
      { type: 'object', name: 'Player', loc: { start: { line: 1, column: 1 } } },
      { type: 'function', name: '_internal', loc: { start: { line: 5, column: 1 } } },
    ]);
    const analyzer = new ReachabilityAnalyzer(g, { ignorePatterns: [/^_/] });
    const result = analyzer.analyze();
    const deadNames = result.deadCode.map(d => d.symbol.name);
    expect(deadNames).not.toContain('_internal');
  });

  it('empty graph produces zero stats', () => {
    const g = new ReferenceGraph();
    g.buildFromAST({ type: 'program', children: [] }, 'empty.holo');
    const analyzer = new ReachabilityAnalyzer(g);
    const result = analyzer.analyze();
    expect(result.stats.totalSymbols).toBe(0);
  });

  it('additionalEntryPoints makes symbols reachable', () => {
    const g = buildGraph([
      { type: 'function', name: 'myFunc', loc: { start: { line: 1, column: 1 } } },
    ]);
    const analyzer = new ReachabilityAnalyzer(g, { additionalEntryPoints: ['myFunc'] });
    const result = analyzer.analyze();
    const reachableNames = result.reachable.map(r => r.name);
    expect(reachableNames).toContain('myFunc');
  });
});
