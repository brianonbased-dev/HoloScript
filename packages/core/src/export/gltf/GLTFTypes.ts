/**
 * GLTF 2.0 Type Definitions
 * Based on the official glTF 2.0 specification
 * @see https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Root glTF document
 */
export interface IGLTFDocument {
  asset: IGLTFAsset;
  scene?: number;
  scenes?: IGLTFScene[];
  nodes?: IGLTFNode[];
  meshes?: IGLTFMesh[];
  accessors?: IGLTFAccessor[];
  bufferViews?: IGLTFBufferView[];
  buffers?: IGLTFBuffer[];
  materials?: IGLTFMaterial[];
  textures?: IGLTFTexture[];
  images?: IGLTFImage[];
  samplers?: IGLTFSampler[];
  animations?: IGLTFAnimation[];
  skins?: IGLTFSkin[];
  cameras?: IGLTFCamera[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Asset metadata
 */
export interface IGLTFAsset {
  version: string;
  minVersion?: string;
  generator?: string;
  copyright?: string;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Scene definition
 */
export interface IGLTFScene {
  name?: string;
  nodes?: number[];
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Node in the scene graph
 */
export interface IGLTFNode {
  name?: string;
  camera?: number;
  children?: number[];
  skin?: number;
  matrix?: number[];
  mesh?: number;
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  translation?: [number, number, number];
  weights?: number[];
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

// ============================================================================
// Mesh Types
// ============================================================================

/**
 * Mesh definition
 */
export interface IGLTFMesh {
  name?: string;
  primitives: IGLTFMeshPrimitive[];
  weights?: number[];
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Mesh primitive (sub-mesh)
 */
export interface IGLTFMeshPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: GLTFPrimitiveMode;
  targets?: Record<string, number>[];
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Primitive topology modes
 */
export enum GLTFPrimitiveMode {
  POINTS = 0,
  LINES = 1,
  LINE_LOOP = 2,
  LINE_STRIP = 3,
  TRIANGLES = 4,
  TRIANGLE_STRIP = 5,
  TRIANGLE_FAN = 6,
}

// ============================================================================
// Buffer Types
// ============================================================================

/**
 * Buffer accessor
 */
export interface IGLTFAccessor {
  name?: string;
  bufferView?: number;
  byteOffset?: number;
  componentType: GLTFComponentType;
  normalized?: boolean;
  count: number;
  type: GLTFAccessorType;
  max?: number[];
  min?: number[];
  sparse?: IGLTFAccessorSparse;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Sparse accessor data
 */
export interface IGLTFAccessorSparse {
  count: number;
  indices: {
    bufferView: number;
    byteOffset?: number;
    componentType: GLTFComponentType;
    extensions?: Record<string, unknown>;
    extras?: Record<string, unknown>;
  };
  values: {
    bufferView: number;
    byteOffset?: number;
    extensions?: Record<string, unknown>;
    extras?: Record<string, unknown>;
  };
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Component types
 */
export enum GLTFComponentType {
  BYTE = 5120,
  UNSIGNED_BYTE = 5121,
  SHORT = 5122,
  UNSIGNED_SHORT = 5123,
  UNSIGNED_INT = 5125,
  FLOAT = 5126,
}

/**
 * Accessor types
 */
export type GLTFAccessorType = 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT2' | 'MAT3' | 'MAT4';

/**
 * Buffer view
 */
export interface IGLTFBufferView {
  name?: string;
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: GLTFBufferViewTarget;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Buffer view targets
 */
export enum GLTFBufferViewTarget {
  ARRAY_BUFFER = 34962,
  ELEMENT_ARRAY_BUFFER = 34963,
}

/**
 * Buffer definition
 */
export interface IGLTFBuffer {
  name?: string;
  uri?: string;
  byteLength: number;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

// ============================================================================
// Material Types
// ============================================================================

/**
 * PBR material
 */
export interface IGLTFMaterial {
  name?: string;
  pbrMetallicRoughness?: IGLTFPBRMetallicRoughness;
  normalTexture?: IGLTFNormalTextureInfo;
  occlusionTexture?: IGLTFOcclusionTextureInfo;
  emissiveTexture?: IGLTFTextureInfo;
  emissiveFactor?: [number, number, number];
  alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND';
  alphaCutoff?: number;
  doubleSided?: boolean;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * PBR metallic-roughness model
 */
export interface IGLTFPBRMetallicRoughness {
  baseColorFactor?: [number, number, number, number];
  baseColorTexture?: IGLTFTextureInfo;
  metallicFactor?: number;
  roughnessFactor?: number;
  metallicRoughnessTexture?: IGLTFTextureInfo;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Texture reference
 */
export interface IGLTFTextureInfo {
  index: number;
  texCoord?: number;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Normal texture info
 */
export interface IGLTFNormalTextureInfo extends IGLTFTextureInfo {
  scale?: number;
}

/**
 * Occlusion texture info
 */
export interface IGLTFOcclusionTextureInfo extends IGLTFTextureInfo {
  strength?: number;
}

// ============================================================================
// Texture Types
// ============================================================================

/**
 * Texture definition
 */
export interface IGLTFTexture {
  name?: string;
  sampler?: number;
  source?: number;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Image source
 */
export interface IGLTFImage {
  name?: string;
  uri?: string;
  mimeType?: 'image/jpeg' | 'image/png' | string;
  bufferView?: number;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Texture sampler
 */
export interface IGLTFSampler {
  name?: string;
  magFilter?: GLTFMagFilter;
  minFilter?: GLTFMinFilter;
  wrapS?: GLTFWrapMode;
  wrapT?: GLTFWrapMode;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Magnification filter
 */
export enum GLTFMagFilter {
  NEAREST = 9728,
  LINEAR = 9729,
}

/**
 * Minification filter
 */
export enum GLTFMinFilter {
  NEAREST = 9728,
  LINEAR = 9729,
  NEAREST_MIPMAP_NEAREST = 9984,
  LINEAR_MIPMAP_NEAREST = 9985,
  NEAREST_MIPMAP_LINEAR = 9986,
  LINEAR_MIPMAP_LINEAR = 9987,
}

/**
 * Texture wrap mode
 */
export enum GLTFWrapMode {
  CLAMP_TO_EDGE = 33071,
  MIRRORED_REPEAT = 33648,
  REPEAT = 10497,
}

// ============================================================================
// Animation Types
// ============================================================================

/**
 * Animation definition
 */
export interface IGLTFAnimation {
  name?: string;
  channels: IGLTFAnimationChannel[];
  samplers: IGLTFAnimationSampler[];
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Animation channel
 */
export interface IGLTFAnimationChannel {
  sampler: number;
  target: IGLTFAnimationChannelTarget;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Animation channel target
 */
export interface IGLTFAnimationChannelTarget {
  node?: number;
  path: 'translation' | 'rotation' | 'scale' | 'weights';
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Animation sampler
 */
export interface IGLTFAnimationSampler {
  input: number;
  output: number;
  interpolation?: 'LINEAR' | 'STEP' | 'CUBICSPLINE';
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

// ============================================================================
// Skin Types
// ============================================================================

/**
 * Skin definition
 */
export interface IGLTFSkin {
  name?: string;
  inverseBindMatrices?: number;
  skeleton?: number;
  joints: number[];
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

// ============================================================================
// Camera Types
// ============================================================================

/**
 * Camera definition
 */
export interface IGLTFCamera {
  name?: string;
  type: 'perspective' | 'orthographic';
  perspective?: IGLTFCameraPerspective;
  orthographic?: IGLTFCameraOrthographic;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Perspective camera
 */
export interface IGLTFCameraPerspective {
  aspectRatio?: number;
  yfov: number;
  zfar?: number;
  znear: number;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

/**
 * Orthographic camera
 */
export interface IGLTFCameraOrthographic {
  xmag: number;
  ymag: number;
  zfar: number;
  znear: number;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

// ============================================================================
// Export Options and Results
// ============================================================================

/**
 * GLTF export options
 */
export interface IGLTFExportOptions {
  /** Export as binary GLB (true) or JSON GLTF (false) */
  binary?: boolean;

  /** Embed textures in document vs external references */
  embedTextures?: boolean;

  /** Mesh compression method */
  compression?: 'draco' | 'meshopt' | 'none';

  /** Include animations in export */
  includeAnimations?: boolean;

  /** Include cameras in export */
  includeCameras?: boolean;

  /** GLTF extensions to use */
  extensions?: string[];

  /** Pretty-print JSON output */
  prettyPrint?: boolean;

  /** Generator name for asset metadata */
  generator?: string;

  /** Copyright string */
  copyright?: string;

  /** Minimum supported version */
  minVersion?: string;
}

/**
 * GLTF export result
 */
export interface IGLTFExportResult {
  /** The GLTF document */
  document: IGLTFDocument;

  /** Binary GLB data (if binary: true) */
  glb?: ArrayBuffer;

  /** JSON string (if binary: false) */
  json?: string;

  /** External resources (textures, bins) */
  resources: Map<string, ArrayBuffer>;

  /** Export statistics */
  stats: IGLTFExportStats;
}

/**
 * Export statistics
 */
export interface IGLTFExportStats {
  nodeCount: number;
  meshCount: number;
  materialCount: number;
  textureCount: number;
  animationCount: number;
  bufferSize: number;
  jsonSize: number;
  glbSize: number;
  exportTime: number;
}

// ============================================================================
// GLB Binary Format
// ============================================================================

/**
 * GLB magic number: 'glTF' = 0x46546C67
 */
export const GLB_MAGIC = 0x46546c67;

/**
 * GLB version 2
 */
export const GLB_VERSION = 2;

/**
 * GLB chunk types
 */
export enum GLBChunkType {
  JSON = 0x4e4f534a, // 'JSON'
  BIN = 0x004e4942, // 'BIN\0'
}

/**
 * GLB header (12 bytes)
 */
export interface IGLBHeader {
  magic: number; // 0x46546C67
  version: number; // 2
  length: number; // Total file length
}

/**
 * GLB chunk header (8 bytes)
 */
export interface IGLBChunkHeader {
  chunkLength: number;
  chunkType: GLBChunkType;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Accessor type component counts
 */
export const ACCESSOR_TYPE_SIZES: Record<GLTFAccessorType, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

/**
 * Component type byte sizes
 */
export const COMPONENT_TYPE_SIZES: Record<GLTFComponentType, number> = {
  [GLTFComponentType.BYTE]: 1,
  [GLTFComponentType.UNSIGNED_BYTE]: 1,
  [GLTFComponentType.SHORT]: 2,
  [GLTFComponentType.UNSIGNED_SHORT]: 2,
  [GLTFComponentType.UNSIGNED_INT]: 4,
  [GLTFComponentType.FLOAT]: 4,
};

/**
 * Calculate accessor byte length
 */
export function getAccessorByteLength(accessor: IGLTFAccessor): number {
  const typeSize = ACCESSOR_TYPE_SIZES[accessor.type];
  const componentSize = COMPONENT_TYPE_SIZES[accessor.componentType];
  return accessor.count * typeSize * componentSize;
}

/**
 * Create empty GLTF document
 */
export function createEmptyGLTFDocument(generator = 'HoloScript'): IGLTFDocument {
  return {
    asset: {
      version: '2.0',
      generator,
    },
    scenes: [],
    nodes: [],
    meshes: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
    materials: [],
    textures: [],
    images: [],
    samplers: [],
    animations: [],
    skins: [],
    cameras: [],
  };
}

/**
 * Validate GLTF document structure
 */
export function validateGLTFDocument(doc: IGLTFDocument): string[] {
  const errors: string[] = [];

  // Check required asset
  if (!doc.asset) {
    errors.push('Missing required "asset" property');
  } else if (!doc.asset.version) {
    errors.push('Missing required "asset.version" property');
  } else if (doc.asset.version !== '2.0') {
    errors.push(`Unsupported glTF version: ${doc.asset.version}`);
  }

  // Check scene references
  if (doc.scene !== undefined && doc.scenes) {
    if (doc.scene < 0 || doc.scene >= doc.scenes.length) {
      errors.push(`Invalid scene index: ${doc.scene}`);
    }
  }

  // Check node references in scenes
  if (doc.scenes && doc.nodes) {
    for (let i = 0; i < doc.scenes.length; i++) {
      const scene = doc.scenes[i];
      if (scene.nodes) {
        for (const nodeIndex of scene.nodes) {
          if (nodeIndex < 0 || nodeIndex >= doc.nodes.length) {
            errors.push(`Scene ${i} references invalid node: ${nodeIndex}`);
          }
        }
      }
    }
  }

  // Check mesh references in nodes
  if (doc.nodes && doc.meshes) {
    for (let i = 0; i < doc.nodes.length; i++) {
      const node = doc.nodes[i];
      if (node.mesh !== undefined) {
        if (node.mesh < 0 || node.mesh >= doc.meshes.length) {
          errors.push(`Node ${i} references invalid mesh: ${node.mesh}`);
        }
      }
    }
  }

  // Check material references in mesh primitives
  if (doc.meshes && doc.materials) {
    for (let i = 0; i < doc.meshes.length; i++) {
      const mesh = doc.meshes[i];
      for (let j = 0; j < mesh.primitives.length; j++) {
        const primitive = mesh.primitives[j];
        if (primitive.material !== undefined) {
          if (primitive.material < 0 || primitive.material >= doc.materials.length) {
            errors.push(
              `Mesh ${i} primitive ${j} references invalid material: ${primitive.material}`
            );
          }
        }
      }
    }
  }

  // Check buffer views
  if (doc.bufferViews && doc.buffers) {
    for (let i = 0; i < doc.bufferViews.length; i++) {
      const view = doc.bufferViews[i];
      if (view.buffer < 0 || view.buffer >= doc.buffers.length) {
        errors.push(`BufferView ${i} references invalid buffer: ${view.buffer}`);
      }
    }
  }

  // Check accessors
  if (doc.accessors && doc.bufferViews) {
    for (let i = 0; i < doc.accessors.length; i++) {
      const accessor = doc.accessors[i];
      if (accessor.bufferView !== undefined) {
        if (accessor.bufferView < 0 || accessor.bufferView >= doc.bufferViews.length) {
          errors.push(`Accessor ${i} references invalid bufferView: ${accessor.bufferView}`);
        }
      }
    }
  }

  return errors;
}
