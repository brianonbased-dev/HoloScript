/**
 * paper-4-rtx-bench.test.ts
 *
 * CPU component benchmark for Paper 4 (Trust Sandbox Contract,
 * USENIX Sec '27) §7.8 Table 5 — "GPU hash-chain and replay throughput".
 *
 * Measures the underlying contract-hash primitives that the security
 * sandbox uses on every CAEL append and every geometry-verify call:
 *   1. FNV-1a geometry hash @ 1K vertices         (sha256.ts:fnv1aBytes)
 *   2. FNV-1a geometry hash @ 100K vertices       (sha256.ts:fnv1aBytes)
 *   3. SHA-256 CAEL-chain verify @ 10^4 entries   (sha256.ts:sha256Bytes
 *                                                   threaded as the
 *                                                   chain-extension hash)
 *   4. Synthetic SHA-chain fold @ 500 rows        (not WGSL-equivalent;
 *                                                   not a GPU bound)
 *   5. Full pipeline @ 1K vert + 500 CAEL entries (composed FNV-1a +
 *                                                   SHA-256 chain)
 *
 * Hardware-tier detection:
 *   HOLOSCRIPT_HW_TIER env var overrides ('H1' integrated / 'H2'
 *   workstation / 'H3' datacenter). Otherwise H1 fallback. H3 is the
 *   RTX 6000 Ada target named in Paper 4 §7.8; only set the env when
 *   the host actually has that hardware.
 *
 * Output:
 *   .bench-logs/<ISO>/paper-4-rtx-bench.json — referenced by Paper 4's
 *   `\measuredFrom{}` macro.
 *
 * Provenance lesson (F.062 trap caught 2026-05-29):
 *   A prior subagent reported "shipped" without actually writing this
 *   file — only the JSON artifact landed. The artifact looked legit so
 *   the hallucination almost slipped through. This rewrite uses only
 *   the direct-callable hash primitives (no SimSolver instantiation
 *   needed), so the test actually compiles and runs.
 *   See research/2026-05-28_paper-program-codebase-drift-audit.md.
 */

import { describe, it, expect } from 'vitest';
import { fnv1aBytes, sha256Bytes } from '../sha256';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ── Hardware-tier detection ────────────────────────────────────────────────
interface HardwareDescriptor {
  tier: 'H1' | 'H2' | 'H3';
  label: string;
  gpu: string;
  cpu: string;
  cpuCount: number;
  ramGb: number;
  platform: string;
  release: string;
  arch: string;
  node: string;
  tierConfidence: 'env' | 'detected' | 'fallback';
}

function detectHardware(): HardwareDescriptor {
  const envTier = process.env.HOLOSCRIPT_HW_TIER as 'H1' | 'H2' | 'H3' | undefined;
  const cpuInfo = os.cpus();
  const cpuModel = cpuInfo[0]?.model ?? 'unknown';
  const cpuCount = cpuInfo.length;
  const ramGb = Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10;

  let tier: 'H1' | 'H2' | 'H3' = 'H1';
  let label = '';
  let tierConfidence: HardwareDescriptor['tierConfidence'] = 'fallback';

  if (envTier === 'H1' || envTier === 'H2' || envTier === 'H3') {
    tier = envTier;
    label = `${envTier} (HOLOSCRIPT_HW_TIER=${envTier})`;
    tierConfidence = 'env';
  } else if (/Xeon|Threadripper|EPYC/i.test(cpuModel)) {
    tier = 'H2';
    label = 'H2 (auto-detected workstation CPU; no GPU enumeration in Node)';
    tierConfidence = 'detected';
  } else {
    tier = 'H1';
    label = `H1 (fallback: CPU model unrecognized, assuming integrated graphics)`;
    tierConfidence = 'fallback';
  }

  return {
    tier,
    label,
    gpu: 'unspecified (no Node-side GPU enumeration)',
    cpu: cpuModel,
    cpuCount,
    ramGb,
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    node: process.version,
    tierConfidence,
  };
}

// ── Stats helpers ──────────────────────────────────────────────────────────
function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
function percentile(xs: number[], p: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

interface OpResult {
  op: string;
  scale: string;
  n: number;
  median_us: number;
  p95_us: number;
  min_us: number;
  max_us: number;
  trials: number;
}

function summarize(op: string, scale: string, n: number, timingsMicros: number[]): OpResult {
  return {
    op,
    scale,
    n,
    median_us: median(timingsMicros),
    p95_us: percentile(timingsMicros, 95),
    min_us: Math.min(...timingsMicros),
    max_us: Math.max(...timingsMicros),
    trials: timingsMicros.length,
  };
}

// ── Synthetic geometry generator ───────────────────────────────────────────
function makeGeometryBytes(vertexCount: number): Uint8Array {
  const buf = new ArrayBuffer(vertexCount * 12);
  const view = new Float32Array(buf);
  for (let i = 0; i < vertexCount; i++) {
    view[i * 3 + 0] = i * 0.001;
    view[i * 3 + 1] = i * 0.0007;
    view[i * 3 + 2] = i * 0.0003;
  }
  return new Uint8Array(buf);
}

// ── SHA-256 CAEL-chain shape ────────────────────────────────────────────────
// The sandbox's chain extension is: next = sha256(prev || canonical(entry)).
// We measure verifying that chain over N entries.
function buildSha256ChainSeed(entries: number): {
  payloads: Uint8Array[];
  expectedHashes: string[];
} {
  const payloads: Uint8Array[] = [];
  const expectedHashes: string[] = [];
  const enc = new TextEncoder();
  let prev = '0'.repeat(64); // genesis (64-hex SHA-256 zero)
  for (let i = 0; i < entries; i++) {
    const payload = enc.encode(`paper4-rtx-bench-entry-${i}`);
    payloads.push(payload);
    const prevBytes = enc.encode(prev);
    const concat = new Uint8Array(prevBytes.length + payload.length);
    concat.set(prevBytes, 0);
    concat.set(payload, prevBytes.length);
    prev = sha256Bytes(concat);
    expectedHashes.push(prev);
  }
  return { payloads, expectedHashes };
}

function verifySha256Chain(payloads: Uint8Array[], expectedHashes: string[]): boolean {
  const enc = new TextEncoder();
  let prev = '0'.repeat(64);
  for (let i = 0; i < payloads.length; i++) {
    const prevBytes = enc.encode(prev);
    const concat = new Uint8Array(prevBytes.length + payloads[i].length);
    concat.set(prevBytes, 0);
    concat.set(payloads[i], prevBytes.length);
    prev = sha256Bytes(concat);
    if (prev !== expectedHashes[i]) return false;
  }
  return true;
}

// ── The benchmark suite ─────────────────────────────────────────────────────
describe('paper-4 §7.8 CPU component baselines', () => {
  const hardware = detectHardware();
  const results: OpResult[] = [];
  const notes: string[] = [];

  it('benchmark — raw FNV-1a coordinate bytes @ 1K verts', () => {
    const bytes = makeGeometryBytes(1000);
    for (let i = 0; i < 50; i++) fnv1aBytes(bytes); // warmup
    const TRIALS = 1000;
    const times: number[] = [];
    for (let i = 0; i < TRIALS; i++) {
      const t0 = performance.now();
      fnv1aBytes(bytes);
      times.push((performance.now() - t0) * 1000);
    }
    results.push(
      summarize('raw FNV-1a coordinate bytes (not hashGeometry)', '1K verts', 1000, times)
    );
    expect(times.length).toBe(TRIALS);
  });

  it('benchmark — raw FNV-1a coordinate bytes @ 100K verts', () => {
    const bytes = makeGeometryBytes(100_000);
    for (let i = 0; i < 10; i++) fnv1aBytes(bytes);
    const TRIALS = 200;
    const times: number[] = [];
    for (let i = 0; i < TRIALS; i++) {
      const t0 = performance.now();
      fnv1aBytes(bytes);
      times.push((performance.now() - t0) * 1000);
    }
    results.push(
      summarize('raw FNV-1a coordinate bytes (not hashGeometry)', '100K verts', 100_000, times)
    );
  });

  it('benchmark — SHA-256 CAEL-chain verify @ 10^4 entries', () => {
    const N = 10_000;
    const { payloads, expectedHashes } = buildSha256ChainSeed(N);
    const TRIALS = 10;
    const times: number[] = [];
    for (let i = 0; i < TRIALS; i++) {
      const t0 = performance.now();
      const ok = verifySha256Chain(payloads, expectedHashes);
      expect(ok).toBe(true);
      times.push((performance.now() - t0) * 1000);
    }
    results.push(summarize('SHA-256 CAEL-chain verify', '10^4 entries', N, times));
  });

  it('benchmark — synthetic SHA-chain fold @ 500 rows (not WGSL equivalent)', () => {
    // This measures a separate Node SHA-chain workload. It neither implements
    // the mix32/atomic WGSL kernel nor establishes a bound on GPU execution.
    notes.push(
      'Synthetic SHA-chain fold over 500 text rows. This is not algorithmically ' +
        'equivalent to cael-trace-fold-v1 WGSL and is neither a GPU substitute nor a GPU bound.'
    );
    const N = 500;
    const TRIALS = 20;
    const times: number[] = [];
    for (let i = 0; i < TRIALS; i++) {
      const { payloads, expectedHashes } = buildSha256ChainSeed(N);
      const t0 = performance.now();
      const ok = verifySha256Chain(payloads, expectedHashes);
      expect(ok).toBe(true);
      times.push((performance.now() - t0) * 1000);
    }
    results.push(summarize('synthetic SHA-chain fold (not WGSL equivalent)', '500 rows', N, times));
  });

  it('benchmark — Full pipeline @ 1K vert + 500 CAEL', () => {
    const geometry = makeGeometryBytes(1000);
    const TRIALS = 100;
    const times: number[] = [];
    for (let i = 0; i < TRIALS; i++) {
      const t0 = performance.now();
      fnv1aBytes(geometry);
      const { payloads, expectedHashes } = buildSha256ChainSeed(500);
      verifySha256Chain(payloads, expectedHashes);
      times.push((performance.now() - t0) * 1000);
    }
    results.push(
      summarize('synthetic raw-FNV + text-SHA aggregate', '1K coordinates + 500 rows', 500, times)
    );
  });

  it('emit JSON artifact under .bench-logs/<ISO>/paper-4-rtx-bench.json', () => {
    if (hardware.tier !== 'H3') {
      notes.push(
        `H3 (RTX 6000 Ada) capture deferred — requires HOLOSCRIPT_HW_TIER=H3 ` +
          `with a verified RTX 6000 Ada datacenter host. Current run captured ` +
          `at tier ${hardware.tier} (${hardware.label}). The paper §7.8 ` +
          `Table 5 H3 column remains a projection until a real datacenter ` +
          `capture replaces it.`
      );
    }

    const capturedAt = new Date().toISOString();
    // Receipt v2 — see scripts/webgpu-capture/receipt-v2.schema.json. The
    // `path: 'cpu-component'` field marks these related CPU primitives as
    // algorithmically distinct from the WGSL kernel. The real GPU receipts
    // (path: 'webgpu-browser') live alongside this one and are produced by
    // scripts/webgpu-capture/capture-bench.mjs with the paper-4-cael-fold-*
    // configs. Both shapes are unified so reviewers see the path field on
    // every row.
    const artifact = {
      receipt_version: 'v2',
      captured_at: capturedAt,
      path: 'cpu-component',
      paper: 'paper-4-sandbox-usenix',
      section: '7.8',
      harness: 'packages/engine/src/simulation/__tests__/paper-4-rtx-bench.test.ts',
      hardware,
      adapter_info: null,
      browser: null,
      kernel: {
        name: 'paper-4-cpu-component-baselines',
        wgsl_path: null,
        wgsl_sha256: null,
        workgroup_size: null,
        dispatch_size: null,
      },
      protocol_commit: null,
      results,
      notes,
      ots_proof_path: null,
      anchor_chain: null,
    };

    // Walk up from cwd until we find the repo root (marked by pnpm-workspace.yaml).
    // Works whether the test is launched from package root (pnpm --filter ...) or
    // from repo root (pnpm test). __dirname is unreliable under vite/vitest 4.
    let repoRoot = process.cwd();
    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(path.join(repoRoot, 'pnpm-workspace.yaml'))) break;
      const parent = path.dirname(repoRoot);
      if (parent === repoRoot) break;
      repoRoot = parent;
    }
    const benchDir = path.join(repoRoot, '.bench-logs', capturedAt.replace(/[:.]/g, '-'));
    fs.mkdirSync(benchDir, { recursive: true });
    const outPath = path.join(benchDir, 'paper-4-rtx-bench.json');
    fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');

    expect(results.length).toBe(5);
    expect(hardware.cpu).toBeTruthy();
    expect(fs.existsSync(outPath)).toBe(true);

    // eslint-disable-next-line no-console
    console.log(`[paper-4-rtx-bench] artifact → ${outPath}`);
  });
});
