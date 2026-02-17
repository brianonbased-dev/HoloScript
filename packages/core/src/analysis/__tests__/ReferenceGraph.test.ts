import { describe, it, expect, beforeEach } from 'vitest';
import { ReferenceGraph } from '../ReferenceGraph';
import type { ASTNode } from '../ReferenceGraph';

function makeOrbAST(name: string): ASTNode {
  return {
    type: 'Program',
    children: [
      {
        type: 'orb',
        name,
        id: name,
        properties: [
          { key: 'health', value: '100' },
        ],
        loc: { start: { line: 1, column: 0 } },
      },
    ],
  };
}

describe('ReferenceGraph', () => {
  let graph: ReferenceGraph;

  beforeEach(() => { graph = new ReferenceGraph(); });

  // ---------------------------------------------------------------------------
  // Build from AST
  // ---------------------------------------------------------------------------

  it('buildFromAST populates definitions', () => {
    graph.buildFromAST(makeOrbAST('Player'));
    const defs = graph.getDefinitions();
    expect(defs.size).toBeGreaterThan(0);
  });

  it('buildFromAST creates nodes after edge building', () => {
    graph.buildFromAST(makeOrbAST('Player'));
    const nodes = graph.getNodes();
    expect(nodes.size).toBeGreaterThan(0);
  });

  it('buildFromAST sets filePath', () => {
    graph.buildFromAST(makeOrbAST('Player'), 'game.holo');
    const defs = graph.getDefinitions();
    const hasDef = [...defs.values()].some(d => d.filePath === 'game.holo');
    expect(hasDef).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Multi-file
  // ---------------------------------------------------------------------------

  it('addFile handles multiple files and finalize builds graph', () => {
    graph.addFile(makeOrbAST('Player'), 'player.holo');
    graph.addFile(makeOrbAST('Enemy'), 'enemy.holo');
    graph.finalize();
    const nodes = graph.getNodes();
    expect(nodes.size).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------
  // Definitions & References
  // ---------------------------------------------------------------------------

  it('addDefinition manually adds a definition', () => {
    graph.addDefinition({
      name: 'CustomFn',
      type: 'function',
      filePath: 'test.holo',
      line: 1,
      column: 0,
    });
    expect(graph.getDefinitions().size).toBe(1);
  });

  it('addReference manually adds a reference', () => {
    graph.addReference({
      name: 'CustomFn',
      type: 'function',
      filePath: 'test.holo',
      line: 10,
      column: 5,
      context: 'function-call',
    });
    expect(graph.getReferences().length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Entry Points
  // ---------------------------------------------------------------------------

  it('addEntryPoint marks custom entry point', () => {
    graph.addEntryPoint('Main');
    expect(graph.getEntryPoints().has('Main')).toBe(true);
  });

  it('buildFromAST identifies composition nodes as entry points', () => {
    const ast: ASTNode = {
      type: 'Program',
      children: [
        {
          type: 'composition',
          name: 'MainScene',
          id: 'MainScene',
          loc: { start: { line: 1, column: 0 } },
        },
      ],
    };
    graph.buildFromAST(ast);
    expect(graph.getEntryPoints().size).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  it('getStats returns correct counts from AST', () => {
    graph.buildFromAST(makeOrbAST('A'));
    const stats = graph.getStats();
    expect(stats.totalNodes).toBeGreaterThan(0);
  });

  it('getStats returns zero for empty graph', () => {
    const stats = graph.getStats();
    expect(stats.totalNodes).toBe(0);
    expect(stats.totalEdges).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  it('clear resets the graph', () => {
    graph.buildFromAST(makeOrbAST('Player'));
    graph.clear();
    expect(graph.getNodes().size).toBe(0);
    expect(graph.getDefinitions().size).toBe(0);
    expect(graph.getReferences().length).toBe(0);
  });
});
