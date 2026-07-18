#!/usr/bin/env node
/**
 * Standalone paper-4-rtx-bench runner — for hardware-tier captures on
 * vast.ai fleet hosts that can't take the full HoloScript monorepo
 * install. Inlines the contract-hash primitives so this file is the
 * only dependency-free deliverable needed to capture a tier's numbers.
 *
 * Sourced from packages/engine/src/simulation/sha256.ts (fnv1aBytes,
 * sha256Bytes) — byte-for-byte equivalent (FIPS 180-4 ref + FNV-1a
 * standard constants).
 *
 * Usage on a fleet host:
 *   HOLOSCRIPT_HW_TIER=H3 HOLOSCRIPT_HW_LABEL='A100 SXM4 40GB' \
 *     node paper4-rtx-bench-standalone.mjs
 *
 * Writes JSON to ./paper-4-rtx-bench-<tier>.json, or to --out <path>.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cliArgs = process.argv.slice(2);
const outIndex = cliArgs.indexOf('--out');
const outArg = outIndex >= 0 ? cliArgs[outIndex + 1] : null;
if (outIndex >= 0 && !outArg) throw new Error('--out requires a path');
const scriptPath = fileURLToPath(import.meta.url);
const scriptSha256 = createHash('sha256').update(fs.readFileSync(scriptPath)).digest('hex');
const repoRoot = findRepoRoot(path.dirname(scriptPath));
const scriptRelativePath = repoRoot
  ? path.relative(repoRoot, scriptPath).replaceAll('\\', '/')
  : path.basename(scriptPath);

// ── FNV-1a (byte domain) — from sha256.ts:54 ─────────────────────────────
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
function fnv1aBytes(bytes) {
  let h = FNV_OFFSET_BASIS >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ── SHA-256 (FIPS 180-4) — from sha256.ts:116 ─────────────────────────────
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
function rotr32(x, n) {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}
function sha256Bytes(bytes) {
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLenLo = (bytes.length * 8) >>> 0;
  const bitLenHi = Math.floor((bytes.length * 8) / 0x100000000) >>> 0;
  const paddedLen = ((bytes.length + 9 + 63) >>> 6) << 6;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  padded[paddedLen - 8] = (bitLenHi >>> 24) & 0xff;
  padded[paddedLen - 7] = (bitLenHi >>> 16) & 0xff;
  padded[paddedLen - 6] = (bitLenHi >>> 8) & 0xff;
  padded[paddedLen - 5] = bitLenHi & 0xff;
  padded[paddedLen - 4] = (bitLenLo >>> 24) & 0xff;
  padded[paddedLen - 3] = (bitLenLo >>> 16) & 0xff;
  padded[paddedLen - 2] = (bitLenLo >>> 8) & 0xff;
  padded[paddedLen - 1] = bitLenLo & 0xff;
  const W = new Uint32Array(64);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let t = 0; t < 16; t++) {
      const b = off + t * 4;
      W[t] =
        ((padded[b] << 24) | (padded[b + 1] << 16) | (padded[b + 2] << 8) | padded[b + 3]) >>> 0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr32(W[t - 15], 7) ^ rotr32(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr32(W[t - 2], 17) ^ rotr32(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let a = H[0],
      b = H[1],
      c = H[2],
      d = H[3],
      e = H[4],
      f = H[5],
      g = H[6],
      h = H[7];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const T1 = (h + S1 + ch + SHA256_K[t] + W[t]) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const T2 = (S0 + mj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + T1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (T1 + T2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  let hex = '';
  for (let i = 0; i < 8; i++) hex += H[i].toString(16).padStart(8, '0');
  return hex;
}

// ── Stats helpers ─────────────────────────────────────────────────────────
function median(xs) {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
function percentile(xs, p) {
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}
function summarize(op, scale, n, timingsMicros) {
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

// ── Synthetic geometry ────────────────────────────────────────────────────
function makeGeometryBytes(vertexCount) {
  const buf = new ArrayBuffer(vertexCount * 12);
  const view = new Float32Array(buf);
  for (let i = 0; i < vertexCount; i++) {
    view[i * 3 + 0] = i * 0.001;
    view[i * 3 + 1] = i * 0.0007;
    view[i * 3 + 2] = i * 0.0003;
  }
  return new Uint8Array(buf);
}

// ── SHA-256 CAEL chain — extension shape ──────────────────────────────────
function buildSha256ChainSeed(entries) {
  const payloads = [];
  const expectedHashes = [];
  const enc = new TextEncoder();
  let prev = '0'.repeat(64);
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
function verifySha256Chain(payloads, expectedHashes) {
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

// ── Hardware-tier detection ───────────────────────────────────────────────
function detectHardware() {
  const envTier = process.env.HOLOSCRIPT_HW_TIER;
  const envLabel = process.env.HOLOSCRIPT_HW_LABEL;
  const envGpu = process.env.HOLOSCRIPT_HW_GPU;
  const cpuInfo = os.cpus();
  const cpuModel = cpuInfo[0]?.model ?? 'unknown';
  const cpuCount = cpuInfo.length;
  const ramGb = Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10;
  let tier = 'H1',
    label,
    tierConfidence = 'fallback';
  if (envTier === 'H1' || envTier === 'H2' || envTier === 'H3') {
    tier = envTier;
    label = envLabel ?? `${envTier} (HOLOSCRIPT_HW_TIER=${envTier})`;
    tierConfidence = 'env';
  } else if (/Xeon|Threadripper|EPYC/i.test(cpuModel)) {
    tier = 'H2';
    label = 'H2 (auto-detected workstation/server CPU; no GPU enumeration in Node)';
    tierConfidence = 'detected';
  } else {
    label = 'H1 (fallback: CPU model unrecognized, assuming integrated graphics)';
  }
  return {
    tier,
    label,
    gpu: envGpu ?? 'unspecified (no Node-side GPU enumeration)',
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

// ── Run ─────────────────────────────────────────────────────────────────
const hardware = detectHardware();
const results = [];
const notes = [];

console.log(`[paper-4-rtx-bench] hardware: ${JSON.stringify(hardware)}\n`);

// 1. fnvhash 1K verts
{
  const bytes = makeGeometryBytes(1000);
  for (let i = 0; i < 50; i++) fnv1aBytes(bytes);
  const TRIALS = 1000;
  const times = [];
  for (let i = 0; i < TRIALS; i++) {
    const t0 = performance.now();
    fnv1aBytes(bytes);
    times.push((performance.now() - t0) * 1000);
  }
  results.push(summarize('raw FNV-1a coordinate bytes (not hashGeometry)', '1K verts', 1000, times));
}

// 2. fnvhash 100K verts
{
  const bytes = makeGeometryBytes(100_000);
  for (let i = 0; i < 10; i++) fnv1aBytes(bytes);
  const TRIALS = 200;
  const times = [];
  for (let i = 0; i < TRIALS; i++) {
    const t0 = performance.now();
    fnv1aBytes(bytes);
    times.push((performance.now() - t0) * 1000);
  }
  results.push(summarize('raw FNV-1a coordinate bytes (not hashGeometry)', '100K verts', 100_000, times));
}

// 3. SHA-256 CAEL chain verify @ 10^4 entries
{
  const N = 10_000;
  const { payloads, expectedHashes } = buildSha256ChainSeed(N);
  const TRIALS = 10;
  const times = [];
  for (let i = 0; i < TRIALS; i++) {
    const t0 = performance.now();
    const ok = verifySha256Chain(payloads, expectedHashes);
    if (!ok) throw new Error('chain verify failed');
    times.push((performance.now() - t0) * 1000);
  }
  results.push(summarize('SHA-256 CAEL-chain verify', '10^4 entries', N, times));
}

// 4. Synthetic SHA-chain fold (not WGSL-equivalent and not a GPU bound)
{
  notes.push(
    'Synthetic SHA-chain fold over 500 text rows. This is not algorithmically ' +
      'equivalent to cael-trace-fold-v1 WGSL and is neither a GPU substitute nor a GPU bound.'
  );
  const N = 500;
  const TRIALS = 20;
  const times = [];
  for (let i = 0; i < TRIALS; i++) {
    const { payloads, expectedHashes } = buildSha256ChainSeed(N);
    const t0 = performance.now();
    verifySha256Chain(payloads, expectedHashes);
    times.push((performance.now() - t0) * 1000);
  }
  results.push(summarize('synthetic SHA-chain fold (not WGSL equivalent)', '500 rows', N, times));
}

// 5. Full pipeline
{
  const geometry = makeGeometryBytes(1000);
  const TRIALS = 100;
  const times = [];
  for (let i = 0; i < TRIALS; i++) {
    const t0 = performance.now();
    fnv1aBytes(geometry);
    const { payloads, expectedHashes } = buildSha256ChainSeed(500);
    verifySha256Chain(payloads, expectedHashes);
    times.push((performance.now() - t0) * 1000);
  }
  results.push(summarize('synthetic raw-FNV + text-SHA aggregate', '1K coordinates + 500 rows', 500, times));
}

if (hardware.tier !== 'H3') {
  notes.push(
    `H3 (RTX 6000 Ada) capture deferred — requires HOLOSCRIPT_HW_TIER=H3 ` +
      `with a verified datacenter-class host. Current run captured at tier ` +
      `${hardware.tier} (${hardware.label}).`
  );
}

const capturedAt = new Date().toISOString();
// Receipt v2 — see scripts/webgpu-capture/receipt-v2.schema.json. The
// `path: 'cpu-component'` field marks these related CPU primitives as
// algorithmically distinct from the WGSL kernel. Real GPU receipts
// (path: 'webgpu-browser') live alongside this one and are produced by
// scripts/webgpu-capture/capture-bench.mjs with the paper-4-cael-fold-* configs.
const artifact = {
  receipt_version: 'v2',
  captured_at: capturedAt,
  path: 'cpu-component',
  paper: 'paper-4-sandbox-usenix',
  section: '7.8',
  harness: 'scripts/paper4-rtx-bench-standalone.mjs',
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
  protocol_commit: repoRoot ? gitHeadHash(repoRoot) : null,
  code_provenance: {
    relevant_paths_clean: repoRoot ? gitPathsClean(repoRoot, [scriptRelativePath]) : null,
    inputs: [{ path: scriptRelativePath, sha256: scriptSha256 }],
  },
  results,
  notes,
  ots_proof_path: null,
  anchor_chain: null,
};

const outPath = outArg
  ? path.resolve(process.cwd(), outArg)
  : path.join(process.cwd(), `paper-4-rtx-bench-${hardware.tier}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');

console.log(`[paper-4-rtx-bench] artifact → ${outPath}`);
console.log(JSON.stringify(artifact, null, 2));

function findRepoRoot(start) {
  let current = start;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function gitHeadHash(root) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function gitPathsClean(root, paths) {
  try {
    execFileSync('git', ['diff', '--quiet', '--', ...paths], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['diff', '--cached', '--quiet', '--', ...paths], {
      cwd: root,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}
