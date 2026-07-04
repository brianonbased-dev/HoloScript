#!/usr/bin/env node
/**
 * holo-graph — operate HoloGraph + HoloEmbed on the laptop (sovereign, local).
 *
 * The code-graph of the repo you are actively working is a hot working-set:
 * it lives LOCAL for low-latency semantic-ask, refreshed as you work, using the
 * sovereign HoloEmbed provider (no external embedding services). Persists to the
 * default cache (~/.holoscript) so it survives across sessions and processes.
 *
 *   node scripts/holo-graph.mjs refresh [rootDir]     # (re)absorb -> persist
 *   node scripts/holo-graph.mjs ask "<query>" [topK]  # semantic-ask the persisted graph
 *
 * Run from the HoloScript repo root so the workspace package resolves.
 */
import os from 'node:os';
import path from 'node:path';

process.env.EMBEDDING_PROVIDER = 'holoembed'; // sovereign; policy forbids external providers
const CACHE_DIR = process.env.HOLOSCRIPT_CACHE_DIR || path.join(os.homedir(), '.holoscript');
process.env.HOLOSCRIPT_CACHE_DIR = CACHE_DIR;

const [cmd, ...rest] = process.argv.slice(2);
const REPO = 'C:/Users/Josep/Documents/GitHub/HoloScript';

const { handleCodebaseTool } = await import('@holoscript/absorb-service/mcp');
const { handleGraphRagTool } = await import('@holoscript/absorb-service/mcp');

const parse = (x) => (typeof x === 'string' ? JSON.parse(x) : x);

async function refresh(rootDir = REPO, maxFiles = 2500) {
  const t0 = Date.now();
  console.log(`[holo-graph] refresh: absorbing ${rootDir}`);
  console.log(`[holo-graph] cache: ${CACHE_DIR}  provider: holoembed`);
  const res = parse(await handleCodebaseTool('holo_absorb_repo', {
    rootDir,
    embeddingProvider: 'holoembed',
    maxFiles,
    force: true, // bypass incremental/cache reuse — always a full fresh scan
  }));
  const stats = res?.stats || res?.graph?.stats || {};
  console.log(`[holo-graph] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`[holo-graph] files=${stats.totalFiles ?? '?'} symbols=${stats.totalSymbols ?? '?'} ` +
              `langs=${JSON.stringify(stats.filesByLanguage ?? {})}`);
  const st = parse(await handleCodebaseTool('holo_graph_status', {}));
  console.log(`[holo-graph] status: ready=${st?.graphRAGReady} authoritative=${st?.graphAuthoritative} ` +
              `fresh=${st?.freshForCurrentRepo}`);
}

async function ask(query, topK = 8) {
  if (!query) { console.error('usage: ask "<query>" [topK]'); process.exit(1); }
  // Warm the graph-rag state from the persisted cache. graph_status does NOT
  // trigger the auto-load (shouldAutoLoadGraph returns false for it); any other
  // codebase tool runs ensureCachedGraph() -> loadEmbeddingsCache -> setGraphRAGState
  // *before* its switch, so this warms state even though the query args are a no-op.
  await handleCodebaseTool('holo_query_codebase', { query: '__warm__' }).catch(() => {});
  const st = parse(await handleCodebaseTool('holo_graph_status', {}));
  console.log(`[holo-graph] loaded cache: ready=${st?.graphRAGReady} ` +
              `symbols=${st?.diskCache?.stats?.totalSymbols ?? '?'} age=${st?.diskCache?.ageHuman ?? '?'}`);
  const r = parse(await handleGraphRagTool('holo_semantic_search', { query, topK: Number(topK) }));
  const results = r?.results || r?.matches || (Array.isArray(r) ? r : []);
  console.log(`[holo-graph] semantic-ask: ${JSON.stringify(query)}  (${results.length} hits)`);
  for (const h of results.slice(0, topK)) {
    const file = (h.file || h.filePath || h.path || '?').replace(REPO + '/', '').replace(REPO, '');
    console.log(`  ${Number(h.score ?? h.similarity ?? 0).toFixed(3)}  ${file}:${h.line ?? h.startLine ?? ''}  ${h.symbol || h.name || ''}`);
  }
}

if (cmd === 'refresh') await refresh(rest[0], rest[1] ? Number(rest[1]) : 2500);
else if (cmd === 'ask') await ask(rest[0], rest[1] ?? 8);
else { console.error('usage: holo-graph.mjs <refresh [rootDir] | ask "<query>" [topK]>'); process.exit(1); }
