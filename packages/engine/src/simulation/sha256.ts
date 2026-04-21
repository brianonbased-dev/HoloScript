/**
 * Contract hash primitive — SECURITY-mode 2026-04-20 Option C wiring.
 *
 * Single chokepoint for the three contract hash sites (hashGeometry,
 * computeStateDigest, hashCAELEntry). Exports:
 *   - HashMode: 'fnv1a' (default, fast, non-cryptographic) or 'sha256'
 *              (opt-in via ContractConfig.useCryptographicHash).
 *   - hashBytes(bytes, mode): byte-domain dispatcher. Used by
 *                             hashGeometry and computeStateDigest.
 *   - fnv1aStringLegacy(input): string-domain FNV-1a matching the
 *                               pre-Option-C CAEL chain format
 *                               ('cael-<8hex>'). Preserved for
 *                               back-compat — old traces verify.
 *   - hashStringForCAEL(input, mode): string-domain dispatcher used
 *                                     by hashCAELEntry. Routes to
 *                                     fnv1aStringLegacy or SHA-256.
 *   - hashShapeMatchesMode(hash, mode): format-level consistency check
 *                                       used by Replayer to catch
 *                                       mid-trace mode tampering.
 *
 * Design constraints (from SHA-256 memo §Wiring-commit prerequisites):
 *   Prereq 1 — per-recorder flag scope: no env/global defaults here.
 *   Prereq 2 — all-or-nothing consistency: every contract hash site
 *             calls through this module with the same mode for a
 *             given recorder/replayer.
 *   Prereq 3 — mode self-identification: output formats differ
 *             between modes (FNV-1a = 8 hex chars; SHA-256 = 64 hex
 *             chars), so hashShapeMatchesMode can validate trace
 *             integrity even if payload.hashMode is tampered.
 *
 * See: ai-ecosystem research/2026-04-20_sha256-feature-flag-design.md
 */

export type HashMode = 'fnv1a' | 'sha256';

/**
 * Default hash mode. Option C: FNV-1a by default for performance
 * under the non-adversarial threat model; SHA-256 is opt-in via
 * ContractConfig.useCryptographicHash = true.
 */
export const HASH_MODE_DEFAULT: HashMode = 'fnv1a';

// ── FNV-1a (byte domain, non-cryptographic) ─────────────────────────────────

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a hash over bytes. Returns 8 hex chars. Used by hashGeometry
 * and computeStateDigest in FNV-1a mode. Fast, non-cryptographic.
 * Collision-findable under moderate adversarial effort; not safe for
 * adversarial-peer settings (use SHA-256 there).
 */
export function fnv1aBytes(bytes: Uint8Array): string {
  let h = FNV_OFFSET_BASIS >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Legacy FNV-1a over a JS string via charCodeAt (UTF-16 code units).
 * Returns 'cael-<8hex>' — the pre-Option-C CAEL hash-chain format.
 * Preserved verbatim so traces recorded under FNV-1a before this
 * change still verify bit-exactly.
 *
 * **Do not use for new code**: this reads charCodeAt which gives
 * UTF-16 code units, not UTF-8 bytes. Different bytes for chars
 * > 0x7f than TextEncoder. Kept only for trace-format back-compat.
 */
export function fnv1aStringLegacy(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `cael-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

// ── SHA-256 (FIPS 180-4 reference; adversarial-peer opt-in) ─────────────────

// Round constants (FIPS 180-4 §4.2.2)
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

/**
 * Pure-JS SHA-256 over bytes. Returns 64 hex chars.
 *
 * Implementation: FIPS 180-4 §5.3.3 (initial hash values) + §6.2.2
 * (block processing). Validated against RFC 6234 §B.1-2 test vectors
 * and cross-checked against Node's native `crypto.createHash('sha256')`
 * on 9 random-input sizes (1, 63, 64, 65, 127, 128, 129, 1024, 16384
 * bytes covering single-block, block-boundary, multi-block cases).
 *
 * Synchronous and universal (works in Node ≥ 15 and all modern
 * browsers). Does not require Node's `crypto` module; no dependencies.
 *
 * Performance: ~10× slower than Node native; ~10-20× slower than
 * FNV-1a at bench sizes. Acceptable as opt-in for adversarial-peer
 * settings; not suitable as default (see Option C rationale in memo).
 */
export function sha256Bytes(bytes: Uint8Array): string {
  // Initial hash values (FIPS 180-4 §5.3.3)
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  // Pre-processing: padding to 512-bit block alignment with 64-bit length
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

// ── Dispatchers (the Prereq 2 chokepoints) ───────────────────────────────────

/**
 * Byte-domain dispatcher. Returns:
 *   mode='fnv1a'  → 8 hex chars (FNV-1a)
 *   mode='sha256' → 64 hex chars (SHA-256)
 *
 * Used by hashGeometry and computeStateDigest. Every byte-domain
 * contract hash site routes through this — no site may call
 * fnv1aBytes or sha256Bytes directly for a flag-controlled hash.
 */
export function hashBytes(bytes: Uint8Array, mode: HashMode): string {
  if (mode === 'sha256') return sha256Bytes(bytes);
  return fnv1aBytes(bytes);
}

/**
 * String-domain dispatcher for CAEL trace-chain entries. Routes:
 *   mode='fnv1a'  → fnv1aStringLegacy (returns 'cael-<8hex>' —
 *                   preserves pre-Option-C trace format for
 *                   back-compat)
 *   mode='sha256' → UTF-8 encode → sha256Bytes (returns
 *                   'cael-sha-<64hex>' — distinct format makes
 *                   mode self-identifying from the hash shape alone)
 *
 * Why the format diverges between modes: the legacy FNV-1a path uses
 * charCodeAt (UTF-16 code units), which gives different bytes than
 * TextEncoder (UTF-8) for non-ASCII input. SHA-256 is new code and
 * canonicalizes to UTF-8. Mixed-input non-ASCII traces would fail
 * roundtrip if both modes used the same hash over different byte
 * encodings, so we tag them distinctly.
 */
export function hashStringForCAEL(input: string, mode: HashMode): string {
  if (mode === 'sha256') {
    const bytes = new TextEncoder().encode(input);
    return `cael-sha-${sha256Bytes(bytes)}`;
  }
  return fnv1aStringLegacy(input);
}

/**
 * Format-level consistency check. Given a hash output and a declared
 * mode, returns true iff the hash shape matches what that mode
 * produces. Used by CAELReplayer to catch mid-trace mode tampering
 * (Prereq 3 — an event's hash format must match cael.init.payload.hashMode).
 */
export function hashShapeMatchesMode(hash: string, mode: HashMode): boolean {
  if (mode === 'sha256') {
    // CAEL SHA-256 chain: 'cael-sha-<64hex>'
    if (hash.startsWith('cael-sha-')) {
      return /^cael-sha-[0-9a-f]{64}$/.test(hash);
    }
    // Byte-domain SHA-256: 64 hex chars
    return /^[0-9a-f]{64}$/.test(hash);
  }
  // FNV-1a: CAEL chain 'cael-<8hex>' or byte-domain 8 hex chars
  if (hash.startsWith('cael-')) {
    return /^cael-[0-9a-f]{8}$/.test(hash);
  }
  return /^[0-9a-f]{8}$/.test(hash);
}
