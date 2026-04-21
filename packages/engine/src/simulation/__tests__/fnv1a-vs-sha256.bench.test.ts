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

// --- SHA-256 via Node sync createHash (C implementation) ---
function sha256Native(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// --- SHA-256 pure-JS (FIPS 180-4 reference implementation) ---
//
// Added 2026-04-20 after SECURITY-mode audit flagged that the bench's
// original sha256 used Node's native C implementation, but the design
// memo recommended Path 3 (bundled pure-JS SHA-256). The native bench
// underestimated the pure-JS deployment cost — pure-JS is ~2-3× slower
// than native, which matters at paper-3 scenario scales. This
// implementation is the actual Path 3 target; the bench now compares
// FNV-1a vs native vs pure-JS so the memo's tables reflect deployment
// numbers, not native-only.
//
// Reference: FIPS 180-4 §5.3.3 + §6.2. Test vectors from RFC 6234 §B.1-2.
// Size: ~60 LOC. Synchronous, universal (Node + browser), no dependencies.
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

function rotr32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function sha256PureJS(bytes: Uint8Array): string {
  // Initial hash values (FIPS 180-4 §5.3.3)
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  // Pre-processing: padding to 512-bit block alignment with bit length
  const bitLenLo = (bytes.length * 8) >>> 0;
  const bitLenHi = Math.floor((bytes.length * 8) / 0x100000000) >>> 0;
  const paddedLen = ((bytes.length + 9 + 63) >>> 6) << 6; // round up to 64
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

  // Process each 512-bit block (FIPS 180-4 §6.2.2)
  const W = new Uint32Array(64);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let t = 0; t < 16; t++) {
      const b = off + t * 4;
      W[t] = ((padded[b] << 24) | (padded[b + 1] << 16) | (padded[b + 2] << 8) | padded[b + 3]) >>> 0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr32(W[t - 15], 7) ^ rotr32(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr32(W[t - 2], 17) ^ rotr32(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }

    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const T1 = (h + S1 + ch + SHA256_K[t] + W[t]) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const T2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e;
      e = (d + T1) >>> 0;
      d = c; c = b; b = a;
      a = (T1 + T2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }

  let hex = '';
  for (let i = 0; i < 8; i++) hex += H[i].toString(16).padStart(8, '0');
  return hex;
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

// Paper-3 §7.5 state-vector scale ladder (simulation hashing: hashCAELEntry / computeStateDigest)
const STATE_VECTOR_SIZES: ReadonlyArray<{ name: string; floats: number }> = [
  { name: 'bridge           (60 floats)', floats: 60 },
  { name: 'truss            (300 floats)', floats: 300 },
  { name: 'multi-story      (1,200 floats)', floats: 1_200 },
  { name: 'full-building    (6,000 floats)', floats: 6_000 },
];

// Paper-3 CAEL trace payload range (CAEL entry hashing)
const TRACE_PAYLOAD_SIZES: ReadonlyArray<{ name: string; bytes: number }> = [
  { name: 'trace entry      (500 B)', bytes: 500 },
  { name: 'small step batch (5 KB)', bytes: 5_000 },
  { name: 'medium payload   (50 KB)', bytes: 50_000 },
  { name: 'large payload    (500 KB)', bytes: 500_000 },
];

// Paper-1 / Paper-2 / Paper-3 provenance path: deploy/provenance.ts → computeContentHash()
// Covers the content-addressed source-hashing path used in BuildCache keying (paper-10) and
// incremental compilation provenance chain. String sizes are representative UTF-8 .hs / .hsplus
// source files: single-object snippet → medium composition → large multi-composition bundle →
// whole-project manifest aggregation.
const PROVENANCE_SOURCE_SIZES: ReadonlyArray<{ name: string; paper: string; chars: number }> = [
  { name: 'single-object snippet   (0.5 KB)', paper: 'Paper-1/2/3', chars: 512 },
  { name: 'medium composition      (5 KB)',   paper: 'Paper-1/2/3', chars: 5_120 },
  { name: 'large composition       (50 KB)',  paper: 'Paper-1/2/3', chars: 51_200 },
  { name: 'full-project manifest   (200 KB)', paper: 'Paper-1/2/3', chars: 204_800 },
];

/**
 * Simulate realistic HoloScript source text of a given character count.
 * Uses a deterministic PRNG to fill ASCII printable characters (0x20–0x7e)
 * so the byte-length matches the char-length (all-ASCII UTF-8 source).
 */
function syntheticSource(chars: number, seed: number): Uint8Array {
  const te = new TextEncoder();
  const CHUNK = 80; // approx line length
  let a = seed >>> 0;
  let src = '';
  while (src.length < chars) {
    let line = '';
    for (let i = 0; i < CHUNK && src.length + line.length < chars; i++) {
      a = (a + 0x6d2b79f5) >>> 0;
      const cp = 0x20 + (a % 0x5f); // printable ASCII
      line += String.fromCharCode(cp);
    }
    src += line + '\n';
  }
  return te.encode(src.slice(0, chars));
}

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
  it('measures three hash implementations across paper-3 state-vector scales', () => {
    console.log('\n[security-item-3][Paper-3 §7.5] FNV-1a vs SHA-256 (native + pure-JS) — state-vector hashing');
    console.log(
      'scenario                          fnv1a (μs)   native (μs)   pureJS (μs)   nat-×   pjs-×   pjs-Δ (μs)',
    );
    for (const s of STATE_VECTOR_SIZES) {
      const input = randomFloatBytes(s.floats, s.floats * 7919);
      const fnvMs = measure(fnv1a, input);
      const natMs = measure(sha256Native, input);
      const pjsMs = measure(sha256PureJS, input);
      const natRatio = natMs / fnvMs;
      const pjsRatio = pjsMs / fnvMs;
      const pjsDeltaUs = (pjsMs - fnvMs) * 1000;
      console.log(
        `  ${s.name.padEnd(33)} ` +
          `${(fnvMs * 1000).toFixed(3).padStart(10)}   ` +
          `${(natMs * 1000).toFixed(3).padStart(10)}   ` +
          `${(pjsMs * 1000).toFixed(3).padStart(10)}   ` +
          `${natRatio.toFixed(2).padStart(5)}×  ` +
          `${pjsRatio.toFixed(2).padStart(5)}×  ` +
          `${pjsDeltaUs.toFixed(3).padStart(9)}`,
      );
    }
  });

  it('measures three hash implementations across CAEL trace payload sizes', { timeout: 60_000 }, () => {
    console.log('\n[security-item-3][Paper-3 CAEL] FNV-1a vs SHA-256 (native + pure-JS) — CAEL trace payload hashing');
    console.log(
      'scenario                          fnv1a (μs)   native (μs)   pureJS (μs)   nat-×   pjs-×   pjs-Δ (μs)',
    );
    for (const s of TRACE_PAYLOAD_SIZES) {
      const input = randomBytes(s.bytes, s.bytes * 6311);
      const fnvMs = measure(fnv1a, input);
      const natMs = measure(sha256Native, input);
      const pjsMs = measure(sha256PureJS, input);
      const natRatio = natMs / fnvMs;
      const pjsRatio = pjsMs / fnvMs;
      const pjsDeltaUs = (pjsMs - fnvMs) * 1000;
      console.log(
        `  ${s.name.padEnd(33)} ` +
          `${(fnvMs * 1000).toFixed(3).padStart(10)}   ` +
          `${(natMs * 1000).toFixed(3).padStart(10)}   ` +
          `${(pjsMs * 1000).toFixed(3).padStart(10)}   ` +
          `${natRatio.toFixed(2).padStart(5)}×  ` +
          `${pjsRatio.toFixed(2).padStart(5)}×  ` +
          `${pjsDeltaUs.toFixed(3).padStart(9)}`,
      );
    }

    console.log(
      '\n[security-item-3] nat-× is Native SHA-256 vs FNV-1a; pjs-× is Pure-JS SHA-256 vs FNV-1a.',
    );
    console.log(
      '                  Pure-JS is the Path 3 deployment target (Node+browser universal, sync).',
    );
    console.log(
      '                  Native numbers are informational (upper-bound performance).',
    );
  });

  // RFC 6234 Appendix B.1-2 test vectors: validates our pure-JS SHA-256
  // produces standards-compliant output, not just a plausible-looking
  // digest. Without these the bench could be benchmarking a buggy
  // implementation and we'd never know.
  it('pure-JS SHA-256 matches RFC 6234 test vectors', () => {
    const te = new TextEncoder();
    // RFC 6234 §B.1: SHA-256("abc")
    expect(sha256PureJS(te.encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    // SHA-256("") — NIST standard empty-input vector
    expect(sha256PureJS(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    // RFC 6234 §B.2: SHA-256(longer multi-block input)
    const longer = te.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq');
    expect(sha256PureJS(longer)).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  // Cross-check: pure-JS and native produce identical output on random input.
  // If this fails, pure-JS has a bug that won't show up in the RFC tests
  // (e.g., carry-handling error on specific bit patterns).
  it('pure-JS and native SHA-256 agree on random inputs', () => {
    for (const size of [1, 63, 64, 65, 127, 128, 129, 1024, 16384]) {
      const input = randomBytes(size, size * 13);
      expect(sha256PureJS(input)).toBe(sha256Native(input));
    }
  });

  it('FNV-1a and SHA-256 produce different digests on the same input', () => {
    const input = randomBytes(256, 42);
    expect(fnv1a(input)).not.toBe(sha256Native(input));
    expect(fnv1a(input)).not.toBe(sha256PureJS(input));
    expect(fnv1a(input)).toHaveLength(8); // 32-bit hex
    expect(sha256Native(input)).toHaveLength(64); // 256-bit hex
    expect(sha256PureJS(input)).toHaveLength(64);
  });

  it('all three hashes are deterministic', () => {
    const input = randomBytes(1024, 123);
    expect(fnv1a(input)).toBe(fnv1a(input));
    expect(sha256Native(input)).toBe(sha256Native(input));
    expect(sha256PureJS(input)).toBe(sha256PureJS(input));
  });

  // -------------------------------------------------------------------------
  // Paper-3 provenance path: deploy/provenance.ts → computeContentHash()
  //
  // The three test suites above cover binary simulation buffers (state vectors,
  // CAEL trace payloads — Paper-3 §7.5 and CAEL entry hashing paths). This
  // suite covers the UTF-8 string path used by:
  //
  //   packages/core/src/deploy/provenance.ts → computeContentHash(source)
  //     → createHash('sha256').update(normalized, 'utf8').digest('hex')
  //
  // This path feeds the BuildCache key derivation (paper-10 provenance chain)
  // and incremental compilation provenance (paper-3/CRDT artefact identity).
  // Relevant for Papers 1, 2, and 3: any composition with a deploy/ publish
  // step produces a content-addressed hash via this path.
  //
  // Method: same warmup + multi-run approach. Input is synthetic printable
  // ASCII UTF-8, pre-encoded to Uint8Array (matches what a real TextEncoder
  // call on normalized source would produce). FNV-1a stands for "what we
  // would pay if we replaced the SHA-256 in computeContentHash with FNV-1a."
  // -------------------------------------------------------------------------
  it(
    'measures three hash implementations across Paper-3 provenance source sizes',
    { timeout: 60_000 },
    () => {
      console.log(
        '\n[security-item-3][Paper-1/2/3 provenance] FNV-1a vs SHA-256 (native + pure-JS) — computeContentHash() path',
      );
      console.log('  deploy/provenance.ts → createHash(sha256).update(source, utf8) — BuildCache key derivation');
      console.log(
        'scenario                               paper        fnv1a (μs)   native (μs)   pureJS (μs)   nat-×   pjs-×',
      );
      for (const s of PROVENANCE_SOURCE_SIZES) {
        const input = syntheticSource(s.chars, s.chars * 3571);
        const fnvMs = measure(fnv1a, input);
        const natMs = measure(sha256Native, input);
        const pjsMs = measure(sha256PureJS, input);
        const natRatio = natMs / fnvMs;
        const pjsRatio = pjsMs / fnvMs;
        console.log(
          `  ${s.name.padEnd(38)} ${s.paper.padEnd(12)} ` +
            `${(fnvMs * 1000).toFixed(3).padStart(10)}   ` +
            `${(natMs * 1000).toFixed(3).padStart(10)}   ` +
            `${(pjsMs * 1000).toFixed(3).padStart(10)}   ` +
            `${natRatio.toFixed(2).padStart(5)}×  ` +
            `${pjsRatio.toFixed(2).padStart(5)}×`,
        );
      }
      console.log(
        '\n  nat-× = Native SHA-256 overhead vs FNV-1a on UTF-8 source.',
      );
      console.log(
        '  pjs-× = Pure-JS SHA-256 overhead vs FNV-1a — Path 3 deployment cost on source hashing.',
      );
      console.log(
        '  At 5 KB (medium composition), pure-JS should dominate the per-file compile budget if > ~10× FNV.',
      );
    },
  );
}, /* no timeout — bench is fast */);
