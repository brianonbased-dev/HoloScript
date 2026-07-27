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
 * Four retrieval systems are scored on a frozen, held-out, source-audited
 * query set whose multi-relevance answers are real file paths inside
 * `packages/absorb-service/src/`.
 *
 *   1. Keyword-only  — case-insensitive token overlap over symbol name +
 *                       file path + signature, ranked by overlap count.
 *                       This is the lexical/BM25-ish baseline.
 *
 *   2. Semantic-only — HoloEmbedProvider + EmbeddingIndex over the scanned
 *                       corpus, ranked by cosine similarity. The legacy
 *                       StructuralEmbeddingProvider is selectable explicitly.
 *
 *   3. Hybrid       — exact-name/path + lexical evidence fused with the
 *                       HoloEmbed vector score.
 *
 *   4. Graph RAG    — GraphRAGEngine over the hybrid index, which adds
 *                       bounded graph connection and impact evidence.
 *
 * A "BM25" primitive is not a separate shipped baseline in absorb-service —
 * the lexical scorer below is the closest in-tree analog and is marked as
 * such in the JSON artifact.
 *
 * ## Metrics
 *
 *   Precision@5 = (# of top-5 results matching any relevant file) / 5
 *   Reciprocal rank = 1 / (rank of first relevant-file hit in topK), or 0
 *   MRR = mean of reciprocal rank across queries
 *   95% confidence intervals = deterministic non-parametric bootstrap
 *
 * ## Scope honesty
 *
 * The v1 corpus has N=54 queries balanced across Dependency / Impact /
 * Reasoning. Labels are independently executable against source anchors before
 * retrieval runs, but they are not independently labeled by multiple humans
 * and have not yet been replicated on an external codebase. The artifact keeps
 * that publication boundary explicit.
 *
 * No fabricated numbers: if a system errors (e.g. embedding build crashes
 * because the corpus failed to scan), it is reported as `skipped` with the
 * error string. Numbers are emitted only for systems that actually ran.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { platform, release, totalmem, cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PAPER_5_DATASET,
  requirePaper5Dataset,
} from './verify-paper-5-dataset.mjs';

const DEFAULT_OUT = '.bench-logs/paper-5-accuracy-bench.json';
const DEFAULT_TOP_K = 10;
const DEFAULT_P_AT = 5;

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
    dataset: DEFAULT_PAPER_5_DATASET,
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
    if (flag === 'dataset') out.dataset = value || DEFAULT_PAPER_5_DATASET;
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
    '  --dataset=PATH     frozen retrieval corpus (default package v1 dataset)',
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
  // Benchmark runs must be reproducible across provider arms. The production
  // scanner can use workers, but sequential parsing removes worker scheduling
  // as a source of corpus variance while preserving scanner semantics.
  const scanner = new CodebaseScanner(undefined, false);
  const scanResult = await scanner.scan({
    rootDir,
    languages: ['typescript'],
    maxFiles,
    exclude: ['node_modules', 'dist', '__tests__', 'scripts'],
    excludeNameFragments: ['.test.', '.spec.'],
  });

  const graph = new CodebaseGraph();
  graph.buildFromScanResult(scanResult);
  const keywordSymbols = (graph.getAllSymbols?.() ?? []).map((symbol) => ({
    name: symbol.name ?? '',
    filePath: symbol.filePath ?? '',
    signature: symbol.signature ?? '',
    docComment: symbol.docComment ?? '',
  }));
  const corpusFingerprint = createHash('sha256')
    .update(
      JSON.stringify(
        keywordSymbols
          .map((symbol) => [
            symbol.filePath,
            symbol.name,
            symbol.signature,
            symbol.docComment,
          ])
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      )
    )
    .digest('hex');

  const provider =
    providerName === 'structural'
      ? new StructuralEmbeddingProvider()
      : new HoloEmbedProvider();
  const index = new EmbeddingIndex({ provider, batchSize: 100, useWorkers: false });
  await index.buildIndex(graph);

  const engine = new GraphRAGEngine(graph, index);

  return {
    scanner,
    scanResult,
    graph,
    index,
    engine,
    rootDir,
    keywordSymbols,
    corpusFingerprint,
  };
}

function pathToFileUrl(p) {
  // Manual conversion — keeps the script self-contained without importing 'node:url'.pathToFileURL twice.
  // Node's import() accepts file URLs for absolute paths.
  const normalized = p.replace(/\\/g, '/');
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
}

function artifactFilePath(file, packageRoot) {
  const normalized = String(file).replace(/\\/g, '/');
  if (!/^(?:[a-z]:\/|\/)/iu.test(normalized)) {
    return normalized.replace(/^\.\//u, '');
  }
  return relative(packageRoot, file).replace(/\\/g, '/');
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
function keywordSearch(keywordSymbols, scanResult, query, topK) {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length >= 3);

  const fileBest = new Map(); // file -> best score
  for (const sym of keywordSymbols) {
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
 * Production HoloAbsorb hybrid ranker. Falls back to vector search only for
 * legacy index implementations so benchmark artifacts remain replayable.
 */
async function hybridSearch(index, query, topK) {
  const raw = index.searchHybrid
    ? await index.searchHybrid(query, topK * 4)
    : await index.search(query, topK * 4);
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

function scoreQuery(retrieved, goldFiles, pAt, repoRoot) {
  // Normalize relevant files to absolute, then compare via suffix match so
  // both relative and absolute scanner outputs work.
  const norm = (p) => p.replace(/\\/g, '/');
  const relevant = goldFiles.map((goldFile) => ({
    relative: goldFile,
    absolute: resolve(repoRoot, 'packages/absorb-service', goldFile).replace(/\\/g, '/'),
  }));
  const hits = retrieved.map((r) => {
    const np = norm(r.file);
    return relevant.some((gold) => np.endsWith(gold.relative) || np === gold.absolute);
  });

  const top = hits.slice(0, pAt);
  const numHit = top.filter(Boolean).length;
  const p = numHit / pAt;

  const firstHitIdx = hits.findIndex((h) => h);
  const rr = firstHitIdx >= 0 ? 1 / (firstHitIdx + 1) : 0;

  return { p, rr, firstHitIdx };
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted, probability) {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function bootstrapMean(values, protocol, seedOffset = 0) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return {
      mean: null,
      ci_lower: null,
      ci_upper: null,
      n: 0,
      resamples: protocol.bootstrapResamples,
      confidence: protocol.confidence,
    };
  }
  const rng = mulberry32((protocol.seed + seedOffset) >>> 0);
  const estimates = [];
  for (let sample = 0; sample < protocol.bootstrapResamples; sample += 1) {
    let total = 0;
    for (let index = 0; index < finite.length; index += 1) {
      total += finite[Math.floor(rng() * finite.length)];
    }
    estimates.push(total / finite.length);
  }
  estimates.sort((a, b) => a - b);
  const alpha = (1 - protocol.confidence) / 2;
  return {
    mean: round(finite.reduce((sum, value) => sum + value, 0) / finite.length),
    ci_lower: round(quantile(estimates, alpha)),
    ci_upper: round(quantile(estimates, 1 - alpha)),
    n: finite.length,
    resamples: protocol.bootstrapResamples,
    confidence: protocol.confidence,
  };
}

function metricSummary(perQuery, metricKey, protocol, seedOffset = 0) {
  return bootstrapMean(
    perQuery.map((query) => query[metricKey]).filter(Number.isFinite),
    protocol,
    seedOffset
  );
}

function categoryMetrics(perQuery, metricKey, protocol, seedOffset = 0) {
  const categories = [...new Set(perQuery.map((query) => query.category))].sort();
  return Object.fromEntries(
    categories.map((category, categoryIndex) => [
      category,
      metricSummary(
        perQuery.filter((query) => query.category === category),
        metricKey,
        protocol,
        seedOffset + (categoryIndex + 1) * 101
      ),
    ])
  );
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
  if (config.defaultDataset && options.dataset === DEFAULT_PAPER_5_DATASET) {
    options.dataset = config.defaultDataset;
  }
  const datasetPath = resolve(repoRoot, options.dataset);
  let dataset;
  let datasetAudit;
  try {
    ({ dataset, receipt: datasetAudit } = requirePaper5Dataset(datasetPath));
  } catch (err) {
    const artifact = {
      schema_version: 'paper-5-accuracy-bench-v3',
      benchmark: 'paper-5-graphrag-accuracy',
      status: 'dataset_audit_failed',
      ran_at: new Date().toISOString(),
      dataset: relative(repoRoot, datasetPath).replace(/\\/g, '/'),
      error: String(err?.stack ?? err),
    };
    const outPath = resolve(repoRoot, options.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    console.error(`[paper-5-accuracy-bench] dataset_audit_failed -> ${outPath}`);
    return 1;
  }
  const querySet = dataset.queries;
  const bootstrapProtocol = {
    bootstrapResamples: dataset.metricProtocol.bootstrapResamples,
    confidence: dataset.metricProtocol.confidenceLevel,
    seed: dataset.metricProtocol.seed,
  };
  if (
    options.topK !== dataset.metricProtocol.topK ||
    options.pAt !== dataset.metricProtocol.precisionAt
  ) {
    throw new Error(
      `Metric protocol drift: dataset requires topK=${dataset.metricProtocol.topK} ` +
        `and p@${dataset.metricProtocol.precisionAt}`
    );
  }
  console.error(
    `[paper-5-accuracy-bench] dataset=${dataset.datasetId} queries=${querySet.length} ` +
      `topK=${options.topK} p@${options.pAt} maxFiles=${options.maxFiles} provider=${options.provider}`
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
      schema_version: 'paper-5-accuracy-bench-v3',
      benchmark: 'paper-5-graphrag-accuracy',
      status: 'setup_failed',
      ran_at: ranAt,
      dataset_audit: datasetAudit,
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
  const { scanResult, graph, index, engine, keywordSymbols, corpusFingerprint } = bundle;

  console.error(
    `[paper-5-accuracy-bench] corpus: ${scanResult.files?.length ?? 0} files, ${
      (graph.getAllSymbols?.() ?? []).length
    } symbols, ${scanResult.errors?.length ?? 0} scan errors, setup ${setupMs}ms`
  );

  // ── 2. Verify every gold file is actually in the scanned corpus ──────────
  const scannedPaths = new Set((scanResult.files ?? []).map((f) => f.path.replace(/\\/g, '/')));
  const goldCheck = querySet.flatMap((q) =>
    q.gold.map((judgment) => {
      const found = [...scannedPaths].some((path) => path.endsWith(judgment.file));
      return { id: q.id, gold: judgment.file, in_corpus: found };
    })
  );
  const missingGold = goldCheck.filter((g) => !g.in_corpus);
  const scanErrors = scanResult.errors ?? [];
  if (missingGold.length > 0 || scanErrors.length > 0) {
    console.error(
      `[paper-5-accuracy-bench] FAIL missing-gold=${missingGold.length}/${goldCheck.length} ` +
        `scan-errors=${scanErrors.length}`
    );
    for (const m of missingGold) console.error(`  - ${m.id}: ${m.gold}`);
    try {
      await index.dispose?.();
    } catch {
      /* best-effort */
    }
    const artifact = {
      schema_version: 'paper-5-accuracy-bench-v3',
      benchmark: 'paper-5-graphrag-accuracy',
      status: 'corpus_validation_failed',
      ran_at: ranAt,
      dataset_audit: datasetAudit,
      corpus: {
        root: 'packages/absorb-service',
        files: scanResult.files?.length ?? 0,
        symbols: (graph.getAllSymbols?.() ?? []).length,
        max_files: options.maxFiles,
        scan_errors: scanErrors,
      },
      gold_files_missing: missingGold,
      error:
        'The benchmark requires every frozen relevance judgment in a corpus with zero scan errors.',
    };
    const outPath = resolve(repoRoot, options.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    console.error(`[paper-5-accuracy-bench] corpus_validation_failed -> ${outPath}`);
    return 1;
  }

  // ── 3. Run each system ───────────────────────────────────────────────────
  const systemDefs = [
    {
      name: 'keyword-only',
      label: 'Keyword-only',
      kind: 'lexical',
      run: async (q) => keywordSearch(keywordSymbols, scanResult, q, options.topK),
    },
    {
      name: 'semantic-only',
      label: 'Semantic-only (RAG)',
      kind: 'embedding',
      run: async (q) => semanticSearch(index, q, options.topK),
    },
    {
      name: 'hybrid',
      label: 'HoloAbsorb hybrid (exact + lexical + HoloEmbed)',
      kind: 'hybrid',
      run: async (q) => hybridSearch(index, q, options.topK),
    },
    {
      name: 'graph-rag',
      label: 'Graph RAG',
      kind: 'graph-rag',
      run: async (q) => graphRagSearch(engine, q, options.topK),
    },
  ];

  const systems = [];
  for (const [systemIndex, sys] of systemDefs.entries()) {
    const sysStart = performance.now();
    const perQuery = [];
    let nOk = 0;
    let sysError = null;

    for (const q of querySet) {
      const goldFiles = q.gold.map((judgment) => judgment.file);
      try {
        const retrieved = await sys.run(q.query);
        const { p, rr, firstHitIdx } = scoreQuery(
          retrieved,
          goldFiles,
          options.pAt,
          repoRoot
        );
        perQuery.push({
          id: q.id,
          category: q.category,
          query: q.query,
          gold: goldFiles,
          retrieved: retrieved.map((r) => ({
            file: artifactFilePath(r.file, resolve(repoRoot, 'packages/absorb-service')),
            score: round(r.score),
          })),
          [`p_at_${options.pAt}`]: round(p),
          rr: round(rr),
          first_hit_rank: firstHitIdx >= 0 ? firstHitIdx + 1 : null,
        });
        nOk += 1;
      } catch (err) {
        perQuery.push({
          id: q.id,
          category: q.category,
          query: q.query,
          gold: goldFiles,
          error: String(err?.message ?? err),
        });
        sysError = sysError ?? String(err?.message ?? err);
      }
    }

    const sysMs = Math.round(performance.now() - sysStart);
    const precisionKey = `p_at_${options.pAt}`;
    const precision = metricSummary(
      perQuery,
      precisionKey,
      bootstrapProtocol,
      systemIndex * 10_000
    );
    const mrr = metricSummary(perQuery, 'rr', bootstrapProtocol, systemIndex * 10_000 + 1);
    const precisionByCategory = categoryMetrics(
      perQuery,
      precisionKey,
      bootstrapProtocol,
      systemIndex * 10_000 + 1_000
    );
    const mrrByCategory = categoryMetrics(
      perQuery,
      'rr',
      bootstrapProtocol,
      systemIndex * 10_000 + 2_000
    );
    systems.push({
      name: sys.name,
      label: sys.label,
      kind: sys.kind,
      status: nOk === querySet.length ? 'ok' : nOk > 0 ? 'partial' : 'failed',
      n_queries: nOk,
      n_expected: querySet.length,
      [precisionKey]: precision.mean,
      mrr: mrr.mean,
      confidence_intervals: {
        [precisionKey]: precision,
        mrr,
      },
      by_category: Object.fromEntries(
        Object.keys(countBy(querySet, (q) => q.category)).map((category) => [
          category,
          {
            [precisionKey]: precisionByCategory[category],
            mrr: mrrByCategory[category],
          },
        ])
      ),
      runtime_ms: sysMs,
      first_error: sysError,
      queries: perQuery,
    });
    console.error(
      `[paper-5-accuracy-bench] ${sys.name}: p@${options.pAt}=${
        precision.mean ?? 'n/a'
      } [${precision.ci_lower ?? 'n/a'}, ${precision.ci_upper ?? 'n/a'}] mrr=${
        mrr.mean ?? 'n/a'
      } [${mrr.ci_lower ?? 'n/a'}, ${mrr.ci_upper ?? 'n/a'}] (${sysMs}ms)`
    );
  }

  // ── 4. BM25 / dedicated lexical baseline note ────────────────────────────
  const keywordBaseline = systems.find((system) => system.name === 'keyword-only');
  const precisionMetricKey = `p_at_${options.pAt}`;
  if (keywordBaseline?.status === 'ok') {
    const baselineById = new Map(keywordBaseline.queries.map((query) => [query.id, query]));
    for (const [systemIndex, system] of systems.entries()) {
      const paired = system.queries
        .map((query) => {
          const baseline = baselineById.get(query.id);
          if (!baseline) return null;
          if (
            !Number.isFinite(query[precisionMetricKey]) ||
            !Number.isFinite(baseline[precisionMetricKey]) ||
            !Number.isFinite(query.rr) ||
            !Number.isFinite(baseline.rr)
          ) {
            return null;
          }
          return {
            p: query[precisionMetricKey] - baseline[precisionMetricKey],
            rr: query.rr - baseline.rr,
          };
        })
        .filter(Boolean);
      system.delta_vs_keyword = {
        [precisionMetricKey]: bootstrapMean(
          paired.map((entry) => entry.p),
          bootstrapProtocol,
          50_000 + systemIndex * 1_000
        ),
        mrr: bootstrapMean(
          paired.map((entry) => entry.rr),
          bootstrapProtocol,
          50_001 + systemIndex * 1_000
        ),
      };
    }
  }

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
  const measuredSystems = systems.filter((system) => system.name !== 'bm25');
  const allSystemsCompleted = measuredSystems.every((system) => system.status === 'ok');
  const artifact = {
    schema_version: 'paper-5-accuracy-bench-v3',
    benchmark: 'paper-5-graphrag-accuracy',
    status: allSystemsCompleted ? 'completed' : 'partial_failure',
    runner: 'packages/absorb-service/scripts/bench-paper-5-accuracy.mjs',
    paper_ref: 'ai-ecosystem/research/paper-5-graphrag-icse.tex',
    paper_table: 'tab:accuracy',
    ran_at: ranAt,
    setup_ms: setupMs,
    evaluation_stage: 'source-audited-held-out',
    publication_ready: false,
    bootstrap: false,
    bootstrap_confidence_intervals: true,
    scope_note:
      'Held-out source-audited evaluation on N=' +
      querySet.length +
      ' queries balanced across Dependency / Impact / Reasoning with multi-relevance judgments. ' +
      'The executable pre-ranking audit verifies every label against current source anchors. ' +
      'This is not independently labeled by multiple humans and has not been replicated on an external codebase, so it is not publication-ready.',
    dataset: {
      path: relative(repoRoot, datasetPath).replace(/\\/g, '/'),
      id: dataset.datasetId,
      frozen_at: dataset.frozenAt,
      source_commit: dataset.sourceCommit,
      sha256: datasetAudit.dataset.sha256,
      split: dataset.split,
      labeling: dataset.labeling,
      claim_boundary: dataset.claimBoundary,
      audit: datasetAudit,
    },
    corpus: {
      root: 'packages/absorb-service',
      files: scanResult.files?.length ?? 0,
      symbols: (graph.getAllSymbols?.() ?? []).length,
      max_files: options.maxFiles,
      deterministic_scan: 'sequential',
      symbol_corpus_sha256: corpusFingerprint,
      scan_errors: scanErrors,
    },
    query_set: {
      n: querySet.length,
      categories: countBy(querySet, (q) => q.category),
      relevance_judgments: goldCheck.length,
      gold_files_in_corpus: goldCheck.filter((g) => g.in_corpus).length,
      gold_files_missing: missingGold,
    },
    metrics: {
      top_k: options.topK,
      p_at: options.pAt,
      bootstrap_resamples: bootstrapProtocol.bootstrapResamples,
      confidence_level: bootstrapProtocol.confidence,
      seed: bootstrapProtocol.seed,
      paired_delta_baseline: 'keyword-only',
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
        : 'IMPORTANT: HoloEmbed is the current sovereign shared GraphRAG provider. The corpus clears the 50-query implementation gate but not the independent multi-human annotation or external-replication gates.',
      'Precision@5 uses the conventional fixed denominator of five. Queries have two to five audited relevant files, so the maximum attainable per-query precision depends on the frozen relevance set.',
      'Confidence intervals are deterministic non-parametric bootstrap intervals over held-out queries. Delta intervals are paired against the keyword-only baseline.',
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
  return allSystemsCompleted ? 0 : 1;
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
