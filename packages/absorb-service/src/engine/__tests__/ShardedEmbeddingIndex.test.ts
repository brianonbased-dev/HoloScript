import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CodebaseGraph } from '../CodebaseGraph';
import { EmbeddingIndex } from '../EmbeddingIndex';
import type { EmbeddingProvider } from '../providers/EmbeddingProvider';
import {
  ShardedEmbeddingIndex,
  readEmbeddingShardManifest,
  shardKeyForPath,
  writeEmbeddingShards,
} from '../ShardedEmbeddingIndex';
import type { ExternalSymbolDefinition } from '../types';

/** Deterministic, text-dependent vectors so rankings are meaningful. */
const provider: EmbeddingProvider = {
  name: 'test-provider',
  getEmbeddings: async (texts: string[]) =>
    texts.map((text) => {
      const v = new Array(16).fill(0);
      for (let i = 0; i < text.length; i++) v[text.charCodeAt(i) % 16] += 1;
      return v;
    }),
};

const AREAS = [
  'packages/core/src',
  'packages/studio/src',
  'services/absorb/src',
  'docs',
  'scripts',
  '',
];
const WORDS = ['parse', 'render', 'absorb', 'graph', 'embed', 'search', 'token', 'scene', 'agent'];

function symbols(): ExternalSymbolDefinition[] {
  const out: ExternalSymbolDefinition[] = [];
  let n = 0;
  for (const area of AREAS) {
    for (let f = 0; f < 4; f++) {
      for (let s = 0; s < 5; s++) {
        const word = WORDS[(n * 7 + f) % WORDS.length];
        const name = `${word}${['Node', 'Tree', 'Index', 'Queue', 'Cache'][s]}${n}`;
        out.push({
          name,
          type: s % 2 ? 'function' : 'class',
          language: f % 2 ? 'typescript' : 'python',
          visibility: 'public',
          filePath: `${area ? `${area}/` : ''}${word}-${f}.ts`,
          line: s + 1,
          column: 1,
          signature: `function ${name}()`,
        });
        n++;
      }
    }
  }
  return out;
}

async function buildIndex(): Promise<EmbeddingIndex> {
  const syms = symbols();
  const index = new EmbeddingIndex({ provider, batchSize: 16, useWorkers: false });
  await index.buildIndex({ getAllSymbols: () => syms } as unknown as CodebaseGraph);
  return index;
}

const strip = (results: Array<{ symbol: ExternalSymbolDefinition; score: number }>) =>
  results.map((r) => `${r.symbol.filePath}#${r.symbol.name}@${r.score}`);

describe('ShardedEmbeddingIndex', () => {
  it('assigns shards by package/service area', () => {
    expect(shardKeyForPath('packages/core/src/a.ts')).toBe('packages/core');
    expect(shardKeyForPath('services\\absorb\\x.ts')).toBe('services/absorb');
    expect(shardKeyForPath('docs/guide.md')).toBe('docs');
    expect(shardKeyForPath('README.md')).toBe('.');
  });

  it('returns exactly what the single index returns, for every search mode, even when shards are evicted mid-query', async () => {
    const whole = await buildIndex();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emb-shards-'));
    const { manifest } = writeEmbeddingShards(whole, dir);
    expect(manifest.shards.length).toBe(6);
    expect(manifest.totalEntries).toBe(whole.size);

    for (const budget of [Number.MAX_SAFE_INTEGER, 1]) {
      const sharded = new ShardedEmbeddingIndex(dir, manifest, {
        indexOptions: { provider },
        memoryBudgetBytes: budget,
      });
      for (const query of ['parse tree', 'absorbIndex12', 'agent queue']) {
        for (const topK of [1, 12]) {
          expect(strip(await sharded.search(query, topK))).toEqual(strip(await whole.search(query, topK)));
          expect(strip(await sharded.searchHybrid(query, topK))).toEqual(
            strip(await whole.searchHybrid(query, topK))
          );
          const filters = { language: 'typescript', type: 'function' };
          expect(strip(await sharded.searchWithFilters(query, topK, filters))).toEqual(
            strip(await whole.searchWithFilters(query, topK, filters))
          );
          expect(strip(await sharded.searchHybridWithFilters(query, topK, { file: 'core' }))).toEqual(
            strip(await whole.searchHybridWithFilters(query, topK, { file: 'core' }))
          );
        }
      }
      if (budget === 1) expect(sharded.residentBytes).toBeLessThanOrEqual(manifest.shards.reduce((m, s) => Math.max(m, s.bytes), 0));
    }
  }, 180_000);

  it('rewrites only shards whose content changed and links the rest', async () => {
    const whole = await buildIndex();
    const first = fs.mkdtempSync(path.join(os.tmpdir(), 'emb-shards-a-'));
    const written = writeEmbeddingShards(whole, first);
    const second = fs.mkdtempSync(path.join(os.tmpdir(), 'emb-shards-b-'));
    const again = writeEmbeddingShards(whole, second, {
      directory: first,
      manifest: readEmbeddingShardManifest(first)!,
    });
    expect(again.rewritten).toBe(0);
    expect(again.linked).toBe(written.manifest.shards.length);
    expect(again.sha256).toBe(written.sha256);
  });

  it('refuses a query provider that did not build the shards', async () => {
    const whole = await buildIndex();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emb-shards-p-'));
    const { manifest } = writeEmbeddingShards(whole, dir);
    expect(
      () =>
        new ShardedEmbeddingIndex(dir, manifest, {
          indexOptions: { provider: { ...provider, name: 'other' } },
        })
    ).toThrow(/built by 'test-provider'/);
  });
});
