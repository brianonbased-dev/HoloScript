/**
 * ReachabilityAnalyzer Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReachabilityAnalyzer, DeadCodeItem, ReachabilityResult } from './ReachabilityAnalyzer';
import { ReferenceGraph, SymbolDefinition, SymbolType } from './ReferenceGraph';

describe('ReachabilityAnalyzer', () => {
  let graph: ReferenceGraph;
  let analyzer: ReachabilityAnalyzer;

  // Mock symbol definitions for testing
  const createSymbol = (name: string, type: SymbolType, filePath = 'test.ts'): SymbolDefinition => ({
    name,
    type,
    filePath,
    startLine: 1,
    endLine: 1,
    signature: `${type} ${name}`,
    documentation: `${name} documentation`,
    isExported: type === 'function' || type === 'class',
    isPublic: true,
    hasTests: false
  });

  beforeEach(() => {
    graph = new ReferenceGraph();
    
    // Add test symbols
    const mainFunction = createSymbol('main', 'function');
    const usedFunction = createSymbol('usedFunction', 'function');
    const unusedFunction = createSymbol('unusedFunction', 'function');
    const usedOrb = createSymbol('UsedOrb', 'orb');
    const unusedOrb = createSymbol('UnusedOrb', 'orb');
    
    // Add nodes to graph
    graph.addSymbol(mainFunction);
    graph.addSymbol(usedFunction);
    graph.addSymbol(unusedFunction);
    graph.addSymbol(usedOrb);
    graph.addSymbol(unusedOrb);
    
    // Set up dependencies (main -> usedFunction, main -> usedOrb)
    graph.addDependency('main', 'usedFunction');
    graph.addDependency('main', 'UsedOrb');
    
    // Mark main as entry point
    graph.setEntryPoint('main');
    
    analyzer = new ReachabilityAnalyzer(graph);
  });

  describe('analyze', () => {
    it('should identify reachable and unreachable symbols', () => {
      const result = analyzer.analyze();
      
      expect(result.reachable).toHaveLength(3); // main, usedFunction, UsedOrb
      expect(result.unreachable).toHaveLength(2); // unusedFunction, UnusedOrb
      
      const reachableNames = result.reachable.map(s => s.name);
      expect(reachableNames).toContain('main');
      expect(reachableNames).toContain('usedFunction');
      expect(reachableNames).toContain('UsedOrb');
      
      const unreachableNames = result.unreachable.map(s => s.name);
      expect(unreachableNames).toContain('unusedFunction');
      expect(unreachableNames).toContain('UnusedOrb');
    });

    it('should calculate correct statistics', () => {
      const result = analyzer.analyze();
      
      expect(result.stats.totalSymbols).toBe(5);
      expect(result.stats.reachableCount).toBe(3);
      expect(result.stats.unreachableCount).toBe(2);
      expect(result.stats.coveragePercent).toBe(60);
    });

    it('should categorize dead code by type', () => {
      const result = analyzer.analyze();
      
      expect(result.stats.deadCodeByType['unused-function']).toBe(1);
      expect(result.stats.deadCodeByType['unused-orb']).toBe(1);
    });
  });

  describe('getUnusedFunctions', () => {
    it('should return only unused functions', () => {
      const result = analyzer.analyze();
      const unusedFunctions = analyzer.getUnusedFunctions(result);
      
      expect(unusedFunctions).toHaveLength(1);
      expect(unusedFunctions[0].symbol.name).toBe('unusedFunction');
      expect(unusedFunctions[0].type).toBe('unused-function');
      expect(unusedFunctions[0].severity).toBe('warning');
    });

    it('should return empty array when all functions are used', () => {
      // Create analyzer with no unused functions
      const simpleGraph = new ReferenceGraph();
      const mainFunc = createSymbol('main', 'function');
      const usedFunc = createSymbol('used', 'function');
      
      simpleGraph.addSymbol(mainFunc);
      simpleGraph.addSymbol(usedFunc);
      simpleGraph.addDependency('main', 'used');
      simpleGraph.setEntryPoint('main');
      
      const simpleAnalyzer = new ReachabilityAnalyzer(simpleGraph);
      const result = simpleAnalyzer.analyze();
      const unusedFunctions = simpleAnalyzer.getUnusedFunctions(result);
      
      expect(unusedFunctions).toHaveLength(0);
    });
  });

  describe('getUnusedOrbs', () => {
    it('should return only unused orbs', () => {
      const result = analyzer.analyze();
      const unusedOrbs = analyzer.getUnusedOrbs(result);
      
      expect(unusedOrbs).toHaveLength(1);
      expect(unusedOrbs[0].symbol.name).toBe('UnusedOrb');
      expect(unusedOrbs[0].type).toBe('unused-orb');
    });
  });

  describe('getUnusedTemplates', () => {
    it('should return only unused templates', () => {
      // Add template symbols
      const usedTemplate = createSymbol('UsedTemplate', 'template');
      const unusedTemplate = createSymbol('UnusedTemplate', 'template');
      
      graph.addSymbol(usedTemplate);
      graph.addSymbol(unusedTemplate);
      graph.addDependency('main', 'UsedTemplate');
      
      const result = analyzer.analyze();
      const unusedTemplates = analyzer.getUnusedTemplates(result);
      
      expect(unusedTemplates).toHaveLength(1);
      expect(unusedTemplates[0].symbol.name).toBe('UnusedTemplate');
      expect(unusedTemplates[0].type).toBe('unused-template');
    });
  });

  describe('getUnusedProperties', () => {
    it('should return only unused properties when includeProperties is true', () => {
      const usedProperty = createSymbol('usedProp', 'property');
      const unusedProperty = createSymbol('unusedProp', 'property');
      
      graph.addSymbol(usedProperty);
      graph.addSymbol(unusedProperty);
      graph.addDependency('main', 'usedProp');
      
      const analyzerWithProps = new ReachabilityAnalyzer(graph, { includeProperties: true });
      const result = analyzerWithProps.analyze();
      const unusedProperties = analyzerWithProps.getUnusedProperties(result);
      
      expect(unusedProperties).toHaveLength(1);
      expect(unusedProperties[0].symbol.name).toBe('unusedProp');
      expect(unusedProperties[0].type).toBe('unused-property');
    });
  });

  describe('generateReport', () => {
    it('should generate a formatted report', () => {
      const result = analyzer.analyze();
      const report = analyzer.generateReport(result);
      
      expect(report).toContain('Dead Code Analysis Report');
      expect(report).toContain('Total symbols: 5');
      expect(report).toContain('Reachable: 3 (60.0%)');
      expect(report).toContain('Unreachable: 2');
      expect(report).toContain('unused-function: 1');
      expect(report).toContain('unused-orb: 1');
    });

    it('should include removal suggestions', () => {
      const result = analyzer.analyze();
      const report = analyzer.generateReport(result);
      
      expect(report).toContain('Removal suggestions:');
      expect(report).toContain('unusedFunction');
      expect(report).toContain('UnusedOrb');
    });
  });

  describe('options', () => {
    it('should respect ignorePatterns option', () => {
      const analyzerWithIgnore = new ReachabilityAnalyzer(graph, {
        ignorePatterns: [/^unused/]
      });
      
      const result = analyzerWithIgnore.analyze();
      
      // Should still detect unused symbols but not report them as dead code
      expect(result.unreachable).toHaveLength(2);
      // Dead code items should be filtered by ignore patterns
      const deadCodeNames = result.deadCode.map(item => item.symbol.name);
      expect(deadCodeNames.filter(name => name.startsWith('unused'))).toHaveLength(0);
    });

    it('should respect additionalEntryPoints option', () => {
      const analyzerWithEntry = new ReachabilityAnalyzer(graph, {
        additionalEntryPoints: ['unusedFunction']
      });
      
      const result = analyzerWithEntry.analyze();
      
      // unusedFunction should now be reachable as it's an entry point
      const reachableNames = result.reachable.map(s => s.name);
      expect(reachableNames).toContain('unusedFunction');
    });

    it('should respect includePrivate option', () => {
      const privateSymbol = createSymbol('_privateFunction', 'function');
      graph.addSymbol(privateSymbol);
      
      const analyzerWithPrivate = new ReachabilityAnalyzer(graph, {
        includePrivate: true
      });
      
      const result = analyzerWithPrivate.analyze();
      
      // Should include private symbols in analysis
      const allSymbolNames = [...result.reachable, ...result.unreachable].map(s => s.name);
      expect(allSymbolNames).toContain('_privateFunction');
    });
  });

  describe('edge cases', () => {
    it('should handle empty graph', () => {
      const emptyGraph = new ReferenceGraph();
      const emptyAnalyzer = new ReachabilityAnalyzer(emptyGraph);
      
      const result = emptyAnalyzer.analyze();
      
      expect(result.reachable).toHaveLength(0);
      expect(result.unreachable).toHaveLength(0);
      expect(result.stats.totalSymbols).toBe(0);
      expect(result.stats.coveragePercent).toBe(100); // 100% coverage of nothing
    });

    it('should handle circular dependencies', () => {
      const funcA = createSymbol('funcA', 'function');
      const funcB = createSymbol('funcB', 'function');
      
      graph.addSymbol(funcA);
      graph.addSymbol(funcB);
      graph.addDependency('funcA', 'funcB');
      graph.addDependency('funcB', 'funcA');
      graph.setEntryPoint('funcA');
      
      const circularAnalyzer = new ReachabilityAnalyzer(graph);
      const result = circularAnalyzer.analyze();
      
      // Both should be reachable despite circular dependency
      const reachableNames = result.reachable.map(s => s.name);
      expect(reachableNames).toContain('funcA');
      expect(reachableNames).toContain('funcB');
    });

    it('should handle graph with no entry points', () => {
      const noEntryGraph = new ReferenceGraph();
      const orphanSymbol = createSymbol('orphan', 'function');
      
      noEntryGraph.addSymbol(orphanSymbol);
      
      const noEntryAnalyzer = new ReachabilityAnalyzer(noEntryGraph);
      const result = noEntryAnalyzer.analyze();
      
      expect(result.reachable).toHaveLength(0);
      expect(result.unreachable).toHaveLength(1);
      expect(result.unreachable[0].name).toBe('orphan');
    });
  });
});