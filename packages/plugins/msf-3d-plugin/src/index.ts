/**
 * @holoscript/msf-3d-plugin — MSF 3D asset interop stub.
 *
 * Research: ai-ecosystem/research/2026-04-23_msf-3d-asset-interop-semantic-annotation.md
 * Universal-IR matrix: docs/universal-ir-coverage.md (semantic-annotated asset column)
 *
 * Status: STUB. Binary MSF parsing + texture atlasing future work.
 */

export interface MsfAssetHeader {
  version: string;
  unit: 'meter' | 'millimeter' | 'inch';
  author?: string;
  semantic_tags: string[]; // ['car', 'vehicle', 'suv'] etc.
}

export interface MsfAssetBody {
  header: MsfAssetHeader;
  mesh_ref: string; // URI or content hash
  annotations: Array<{ part_id: string; labels: string[] }>;
}

export interface HoloSemanticImport {
  trait: { kind: '@semantic_3d'; target_id: string; params: Record<string, unknown> };
  part_annotations: Array<{ part_id: string; traits: string[] }>;
  unit_scale_factor: number; // to normalize to meters
}

export function importMsf(asset: MsfAssetBody): HoloSemanticImport {
  const scale =
    asset.header.unit === 'millimeter' ? 0.001 :
    asset.header.unit === 'inch' ? 0.0254 : 1;

  const partAnnotations = asset.annotations.map((a) => ({
    part_id: a.part_id,
    traits: a.labels.map((l) => `@${l.toLowerCase().replace(/\W/g, '_')}`),
  }));

  return {
    trait: {
      kind: '@semantic_3d',
      target_id: asset.mesh_ref,
      params: {
        version: asset.header.version,
        tags: asset.header.semantic_tags,
        unit_scale: scale,
      },
    },
    part_annotations: partAnnotations,
    unit_scale_factor: scale,
  };
}
