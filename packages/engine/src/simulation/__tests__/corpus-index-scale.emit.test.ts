/**
 * corpus-index-scale.emit.test.ts — end-to-end P3 scale validation. INERT unless
 * EMIT_CORPUS_SCALE=1. Builds the full ingested arXiv corpus index once and runs real
 * queries, writing a results summary. Proves the pipeline works at 10^3 scale.
 *
 *   cd packages/engine
 *   EMIT_CORPUS_SCALE=1 npx vitest run src/simulation/__tests__/corpus-index-scale.emit.test.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assessSemanticNoveltyIndexed, buildSemanticCorpusIndex } from '../SemanticCorpusIndex';
import type { ConjecturePriorArtEntry } from '../ConjectureEngine';

const ENABLED = process.env.EMIT_CORPUS_SCALE === '1';
const CORPUS = join(process.cwd(), '..', '..', 'scripts', 'conjecture-corpus', 'corpus.arxiv.json');
const OUT = join(process.cwd(), '..', '..', 'scripts', 'conjecture-corpus', 'corpus-scale-results.json');

describe('semantic corpus index — full-scale validation (P3)', () => {
  it(ENABLED ? 'builds the full arXiv index and runs real queries' : 'inert unless EMIT_CORPUS_SCALE=1', async (ctx) => {
    if (!ENABLED) return ctx.skip();
    const corpus = (JSON.parse(readFileSync(CORPUS, 'utf8')).entries) as ConjecturePriorArtEntry[];
    const t0 = Date.now();
    const index = await buildSemanticCorpusIndex(corpus);
    const buildMs = Date.now() - t0;

    const queries = [
      // a paraphrase of a classic result (likely present in a math corpus in some form)
      'Every convex polyhedron satisfies vertices minus edges plus faces equals two.',
      // a genuinely HoloScript-native claim that should NOT be in an arXiv math corpus
      'Agent worldlines form a braid whose word determines hash-equal shared world state.',
    ];
    const results = [];
    for (const q of queries) {
      const tq = Date.now();
      const a = await assessSemanticNoveltyIndexed(q, index);
      results.push({
        query: q,
        status: a.status,
        queryMs: Date.now() - tq,
        nearestId: a.nearest?.priorArtId ?? null,
        nearestSim: a.nearest ? Math.round(a.nearest.similarity * 1000) / 1000 : null,
        nearestTitle: a.nearest?.title ?? null,
      });
    }
    writeFileSync(OUT, JSON.stringify({ corpusSize: index.entries.length, dim: index.dim, buildMs, results }, null, 2), 'utf8');
    expect(index.entries.length).toBe(corpus.length);
  }, 600_000);
});
