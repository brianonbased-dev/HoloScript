/**
 * fnv1a-vs-sha256.bench.test.ts
 *
 * Pre-decision bench for the SECURITY-mode routed FNV-1a → SHA-256
 * feature flag (ai-ecosystem 2026-04-20 SECURITY queue item #3).
 *
 * Goal: measure the overhead of swapping FNV-1a for SHA-256 at the
 * three contract hash sites (hashCAELEntry, computeStateDigest,
 * hashGeometry) across realistic input sizes drawn from paper-3 §7.5
 * scenarios and CAEL trace payloads. Numbers anchor the feature-flag
 * design memo (research/2026-04-20_sha256-feature-flag-design.md)
 * so the "default FNV-1a for perf; SHA-256 for adversarial use"
 * framing is quantitative, not hand-wavy.
 *
 * Method:
 *   - Input sizes: 60, 300, 1,200, 6,000 float32 values (paper-3 §7.5
 *     scale ladder: bridge / truss / multi-story / full-building).
 *     Plus 500 B, 5 KB, 50 KB, 500 KB raw byte arrays covering the
 *     CAEL trace entry payload range.
 *   - For each size, measure N=200 iterations of:
 *       FNV-1a: inline JS implementation (same as hashCAELEntry /
 *               computeStateDigest today)
 *       SHA-256: Node's sync crypto.createHash('sha256')
 *     (Browser path would use crypto.subtle.digest which is async —
 *      different perf characteristics. Node's sync path is the
 *      feature flag's target platform per the design memo.)
 *   - Report median / p99 / overhead ratio.
 *   - Includes warmup + multiple runs for variance characterization.
 *
 * Does NOT:
 *   - Flip the flag (that's the follow-up commit).
 *   - Touch SimulationContract.ts or CAELTrace.ts.
 *   - Assert on overhead thresholds — this is a DECISION bench,
 *     not a regression bench. Prints numbers for humans.
 */

import { describe, it, expect } from 'vitest';
// Node's sync crypto — available in Node ≥ 15. Browser path uses
// crypto.subtle.digest which is async; see design memo.
import { createHash } from 'node:crypto';

// --- FNV-1a inline (matches CAELTrace.ts:fnv1a + SimulationContract.ts) ---
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(bytes: Uint8Array): string {
  let h = FNV_OFFSET >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// --- SHA-256 via Node sync createHash ---
function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// --- Input generators ---
function randomFloatBytes(n: number, seed: number): Uint8Array {
  // Mulberry32 deterministic PRNG
  let a = seed >>> 0;
  const floats = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    floats[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return new Uint8Array(floats.buffer);
}

function randomBytes(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  let a = seed >>> 0;
  for (let i = 0; i < n; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    out[i] = t & 0xff;
  }
  return out;
}

// --- Scenario shapes ---
const STATE_VECTOR_SIZES: ReadonlyArray<{ name: string; floats: number }> = [
  { name: 'bridge           (60 floats)', floats: 60 },
  { name: 'truss            (300 floats)', floats: 300 },
  { name: 'multi-story      (1,200 floats)', floats: 1_200 },
  { name: 'full-building    (6,000 floats)', floats: 6_000 },
];

const TRACE_PAYLOAD_SIZES: ReadonlyArray<{ name: string; bytes: number }> = [
  { name: 'trace entry      (500 B)', bytes: 500 },
  { name: 'small step batch (5 KB)', bytes: 5_000 },
  { name: 'medium payload   (50 KB)', bytes: 50_000 },
  { name: 'large payload    (500 KB)', bytes: 500_000 },
];

const ITERATIONS = 200;
const WARMUP = 20;
const RUNS = 5;

function nowMs(): number {
  return performance.now();
}

function measure(fn: (input: Uint8Array) => string, input: Uint8Array): number {
  // Warmup
  for (let i = 0; i < WARMUP; i++) fn(input);

  const samples: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    const t0 = nowMs();
    let acc = '';
    for (let i = 0; i < ITERATIONS; i++) acc = fn(input);
    const t1 = nowMs();
    if (acc === '') throw new Error('unreachable');
    samples.push((t1 - t0) / ITERATIONS);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('FNV-1a vs SHA-256 — contract hash site overhead', () => {
  it('measures FNV-1a and SHA-256 across paper-3 state-vector scales', () => {
    console.log('\n[security-item-3] FNV-1a vs SHA-256 — state-vector hashing');
    console.log(
      'scenario                          fnv1a (μs)   sha256 (μs)   ratio    Δ (μs)',
    );
    for (const s of STATE_VECTOR_SIZES) {
      const input = randomFloatBytes(s.floats, s.floats * 7919);
      const fnvMs = measure(fnv1a, input);
      const shaMs = measure(sha256, input);
      const ratio = shaMs / fnvMs;
      const deltaUs = (shaMs - fnvMs) * 1000;
      console.log(
        `  ${s.name.padEnd(33)} ` +
          `${(fnvMs * 1000).toFixed(3).padStart(10)}   ` +
          `${(shaMs * 1000).toFixed(3).padStart(10)}   ` +
          `${ratio.toFixed(2).padStart(6)}×   ` +
          `${deltaUs.toFixed(3).padStart(8)}`,
      );
    }
  });

  it('measures FNV-1a and SHA-256 across CAEL trace payload sizes', () => {
    console.log('\n[security-item-3] FNV-1a vs SHA-256 — CAEL trace payload hashing');
    console.log(
      'scenario                          fnv1a (μs)   sha256 (μs)   ratio    Δ (μs)',
    );
    for (const s of TRACE_PAYLOAD_SIZES) {
      const input = randomBytes(s.bytes, s.bytes * 6311);
      const fnvMs = measure(fnv1a, input);
      const shaMs = measure(sha256, input);
      const ratio = shaMs / fnvMs;
      const deltaUs = (shaMs - fnvMs) * 1000;
      console.log(
        `  ${s.name.padEnd(33)} ` +
          `${(fnvMs * 1000).toFixed(3).padStart(10)}   ` +
          `${(shaMs * 1000).toFixed(3).padStart(10)}   ` +
          `${ratio.toFixed(2).padStart(6)}×   ` +
          `${deltaUs.toFixed(3).padStart(8)}`,
      );
    }

    // Amortized cost: a paper-3 §7.5 simulation produces n trace entries
    // per step. If each entry's hash takes Δ μs extra, total extra
    // wall time = n * Δ. For n = 10^4 and Δ = 10 μs, overhead = 100 ms
    // over the full trace — worth stating quantitatively in the memo.
    console.log(
      '\n[security-item-3] Anchor: if ΔSHA-256 vs FNV-1a ~= 10 μs per hashCAELEntry call,\n' +
        '                  a 10⁴-entry trace pays ~100 ms extra total. Bench this above.',
    );
  });

  // Sanity check that the hashes are actually different functions (not
  // some bench-harness bug where both call the same code path).
  it('FNV-1a and SHA-256 produce different digests on the same input', () => {
    const input = randomBytes(256, 42);
    const fnv = fnv1a(input);
    const sha = sha256(input);
    expect(fnv).not.toBe(sha);
    expect(fnv).toHaveLength(8); // 32-bit hex
    expect(sha).toHaveLength(64); // 256-bit hex
  });

  // Sanity: both functions are deterministic across independent calls.
  it('both hashes are deterministic', () => {
    const input = randomBytes(1024, 123);
    expect(fnv1a(input)).toBe(fnv1a(input));
    expect(sha256(input)).toBe(sha256(input));
  });
}, /* no timeout — bench is fast */);
