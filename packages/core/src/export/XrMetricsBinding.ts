/**
 * XR→CRDT binding layer: persists Film3D metrics into Loro map with merge law.
 *
 * **Sync boundary**: After film3dXrVerification completes, before GistPublicationManifest.sign().
 *
 * **Key insight**: xr_metrics become **disputed facts** when persisted to CRDT:
 * - Two clients capture different depths for same scene → merge conflict
 * - Merge law: keep entry with **highest frameCount** (density of evidence)
 * - Tiebreaker: most recent **timestamp**
 *
 * This ensures physical evidence is subject to merge law (tropical max-plus semiring justification).
 * See GRAPH_RAG_SOVEREIGN_ORIGINATION.md for formal rationale.
 */

import { createHash } from 'crypto';

/**
 * Hashable Film3D XR metrics suitable for CRDT binding.
 * Derived from film3dXrVerification samples.
 */
export interface Film3dXrMetricsForBinding {
  /** SHA-256 hash of depth buffer snapshot (null if depth-sensing inactive) */
  depthHash: string | null;
  /** ed25519 signature over gaze trajectory samples in this session */
  gazeSignature: string | null;
  /** Count of valid view poses (density of stereo capture) */
  frameCount: number;
  /** Session collection timestamp (ISO 8601) */
  timestamp: string;
  /** Unique identifier for sensing device / session (e.g., 'webglrenderer-1', 'org-device-uuid') */
  sensorId: string;
  /** Optional comment for auditing which merge path was taken */
  mergeNote?: string;
}

/**
 * Compute a deterministic commitment hash for xr_metrics (used for provenance semiring).
 * Excludes mergeNote and timestamp to focus on **captured evidence**.
 */
export function computeXrMetricsCommitmentHash(metrics: Film3dXrMetricsForBinding): string {
  const payload = {
    depth_hash: metrics.depthHash,
    gaze_signature: metrics.gazeSignature,
    frame_count: metrics.frameCount,
    sensor_id: metrics.sensorId,
  };
  const canonical = JSON.stringify(payload);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Loro map merge law for film3d-xr-metrics entries.
 *
 * Conflict resolution:
 *  - If frameCount differs: **keep highest** (density → higher frameCount means more evidence)
 *  - If frameCount ties: **keep most recent** (timestamp, ISO 8601 string comparison)
 *  - Both metadata and timestamps are authoritative; signal to resolve via policy committee if disputed
 *
 * **Tropical semiring justification**:
 *  - Operation: max-plus over (frameCount, -timestamp_ms)
 *  - Absorbing element: (0, MIN_INT) — no evidence
 *  - Identity: (frameCount, -timestamp_ms) — single measured state
 *
 * This rule is set in LoroNativeSpatialAdapter at adapter registration time.
 */
export function resolveXrMetricsConflict(
  local: Film3dXrMetricsForBinding,
  remote: Film3dXrMetricsForBinding
): Film3dXrMetricsForBinding {
  // Compare frameCount first
  if (local.frameCount !== remote.frameCount) {
    const winner = local.frameCount > remote.frameCount ? local : remote;
    return {
      ...winner,
      mergeNote: `selected via max frameCount: ${Math.max(local.frameCount, remote.frameCount)}`,
    };
  }

  // frameCount tied; use timestamp (ISO 8601 lexical comparison = chronological for that precision)
  const localDate = new Date(local.timestamp).getTime();
  const remoteDate = new Date(remote.timestamp).getTime();
  const winner = localDate > remoteDate ? local : remote;

  return {
    ...winner,
    mergeNote: `selected via max timestamp (frameCount tied at ${local.frameCount})`,
  };
}

/**
 * Format xr_metrics entry key for Loro map storage.
 * Key structure: `${manifestId}:xr:film3d`
 */
export function xrMetricsMapKey(manifestId: string): string {
  return `${manifestId}:xr:film3d`;
}

/**
 * Extract Film3dXrMetricsForBinding from raw sample(s).
 * Suitable for use in GistPublicationManifest.bindXrMetrics() workflow.
 */
export function extractXrMetricsForBinding(params: {
  depthHash?: string | null;
  gazeSignature?: string | null;
  frameCount: number;
  sensorId: string;
  timestamp?: Date;
}): Film3dXrMetricsForBinding {
  return {
    depthHash: params.depthHash ?? null,
    gazeSignature: params.gazeSignature ?? null,
    frameCount: params.frameCount,
    sensorId: params.sensorId,
    timestamp: (params.timestamp ?? new Date()).toISOString(),
  };
}
