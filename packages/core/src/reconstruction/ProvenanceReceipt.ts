/**
 * Provenance receipt — a hashed attestation of the observed-vs-invented
 * composition of a delivered 3D asset.
 *
 * This is the PROVENANCE AXIS ONLY (the observed|interpolated|nlos-inferred|
 * generative-extended histogram over the bytes actually delivered). It is deliberately NOT the full
 * parity gate (chamfer / FID / rig / topology) — that is the FidelityEvalContract
 * owned by the ssja track. The intended seam: a FidelityEvalContract COMPOSES
 * this receipt as its provenance dimension rather than re-deriving it.
 *
 * `receiptHash` covers the DELIVERED bytes (per the ssja PLAN §2.5 rule: hash
 * delivered-on-target bytes, not generation-side metadata), so the attestation
 * cannot be forged by swapping the asset after measurement.
 *
 * WHY: NVIDIA ArtiFixer hallucinates unobserved regions with no observed-vs-
 * invented signal; this receipt is the verifiable form of that signal — the moat
 * (research/2026-06-23_artifixer-nvidia-generative-reconstruction.md, F.037).
 *
 * @package @holoscript/core/reconstruction
 */
import { createHash } from 'node:crypto';
import { provenanceHistogram, type ProvenanceHistogram } from './PointProvenance';

// v2 (2026-07-05): added the `nlos-inferred` class to the counted histogram — the
// honest label for around-a-corner / transient-reconstructed geometry (physically
// inferred from measured light transport, distinct from learned generative fill;
// research/2026-07-05_consumer-lidar-nlos-motion-induced-sampling.md). The bump is
// intentional: the canonical hash now covers a 4th count, so a v2 receipt hash
// differs from v1 by design even for assets with zero NLOS-inferred points.
export const PROVENANCE_RECEIPT_VERSION = 'provenance-receipt-v2' as const;

export interface ProvenanceReceipt {
  version: typeof PROVENANCE_RECEIPT_VERSION;
  /** Origin label (sensor id / generative model id), or null. */
  source: string | null;
  /** Observed-vs-invented histogram over the delivered points/splats. */
  histogram: ProvenanceHistogram;
  /** sha256 (hex) of the delivered asset bytes. */
  deliveredBytesHash: string;
  /**
   * sha256 (hex) over the canonical {version, source, integer class counts,
   * deliveredBytesHash}. Stable and forgery-resistant: changes if the asset
   * bytes OR the provenance composition changes.
   */
  receiptHash: string;
}

function sha256Hex(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Build a {@link ProvenanceReceipt} from per-point provenance codes and the
 * delivered asset bytes. The receipt hash is computed over the integer class
 * counts (NOT `observedFraction` — it is derived, and hashing a float would make
 * the hash sensitive to rounding) plus the delivered-bytes hash.
 */
export function buildProvenanceReceipt(
  provenanceCodes: Uint8Array,
  deliveredBytes: Uint8Array,
  source?: string | null
): ProvenanceReceipt {
  const histogram = provenanceHistogram(provenanceCodes);
  const deliveredBytesHash = sha256Hex(deliveredBytes);
  const src = source ?? null;
  const canonical = JSON.stringify({
    version: PROVENANCE_RECEIPT_VERSION,
    source: src,
    counts: {
      observed: histogram.observed,
      interpolated: histogram.interpolated,
      'nlos-inferred': histogram['nlos-inferred'],
      'generative-extended': histogram['generative-extended'],
      total: histogram.total,
    },
    deliveredBytesHash,
  });
  return {
    version: PROVENANCE_RECEIPT_VERSION,
    source: src,
    histogram,
    deliveredBytesHash,
    receiptHash: sha256Hex(canonical),
  };
}
