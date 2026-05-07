/**
 * Photo-derived botanical material extraction for Lotus / CAEL assets.
 *
 * The extractor is intentionally pixel-buffer based. Browser callers can feed
 * ImageData directly; Node callers can use any trusted decoder upstream. This
 * keeps provenance, hashing, and wallet signing outside the estimator while
 * making the PBR trait parameters deterministic and testable.
 */

export type BotanicalReferenceRole = 'material' | 'silhouette' | 'leaf_context' | 'unknown';

export interface BotanicalReferenceProvenance {
  uri?: string;
  contentHash?: string;
  walletSignature?: string;
}

export interface BotanicalImageSample {
  id: string;
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray | readonly number[];
  role?: BotanicalReferenceRole;
  provenance?: BotanicalReferenceProvenance;
}

export interface BotanicalMaterialExtractionOptions {
  traitName?: string;
  capturedAt?: string;
  referenceManifest?: string;
  sourceKind?: string;
  generatedBy?: string;
}

export interface BotanicalMaterialParams {
  subsurface_scattering: number;
  subsurface_radius_rgb: [number, number, number];
  petal_translucency_base: number;
  petal_translucency_edge: number;
  roughness: number;
  ior: number;
  vein_normal_intensity: number;
  edge_curl_intensity: number;
  gravity_sag_outer: number;
}

export interface BotanicalColorParams {
  petal_base: string;
  petal_mid: string;
  petal_inner: string;
  petal_rim: string;
  petal_shadow: string;
  seed_pod: string;
  seed_pod_rim: string;
  stamen: string;
  stamen_tip: string;
  leaf: string;
  leaf_dark: string;
  water: string;
}

export interface BotanicalPetalRing {
  name: 'inner' | 'mid' | 'outer';
  count: number;
  cup: number;
  gravity_sag: number;
}

export interface BotanicalGeometryParams {
  petal_rings: BotanicalPetalRing[];
  petal_shape: string;
  stamen_filament_count: number;
  seed_pod_dot_pattern: string;
}

export interface BotanicalMaterialDiagnostics {
  sample_count: number;
  pixel_count: number;
  petal_pixel_count: number;
  leaf_pixel_count: number;
  stamen_pixel_count: number;
  water_pixel_count: number;
  mean_petal_luminance: number;
  mean_petal_saturation: number;
  petal_gradient_energy: number;
  provenance_hash_count: number;
  provenance_signature_count: number;
  confidence: number;
}

export interface BotanicalMaterialExtraction {
  schema: 'holoscript.botanical.material-extract.v1';
  status: 'extracted_from_signed_references' | 'extracted_pending_cael_anchor';
  captured_at: string;
  generated_by: string;
  reference_manifest?: string;
  source: {
    kind: string;
    count: number;
    anchor_ids: string[];
    content_hash_status: 'complete' | 'partial' | 'missing';
    wallet_signature_status: 'complete' | 'partial' | 'missing';
  };
  botanical_trait_target: string;
  material: BotanicalMaterialParams;
  colors: BotanicalColorParams;
  geometry: BotanicalGeometryParams;
  diagnostics: BotanicalMaterialDiagnostics;
}

interface PixelFeature {
  r: number;
  g: number;
  b: number;
  h: number;
  s: number;
  v: number;
  luma: number;
  gradient: number;
  edge: number;
}

interface PixelBuckets {
  petal: PixelFeature[];
  leaf: PixelFeature[];
  stamen: PixelFeature[];
  water: PixelFeature[];
  all: PixelFeature[];
}

const DEFAULT_LOTUS_RINGS: BotanicalPetalRing[] = [
  { name: 'inner', count: 8, cup: 0.86, gravity_sag: 0.02 },
  { name: 'mid', count: 13, cup: 0.5, gravity_sag: 0.12 },
  { name: 'outer', count: 21, cup: 0.24, gravity_sag: 0.3 },
];

const DEFAULT_COLORS: BotanicalColorParams = {
  petal_base: '#fff1f6',
  petal_mid: '#f47ab7',
  petal_inner: '#ff9ecf',
  petal_rim: '#c42a86',
  petal_shadow: '#84205f',
  seed_pod: '#f4d74a',
  seed_pod_rim: '#b7c66b',
  stamen: '#f59e0b',
  stamen_tip: '#fff4bd',
  leaf: '#235f4f',
  leaf_dark: '#102f28',
  water: '#07140f',
};

export function extractBotanicalLotusMaterial(
  samples: readonly BotanicalImageSample[],
  options: BotanicalMaterialExtractionOptions = {}
): BotanicalMaterialExtraction {
  if (samples.length === 0) {
    throw new Error('extractBotanicalLotusMaterial requires at least one image sample');
  }

  const buckets = createBuckets();
  for (const sample of samples) {
    collectSamplePixels(sample, buckets);
  }

  const petal = buckets.petal;
  const leaf = buckets.leaf;
  const stamen = buckets.stamen;
  const water = buckets.water;

  const meanPetalLuma = mean(petal, (pixel) => pixel.luma, 0.62);
  const meanPetalSat = mean(petal, (pixel) => pixel.s, 0.62);
  const petalGradient = mean(petal, (pixel) => pixel.gradient, 0.08);
  const petalEdgeLuma = mean(
    petal.filter((pixel) => pixel.edge > 0.72),
    (pixel) => pixel.luma,
    meanPetalLuma
  );
  const petalCenterLuma = mean(
    petal.filter((pixel) => pixel.edge < 0.38),
    (pixel) => pixel.luma,
    meanPetalLuma
  );
  const backlightLift = clamp01(petalEdgeLuma - petalCenterLuma + 0.5);
  const veinNormal = clamp(round4(0.018 + petalGradient * 0.22), 0.018, 0.09);

  const colors = deriveColors(petal, leaf, stamen, water);
  const material: BotanicalMaterialParams = {
    subsurface_scattering: clamp(round4(0.48 + meanPetalSat * 0.22 + backlightLift * 0.18), 0.45, 0.82),
    subsurface_radius_rgb: deriveSubsurfaceRadius(colors.petal_mid),
    petal_translucency_base: clamp(round4(0.42 + meanPetalLuma * 0.24 + backlightLift * 0.18), 0.38, 0.78),
    petal_translucency_edge: clamp(round4(0.24 + petalEdgeLuma * 0.18), 0.24, 0.48),
    roughness: clamp(round4(0.64 + veinNormal * 1.4), 0.62, 0.82),
    ior: clamp(round4(1.33 + meanPetalSat * 0.055), 1.33, 1.39),
    vein_normal_intensity: veinNormal,
    edge_curl_intensity: clamp(round4(0.34 + mean(petal, (pixel) => pixel.edge, 0.5) * 0.38), 0.34, 0.68),
    gravity_sag_outer: clamp(round4(0.18 + meanPetalLuma * 0.18), 0.18, 0.36),
  };

  const provenanceHashCount = samples.filter((sample) => sample.provenance?.contentHash).length;
  const provenanceSignatureCount = samples.filter((sample) => sample.provenance?.walletSignature).length;
  const contentHashStatus = completenessStatus(provenanceHashCount, samples.length);
  const walletSignatureStatus = completenessStatus(provenanceSignatureCount, samples.length);
  const signed = contentHashStatus === 'complete' && walletSignatureStatus === 'complete';

  return {
    schema: 'holoscript.botanical.material-extract.v1',
    status: signed ? 'extracted_from_signed_references' : 'extracted_pending_cael_anchor',
    captured_at: options.capturedAt ?? new Date().toISOString().slice(0, 10),
    generated_by: options.generatedBy ?? '@holoscript/snn-webgpu/material-extraction/botanical-lotus',
    ...(options.referenceManifest ? { reference_manifest: options.referenceManifest } : {}),
    source: {
      kind: options.sourceKind ?? 'pixel_reference_images',
      count: samples.length,
      anchor_ids: samples.map((sample) => sample.id),
      content_hash_status: contentHashStatus,
      wallet_signature_status: walletSignatureStatus,
    },
    botanical_trait_target: options.traitName ?? '@botanical_lotus',
    material,
    colors,
    geometry: {
      petal_rings: DEFAULT_LOTUS_RINGS.map((ring) => ({ ...ring })),
      petal_shape: 'broad_elliptic_pointed_tip_with_center_ridge',
      stamen_filament_count: estimateStamenCount(stamen.length, petal.length),
      seed_pod_dot_pattern: '1_center_7_12_18_radial',
    },
    diagnostics: {
      sample_count: samples.length,
      pixel_count: buckets.all.length,
      petal_pixel_count: petal.length,
      leaf_pixel_count: leaf.length,
      stamen_pixel_count: stamen.length,
      water_pixel_count: water.length,
      mean_petal_luminance: round4(meanPetalLuma),
      mean_petal_saturation: round4(meanPetalSat),
      petal_gradient_energy: round4(petalGradient),
      provenance_hash_count: provenanceHashCount,
      provenance_signature_count: provenanceSignatureCount,
      confidence: estimateConfidence(samples.length, petal.length, leaf.length, stamen.length),
    },
  };
}

export function toBotanicalLotusTrait(extraction: BotanicalMaterialExtraction): string {
  const material = extraction.material;
  const colors = extraction.colors;
  return [
    `trait ${extraction.botanical_trait_target} {`,
    `  // Generated by ${extraction.generated_by}`,
    `  reference_status: "${extraction.status}"`,
    `  subsurface_scattering: ${material.subsurface_scattering}`,
    `  subsurface_radius: [${material.subsurface_radius_rgb.join(', ')}]`,
    `  petal_translucency_base: ${material.petal_translucency_base}`,
    `  petal_translucency_edge: ${material.petal_translucency_edge}`,
    `  vein_normal_intensity: ${material.vein_normal_intensity}`,
    `  edge_curl_intensity: ${material.edge_curl_intensity}`,
    `  gravity_sag_outer: ${material.gravity_sag_outer}`,
    `  color_base: "${colors.petal_base}"`,
    `  color_mid: "${colors.petal_mid}"`,
    `  color_edge: "${colors.petal_rim}"`,
    `  stamen_color: "${colors.stamen}"`,
    `}`,
  ].join('\n');
}

function createBuckets(): PixelBuckets {
  return {
    petal: [],
    leaf: [],
    stamen: [],
    water: [],
    all: [],
  };
}

function collectSamplePixels(sample: BotanicalImageSample, buckets: PixelBuckets): void {
  assertSampleShape(sample);
  const { width, height, data } = sample;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3] ?? 255;
      if (alpha < 16) {
        continue;
      }

      const r = (data[offset] ?? 0) / 255;
      const g = (data[offset + 1] ?? 0) / 255;
      const b = (data[offset + 2] ?? 0) / 255;
      const hsv = rgbToHsv(r, g, b);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const gradient = localGradient(data, width, height, x, y, luma);
      const edge = normalizedEdgeDistance(width, height, x, y);
      const feature: PixelFeature = { r, g, b, h: hsv.h, s: hsv.s, v: hsv.v, luma, gradient, edge };

      buckets.all.push(feature);
      if (isLotusPetal(feature)) {
        buckets.petal.push(feature);
      } else if (isLotusStamen(feature)) {
        buckets.stamen.push(feature);
      } else if (isLotusLeaf(feature)) {
        buckets.leaf.push(feature);
      } else if (isWater(feature)) {
        buckets.water.push(feature);
      }
    }
  }
}

function assertSampleShape(sample: BotanicalImageSample): void {
  if (!Number.isInteger(sample.width) || !Number.isInteger(sample.height)) {
    throw new Error(`Image sample ${sample.id} must have integer width and height`);
  }
  if (sample.width <= 0 || sample.height <= 0) {
    throw new Error(`Image sample ${sample.id} must have positive width and height`);
  }
  const expected = sample.width * sample.height * 4;
  if (sample.data.length < expected) {
    throw new Error(`Image sample ${sample.id} has ${sample.data.length} RGBA values; expected ${expected}`);
  }
}

function deriveColors(
  petal: readonly PixelFeature[],
  leaf: readonly PixelFeature[],
  stamen: readonly PixelFeature[],
  water: readonly PixelFeature[]
): BotanicalColorParams {
  return {
    petal_base: pixelToHex(percentilePixel(petal, 'luma', 0.92, DEFAULT_COLORS.petal_base)),
    petal_mid: pixelToHex(percentilePixel(petal, 's', 0.55, DEFAULT_COLORS.petal_mid)),
    petal_inner: pixelToHex(percentilePixel(petal, 'luma', 0.72, DEFAULT_COLORS.petal_inner)),
    petal_rim: pixelToHex(percentilePixel(petal, 's', 0.88, DEFAULT_COLORS.petal_rim)),
    petal_shadow: pixelToHex(percentilePixel(petal, 'luma', 0.16, DEFAULT_COLORS.petal_shadow)),
    seed_pod: pixelToHex(percentilePixel(stamen, 'luma', 0.82, DEFAULT_COLORS.seed_pod)),
    seed_pod_rim: mixHex(pixelToHex(percentilePixel(stamen, 'luma', 0.62, DEFAULT_COLORS.seed_pod_rim)), DEFAULT_COLORS.seed_pod_rim, 0.35),
    stamen: pixelToHex(percentilePixel(stamen, 's', 0.68, DEFAULT_COLORS.stamen)),
    stamen_tip: pixelToHex(percentilePixel(stamen, 'luma', 0.95, DEFAULT_COLORS.stamen_tip)),
    leaf: pixelToHex(percentilePixel(leaf, 'luma', 0.58, DEFAULT_COLORS.leaf)),
    leaf_dark: pixelToHex(percentilePixel(leaf, 'luma', 0.18, DEFAULT_COLORS.leaf_dark)),
    water: pixelToHex(percentilePixel(water, 'luma', 0.12, DEFAULT_COLORS.water)),
  };
}

function percentilePixel(
  pixels: readonly PixelFeature[],
  field: 'luma' | 's',
  percentile: number,
  fallbackHex: string
): PixelFeature {
  if (pixels.length === 0) {
    return hexToPixel(fallbackHex);
  }
  const sorted = [...pixels].sort((a, b) => a[field] - b[field]);
  const index = clamp(Math.round((sorted.length - 1) * percentile), 0, sorted.length - 1);
  return sorted[index];
}

function isLotusPetal(pixel: PixelFeature): boolean {
  const magentaHue = pixel.h >= 300 || pixel.h <= 18;
  const pinkHue = pixel.h >= 285 && pixel.h <= 360;
  const redDominant = pixel.r > pixel.g * 1.12 && pixel.b > pixel.g * 0.58;
  return (magentaHue || pinkHue) && redDominant && pixel.s > 0.16 && pixel.v > 0.22;
}

function isLotusStamen(pixel: PixelFeature): boolean {
  return pixel.h >= 32 && pixel.h <= 72 && pixel.s > 0.28 && pixel.v > 0.32;
}

function isLotusLeaf(pixel: PixelFeature): boolean {
  return pixel.h >= 78 && pixel.h <= 178 && pixel.s > 0.12 && pixel.v > 0.08 && pixel.g >= pixel.r * 0.72;
}

function isWater(pixel: PixelFeature): boolean {
  return pixel.v < 0.16 && pixel.g >= pixel.r * 0.7;
}

function estimateStamenCount(stamenPixels: number, petalPixels: number): number {
  if (stamenPixels === 0 || petalPixels === 0) {
    return 58;
  }
  const ratio = stamenPixels / Math.max(1, petalPixels);
  return Math.round(clamp(42 + ratio * 260, 42, 96));
}

function estimateConfidence(sampleCount: number, petalPixels: number, leafPixels: number, stamenPixels: number): number {
  const sampleSignal = clamp01(sampleCount / 3);
  const petalSignal = clamp01(petalPixels / 300);
  const contextSignal = clamp01((leafPixels + stamenPixels) / 160);
  return round4(clamp01(0.2 + sampleSignal * 0.25 + petalSignal * 0.35 + contextSignal * 0.2));
}

function deriveSubsurfaceRadius(hex: string): [number, number, number] {
  const pixel = hexToPixel(hex);
  return [
    round4(clamp(0.72 + pixel.r * 0.24, 0.72, 0.96)),
    round4(clamp(0.18 + pixel.g * 0.22, 0.18, 0.42)),
    round4(clamp(0.46 + pixel.b * 0.32, 0.46, 0.78)),
  ];
}

function completenessStatus(count: number, total: number): 'complete' | 'partial' | 'missing' {
  if (count === 0) {
    return 'missing';
  }
  return count === total ? 'complete' : 'partial';
}

function localGradient(
  data: Uint8Array | Uint8ClampedArray | readonly number[],
  width: number,
  height: number,
  x: number,
  y: number,
  luma: number
): number {
  const rightX = Math.min(width - 1, x + 1);
  const downY = Math.min(height - 1, y + 1);
  const right = lumaAt(data, width, rightX, y);
  const down = lumaAt(data, width, x, downY);
  return Math.sqrt((right - luma) ** 2 + (down - luma) ** 2);
}

function lumaAt(data: Uint8Array | Uint8ClampedArray | readonly number[], width: number, x: number, y: number): number {
  const offset = (y * width + x) * 4;
  const r = (data[offset] ?? 0) / 255;
  const g = (data[offset + 1] ?? 0) / 255;
  const b = (data[offset + 2] ?? 0) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function normalizedEdgeDistance(width: number, height: number, x: number, y: number): number {
  const dx = Math.abs(x / Math.max(1, width - 1) - 0.5) * 2;
  const dy = Math.abs(y / Math.max(1, height - 1) - 0.5) * 2;
  return clamp01(Math.max(dx, dy));
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }
  return {
    h: h < 0 ? h + 360 : h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function pixelToHex(pixel: PixelFeature): string {
  const r = byteToHex(pixel.r);
  const g = byteToHex(pixel.g);
  const b = byteToHex(pixel.b);
  return `#${r}${g}${b}`;
}

function hexToPixel(hex: string): PixelFeature {
  const normalized = hex.replace('#', '');
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  const hsv = rgbToHsv(r, g, b);
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return { r, g, b, h: hsv.h, s: hsv.s, v: hsv.v, luma, gradient: 0, edge: 0.5 };
}

function mixHex(a: string, b: string, amountB: number): string {
  const left = hexToPixel(a);
  const right = hexToPixel(b);
  return pixelToHex({
    r: left.r * (1 - amountB) + right.r * amountB,
    g: left.g * (1 - amountB) + right.g * amountB,
    b: left.b * (1 - amountB) + right.b * amountB,
    h: 0,
    s: 0,
    v: 0,
    luma: 0,
    gradient: 0,
    edge: 0,
  });
}

function byteToHex(value: number): string {
  return Math.round(clamp01(value) * 255)
    .toString(16)
    .padStart(2, '0');
}

function mean<T>(items: readonly T[], selector: (item: T) => number, fallback: number): number {
  if (items.length === 0) {
    return fallback;
  }
  return items.reduce((sum, item) => sum + selector(item), 0) / items.length;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
