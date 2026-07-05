import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HOLOGRAPH_HOLOEMBED_MANIFEST_SCHEMA,
  createHoloGraphHoloEmbedSearchIndexFromManifest,
  readFloat32NpyMatrix,
} from '../HoloGraphHoloEmbedManifest';
import type { EmbeddingProvider } from '../providers/EmbeddingProvider';

class StaticHoloEmbedProvider implements EmbeddingProvider {
  readonly name = 'holoembed-fixture';

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map(() => [1, 0, 0]);
  }
}

describe('HoloGraph/HoloEmbed manifest loader', () => {
  it('loads a portable manifest into a TwoTowerSearchIndex', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holograph-holoembed-'));
    const graphPath = path.join(dir, 'graph.json');
    const nodeEmbPath = path.join(dir, 'nodeemb.npy');
    const manifestPath = path.join(dir, 'manifest.json');

    fs.writeFileSync(
      graphPath,
      JSON.stringify({
        nodes: [
          {
            name: 'target',
            type: 'function',
            language: 'typescript',
            filePath: 'packages/core/src/target.ts',
            line: 7,
            text: 'typescript function target',
          },
          {
            name: 'other',
            type: 'function',
            language: 'typescript',
            filePath: 'packages/core/src/other.ts',
            line: 11,
            text: 'typescript function other',
          },
        ],
      })
    );
    writeFloat32Npy(nodeEmbPath, [
      [1, 0, 0],
      [0, 1, 0],
    ]);
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        schema: HOLOGRAPH_HOLOEMBED_MANIFEST_SCHEMA,
        name: 'fixture',
        scoreMode: 'dot',
        holoGraph: {
          kind: 'HoloGraphIndexedTower',
          graphPath: 'graph.json',
          nodeEmbeddingPath: 'nodeemb.npy',
          nodeEmbeddingFormat: 'npy.float32.row-major.v1',
          nodeCount: 2,
          embeddingDim: 3,
        },
        holoEmbed: {
          kind: 'HoloEmbedQueryTower',
          provider: 'holoembed-fixture',
          embeddingDim: 3,
        },
      })
    );

    const index = await createHoloGraphHoloEmbedSearchIndexFromManifest({
      manifestPath,
      queryProvider: new StaticHoloEmbedProvider(),
    });
    const [first] = await index.search('find target', 2);

    expect(index.size).toBe(2);
    expect(first?.symbol.name).toBe('target');
    expect(first?.score).toBe(1);
  });

  it('rejects non-canonical schemas', async () => {
    await expect(
      createHoloGraphHoloEmbedSearchIndexFromManifest({
        manifest: {
          schema: 'legacy.rgat',
        } as never,
        queryProvider: new StaticHoloEmbedProvider(),
      })
    ).rejects.toThrow(/Unsupported HoloGraph\/HoloEmbed manifest schema/);
  });

  it('parses rank-2 little-endian float32 NPY matrices', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holograph-holoembed-npy-'));
    const nodeEmbPath = path.join(dir, 'nodeemb.npy');
    writeFloat32Npy(nodeEmbPath, [
      [1.5, 2.5],
      [3.5, 4.5],
    ]);

    const matrix = readFloat32NpyMatrix(nodeEmbPath);

    expect(matrix.shape).toEqual([2, 2]);
    expect(Array.from(matrix.data)).toEqual([1.5, 2.5, 3.5, 4.5]);
  });
});

function writeFloat32Npy(filePath: string, rows: number[][]): void {
  const rowCount = rows.length;
  const dim = rows[0]?.length ?? 0;
  const headerBase = `{'descr': '<f4', 'fortran_order': False, 'shape': (${rowCount}, ${dim}), }`;
  const magicLength = 10;
  const padding = 16 - ((magicLength + headerBase.length + 1) % 16);
  const header = `${headerBase}${' '.repeat(padding)}\n`;
  const headerBuffer = Buffer.from(header, 'latin1');
  const prefix = Buffer.alloc(magicLength);
  prefix.write('\x93NUMPY', 0, 'latin1');
  prefix[6] = 1;
  prefix[7] = 0;
  prefix.writeUInt16LE(headerBuffer.length, 8);

  const payload = Buffer.alloc(rowCount * dim * 4);
  let offset = 0;
  for (const row of rows) {
    for (const value of row) {
      payload.writeFloatLE(value, offset);
      offset += 4;
    }
  }

  fs.writeFileSync(filePath, Buffer.concat([prefix, headerBuffer, payload]));
}
