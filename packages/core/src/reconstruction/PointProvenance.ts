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
 * - `observed`            — sensor-attested: LiDAR / ARKit / Quest 3 passthrough
 *                           depth / any measured capture. The trustworthy class.
 * - `interpolated`        — derived *between* observations (densification that
 *                           adds no new invention; bounded by real neighbours).
 * - `generative-extended` — invented by a generative model in a region no sensor
 *                           observed (ArtiFixer-style fill). The lowest-trust class.
 */
export type PointProvenanceClass = 'observed' | 'interpolated' | 'generative-extended';

/** Compact uint8 codes for per-point encoding in buffers / glTF attributes. */
export const POINT_PROVENANCE_CODE: Record<PointProvenanceClass, number> = {
  observed: 0,
  interpolated: 1,
  'generative-extended': 2,
};

/** Code → class lookup, indexed by the uint8 code. */
export const POINT_PROVENANCE_CLASS_BY_CODE: readonly PointProvenanceClass[] = [
  'observed',
  'interpolated',
  'generative-extended',
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
  'generative-extended': number;
  total: number;
  /** observed / total — 1.0 = fully sensor-attested, 0.0 = fully invented. */
  observedFraction: number;
}

/** Tally a per-point uint8 provenance-code array into a {@link ProvenanceHistogram}. */
export function provenanceHistogram(codes: Uint8Array): ProvenanceHistogram {
  let observed = 0;
  let interpolated = 0;
  let generativeExtended = 0;
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c === 0) observed++;
    else if (c === 1) interpolated++;
    else generativeExtended++;
  }
  const total = codes.length;
  return {
    observed,
    interpolated,
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
