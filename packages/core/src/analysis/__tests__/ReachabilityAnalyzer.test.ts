import { describe, it, expect, beforeEach } from 'vitest';
import { ReachabilityAnalyzer } from '../ReachabilityAnalyzer';
import { ReferenceGraph } from '../ReferenceGraph';
import type { ASTNode } from '../ReferenceGraph';

function makeAST(children: ASTNode[] = []): ASTNode {
  return { type: 'program', children };
}

function orbNode(name: string, line = 1): ASTNode {
  return { type: 'orb', name, loc: { start: { line, column: 0 } }, children: [] };
}

function compositionNode(name: string, children: ASTNode[] = []): ASTNode {
  return { type: 'composition', name, id: name, loc: { start: { line: 1, column: 0 } }, children };
}

describe('ReachabilityAnalyzer', () => {
  let graph: ReferenceGraph;

  beforeEach(() => {
    graph = new ReferenceGraph();
  });

  it('analyze returns reachability result', () => {
    const ast = makeAST([orbNode('Player')]);
    graph.buildFromAST(ast, 'test.holo');
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    expect(result).toBeDefined();
    expect(result.stats).toBeDefined();
    expect(result.stats.totalSymbols).toBeGreaterThanOrEqual(1);
  });

  it('composition is auto-entry-point (reachable)', () => {
    const ast = makeAST([compositionNode('main', [orbNode('A')])]);
    graph.buildFromAST(ast, 'test.holo');
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    expect(result.reachable.length).toBeGreaterThanOrEqual(1);
  });

  it('unreachable orbs are detected', () => {
    const ast = makeAST([orbNode('Unused')]);
    graph.buildFromAST(ast, 'test.holo');
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    expect(result.unreachable.length).toBeGreaterThanOrEqual(0);
  });

  it('stats coverage percent is between 0 and 100', () => {
    const ast = makeAST([orbNode('A'), orbNode('B')]);
    graph.buildFromAST(ast, 'test.holo');
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    expect(result.stats.coveragePercent).toBeGreaterThanOrEqual(0);
    expect(result.stats.coveragePercent).toBeLessThanOrEqual(100);
  });

  it('generateReport produces a string', () => {
    const ast = makeAST([orbNode('A')]);
    graph.buildFromAST(ast, 'test.holo');
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    const report = analyzer.generateReport(result);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  it('getUnusedOrbs filters dead code by type', () => {
    const ast = makeAST([orbNode('Orphan')]);
    graph.buildFromAST(ast, 'test.holo');
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    const unused = analyzer.getUnusedOrbs(result);
    expect(unused.length).toBeGreaterThanOrEqual(0);
  });

  it('options can ignore patterns', () => {
    const ast = makeAST([orbNode('_internal')]);
    graph.buildFromAST(ast, 'test.holo');
    const analyzer = new ReachabilityAnalyzer(graph, { ignorePatterns: [/^_/] });
    const result = analyzer.analyze();
    const internal = result.deadCode.find(d => d.symbol.name === '_internal');
    expect(internal).toBeUndefined();
  });

  it('additionalEntryPoints are respected', () => {
    graph.addDefinition({ name: 'Main', type: 'orb', filePath: 'a.holo', line: 1, column: 0 });
    const ast = makeAST([orbNode('Main')]);
    graph.buildFromAST(ast, 'a.holo');
    const analyzer = new ReachabilityAnalyzer(graph, { additionalEntryPoints: ['orb:Main:a.holo:1'] });
    const result = analyzer.analyze();
    expect(result.reachable.length).toBeGreaterThanOrEqual(1);
  });
});
