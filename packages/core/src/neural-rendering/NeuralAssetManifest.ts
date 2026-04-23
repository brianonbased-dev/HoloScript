/**
 * paper-13 NeuralAssetManifest — tier + schema for neural rendering under contract.
 *
 * Spec: ai-ecosystem/research/2026-04-23_paper-13-neural-rendering-contract-spec.md
 *
 * Three tiers:
 *   T0 canonical geometry       bit-identical (TBC Property 1 unchanged)
 *   T1 neural-approximated      bounded-loss (PSNR/SSIM/depth per viewpoint)
 *   T2 unverified               explicit label, refused in T0 scenes without opt-in
 *
 * Manifest hash is part of asset_id — any bit flip produces a new asset_id,
 * caught at resolve time. Schema changes require a new paper-13 spec version.
 */

export type NeuralTier = 'T0' | 'T1' | 'T2';
export type NeuralRepresentation = 'mesh' | 'nerf' | '3dgs' | 'world_model' | 'hybrid';
export type HashMode = 'fnv1a' | 'sha256';

export interface ViewSpec {
  view_id: string;
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    up: [number, number, number];
    fov_degrees: number;
    resolution: [number, number];
  };
  golden_frame_hash: string;
  golden_frame_uri?: string;
}

export interface ToleranceBands {
  psnr_min?: number;       // dB; fail below
  ssim_min?: number;       // 0..1; fail below
  depth_l1_max?: number;   // meters; fail above
}

export interface NeuralAssetManifest {
  asset_id: string;
  tier: NeuralTier;
  representation: NeuralRepresentation;
  checkpoint_hash?: string;
  canonical_viewpoints: ViewSpec[];
  tolerance_bands?: ToleranceBands;
  hash_mode: HashMode;
  upgrade_path?: string;
  created_at: string;
  created_by: string;
}

// ── canonical serialization (deterministic) ──

function sortKeys<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(sortKeys) as unknown as T;
  if (obj && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[k] = sortKeys((obj as Record<string, unknown>)[k]);
    }
    return sorted as T;
  }
  return obj;
}

/**
 * Canonical JSON serialization: sorted keys, stable field order. Must match
 * across all agents that validate the same manifest hash.
 */
export function canonicalSerialize(manifest: NeuralAssetManifest): string {
  // Exclude asset_id from the hash input (asset_id IS the hash output)
  const { asset_id: _unused, ...body } = manifest;
  return JSON.stringify(sortKeys(body));
}

// ── FNV-1a 32-bit (fast default; SHA-256 via subtle-crypto if mode=sha256) ──

function fnv1aHex(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export async function computeManifestHash(manifest: NeuralAssetManifest): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSerialize(manifest));
  if (manifest.hash_mode === 'sha256') {
    // Prefer Web Crypto (subtle). Fall back gracefully for non-browser envs.
    const g = globalThis as { crypto?: { subtle?: { digest?: (a: string, b: Uint8Array) => Promise<ArrayBuffer> } } };
    if (g.crypto?.subtle?.digest) {
      const buf = await g.crypto.subtle.digest('SHA-256', bytes);
      const view = new Uint8Array(buf);
      return Array.from(view, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Node fallback: dynamic import (keeps this module isomorphic)
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(bytes).digest('hex');
  }
  return fnv1aHex(bytes);
}

/**
 * Build a manifest with auto-computed asset_id. Convenience constructor.
 */
export async function buildManifest(
  input: Omit<NeuralAssetManifest, 'asset_id'>
): Promise<NeuralAssetManifest> {
  const withPlaceholder: NeuralAssetManifest = { ...input, asset_id: '' };
  const hash = await computeManifestHash(withPlaceholder);
  const prefix = input.hash_mode === 'sha256' ? 'sha256' : 'fnv1a';
  return { ...withPlaceholder, asset_id: `neural:${prefix}:${hash}` };
}

/**
 * Verify a manifest's asset_id matches its canonical content. Returns true
 * iff the recomputed hash equals the stored asset_id suffix.
 */
export async function verifyManifest(manifest: NeuralAssetManifest): Promise<boolean> {
  const { asset_id } = manifest;
  if (!asset_id.includes(':')) return false;
  const parts = asset_id.split(':');
  if (parts.length < 3) return false;
  const stored_hash = parts[parts.length - 1];
  const recomputed = await computeManifestHash(manifest);
  return stored_hash === recomputed;
}

/**
 * Tier promotion guard: T1 requires tolerance_bands; T0 forbids checkpoint_hash.
 * Returns a list of violations (empty = valid).
 */
export function validateTierConsistency(manifest: NeuralAssetManifest): string[] {
  const violations: string[] = [];
  if (manifest.tier === 'T0' && manifest.checkpoint_hash) {
    violations.push('T0 canonical assets must not carry checkpoint_hash');
  }
  if (manifest.tier === 'T1') {
    if (!manifest.checkpoint_hash) violations.push('T1 neural-approximated requires checkpoint_hash');
    if (!manifest.tolerance_bands || Object.keys(manifest.tolerance_bands).length === 0) {
      violations.push('T1 neural-approximated requires non-empty tolerance_bands');
    }
    if (manifest.canonical_viewpoints.length === 0) {
      violations.push('T1 neural-approximated requires ≥1 canonical_viewpoint with golden_frame_hash');
    }
  }
  if (manifest.tier === 'T2' && manifest.tolerance_bands) {
    violations.push('T2 unverified assets must NOT claim tolerance_bands (use T1 if bounds known)');
  }
  return violations;
}
