/**
 * Spatial anchor — binds a reconstructed model to a known real-world dimension
 * so the export is metrically trustworthy.
 *
 * Unanchored exports are explicitly tagged `relative-scale-only` so consumers
 * cannot mistake them for correctly-scaled models.
 */

export interface ReconstructionBounds {
  min: number[];
  max: number[];
}

export interface ReconstructionManifest {
  bounds: ReconstructionBounds;
}

export interface AnchorSpec {
  /** Known real-world dimension in meters (e.g. 1.0). */
  referenceDimension: number;
  /** Which axis the reference dimension applies to. */
  axis: 'x' | 'y' | 'z';
  /** Absolute tolerance in meters (default 0.05). */
  tolerance?: number;
}

export interface AnchoredExport {
  /** Scale factor applied to raw reconstruction units to reach metric. */
  scaleFactor: number;
  /** True when the measured dimension is within tolerance of the reference. */
  isAnchored: boolean;
  /** 'metric' if anchored; 'relative-scale-only' if not. */
  tag: 'metric' | 'relative-scale-only';
  /** The tolerance that was used for the check. */
  tolerance: number;
  /** The measured dimension before anchoring. */
  measuredDimension: number;
}

/**
 * Measure the extent of a bounds box along a given axis.
 */
export function measureBoundsDimension(
  manifest: ReconstructionManifest,
  axis: 'x' | 'y' | 'z' = 'y'
): number {
  const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  return manifest.bounds.max[idx]! - manifest.bounds.min[idx]!;
}

/**
 * Anchor a reconstruction manifest against a known real-world dimension.
 *
 * Returns an {@link AnchoredExport} that either passes the tolerance gate
 * (`tag: 'metric'`) or is flagged as unanchored (`tag: 'relative-scale-only'`).
 *
 * @throws If the manifest bounds are missing or malformed.
 */
export function anchorReconstruction(
  manifest: ReconstructionManifest,
  spec: AnchorSpec
): AnchoredExport {
  const tolerance = spec.tolerance ?? 0.05;
  const measured = measureBoundsDimension(manifest, spec.axis);

  if (!Number.isFinite(measured) || measured <= 0) {
    throw new Error(
      `Invalid measured dimension ${measured}. Manifest bounds may be corrupted or uninitialised.`
    );
  }

  const scaleFactor = spec.referenceDimension / measured;
  const delta = Math.abs(measured - spec.referenceDimension);
  const isAnchored = delta <= tolerance;

  return {
    scaleFactor,
    isAnchored,
    tag: isAnchored ? 'metric' : 'relative-scale-only',
    tolerance,
    measuredDimension: measured,
  };
}

/**
 * Assert that a manifest is anchored to the given reference dimension.
 * Fails loudly if the scale is outside tolerance.
 *
 * This is the test-facing entry point; production callers usually use
 * {@link anchorReconstruction} and branch on `tag`.
 */
export function assertAnchoredDimension(
  manifest: ReconstructionManifest,
  spec: AnchorSpec
): AnchoredExport {
  const result = anchorReconstruction(manifest, spec);
  if (!result.isAnchored) {
    throw new Error(
      `Anchor assertion failed: measured ${result.measuredDimension.toFixed(4)}m ` +
        `differs from reference ${spec.referenceDimension}m by ${Math.abs(
          result.measuredDimension - spec.referenceDimension
        ).toFixed(4)}m (tolerance ${result.tolerance}m). ` +
        `Export tagged: ${result.tag}`
    );
  }
  return result;
}
