/**
 * Per-point / per-splat data-origin provenance for HoloMap reconstruction.
 *
 * This is the **observed-vs-invented** axis. It is distinct from sensor
 * confidence (`PointCloudChunk.confidence: Float32Array` in `HoloMapRuntime.ts`):
 * confidence answers "how sure is the sensor about this point", provenance
 * answers "where did this point come from". The two are orthogonal and coexist.
 *
 * Vocabulary aligns to the SimulationContract evidence idiom
 * (`ProvenanceMeasurementSource = 'measured' | 'declared'`,
 * `packages/engine/src/simulation/SimulationContract.ts`): `observed` is the
 * measured/sensor-attested class; `generative-extended` is model-invented.
 *
 * WHY this exists: NVIDIA ArtiFixer (SIGGRAPH 2026) makes 3D reconstruction
 * *generative* — it hallucinates unobserved regions and distills them back into
 * the splat, with **no signal distinguishing observed geometry from invented
 * geometry** (research/2026-06-23_artifixer-nvidia-generative-reconstruction.md).
 * That missing signal is HoloScript's moat. This module is the per-point carrier
 * for it; the provenance histogram it produces is the foundation for a
 * FidelityEvalContract receipt.
 *
 * @package @holoscript/core/reconstruction
 */

/**
 * Data-origin class for a single reconstructed point or splat.
 *
 * Ordered by TRUST (highest → lowest):
 * - `observed`            — sensor-attested: LiDAR / ARKit / Quest 3 passthrough
 *                           depth / any measured line-of-sight capture. The trustworthy class.
 * - `interpolated`        — derived *between* observations (densification that
 *                           adds no new invention; bounded by real neighbours).
 * - `nlos-inferred`       — geometry NOT directly observed by the sensor, but
 *                           *physically reconstructed from measured light transport*
 *                           (non-line-of-sight / around-a-corner imaging: transient/
 *                           histogram reconstruction, e.g. motion-induced aperture
 *                           sampling). More trustworthy than a learned prior (it is
 *                           anchored to real measured photons) but LESS than observed
 *                           or interpolated (it reconstructs genuinely-unseen surfaces
 *                           and is unverifiable by eye). See
 *                           research/2026-07-05_consumer-lidar-nlos-motion-induced-sampling.md.
 * - `generative-extended` — invented by a generative model in a region no sensor
 *                           observed (ArtiFixer-style fill). The lowest-trust class.
 */
export type PointProvenanceClass =
  | 'observed'
  | 'interpolated'
  | 'nlos-inferred'
  | 'generative-extended';

/** Compact uint8 codes for per-point encoding in buffers / glTF attributes. */
export const POINT_PROVENANCE_CODE: Record<PointProvenanceClass, number> = {
  observed: 0,
  interpolated: 1,
  'generative-extended': 2,
  // Appended (never renumber existing codes — persisted buffers depend on them).
  'nlos-inferred': 3,
};

/** Code → class lookup, indexed by the uint8 code. */
export const POINT_PROVENANCE_CLASS_BY_CODE: readonly PointProvenanceClass[] = [
  'observed', // 0
  'interpolated', // 1
  'generative-extended', // 2
  'nlos-inferred', // 3
];

export function provenanceClassToCode(cls: PointProvenanceClass): number {
  return POINT_PROVENANCE_CODE[cls];
}

/**
 * Code → class. An out-of-range / unknown code maps to `generative-extended`,
 * never to `observed`: an unrecognised provenance MUST fail toward *lower* trust,
 * so corruption can never silently upgrade invented geometry to sensor-attested.
 */
export function provenanceCodeToClass(code: number): PointProvenanceClass {
  return POINT_PROVENANCE_CLASS_BY_CODE[code] ?? 'generative-extended';
}

/**
 * Per-class point counts plus the honest "how much of this is real" fraction.
 * The shape a FidelityEvalContract receipt hashes over.
 */
export interface ProvenanceHistogram {
  observed: number;
  interpolated: number;
  'nlos-inferred': number;
  'generative-extended': number;
  total: number;
  /** observed / total — 1.0 = fully sensor-attested (line-of-sight), 0.0 = none observed. */
  observedFraction: number;
}

/** Tally a per-point uint8 provenance-code array into a {@link ProvenanceHistogram}. */
export function provenanceHistogram(codes: Uint8Array): ProvenanceHistogram {
  let observed = 0;
  let interpolated = 0;
  let nlosInferred = 0;
  let generativeExtended = 0;
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c === 0) observed++;
    else if (c === 1) interpolated++;
    else if (c === 3) nlosInferred++;
    // code 2 AND any unknown/corrupt code fall to the lowest-trust class, matching
    // provenanceCodeToClass's fail-toward-lower-trust rule.
    else generativeExtended++;
  }
  const total = codes.length;
  return {
    observed,
    interpolated,
    'nlos-inferred': nlosInferred,
    'generative-extended': generativeExtended,
    total,
    observedFraction: total > 0 ? observed / total : 0,
  };
}

/** Build a uint8 provenance array of `count` points all set to one class. */
export function uniformProvenance(count: number, cls: PointProvenanceClass): Uint8Array {
  const arr = new Uint8Array(count);
  arr.fill(provenanceClassToCode(cls));
  return arr;
}

/**
 * The honest default for a raw HoloMap capture cloud: the points came straight
 * from a sensor (`holo_reconstruct_export`), so absent any explicit per-point
 * tag they are `observed`. Densified / model-extended clouds MUST override this
 * (per-point codes or an explicit default) rather than inherit it.
 */
export const HOLOMAP_CAPTURE_DEFAULT_PROVENANCE: PointProvenanceClass = 'observed';
