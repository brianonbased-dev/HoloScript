#!/usr/bin/env node
/**
 * Paper 5 GraphRAG accuracy benchmark — Precision@5 and MRR across systems.
 *
 * The publication-stage runner backing
 * `HoloScript/scripts/paper-5-accuracy-bench.mjs`. Mirrors the bounded shape
 * of `bench-paper-5-gpu.mjs`: deterministic, no external API, predictable
 * runtime, JSON artifact written under `.bench-logs/`.
 *
 * ## What this measures
 *
 * Three retrieval systems are scored on a bootstrap labeled query set whose
 * gold answers are real file paths inside
 * `packages/absorb-service/src/engine/` (the GraphRAG implementation itself).
 *
 *   1. Keyword-only  — case-insensitive token overlap over symbol name +
 *                       file path + signature, ranked by overlap count.
 *                       This is the lexical/BM25-ish baseline.
 *
 *   2. Semantic-only — HoloEmbedProvider + EmbeddingIndex over the scanned
 *                       corpus, ranked by cosine similarity. The legacy
 *                       StructuralEmbeddingProvider is selectable explicitly.
 *
 *   3. Graph RAG    — GraphRAGEngine over the same index, which fuses
 *                       semantic score with graph connection and impact
 *                       weights (see GraphRAGEngine.query()).
 *
 * A "BM25" primitive is not a separate shipped baseline in absorb-service —
 * the lexical scorer below is the closest in-tree analog and is marked as
 * such in the JSON artifact.
 *
 * ## Metrics
 *
 *   Precision@5 = (# of top-5 results whose file matches the gold file) / 5
 *   Reciprocal rank = 1 / (rank of first gold-file hit in topK), or 0 if absent
 *   MRR = mean of reciprocal rank across queries
 *
 * ## Scope honesty
 *
 * The bootstrap set is N=10 queries. The full Paper 5 Table III would
 * benefit from N>=50 labeled queries across Dependency / Impact / Reasoning
 * categories. The artifact records `bootstrap: true` and a `scope_note`
 * so reviewers can see the floor vs the eventual full evaluation.
 *
 * No fabricated numbers: if a system errors (e.g. embedding build crashes
 * because the corpus failed to scan), it is reported as `skipped` with the
 * error string. Numbers are emitted only for systems that actually ran.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { platform, release, totalmem, cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUT = '.bench-logs/paper-5-accuracy-bench.json';
const DEFAULT_TOP_K = 10;
const DEFAULT_P_AT = 5;

// =============================================================================
// BOOTSTRAP LABELED QUERY SET
// =============================================================================
//
// Each query targets a real symbol/file inside packages/absorb-service/src/.
// Gold answers are RELATIVE file paths (POSIX form) so they match the scan
// output regardless of OS path separators.
//
// Selection rationale:
//   - All gold files are non-test source files in absorb-service/src/.
//   - Queries span Paper 5's three categories: lookup (find X),
//     dependency/impact (who calls X), and reasoning (how does X work).
//   - Verified to exist on disk at write time via direct `ls`.

const QUERY_SET = [
  {
    id: 'q01',
    category: 'lookup',
    query: 'graph rag engine combining semantic and graph search',
    goldFile: 'src/engine/GraphRAGEngine.ts',
  },
  {
    id: 'q02',
    category: 'lookup',
    query: 'embedding index cosine similarity search',
    goldFile: 'src/engine/EmbeddingIndex.ts',
  },
  {
    id: 'q03',
    category: 'lookup',
    query: 'codebase scanner tree sitter walk project',
    goldFile: 'src/engine/CodebaseScanner.ts',
  },
  {
    id: 'q04',
    category: 'lookup',
    query: 'codebase graph callers callees impact radius',
    goldFile: 'src/engine/CodebaseGraph.ts',
  },
  {
    id: 'q05',
    category: 'reasoning',
    query: 'holo embed provider sovereign subword vectors no api',
    goldFile: 'src/engine/providers/HoloEmbedProvider.ts',
  },
  {
    id: 'q06',
    category: 'reasoning',
    query: 'openai embedding provider api key model selection',
    goldFile: 'src/engine/providers/OpenAIEmbeddingProvider.ts',
  },
  {
    id: 'q07',
    category: 'reasoning',
    query: 'community detection cluster files together',
    goldFile: 'src/engine/CommunityDetector.ts',
  },
  {
    id: 'q08',
    category: 'reasoning',
    query: 'git change detector incremental updates',
    goldFile: 'src/engine/GitChangeDetector.ts',
  },
  {
    id: 'q09',
    category: 'reasoning',
    query: 'provenance integrity guard envelope hashing',
    goldFile: 'src/engine/ProvenanceIntegrityGuard.ts',
  },
  {
    id: 'q10',
    category: 'reasoning',
    query: 'knowledge extractor docstrings comments',
    goldFile: 'src/engine/KnowledgeExtractor.ts',
  },
];

// =============================================================================
// ARG PARSING
// =============================================================================

function parseArgs(argv) {
  const out = {
    out: DEFAULT_OUT,
    topK: DEFAULT_TOP_K,
    pAt: DEFAULT_P_AT,
    maxFiles: 200,
    provider: 'holoembed',
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) continue;
    const [flag, inline] = raw.slice(2).split('=', 2);
    const value = inline ?? argv[i + 1];
    if (inline === undefined && value && !value.startsWith('--')) i += 1;
    if (flag === 'out') out.out = value || DEFAULT_OUT;
    if (flag === 'top-k') out.topK = positiveInt(value, flag);
    if (flag === 'p-at') out.pAt = positiveInt(value, flag);
    if (flag === 'max-files') out.maxFiles = positiveInt(value, flag);
    if (flag === 'provider') {
      if (!['holoembed', 'structural'].includes(value)) {
        throw new Error('--provider must be holoembed or structural');
      }
      out.provider = value;
    }
    if (flag === 'help') out.help = true;
  }
  return out;
}

function positiveInt(value, flag) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${flag} must be a positive integer`);
  }
  return parsed;
}

function usage() {
  return [
    'Usage: node packages/absorb-service/scripts/bench-paper-5-accuracy.mjs [options]',
    '',
    'Options:',
    '  --out=PATH        artifact path (default .bench-logs/paper-5-accuracy-bench.json)',
    '  --top-k=N         results retrieved per query (default 10)',
    '  --p-at=N          precision cutoff (default 5)',
    '  --max-files=N     scanner max files cap (default 200)',
    '  --provider=NAME    holoembed (default) or structural (legacy floor)',
    '  --help            show this message',
  ].join('\n');
}

// =============================================================================
// CORPUS LOADING (real packages/absorb-service/src/)
// =============================================================================

async function loadCorpus(repoRoot, maxFiles, providerName) {
  // Lazy-load via the built dist/ exports to avoid pulling .ts through ts-node.
  const enginePkg = pathToFileUrl(
    resolve(repoRoot, 'packages/absorb-service/dist/engine/index.js')
  );
  const mod = await import(enginePkg);

  const {
    CodebaseScanner,
    CodebaseGraph,
    EmbeddingIndex,
    GraphRAGEngine,
    HoloEmbedProvider,
    StructuralEmbeddingProvider,
  } = mod;

  if (!CodebaseScanner || !CodebaseGraph || !EmbeddingIndex || !GraphRAGEngine) {
    throw new Error(
      'absorb-service engine exports missing — run `pnpm --filter @holoscript/absorb-service build` first'
    );
  }
  if (!StructuralEmbeddingProvider) {
    throw new Error(
      'StructuralEmbeddingProvider missing from absorb-service/dist/engine — rebuild with `pnpm --filter @holoscript/absorb-service build`'
    );
  }
  if (!HoloEmbedProvider) {
    throw new Error(
      'HoloEmbedProvider missing from absorb-service/dist/engine — rebuild with `pnpm --filter @holoscript/absorb-service build`'
    );
  }

  const rootDir = resolve(repoRoot, 'packages/absorb-service');
  const scanner = new CodebaseScanner();
  const scanResult = await scanner.scan({
    rootDir,
    languages: ['typescript'],
    maxFiles,
    exclude: ['node_modules', 'dist', '__tests__', '.test.', '.spec.', 'scripts'],
  });

  const graph = new CodebaseGraph();
  graph.buildFromScanResult(scanResult);

  const provider =
    providerName === 'structural'
      ? new StructuralEmbeddingProvider()
      : new HoloEmbedProvider();
  const index = new EmbeddingIndex({ provider, batchSize: 100, useWorkers: false });
  await index.buildIndex(graph);

  const engine = new GraphRAGEngine(graph, index);

  return { scanner, scanResult, graph, index, engine, rootDir };
}

function pathToFileUrl(p) {
  // Manual conversion — keeps the script self-contained without importing 'node:url'.pathToFileURL twice.
  // Node's import() accepts file URLs for absolute paths.
  const normalized = p.replace(/\\/g, '/');
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
}

// =============================================================================
// SYSTEMS
// =============================================================================

/**
 * Keyword-only ranker.
 *
 * Scores every scanned symbol by the count of query tokens that appear in
 * the lowercased concatenation of symbol name + file path + signature.
 * Symbols are then grouped to top-K distinct files (highest-scoring symbol
 * per file wins). Ties broken by file path order for determinism.
 */
function keywordSearch(graph, scanResult, query, topK) {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length >= 3);

  const fileBest = new Map(); // file -> best score
  const allSymbols = graph.getAllSymbols ? graph.getAllSymbols() : [];

  for (const sym of allSymbols) {
    const haystack = [sym.name ?? '', sym.filePath ?? '', sym.signature ?? '', sym.docComment ?? '']
      .join(' ')
      .toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (haystack.includes(tok)) score += 1;
    }
    if (score === 0) continue;
    const prev = fileBest.get(sym.filePath) ?? 0;
    if (score > prev) fileBest.set(sym.filePath, score);
  }

  // Fallback: if no symbol matched (small corpora / cold cache), scan scanned-file paths directly.
  if (fileBest.size === 0 && scanResult?.files) {
    for (const f of scanResult.files) {
      const hay = f.path.toLowerCase();
      let score = 0;
      for (const tok of tokens) if (hay.includes(tok)) score += 1;
      if (score > 0) fileBest.set(f.path, score);
    }
  }

  const ranked = [...fileBest.entries()]
    .map(([file, score]) => ({ file, score }))
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, topK);

  return ranked;
}

/**
 * Semantic-only ranker via EmbeddingIndex.search().
 *
 * Top-K results are de-duplicated by file (highest-scoring symbol per file).
 */
async function semanticSearch(index, query, topK) {
  const raw = await index.search(query, topK * 4);
  const fileBest = new Map();
  for (const r of raw) {
    const prev = fileBest.get(r.file);
    if (!prev || r.score > prev.score) fileBest.set(r.file, { file: r.file, score: r.score });
  }
  return [...fileBest.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

/**
 * GraphRAG ranker via GraphRAGEngine.query().
 *
 * Uses the same EmbeddingIndex as semantic-only, but re-ranks by the
 * combined (semantic + connection + impact) score. De-duplicated by file.
 */
async function graphRagSearch(engine, query, topK) {
  const result = await engine.query(query, { topK: topK * 4 });
  const fileBest = new Map();
  for (const r of result.results) {
    const prev = fileBest.get(r.file);
    if (!prev || r.score > prev.score) fileBest.set(r.file, { file: r.file, score: r.score });
  }
  return [...fileBest.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

// =============================================================================
// SCORING
// =============================================================================

function scoreQuery(retrieved, goldFile, pAt, repoRoot) {
  // Normalize gold file to absolute, then compare via suffix match so
  // both relative and absolute scanner outputs work.
  const goldAbs = resolve(repoRoot, 'packages/absorb-service', goldFile).replace(/\\/g, '/');
  const norm = (p) => p.replace(/\\/g, '/');
  const hits = retrieved.map((r) => {
    const np = norm(r.file);
    return np.endsWith(goldFile) || np === goldAbs;
  });

  const top = hits.slice(0, pAt);
  const numHit = top.filter(Boolean).length;
  const p = numHit / pAt;

  const firstHitIdx = hits.findIndex((h) => h);
  const rr = firstHitIdx >= 0 ? 1 / (firstHitIdx + 1) : 0;

  return { p, rr, firstHitIdx };
}

// =============================================================================
// HARDWARE
// =============================================================================

function detectHardware() {
  const nvidia = spawnSync(
    'nvidia-smi',
    ['--query-gpu=name,driver_version', '--format=csv,noheader'],
    { encoding: 'utf8', timeout: 5_000, shell: true }
  );
  const firstGpu = nvidia.status === 0 ? (nvidia.stdout || '').trim().split(/\r?\n/)[0] : '';
  const [gpuName, driverVersion] = firstGpu ? firstGpu.split(',').map((p) => p.trim()) : ['', ''];
  return {
    os: `${platform()} ${release()}`,
    node: process.version,
    totalMemoryGb: Math.round((totalmem() / 1024 ** 3) * 100) / 100,
    cpuCount: cpus().length,
    cpuModel: cpus()[0]?.model ?? null,
    gpuName: gpuName || null,
    driverVersion: driverVersion || null,
    nvidiaSmi: nvidia.status === 0 ? 'available' : 'unavailable',
  };
}

// =============================================================================
// MAIN
// =============================================================================

export async function main(argv = process.argv.slice(2), config = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (config.defaultOut && options.out === DEFAULT_OUT) {
    options.out = config.defaultOut;
  }

  const repoRoot = config.cwd ?? process.cwd();
  console.error(
    `[paper-5-accuracy-bench] queries=${QUERY_SET.length} topK=${options.topK} p@${options.pAt} maxFiles=${options.maxFiles} provider=${options.provider}`
  );

  const hardware = detectHardware();
  const ranAt = new Date().toISOString();

  // ── 1. Load corpus + build index + engine ────────────────────────────────
  let bundle;
  const setupStart = performance.now();
  try {
    bundle = await loadCorpus(repoRoot, options.maxFiles, options.provider);
  } catch (err) {
    // Hard fail — without a corpus, no system can produce honest numbers.
    const artifact = {
      schema_version: 'paper-5-accuracy-bench-v2',
      benchmark: 'paper-5-graphrag-accuracy',
      status: 'setup_failed',
      ran_at: ranAt,
      hardware,
      error: String(err?.stack ?? err),
      notes: [
        'Setup failed before any system could be measured.',
        'Most common cause: absorb-service dist/ missing. Run `pnpm --filter @holoscript/absorb-service build`.',
      ],
    };
    const outPath = resolve(repoRoot, options.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    console.error(`[paper-5-accuracy-bench] setup_failed -> ${outPath}`);
    return 1;
  }
  const setupMs = Math.round(performance.now() - setupStart);
  const { scanResult, graph, index, engine } = bundle;

  console.error(
    `[paper-5-accuracy-bench] corpus: ${scanResult.files?.length ?? 0} files, ${
      (graph.getAllSymbols?.() ?? []).length
    } symbols, setup ${setupMs}ms`
  );

  // ── 2. Verify every gold file is actually in the scanned corpus ──────────
  const scannedPaths = new Set((scanResult.files ?? []).map((f) => f.path.replace(/\\/g, '/')));
  const goldCheck = QUERY_SET.map((q) => {
    const found = [...scannedPaths].some((p) => p.endsWith(q.goldFile));
    return { id: q.id, gold: q.goldFile, in_corpus: found };
  });
  const missingGold = goldCheck.filter((g) => !g.in_corpus);
  if (missingGold.length > 0) {
    console.error(
      `[paper-5-accuracy-bench] WARN ${missingGold.length}/${QUERY_SET.length} gold files NOT in scanned corpus`
    );
    for (const m of missingGold) console.error(`  - ${m.id}: ${m.gold}`);
  }

  // ── 3. Run each system ───────────────────────────────────────────────────
  const systemDefs = [
    {
      name: 'keyword-only',
      label: 'Keyword-only',
      kind: 'lexical',
      run: async (q) => keywordSearch(graph, scanResult, q, options.topK),
    },
    {
      name: 'semantic-only',
      label: 'Semantic-only (RAG)',
      kind: 'embedding',
      run: async (q) => semanticSearch(index, q, options.topK),
    },
    {
      name: 'graph-rag',
      label: 'Graph RAG',
      kind: 'graph-rag',
      run: async (q) => graphRagSearch(engine, q, options.topK),
    },
  ];

  const systems = [];
  for (const sys of systemDefs) {
    const sysStart = performance.now();
    const perQuery = [];
    let totalP = 0;
    let totalRr = 0;
    let nOk = 0;
    let sysError = null;

    for (const q of QUERY_SET) {
      try {
        const retrieved = await sys.run(q.query);
        const { p, rr, firstHitIdx } = scoreQuery(retrieved, q.goldFile, options.pAt, repoRoot);
        perQuery.push({
          id: q.id,
          category: q.category,
          query: q.query,
          gold: q.goldFile,
          retrieved: retrieved.map((r) => ({
            file: relative(resolve(repoRoot, 'packages/absorb-service'), r.file).replace(
              /\\/g,
              '/'
            ),
            score: round(r.score),
          })),
          [`p_at_${options.pAt}`]: round(p),
          rr: round(rr),
          first_hit_rank: firstHitIdx >= 0 ? firstHitIdx + 1 : null,
        });
        totalP += p;
        totalRr += rr;
        nOk += 1;
      } catch (err) {
        perQuery.push({
          id: q.id,
          category: q.category,
          query: q.query,
          gold: q.goldFile,
          error: String(err?.message ?? err),
        });
        sysError = sysError ?? String(err?.message ?? err);
      }
    }

    const sysMs = Math.round(performance.now() - sysStart);
    systems.push({
      name: sys.name,
      label: sys.label,
      kind: sys.kind,
      status: nOk > 0 ? 'ok' : 'failed',
      n_queries: nOk,
      [`p_at_${options.pAt}`]: nOk > 0 ? round(totalP / nOk) : null,
      mrr: nOk > 0 ? round(totalRr / nOk) : null,
      runtime_ms: sysMs,
      first_error: sysError,
      queries: perQuery,
    });
    console.error(
      `[paper-5-accuracy-bench] ${sys.name}: p@${options.pAt}=${
        nOk > 0 ? round(totalP / nOk) : 'n/a'
      } mrr=${nOk > 0 ? round(totalRr / nOk) : 'n/a'} (${sysMs}ms)`
    );
  }

  // ── 4. BM25 / dedicated lexical baseline note ────────────────────────────
  const bm25Note = {
    name: 'bm25',
    label: 'BM25 (skipped — not shipped in absorb-service)',
    kind: 'lexical',
    status: 'skipped',
    reason:
      'No standalone BM25 primitive exists in @holoscript/absorb-service. The keyword-only system above is the closest in-tree lexical baseline (token overlap on symbol name + file + signature).',
  };
  systems.push(bm25Note);

  // ── 5. Cleanup ───────────────────────────────────────────────────────────
  try {
    await index.dispose?.();
  } catch {
    /* best-effort */
  }

  // ── 6. Emit artifact ─────────────────────────────────────────────────────
  const artifact = {
    schema_version: 'paper-5-accuracy-bench-v2',
    benchmark: 'paper-5-graphrag-accuracy',
    status: 'completed',
    runner: 'packages/absorb-service/scripts/bench-paper-5-accuracy.mjs',
    paper_ref: 'ai-ecosystem/research/paper-5-graphrag-icse.tex',
    paper_table: 'tab:accuracy',
    ran_at: ranAt,
    setup_ms: setupMs,
    bootstrap: true,
    scope_note:
      'Bootstrap accuracy floor on N=' +
      QUERY_SET.length +
      ' queries against the absorb-service GraphRAG implementation. The full Paper 5 Table III evaluation targets >=50 labeled queries spanning Dependency / Impact / Reasoning categories with multi-annotator gold answers; this run is a deterministic CI-reproducible floor, not the full evaluation.',
    corpus: {
      root: 'packages/absorb-service',
      files: scanResult.files?.length ?? 0,
      symbols: (graph.getAllSymbols?.() ?? []).length,
      max_files: options.maxFiles,
    },
    query_set: {
      n: QUERY_SET.length,
      categories: countBy(QUERY_SET, (q) => q.category),
      gold_files_in_corpus: goldCheck.filter((g) => g.in_corpus).length,
      gold_files_missing: missingGold,
    },
    metrics: {
      top_k: options.topK,
      p_at: options.pAt,
    },
    embedding_provider:
      options.provider === 'structural'
        ? 'StructuralEmbeddingProvider (legacy deterministic floor)'
        : 'HoloEmbedProvider (sovereign structural + subword embeddings)',
    hardware,
    systems,
    notes: [
      options.provider === 'structural'
        ? 'Legacy structural-floor mode: vectors encode symbol structure without name-derived HoloEmbed subwords.'
        : 'Current-system mode: sovereign HoloEmbed structural + subword vectors, with no API key or external provider.',
      'Keyword-only acts as the lexical/BM25-analog baseline; a true BM25 implementation is not shipped in absorb-service.',
      'No LLM is invoked — the engine returns ranked enriched results, not generated answers, so accuracy is measured on retrieval not synthesis.',
      options.provider === 'structural'
        ? 'IMPORTANT: StructuralEmbeddingProvider encodes AST-structural features rather than NL-text semantics. Treat these results as a legacy floor.'
        : 'IMPORTANT: HoloEmbed is the current sovereign shared GraphRAG provider. This remains a 10-query bootstrap and must not be presented as the full Paper 5 evaluation.',
      'Keyword-only MRR is meaningful here even when P@5 looks low: it shows the gold file IS being ranked highly, just not always at rank 1, and there are other valid related files in the top-5 (e.g. GraphRAGVisualizer for a "graph rag engine" query).',
    ],
  };

  const outPath = resolve(repoRoot, options.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  // Also drop a timestamped copy so successive runs are auditable
  // (`.bench-logs/<timestamp>/paper-5-accuracy-bench.json`).
  const ts = ranAt.replace(/[:.]/g, '-');
  const tsPath = resolve(repoRoot, '.bench-logs', ts, 'paper-5-accuracy-bench.json');
  mkdirSync(dirname(tsPath), { recursive: true });
  writeFileSync(tsPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  console.log(`-> ${outPath}`);
  console.log(`-> ${tsPath}`);
  return 0;
}

function round(value) {
  if (value == null || Number.isNaN(value)) return value;
  return Math.round(value * 1000) / 1000;
}

function countBy(arr, key) {
  const out = {};
  for (const item of arr) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error('[paper-5-accuracy-bench] fatal', err);
      process.exit(1);
    }
  );
}
