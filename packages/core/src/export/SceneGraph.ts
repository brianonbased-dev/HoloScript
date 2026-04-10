/**
 * Scene Graph Intermediate Representation (IR)
 *
 * Platform-agnostic scene representation for export to various formats.
 * Designed for serialization to JSON or binary.
 *
 * @module export
 * @version 3.3.0
 */

// ============================================================================
// Transform Types
// ============================================================================

/**
 * 3D vector representation
 */
export interface IVector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Quaternion for rotation (w, x, y, z)
 */
export interface IQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Complete transform with position, rotation, and scale
 */
export interface ITransform {
  position: IVector3;
  rotation: IQuaternion;
  scale: IVector3;
}

// ============================================================================
// Component Types
// ============================================================================

/**
 * Base component interface
 */
export interface IComponent {
  type: string;
  enabled: boolean;
  properties: Record<string, unknown>;
}

/**
 * Mesh component for geometry
 */
export interface IMeshComponent extends IComponent {
  type: 'mesh';
  meshRef: string; // Reference to mesh in meshes array
  materialRefs: string[]; // References to materials
  castShadows: boolean;
  receiveShadows: boolean;
}

/**
 * Light component
 */
export interface ILightComponent extends IComponent {
  type: 'light';
  lightType: 'directional' | 'point' | 'spot' | 'area';
  color: string; // Hex color
  intensity: number;
  range?: number; // For point/spot lights
  spotAngle?: number; // For spot lights
  castShadows: boolean;
  shadowBias: number;
  shadowMapSize: number;
}

/**
 * Camera component
 */
export interface ICameraComponent extends IComponent {
  type: 'camera';
  cameraType: 'perspective' | 'orthographic';
  fov: number; // Field of view (perspective)
  near: number;
  far: number;
  orthoSize?: number; // Orthographic size
  aspectRatio?: number;
}

/**
 * Collider component for physics
 */
export interface IColliderComponent extends IComponent {
  type: 'collider';
  colliderType: 'box' | 'sphere' | 'capsule' | 'mesh' | 'convex';
  size?: IVector3; // For box
  radius?: number; // For sphere/capsule
  height?: number; // For capsule
  meshRef?: string; // For mesh/convex colliders
  isTrigger: boolean;
  physicsMaterial?: string;
}

/**
 * Rigidbody component
 */
export interface IRigidbodyComponent extends IComponent {
  type: 'rigidbody';
  bodyType: 'dynamic' | 'kinematic' | 'static';
  mass: number;
  drag: number;
  angularDrag: number;
  useGravity: boolean;
  isKinematic: boolean;
  constraints: {
    freezePosition: { x: boolean; y: boolean; z: boolean };
    freezeRotation: { x: boolean; y: boolean; z: boolean };
  };
}

/**
 * Audio source component
 */
export interface IAudioSourceComponent extends IComponent {
  type: 'audioSource';
  audioClipRef: string;
  volume: number;
  pitch: number;
  loop: boolean;
  playOnAwake: boolean;
  spatial: boolean;
  minDistance: number;
  maxDistance: number;
  rolloff: 'linear' | 'logarithmic' | 'custom';
}

/**
 * Animation component
 */
export interface IAnimationComponent extends IComponent {
  type: 'animation';
  animationRefs: string[]; // References to animations
  defaultAnimation?: string;
  playOnAwake: boolean;
}

/**
 * Script component for custom behavior
 */
export interface IScriptComponent extends IComponent {
  type: 'script';
  scriptRef: string;
  scriptType: 'holoscript' | 'typescript' | 'wasm';
  serializedState: Record<string, unknown>;
}

// ============================================================================
// Scene Node Types
// ============================================================================

/**
 * Node types in the scene graph
 */
export type SceneNodeType = 'object' | 'group' | 'light' | 'camera' | 'empty' | 'agent' | 'prefab';

/**
 * Scene node representing an entity in the hierarchy
 */
export interface ISceneNode {
  /** Unique identifier */
  id: string;

  /** Node type */
  type: SceneNodeType;

  /** Display name */
  name: string;

  /** Local transform relative to parent */
  transform: ITransform;

  /** Child nodes */
  children: ISceneNode[];

  /** Attached components */
  components: IComponent[];

  /** Whether node is active/enabled */
  active: boolean;

  /** Visibility layers (bitmask) */
  layers: number;

  /** User-defined tags */
  tags: string[];

  /** Custom metadata */
  metadata: Record<string, unknown>;

  /** Prefab reference (for prefab instances) */
  prefabRef?: string;

  /** Prefab overrides */
  prefabOverrides?: Record<string, unknown>;
}

// ============================================================================
// Material Types
// ============================================================================

/**
 * Texture reference
 */
export interface ITextureRef {
  /** Texture asset ID */
  id: string;
  /** UV channel */
  uvChannel: number;
  /** Texture offset */
  offset: { u: number; v: number };
  /** Texture scale/tiling */
  scale: { u: number; v: number };
  /** Texture rotation (radians) */
  rotation: number;
}

/**
 * PBR material definition
 */
export interface IMaterial {
  /** Material ID */
  id: string;

  /** Material name */
  name: string;

  /** Material type */
  type: 'pbr' | 'unlit' | 'custom';

  /** Double-sided rendering */
  doubleSided: boolean;

  /** Alpha mode */
  alphaMode: 'opaque' | 'mask' | 'blend';

  /** Alpha cutoff (for mask mode) */
  alphaCutoff: number;

  // PBR properties
  /** Base color (RGBA) */
  baseColor: [number, number, number, number];

  /** Base color texture */
  baseColorTexture?: ITextureRef;

  /** Metallic factor (0-1) */
  metallic: number;

  /** Roughness factor (0-1) */
  roughness: number;

  /** Metallic-roughness texture */
  metallicRoughnessTexture?: ITextureRef;

  /** Normal map */
  normalTexture?: ITextureRef;

  /** Normal scale */
  normalScale: number;

  /** Occlusion texture */
  occlusionTexture?: ITextureRef;

  /** Occlusion strength */
  occlusionStrength: number;

  /** Emissive color (RGB) */
  emissiveColor: [number, number, number];

  /** Emissive texture */
  emissiveTexture?: ITextureRef;

  /** Emissive intensity */
  emissiveIntensity: number;

  /** Custom shader properties */
  customProperties?: Record<string, unknown>;
}

// ============================================================================
// Texture Types
// ============================================================================

/**
 * Texture wrap modes
 */
export type TextureWrapMode = 'repeat' | 'clamp' | 'mirror';

/**
 * Texture filter modes
 */
export type TextureFilterMode = 'nearest' | 'linear' | 'trilinear';

/**
 * Texture definition
 */
export interface ITexture {
  /** Texture ID */
  id: string;

  /** Texture name */
  name: string;

  /** Texture source (path, data URI, or buffer index) */
  source: string;

  /** Source type */
  sourceType: 'uri' | 'dataUri' | 'bufferView';

  /** Buffer view index (for binary) */
  bufferViewIndex?: number;

  /** MIME type */
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/ktx2';

  /** Texture dimensions */
  width: number;
  height: number;

  /** Wrap mode */
  wrapS: TextureWrapMode;
  wrapT: TextureWrapMode;

  /** Filter mode */
  minFilter: TextureFilterMode;
  magFilter: TextureFilterMode;

  /** Generate mipmaps */
  generateMipmaps: boolean;

  /** sRGB color space */
  srgb: boolean;
}

// ============================================================================
// Mesh Types
// ============================================================================

/**
 * Vertex attribute types
 */
export type AttributeType =
  | 'POSITION'
  | 'NORMAL'
  | 'TANGENT'
  | 'TEXCOORD_0'
  | 'TEXCOORD_1'
  | 'COLOR_0'
  | 'JOINTS_0'
  | 'WEIGHTS_0';

/**
 * Primitive topology
 */
export type PrimitiveMode =
  | 'points'
  | 'lines'
  | 'lineLoop'
  | 'lineStrip'
  | 'triangles'
  | 'triangleStrip'
  | 'triangleFan';

/**
 * Mesh primitive (sub-mesh)
 */
export interface IMeshPrimitive {
  /** Vertex attributes (bufferView indices) */
  attributes: Record<AttributeType, number>;

  /** Index buffer view */
  indices?: number;

  /** Drawing mode */
  mode: PrimitiveMode;

  /** Material reference */
  materialRef?: string;

  /** Morph targets */
  morphTargets?: Record<string, number>[];
}

/**
 * Mesh definition
 */
export interface IMesh {
  /** Mesh ID */
  id: string;

  /** Mesh name */
  name: string;

  /** Mesh primitives */
  primitives: IMeshPrimitive[];

  /** Morph target weights */
  morphWeights?: number[];

  /** Bounding box */
  bounds: {
    min: IVector3;
    max: IVector3;
  };
}

// ============================================================================
// Animation Types
// ============================================================================

/**
 * Animation interpolation
 */
export type AnimationInterpolation = 'linear' | 'step' | 'cubicspline';

/**
 * Animation target path
 */
export type AnimationPath = 'translation' | 'rotation' | 'scale' | 'weights';

/**
 * Animation channel
 */
export interface IAnimationChannel {
  /** Target node ID */
  targetNode: string;

  /** Target path */
  targetPath: AnimationPath;

  /** Sampler index */
  samplerIndex: number;
}

/**
 * Animation sampler
 */
export interface IAnimationSampler {
  /** Input (time) buffer view */
  inputBufferView: number;

  /** Output (values) buffer view */
  outputBufferView: number;

  /** Interpolation mode */
  interpolation: AnimationInterpolation;
}

/**
 * Animation clip
 */
export interface IAnimation {
  /** Animation ID */
  id: string;

  /** Animation name */
  name: string;

  /** Duration in seconds */
  duration: number;

  /** Animation channels */
  channels: IAnimationChannel[];

  /** Animation samplers */
  samplers: IAnimationSampler[];
}

// ============================================================================
// Skeleton/Skin Types
// ============================================================================

/**
 * Joint/bone in skeleton
 */
export interface IJoint {
  /** Joint/node ID */
  nodeId: string;

  /** Inverse bind matrix (4x4, column-major) */
  inverseBindMatrix: number[];
}

/**
 * Skin definition for skeletal animation
 */
export interface ISkin {
  /** Skin ID */
  id: string;

  /** Skin name */
  name: string;

  /** Skeleton root node */
  skeletonRoot?: string;

  /** Joints */
  joints: IJoint[];
}

// ============================================================================
// Buffer Types
// ============================================================================

/**
 * Buffer data
 */
export interface IBuffer {
  /** Buffer ID */
  id: string;

  /** Buffer URI (external) or null (embedded) */
  uri?: string;

  /** Buffer byte length */
  byteLength: number;

  /** Embedded data (base64 or binary) */
  data?: ArrayBuffer;
}

/**
 * Buffer view (slice of buffer)
 */
export interface IBufferView {
  /** Buffer view ID */
  id: string;

  /** Source buffer index */
  bufferIndex: number;

  /** Byte offset in buffer */
  byteOffset: number;

  /** Byte length */
  byteLength: number;

  /** Byte stride (for interleaved data) */
  byteStride?: number;

  /** Target (vertex or index buffer) */
  target?: 'arrayBuffer' | 'elementArrayBuffer';
}

/**
 * Accessor for typed access to buffer views
 */
export interface IAccessor {
  /** Accessor ID */
  id: string;

  /** Buffer view index */
  bufferViewIndex: number;

  /** Byte offset within buffer view */
  byteOffset: number;

  /** Component type */
  componentType: 'byte' | 'ubyte' | 'short' | 'ushort' | 'uint' | 'float';

  /** Element type */
  type: 'scalar' | 'vec2' | 'vec3' | 'vec4' | 'mat2' | 'mat3' | 'mat4';

  /** Element count */
  count: number;

  /** Minimum values */
  min?: number[];

  /** Maximum values */
  max?: number[];

  /** Normalized integer */
  normalized: boolean;
}

// ============================================================================
// Scene Graph (Root)
// ============================================================================

/**
 * Complete scene graph for export
 */
export interface ISceneGraph {
  /** Schema version */
  version: string;

  /** Generator identifier */
  generator: string;

  /** Scene metadata */
  metadata: ISceneMetadata;

  /** Root node */
  root: ISceneNode;

  /** Materials */
  materials: IMaterial[];

  /** Textures */
  textures: ITexture[];

  /** Meshes */
  meshes: IMesh[];

  /** Animations */
  animations: IAnimation[];

  /** Skins (skeletal) */
  skins: ISkin[];

  /** Buffers */
  buffers: IBuffer[];

  /** Buffer views */
  bufferViews: IBufferView[];

  /** Accessors */
  accessors: IAccessor[];

  /** Extensions (format-specific) */
  extensions: Record<string, unknown>;

  /** User extras */
  extras: Record<string, unknown>;
}

/**
 * Scene metadata
 */
export interface ISceneMetadata {
  /** Scene name */
  name: string;

  /** Scene description */
  description?: string;

  /** Author name */
  author?: string;

  /** License identifier */
  license?: string;

  /** Copyright notice */
  copyright?: string;

  /** Creation timestamp */
  createdAt: string;

  /** Last modified timestamp */
  modifiedAt: string;

  /** Tags for categorization */
  tags: string[];

  /** Custom properties */
  properties: Record<string, unknown>;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an identity transform
 */
export function createIdentityTransform(): ITransform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

/**
 * Create an empty scene node
 */
export function createEmptyNode(id: string, name: string): ISceneNode {
  return {
    id,
    type: 'empty',
    name,
    transform: createIdentityTransform(),
    children: [],
    components: [],
    active: true,
    layers: 1,
    tags: [],
    metadata: {},
  };
}

/**
 * Create a default PBR material
 */
export function createDefaultMaterial(id: string, name: string): IMaterial {
  return {
    id,
    name,
    type: 'pbr',
    doubleSided: false,
    alphaMode: 'opaque',
    alphaCutoff: 0.5,
    baseColor: [1, 1, 1, 1],
    metallic: 0,
    roughness: 0.5,
    normalScale: 1,
    occlusionStrength: 1,
    emissiveColor: [0, 0, 0],
    emissiveIntensity: 1,
  };
}

/**
 * Create an empty scene graph
 */
export function createEmptySceneGraph(name: string): ISceneGraph {
  const now = new Date().toISOString();
  return {
    version: '3.3.0',
    generator: 'HoloScript',
    metadata: {
      name,
      createdAt: now,
      modifiedAt: now,
      tags: [],
      properties: {},
    },
    root: createEmptyNode('root', 'Root'),
    materials: [],
    textures: [],
    meshes: [],
    animations: [],
    skins: [],
    buffers: [],
    bufferViews: [],
    accessors: [],
    extensions: {},
    extras: {},
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if component is a mesh component
 */
export function isMeshComponent(component: IComponent): component is IMeshComponent {
  return component.type === 'mesh';
}

/**
 * Check if component is a light component
 */
export function isLightComponent(component: IComponent): component is ILightComponent {
  return component.type === 'light';
}

/**
 * Check if component is a camera component
 */
export function isCameraComponent(component: IComponent): component is ICameraComponent {
  return component.type === 'camera';
}

/**
 * Check if component is a collider component
 */
export function isColliderComponent(component: IComponent): component is IColliderComponent {
  return component.type === 'collider';
}

/**
 * Check if component is a rigidbody component
 */
export function isRigidbodyComponent(component: IComponent): component is IRigidbodyComponent {
  return component.type === 'rigidbody';
}
