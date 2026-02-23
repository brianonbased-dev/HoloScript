/**
 * USD/USDZ Type Definitions
 *
 * Type definitions for Universal Scene Description (USD) and USDZ formats.
 * Used for Apple Vision Pro and AR Quick Look compatibility.
 *
 * @module export/usdz
 * @version 1.0.0
 */

// ============================================================================
// Core USD Types
// ============================================================================

/**
 * USD Stage - Root container for USD scene data
 */
export interface IUSDStage {
  /** Stage metadata */
  metadata: IUSDMetadata;

  /** Default prim path */
  defaultPrim?: string;

  /** Prim definitions */
  prims: IUSDPrim[];

  /** Custom layer info */
  customLayerData?: Record<string, unknown>;
}

/**
 * USD Metadata
 */
export interface IUSDMetadata {
  /** USD schema version */
  version?: string;

  /** Upward axis (Y or Z) */
  upAxis?: 'Y' | 'Z';

  /** Meters per unit */
  metersPerUnit?: number;

  /** Time codes per second */
  timeCodesPerSecond?: number;

  /** Start time code */
  startTimeCode?: number;

  /** End time code */
  endTimeCode?: number;

  /** Comment */
  comment?: string;
}

/**
 * USD Prim (primitive) - Basic scene object
 */
export interface IUSDPrim {
  /** Prim path (e.g., "/Root/Geometry/Mesh") */
  path: string;

  /** Prim type (e.g., "Xform", "Mesh", "Material") */
  type: USDPrimType;

  /** Prim name */
  name: string;

  /** Attributes */
  attributes: IUSDAttribute[];

  /** Relationships */
  relationships?: IUSDRelationship[];

  /** Child prims */
  children?: IUSDPrim[];

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * USD Prim types
 */
export type USDPrimType =
  | 'Xform'           // Transform node
  | 'Mesh'            // Mesh geometry
  | 'Material'        // Material definition
  | 'Shader'          // Shader node
  | 'Scope'           // Organization scope
  | 'Camera'          // Camera
  | 'SkelRoot'        // Skeleton root
  | 'Skeleton'        // Skeleton definition
  | 'SkelAnimation'   // Skeleton animation
  | 'GeomSubset';     // Geometry subset

/**
 * USD Attribute
 */
export interface IUSDAttribute {
  /** Attribute name */
  name: string;

  /** Attribute type */
  type: USDAttributeType;

  /** Attribute value */
  value: USDAttributeValue;

  /** Time-varying values */
  timeSamples?: Map<number, USDAttributeValue>;

  /** Interpolation mode */
  interpolation?: 'held' | 'linear';
}

/**
 * USD Attribute types
 */
export type USDAttributeType =
  | 'bool'
  | 'int'
  | 'float'
  | 'double'
  | 'string'
  | 'token'
  | 'asset'
  | 'float2'
  | 'float3'
  | 'float4'
  | 'int2'
  | 'int3'
  | 'int4'
  | 'color3f'
  | 'color4f'
  | 'normal3f'
  | 'point3f'
  | 'vector3f'
  | 'matrix4d'
  | 'quatf'
  | 'texCoord2f[]'
  | 'int[]'
  | 'float[]'
  | 'point3f[]'
  | 'normal3f[]'
  | 'vector3f[]';

/**
 * USD Attribute value (union type)
 */
export type USDAttributeValue =
  | boolean
  | number
  | string
  | number[]
  | string[]
  | IUSDAssetPath;

/**
 * USD Asset Path
 */
export interface IUSDAssetPath {
  path: string;
  resolvedPath?: string;
}

/**
 * USD Relationship (reference to other prims)
 */
export interface IUSDRelationship {
  /** Relationship name */
  name: string;

  /** Target prim paths */
  targets: string[];
}

// ============================================================================
// USD Geometry Types
// ============================================================================

/**
 * USD Mesh geometry
 */
export interface IUSDMesh extends IUSDPrim {
  type: 'Mesh';

  /** Face vertex counts */
  faceVertexCounts: number[];

  /** Face vertex indices */
  faceVertexIndices: number[];

  /** Points (vertices) */
  points: number[]; // point3f[]

  /** Normals */
  normals?: number[]; // normal3f[]

  /** UV coordinates */
  primvars?: IUSDPrimvar[];

  /** Subdivision scheme */
  subdivisionScheme?: 'none' | 'catmullClark' | 'loop' | 'bilinear';

  /** Extent (bounding box) */
  extent?: number[]; // [min, max]
}

/**
 * USD Primvar (primitive variable)
 */
export interface IUSDPrimvar {
  /** Primvar name */
  name: string;

  /** Primvar type */
  type: USDAttributeType;

  /** Primvar interpolation */
  interpolation: 'constant' | 'uniform' | 'varying' | 'vertex' | 'faceVarying';

  /** Primvar values */
  values: number[];

  /** Primvar indices (for indexed primvars) */
  indices?: number[];
}

// ============================================================================
// MaterialX / Shader Types
// ============================================================================

/**
 * USD Material
 */
export interface IUSDMaterial extends IUSDPrim {
  type: 'Material';

  /** Surface shader binding */
  surfaceShader?: string; // Path to shader prim

  /** Displacement shader binding */
  displacementShader?: string;

  /** Volume shader binding */
  volumeShader?: string;
}

/**
 * USD Shader (MaterialX-based)
 */
export interface IUSDShader extends IUSDPrim {
  type: 'Shader';

  /** Shader identifier (e.g., "UsdPreviewSurface") */
  shaderId: string;

  /** Shader inputs */
  inputs: IUSDShaderInput[];

  /** Shader outputs */
  outputs?: IUSDShaderOutput[];
}

/**
 * USD Shader input
 */
export interface IUSDShaderInput {
  /** Input name */
  name: string;

  /** Input type */
  type: USDAttributeType;

  /** Input value */
  value?: USDAttributeValue;

  /** Connected source (path to output) */
  connection?: string;
}

/**
 * USD Shader output
 */
export interface IUSDShaderOutput {
  /** Output name */
  name: string;

  /** Output type */
  type: USDAttributeType;
}

/**
 * UsdPreviewSurface shader inputs
 */
export interface IUSDPreviewSurfaceInputs {
  /** Diffuse color */
  diffuseColor?: number[]; // color3f

  /** Emissive color */
  emissiveColor?: number[]; // color3f

  /** Use specular workflow (vs metallic) */
  useSpecularWorkflow?: boolean;

  /** Specular color */
  specularColor?: number[]; // color3f

  /** Metallic factor (0-1) */
  metallic?: number;

  /** Roughness factor (0-1) */
  roughness?: number;

  /** Clearcoat factor */
  clearcoat?: number;

  /** Clearcoat roughness */
  clearcoatRoughness?: number;

  /** Opacity (0-1) */
  opacity?: number;

  /** Opacity threshold */
  opacityThreshold?: number;

  /** Index of refraction */
  ior?: number;

  /** Normal map */
  normal?: number[]; // normal3f or connection

  /** Displacement */
  displacement?: number;

  /** Occlusion */
  occlusion?: number;
}

// ============================================================================
// Transform Types
// ============================================================================

/**
 * USD Xform (transform) operations
 */
export type IUSDXformOp =
  | { type: 'translate'; value: number[] } // float3
  | { type: 'rotateXYZ'; value: number[] } // float3 (euler angles in degrees)
  | { type: 'rotateX'; value: number }
  | { type: 'rotateY'; value: number }
  | { type: 'rotateZ'; value: number }
  | { type: 'scale'; value: number[] } // float3
  | { type: 'transform'; value: number[] }; // matrix4d

// ============================================================================
// Animation Types
// ============================================================================

/**
 * USD Skeleton
 */
export interface IUSDSkeleton extends IUSDPrim {
  type: 'Skeleton';

  /** Joint paths */
  joints: string[];

  /** Bind transforms */
  bindTransforms: number[][]; // matrix4d[]

  /** Rest transforms */
  restTransforms: number[][]; // matrix4d[]

  /** Joint names */
  jointNames?: string[];
}

/**
 * USD Skeleton Animation
 */
export interface IUSDSkelAnimation extends IUSDPrim {
  type: 'SkelAnimation';

  /** Animated joints */
  joints: string[];

  /** Translation time samples */
  translations?: Map<number, number[][]>; // time -> float3[]

  /** Rotation time samples */
  rotations?: Map<number, number[][]>; // time -> quatf[]

  /** Scale time samples */
  scales?: Map<number, number[][]>; // time -> float3[]
}

// ============================================================================
// AR Metadata Types
// ============================================================================

/**
 * AR Quick Look metadata
 */
export interface IARQuickLookMetadata {
  /** AR behavior flags */
  arBehaviors?: {
    /** Allow object scaling */
    allowsContentScaling?: boolean;

    /** Look at camera behavior */
    hasLookAtCamera?: boolean;

    /** Placement mode */
    initialPlacementMode?: 'floor' | 'wall' | 'table' | 'any';

    /** Enable occlusion */
    enableOcclusion?: boolean;
  };

  /** Canonical camera distance */
  canonicalCameraDistance?: number;

  /** Background environment */
  backgroundEnvironment?: string;

  /** AR anchoring */
  anchoring?: {
    type: 'plane' | 'image' | 'object' | 'face';
    alignment?: 'horizontal' | 'vertical' | 'any';
  };
}

/**
 * Spatial audio metadata
 */
export interface ISpatialAudioMetadata {
  /** Audio file path */
  audioFile: string;

  /** Audio format */
  format: 'wav' | 'mp3' | 'm4a' | 'aac';

  /** Spatial blend (0 = 2D, 1 = 3D) */
  spatialBlend?: number;

  /** Rolloff mode */
  rolloffMode?: 'linear' | 'logarithmic';

  /** Min distance */
  minDistance?: number;

  /** Max distance */
  maxDistance?: number;

  /** Volume */
  volume?: number;

  /** Loop */
  loop?: boolean;
}

// ============================================================================
// USDZ Package Types
// ============================================================================

/**
 * USDZ package file entry
 */
export interface IUSDZFileEntry {
  /** File path within package */
  path: string;

  /** File data */
  data: ArrayBuffer;

  /** MIME type */
  mimeType?: string;
}

/**
 * USDZ package structure
 */
export interface IUSDZPackage {
  /** Main USD file (must be first) */
  mainFile: IUSDZFileEntry;

  /** Additional files (textures, audio, etc.) */
  files: IUSDZFileEntry[];
}

// ============================================================================
// Conversion Helpers
// ============================================================================

/**
 * GLTF to USD material mapping
 */
export interface IGLTFToUSDMaterialMapping {
  /** Base color -> diffuseColor */
  baseColor: number[];

  /** Metallic factor */
  metallic: number;

  /** Roughness factor */
  roughness: number;

  /** Emissive color */
  emissive: number[];

  /** Normal map texture path */
  normalTexture?: string;

  /** Base color texture path */
  baseColorTexture?: string;

  /** Metallic-roughness texture path */
  metallicRoughnessTexture?: string;

  /** Occlusion texture path */
  occlusionTexture?: string;

  /** Alpha mode */
  alphaMode: 'opaque' | 'mask' | 'blend';

  /** Alpha cutoff */
  alphaCutoff?: number;
}

/**
 * USD coordinate system conversion
 */
export interface ICoordinateSystemConversion {
  /** Source up axis */
  sourceUpAxis: 'Y' | 'Z';

  /** Target up axis */
  targetUpAxis: 'Y' | 'Z';

  /** Scale factor */
  scaleFactor: number;

  /** Handedness conversion (left to right or vice versa) */
  flipHandedness: boolean;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create empty USD stage
 */
export function createEmptyUSDStage(): IUSDStage {
  return {
    metadata: {
      version: '0.10.0',
      upAxis: 'Y',
      metersPerUnit: 1.0,
    },
    prims: [],
  };
}

/**
 * Create USD Xform prim
 */
export function createUSDXform(name: string, path: string): IUSDPrim {
  return {
    path,
    type: 'Xform',
    name,
    attributes: [],
    children: [],
  };
}

/**
 * Create UsdPreviewSurface material
 */
export function createUSDPreviewSurfaceMaterial(
  name: string,
  path: string,
  inputs: Partial<IUSDPreviewSurfaceInputs>
): IUSDMaterial {
  const shaderPath = `${path}/PreviewSurface`;

  const shaderInputs: IUSDShaderInput[] = [];

  if (inputs.diffuseColor) {
    shaderInputs.push({
      name: 'diffuseColor',
      type: 'color3f',
      value: inputs.diffuseColor,
    });
  }

  if (inputs.metallic !== undefined) {
    shaderInputs.push({
      name: 'metallic',
      type: 'float',
      value: inputs.metallic,
    });
  }

  if (inputs.roughness !== undefined) {
    shaderInputs.push({
      name: 'roughness',
      type: 'float',
      value: inputs.roughness,
    });
  }

  if (inputs.emissiveColor) {
    shaderInputs.push({
      name: 'emissiveColor',
      type: 'color3f',
      value: inputs.emissiveColor,
    });
  }

  const material: IUSDMaterial = {
    path,
    type: 'Material',
    name,
    attributes: [],
    surfaceShader: shaderPath,
    children: [
      {
        path: shaderPath,
        type: 'Shader',
        name: 'PreviewSurface',
        attributes: [
          {
            name: 'info:id',
            type: 'token',
            value: 'UsdPreviewSurface',
          },
        ],
      } as IUSDShader,
    ],
  };

  // Add shader inputs as attributes
  const shaderPrim = material.children![0] as IUSDShader;
  shaderPrim.inputs = shaderInputs;

  return material;
}

/**
 * Convert quaternion to Euler angles (XYZ order, degrees)
 */
export function quaternionToEuler(quat: number[]): number[] {
  const [x, y, z, w] = quat;

  // Roll (x-axis rotation)
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  // Pitch (y-axis rotation)
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1
    ? Math.sign(sinp) * Math.PI / 2
    : Math.asin(sinp);

  // Yaw (z-axis rotation)
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  // Convert to degrees
  return [
    roll * 180 / Math.PI,
    pitch * 180 / Math.PI,
    yaw * 180 / Math.PI,
  ];
}

/**
 * Validate USD prim path
 */
export function isValidUSDPath(path: string): boolean {
  // USD paths must start with / and contain only alphanumeric, _, and /
  return /^\/[a-zA-Z0-9_/]*$/.test(path);
}

/**
 * Sanitize name for USD
 */
export function sanitizeUSDName(name: string): string {
  // Replace invalid characters with underscores
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}
