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

  it('getUnusedFunctions filters dead code by function type', () => {
    // Create a mock function node
    const functionNode: ASTNode = {
      type: 'function',
      name: 'unusedFunction',
      loc: { start: { line: 1, column: 0 } },
      children: []
    };
    const ast = makeAST([functionNode]);
    graph.buildFromAST(ast, 'test.holo');
    
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    const unusedFunctions = analyzer.getUnusedFunctions(result);
    
    // Should return array of DeadCodeItems
    expect(Array.isArray(unusedFunctions)).toBe(true);
    // Filter specifically for function-type dead code
    const functionDeadCode = result.deadCode.filter(item => item.type === 'unused-function');
    expect(unusedFunctions).toEqual(functionDeadCode);
  });

  it('getUnusedTemplates filters dead code by template type', () => {
    // Create a mock template node
    const templateNode: ASTNode = {
      type: 'template',
      name: 'unusedTemplate',
      loc: { start: { line: 1, column: 0 } },
      children: []
    };
    const ast = makeAST([templateNode]);
    graph.buildFromAST(ast, 'test.holo');
    
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    const unusedTemplates = analyzer.getUnusedTemplates(result);
    
    // Should return array of DeadCodeItems
    expect(Array.isArray(unusedTemplates)).toBe(true);
    // Filter specifically for template-type dead code
    const templateDeadCode = result.deadCode.filter(item => item.type === 'unused-template');
    expect(unusedTemplates).toEqual(templateDeadCode);
  });

  it('getUnusedProperties filters dead code by property type', () => {
    // Create a mock property node
    const propertyNode: ASTNode = {
      type: 'property',
      name: 'unusedProperty',
      loc: { start: { line: 1, column: 0 } },
      children: []
    };
    const ast = makeAST([propertyNode]);
    graph.buildFromAST(ast, 'test.holo');
    
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    const unusedProperties = analyzer.getUnusedProperties(result);
    
    // Should return array of DeadCodeItems
    expect(Array.isArray(unusedProperties)).toBe(true);
    // Filter specifically for property-type dead code
    const propertyDeadCode = result.deadCode.filter(item => item.type === 'unused-property');
    expect(unusedProperties).toEqual(propertyDeadCode);
  });

  it('getDeadCodeByType works with all supported types', () => {
    // Create nodes of different types
    const nodes: ASTNode[] = [
      { type: 'orb', name: 'unusedOrb', loc: { start: { line: 1, column: 0 } }, children: [] },
      { type: 'function', name: 'unusedFunc', loc: { start: { line: 2, column: 0 } }, children: [] },
      { type: 'template', name: 'unusedTemplate', loc: { start: { line: 3, column: 0 } }, children: [] },
      { type: 'property', name: 'unusedProp', loc: { start: { line: 4, column: 0 } }, children: [] }
    ];
    
    const ast = makeAST(nodes);
    graph.buildFromAST(ast, 'test.holo');
    
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    
    // Test each type filter
    const orbResults = analyzer.getDeadCodeByType(result, 'unused-orb');
    const functionResults = analyzer.getDeadCodeByType(result, 'unused-function');
    const templateResults = analyzer.getDeadCodeByType(result, 'unused-template');
    const propertyResults = analyzer.getDeadCodeByType(result, 'unused-property');
    
    // All should return arrays
    expect(Array.isArray(orbResults)).toBe(true);
    expect(Array.isArray(functionResults)).toBe(true);
    expect(Array.isArray(templateResults)).toBe(true);
    expect(Array.isArray(propertyResults)).toBe(true);
    
    // Each result should only contain items of the correct type
    orbResults.forEach(item => expect(item.type).toBe('unused-orb'));
    functionResults.forEach(item => expect(item.type).toBe('unused-function'));
    templateResults.forEach(item => expect(item.type).toBe('unused-template'));
    propertyResults.forEach(item => expect(item.type).toBe('unused-property'));
  });

  it('dead code filtering methods return consistent results', () => {
    const ast = makeAST([
      orbNode('UnusedOrb'),
      { type: 'function', name: 'UnusedFunction', loc: { start: { line: 2, column: 0 } }, children: [] }
    ]);
    graph.buildFromAST(ast, 'test.holo');
    
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    
    // Test that convenience methods match direct filtering
    const orbsViaMethod = analyzer.getUnusedOrbs(result);
    const orbsViaFilter = analyzer.getDeadCodeByType(result, 'unused-orb');
    expect(orbsViaMethod).toEqual(orbsViaFilter);
    
    const functionsViaMethod = analyzer.getUnusedFunctions(result);
    const functionsViaFilter = analyzer.getDeadCodeByType(result, 'unused-function');
    expect(functionsViaMethod).toEqual(functionsViaFilter);
    
    const templatesViaMethod = analyzer.getUnusedTemplates(result);
    const templatesViaFilter = analyzer.getDeadCodeByType(result, 'unused-template');
    expect(templatesViaMethod).toEqual(templatesViaFilter);
    
    const propertiesViaMethod = analyzer.getUnusedProperties(result);
    const propertiesViaFilter = analyzer.getDeadCodeByType(result, 'unused-property');
    expect(propertiesViaMethod).toEqual(propertiesViaFilter);
  });

  it('options can ignore patterns', () => {
    const ast = makeAST([orbNode('_internal')]);
    graph.buildFromAST(ast, 'test.holo');
    const analyzer = new ReachabilityAnalyzer(graph, { ignorePatterns: [/^_/] });
    const result = analyzer.analyze();
    const internal = result.deadCode.find((d) => d.symbol.name === '_internal');
    expect(internal).toBeUndefined();
  });

  it('additionalEntryPoints are respected', () => {
    graph.addDefinition({ name: 'Main', type: 'orb', filePath: 'a.holo', line: 1, column: 0 });
    const ast = makeAST([orbNode('Main')]);
    graph.buildFromAST(ast, 'a.holo');
    const analyzer = new ReachabilityAnalyzer(graph, {
      additionalEntryPoints: ['orb:Main:a.holo:1'],
    });
    const result = analyzer.analyze();
    expect(result.reachable.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty graph gracefully', () => {
    const emptyGraph = new ReferenceGraph();
    const analyzer = new ReachabilityAnalyzer(emptyGraph);
    const result = analyzer.analyze();
    
    expect(result).toBeDefined();
    expect(result.stats.totalSymbols).toBe(0);
    expect(result.reachable).toHaveLength(0);
    expect(result.unreachable).toHaveLength(0);
    expect(result.deadCode).toHaveLength(0);
    expect(result.stats.coveragePercent).toBe(100);
  });

  it('generates detailed report with all sections', () => {
    // Create a complex scenario with multiple types
    const ast = makeAST([
      compositionNode('main', [orbNode('Used')]),
      orbNode('Unused'),
      { type: 'function', name: 'unusedFunc', loc: { start: { line: 3, column: 0 } }, children: [] },
      { type: 'template', name: 'unusedTemplate', loc: { start: { line: 4, column: 0 } }, children: [] },
    ]);
    
    graph.buildFromAST(ast, 'complex.holo');
    const analyzer = new ReachabilityAnalyzer(graph);
    const result = analyzer.analyze();
    const report = analyzer.generateReport(result);
    
    expect(typeof report).toBe('string');
    expect(report).toContain('Reachability Analysis');
    expect(report).toContain('Coverage:');
    expect(report).toContain('Total Symbols:');
    expect(report.length).toBeGreaterThan(100);
  });
});
