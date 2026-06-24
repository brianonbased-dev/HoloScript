import type { PointProvenanceClass } from '../reconstruction/PointProvenance';
import type { DensifyMode } from '../reconstruction/densifyByInterpolation';

/**
 * Optional reconstruction geometry passed through ExportManager.compilerOptions
 * so native exporters can embed HoloMap point samples (e.g. MCP holo_reconstruct_export).
 */
export interface HolomapPointCloudPayload {
  /** Base64 little-endian Float32 xyz triples (byte length = pointCount * 3 * 4). */
  positionsB64: string;
  /** Base64 uint8 rgb triples (byte length = pointCount * 3). */
  colorsB64: string;
  pointCount: number;
  /**
   * Optional base64 uint8 per-point provenance-class codes (byte length =
   * pointCount; 0=observed, 1=interpolated, 2=generative-extended — see
   * {@link PointProvenanceClass}). When absent, every point takes
   * {@link HolomapPointCloudPayload.provenanceDefault}. This is the
   * observed-vs-invented moat axis, orthogonal to sensor confidence.
   */
  provenanceB64?: string;
  /**
   * Provenance class applied to every point when `provenanceB64` is absent. A
   * pure sensor capture leaves this unset and inherits the honest capture
   * default ('observed'); a densified / model-extended cloud MUST declare the
   * real class here (or supply per-point `provenanceB64`) rather than let
   * invented points masquerade as observed.
   */
  provenanceDefault?: PointProvenanceClass;
  /**
   * Origin label for the provenance (e.g. 'sensor:quest3-depth' for an observed
   * capture, a model id like 'artifixer-14b' for generative-extended points).
   * Recorded verbatim in the exported glTF `asset.extras.holoProvenance.source`.
   */
  provenanceSource?: string;
  /**
   * Optional densification directive applied to the captured cloud before it is
   * splatted. `interpolation` adds bounded-by-reality midpoints (tagged
   * `interpolated`); `generative` adds model-invented fill (tagged
   * `generative-extended`, requires a configured GenerativeDensifierBackend on
   * the compiler). When present, densification re-derives per-point provenance,
   * superseding `provenanceB64`/`provenanceDefault` for the densified result.
   */
  densify?: { mode: DensifyMode; maxAdded?: number };
}
