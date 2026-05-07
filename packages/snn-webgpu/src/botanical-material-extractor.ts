/**
 * Offline botanical photo-to-material extractor.
 *
 * The extractor intentionally consumes signed anchor metadata plus deterministic
 * color-region fixtures instead of reading private media. Raw media ingestion
 * and wallet signing remain external provenance steps; this module turns the
 * signed receipts and fixture samples into renderer-ready material JSON.
 */

export type BotanicalRegionName =
  | 'petal_base'
  | 'petal_mid'
  | 'petal_inner'
  | 'petal_rim'
  | 'petal_shadow'
  | 'vein'
  | 'leaf'
  | 'leaf_dark'
  | 'water'
  | 'stamen'
  | 'stamen_tip'
  | 'seed_pod'
  | 'seed_pod_rim'
  | 'silhouette_edge';

export type RGBTuple = readonly [number, number, number];
export type BotanicalColorInput = RGBTuple | string;

export interface BotanicalPhotoAnchor {
  id: string;
  label?: string;
  role?: string;
  status?: string;
  content_hash?: string | null;
  wallet_signature?: string | null;
  uri?: string;
}

export interface BotanicalRegionSample {
  region: BotanicalRegionName;
  pixels: readonly BotanicalColorInput[];
  weight?: number;
}

export interface BotanicalPhotoFixture {
  anchorId: string;
  role?: string;
  regions: readonly BotanicalRegionSample[];
  width?: number;
  height?: number;
}

export interface BotanicalMaterialExtractorInput {
  anchors: readonly BotanicalPhotoAnchor[];
  fixtures: readonly BotanicalPhotoFixture[];
  capturedAt?: string;
  generatedBy?: string;
}

export interface BotanicalMaterialUniforms {
  subsurface_scattering: number;
  subsurface_radius_rgb: [number, number, number];
  petal_translucency_base: number;
  petal_translucency_edge: number;
  translucency_gradient: {
    base: number;
    edge: number;
    tip: number;
  };
  roughness: number;
  ior: number;
  vein_normal_intensity: number;
  vein_normals: {
    intensity: number;
    method: 'region-luminance-contrast';
  };
  edge_curl_intensity: number;
  gravity_sag_outer: number;
}

export interface BotanicalExtractedColors {
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

export interface BotanicalMaterialConfidence {
  overall: number;
  sss: number;
  translucency: number;
  roughness: number;
  vein_normals: number;
  provenance: number;
}

export interface BotanicalMaterialProvenanceReceipt {
  id: string;
  role: string | null;
  status: string | null;
  content_hash: string | null;
  wallet_signature_present: boolean;
  fixture_regions: BotanicalRegionName[];
}

export interface BotanicalMaterialExtractionResult {
  schema: 'holoscript.botanical.material-extract.v1';
  status:
    | 'extracted-from-signed-anchors'
    | 'extracted-from-hashed-fixtures'
    | 'extracted-from-unsigned-fixtures';
  botanical_trait_target: '@botanical_lotus';
  source: {
    kind: 'signed_photo_anchor_fixtures';
    captured_at: string | null;
    generated_by: string;
    anchor_ids: string[];
    signed_anchor_count: number;
    content_hashed_anchor_count: number;
    fixture_count: number;
  };
  material: BotanicalMaterialUniforms;
  colors: BotanicalExtractedColors;
  confidence: BotanicalMaterialConfidence;
  provenance: {
    extractor: {
      package: '@holoscript/snn-webgpu';
      algorithm: 'botanical-region-statistics-v1';
      deterministic: true;
    };
    anchor_receipts: BotanicalMaterialProvenanceReceipt[];
  };
  renderer_mapping: {
    petal_material: string;
    photorealism_status: 'extractor_available';
  };
}

const DEFAULT_COLORS: BotanicalExtractedColors = {
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

const REQUIRED_CONFIDENCE_REGIONS: BotanicalRegionName[] = [
  'petal_mid',
  'petal_rim',
  'petal_shadow',
  'vein',
  'leaf',
  'water',
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function parseHexColor(hex: string): RGBTuple {
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Invalid color fixture: ${hex}`);
  }
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function parseColor(input: BotanicalColorInput): RGBTuple {
  if (typeof input === 'string') return parseHexColor(input);
  return [
    clamp(Math.round(input[0]), 0, 255),
    clamp(Math.round(input[1]), 0, 255),
    clamp(Math.round(input[2]), 0, 255),
  ];
}

function collectRegionPixels(
  fixtures: readonly BotanicalPhotoFixture[],
  region: BotanicalRegionName
): RGBTuple[] {
  const pixels: RGBTuple[] = [];
  for (const fixture of fixtures) {
    for (const sample of fixture.regions) {
      if (sample.region !== region) continue;
      const weight = Math.max(1, Math.round(sample.weight ?? 1));
      for (const color of sample.pixels) {
        const parsed = parseColor(color);
        for (let i = 0; i < weight; i += 1) pixels.push(parsed);
      }
    }
  }
  return pixels;
}

function meanRgb(pixels: readonly RGBTuple[], fallbackHex: string): RGBTuple {
  if (pixels.length === 0) return parseHexColor(fallbackHex);
  const sum = pixels.reduce(
    (acc, rgb) => [acc[0] + rgb[0], acc[1] + rgb[1], acc[2] + rgb[2]] as [number, number, number],
    [0, 0, 0] as [number, number, number]
  );
  return [
    Math.round(sum[0] / pixels.length),
    Math.round(sum[1] / pixels.length),
    Math.round(sum[2] / pixels.length),
  ];
}

function regionMean(
  fixtures: readonly BotanicalPhotoFixture[],
  region: BotanicalRegionName,
  fallbackHex: string
): RGBTuple {
  return meanRgb(collectRegionPixels(fixtures, region), fallbackHex);
}

function toHex(rgb: RGBTuple): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function toUnitRgb(rgb: RGBTuple): [number, number, number] {
  return [round(rgb[0] / 255), round(rgb[1] / 255), round(rgb[2] / 255)];
}

function luminance(rgb: RGBTuple): number {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

function saturation(rgb: RGBTuple): number {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function colorDistance(a: RGBTuple, b: RGBTuple): number {
  const dr = (a[0] - b[0]) / 255;
  const dg = (a[1] - b[1]) / 255;
  const db = (a[2] - b[2]) / 255;
  return Math.sqrt(dr * dr + dg * dg + db * db) / Math.sqrt(3);
}

function regionCoverage(fixtures: readonly BotanicalPhotoFixture[]): number {
  const regions = new Set<BotanicalRegionName>();
  for (const fixture of fixtures) {
    for (const sample of fixture.regions) regions.add(sample.region);
  }
  const covered = REQUIRED_CONFIDENCE_REGIONS.filter((region) => regions.has(region)).length;
  return covered / REQUIRED_CONFIDENCE_REGIONS.length;
}

function anchorFixtureRegions(
  fixtures: readonly BotanicalPhotoFixture[],
  anchorId: string
): BotanicalRegionName[] {
  const regions = new Set<BotanicalRegionName>();
  for (const fixture of fixtures) {
    if (fixture.anchorId !== anchorId) continue;
    for (const sample of fixture.regions) regions.add(sample.region);
  }
  return [...regions].sort();
}

function provenanceConfidence(anchors: readonly BotanicalPhotoAnchor[]): number {
  if (anchors.length === 0) return 0;
  const signed = anchors.filter((anchor) => Boolean(anchor.wallet_signature)).length / anchors.length;
  const hashed = anchors.filter((anchor) => Boolean(anchor.content_hash)).length / anchors.length;
  return round(signed * 0.72 + hashed * 0.28);
}

function extractionStatus(anchors: readonly BotanicalPhotoAnchor[]): BotanicalMaterialExtractionResult['status'] {
  if (anchors.length > 0 && anchors.every((anchor) => Boolean(anchor.wallet_signature))) {
    return 'extracted-from-signed-anchors';
  }
  if (anchors.some((anchor) => Boolean(anchor.content_hash))) {
    return 'extracted-from-hashed-fixtures';
  }
  return 'extracted-from-unsigned-fixtures';
}

export function extractBotanicalMaterialFromPhotoFixtures(
  input: BotanicalMaterialExtractorInput
): BotanicalMaterialExtractionResult {
  const petalBase = regionMean(input.fixtures, 'petal_base', DEFAULT_COLORS.petal_base);
  const petalMid = regionMean(input.fixtures, 'petal_mid', DEFAULT_COLORS.petal_mid);
  const petalInner = regionMean(input.fixtures, 'petal_inner', DEFAULT_COLORS.petal_inner);
  const petalRim = regionMean(input.fixtures, 'petal_rim', DEFAULT_COLORS.petal_rim);
  const petalShadow = regionMean(input.fixtures, 'petal_shadow', DEFAULT_COLORS.petal_shadow);
  const vein = regionMean(input.fixtures, 'vein', DEFAULT_COLORS.petal_rim);
  const leaf = regionMean(input.fixtures, 'leaf', DEFAULT_COLORS.leaf);
  const leafDark = regionMean(input.fixtures, 'leaf_dark', DEFAULT_COLORS.leaf_dark);
  const water = regionMean(input.fixtures, 'water', DEFAULT_COLORS.water);
  const stamen = regionMean(input.fixtures, 'stamen', DEFAULT_COLORS.stamen);
  const stamenTip = regionMean(input.fixtures, 'stamen_tip', DEFAULT_COLORS.stamen_tip);
  const seedPod = regionMean(input.fixtures, 'seed_pod', DEFAULT_COLORS.seed_pod);
  const seedPodRim = regionMean(input.fixtures, 'seed_pod_rim', DEFAULT_COLORS.seed_pod_rim);
  const silhouetteEdge = regionMean(input.fixtures, 'silhouette_edge', DEFAULT_COLORS.petal_rim);

  const petalLuma = luminance(petalMid);
  const edgeLuma = luminance(petalRim);
  const shadowLuma = luminance(petalShadow);
  const petalSat = saturation(petalMid);
  const petalContrast = colorDistance(petalRim, petalShadow);
  const veinContrast = Math.max(colorDistance(vein, petalMid), Math.abs(luminance(vein) - petalLuma));
  const silhouetteContrast = colorDistance(silhouetteEdge, petalBase);
  const coverage = regionCoverage(input.fixtures);
  const provConfidence = provenanceConfidence(input.anchors);

  const subsurfaceScattering = round(
    clamp(0.48 + petalSat * 0.18 + Math.max(0, edgeLuma - shadowLuma) * 0.2 + coverage * 0.09, 0.28, 0.92)
  );
  const translucencyBase = round(clamp(0.34 + luminance(petalBase) * 0.28 + coverage * 0.08, 0.2, 0.82));
  const translucencyEdge = round(clamp(translucencyBase * (0.48 + petalContrast * 0.34), 0.14, 0.72));
  const translucencyTip = round(clamp(translucencyEdge + Math.max(0, edgeLuma - petalLuma) * 0.16, 0.16, 0.78));
  const roughness = round(clamp(0.84 - petalSat * 0.16 - petalContrast * 0.18, 0.46, 0.88));
  const ior = round(clamp(1.31 + petalLuma * 0.06 + petalSat * 0.045, 1.31, 1.44), 2);
  const veinNormalIntensity = round(clamp(0.018 + veinContrast * 0.095 + coverage * 0.012, 0.012, 0.12));
  const edgeCurlIntensity = round(clamp(0.34 + silhouetteContrast * 0.46 + petalContrast * 0.18, 0.24, 0.82));
  const gravitySagOuter = round(clamp(0.12 + (1 - luminance(leafDark)) * 0.16 + silhouetteContrast * 0.08, 0.1, 0.42));

  const sssConfidence = round(clamp(coverage * 0.6 + provConfidence * 0.4, 0, 1));
  const translucencyConfidence = round(clamp((coverage + (collectRegionPixels(input.fixtures, 'petal_rim').length ? 1 : 0)) / 2, 0, 1));
  const veinConfidence = round(clamp((collectRegionPixels(input.fixtures, 'vein').length ? 0.64 : 0.22) + provConfidence * 0.36, 0, 1));
  const roughnessConfidence = round(clamp(coverage * 0.5 + provConfidence * 0.28 + (input.fixtures.length > 0 ? 0.22 : 0), 0, 1));
  const overall = round((sssConfidence + translucencyConfidence + veinConfidence + roughnessConfidence + provConfidence) / 5);

  return {
    schema: 'holoscript.botanical.material-extract.v1',
    status: extractionStatus(input.anchors),
    botanical_trait_target: '@botanical_lotus',
    source: {
      kind: 'signed_photo_anchor_fixtures',
      captured_at: input.capturedAt ?? null,
      generated_by: input.generatedBy ?? '@holoscript/snn-webgpu',
      anchor_ids: input.anchors.map((anchor) => anchor.id),
      signed_anchor_count: input.anchors.filter((anchor) => Boolean(anchor.wallet_signature)).length,
      content_hashed_anchor_count: input.anchors.filter((anchor) => Boolean(anchor.content_hash)).length,
      fixture_count: input.fixtures.length,
    },
    material: {
      subsurface_scattering: subsurfaceScattering,
      subsurface_radius_rgb: toUnitRgb(petalInner),
      petal_translucency_base: translucencyBase,
      petal_translucency_edge: translucencyEdge,
      translucency_gradient: {
        base: translucencyBase,
        edge: translucencyEdge,
        tip: translucencyTip,
      },
      roughness,
      ior,
      vein_normal_intensity: veinNormalIntensity,
      vein_normals: {
        intensity: veinNormalIntensity,
        method: 'region-luminance-contrast',
      },
      edge_curl_intensity: edgeCurlIntensity,
      gravity_sag_outer: gravitySagOuter,
    },
    colors: {
      petal_base: toHex(petalBase),
      petal_mid: toHex(petalMid),
      petal_inner: toHex(petalInner),
      petal_rim: toHex(petalRim),
      petal_shadow: toHex(petalShadow),
      seed_pod: toHex(seedPod),
      seed_pod_rim: toHex(seedPodRim),
      stamen: toHex(stamen),
      stamen_tip: toHex(stamenTip),
      leaf: toHex(leaf),
      leaf_dark: toHex(leafDark),
      water: toHex(water),
    },
    confidence: {
      overall,
      sss: sssConfidence,
      translucency: translucencyConfidence,
      roughness: roughnessConfidence,
      vein_normals: veinConfidence,
      provenance: provConfidence,
    },
    provenance: {
      extractor: {
        package: '@holoscript/snn-webgpu',
        algorithm: 'botanical-region-statistics-v1',
        deterministic: true,
      },
      anchor_receipts: input.anchors.map((anchor) => ({
        id: anchor.id,
        role: anchor.role ?? null,
        status: anchor.status ?? null,
        content_hash: anchor.content_hash ?? null,
        wallet_signature_present: Boolean(anchor.wallet_signature),
        fixture_regions: anchorFixtureRegions(input.fixtures, anchor.id),
      })),
    },
    renderer_mapping: {
      petal_material:
        'MeshPhysicalMaterial + botanical onBeforeCompile SSS/translucency/vein uniforms',
      photorealism_status: 'extractor_available',
    },
  };
}
