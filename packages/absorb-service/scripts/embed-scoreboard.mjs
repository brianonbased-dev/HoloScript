#!/usr/bin/env node
/**
 * embed-scoreboard — the "outbuild" gate for native code semantic search.
 *
 * HoloEmbed + HoloGraph are meant to BE a sovereign nomic/openai-like embedding
 * and OUTBUILD them (F.134). You cannot outbuild what you do not measure. This
 * scoreboard runs a curated set of PARAPHRASE code-search queries (the query
 * words deliberately do NOT overlap the target symbol's identifier) against the
 * REAL `holo_semantic_search` path for each provider, and reports recall@k + MRR.
 *
 *   node scripts/embed-scoreboard.mjs                 # holoembed vs ollama(nomic)
 *   node scripts/embed-scoreboard.mjs holoembed ollama
 *
 * Ground truth is the target FILE (a query is "hit@k" if the target file appears
 * in the top-k results). Run from the HoloScript repo root.
 */
import os from 'node:os';
import path from 'node:path';
process.env.HOLOSCRIPT_CACHE_DIR = process.env.HOLOSCRIPT_CACHE_DIR || path.join(os.homedir(), '.holoscript');

const { handleCodebaseTool, handleGraphRagTool } = await import('@holoscript/absorb-service/mcp');
const parse = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
const ROOT = 'C:/Users/Josep/Documents/GitHub/HoloScript/packages/absorb-service/src/engine';

// Paraphrase queries: NL intent with NO surface-word overlap with the target
// identifier, so lexical trigram matching cannot win by accident. `target` is a
// filename substring the correct symbol lives in.
const GROUND_TRUTH = [
  { q: 'group related files into clusters', target: 'CommunityDetector' },
  { q: 'lay out nodes in three dimensional space', target: 'ForceDirectedLayout' },
  { q: 'convert a piece of code into a numeric vector', target: 'EmbeddingIndex' },
  { q: 'figure out which files changed since the last run', target: 'GitChangeDetector' },
  { q: 'walk the syntax tree and pull out declarations', target: 'TreeSitterTraitAdapter' },
  { q: 'render the graph as a navigable 3d scene', target: 'CodebaseSceneCompiler' },
  { q: 'turn the codebase into a holoscript world', target: 'HoloEmitter' },
  { q: 'answer a natural language question about the code', target: 'GraphRAGEngine' },
  { q: 'measure how tangled and complex the code is', target: 'ClaimNetworkGraph' },
  { q: 'store the parsed symbols and their relationships', target: 'CodebaseGraph' },
  { q: 'read every file in a directory tree', target: 'CodebaseScanner' },
  { q: 'flag code that is no longer used anywhere', target: 'DeprecatedInventory' },
];

const K = [1, 5, 10];

async function scoreProvider(provider) {
  await handleCodebaseTool('holo_absorb_repo', {
    rootDir: ROOT, embeddingProvider: provider, maxFiles: 2000, force: true, outputFormat: 'stats',
  });
  const rows = [];
  let mrrSum = 0;
  const hits = { 1: 0, 5: 0, 10: 0 };
  for (const { q, target } of GROUND_TRUTH) {
    const r = parse(await handleGraphRagTool('holo_semantic_search', { query: q, topK: 10 }));
    const results = r?.results || r?.matches || [];
    const files = results.map((h) => (h.file || h.filePath || h.path || '').split(/[\\/]/).pop());
    const rank = files.findIndex((f) => f && f.includes(target)) + 1; // 1-based, 0 = miss
    rows.push({ q, target, rank: rank || null });
    if (rank) { mrrSum += 1 / rank; for (const k of K) if (rank <= k) hits[k]++; }
  }
  const n = GROUND_TRUTH.length;
  return { rows, mrr: mrrSum / n, recall: Object.fromEntries(K.map((k) => [k, hits[k] / n])) };
}

const [pa, pb] = [process.argv[2] || 'holoembed', process.argv[3] || 'ollama'];
console.error(`\n=== EMBED SCOREBOARD — ${pa} vs ${pb} (${GROUND_TRUTH.length} paraphrase queries) ===\n`);
const A = await scoreProvider(pa);
const B = await scoreProvider(pb);

const pad = (s, n) => String(s).padEnd(n);
console.error(pad('query', 46) + pad(`${pa} rank`, 14) + `${pb} rank`);
console.error('-'.repeat(46 + 14 + 12));
for (let i = 0; i < GROUND_TRUTH.length; i++) {
  const ra = A.rows[i].rank ?? '—'; const rb = B.rows[i].rank ?? '—';
  const win = A.rows[i].rank && B.rows[i].rank ? (A.rows[i].rank < B.rows[i].rank ? ' ◀' : A.rows[i].rank > B.rows[i].rank ? ' ▶' : '') : (A.rows[i].rank ? ' ◀' : B.rows[i].rank ? ' ▶' : '');
  console.error(pad(GROUND_TRUTH[i].q.slice(0, 44), 46) + pad(ra, 14) + pad(rb, 10) + win);
}
console.error('-'.repeat(72));
const fmt = (s) => `R@1=${(s.recall[1] * 100).toFixed(0)}%  R@5=${(s.recall[5] * 100).toFixed(0)}%  R@10=${(s.recall[10] * 100).toFixed(0)}%  MRR=${s.mrr.toFixed(3)}`;
console.error(`${pad(pa, 12)} ${fmt(A)}`);
console.error(`${pad(pb, 12)} ${fmt(B)}`);
console.error(`\n◀ = ${pa} ranked the target higher   ▶ = ${pb} did`);
