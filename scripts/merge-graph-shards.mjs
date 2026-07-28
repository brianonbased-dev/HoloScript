#!/usr/bin/env node
/**
 * merge-graph-shards.mjs — combine per-package graph shards into ONE unified
 * codebase cache the always-on MCP anchor can fast-hydrate from disk.
 *
 * Input:  <shardsRoot>/manifest.json + <shardsRoot>/<shard>/{graph-cache.json,embeddings-cache.bin}
 * Output: <HOLOSCRIPT_CACHE_DIR>/{graph-cache.json,embeddings-cache.bin}
 *
 * Sovereignty: holoembed-only. The script never re-embeds; it byte-concats the
 * float32 payloads the shards already hold (disjoint packages → no duplicate
 * symbols → no dedup). Shard `.bin` model must be 'holoembed'; a non-holoembed
 * shard aborts the merge (never silently mixes embedding spaces).
 *
 * .bin byte format (EmbeddingIndex.serializeBinary, engine/EmbeddingIndex.ts:509):
 *   [4-byte LE metaLen][meta JSON][float32 LE payload]
 *   meta = { version:2, format:'binary', model, dimension, count, entries:[{symbol,text}] }
 *   payload = count * dimension float32, in entries order.
 *
 * graph cache envelope (saveGraphCache, mcp/codebase-tools.ts:516):
 *   { version:2, rootDir, timestamp, stats, graphJson, gitCommitHash, fileHashes,
 *     embeddingProvider, embeddingPolicy }
 *   graphJson = JSON.stringify({ version:2, rootDir, files:[...], communities, ... })
 *
 * Usage:
 *   HOLOSCRIPT_CACHE_DIR=C:/Users/josep/.holoscript/.merged-test \
 *     node scripts/merge-graph-shards.mjs \
 *       --shards C:/Users/josep/.holoscript/graph-shards \
 *       --root   C:/Users/Josep/Documents/GitHub/HoloScript
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

// ── args ──────────────────────────────────────────────────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const REPO_ROOT = arg(
  'root',
  process.env.MERGE_REPO_ROOT || 'C:/Users/Josep/Documents/GitHub/HoloScript'
);
const SHARDS_ROOT = arg(
  'shards',
  process.env.MERGE_SHARDS_ROOT || 'C:/Users/josep/.holoscript/graph-shards'
);
const CACHE_DIR = process.env.HOLOSCRIPT_CACHE_DIR || arg('out', null);

if (!CACHE_DIR) {
  console.error(
    'FATAL: set HOLOSCRIPT_CACHE_DIR (or --out) to the destination cache dir. Refusing to guess.'
  );
  process.exit(1);
}

const NATIVE_PROVIDER = 'holoembed';

const outGraphFile = path.join(CACHE_DIR, 'graph-cache.json');
const outBinFile = path.join(CACHE_DIR, 'embeddings-cache.bin');

fs.mkdirSync(CACHE_DIR, { recursive: true });

// ── load the embedding-policy receipt from the compiled engine ─────────────
// Reuse the canonical receipt builder so the merged envelope carries the same
// sovereignty attestation a live absorb would write.
async function loadEmbeddingPolicyReceipt() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(REPO_ROOT, 'packages/absorb-service/dist/mcp/graph-rag-embedding-policy.js'),
    path.join(here, '../packages/absorb-service/dist/mcp/graph-rag-embedding-policy.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const mod = await import(pathToFileURL(c).href);
      if (typeof mod.buildGraphRAGEmbeddingPolicyReceipt === 'function') {
        return mod.buildGraphRAGEmbeddingPolicyReceipt();
      }
    }
  }
  // Fallback: inline the receipt VERBATIM from graph-rag-embedding-policy.ts:54.
  // The source is bundled into codebase-tools.js (no standalone dist module), so
  // this literal is the canonical receipt; keep it byte-identical to the source.
  console.warn('[merge] policy module not exported standalone; using inline canonical receipt');
  return {
    schemaVersion: 'holoscript.graphrag.embedding-policy.v1',
    kind: 'GraphRAGEmbeddingPolicy',
    provider: NATIVE_PROVIDER,
    acceptedAliases: ['structural'],
    externalProvidersAllowed: false,
    externalFallbacksAllowed: false,
    policy:
      'HoloScript GraphRAG uses HoloGraph plus HoloEmbed, or a sovereign LOCAL learned encoder (Ollama at a loopback URL, e.g. nomic-embed-text), for every project. External/cloud embedding providers are disabled, and the cache rejects any index built by a different provider, so mixed embedding spaces cannot enter shared GraphRAG caches.',
  };
}

function gitHead(root) {
  try {
    return execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
  } catch (err) {
    console.warn(`[merge] git rev-parse failed: ${err.message}`);
    return undefined;
  }
}

// ── read manifest ───────────────────────────────────────────────────────────
const manifestPath = path.join(SHARDS_ROOT, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`FATAL: manifest not found at ${manifestPath}`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const shards = manifest.shards.filter((s) => s.status === 'done');
console.log(`[merge] ${shards.length}/${manifest.shards.length} shards done`);

const manifestSymbolSum = shards.reduce((n, s) => n + (s.stats?.totalSymbols ?? 0), 0);
const manifestFileSum = shards.reduce((n, s) => n + (s.stats?.totalFiles ?? 0), 0);

// ═══════════════════════════════════════════════════════════════════════════
// PASS 1 — read each shard header, collect meta.entries + payload byte ranges,
//          concatenate graph files[]. Vectors are NOT loaded into JS heap here.
// ═══════════════════════════════════════════════════════════════════════════
const mergedEntries = []; // { symbol, text }  (small; no vectors)
const binPlan = []; // { file, payloadStart, payloadBytes }
let dimension = null;
let embeddingCount = 0;

// Graph files are written to the output graph file incrementally to keep the
// 0.43 GB of graph JSON off a single giant in-memory string.
let graphFileCount = 0;
let graphSymbolCount = 0; // sum of symbols[] across every file in every shard graph
const communities = {};

// We stream the graphJson string into a temp file, then wrap it as the
// `graphJson` string value of the envelope (escaped) via a second streaming pass.
const tmpGraphFilesPath = path.join(CACHE_DIR, `.merge-files-${process.pid}.jsonl`);
const filesStream = fs.createWriteStream(tmpGraphFilesPath, { encoding: 'utf-8' });

function writeFilesChunk(chunk) {
  return new Promise((resolve, reject) => {
    if (!filesStream.write(chunk)) filesStream.once('drain', resolve);
    else resolve();
    filesStream.once('error', reject);
  });
}

for (const shard of shards) {
  const graphPath = path.join(shard.cacheDir, 'graph-cache.json');
  const binPath = path.join(shard.cacheDir, 'embeddings-cache.bin');
  if (!fs.existsSync(graphPath) || !fs.existsSync(binPath)) {
    console.error(`FATAL: shard ${shard.name} missing cache files`);
    process.exit(1);
  }

  // --- .bin header (read only the header + meta, not the payload) ---
  const fd = fs.openSync(binPath, 'r');
  const head4 = Buffer.alloc(4);
  fs.readSync(fd, head4, 0, 4, 0);
  const metaLen = head4.readUInt32LE(0);
  const metaBuf = Buffer.alloc(metaLen);
  fs.readSync(fd, metaBuf, 0, metaLen, 4);
  fs.closeSync(fd);
  const meta = JSON.parse(metaBuf.toString('utf-8'));

  if (meta.model !== NATIVE_PROVIDER) {
    console.error(
      `FATAL: shard ${shard.name} .bin model is '${meta.model}', expected '${NATIVE_PROVIDER}'. ` +
        'Refusing to mix embedding spaces.'
    );
    process.exit(1);
  }
  if (dimension === null) dimension = meta.dimension;
  else if (dimension !== meta.dimension) {
    console.error(
      `FATAL: shard ${shard.name} dimension ${meta.dimension} != ${dimension}. Aborting.`
    );
    process.exit(1);
  }

  const payloadStart = 4 + metaLen;
  const binSize = fs.statSync(binPath).size;
  const payloadBytes = binSize - payloadStart;
  const expectedPayload = meta.count * meta.dimension * 4;
  if (payloadBytes !== expectedPayload) {
    console.error(
      `FATAL: shard ${shard.name} payload ${payloadBytes} != expected ${expectedPayload} ` +
        `(count ${meta.count} * dim ${meta.dimension} * 4). Corrupt/misaligned .bin.`
    );
    process.exit(1);
  }

  for (const e of meta.entries) mergedEntries.push(e);
  binPlan.push({ file: binPath, payloadStart, payloadBytes });
  embeddingCount += meta.count;

  // --- graph files[] ---
  const env = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
  const g = JSON.parse(env.graphJson);
  const files = g.files ?? [];
  for (const f of files) {
    await writeFilesChunk((graphFileCount === 0 ? '' : ',') + JSON.stringify(f));
    graphFileCount++;
    graphSymbolCount += Array.isArray(f.symbols) ? f.symbols.length : 0;
  }
  if (g.communities && typeof g.communities === 'object') {
    for (const [k, v] of Object.entries(g.communities)) communities[k] = v;
  }

  console.log(
    `[merge] ${shard.name.padEnd(38)} symbols=${String(meta.count).padStart(7)} ` +
      `files=${String(files.length).padStart(5)} payload=${(payloadBytes / 1e6).toFixed(1)}MB`
  );
}

await new Promise((resolve, reject) => {
  filesStream.end(resolve);
  filesStream.once('error', reject);
});

console.log(
  `[merge] PASS 1 done: entries=${mergedEntries.length} embeddingCount=${embeddingCount} ` +
    `graphFiles=${graphFileCount} graphSymbols=${graphSymbolCount} dim=${dimension}`
);

// ── integrity: parity between the two channels ──────────────────────────────
if (mergedEntries.length !== embeddingCount) {
  console.error(`FATAL: mergedEntries ${mergedEntries.length} != embeddingCount ${embeddingCount}`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// WRITE .bin — [4-byte metaLen][meta JSON][payload...], payloads streamed.
// ═══════════════════════════════════════════════════════════════════════════
const mergedMeta = {
  version: 2,
  format: 'binary',
  model: NATIVE_PROVIDER,
  dimension,
  count: mergedEntries.length,
  entries: mergedEntries,
};
const metaJson = Buffer.from(JSON.stringify(mergedMeta), 'utf-8');
const header = Buffer.alloc(4);
header.writeUInt32LE(metaJson.length);

const binTmp = `${outBinFile}.tmp-${process.pid}`;
const binOut = fs.createWriteStream(binTmp);
// We pipe 83 read streams into this one write stream sequentially; each pipe()
// transiently registers handlers on the dest. That is expected, not a leak —
// disable the MaxListeners heuristic for this stream.
binOut.setMaxListeners(0);
// Single reject-latch for the write stream: one error listener for the whole
// run (avoids the MaxListeners warning from re-adding per shard).
let binOutError = null;
binOut.on('error', (err) => {
  binOutError = err;
});
function binWrite(buf) {
  return new Promise((resolve, reject) => {
    binOut.write(buf, (err) => (err ? reject(err) : resolve()));
  });
}
await binWrite(header);
await binWrite(metaJson);

let payloadWritten = 0;
for (const p of binPlan) {
  await new Promise((resolve, reject) => {
    if (binOutError) return reject(binOutError);
    const rs = fs.createReadStream(p.file, {
      start: p.payloadStart,
      end: p.payloadStart + p.payloadBytes - 1,
    });
    rs.on('data', (chunk) => {
      payloadWritten += chunk.length;
    });
    // pipe with end:false keeps binOut open across shards; pipe() manages
    // backpressure internally without accumulating drain listeners.
    rs.pipe(binOut, { end: false });
    rs.on('end', () => (binOutError ? reject(binOutError) : resolve()));
    rs.on('error', reject);
  });
}
await new Promise((resolve, reject) => {
  binOut.end(() => (binOutError ? reject(binOutError) : resolve()));
});
fs.renameSync(binTmp, outBinFile);

const expectedPayloadTotal = mergedEntries.length * dimension * 4;
if (payloadWritten !== expectedPayloadTotal) {
  console.error(`FATAL: streamed payload ${payloadWritten} != expected ${expectedPayloadTotal}`);
  process.exit(1);
}
const finalBinSize = fs.statSync(outBinFile).size;
console.log(
  `[merge] wrote ${outBinFile} (${(finalBinSize / 1e9).toFixed(3)} GB, ` +
    `header+meta ${4 + metaJson.length} B, payload ${payloadWritten} B)`
);

// ═══════════════════════════════════════════════════════════════════════════
// WRITE graph-cache.json — stream envelope with graphJson as an embedded string.
// graphJson = {"version":2,"rootDir":...,"files":[<streamed>],"communities":...}
// We build graphJson by streaming: prefix, temp files jsonl content, suffix,
// then wrap the whole graphJson string (JSON-escaped) into the envelope.
// ═══════════════════════════════════════════════════════════════════════════
const policyReceipt = await loadEmbeddingPolicyReceipt();
const headCommit = gitHead(REPO_ROOT);
const timestamp = Date.now();

const stats = {
  totalFiles: graphFileCount,
  totalSymbols: graphSymbolCount,
  totalShards: shards.length,
};

// Assemble the graphJson string. The files body lives in the temp jsonl file
// as `<f0>,<f1>,...` (already comma-joined). We read it once — 0.43 GB fits
// comfortably in the raised heap; if it ever doesn't, switch to a chunked
// escape-stream. Reading as one string is the simplest correct path here.
const filesBody = fs.readFileSync(tmpGraphFilesPath, 'utf-8');
const graphObjPrefix = `{"version":2,"rootDir":${JSON.stringify(REPO_ROOT)},"files":[`;
const graphObjSuffix =
  `],"communities":${JSON.stringify(communities)}` +
  (headCommit ? `,"gitCommitHash":${JSON.stringify(headCommit)}` : '') +
  `}`;
const graphJson = graphObjPrefix + filesBody + graphObjSuffix;

// Validate the graphJson is parseable before committing the envelope.
try {
  const check = JSON.parse(graphJson);
  if (!Array.isArray(check.files) || check.files.length !== graphFileCount) {
    throw new Error(`parsed files length ${check.files?.length} != expected ${graphFileCount}`);
  }
} catch (err) {
  console.error(`FATAL: assembled graphJson invalid: ${err.message}`);
  process.exit(1);
}

const envelope = {
  version: 2,
  rootDir: REPO_ROOT,
  timestamp,
  stats,
  graphJson,
  gitCommitHash: headCommit,
  fileHashes: undefined,
  embeddingProvider: NATIVE_PROVIDER,
  embeddingPolicy: policyReceipt,
};

const graphTmp = `${outGraphFile}.tmp-${process.pid}`;
fs.writeFileSync(graphTmp, JSON.stringify(envelope), 'utf-8');
fs.renameSync(graphTmp, outGraphFile);
fs.unlinkSync(tmpGraphFilesPath);

const finalGraphSize = fs.statSync(outGraphFile).size;
console.log(
  `[merge] wrote ${outGraphFile} (${(finalGraphSize / 1e9).toFixed(3)} GB, ` +
    `gitCommitHash=${headCommit}, rootDir=${REPO_ROOT})`
);

// ── receipt ─────────────────────────────────────────────────────────────────
console.log('\n===== MERGE RECEIPT =====');
console.log(
  JSON.stringify(
    {
      shards: shards.length,
      unifiedSymbolCount_graph: graphSymbolCount,
      unifiedFileCount_graph: graphFileCount,
      embeddingEntryCount: mergedEntries.length,
      embeddingPayloadCount: embeddingCount,
      dimension,
      manifestSymbolSum,
      manifestFileSum,
      gitCommitHash: headCommit,
      embeddingProvider: NATIVE_PROVIDER,
      binBytes: finalBinSize,
      graphBytes: finalGraphSize,
      outDir: CACHE_DIR,
    },
    null,
    2
  )
);
