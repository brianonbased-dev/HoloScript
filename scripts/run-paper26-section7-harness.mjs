#!/usr/bin/env node
/**
 * Paper 26 Section 7 benchmark harness.
 *
 * Aggregates the existing HoloGraph/HoloEmbed recall benchmarks and adds a
 * HoloMesh team-protocol coordination measurement for the Section 7 evidence
 * tables. The HoloMesh leg is read-only: it measures the team board endpoint
 * used by room agents instead of posting benchmark chatter into the feed.
 *
 * Usage:
 *   pnpm run bench:paper26:section7
 *   node scripts/run-paper26-section7-harness.mjs --out=.bench-logs/paper26-section7.json
 *   node scripts/run-paper26-section7-harness.mjs --self-test
 *
 * Live HoloMesh measurement env:
 *   HOLOMESH_API_BASE=https://mcp.holoscript.net/api/holomesh
 *   HOLOMESH_TEAM_ID=team_...
 *   HOLOMESH_API_KEY=...
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const DEFAULT_OUT = path.join(REPO_ROOT, '.bench-logs', 'paper26-section7-harness.json');
const DEFAULT_MARKDOWN_OUT = path.join(REPO_ROOT, '.bench-logs', 'paper26-section7-harness.md');
const DEFAULT_HOLOMESH_BASE = 'https://mcp.holoscript.net/api/holomesh';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const outPath = path.resolve(String(args.out ?? DEFAULT_OUT));
const markdownOutPath = args['markdown-out'] === false
  ? null
  : path.resolve(String(args['markdown-out'] ?? DEFAULT_MARKDOWN_OUT));
const selfTest = Boolean(args['self-test']);
const skipTests = Boolean(args['skip-tests']);
const iterations = positiveInt(args.iterations, selfTest ? 3 : 8, 'iterations');
const concurrency = positiveInt(args.concurrency, selfTest ? 2 : 6, 'concurrency');
const timeoutMs = positiveInt(args['timeout-ms'], 15_000, 'timeout-ms');

const startedAt = Date.now();
const gitHead = git(['rev-parse', 'HEAD']).trim() || null;

const codeBench = selfTest
  ? runCodeBenchSelfTest()
  : skipTests
    ? { skipped: true, reason: '--skip-tests', tables: { holographLookup: [], holoembedRecall: [] } }
    : runCodeBenchVitest();

const coordination = await runCoordinationBench({ selfTest, iterations, concurrency, timeoutMs });

const summary = {
  schema: 'holoscript.paper26.section7.harness.v0.1.0',
  generatedAt: new Date().toISOString(),
  generatedBy: 'scripts/run-paper26-section7-harness.mjs',
  gitHead,
  host: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpu: os.cpus()[0]?.model ?? 'unknown',
  },
  durationMs: Date.now() - startedAt,
  codeBench,
  coordination,
  tables: buildPaperTables(codeBench, coordination),
};

writeJson(outPath, summary);
if (markdownOutPath) writeText(markdownOutPath, renderMarkdown(summary, outPath));

printSummary(summary, outPath, markdownOutPath);

const codeBenchOk = codeBench.skipped || codeBench.exitCode === 0 || selfTest;
const coordinationOk = coordination.gate.pass;
process.exit(codeBenchOk && coordinationOk ? 0 : 1);

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      parsed._ ??= [];
      parsed._.push(arg);
      continue;
    }
    const raw = arg.slice(2);
    const eq = raw.indexOf('=');
    if (eq === -1) parsed[raw] = true;
    else parsed[raw.slice(0, eq)] = raw.slice(eq + 1);
  }
  return parsed;
}

function printHelp() {
  console.log(`Paper 26 Section 7 harness

Options:
  --out=<path>            JSON output path (default .bench-logs/paper26-section7-harness.json)
  --markdown-out=<path>   Markdown output path (default .bench-logs/paper26-section7-harness.md)
  --skip-tests            Do not run existing HoloGraph/HoloEmbed Vitest benchmarks
  --self-test             Use embedded fixture output and offline coordination path
  --iterations=N          Sequential HoloMesh board reads (default 8)
  --concurrency=N         Concurrent HoloMesh board reads for throughput (default 6)
  --timeout-ms=N          Per-request timeout (default 15000)

Env for live HoloMesh:
  HOLOMESH_API_BASE, HOLOMESH_TEAM_ID, HOLOMESH_API_KEY`);
}

function positiveInt(value, fallback, label) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${label} must be a positive integer`);
  return n;
}

function resolvePnpm() {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && /pnpm/i.test(path.basename(npmExecPath)) && /\.(c|m)?js$/i.test(npmExecPath)) {
    return { command: process.execPath, args: [npmExecPath] };
  }
  if (process.platform === 'win32') {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'pnpm'] };
  }
  return { command: 'pnpm', args: [] };
}

function git(argv) {
  const result = spawnSync('git', argv, { cwd: REPO_ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout : '';
}

function runCodeBenchVitest() {
  const pnpm = resolvePnpm();
  const commandArgs = [
    ...pnpm.args,
    '--filter',
    '@holoscript/absorb-service',
    'exec',
    'vitest',
    'run',
    'src/engine/__tests__/Paper26Table2NLRecall.test.ts',
    'src/engine/__tests__/Paper26Benchmark.test.ts',
    '--reporter=verbose',
  ];
  const started = Date.now();
  const result = spawnSync(pnpm.command, commandArgs, {
    cwd: REPO_ROOT,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
  });
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return {
    command: `${pnpm.command} ${commandArgs.join(' ')}`,
    exitCode: result.status ?? 1,
    durationMs: Date.now() - started,
    tables: parseCodeBenchTables(combined),
    outputDigest: fnv1aHex(combined),
    outputTail: combined.split(/\r?\n/).slice(-80).join('\n'),
    ...(result.error ? { error: result.error.message } : {}),
  };
}

function runCodeBenchSelfTest() {
  const fixture = `
% Paper 26 Table 2 - NL->code Recall@10 (offline providers only)
% Provider      | Recall@10 | Notes
% --------------|-----------|----------------------------------
%  structural   |      0.0% | topology only, no name encoding
%  holoembed    |     90.0% | structural + char-trigram subwords
% Paper 26 Table 1 - Event-chain lookup: HoloGraph O(1) vs Embedding O(N*D)
% Files | Syms  | Events | HG us   | Emb us  | HG recall | Emb recall@10 | Speedup
%     50 |   200 |     10 |   2.060 |   567.1 |     1.000 |         0.125 |   275.3x
%    500 |  2000 |     50 |   6.770 |  4360.2 |     1.000 |         0.025 |   644.0x
`;
  return {
    selfTest: true,
    exitCode: 0,
    durationMs: 0,
    tables: parseCodeBenchTables(fixture),
    outputDigest: fnv1aHex(fixture),
  };
}

function parseCodeBenchTables(text) {
  const holographLookup = [];
  const holoembedRecall = [];

  for (const line of text.split(/\r?\n/)) {
    const eventRow = line.match(
      /^%\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\S*(?:\s*\|\s*(.+))?/
    );
    if (eventRow) {
      holographLookup.push({
        provider: eventRow[9]?.trim() || 'StructuralEmbeddingProvider',
        files: Number(eventRow[1]),
        symbols: Number(eventRow[2]),
        events: Number(eventRow[3]),
        holoGraphQueryUs: Number(eventRow[4]),
        embeddingQueryUs: Number(eventRow[5]),
        holoGraphRecall: Number(eventRow[6]),
        embeddingRecallAt10: Number(eventRow[7]),
        speedupRatio: Number(eventRow[8]),
      });
      continue;
    }

    const recallRow = line.match(/^%\s*(structural|holoembed)\s*\|\s*([\d.]+)%\s*\|\s*(.*)$/i);
    if (recallRow) {
      holoembedRecall.push({
        provider: recallRow[1].toLowerCase(),
        recallAt10: Number(recallRow[2]) / 100,
        notes: recallRow[3].trim(),
      });
    }
  }

  return { holographLookup, holoembedRecall };
}

async function runCoordinationBench({ selfTest, iterations, concurrency, timeoutMs }) {
  if (selfTest) return runOfflineCoordinationBench({ iterations, concurrency });

  const apiBase = String(args['api-base'] ?? process.env.HOLOMESH_API_BASE ?? process.env.HOLOMESH_API_URL ?? DEFAULT_HOLOMESH_BASE).replace(/\/$/, '');
  const teamId = String(args['team-id'] ?? process.env.HOLOMESH_TEAM_ID ?? process.env.TEAM_ID ?? '');
  const apiKey = String(args['api-key'] ?? process.env.HOLOMESH_API_KEY ?? process.env.HOLOSCRIPT_API_KEY ?? process.env.MCP_API_KEY ?? '');

  if (!teamId || !apiKey) {
    return {
      mode: 'offline-synthetic',
      reason: 'missing HOLOMESH_TEAM_ID or HOLOMESH_API_KEY; live protocol leg skipped',
      ...runOfflineCoordinationBench({ iterations, concurrency }),
    };
  }

  const endpoint = `${apiBase}/team/${encodeURIComponent(teamId)}/board?limit=120`;
  const headers = {
    authorization: `Bearer ${apiKey}`,
    'x-mcp-api-key': apiKey,
    accept: 'application/json',
  };

  const sequential = [];
  let lastPayload = null;
  for (let i = 0; i < iterations; i++) {
    const measurement = await timedJsonFetch(endpoint, { headers, timeoutMs });
    sequential.push(measurement);
    if (measurement.ok) lastPayload = measurement.sample;
  }

  const burstStarted = performance.now();
  const burst = await Promise.all(
    Array.from({ length: concurrency }, () => timedJsonFetch(endpoint, { headers, timeoutMs }))
  );
  const burstWallMs = performance.now() - burstStarted;

  const okLatencies = sequential.filter((m) => m.ok).map((m) => m.latencyMs);
  const burstOk = burst.filter((m) => m.ok);
  const successRate = sequential.filter((m) => m.ok).length / sequential.length;
  const burstSuccessRate = burstOk.length / burst.length;
  const p95 = percentile(okLatencies, 0.95);

  return {
    mode: 'live-holomesh',
    protocol: 'GET /api/holomesh/team/:teamId/board',
    apiBase: redactUrl(apiBase),
    teamId,
    iterations,
    concurrency,
    sequential: summarizeLatencies(okLatencies, sequential.length),
    burst: {
      requests: concurrency,
      ok: burstOk.length,
      wallMs: round(burstWallMs, 3),
      throughputRps: round(burstOk.length / Math.max(burstWallMs / 1000, 0.001), 3),
      p50Ms: percentile(burstOk.map((m) => m.latencyMs), 0.5),
      p95Ms: percentile(burstOk.map((m) => m.latencyMs), 0.95),
    },
    sample: summarizeBoardPayload(lastPayload),
    errors: [...sequential, ...burst].filter((m) => !m.ok).slice(0, 5).map((m) => m.error),
    gate: {
      pass: successRate >= 0.95 && burstSuccessRate >= 0.95 && Number.isFinite(p95),
      successRate,
      burstSuccessRate,
      p95Ms: p95,
    },
  };
}

function runOfflineCoordinationBench({ iterations, concurrency }) {
  const sequentialLatencies = Array.from({ length: iterations }, (_, i) => 0.08 + i * 0.01);
  const burstWallMs = Math.max(0.1, concurrency * 0.05);
  return {
    mode: 'offline-synthetic',
    protocol: 'in-process team-board snapshot fixture',
    iterations,
    concurrency,
    sequential: summarizeLatencies(sequentialLatencies, iterations),
    burst: {
      requests: concurrency,
      ok: concurrency,
      wallMs: round(burstWallMs, 3),
      throughputRps: round(concurrency / Math.max(burstWallMs / 1000, 0.001), 3),
      p50Ms: percentile(sequentialLatencies, 0.5),
      p95Ms: percentile(sequentialLatencies, 0.95),
    },
    sample: { totalTasks: 5, open: 2, claimed: 3, blocked: 0 },
    errors: [],
    gate: {
      pass: true,
      successRate: 1,
      burstSuccessRate: 1,
      p95Ms: percentile(sequentialLatencies, 0.95),
    },
  };
}

async function timedJsonFetch(url, { headers, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text.slice(0, 200) };
    }
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: round(performance.now() - started, 3),
      sample: parsed,
      ...(response.ok ? {} : { error: `HTTP ${response.status}: ${text.slice(0, 180)}` }),
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: round(performance.now() - started, 3),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function summarizeBoardPayload(payload) {
  if (!payload) return null;
  const tasks = Array.isArray(payload.tasks)
    ? payload.tasks
    : [
        ...(payload.board?.open ?? []),
        ...(payload.board?.claimed ?? []),
        ...(payload.board?.blocked ?? []),
      ];
  if (!Array.isArray(tasks)) return { shape: Object.keys(payload).sort() };
  return {
    totalTasks: tasks.length,
    open: tasks.filter((t) => t.status === 'open').length,
    claimed: tasks.filter((t) => t.status === 'claimed').length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
  };
}

function summarizeLatencies(latencies, requested) {
  return {
    requested,
    ok: latencies.length,
    minMs: percentile(latencies, 0),
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    maxMs: percentile(latencies, 1),
    meanMs: round(latencies.reduce((sum, value) => sum + value, 0) / Math.max(latencies.length, 1), 3),
    throughputRps: round(latencies.length / Math.max(latencies.reduce((sum, value) => sum + value, 0) / 1000, 0.001), 3),
  };
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (p <= 0) return round(sorted[0], 3);
  if (p >= 1) return round(sorted[sorted.length - 1], 3);
  const idx = Math.ceil(p * sorted.length) - 1;
  return round(sorted[Math.max(0, Math.min(sorted.length - 1, idx))], 3);
}

function buildPaperTables(codeBench, coordination) {
  const table73 = codeBench.tables?.holographLookup ?? [];
  const table74 = codeBench.tables?.holoembedRecall ?? [];
  const table75 = {
    mode: coordination.mode,
    sequentialP50Ms: coordination.sequential?.p50Ms ?? null,
    sequentialP95Ms: coordination.sequential?.p95Ms ?? null,
    sequentialThroughputRps: coordination.sequential?.throughputRps ?? null,
    burstThroughputRps: coordination.burst?.throughputRps ?? null,
    successRate: coordination.gate?.successRate ?? null,
  };
  return {
    '7.3_holograph_lookup': table73,
    '7.4_holoembed_recall': table74,
    '7.5_holomesh_coordination': table75,
  };
}

function renderMarkdown(summary, jsonPath) {
  const hgRows = summary.tables['7.3_holograph_lookup'];
  const heRows = summary.tables['7.4_holoembed_recall'];
  const hm = summary.tables['7.5_holomesh_coordination'];

  const hgTable = hgRows.length
    ? [
        '| Provider | Files | Symbols | Events | HoloGraph us | Embedding us | HG recall | Emb recall@10 | Speedup |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
        ...hgRows.map((r) => `| ${r.provider} | ${r.files} | ${r.symbols} | ${r.events} | ${r.holoGraphQueryUs} | ${r.embeddingQueryUs} | ${r.holoGraphRecall} | ${r.embeddingRecallAt10} | ${r.speedupRatio}x |`),
      ].join('\n')
    : '_Skipped or unavailable._';

  const heTable = heRows.length
    ? [
        '| Provider | Recall@10 | Notes |',
        '|---|---:|---|',
        ...heRows.map((r) => `| ${r.provider} | ${(r.recallAt10 * 100).toFixed(1)}% | ${r.notes} |`),
      ].join('\n')
    : '_Skipped or unavailable._';

  return `# Paper 26 Section 7 Harness Evidence

Generated: ${summary.generatedAt}

JSON artifact: ${path.relative(REPO_ROOT, jsonPath).replace(/\\/g, '/')}
Git HEAD: ${summary.gitHead ?? 'unknown'}

## Table 7.3 - HoloGraph Event-Chain Lookup

${hgTable}

## Table 7.4 - HoloEmbed NL-to-Code Recall

${heTable}

## Table 7.5 - HoloMesh Team-Protocol Coordination

| Mode | Sequential p50 ms | Sequential p95 ms | Sequential req/s | Burst req/s | Success rate |
|---|---:|---:|---:|---:|---:|
| ${hm.mode} | ${hm.sequentialP50Ms ?? 'n/a'} | ${hm.sequentialP95Ms ?? 'n/a'} | ${hm.sequentialThroughputRps ?? 'n/a'} | ${hm.burstThroughputRps ?? 'n/a'} | ${hm.successRate === null ? 'n/a' : `${(hm.successRate * 100).toFixed(1)}%`} |

Coordination protocol: ${summary.coordination.protocol}
`;
}

function printSummary(summary, jsonPath, markdownPath) {
  const hm = summary.tables['7.5_holomesh_coordination'];
  console.log('Paper 26 Section 7 harness complete');
  console.log(`  JSON: ${path.relative(REPO_ROOT, jsonPath)}`);
  if (markdownPath) console.log(`  Markdown: ${path.relative(REPO_ROOT, markdownPath)}`);
  console.log(`  Code bench exit: ${summary.codeBench.exitCode ?? 'skipped'}`);
  console.log(`  HoloMesh mode: ${hm.mode}`);
  console.log(`  HoloMesh p95: ${hm.sequentialP95Ms ?? 'n/a'} ms`);
  console.log(`  HoloMesh burst throughput: ${hm.burstThroughputRps ?? 'n/a'} req/s`);
}

function writeJson(target, data) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeText(target, data) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, data, 'utf8');
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function fnv1aHex(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a32:${h.toString(16).padStart(8, '0')}`;
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return 'invalid-url';
  }
}
