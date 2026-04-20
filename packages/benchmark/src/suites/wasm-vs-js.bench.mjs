#!/usr/bin/env node
/**
 * WASM vs JS Parser Benchmark — TODO-R2 (internal scope).
 *
 * Compares HoloScript's two parser implementations on the canonical
 * benchmark fixtures (small/medium/large `.hsplus`):
 *
 *   1. JS parser  — `HoloScriptPlusParser` from `@holoscript/core`
 *   2. WASM parser — `holoscript-wasm` Rust crate compiled via wasm-pack
 *
 * The native Rust upper bound is measured by the sibling
 * `parser_bench` binary in `packages/compiler-wasm/src/bin/parser_bench.rs`
 * (run separately with `cargo run --release -p holoscript-wasm
 * --bin parser_bench`).
 *
 * Output: stdout JSON matching the schema in
 * `packages/benchmark/src/index.ts` (suites=[JsParser, WasmParser]).
 *
 * This is the internal slice of the original TODO-R2 ambition
 * (Unity WebGL vs Bevy vs Godot vs HoloScript). The cross-engine
 * comparisons require external engines and a full game-engine
 * harness — see `research/2026-04-19_todo-r2-wasm-bench-results.md`
 * for the handoff and methodology for Phase 2.
 *
 * Skip rules:
 *   - If the WASM module is not built (no `pkg-node/`), the WASM
 *     suite is skipped with a `built: false` flag and a clear
 *     instruction in stderr.
 *   - The JS suite always runs (core ships built).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve repo root — this file lives at
// packages/benchmark/src/suites/wasm-vs-js.bench.mjs, so go up 4.
const repoRoot = resolve(__dirname, '../../../..');
const fixturesDir = resolve(repoRoot, 'packages/benchmark/fixtures');

function loadFixture(name) {
  return readFileSync(resolve(fixturesDir, name), 'utf-8');
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p));
  return sorted[idx];
}

/**
 * Run `fn` for ~`targetMs` wall-clock time. Returns timing stats in microseconds.
 *
 * Uses `process.hrtime.bigint()` (sub-microsecond precision) and discards
 * a configurable warm-up phase to let JIT settle.
 */
function timeIt(name, fn, { targetMs = 1000, warmup = 5, bytes = 0 } = {}) {
  // Warm-up
  for (let i = 0; i < warmup; i++) fn();

  const samples = [];
  const start = process.hrtime.bigint();
  const targetNs = BigInt(targetMs) * 1_000_000n;

  while (process.hrtime.bigint() - start < targetNs) {
    const t0 = process.hrtime.bigint();
    fn();
    const dtNs = process.hrtime.bigint() - t0;
    // ns -> us
    samples.push(Number(dtNs) / 1000);
  }

  samples.sort((a, b) => a - b);
  const n = samples.length;
  const mean = samples.reduce((s, v) => s + v, 0) / n;
  const median = percentile(samples, 0.5);
  const p99 = percentile(samples, 0.99);
  const opsPerSec = 1_000_000 / median;
  const bytesPerSec = bytes * opsPerSec;

  return {
    name,
    samples: n,
    bytes,
    median_us: Number(median.toFixed(3)),
    mean_us: Number(mean.toFixed(3)),
    p99_us: Number(p99.toFixed(3)),
    ops_per_sec: Number(opsPerSec.toFixed(1)),
    bytes_per_sec: Number(bytesPerSec.toFixed(1)),
  };
}

// ── Load JS parser ────────────────────────────────────────────────
let jsParser = null;
let jsLoadError = null;
try {
  const corePath = resolve(repoRoot, 'packages/core/dist/index.js');
  // Use require (CJS interop) since the core dist is mixed CJS/ESM.
  const core = require(corePath);
  jsParser = new core.HoloScriptPlusParser();
} catch (err) {
  jsLoadError = err?.message ?? String(err);
}

// ── Load WASM parser ──────────────────────────────────────────────
let wasm = null;
let wasmLoadError = null;
const wasmPkgPath = resolve(
  repoRoot,
  'packages/compiler-wasm/pkg-node/holoscript_wasm.js'
);
if (existsSync(wasmPkgPath)) {
  try {
    wasm = require(wasmPkgPath);
  } catch (err) {
    wasmLoadError = err?.message ?? String(err);
  }
} else {
  wasmLoadError = `pkg-node not found at ${wasmPkgPath}. Build with: cd packages/compiler-wasm && wasm-pack build --target nodejs --out-dir pkg-node`;
}

// ── Fixtures ──────────────────────────────────────────────────────
const small = loadFixture('small.hsplus');
const medium = loadFixture('medium.hsplus');
const large = loadFixture('large.hsplus');

const fixtures = [
  { name: 'parse-small (32 lines)', source: small },
  { name: 'parse-medium (78 lines)', source: medium },
  { name: 'parse-large (142 lines)', source: large },
];

const targetMs = Number(process.env.BENCH_TIME_MS ?? 1000);

// ── Run JS suite ──────────────────────────────────────────────────
const jsResults = [];
if (jsParser) {
  for (const f of fixtures) {
    jsResults.push(
      timeIt(f.name, () => jsParser.parse(f.source), {
        targetMs,
        bytes: Buffer.byteLength(f.source, 'utf-8'),
      })
    );
  }
} else {
  process.stderr.write(`[skip] JS suite: ${jsLoadError}\n`);
}

// ── Run WASM suite ────────────────────────────────────────────────
const wasmResults = [];
if (wasm) {
  for (const f of fixtures) {
    wasmResults.push(
      timeIt(f.name, () => wasm.parse(f.source), {
        targetMs,
        bytes: Buffer.byteLength(f.source, 'utf-8'),
      })
    );
  }
} else {
  process.stderr.write(`[skip] WASM suite: ${wasmLoadError}\n`);
}

// ── Output ────────────────────────────────────────────────────────
const output = {
  benchmark: 'wasm-vs-js-parser',
  task: 'TODO-R2 (internal scope)',
  timestamp: new Date().toISOString(),
  node_version: process.version,
  platform: process.platform,
  arch: process.arch,
  target_ms: targetMs,
  suites: [
    {
      suite: 'JsParser',
      runtime: `node-${process.version}`,
      built: jsParser !== null,
      load_error: jsLoadError,
      results: jsResults,
    },
    {
      suite: 'WasmParser',
      runtime: `wasm32-via-node-${process.version}`,
      built: wasm !== null,
      load_error: wasmLoadError,
      wasm_opt_applied: false, // see research/2026-04-19_todo-r2-wasm-bench-results.md §wasm-opt
      results: wasmResults,
    },
  ],
};

console.log(JSON.stringify(output, null, 2));

// Human-readable summary on stderr.
process.stderr.write('\n=== WASM vs JS parser benchmark ===\n');
for (const suite of output.suites) {
  if (!suite.built) {
    process.stderr.write(`  [${suite.suite}] SKIPPED: ${suite.load_error}\n`);
    continue;
  }
  process.stderr.write(`\n  [${suite.suite}]  ${suite.runtime}\n`);
  for (const r of suite.results) {
    process.stderr.write(
      `    ${r.name.padEnd(32)} median ${r.median_us
        .toFixed(2)
        .padStart(9)} us   p99 ${r.p99_us.toFixed(2).padStart(9)} us   ${r.ops_per_sec
        .toFixed(0)
        .padStart(8)} ops/s   (${r.samples} samples)\n`
    );
  }
}

// Compute speedup ratios if both ran.
if (jsResults.length === wasmResults.length && jsResults.length > 0) {
  process.stderr.write('\n  [Speedup: WASM vs JS]\n');
  for (let i = 0; i < jsResults.length; i++) {
    const js = jsResults[i];
    const wasmR = wasmResults[i];
    const speedup = js.median_us / wasmR.median_us;
    const arrow = speedup > 1 ? '↑ wasm faster' : '↓ js faster';
    process.stderr.write(
      `    ${js.name.padEnd(32)} ${speedup.toFixed(2)}x  ${arrow}\n`
    );
  }
}
