import type {
  BotanicalMaterialExtraction,
  BotanicalMaterialParams,
} from './botanical-lotus.js';
import type {
  BotanicalExtractedColors,
  BotanicalMaterialExtractionResult,
  BotanicalMaterialUniforms,
} from '../botanical-material-extractor.js';

export type BotanicalExtractionInput = BotanicalMaterialExtraction | BotanicalMaterialExtractionResult;

export type CanonicalBotanicalExtractionStatus =
  | 'signed'
  | 'hashed'
  | 'unsigned'
  | 'pending_anchor';

export interface CanonicalBotanicalMaterial {
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

export interface CanonicalBotanicalMaterialExtraction {
  schema: 'holoscript.botanical.material-extract.canonical.v1';
  source_schema: 'holoscript.botanical.material-extract.v1';
  source_kind: 'pixel-buffer' | 'photo-fixture';
  status: CanonicalBotanicalExtractionStatus;
  botanical_trait_target: string;
  anchor_ids: string[];
  material: CanonicalBotanicalMaterial;
  colors: BotanicalExtractedColors;
  confidence: number;
  provenance: {
    content_hash_status: 'complete' | 'partial' | 'missing';
    wallet_signature_status: 'complete' | 'partial' | 'missing';
    signed_anchor_count: number;
    content_hashed_anchor_count: number;
  };
}

export function normalizeBotanicalMaterialExtraction(
  extraction: BotanicalExtractionInput
): CanonicalBotanicalMaterialExtraction {
  if (isPixelExtraction(extraction)) {
    return normalizePixelExtraction(extraction);
  }
  return normalizeFixtureExtraction(extraction);
}

function normalizePixelExtraction(
  extraction: BotanicalMaterialExtraction
): CanonicalBotanicalMaterialExtraction {
  const contentHashStatus = extraction.source.content_hash_status;
  const walletSignatureStatus = extraction.source.wallet_signature_status;
  return {
    schema: 'holoscript.botanical.material-extract.canonical.v1',
    source_schema: extraction.schema,
    source_kind: 'pixel-buffer',
    status: extraction.status === 'extracted_from_signed_references' ? 'signed' : 'pending_anchor',
    botanical_trait_target: extraction.botanical_trait_target,
    anchor_ids: extraction.source.anchor_ids,
    material: normalizeMaterial(extraction.material),
    colors: extraction.colors,
    confidence: extraction.diagnostics.confidence,
    provenance: {
      content_hash_status: contentHashStatus,
      wallet_signature_status: walletSignatureStatus,
      signed_anchor_count: extraction.diagnostics.provenance_signature_count,
      content_hashed_anchor_count: extraction.diagnostics.provenance_hash_count,
    },
  };
}

function normalizeFixtureExtraction(
  extraction: BotanicalMaterialExtractionResult
): CanonicalBotanicalMaterialExtraction {
  return {
    schema: 'holoscript.botanical.material-extract.canonical.v1',
    source_schema: extraction.schema,
    source_kind: 'photo-fixture',
    status: normalizeFixtureStatus(extraction.status),
    botanical_trait_target: extraction.botanical_trait_target,
    anchor_ids: extraction.source.anchor_ids,
    material: normalizeMaterial(extraction.material),
    colors: extraction.colors,
    confidence: extraction.confidence.overall,
    provenance: {
      content_hash_status: completenessStatus(
        extraction.source.content_hashed_anchor_count,
        extraction.source.anchor_ids.length
      ),
      wallet_signature_status: completenessStatus(
        extraction.source.signed_anchor_count,
        extraction.source.anchor_ids.length
      ),
      signed_anchor_count: extraction.source.signed_anchor_count,
      content_hashed_anchor_count: extraction.source.content_hashed_anchor_count,
    },
  };
}

function normalizeMaterial(
  material: BotanicalMaterialParams | BotanicalMaterialUniforms
): CanonicalBotanicalMaterial {
  return {
    subsurface_scattering: material.subsurface_scattering,
    subsurface_radius_rgb: material.subsurface_radius_rgb,
    petal_translucency_base: material.petal_translucency_base,
    petal_translucency_edge: material.petal_translucency_edge,
    roughness: material.roughness,
    ior: material.ior,
    vein_normal_intensity: material.vein_normal_intensity,
    edge_curl_intensity: material.edge_curl_intensity,
    gravity_sag_outer: material.gravity_sag_outer,
  };
}

function isPixelExtraction(extraction: BotanicalExtractionInput): extraction is BotanicalMaterialExtraction {
  return 'diagnostics' in extraction;
}

function normalizeFixtureStatus(
  status: BotanicalMaterialExtractionResult['status']
): CanonicalBotanicalExtractionStatus {
  if (status === 'extracted-from-signed-anchors') {
    return 'signed';
  }
  if (status === 'extracted-from-hashed-fixtures') {
    return 'hashed';
  }
  return 'unsigned';
}

function completenessStatus(count: number, total: number): 'complete' | 'partial' | 'missing' {
  if (count === 0 || total === 0) {
    return 'missing';
  }
  return count === total ? 'complete' : 'partial';
}
