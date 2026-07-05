import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HOLOGRAPH_HOLOEMBED_MANIFEST_SCHEMA } from '../engine/HoloGraphHoloEmbedManifest';
import { handleGraphRagTool, resetGraphRAGStateForTests } from './graph-rag-tools';

const originalManifestEnv = process.env.HOLOGRAPH_HOLOEMBED_MANIFEST;

describe('holo_semantic_search HoloGraph/HoloEmbed manifest mode', () => {
  afterEach(() => {
    resetGraphRAGStateForTests();
    if (originalManifestEnv === undefined) {
      delete process.env.HOLOGRAPH_HOLOEMBED_MANIFEST;
    } else {
      process.env.HOLOGRAPH_HOLOEMBED_MANIFEST = originalManifestEnv;
    }
  });

  it('uses an explicit HoloGraph/HoloEmbed manifest without requiring cached GraphRAG state', async () => {
    resetGraphRAGStateForTests();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holograph-holoembed-mcp-'));
    const graphPath = path.join(dir, 'graph.json');
    const nodeEmbPath = path.join(dir, 'nodeemb.npy');
    const manifestPath = path.join(dir, 'manifest.json');
    const dim = 768;

    fs.writeFileSync(
      graphPath,
      JSON.stringify({
        nodes: [
          {
            name: 'target',
            type: 'function',
            language: 'typescript',
            filePath: 'packages/core/src/target.ts',
            line: 3,
            text: 'typescript function target',
          },
        ],
      })
    );
    writeFloat32Npy(nodeEmbPath, [Array.from({ length: dim }, (_, i) => (i === 0 ? 1 : 0))]);
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        schema: HOLOGRAPH_HOLOEMBED_MANIFEST_SCHEMA,
        name: 'mcp fixture',
        holoGraph: {
          kind: 'HoloGraphIndexedTower',
          graphPath: 'graph.json',
          nodeEmbeddingPath: 'nodeemb.npy',
          nodeEmbeddingFormat: 'npy.float32.row-major.v1',
          nodeCount: 1,
          embeddingDim: dim,
        },
        holoEmbed: {
          kind: 'HoloEmbedQueryTower',
          provider: 'holoembed',
          embeddingDim: dim,
        },
      })
    );

    const result = (await handleGraphRagTool('holo_semantic_search', {
      query: 'target',
      topK: 1,
      holoGraphHoloEmbedManifest: manifestPath,
    })) as {
      indexSource?: string;
      holoGraphHoloEmbedManifest?: string;
      count?: number;
      results?: Array<{ name?: string }>;
    };

    expect(result.indexSource).toBe('holograph-holoembed-manifest');
    expect(result.holoGraphHoloEmbedManifest).toBe(manifestPath);
    expect(result.count).toBe(1);
    expect(result.results?.[0]?.name).toBe('target');
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
