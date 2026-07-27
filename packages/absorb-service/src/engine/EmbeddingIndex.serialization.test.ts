import { describe, expect, it } from 'vitest';
import { EmbeddingIndex } from './EmbeddingIndex';
import type { EmbeddingProvider } from './providers/EmbeddingProvider';

const provider: EmbeddingProvider = {
  name: 'serialization-test',
  async getEmbeddings(texts) {
    return texts.map(() => [0, 0, 0]);
  },
};

describe('EmbeddingIndex binary serialization', () => {
  it('round-trips metadata and contiguous float payloads', () => {
    const index = EmbeddingIndex.deserialize(
      JSON.stringify({
        version: 1,
        model: provider.name,
        entries: [
          {
            symbol: {
              name: 'alpha',
              type: 'function',
              filePath: 'src/alpha.ts',
              line: 1,
              column: 1,
              language: 'typescript',
              visibility: 'public',
            },
            text: 'alpha function',
            embedding: [0.25, -0.5, 1],
          },
          {
            symbol: {
              name: 'beta',
              type: 'class',
              filePath: 'src/beta.ts',
              line: 2,
              column: 1,
              language: 'typescript',
              visibility: 'internal',
            },
            text: 'beta class',
            embedding: [-1, 0.125, 0.75],
          },
        ],
      }),
      { provider, useWorkers: false }
    );

    const binary = index.serializeBinary();
    const metadataBytes = binary.readUInt32LE(0);
    const metadata = JSON.parse(binary.subarray(4, 4 + metadataBytes).toString('utf-8'));
    expect(metadata).toMatchObject({
      version: 2,
      format: 'binary',
      model: provider.name,
      dimension: 3,
      count: 2,
    });
    expect(binary.length).toBe(4 + metadataBytes + 2 * 3 * Float32Array.BYTES_PER_ELEMENT);

    const restored = EmbeddingIndex.deserializeBinary(binary, {
      provider,
      useWorkers: false,
    });
    expect(restored.size).toBe(2);
    expect(JSON.parse(restored.serialize()).entries).toEqual(
      JSON.parse(index.serialize()).entries
    );
  });
});
