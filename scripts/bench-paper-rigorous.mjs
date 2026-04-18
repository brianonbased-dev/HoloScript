#!/usr/bin/env node
// bench-paper-rigorous.mjs
//
// Single-command runner for paper-grade benchmark harnesses: higher iteration
// counts than routine CI, median + p99 from sorted samples, hardware-stable
// numbers suitable for inclusion in manuscripts.
//
// Usage:
//   pnpm run bench:paper-rigorous
//   pnpm run bench:paper-rigorous -- --only=tropical
//   node scripts/bench-paper-rigorous.mjs --only=a,b,c   (Windows PowerShell: commas
//     are stripped by pnpm/npm; call node directly for multi-id --only lists)
//   BENCH_N=1000 pnpm run bench:paper-rigorous        (override default)
//
// Output: one log file per harness in .bench-logs/<timestamp>/, plus a
// summary table printed to stdout. Exits nonzero if any harness fails.
//
// Author discipline: this script is the ONLY sanctioned way to produce
// numbers destined for a paper prose/table. Avoids the "which env vars
// did I use last time?" problem by fixing a canonical set below. Edit
// the DEFAULTS block to adjust; do not freelance env vars on the command
// line unless you document which harness they affect.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

// ────────────────────────────────────────────────────────────────────────────
// Canonical env-var set for paper-grade runs. Higher N = more stable p99.
// ────────────────────────────────────────────────────────────────────────────
const DEFAULTS = {
  BENCH_N: '500',           // paper-benchmarks.test.ts contract overhead
  BENCH_N_LARGE: '30',      // tropical-shortest-paths.benchmark.test.ts large N
  BENCH_SNAPSHOT_N: '30',   // tropical-shortest-paths.benchmark.test.ts snapshot
};

// ────────────────────────────────────────────────────────────────────────────
// Harness registry. Each entry describes one benchmark run.
//
// "package" is the pnpm filter target.
// "file" is the test path relative to the package.
// "nameFilter" is the -t grep (use exact describe/it name fragment).
// "timeoutMs" is the vitest --testTimeout override; raise for slow harnesses.
// ────────────────────────────────────────────────────────────────────────────
const HARNESSES = [
  {
    id: 'contract-overhead',
    description: 'Contract enforcement overhead on TET4 solver (N=BENCH_N)',
    package: '@holoscript/engine',
    file: 'src/simulation/__tests__/paper-benchmarks.test.ts',
    nameFilter: 'Contract Overhead',
    timeoutMs: 600000,
  },
  {
    id: 'geometry-hashing',
    description: 'Geometry hashing cost across mesh sizes',
    package: '@holoscript/engine',
    file: 'src/simulation/__tests__/paper-benchmarks.test.ts',
    nameFilter: 'geometry hashing',
    timeoutMs: 120000,
  },
  {
    id: 'cael-replay',
    description: 'CAEL replay throughput + hash verification',
    package: '@holoscript/engine',
    file: 'src/simulation/__tests__/paper-cael-replay-benchmark.test.ts',
    nameFilter: null,
    timeoutMs: 300000,
  },
  {
    id: 'loro-spatial',
    description: 'Loro CRDT spatial ops median/p99',
    package: '@holoscript/crdt',
    file: 'src/__tests__/LoroSpatialBenchmark.test.ts',
    nameFilter: null,
    timeoutMs: 300000,
  },
  {
    id: 'tropical-crossover',
    description: 'Tropical APSP GPU crossover sweep',
    package: '@holoscript/snn-webgpu',
    file: 'src/__tests__/tropical-shortest-paths.benchmark.test.ts',
    nameFilter: 'GPU crossover',
    timeoutMs: 1_200_000,
  },
  {
    id: 'dumb-glass',
    description: 'Rendering provenance overhead at 60Hz',
    package: '@holoscript/r3f-renderer',
    file: 'src/__tests__/dumb-glass.test.ts',
    nameFilter: null,
    timeoutMs: 300000,
  },
  {
    id: 'graphrag-determinism',
    description: 'GraphRAG envelope determinism + overhead',
    package: '@holoscript/mcp-server',
    file: 'src/__tests__/graphrag-determinism.test.ts',
    nameFilter: null,
    timeoutMs: 300000,
  },
  {
    id: 'sandbox-overhead',
    description: 'Plugin sandbox overhead three-tier',
    package: '@holoscript/core',
    file: 'src/plugins/__tests__/paper-4-sandbox-bench.test.ts',
    nameFilter: null,
    timeoutMs: 300000,
  },
  {
    id: 'multitarget-compile',
    description: 'Multi-target compile with provenance embedding',
    package: '@holoscript/core',
    file: 'src/compiler/__tests__/paper-10-multitarget-bench.test.ts',
    nameFilter: null,
    timeoutMs: 120000,
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Argument parsing
// ────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only='));
const onlyIds = onlyArg ? onlyArg.slice('--only='.length).split(',') : null;

const harnesses = onlyIds
  ? HARNESSES.filter((h) => onlyIds.includes(h.id))
  : HARNESSES;

if (onlyIds && harnesses.length === 0) {
  console.error(`No harnesses matched --only=${onlyArg.slice(7)}.`);
  console.error('Available ids:');
  for (const h of HARNESSES) console.error(`  ${h.id.padEnd(22)} ${h.description}`);
  process.exit(2);
}

// ────────────────────────────────────────────────────────────────────────────
// Timestamped log directory
// ────────────────────────────────────────────────────────────────────────────
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logDir = resolve(REPO_ROOT, '.bench-logs', timestamp);
mkdirSync(logDir, { recursive: true });

// Hardware annotation captured once at start
const os = await import('node:os');
const hardwareAnnotation = [
  `timestamp: ${new Date().toISOString()}`,
  `host: ${os.hostname()}`,
  `platform: ${os.platform()} ${os.release()}`,
  `arch: ${os.arch()}`,
  `cpus: ${os.cpus().length}x ${os.cpus()[0]?.model ?? 'unknown'}`,
  `totalmem: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GiB`,
  `node: ${process.version}`,
  `BENCH_N: ${process.env.BENCH_N ?? DEFAULTS.BENCH_N}`,
  `BENCH_N_LARGE: ${process.env.BENCH_N_LARGE ?? DEFAULTS.BENCH_N_LARGE}`,
  `BENCH_SNAPSHOT_N: ${process.env.BENCH_SNAPSHOT_N ?? DEFAULTS.BENCH_SNAPSHOT_N}`,
].join('\n');

writeFileSync(resolve(logDir, '_hardware.txt'), hardwareAnnotation + '\n');
console.log(hardwareAnnotation);
console.log();

// ────────────────────────────────────────────────────────────────────────────
// Run each harness sequentially (parallel would contend for CPU/GPU)
// ────────────────────────────────────────────────────────────────────────────
const env = { ...process.env };
for (const [k, v] of Object.entries(DEFAULTS)) {
  if (env[k] === undefined) env[k] = v;
}

const results = [];
for (const h of harnesses) {
  console.log(`──── ${h.id} ── ${h.description}`);
  const startMs = Date.now();

  const vitestArgs = [
    '--filter', h.package, 'exec', 'vitest', 'run',
    h.file,
    '--reporter=verbose',
    '--testTimeout', String(h.timeoutMs),
  ];
  if (h.nameFilter) {
    vitestArgs.push('-t', h.nameFilter);
  }

  const proc = spawnSync('pnpm', vitestArgs, {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  });

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  const logPath = resolve(logDir, `${h.id}.log`);
  const fullOutput = [
    `# ${h.id} — ${h.description}`,
    `# elapsed: ${elapsedSec}s`,
    `# exit: ${proc.status}`,
    '',
    '=== STDOUT ===',
    proc.stdout ?? '',
    '',
    '=== STDERR ===',
    proc.stderr ?? '',
  ].join('\n');
  writeFileSync(logPath, fullOutput);

  const status = proc.status === 0 ? 'OK' : 'FAIL';
  console.log(`  → ${status} in ${elapsedSec}s · log: ${logPath}`);
  console.log();

  results.push({ id: h.id, status: proc.status === 0, elapsedSec, logPath });
}

// ────────────────────────────────────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────────────────────────────────────
console.log('━━━━ Summary ━━━━');
let failed = 0;
for (const r of results) {
  const mark = r.status ? 'OK  ' : 'FAIL';
  console.log(`  ${mark}  ${r.id.padEnd(22)}  ${String(r.elapsedSec).padStart(7)}s`);
  if (!r.status) failed += 1;
}
console.log();
console.log(`Logs: ${logDir}`);
console.log(`Failed: ${failed} / ${results.length}`);

if (failed > 0) process.exit(1);
