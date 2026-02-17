import { describe, it, expect, beforeEach } from 'vitest';
import { ReferenceGraph, type ASTNode } from '../ReferenceGraph';

// collectDefinitions expects node.type === 'orb' (not 'orb_definition')
function makeAST(children: ASTNode[] = []): ASTNode {
  return { type: 'program', children };
}

function orbNode(name: string, line = 1): ASTNode {
  return { type: 'orb', name, loc: { start: { line, column: 0 } }, children: [] };
}

function templateNode(name: string, line = 1): ASTNode {
  return { type: 'template', name, loc: { start: { line, column: 0 } }, children: [] };
}

function funcNode(name: string, line = 1): ASTNode {
  return { type: 'function', name, loc: { start: { line, column: 0 } }, children: [] };
}

describe('ReferenceGraph', () => {
  let graph: ReferenceGraph;

  beforeEach(() => { graph = new ReferenceGraph(); });

  // ---------------------------------------------------------------------------
  // Definitions (via addDefinition + getDefinitions which returns Map)
  // ---------------------------------------------------------------------------

  it('addDefinition registers a symbol in definitions map', () => {
    graph.addDefinition({ name: 'Player', type: 'orb', filePath: 'a.holo', line: 1, column: 0 });
    const defs = graph.getDefinitions();
    expect(defs.size).toBe(1);
  });

  it('getDefinitions returns all definitions', () => {
    graph.addDefinition({ name: 'A', type: 'orb', filePath: 'a.holo', line: 1, column: 0 });
    graph.addDefinition({ name: 'B', type: 'template', filePath: 'b.holo', line: 1, column: 0 });
    const defs = graph.getDefinitions();
    expect(defs.size).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // References
  // ---------------------------------------------------------------------------

  it('addReference stores a reference', () => {
    graph.addReference({ name: 'Player', type: 'orb', filePath: 'b.holo', line: 5, column: 10, context: 'usage' });
    expect(graph.getReferences()).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Build from AST — node.type must be 'orb', 'template', 'function'
  // ---------------------------------------------------------------------------

  it('buildFromAST discovers orb definitions', () => {
    const ast = makeAST([orbNode('Enemy', 3)]);
    graph.buildFromAST(ast, 'test.holo');
    const stats = graph.getStats();
    expect(stats.totalNodes).toBeGreaterThanOrEqual(1);
  });

  it('buildFromAST discovers template definitions', () => {
    const ast = makeAST([templateNode('BaseEnemy', 1)]);
    graph.buildFromAST(ast, 'test.holo');
    expect(graph.getStats().totalNodes).toBeGreaterThanOrEqual(1);
  });

  it('buildFromAST discovers function definitions', () => {
    const ast = makeAST([funcNode('main', 1)]);
    graph.buildFromAST(ast, 'test.holo');
    expect(graph.getStats().totalNodes).toBeGreaterThanOrEqual(1);
  });

  it('addFile for multiple files then finalize', () => {
    graph.addFile(makeAST([orbNode('A')]), 'a.holo');
    graph.addFile(makeAST([orbNode('B')]), 'b.holo');
    graph.finalize();
    expect(graph.getStats().totalNodes).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------
  // Entry Points
  // ---------------------------------------------------------------------------

  it('addEntryPoint registers a custom entry point', () => {
    graph.addEntryPoint('function:main');
    expect(graph.getEntryPoints().has('function:main')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Stats (requires nodes built via buildFromAST)
  // ---------------------------------------------------------------------------

  it('getStats returns comprehensive data after buildFromAST', () => {
    const ast = makeAST([orbNode('A'), orbNode('B', 5)]);
    graph.buildFromAST(ast, 'test.holo');
    const stats = graph.getStats();
    expect(stats.totalNodes).toBeGreaterThanOrEqual(2);
    expect(stats.byType).toBeDefined();
    expect(stats.byType.orb).toBeGreaterThanOrEqual(2);
  });

  it('getStats returns zero when empty', () => {
    const stats = graph.getStats();
    expect(stats.totalNodes).toBe(0);
    expect(stats.totalEdges).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  it('clear resets the graph', () => {
    graph.addDefinition({ name: 'X', type: 'orb', filePath: 'a.holo', line: 1, column: 0 });
    graph.clear();
    expect(graph.getDefinitions().size).toBe(0);
    expect(graph.getStats().totalNodes).toBe(0);
  });
});
