/**
 * HologramStore — content-addressed persistence interface for HoloGram
 * bundles.
 *
 * This file is intentionally runtime-neutral (no fs, no fetch, no fs-aware
 * imports). Concrete implementations live in separate files:
 *   - FileSystemHologramStore — Node-only; studio + hologram-worker services
 *   - (future) HttpHologramStore — client-side; browser drop-zone → studio
 *
 * SECURITY posture (enforced by helpers + store impls):
 *   1. Hashes are re-computed by the store on put(); client-supplied hashes
 *      are ignored. This prevents a malicious uploader from squatting on a
 *      hash they didn't actually compute from the bundle they uploaded.
 *   2. All hash inputs are validated against /^[0-9a-f]{64}$/ BEFORE any
 *      path concatenation. Never build a path from unvalidated input.
 *   3. Asset names are not user-controlled — the enum below is the only
 *      surface area. Writing or reading any other file is forbidden.
 *   4. Writes are atomic (temp file + rename) so a crash mid-write can
 *      never leave a store entry in a corrupted half-state the reader
 *      would accept.
 *
 * @see D.019 (MEMORY.md): HoloGram product line + telegram push metaphor
 * @see Sprint 0b.1: this file
 */

import {
  computeBundleHash,
  validateBundle,
  type HologramBundle,
  type HologramMeta,
} from './HologramBundle';

// ── Asset allowlist ──────────────────────────────────────────────────────────
//
// The public surface of a bundle directory. The store refuses to read or
// write anything outside this set. If we add a new target (e.g., 'gltf'),
// it gets added HERE and nowhere else.

export const ASSET_NAMES = [
  'meta.json',
  'depth.bin',
  'normal.bin',
  'quilt.png',
  'mvhevc.mp4',
  'parallax.webm',
] as const;

export type AssetName = (typeof ASSET_NAMES)[number];

const ASSET_SET: ReadonlySet<AssetName> = new Set(ASSET_NAMES);

export function isAssetName(name: string): name is AssetName {
  return ASSET_SET.has(name as AssetName);
}

// ── Content-Type mapping (for HTTP surfaces) ─────────────────────────────────

export const ASSET_CONTENT_TYPES: Record<AssetName, string> = {
  'meta.json': 'application/json; charset=utf-8',
  'depth.bin': 'application/octet-stream',
  'normal.bin': 'application/octet-stream',
  'quilt.png': 'image/png',
  'mvhevc.mp4': 'video/mp4',
  'parallax.webm': 'video/webm',
};

// ── Hash validation ──────────────────────────────────────────────────────────

const HASH_PATTERN = /^[0-9a-f]{64}$/;

export class HologramStoreError extends Error {
  constructor(
    public readonly code:
      | 'invalid_hash'
      | 'invalid_asset'
      | 'hash_mismatch'
      | 'not_found'
      | 'size_limit_exceeded'
      | 'io_error',
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'HologramStoreError';
  }
}

/**
 * Assert that a string is a valid content-addressed hash. Throws
 * HologramStoreError('invalid_hash') on any deviation from the strict
 * 64-char lowercase hex pattern. NEVER use unvalidated input to build
 * a filesystem path.
 */
export function assertValidHash(hash: unknown): asserts hash is string {
  if (typeof hash !== 'string' || !HASH_PATTERN.test(hash)) {
    throw new HologramStoreError(
      'invalid_hash',
      `invalid hash: must be 64 lowercase hex chars, got ${
        typeof hash === 'string' ? JSON.stringify(hash) : typeof hash
      }`
    );
  }
}

export function assertValidAssetName(name: unknown): asserts name is AssetName {
  if (typeof name !== 'string' || !isAssetName(name)) {
    throw new HologramStoreError(
      'invalid_asset',
      `invalid asset name: must be one of ${ASSET_NAMES.join('|')}, got ${
        typeof name === 'string' ? JSON.stringify(name) : typeof name
      }`
    );
  }
}

// ── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Compute the per-bundle directory relative path. Always of the form
 * `<hash[0:2]>/<hash>`. The two-char prefix shard prevents any single
 * directory from becoming ls-unfriendly at >10k bundles.
 *
 * This function NEVER accepts raw user input: hash is validated before
 * any path construction. Callers MUST call this helper rather than
 * concatenating paths inline.
 */
export function bundleRelDir(hash: string): string {
  assertValidHash(hash);
  return `${hash.slice(0, 2)}/${hash}`;
}

export function bundleAssetRelPath(hash: string, asset: AssetName): string {
  assertValidAssetName(asset);
  return `${bundleRelDir(hash)}/${asset}`;
}

// ── PutResult ────────────────────────────────────────────────────────────────

export interface HologramStorePutResult {
  /** The authoritative hash the store recorded (recomputed from bytes). */
  hash: string;
  /**
   * true if new bytes were written; false if the store already contained
   * this hash (idempotent no-op). Useful for telemetry + "send" paths
   * that want to know whether they caused I/O or just linked.
   */
  written: boolean;
}

// ── The interface ────────────────────────────────────────────────────────────

export interface HologramStore {
  /**
   * Persist a bundle. The store RECOMPUTES the hash from the bundle's
   * meta + depth + normal and ignores the `hash` field on the input.
   * This is a security invariant: a caller cannot squat on a hash they
   * didn't actually compute.
   *
   * Idempotent: if the recomputed hash already exists in the store,
   * the method MUST return {hash, written: false} without overwriting.
   *
   * Throws HologramStoreError on hash/asset/size/io failures.
   */
  put(bundle: HologramBundle): Promise<HologramStorePutResult>;

  /** True iff the bundle dir exists and has at least a meta.json. */
  has(hash: string): Promise<boolean>;

  /**
   * Read a single asset. Returns null if the bundle or asset doesn't
   * exist. Throws HologramStoreError on invalid hash/asset inputs (404
   * is not an error, but a traversal attempt is).
   */
  getAsset(hash: string, asset: AssetName): Promise<Uint8Array | null>;

  /**
   * Read a bundle's meta.json. Returns null if the bundle doesn't
   * exist. Throws on parse errors (corrupt meta is an error, not 404).
   */
  getMeta(hash: string): Promise<HologramMeta | null>;
}

// ── Recompute+verify helper used by put() implementations ───────────────────

/**
 * Recompute the bundle hash from its identity bytes and validate internal
 * consistency. Returns the authoritative hash. This is the single choke
 * point for the "hash is computed, not trusted" invariant — all put()
 * implementations MUST call this before writing.
 */
export async function canonicalizeBundleForPut(
  bundle: HologramBundle
): Promise<string> {
  validateBundle(bundle);
  return computeBundleHash(bundle.meta, bundle.depthBin, bundle.normalBin);
}
