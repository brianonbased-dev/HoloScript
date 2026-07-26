import { afterEach, describe, expect, it } from 'vitest';
import { CodebaseGraph } from '../CodebaseGraph';
import { GraphRAGEngine } from '../GraphRAGEngine';
import { makeSymbolObjectId } from '../SymbolObjectId';
import type { SymbolSearchIndex } from '../SearchIndex';
import type { ExternalSymbolDefinition, ScannedFile } from '../types';
import { GraphSelectionManager } from '../visualization/GraphSelectionManager';
import {
  graphRagTools,
  handleGraphRagTool,
  resetGraphRAGStateForTests,
  setGraphRAGState,
} from '../../mcp/graph-rag-tools';

const ROOT = 'C:/visual-agent-repo';

function symbol(name: string, filePath: string, line = 1): ExternalSymbolDefinition {
  return {
    name,
    type: 'function',
    language: 'typescript',
    visibility: 'public',
    filePath,
    line,
    column: 0,
    signature: `function ${name}()`,
  };
}

function scannedFile(
  path: string,
  symbols: ExternalSymbolDefinition[],
  calls: ScannedFile['calls'] = []
): ScannedFile {
  return {
    path,
    language: 'typescript',
    symbols,
    imports: [],
    calls,
    loc: 20,
    sizeBytes: 200,
  };
}

function fixture(): {
  graph: CodebaseGraph;
  first: ExternalSymbolDefinition;
  selected: ExternalSymbolDefinition;
} {
  const first = symbol('parse', `${ROOT}/generic-parser.ts`);
  const selected = symbol('parse', `${ROOT}/holo-parser.ts`, 7);
  const caller = symbol('compileHolo', `${ROOT}/compiler.ts`);
  const graph = new CodebaseGraph();
  graph.addFile(scannedFile(first.filePath, [first]));
  graph.addFile(scannedFile(selected.filePath, [selected]));
  graph.addFile(
    scannedFile(
      caller.filePath,
      [caller],
      [
        {
          callerId: 'compileHolo',
          calleeName: 'parse',
          filePath: caller.filePath,
          line: 3,
          column: 2,
        },
      ]
    )
  );
  graph.buildIndexes();
  return { graph, first, selected };
}

function ambiguousIndex(
  first: ExternalSymbolDefinition,
  selected: ExternalSymbolDefinition
): SymbolSearchIndex {
  const results = [
    {
      symbol: first,
      file: first.filePath,
      type: first.type,
      score: 0.9,
      vectorScore: 0.9,
      lexicalScore: 1,
      exactMatch: true,
      matchKind: 'exact-name' as const,
    },
    {
      symbol: selected,
      file: selected.filePath,
      type: selected.type,
      score: 0.88,
      vectorScore: 0.88,
      lexicalScore: 1,
      exactMatch: true,
      matchKind: 'exact-name' as const,
    },
  ];
  return {
    search: async () => results,
    searchWithFilters: async () => results,
    searchHybrid: async () => results,
    searchHybridWithFilters: async () => results,
  };
}

afterEach(() => resetGraphRAGStateForTests());

describe('HoloAbsorb visual graph agent context', () => {
  it('resolves collision-safe scene IDs without same-name bleed', () => {
    const { graph, first, selected } = fixture();
    const manager = new GraphSelectionManager(graph);
    manager.select(makeSymbolObjectId(selected));

    const context = manager.getSelectionContext();

    expect(context.symbolCount).toBe(1);
    expect(context.visualFocus.resolutionRate).toBe(1);
    expect(context.visualFocus.citations).toEqual([
      expect.objectContaining({
        nodeId: makeSymbolObjectId(selected),
        file: selected.filePath,
        line: 7,
      }),
    ]);
    expect(context.visualFocus.citations[0].file).not.toBe(first.filePath);
    expect(context.visualFocus.neighborNodeIds).toContain(
      makeSymbolObjectId(graph.findSymbolsByName('compileHolo')[0])
    );
  });

  it('refuses an ambiguous bare name instead of selecting the first overload', () => {
    const { graph } = fixture();
    const manager = new GraphSelectionManager(graph);
    manager.select('parse');

    const focus = manager.getVisualFocus();

    expect(focus.citations).toEqual([]);
    expect(focus.unresolvedNodeIds).toEqual(['parse']);
    expect(focus.resolutionRate).toBe(0);
  });

  it('uses explicit visual focus to disambiguate GraphRAG while preserving score evidence', async () => {
    const { graph, first, selected } = fixture();
    const index = ambiguousIndex(first, selected);
    const engine = new GraphRAGEngine(graph, index);
    const manager = new GraphSelectionManager(graph);
    manager.select(makeSymbolObjectId(selected));
    const visualFocus = manager.getVisualFocus();

    const baseline = await engine.query('parse', { topK: 2 });
    const focused = await engine.query('parse', { topK: 2, visualFocus });

    expect(baseline.results[0].file).toBe(first.filePath);
    expect(focused.results[0]).toMatchObject({
      file: selected.filePath,
      visualScore: 1,
      visualReasons: expect.arrayContaining(['selected-node', 'selected-file']),
    });
    expect(focused.visualFocus).toMatchObject({
      resolutionRate: 1,
      unresolvedNodeIds: [],
    });
  });

  it('fails stale unresolved visual focus closed to baseline-equivalent ranking', async () => {
    const { graph, first, selected } = fixture();
    const index = ambiguousIndex(first, selected);
    const engine = new GraphRAGEngine(graph, index);
    const manager = new GraphSelectionManager(graph);
    const staleNodeId = `${makeSymbolObjectId(selected)}:stale`;
    manager.select(staleNodeId);
    const visualFocus = manager.getVisualFocus();

    const baseline = await engine.query('parse', { topK: 2 });
    const stale = await engine.query('parse', { topK: 2, visualFocus });

    expect(visualFocus).toMatchObject({
      resolutionRate: 0,
      unresolvedNodeIds: [staleNodeId],
    });
    expect(stale.visualFocus).toBeUndefined();
    expect(
      stale.results.map((result) => ({
        file: result.file,
        score: result.score,
        visualScore: result.visualScore,
        visualReasons: result.visualReasons,
      }))
    ).toEqual(
      baseline.results.map((result) => ({
        file: result.file,
        score: result.score,
        visualScore: result.visualScore,
        visualReasons: result.visualReasons,
      }))
    );
  });

  it('measures wrong-but-resolved visual focus as supplied intent instead of hidden accuracy', async () => {
    const { graph, first, selected } = fixture();
    const index = ambiguousIndex(first, selected);
    const engine = new GraphRAGEngine(graph, index);
    const manager = new GraphSelectionManager(graph);
    manager.select(makeSymbolObjectId(selected));
    const visualFocus = manager.getVisualFocus();

    // For this ablation the fixed retrieval target is `first`; `selected` is a
    // valid but intentionally wrong visual choice supplied by the caller.
    const baseline = await engine.query('parse', { topK: 2 });
    const wrong = await engine.query('parse', { topK: 2, visualFocus });
    const baselineTargetRank =
      baseline.results.findIndex((result) => result.file === first.filePath) + 1;
    const wrongTargetRank = wrong.results.findIndex((result) => result.file === first.filePath) + 1;

    expect(visualFocus.resolutionRate).toBe(1);
    expect(baselineTargetRank).toBe(1);
    expect(wrongTargetRank).toBe(2);
    expect(wrong.results[0]).toMatchObject({
      file: selected.filePath,
      visualScore: 1,
      visualReasons: expect.arrayContaining(['selected-node']),
    });
  });

  it('exposes the visual selection as an agent-readable MCP receipt', async () => {
    const { graph, first, selected } = fixture();
    const index = ambiguousIndex(first, selected);
    setGraphRAGState(index, new GraphRAGEngine(graph, index), {
      rootDir: ROOT,
      timestamp: Date.now(),
    });

    const result = (await handleGraphRagTool('holo_visual_graph_context', {
      selectedNodeIds: [makeSymbolObjectId(selected)],
      maxNeighbors: 10,
    })) as Record<string, unknown>;
    const evidence = result.visualGraphEvidence as Record<string, unknown>;

    expect(graphRagTools.some((tool) => tool.name === 'holo_visual_graph_context')).toBe(true);
    expect(result.quality).toMatchObject({
      resolutionRate: 1,
      resolvedNodeCount: 1,
      unresolvedNodeCount: 0,
    });
    expect(evidence).toMatchObject({
      schemaVersion: 'holoscript.holoabsorb.visual-graph-focus.v1',
      kind: 'VisualGraphFocusReceipt',
      selectedNodeIds: [makeSymbolObjectId(selected)],
    });
  });
});
