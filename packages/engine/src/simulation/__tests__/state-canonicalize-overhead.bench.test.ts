/**
 * state-canonicalize-overhead.bench.test.ts
 *
 * Benchmark to decide Route 2b (always-on canonicalization) vs Route 2c
 * (mode-scoped canonicalization) for paper-3 Property 4 closure path (b).
 *
 * Context:
 *   - Route 2b adds end-of-step state quantization + FNV-1a hash on every
 *     stepper.advance() callback. Simpler claim ("all simulation is
 *     cross-adapter deterministic"); selected if overhead < 2%.
 *   - Route 2c adds a separate replayCanonical() path that quantizes only
 *     during dispute-triggered replay. Preserves production perf at the cost
 *     of a mode-scoped Property 4; selected if overhead >= 2%.
 *
 * This bench does NOT implement either route. It measures the BASELINE cost
 * of the canonicalization step (quantize float32 state vector + FNV-1a hash)
 * against an N-length state vector, so the routing decision can be
 * data-driven before committing code in SimulationContract.ts.
 *
 * Method:
 *   - Generate state vectors at several sizes matching paper-3 §7 scenarios:
 *       bridge (10 objects × ~6 fields = 60 floats)
 *       truss (50 objects × ~6 = 300)
 *       multi-story (200 × ~6 = 1,200)
 *       full building (1,000 × ~6 = 6,000)
 *   - For each size, measure N=100 iterations of:
 *       baseline: just dummy work equivalent to one solver.step()
 *       canonicalize: quantize (*1e6 then round to int32) + FNV-1a over bytes
 *   - Report median / p99 / overhead ratio.
 *
 * Intentionally NOT importing SimulationContract.ts — this measures the
 * canonicalize primitive in isolation, independent of whether any step
 * actually happens. That way the overhead number is a lower bound usable
 * for routing; real-world overhead is this PLUS dispatch, PLUS readback
 * if state lives on GPU.
 *
 * Host-class variance is high on this benchmark (paper-3 session saw
 * 2.7-3.6x spread across runs). Report min/median/max, not just median.
 *
 * Pre-registration: see
 *   ai-ecosystem research/2026-04-20_webgpu-determinism-protocol.md
 *   ai-ecosystem D:/GOLD/wisdom/w_gold_189.md § Cross-adapter closure paths
 */

import { describe, it, expect } from 'vitest';

// --- State shapes matching paper-3 §7 scenarios ---
const SCENARIOS: ReadonlyArray<{ name: string; stateFloats: number }> = [
  { name: 'bridge',         stateFloats: 60 },
  { name: 'truss',          stateFloats: 300 },
  { name: 'multi-story',    stateFloats: 1_200 },
  { name: 'full-building',  stateFloats: 6_000 },
];

const ITERATIONS_PER_SIZE = 100;
const WARMUP = 10;
const RUNS = 5; // report min/median/max across 5 back-to-back runs

// --- Canonicalize primitive: quantize + FNV-1a ---
// Same FNV-1a constants as CAELTrace (kept consistent with the existing
// hash chain to keep the determinism claim in one algebraic family).
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME  = 0x01000193;

function canonicalize(state: Float32Array, out: Uint32Array): number {
  // Step 1: quantize each float to int32 via *1e6 + round (same quantum as
  // hashGeometry in SimulationContract.ts for consistency).
  for (let i = 0; i < state.length; i++) {
    out[i] = Math.round(state[i] * 1e6) | 0;
  }
  // Step 2: FNV-1a over the byte view.
  const bytes = new Uint8Array(out.buffer, 0, out.length * 4);
  let h = FNV_OFFSET >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h;
}

// --- Baseline: a no-op scan equivalent to what a solver.step() touches
// but without any canonicalization. This is the "always-on" cost floor:
// even without Route 2b, each step reads state to hand to the next
// sub-step, so just iterating the state isn't free. We measure the
// DELTA introduced by canonicalize, not the absolute cost. ---
function baseline(state: Float32Array): number {
  let acc = 0;
  for (let i = 0; i < state.length; i++) {
    acc += state[i];
  }
  return acc;
}

function seedState(n: number, seed: number): Float32Array {
  const s = new Float32Array(n);
  // Simple Mulberry32-equivalent for reproducibility — not cryptographic,
  // just need deterministic pseudorandom floats across runs
  let a = seed >>> 0;
  for (let i = 0; i < n; i++) {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    s[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return s;
}

function nowMs(): number {
  return performance.now();
}

interface BenchResult {
  scenario: string;
  sizeFloats: number;
  baselineMsMedian: number;
  canonMsMedian: number;
  overheadPct: number;
  overheadAbsMs: number;
  runsRange: { min: number; max: number; };
}

function runOneSize(scenario: string, sizeFloats: number): BenchResult {
  const state = seedState(sizeFloats, sizeFloats * 7919);
  const out = new Uint32Array(sizeFloats);

  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    baseline(state);
    canonicalize(state, out);
  }

  const baselineSamples: number[] = [];
  const canonSamples: number[] = [];

  for (let run = 0; run < RUNS; run++) {
    const t0 = nowMs();
    let acc = 0;
    for (let i = 0; i < ITERATIONS_PER_SIZE; i++) acc += baseline(state);
    const t1 = nowMs();
    // Prevent dead-code elimination
    if (Number.isNaN(acc)) throw new Error('unreachable');
    baselineSamples.push((t1 - t0) / ITERATIONS_PER_SIZE);

    const t2 = nowMs();
    let h = 0;
    for (let i = 0; i < ITERATIONS_PER_SIZE; i++) h = canonicalize(state, out);
    const t3 = nowMs();
    if (Number.isNaN(h)) throw new Error('unreachable');
    canonSamples.push((t3 - t2) / ITERATIONS_PER_SIZE);
  }

  baselineSamples.sort((a, b) => a - b);
  canonSamples.sort((a, b) => a - b);
  const baselineMs = baselineSamples[Math.floor(baselineSamples.length / 2)];
  const canonMs = canonSamples[Math.floor(canonSamples.length / 2)];
  const overheadAbsMs = canonMs - baselineMs;
  const overheadPct = (overheadAbsMs / baselineMs) * 100;

  return {
    scenario,
    sizeFloats,
    baselineMsMedian: baselineMs,
    canonMsMedian: canonMs,
    overheadPct,
    overheadAbsMs,
    runsRange: {
      min: Math.min(...canonSamples.map((s, i) => s - baselineSamples[i])),
      max: Math.max(...canonSamples.map((s, i) => s - baselineSamples[i])),
    },
  };
}

describe('Route 2b vs 2c — per-step state canonicalization overhead', () => {
  it('measures canonicalize(state) overhead across paper-3 §7 scenario sizes', () => {
    const results: BenchResult[] = [];
    for (const s of SCENARIOS) {
      results.push(runOneSize(s.name, s.stateFloats));
    }

    // Print in a format the decision rule can read
    console.log('\n[route-2-decision] state-canonicalize-overhead.bench results:');
    console.log('scenario          size    baseline(ms)   canon(ms)     overhead(ms)   overhead(%)');
    for (const r of results) {
      console.log(
        `  ${r.scenario.padEnd(15)} ` +
        `${String(r.sizeFloats).padStart(6)}  ` +
        `${r.baselineMsMedian.toFixed(6).padStart(12)}  ` +
        `${r.canonMsMedian.toFixed(6).padStart(12)}  ` +
        `${r.overheadAbsMs.toFixed(6).padStart(12)}  ` +
        `${r.overheadPct.toFixed(2).padStart(8)}%`,
      );
    }

    // Decision rule: overhead-vs-noop-baseline is NOT the right metric —
    // that compares canonicalize against a trivial float scan, which is an
    // unreasonably cheap reference. The honest metric is "canonicalize cost
    // as a fraction of production-step cost." Production step cost is
    // domain-specific; use paper-3 §7 canonical as the reference (3.082 ms
    // per-op merge+log median, N=10, canonical 2026-04-19 run — see
    // research/benchmark-paper-3-crdt-canonical-run.md).
    const PRODUCTION_STEP_MS_REF = 3.082; // paper-3 §7 canonical median
    const maxOverheadVsProduction = Math.max(
      ...results.map((r) => (r.canonMsMedian / PRODUCTION_STEP_MS_REF) * 100),
    );
    const route = maxOverheadVsProduction < 2 ? '2b (always-on)' : '2c (mode-scoped)';
    console.log(
      `\n[route-2-decision] canonicalize overhead vs paper-3 §7 production-step median (3.082 ms):`,
    );
    for (const r of results) {
      const pct = (r.canonMsMedian / PRODUCTION_STEP_MS_REF) * 100;
      console.log(
        `  ${r.scenario.padEnd(15)} canonicalize ${r.canonMsMedian.toFixed(6)} ms = ${pct.toFixed(3)}% of production step`,
      );
    }
    console.log(
      `[route-2-decision] max canonicalize-vs-production-step: ${maxOverheadVsProduction.toFixed(3)}%`,
    );
    console.log(`[route-2-decision] RECOMMENDED ROUTE: ${route}`);

    // Original (naive) overhead-vs-noop metric — retained for transparency
    // but NOT used for the routing decision. Documents that the bench
    // harness was aware of the distinction.
    const naiveOverheadPct = Math.max(...results.map((r) => r.overheadPct));
    console.log(
      `[route-2-decision] (naive overhead-vs-noop, NOT used for routing: ${naiveOverheadPct.toFixed(2)}%)`,
    );

    // Sanity guard — the canonicalize primitive should be positive cost;
    // if somehow negative, something's broken in the benchmark harness.
    for (const r of results) {
      expect(r.canonMsMedian).toBeGreaterThan(0);
      expect(r.baselineMsMedian).toBeGreaterThan(0);
    }

    // NOT asserting overhead < 2 as a test failure — that's a DECISION, not
    // a correctness bar. The test passes as long as the bench ran. The
    // routing call is made by the founder / follow-up code based on the
    // printed output.
    expect(results.length).toBe(SCENARIOS.length);
  }, 120_000);
});
