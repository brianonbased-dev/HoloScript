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
    expect((4 + metadataBytes) % Float32Array.BYTES_PER_ELEMENT).toBe(0);

    const restored = EmbeddingIndex.deserializeBinary(binary, {
      provider,
      useWorkers: false,
    });
    expect(restored.size).toBe(2);
    expect(JSON.parse(restored.serialize()).entries).toEqual(JSON.parse(index.serialize()).entries);

    // The aligned production format must not allocate a second float payload.
    binary.writeFloatLE(0.5, 4 + metadataBytes);
    expect(JSON.parse(restored.serialize()).entries[0].embedding[0]).toBe(0.5);
  });

  it('keeps legacy unaligned binary payloads readable through the compatibility copy', () => {
    const metadata = {
      version: 2,
      format: 'binary',
      model: provider.name,
      dimension: 3,
      count: 1,
      entries: [
        {
          symbol: {
            name: 'legacy',
            type: 'function',
            filePath: 'src/legacy.ts',
            line: 1,
            column: 1,
            language: 'typescript',
            visibility: 'public',
          },
          text: 'legacy function',
        },
      ],
      marker: '',
    };
    let metadataBuffer = Buffer.from(JSON.stringify(metadata), 'utf8');
    while ((4 + metadataBuffer.length) % Float32Array.BYTES_PER_ELEMENT === 0) {
      metadata.marker += 'x';
      metadataBuffer = Buffer.from(JSON.stringify(metadata), 'utf8');
    }
    const binary = Buffer.alloc(4 + metadataBuffer.length + 3 * Float32Array.BYTES_PER_ELEMENT);
    binary.writeUInt32LE(metadataBuffer.length, 0);
    metadataBuffer.copy(binary, 4);
    const payloadStart = 4 + metadataBuffer.length;
    binary.writeFloatLE(0.25, payloadStart);
    binary.writeFloatLE(-0.5, payloadStart + 4);
    binary.writeFloatLE(1, payloadStart + 8);

    const restored = EmbeddingIndex.deserializeBinary(binary, {
      provider,
      useWorkers: false,
    });
    expect(JSON.parse(restored.serialize()).entries[0].embedding).toEqual([0.25, -0.5, 1]);
  });
});
