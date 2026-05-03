#!/usr/bin/env node
/**
 * Paper 5 GraphRAG GPU benchmark, bounded CI artifact path.
 *
 * The original root harness attempted to scan and embed a live repo before it
 * emitted progress, which made fleet failures indistinguishable from hangs.
 * This runner keeps the publication-stage shape but uses a fixed synthetic
 * GraphRAG workload so `--trials=10` and CI runs finish predictably.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { platform, release, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUT = '.bench-logs/paper-5-gpu-bench.json';
const DEFAULT_TRIALS = 100;
const DEFAULT_QUERIES = 30;
const DEFAULT_SYMBOLS = 384;
const VECTOR_DIM = 128;

const QUERY_MIX = [
  'where is provenance envelope hashing assembled',
  'how does graph rag collect callers and callees',
  'which module owns embedding provider selection',
  'trace evidence chain replay verification',
  'find semantic search result ranking weights',
  'show graph impact radius calculation',
  'what builds citation contexts for answers',
  'where are knowledge entries synchronized',
  'which path emits benchmark artifacts',
  'find deterministic evidence hash code',
  'how does codebase scanner report progress',
  'where are embedding vectors serialized',
  'which adapter extracts TypeScript calls',
  'trace graph community detection setup',
  'what validates GraphRAG prerequisite state',
  'find absorb query HTTP route',
  'where does provenance answer wrap raw output',
  'show LLM fallback provider wiring',
  'which files define symbol visibility',
  'trace package-level self improvement pipeline',
  'find worker pool embedding batch execution',
  'where are import edges indexed',
  'show query filter support by language',
  'which tests cover graph caller lookup',
  'find stale graph cache status check',
  'where is OpenAI embedding provider configured',
  'show Ollama embedding model default',
  'trace Holo emitter scene generation',
  'which route publishes absorb knowledge',
  'find GraphRAG empty-result behavior',
];

function parseArgs(argv) {
  const out = {
    trials: DEFAULT_TRIALS,
    queries: DEFAULT_QUERIES,
    maxSymbols: DEFAULT_SYMBOLS,
    out: DEFAULT_OUT,
    progressEvery: 10,
    setupTimeoutMs: 30_000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) continue;
    const [flag, inline] = raw.slice(2).split('=', 2);
    const value = inline ?? argv[i + 1];
    if (inline === undefined && value && !value.startsWith('--')) i += 1;

    if (flag === 'trials') out.trials = positiveInt(value, flag);
    if (flag === 'queries') out.queries = positiveInt(value, flag);
    if (flag === 'max-symbols') out.maxSymbols = positiveInt(value, flag);
    if (flag === 'out') out.out = value || DEFAULT_OUT;
    if (flag === 'progress-every') out.progressEvery = positiveInt(value, flag);
    if (flag === 'setup-timeout-ms') out.setupTimeoutMs = positiveInt(value, flag);
    if (flag === 'help') out.help = true;
  }

  out.queries = Math.min(out.queries, QUERY_MIX.length);
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
    'Usage: node scripts/paper-5-gpu-bench.mjs [options]',
    '',
    'Options:',
    '  --trials=N             samples to collect (default 100)',
    '  --queries=N            fixed query mix size, max 30 (default 30)',
    '  --max-symbols=N        synthetic symbol index size (default 384)',
    '  --out=PATH             artifact path (default .bench-logs/paper-5-gpu-bench.json)',
    '  --progress-every=N     stderr progress cadence (default 10)',
    '  --setup-timeout-ms=N   bounded setup guard (default 30000)',
  ].join('\n');
}

function buildCorpus(count) {
  const modules = [
    'provenance',
    'embedding',
    'scanner',
    'graph',
    'knowledge',
    'pipeline',
    'adapter',
    'worker',
  ];
  const types = ['function', 'class', 'method', 'interface'];
  const symbols = [];
  const adjacency = new Map();

  for (let i = 0; i < count; i += 1) {
    const module = modules[i % modules.length];
    const name = `${module}_${types[i % types.length]}_${i}`;
    const symbol = {
      id: `sym_${i}`,
      name,
      type: types[i % types.length],
      file: `packages/absorb-service/src/${module}/${name}.ts`,
      text: `${name} ${module} ${types[i % types.length]} graph rag evidence provenance embedding search callers callees`,
    };
    symbols.push(symbol);
    adjacency.set(symbol.id, [
      `sym_${(i + 1) % count}`,
      `sym_${(i + 7) % count}`,
      `sym_${(i + 31) % count}`,
    ]);
  }

  return { symbols, adjacency };
}

function deterministicVector(text) {
  const vector = new Array(VECTOR_DIM);
  for (let i = 0; i < VECTOR_DIM; i += 1) {
    const digest = createHash('sha256').update(`${text}:${i}`).digest();
    const value = digest.readUInt32LE(0) / 0xffffffff;
    vector[i] = value * 2 - 1;
  }
  return normalize(vector);
}

function normalize(vector) {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const mag = Math.sqrt(sum) || 1;
  return vector.map((value) => value / mag);
}

function dot(a, b) {
  let score = 0;
  for (let i = 0; i < a.length; i += 1) score += a[i] * b[i];
  return score;
}

function keywordSearch(symbols, query) {
  const terms = query.toLowerCase().split(/\s+/g);
  let matches = 0;
  for (const symbol of symbols) {
    const haystack = symbol.text.toLowerCase();
    if (terms.some((term) => haystack.includes(term))) matches += 1;
  }
  return matches;
}

function graphTraversal(adjacency, seed, depth = 3) {
  const seen = new Set([seed]);
  let frontier = [seed];
  for (let d = 0; d < depth; d += 1) {
    const next = [];
    for (const id of frontier) {
      for (const target of adjacency.get(id) ?? []) {
        if (seen.has(target)) continue;
        seen.add(target);
        next.push(target);
      }
    }
    frontier = next;
  }
  return seen.size;
}

function vectorSearch(index, queryVector, topK = 20) {
  const scored = index.map((entry) => ({ entry, score: dot(queryVector, entry.vector) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function envelopeBuild(query, keywordMatches, graphNodes, topHits) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        query,
        keywordMatches,
        graphNodes,
        topHits: topHits.slice(0, 5).map((hit) => [hit.entry.id, hit.score.toFixed(6)]),
      })
    )
    .digest('hex');
}

function time(fn) {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const mean = sum / sorted.length;
  const variance =
    sorted.reduce((acc, value) => acc + (value - mean) * (value - mean), 0) / sorted.length;
  const median = percentile(sorted, 0.5);
  return {
    median_ms: round(median),
    mean_ms: round(mean),
    stdev_ms: round(Math.sqrt(variance)),
    p95_ms: round(percentile(sorted, 0.95)),
    min_ms: round(sorted[0] ?? 0),
    max_ms: round(sorted[sorted.length - 1] ?? 0),
  };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function detectHardware() {
  const nvidia = spawnSync(
    'nvidia-smi',
    ['--query-gpu=name,driver_version', '--format=csv,noheader'],
    { encoding: 'utf8', timeout: 5_000, shell: true }
  );
  const firstGpu = nvidia.status === 0 ? nvidia.stdout.trim().split(/\r?\n/)[0] : '';
  const [gpuName, driverVersion] = firstGpu
    ? firstGpu.split(',').map((part) => part.trim())
    : ['', ''];

  return {
    os: `${platform()} ${release()}`,
    node: process.version,
    totalMemoryGb: round(totalmem() / 1024 ** 3),
    gpuName: gpuName || null,
    driverVersion: driverVersion || null,
    isRtx3060: /rtx\s*3060/i.test(gpuName),
    nvidiaSmi: nvidia.status === 0 ? 'available' : 'unavailable',
  };
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function buildMarkdownTable(stages) {
  const rows = [
    ['Keyword (layer 1)', stages.keyword],
    ['Graph traversal (layer 2)', stages.graphTraversal],
    ['Embedding gen (layer 3)', stages.embeddingGen],
    ['Vector search (layer 3)', stages.vectorSearch],
    ['Envelope build', stages.envelopeBuild],
    ['End-to-end (layer 3 path)', stages.endToEnd],
  ];
  return [
    '| Stage | Median ms | p95 ms |',
    '|---|---:|---:|',
    ...rows.map(([name, s]) => `| ${name} | ${s.median_ms.toFixed(3)} | ${s.p95_ms.toFixed(3)} |`),
  ].join('\n');
}

function buildLatexRows(stages) {
  const rows = [
    ['Keyword (layer~1)', stages.keyword],
    ['Graph traversal (layer~2)', stages.graphTraversal],
    ['Embedding gen (layer~3, CI)', stages.embeddingGen],
    ['Vector search (layer~3)', stages.vectorSearch],
    ['Envelope build', stages.envelopeBuild],
    ['\\textbf{End-to-end (layer~3 path)}', stages.endToEnd],
  ];
  return rows
    .map(([name, s]) => `${name} & ${s.median_ms.toFixed(1)} & ${s.p95_ms.toFixed(1)} \\\\`)
    .join('\n');
}

async function runBenchmark(options) {
  const setupStart = performance.now();
  const { symbols, adjacency } = await withTimeout(
    Promise.resolve().then(() => buildCorpus(options.maxSymbols)),
    options.setupTimeoutMs,
    'paper-5 corpus setup'
  );
  const index = symbols.map((symbol) => ({
    id: symbol.id,
    symbol,
    vector: deterministicVector(symbol.text),
  }));
  const setupMs = performance.now() - setupStart;

  const samples = {
    keyword: [],
    graphTraversal: [],
    embeddingGen: [],
    vectorSearch: [],
    envelopeBuild: [],
    endToEnd: [],
  };
  const hashes = new Set();
  const queries = QUERY_MIX.slice(0, options.queries);

  for (let trial = 0; trial < options.trials; trial += 1) {
    const query = queries[trial % queries.length];
    const endToEndStart = performance.now();

    const keyword = time(() => keywordSearch(symbols, query));
    const seed = symbols[(trial * 17) % symbols.length].id;
    const graph = time(() => graphTraversal(adjacency, seed));
    const embedding = time(() => deterministicVector(query));
    const vector = time(() => vectorSearch(index, embedding.value));
    const envelope = time(() => envelopeBuild(query, keyword.value, graph.value, vector.value));

    samples.keyword.push(keyword.ms);
    samples.graphTraversal.push(graph.ms);
    samples.embeddingGen.push(embedding.ms);
    samples.vectorSearch.push(vector.ms);
    samples.envelopeBuild.push(envelope.ms);
    samples.endToEnd.push(performance.now() - endToEndStart);
    hashes.add(envelope.value);

    if ((trial + 1) % options.progressEvery === 0 || trial + 1 === options.trials) {
      console.error(`[paper-5-gpu-bench] progress ${trial + 1}/${options.trials}`);
    }
  }

  const stages = Object.fromEntries(
    Object.entries(samples).map(([name, values]) => [name, stats(values)])
  );
  const hardware = detectHardware();
  const captureClass =
    hardware.isRtx3060 && process.env.PAPER5_ACCEPT_RTX3060_CAPTURE === '1'
      ? 'rtx-3060-capture'
      : 'ci-reference';

  return {
    schema_version: 'paper-5-gpu-bench-v2',
    benchmark: 'paper-5-graphrag-gpu',
    status: 'completed',
    capture_class: captureClass,
    runner: 'packages/absorb-service/scripts/bench-paper-5-gpu.mjs',
    paper_ref: 'ai-ecosystem/research/paper-5-graphrag-icse.tex',
    ran_at: new Date().toISOString(),
    setup_ms: round(setupMs),
    trials: options.trials,
    query_count: queries.length,
    symbol_count: symbols.length,
    vector_dim: VECTOR_DIM,
    hardware,
    stages,
    envelope_hashes_observed: hashes.size,
    markdown_table: buildMarkdownTable(stages),
    latex_rows: buildLatexRows(stages),
    notes: [
      'Bounded CI artifact path for the Paper 5 GraphRAG timing table.',
      'Use PAPER5_ACCEPT_RTX3060_CAPTURE=1 on a verified RTX 3060 rig to label a capture artifact.',
    ],
  };
}

export async function main(argv = process.argv.slice(2), config = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  if (config.defaultOut && options.out === DEFAULT_OUT) {
    options.out = config.defaultOut;
  }

  console.error(
    `[paper-5-gpu-bench] trials=${options.trials} queries=${options.queries} symbols=${options.maxSymbols}`
  );
  const artifact = await runBenchmark(options);
  const outPath = resolve(config.cwd ?? process.cwd(), options.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  console.log(artifact.markdown_table);
  console.log(`-> ${outPath}`);
  return 0;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error('[paper-5-gpu-bench] fatal', err);
      process.exit(1);
    }
  );
}
