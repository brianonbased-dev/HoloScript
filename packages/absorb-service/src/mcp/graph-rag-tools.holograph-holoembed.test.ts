import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_HOLOGRAPH_HOLOEMBED_RELEASE_MANIFEST,
  HOLOGRAPH_HOLOEMBED_MANIFEST_SCHEMA,
} from '../engine/HoloGraphHoloEmbedManifest';
import type { GraphRAGEngine } from '../engine/GraphRAGEngine';
import type { SymbolSearchIndex } from '../engine/SearchIndex';
import {
  handleGraphRagTool,
  resetGraphRAGStateForTests,
  setGraphRAGState,
} from './graph-rag-tools';

const originalManifestEnv = process.env.HOLOGRAPH_HOLOEMBED_MANIFEST;
const originalManifestArgEnv = process.env.HOLOGRAPH_HOLOEMBED_MANIFEST_ARG;
const originalAiEcosystemRootEnv = process.env.AI_ECOSYSTEM_ROOT;
const originalHoloEcosystemRootEnv = process.env.HOLO_ECOSYSTEM_ROOT;
const originalEcosystemRootEnv = process.env.ECOSYSTEM_ROOT;

describe('holo_semantic_search HoloGraph/HoloEmbed manifest mode', () => {
  afterEach(() => {
    resetGraphRAGStateForTests();
    if (originalManifestEnv === undefined) {
      delete process.env.HOLOGRAPH_HOLOEMBED_MANIFEST;
    } else {
      process.env.HOLOGRAPH_HOLOEMBED_MANIFEST = originalManifestEnv;
    }
    if (originalManifestArgEnv === undefined) {
      delete process.env.HOLOGRAPH_HOLOEMBED_MANIFEST_ARG;
    } else {
      process.env.HOLOGRAPH_HOLOEMBED_MANIFEST_ARG = originalManifestArgEnv;
    }
    if (originalAiEcosystemRootEnv === undefined) {
      delete process.env.AI_ECOSYSTEM_ROOT;
    } else {
      process.env.AI_ECOSYSTEM_ROOT = originalAiEcosystemRootEnv;
    }
    if (originalHoloEcosystemRootEnv === undefined) {
      delete process.env.HOLO_ECOSYSTEM_ROOT;
    } else {
      process.env.HOLO_ECOSYSTEM_ROOT = originalHoloEcosystemRootEnv;
    }
    if (originalEcosystemRootEnv === undefined) {
      delete process.env.ECOSYSTEM_ROOT;
    } else {
      process.env.ECOSYSTEM_ROOT = originalEcosystemRootEnv;
    }
  });

  // 7qz0: the argument names a file on the server. A caller may not, unless the operator
  // allows it, and the refusal comes before any read: no "no such file", no parse error
  // quoting the file, no schema echo, no hash of a listed file.
  it('refuses a caller-named manifest before reading anything, unless the operator allows it', async () => {
    resetGraphRAGStateForTests();
    delete process.env.HOLOGRAPH_HOLOEMBED_MANIFEST_ARG;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holograph-holoembed-refuse-'));
    const secretFile = path.join(dir, 'server-secret.env');
    fs.writeFileSync(secretFile, 'SECRET_KEY=do-not-leak\n');
    const missing = path.join(dir, 'does-not-exist.json');

    for (const named of [secretFile, missing, '../../etc/hosts', 'relative/manifest.json']) {
      const result = (await handleGraphRagTool('holo_semantic_search', {
        query: 'target',
        holoGraphHoloEmbedManifest: named,
      })) as { error?: string; hint?: string; results?: unknown };
      expect(result.results).toBeUndefined();
      expect(result.error).toMatch(/names a file on this server/);
      // The raw strings, not JSON.stringify: that doubles Windows backslashes and would
      // hide an echoed path.
      const said = Object.values(result)
        .filter((value): value is string => typeof value === 'string')
        .join('\n');
      expect(said).not.toContain('SECRET_KEY');
      expect(said).not.toContain(named);
      expect(said).not.toMatch(/ENOENT|no such file|not valid JSON/i);
    }
  });

  it('uses an explicit HoloGraph/HoloEmbed manifest without requiring cached GraphRAG state', async () => {
    resetGraphRAGStateForTests();
    // A single-user local server whose operator allows callers to name the manifest.
    process.env.HOLOGRAPH_HOLOEMBED_MANIFEST_ARG = 'allow';
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

    // The operator's own HOLOGRAPH_HOLOEMBED_MANIFEST needs no switch: it is not a caller's choice.
    delete process.env.HOLOGRAPH_HOLOEMBED_MANIFEST_ARG;
    process.env.HOLOGRAPH_HOLOEMBED_MANIFEST = manifestPath;
    resetGraphRAGStateForTests();
    const viaOperator = (await handleGraphRagTool('holo_semantic_search', {
      query: 'target',
      topK: 1,
    })) as { indexSource?: string; results?: Array<{ name?: string }> };
    expect(viaOperator.indexSource).toBe('holograph-holoembed-manifest');
    expect(viaOperator.results?.[0]?.name).toBe('target');
  });

  it('fails closed when the promoted local release does not declare the pinned HoloEmbed student hash', async () => {
    resetGraphRAGStateForTests();
    delete process.env.HOLOGRAPH_HOLOEMBED_MANIFEST;
    delete process.env.HOLO_ECOSYSTEM_ROOT;
    delete process.env.ECOSYSTEM_ROOT;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'holograph-holoembed-default-mcp-'));
    process.env.AI_ECOSYSTEM_ROOT = root;
    const manifestPath = path.join(root, DEFAULT_HOLOGRAPH_HOLOEMBED_RELEASE_MANIFEST);
    const dir = path.dirname(manifestPath);
    const graphPath = path.join(dir, 'graph.json');
    const nodeEmbPath = path.join(dir, 'nodeemb.npy');
    const dim = 768;
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(
      graphPath,
      JSON.stringify({
        nodes: [
          {
            name: 'defaultTarget',
            type: 'function',
            language: 'typescript',
            filePath: 'packages/core/src/default-target.ts',
            line: 5,
            text: 'typescript function default target',
          },
        ],
      })
    );
    writeFloat32Npy(nodeEmbPath, [Array.from({ length: dim }, (_, i) => (i === 0 ? 1 : 0))]);
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        schema: HOLOGRAPH_HOLOEMBED_MANIFEST_SCHEMA,
        name: 'default mcp fixture',
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
      query: 'default target',
      topK: 1,
    })) as {
      error?: string;
      hint?: string;
    };

    expect(result.error).toMatch(/default student sha256 mismatch/);
    expect(result.error).toContain(manifestPath);
  });

  it('can force the current absorbed index even when a promoted manifest exists', async () => {
    resetGraphRAGStateForTests();
    delete process.env.HOLOGRAPH_HOLOEMBED_MANIFEST;
    delete process.env.HOLO_ECOSYSTEM_ROOT;
    delete process.env.ECOSYSTEM_ROOT;

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'holograph-holoembed-cached-mcp-'));
    process.env.AI_ECOSYSTEM_ROOT = root;
    const manifestPath = path.join(root, DEFAULT_HOLOGRAPH_HOLOEMBED_RELEASE_MANIFEST);
    const dir = path.dirname(manifestPath);
    const graphPath = path.join(dir, 'graph.json');
    const nodeEmbPath = path.join(dir, 'nodeemb.npy');
    const dim = 768;
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(
      graphPath,
      JSON.stringify({
        nodes: [
          {
            name: 'manifestTarget',
            type: 'function',
            language: 'typescript',
            filePath: 'packages/core/src/manifest-target.ts',
            line: 5,
            text: 'typescript function manifest target',
          },
        ],
      })
    );
    writeFloat32Npy(nodeEmbPath, [Array.from({ length: dim }, (_, i) => (i === 0 ? 1 : 0))]);
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        schema: HOLOGRAPH_HOLOEMBED_MANIFEST_SCHEMA,
        name: 'default mcp fixture',
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

    const cachedIndex: SymbolSearchIndex = {
      search: async () => [
        {
          symbol: {
            name: 'cachedTarget',
            type: 'function',
            filePath: 'packages/core/src/cached-target.ts',
            line: 9,
            column: 1,
            language: 'typescript',
            visibility: 'public',
          },
          score: 1,
          file: 'packages/core/src/cached-target.ts',
          type: 'function',
        },
      ],
      searchWithFilters: async () => [],
    };
    setGraphRAGState(cachedIndex, {} as unknown as GraphRAGEngine);

    const result = (await handleGraphRagTool('holo_semantic_search', {
      query: 'cached target',
      topK: 1,
      useCachedAbsorbIndex: true,
    })) as {
      indexSource?: string;
      holoGraphHoloEmbedManifest?: string;
      count?: number;
      results?: Array<{ name?: string }>;
    };

    expect(result.indexSource).toBe('cached-embedding-index');
    expect(result.holoGraphHoloEmbedManifest).toBeUndefined();
    expect(result.count).toBe(1);
    expect(result.results?.[0]?.name).toBe('cachedTarget');
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
