/**
 * HologramBundle — the canonical data structure for a HoloGram.
 *
 * A HoloGram is a 2D source image/GIF/video transformed into a 3D
 * representation that can be rendered on Looking Glass displays, Apple
 * Vision Pro (as MV-HEVC spatial video), or as a parallax card on phones.
 *
 * This file intentionally contains NO rendering logic — only the data
 * shape and deterministic content-addressing. Renderers live in
 * `createHologram.ts` (orchestrator) and platform-specific providers.
 *
 * @see D.019: HoloGram product line + telegram push metaphor
 * @see W.148: Browser-native depth estimation is production-ready
 * @see W.067a: Content hashes must be stable cross-platform (LF canon)
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type HologramSourceKind = 'image' | 'gif' | 'video';

export type HologramTarget = 'quilt' | 'mvhevc' | 'parallax';

export interface HologramMeta {
  /** Source media kind */
  sourceKind: HologramSourceKind;
  /** Output width in pixels (depth/normal map dimension) */
  width: number;
  /** Output height in pixels */
  height: number;
  /** Number of frames (1 for still images, >1 for GIF/video) */
  frames: number;
  /** Depth model identifier used for inference */
  modelId: string;
  /** Which backend actually ran the inference */
  backend: 'webgpu' | 'wasm' | 'cpu' | 'onnxruntime-node';
  /** Total wall-clock time to build the bundle (ms) */
  inferenceMs: number;
  /** ISO8601 timestamp of bundle creation */
  createdAt: string;
  /** Schema version for future migration */
  schemaVersion: 1;
}

export interface HologramBundle {
  /**
   * Content-addressed identifier. SHA-256 hex of canonical
   * (meta ‖ depth ‖ normal). Stable across platforms per W.067a.
   * Quilt/MV-HEVC bytes are NOT hashed — different renderers may
   * produce byte-different outputs for the same logical HoloGram.
   */
  hash: string;
  meta: HologramMeta;
  /** Float32 depth map, row-major, values in [0,1] (0=near, 1=far) */
  depthBin: Uint8Array;
  /** Float32 RGB normal map, row-major, values in [0,1] */
  normalBin: Uint8Array;
  /** Looking Glass quilt as PNG bytes (if 'quilt' target requested) */
  quiltPng?: Uint8Array;
  /** Apple Vision Pro MV-HEVC mp4 bytes (if 'mvhevc' target requested) */
  mvhevcMp4?: Uint8Array;
  /** Fallback parallax WebM bytes (if 'parallax' target requested) */
  parallaxWebm?: Uint8Array;
}

// ── Errors ───────────────────────────────────────────────────────────────────

/**
 * Thrown when a HologramBundle fails validation. Carries a machine-readable
 * code so callers can branch (e.g., MCP tools surfacing structured errors).
 */
export class HologramBundleError extends Error {
  constructor(
    public readonly code:
      | 'invalid_media'
      | 'invalid_dimensions'
      | 'invalid_meta'
      | 'depth_size_mismatch'
      | 'normal_size_mismatch'
      | 'hash_mismatch',
    message: string
  ) {
    super(message);
    this.name = 'HologramBundleError';
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a bundle's internal consistency. Throws HologramBundleError on
 * any mismatch. Does NOT recompute the hash — use verifyBundleHash for that.
 */
export function validateBundle(bundle: HologramBundle): void {
  const { meta, depthBin, normalBin } = bundle;

  if (!Number.isInteger(meta.width) || meta.width <= 0) {
    throw new HologramBundleError(
      'invalid_dimensions',
      `width must be a positive integer, got ${meta.width}`
    );
  }
  if (!Number.isInteger(meta.height) || meta.height <= 0) {
    throw new HologramBundleError(
      'invalid_dimensions',
      `height must be a positive integer, got ${meta.height}`
    );
  }
  if (!Number.isInteger(meta.frames) || meta.frames <= 0) {
    throw new HologramBundleError(
      'invalid_meta',
      `frames must be a positive integer, got ${meta.frames}`
    );
  }
  if (meta.schemaVersion !== 1) {
    throw new HologramBundleError(
      'invalid_meta',
      `unsupported schemaVersion ${meta.schemaVersion}`
    );
  }

  // depth = width * height * frames * 4 bytes (Float32)
  const expectedDepthBytes = meta.width * meta.height * meta.frames * 4;
  if (depthBin.byteLength !== expectedDepthBytes) {
    throw new HologramBundleError(
      'depth_size_mismatch',
      `depthBin is ${depthBin.byteLength} bytes, expected ${expectedDepthBytes}`
    );
  }

  // normal = width * height * frames * 3 channels * 4 bytes (Float32 RGB)
  const expectedNormalBytes = meta.width * meta.height * meta.frames * 3 * 4;
  if (normalBin.byteLength !== expectedNormalBytes) {
    throw new HologramBundleError(
      'normal_size_mismatch',
      `normalBin is ${normalBin.byteLength} bytes, expected ${expectedNormalBytes}`
    );
  }
}

// ── Content-Addressed Hashing ────────────────────────────────────────────────

/**
 * Canonical JSON serialization for `meta` — sorted keys, no whitespace,
 * guaranteed byte-stable across runtimes. This is what the hash commits to.
 *
 * We omit `inferenceMs` and `createdAt` from the hash: they're observational
 * metadata, not identity. Two identical runs produce the same hash.
 */
export function canonicalMetaJson(meta: HologramMeta): string {
  // Explicit key ordering — do NOT rely on Object.keys() iteration order
  // across engine versions.
  const identity = {
    backend: meta.backend,
    frames: meta.frames,
    height: meta.height,
    modelId: meta.modelId,
    schemaVersion: meta.schemaVersion,
    sourceKind: meta.sourceKind,
    width: meta.width,
  };
  return JSON.stringify(identity);
}

/**
 * Cross-runtime SHA-256. Uses Web Crypto (available in browser, Node 20+,
 * Deno, Bun, edge workers). Throws if unavailable — callers should never
 * hit that path in production.
 */
async function sha256(bytes: Uint8Array): Promise<string> {
  const subtle =
    typeof globalThis !== 'undefined' && globalThis.crypto?.subtle
      ? globalThis.crypto.subtle
      : undefined;
  if (!subtle) {
    throw new HologramBundleError(
      'invalid_meta',
      'Web Crypto SubtleCrypto is unavailable in this runtime'
    );
  }
  const ab: ArrayBuffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? (bytes.buffer as ArrayBuffer)
    : bytes.slice().buffer;
  const digest = await subtle.digest('SHA-256', ab);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex;
}

/**
 * Compute a bundle's canonical hash. Identity = meta (canonical JSON) ‖ 0x00
 * ‖ depthBin ‖ 0x00 ‖ normalBin. Renderer outputs (quilt/mvhevc/parallax)
 * are NOT part of the identity — see HologramBundle.hash docstring.
 */
export async function computeBundleHash(
  meta: HologramMeta,
  depthBin: Uint8Array,
  normalBin: Uint8Array
): Promise<string> {
  const metaBytes = new TextEncoder().encode(canonicalMetaJson(meta));
  const sep = new Uint8Array([0x00]);
  const total = new Uint8Array(
    metaBytes.byteLength + 1 + depthBin.byteLength + 1 + normalBin.byteLength
  );
  let off = 0;
  total.set(metaBytes, off); off += metaBytes.byteLength;
  total.set(sep, off); off += 1;
  total.set(depthBin, off); off += depthBin.byteLength;
  total.set(sep, off); off += 1;
  total.set(normalBin, off);
  return sha256(total);
}

/**
 * Recompute and compare a bundle's hash. Throws HologramBundleError with
 * code 'hash_mismatch' if the stored hash doesn't match the recomputed
 * value. Use on read paths (storage fetch, network transfer) to detect
 * corruption.
 */
export async function verifyBundleHash(bundle: HologramBundle): Promise<void> {
  const recomputed = await computeBundleHash(
    bundle.meta,
    bundle.depthBin,
    bundle.normalBin
  );
  if (recomputed !== bundle.hash) {
    throw new HologramBundleError(
      'hash_mismatch',
      `stored hash ${bundle.hash} does not match recomputed ${recomputed}`
    );
  }
}
