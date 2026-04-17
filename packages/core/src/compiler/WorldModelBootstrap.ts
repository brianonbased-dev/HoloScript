/**
 * World Models Bootstrap Scanner
 *
 * Ingests World Labs "Marble" manifest JSON and collider mesh (glTF/GLB)
 * to extract AABB bounds, generate HoloScript @physics collider traits,
 * and produce a HoloComposition that can be compiled to any target.
 *
 * This module bridges AI-generated 3D worlds (Marble, Genie 3) with
 * HoloScript's deterministic trait system, serving as the "semantic
 * logic tether" described in W.team.1776394749326.kpp.
 *
 * Supports two AABB extraction paths:
 *   1. Manifest-level bounds: `assets.mesh.bounds.min/max`
 *   2. glTF accessor-level bounds: `accessors[N].min/max` from POSITION
 *
 * @version 1.0.0
 */

import type {
  HoloComposition,
  HoloObjectDecl,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

/** Axis-Aligned Bounding Box */
export interface AABB {
  min: [number, number, number];
  max: [number, number, number];
}

/** Gaussian splat URL resolution tiers */
export interface SplatResolution {
  '100k'?: string;
  '500k'?: string;
  full_res?: string;
}

/** Marble manifest mesh asset descriptor */
export interface MarbleMeshAsset {
  collider_mesh_url: string;
  format: 'glb' | 'gltf';
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

/** Marble manifest splat asset descriptor */
export interface MarbleSplatAsset {
  spz_urls: SplatResolution;
}

/** Marble manifest imagery asset descriptor */
export interface MarbleImageryAsset {
  pano_url?: string;
}

/** Marble manifest assets block */
export interface MarbleAssets {
  caption: string;
  thumbnail_url?: string;
  splats?: MarbleSplatAsset;
  mesh?: MarbleMeshAsset;
  imagery?: MarbleImageryAsset;
}

/** Marble provenance receipt */
export interface MarbleProvenance {
  document_id: string;
  loro_doc_version?: number[];
  captured_at_iso?: string;
}

/** Full Marble manifest structure */
export interface MarbleManifest {
  world_id: string;
  display_name: string;
  model: string;
  generated_at: string;
  assets: MarbleAssets;
  provenance?: MarbleProvenance;
}

/** Minimal glTF accessor structure for AABB extraction */
export interface GLTFAccessorBounds {
  min?: number[];
  max?: number[];
  type?: string;
  componentType?: number;
  count?: number;
}

/** Minimal glTF node structure */
export interface GLTFNodeRef {
  name?: string;
  mesh?: number;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

/** Minimal glTF document for AABB scanning */
export interface GLTFDocument {
  asset?: { version?: string; generator?: string };
  nodes?: GLTFNodeRef[];
  meshes?: Array<{
    primitives: Array<{
      attributes: Record<string, number>;
    }>;
  }>;
  accessors?: GLTFAccessorBounds[];
}

/** Options for the bootstrap scanner */
export interface MarbleBootstrapOptions {
  /** Name for the generated HoloComposition */
  compositionName?: string;
  /** Generate @physics collider traits from AABB */
  generateColliders?: boolean;
  /** Generate @trigger zone traits from AABB */
  generateTriggerZones?: boolean;
  /** Default mass for generated physics objects */
  defaultMass?: number;
  /** Include provenance metadata as traits */
  includeProvenance?: boolean;
  /** Include Gaussian splat references as traits */
  includeSplatRefs?: boolean;
}

// =============================================================================
// AABB UTILITIES
// =============================================================================

/**
 * Compute the center of an AABB.
 */
export function aabbCenter(aabb: AABB): [number, number, number] {
  return [
    (aabb.min[0] + aabb.max[0]) / 2,
    (aabb.min[1] + aabb.max[1]) / 2,
    (aabb.min[2] + aabb.max[2]) / 2,
  ];
}

/**
 * Compute the extents (half-sizes) of an AABB.
 */
export function aabbExtents(aabb: AABB): [number, number, number] {
  return [
    (aabb.max[0] - aabb.min[0]) / 2,
    (aabb.max[1] - aabb.min[1]) / 2,
    (aabb.max[2] - aabb.min[2]) / 2,
  ];
}

/**
 * Compute the full size of an AABB.
 */
export function aabbSize(aabb: AABB): [number, number, number] {
  return [
    aabb.max[0] - aabb.min[0],
    aabb.max[1] - aabb.min[1],
    aabb.max[2] - aabb.min[2],
  ];
}

/**
 * Compute the volume of an AABB.
 */
export function aabbVolume(aabb: AABB): number {
  const size = aabbSize(aabb);
  return size[0] * size[1] * size[2];
}

// =============================================================================
// MANIFEST AABB EXTRACTION
// =============================================================================

/**
 * Extract scene-level AABB from a Marble manifest.
 *
 * Uses `assets.mesh.bounds` if available.
 */
export function extractManifestAABB(manifest: MarbleManifest): AABB | null {
  if (!manifest.assets?.mesh?.bounds) return null;
  const { min, max } = manifest.assets.mesh.bounds;
  if (!Array.isArray(min) || !Array.isArray(max)) return null;
  if (min.length < 3 || max.length < 3) return null;
  return {
    min: [min[0], min[1], min[2]],
    max: [max[0], max[1], max[2]],
  };
}

// =============================================================================
// GLTF AABB EXTRACTION
// =============================================================================

/**
 * Extract per-mesh AABBs from a glTF document.
 *
 * Scans all POSITION accessors and returns one AABB per mesh primitive
 * that has `min`/`max` values.
 */
export function extractGLTFAABBs(doc: GLTFDocument): AABB[] {
  const aabbs: AABB[] = [];
  if (!doc.meshes || !doc.accessors) return aabbs;

  for (const mesh of doc.meshes) {
    for (const prim of mesh.primitives) {
      const posIdx = prim.attributes.POSITION;
      if (posIdx === undefined) continue;

      const accessor = doc.accessors[posIdx];
      if (!accessor?.min || !accessor?.max) continue;
      if (accessor.min.length < 3 || accessor.max.length < 3) continue;

      aabbs.push({
        min: [accessor.min[0], accessor.min[1], accessor.min[2]],
        max: [accessor.max[0], accessor.max[1], accessor.max[2]],
      });
    }
  }

  return aabbs;
}

/**
 * Compute a merged AABB that encompasses all given AABBs.
 */
export function mergeAABBs(aabbs: AABB[]): AABB | null {
  if (aabbs.length === 0) return null;

  const result: AABB = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };

  for (const aabb of aabbs) {
    for (let i = 0; i < 3; i++) {
      result.min[i] = Math.min(result.min[i], aabb.min[i]);
      result.max[i] = Math.max(result.max[i], aabb.max[i]);
    }
  }

  return result;
}

// =============================================================================
// HOLOSCRIPT COMPOSITION GENERATION
// =============================================================================

/**
 * Generate a HoloScript object declaration from an AABB.
 *
 * Creates a box collider at the AABB center with the AABB dimensions.
 */
export function aabbToHoloObject(
  name: string,
  aabb: AABB,
  options: { mass?: number; isCollider?: boolean; isTrigger?: boolean } = {}
): HoloObjectDecl {
  const center = aabbCenter(aabb);
  const size = aabbSize(aabb);
  const traits: Array<{ name: string; [key: string]: unknown }> = [];

  if (options.isCollider !== false) {
    traits.push({
      name: 'physics',
      mass: options.mass ?? 0, // 0 = static collider
      shape: 'box',
    });
    traits.push({ name: 'collidable' });
  }

  if (options.isTrigger) {
    traits.push({ name: 'trigger' });
  }

  return {
    name,
    properties: [
      { key: 'geometry', value: 'box' },
      { key: 'position', value: center },
      { key: 'scale', value: size },
    ],
    traits,
  } as HoloObjectDecl;
}

// =============================================================================
// BOOTSTRAP SCANNER (MAIN ENTRY POINT)
// =============================================================================

/**
 * Bootstrap a HoloComposition from a World Labs Marble manifest.
 *
 * This is the primary entry point for the Marble integration pipeline.
 * It reads the manifest, extracts AABB bounds (from both manifest-level
 * and optional glTF mesh-level data), and generates a HoloComposition
 * with appropriate physics and behavioral traits.
 *
 * @param manifest - Parsed Marble manifest JSON
 * @param colliderDoc - Optional parsed glTF document for per-mesh AABB extraction
 * @param options - Bootstrap configuration
 * @returns A HoloComposition ready for compilation to any target
 */
export function bootstrapFromMarble(
  manifest: MarbleManifest,
  colliderDoc?: GLTFDocument,
  options: MarbleBootstrapOptions = {}
): HoloComposition {
  const {
    compositionName = manifest.display_name || 'MarbleWorld',
    generateColliders = true,
    generateTriggerZones = false,
    defaultMass = 0,
    includeProvenance = true,
    includeSplatRefs = true,
  } = options;

  const objects: HoloObjectDecl[] = [];

  // 1. Scene-level collider from manifest bounds
  const manifestAABB = extractManifestAABB(manifest);
  if (manifestAABB && generateColliders) {
    objects.push(
      aabbToHoloObject('SceneBounds', manifestAABB, {
        mass: 0, // Static collider
        isCollider: true,
        isTrigger: generateTriggerZones,
      })
    );
  }

  // 2. Per-mesh colliders from glTF accessors
  if (colliderDoc && generateColliders) {
    const meshAABBs = extractGLTFAABBs(colliderDoc);
    const nodeNames = colliderDoc.nodes || [];

    for (let i = 0; i < meshAABBs.length; i++) {
      const nodeName = nodeNames[i]?.name || `Collider_${i}`;
      objects.push(
        aabbToHoloObject(nodeName, meshAABBs[i], {
          mass: defaultMass,
          isCollider: true,
          isTrigger: generateTriggerZones,
        })
      );
    }
  }

  // 3. Add provenance metadata object
  if (includeProvenance && manifest.provenance) {
    const provenanceObj: HoloObjectDecl = {
      name: 'MarbleProvenance',
      properties: [
        { key: 'document_id', value: manifest.provenance.document_id },
        { key: 'model', value: manifest.model },
        { key: 'generated_at', value: manifest.generated_at },
      ],
      traits: [
        {
          name: 'provenance',
          source: 'world_labs_marble',
          world_id: manifest.world_id,
        },
      ],
    } as HoloObjectDecl;
    objects.push(provenanceObj);
  }

  // 4. Add Gaussian splat reference object
  if (includeSplatRefs && manifest.assets.splats) {
    const splatObj: HoloObjectDecl = {
      name: 'GaussianSplatCloud',
      properties: [
        { key: 'geometry', value: 'splat' },
      ],
      traits: [
        {
          name: 'gaussian_splat',
          spz_100k: manifest.assets.splats.spz_urls['100k'] || '',
          spz_500k: manifest.assets.splats.spz_urls['500k'] || '',
          spz_full: manifest.assets.splats.spz_urls.full_res || '',
        },
      ],
    } as HoloObjectDecl;

    // If we have manifest bounds, position the splat cloud at scene center
    if (manifestAABB) {
      const center = aabbCenter(manifestAABB);
      splatObj.properties = [
        ...(splatObj.properties || []),
        { key: 'position', value: center },
      ];
    }

    objects.push(splatObj);
  }

  // Build composition
  const composition: HoloComposition = {
    type: 'Composition',
    name: compositionName,
    objects,
    templates: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
  };

  return composition;
}
