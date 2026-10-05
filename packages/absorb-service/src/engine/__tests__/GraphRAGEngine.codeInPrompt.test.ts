/**
 * The answer prompt carries the code of the top results when a codeReader is
 * given (2026-10-05). Shown names and signatures only, the Jetson qwen3-4b
 * described fuseHybridScore as "clamp operations"; shown the code, it stated
 * the formula.
 */
import { describe, expect, it } from 'vitest';
import { GraphRAGEngine } from '../GraphRAGEngine';
import type { CodebaseGraph } from '../CodebaseGraph';
import type { SymbolSearchIndex } from '../SearchIndex';
import type { ExternalSymbolDefinition } from '../types';

describe('GraphRAGEngine answer prompt', () => {
  it('includes the code of the first codeReader.count results, and only those', async () => {
    const sym = (name: string, line: number): ExternalSymbolDefinition => ({
      name,
      type: 'function',
      filePath: 'src/fuse.ts',
      line,
      column: 0,
      language: 'typescript',
      visibility: 'public',
    });
    const results = [sym('fuseHybridScore', 10), sym('roundScore', 40)].map((symbol) => ({
      symbol,
      score: 0.9,
      file: symbol.filePath,
      type: symbol.type,
    }));
    const index: SymbolSearchIndex = {
      search: async () => results,
      searchWithFilters: async () => results,
    };
    const graph = {
      getCallersOf: () => [],
      getCalleesOf: () => [],
      getSymbolImpact: () => new Set<string>(),
      getCommunityForFile: () => undefined,
    } as unknown as CodebaseGraph;
    const prompts: string[] = [];
    const engine = new GraphRAGEngine(graph, index, {
      llmProvider: {
        complete: async (request: { messages: Array<{ content: string }> }) => {
          prompts.push(request.messages.map((m) => m.content).join('\n'));
          return { content: 'fused = v + (1 - v) * 0.45 * l' };
        },
      } as never,
    });

    await engine.queryWithLLM('how does fuseHybridScore fuse scores', {
      codeReader: {
        count: 1,
        read: (r) => (r.symbol.name === 'fuseHybridScore' ? 'return v + (1 - v) * 0.45 * l;' : 'SHOULD NOT APPEAR'),
      },
    });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('   Code:\n     return v + (1 - v) * 0.45 * l;');
    expect(prompts[0]).not.toContain('SHOULD NOT APPEAR');
  });
});
