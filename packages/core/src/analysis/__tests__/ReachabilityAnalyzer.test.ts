import { describe, it, expect, beforeEach } from 'vitest';
import { ReachabilityAnalyzer } from '../ReachabilityAnalyzer';
import { ReferenceGraph } from '../ReferenceGraph';
import type { ASTNode } from '../ReferenceGraph';

describe('ReachabilityAnalyzer', () => {
  let graph: ReferenceGraph;

  beforeEach(() => { graph = new ReferenceGraph(); });

  // ---------------------------------------------------------------------------
  // Basic Analysis
  // ---------------------------------------------------------------------------

  it('analyze returns a result with all fields', () => {
    graph.addDefinition({
      name: 'Main', type: 'composition', filePath: 'main.holo', line: 1, column: 0, isEntryPoint: true,
    });
    graph.finalize();
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    expect(result).toHaveProperty('reachable');
    expect(result).toHaveProperty('unreachable');
    expect(result).toHaveProperty('deadCode');
    expect(result).toHaveProperty('stats');
  });

  it('entry point composition is reachable', () => {
    graph.addDefinition({
      name: 'MainScene', type: 'composition', filePath: 'main.holo', line: 1, column: 0, isEntryPoint: true,
    });
    graph.finalize();
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    expect(result.reachable.length).toBeGreaterThanOrEqual(1);
    expect(result.reachable.some(d => d.name === 'MainScene')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Dead Code Detection
  // ---------------------------------------------------------------------------

  it('unreferenced function is dead code', () => {
    graph.addDefinition({
      name: 'MainScene', type: 'composition', filePath: 'main.holo', line: 1, column: 0, isEntryPoint: true,
    });
    graph.addDefinition({
      name: 'unusedHelper', type: 'function', filePath: 'utils.holo', line: 100, column: 0,
    });
    graph.finalize();

    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    expect(result.unreachable.length).toBeGreaterThanOrEqual(1);
    expect(result.deadCode.some(d => d.symbol.name === 'unusedHelper')).toBe(true);
  });

  it('getUnusedFunctions filters dead functions', () => {
    graph.addDefinition({
      name: 'MainScene', type: 'composition', filePath: 'main.holo', line: 1, column: 0, isEntryPoint: true,
    });
    graph.addDefinition({
      name: 'deadFn', type: 'function', filePath: 'u.holo', line: 1, column: 0,
    });
    graph.finalize();
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    const unused = analyzer.getUnusedFunctions(result);
    expect(unused.length).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  it('stats has correct counts', () => {
    graph.addDefinition({
      name: 'MainScene', type: 'composition', filePath: 'a.holo', line: 1, column: 0, isEntryPoint: true,
    });
    graph.addDefinition({
      name: 'Helper', type: 'function', filePath: 'b.holo', line: 1, column: 0,
    });
    graph.finalize();
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    expect(result.stats.totalSymbols).toBeGreaterThanOrEqual(2);
    expect(result.stats.coveragePercent).toBeGreaterThanOrEqual(0);
    expect(result.stats.coveragePercent).toBeLessThanOrEqual(100);
  });

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  it('generateReport returns a non-empty string', () => {
    graph.addDefinition({
      name: 'MainScene', type: 'composition', filePath: 'main.holo', line: 1, column: 0, isEntryPoint: true,
    });
    graph.finalize();
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    const report = analyzer.generateReport(result);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });
});
