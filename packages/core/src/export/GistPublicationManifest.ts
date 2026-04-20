/**
 * Gist / GitHub publication manifest — binds Door 1 (semantic graph / Loro provenance)
 * to Door 3 (optional x402 economic anchor) in a single JSON artifact.
 *
 * `provenance_semiring_digest` is a **v0** SHA-256 over canonical JSON (room + Loro version + optional
 * xr_metrics). A future **v1** may replace this with an explicit tropical-semiring merge fingerprint.
 *
 * @see FUTURIST_SovereignAgent_NativeOrigination (.ai-ecosystem)
 */

import { createHash } from 'crypto';
export type { Film3dXrMetricsForBinding } from './XrMetricsBinding.js';
export { computeXrMetricsCommitmentHash, resolveXrMetricsConflict, xrMetricsMapKey, extractXrMetricsForBinding } from './XrMetricsBinding.js';

export const GIST_PUBLICATION_MANIFEST_VERSION = '0.1.0' as const;

/** Stable document id used by LoroWebRTCProvider legal audit trail */
export function provenanceDocumentIdForRoom(room: string): string {
  return `provenance_receipt_${room}`;
}

/**
 * Optional x402 receipt fields — keep loose for facilitator variance;
 * align with marketplace-api `x402PaymentReceipt` where present.
 */
export interface X402ReceiptBinding {
  payment_id?: string;
  tx_hash?: string;
  network?: string;
  facilitator_endpoint?: string;
  verified_at_iso?: string;
  /** Raw facilitator response subset for auditors */
  raw?: Record<string, unknown>;
}

/**
 * Optional Film3D / WebXR session attestation bound into the publication manifest.
 * Non-cryptographic summary for auditors; pair with `xr_metrics` for physical telemetry.
 */
export interface Film3dAttestationBinding {
  /** Attestation format, e.g. `webxr-session-v0` */
  scheme?: string;
  session_id?: string;
  captured_at_iso?: string;
  /** Optional device / pipeline summary */
  device_summary?: Record<string, unknown>;
}

export interface ProvenanceReceiptBinding {
  /** Same as `provenance_receipt_${room}` from LoroWebRTCProvider */
  document_id: string;
  room: string;
  loro_doc_version: Record<string, unknown>;
  captured_at_iso: string;
}

/** Formal v1 digest representation as max-plus commutative matrix */
export type TropicalSemiringDigest = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

/** v0 digest until tropical-semiring fingerprint ships */
export interface ProvenanceSemiringDigestV0 {
  scheme: 'sha256_canonical_v0';
  digest_hex: string;
}

export interface GistPublicationManifestV0 {
  $schema?: string;
  holoscript_publication_manifest_version: typeof GIST_PUBLICATION_MANIFEST_VERSION;
  /** Semantic / graph export label */
  title?: string;
  provenance_receipt: ProvenanceReceiptBinding;
  /** Deterministic binding for lineage tooling; v0 is SHA-256 over canonical JSON (not yet tropical math) */
  provenance_semiring_digest?: ProvenanceSemiringDigestV0;
  /** Formal v1 Algebraic Semiring matrix ensuring mathematical commutative inclusion */
  tropical_semiring_digest?: TropicalSemiringDigest;
  x402_receipt?: X402ReceiptBinding;
  /** Film3D / WebXR session attestation (policy + session binding) */
  film3d_attestation?: Film3dAttestationBinding;
  /** Empirical hardware metrics harvested during a WebXR volumetric evaluation */
  xr_metrics?: Record<string, unknown>;
  /** Optional content addressing for the gist primary file */
  primary_asset_sha256?: string;
}

export interface BuildGistPublicationManifestParams {
  room: string;
  loroDocVersion: Record<string, unknown>;
  x402Receipt?: X402ReceiptBinding | null;
  title?: string;
  primaryAssetSha256?: string;
  capturedAt?: Date;
  xrMetrics?: Record<string, unknown>;
  /** When false, omit `provenance_semiring_digest` (testing or legacy consumers) */
  includeSemiringDigest?: boolean;
  /** Formal v1 algebraic tropical semiring digest */
  tropicalSemiringDigest?: TropicalSemiringDigest;
  /** Optional Film3D / WebXR attestation */
  film3dAttestation?: Film3dAttestationBinding | null;
}

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = sortKeysDeep(obj[k]);
  }
  return sorted;
}

/**
 * Canonical v0 digest: SHA-256(hex) over sorted-key JSON of room + loro_doc_version + optional xr_metrics.
 * Intentionally excludes capture timestamps and x402 payloads so the digest tracks graph + physical telemetry.
 */
export function computeProvenanceSemiringDigestV0(params: {
  room: string;
  loroDocVersion: Record<string, unknown>;
  xrMetrics?: Record<string, unknown> | null;
}): ProvenanceSemiringDigestV0 {
  const payload: Record<string, unknown> = {
    room: params.room,
    loro_doc_version: sortKeysDeep(params.loroDocVersion) as Record<string, unknown>,
  };
  if (params.xrMetrics && Object.keys(params.xrMetrics).length > 0) {
    payload.xr_metrics = sortKeysDeep(params.xrMetrics) as Record<string, unknown>;
  }
  const canonical = JSON.stringify(sortKeysDeep(payload));
  const digest_hex = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return { scheme: 'sha256_canonical_v0', digest_hex };
}

export function buildGistPublicationManifest(
  params: BuildGistPublicationManifestParams
): GistPublicationManifestV0 {
  const captured = params.capturedAt ?? new Date();
  const room = params.room;
  const includeDigest = params.includeSemiringDigest !== false;
  const xrMetrics =
    params.xrMetrics && Object.keys(params.xrMetrics).length > 0 ? params.xrMetrics : undefined;

  const manifest: GistPublicationManifestV0 = {
    $schema: 'https://holoscript.dev/schemas/gist-publication-manifest/v0.1',
    holoscript_publication_manifest_version: GIST_PUBLICATION_MANIFEST_VERSION,
    title: params.title,
    provenance_receipt: {
      document_id: provenanceDocumentIdForRoom(room),
      room,
      loro_doc_version: params.loroDocVersion,
      captured_at_iso: captured.toISOString(),
    },
  };

  if (includeDigest) {
    manifest.provenance_semiring_digest = computeProvenanceSemiringDigestV0({
      room,
      loroDocVersion: params.loroDocVersion,
      xrMetrics,
    });
  }

  if (params.tropicalSemiringDigest) {
    manifest.tropical_semiring_digest = params.tropicalSemiringDigest;
  }

  if (params.x402Receipt && Object.keys(params.x402Receipt).length > 0) {
    manifest.x402_receipt = params.x402Receipt;
  }
  if (xrMetrics) {
    manifest.xr_metrics = xrMetrics;
  }
  if (params.primaryAssetSha256) {
    manifest.primary_asset_sha256 = params.primaryAssetSha256;
  }
  if (
    params.film3dAttestation &&
    typeof params.film3dAttestation === 'object' &&
    Object.keys(params.film3dAttestation).length > 0
  ) {
    manifest.film3d_attestation = params.film3dAttestation;
  }
  return manifest;
}

export function serializeGistPublicationManifest(manifest: GistPublicationManifestV0): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
