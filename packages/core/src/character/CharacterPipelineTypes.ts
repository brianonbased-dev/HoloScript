/**
 * CharacterPipelineTypes.ts
 *
 * Type definitions for the 7-stage character creation pipeline:
 *   1. Shape Sculpt → 2. Surface Mesh → 3. Optimized Shell →
 *   4. Rigged Character → 5. Expressive Face → 6. Dressed Character →
 *   7. Deployed Avatar
 *
 * Every stage is a `.holo` file you can git diff, version control,
 * and automate via MCP tools.
 *
 * @see Characters as Code vision (2026-03-26)
 * @see W.238-W.246, P.CHAR.001-006, G.CHAR.001-006
 * @module character
 */

// =============================================================================
// Stage 1: Shape Sculpt
// =============================================================================

export type FillMode = 'volumetric' | 'shell' | 'tube';
export type BlendMode = 'smooth_union' | 'union' | 'intersect' | 'difference';
export type GeometryPrimitive = 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'capsule';

export interface SculptRegion {
  name: string;
  geometry: GeometryPrimitive;
  scale: [number, number, number];
  bounds?: { center: [number, number, number]; radius?: number; extents?: [number, number, number] };
  path?: { type: 'bezier'; points: [number, number, number][] };
  fill: FillMode;
  thickness?: number;
  radius?: number;
  instanceCount: number;
  colorMap?: string;
}

export interface CharacterSculpt {
  name: string;
  regions: SculptRegion[];
  blendMode: BlendMode;
  blendRadius: number;
  totalShapes: number;
}

// =============================================================================
// Stage 2: Surface Extraction
// =============================================================================

export type ExtractionAlgorithm =
  | 'marching_cubes'
  | 'dual_contouring'
  | 'poisson_reconstruction'
  | 'ball_pivoting';

export interface MeshExtractionOptions {
  preserveSharpEdges: boolean;
  sharpAngleThreshold: number;
  smoothingIterations: number;
  fillHoles: boolean;
  watertight: boolean;
}

export interface CompiledMeshConfig {
  source: string;
  algorithm: ExtractionAlgorithm;
  targetTriangles: number;
  options: MeshExtractionOptions;
}

// =============================================================================
// Stage 3: Hollow + LOD
// =============================================================================

export interface HollowConfig {
  removeInterior: boolean;
  removeBackfaces: string[];
  mergeCoplanar: boolean;
  minTriangleArea: number;
}

export type LODTransition = 'dithered' | 'crossfade' | 'instant';

export interface LODLevel {
  triangles: number;
  distance: number;
}

export interface CharacterLODConfig {
  levels: LODLevel[];
  transition: LODTransition;
}

export interface OptimizedCharacterConfig {
  source: string;
  hollow: HollowConfig;
  lod: CharacterLODConfig;
}

// =============================================================================
// Stage 4: Rigging
// =============================================================================

export type SkeletonTemplate = 'humanoid_65' | 'humanoid_23' | 'quadruped' | 'custom';
export type SkinningMethod = 'heat_diffusion' | 'geodesic_voxel' | 'neural';
export type SkeletonCompatibility = 'mixamo' | 'vrm' | 'arkit' | 'metahuman' | 'humanoid';

export interface CustomBone {
  name: string;
  parent: string;
  position: [number, number, number];
  length: number;
}

export interface SkinningConfig {
  method: SkinningMethod;
  maxInfluences: number;
  smoothIterations: number;
}

export interface RiggedCharacterConfig {
  mesh: string;
  skeleton: SkeletonTemplate;
  customBones?: CustomBone[];
  skinning: SkinningConfig;
  compatibleWith: SkeletonCompatibility[];
}

// =============================================================================
// Stage 5: Facial Expression
// =============================================================================

export interface ActionUnitMapping {
  [auId: string]: string;
}

export interface ExpressionWeights {
  [auId: string]: number;
}

export interface ExpressionPreset {
  name: string;
  weights: ExpressionWeights;
}

export interface VisemeMapping {
  name: string;
  weights: ExpressionWeights;
}

export interface ReactiveExpression {
  name: string;
  expression?: string;
  weights?: ExpressionWeights;
  threshold?: number;
  blend?: number;
  interval?: number;
  duration?: number;
  jitter?: number;
}

export interface FaceConfig {
  mesh: string;
  topology: 'FACS_52' | 'ARKit_52' | 'custom';
  actionUnits: ActionUnitMapping;
  expressions: ExpressionPreset[];
  visemes: VisemeMapping[];
  reactive: ReactiveExpression[];
}

// =============================================================================
// Stage 6: Materials / Clothing / Hair
// =============================================================================

export interface SubsurfaceMaterialConfig {
  type: 'subsurface';
  scatterDistance: [number, number, number];
  scatterColor: [number, number, number];
  baseColor: string;
  roughness: number;
  normalMap?: string;
  specular: number;
  poreDetail?: { type: 'procedural' | 'texture'; scale: number; depth: number };
}

export interface RefractiveEyeConfig {
  type: 'refractive_eye';
  cornea: { ior: number; roughness: number };
  iris: { color: [number, number, number]; depth: number };
  pupil: { baseSize: number; dilationSource?: string };
  sclera: { color: [number, number, number]; veinMap?: string };
  wetLayer: { roughness: number; tearBuildup?: string };
}

export interface MarschnerHairConfig {
  type: 'hair_marschner';
  primarySpecular: { shift: number; width: number };
  secondarySpecular: { shift: number; width: number };
  melanin: number;
  melaninRedness: number;
}

export type CharacterMaterial = SubsurfaceMaterialConfig | RefractiveEyeConfig | MarschnerHairConfig;

export type ClothingType = 'baked' | 'layered_shell' | 'cloth_simulation';

export interface WrinkleMapConfig {
  joint: string;
  map: string;
  activationAngle: number;
  fullAngle: number;
}

export interface ClothingConfig {
  name: string;
  type: ClothingType;
  mesh: string;
  attachTo: string;
  layer: number;
  shrinkwrap?: { target: string; offset: number };
  wrinkles?: Record<string, WrinkleMapConfig>;
  material: string;
  simulation?: {
    solver: 'PBD';
    substeps: number;
    stiffness: number;
    damping: number;
    selfCollision: boolean;
    bodyCollision?: string;
    windDrag: number;
  };
  lod?: { simulateDistance: number; bakedPose?: string };
}

export type HairType = 'cards' | 'strands';

export interface HairConfig {
  name: string;
  type: HairType;
  guideCurves?: string;
  totalStrands?: number;
  segmentsPerStrand?: number;
  cardsPerGuide?: number;
  width?: number;
  material: string;
  texture?: { albedo: string; alpha: string };
  physics: {
    type: 'spring_chain' | 'PBD_strand';
    stiffness: number;
    damping: number;
    rootStiffness?: number;
    tipStiffness?: number;
    collision?: string;
  };
  lod?: { fullDistance: number; reducedDistance: number; cardsDistance?: number };
}

// =============================================================================
// Stage 7: Deployment
// =============================================================================

export type DeployFormat = 'gltf' | 'vrm_1_0' | 'usd' | 'fbx' | 'glb' | 'usdz' | 'native';
export type TextureCompression = 'ktx2_basis' | 'etc2' | 'astc' | 'bc7' | 'none';

export interface DeployTarget {
  format: DeployFormat;
  textureCompression?: TextureCompression;
  maxTriangles: number;
  skeletonMapping?: SkeletonCompatibility;
  nanite?: boolean;
  springBones?: boolean;
  performanceRank?: string;
  bodyType?: string;
  textureAtlas?: boolean;
  arkitBlendShapes?: boolean;
  personaCompatible?: boolean;
  hair?: 'strands' | 'cards' | 'baked';
  cloth?: 'simulated' | 'baked';
  streaming?: string;
}

export interface DeployConfig {
  character: string;
  face: string;
  clothing: string[];
  hair: string;
  speech?: string;
  targets: Record<string, DeployTarget>;
}

// =============================================================================
// Full Pipeline Config
// =============================================================================

export interface CharacterPipelineConfig {
  sculpt: CharacterSculpt;
  mesh: CompiledMeshConfig;
  optimized: OptimizedCharacterConfig;
  rigged: RiggedCharacterConfig;
  face: FaceConfig;
  materials: CharacterMaterial[];
  clothing: ClothingConfig[];
  hair: HairConfig[];
  deploy: DeployConfig;
}

/**
 * Pipeline stage identifiers for progress tracking.
 */
export type PipelineStage =
  | 'sculpt'
  | 'mesh_extraction'
  | 'optimization'
  | 'rigging'
  | 'facial'
  | 'dressing'
  | 'deployment';

export const PIPELINE_STAGES: PipelineStage[] = [
  'sculpt',
  'mesh_extraction',
  'optimization',
  'rigging',
  'facial',
  'dressing',
  'deployment',
];
