import { describe, expect, it, vi } from 'vitest';
import { EmbeddingIndex } from '../EmbeddingIndex';
import type { EmbeddingProvider } from '../providers/EmbeddingProvider';
import type { ExternalSymbolDefinition } from '../types';

function makeSymbol(index: number): ExternalSymbolDefinition {
  return {
    name: `Symbol${index}`,
    type: 'function',
    filePath: `src/symbol-${index}.ts`,
    line: index + 1,
    column: 1,
    language: 'typescript',
    visibility: 'public',
    signature: `function Symbol${index}(): void`,
  };
}

describe('EmbeddingIndex streaming batches', () => {
  it('converts symbols to text per embedding batch instead of one monorepo-sized batch', async () => {
    const batchSizes: number[] = [];
    const provider: EmbeddingProvider = {
      name: 'test-provider',
      getEmbeddings: vi.fn(async (texts: string[]) => {
        batchSizes.push(texts.length);
        return texts.map((_, index) => [batchSizes.length, index]);
      }),
    };
    const symbols = Array.from({ length: 5 }, (_, index) => makeSymbol(index));
    const progress: Array<{ batch: number; total: number; processed: number }> = [];
    const index = new EmbeddingIndex({ provider, batchSize: 2, useWorkers: false });

    await index.buildIndex({ getAllSymbols: () => symbols } as any, (batch, total, processed) =>
      progress.push({ batch, total, processed })
    );

    expect(batchSizes).toEqual([2, 2, 1]);
    expect(progress).toEqual([
      { batch: 1, total: 3, processed: 2 },
      { batch: 2, total: 3, processed: 4 },
      { batch: 3, total: 3, processed: 5 },
    ]);
    expect(JSON.parse(index.serialize()).entries).toHaveLength(5);
  });
});
