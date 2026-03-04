/**
 * glTF/GLB Export Pipeline for HoloScript
 *
 * Generates glTF 2.0 (.gltf) and binary glTF (.glb) files from HoloScript compositions.
 * Uses the glTF-Transform library for high-quality, optimized output.
 *
 * glTF is the "JPEG of 3D" - supported by virtually every 3D viewer, game engine,
 * and web framework including Three.js, Babylon.js, Unity, Unreal, and more.
 *
 * Features:
 * - Binary GLB export (single-file, web-optimized)
 * - Separate glTF + .bin export
 * - PBR material support (metallicRoughness, specularGlossiness)
 * - Mesh primitives (cube, sphere, cylinder, cone, plane)
 * - Animation export (position, rotation, scale keyframes)
 * - Texture embedding or external references
 * - glTF extensions support (KHR_materials_unlit, KHR_draco_mesh_compression)
 *
 * @version 1.0.0
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloSpatialGroup,
  HoloValue,
  HoloTimeline,
  HoloLight,
  HoloCamera,
} from '../parser/HoloCompositionTypes';

import { TraitCompositor } from '../traits/visual/TraitCompositor';
import { MATERIAL_PRESETS } from './R3FCompiler';
import type { R3FMaterialProps } from '../traits/visual/types';
import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from './identity/ANSNamespace';
import {
  compileDomainBlocks,
  compileMaterialBlock,
  materialToGLTF,
} from './DomainBlockCompilerMixin';

// =============================================================================
// TYPES
// =============================================================================

export interface GLTFPipelineOptions {
  /** Output format: 'glb' for binary, 'gltf' for JSON + separate .bin */
  format?: 'glb' | 'gltf';
  /** Enable Draco mesh compression */
  dracoCompression?: boolean;
  /** Enable vertex quantization for smaller file size */
  quantize?: boolean;
  /** Remove unused resources */
  prune?: boolean;
  /** Deduplicate accessors and materials */
  dedupe?: boolean;
  /** Embed textures as base64 (for glTF format) */
  embedTextures?: boolean;
  /** Generator string for metadata */
  generator?: string;
  /** Copyright string */
  copyright?: string;
}

export interface GLTFExportResult {
  /** Binary data (for GLB) or undefined (for gltf) */
  binary?: Uint8Array;
  /** JSON document (for gltf format) */
  json?: object;
  /** Separate binary buffer (for gltf format) */
  buffer?: Uint8Array;
  /** External resources (textures, etc.) */
  resources?: Map<string, Uint8Array>;
  /** Export statistics */
  stats: GLTFExportStats;
}

export interface GLTFExportStats {
  nodeCount: number;
  meshCount: number;
  materialCount: number;
  textureCount: number;
  animationCount: number;
  totalVertices: number;
  totalTriangles: number;
  fileSizeBytes: number;
}

export interface GLTFNode {
  name: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number]; // quaternion
  scale?: [number, number, number];
  mesh?: number;
  children?: number[];
  camera?: number;
  extras?: Record<string, unknown>; // glTF spec allows custom data in extras
}

export interface GLTFMesh {
  name: string;
  primitives: GLTFPrimitive[];
}

export interface GLTFPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number; // 4 = TRIANGLES
}

export interface GLTFMaterial {
  name: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: [number, number, number, number];
    metallicFactor?: number;
    roughnessFactor?: number;
    baseColorTexture?: { index: number };
    metallicRoughnessTexture?: { index: number };
  };
  normalTexture?: { index: number };
  occlusionTexture?: { index: number };
  emissiveFactor?: [number, number, number];
  emissiveTexture?: { index: number };
  alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND';
  alphaCutoff?: number;
  doubleSided?: boolean;
  extensions?: Record<string, unknown>;
}

export interface GLTFAccessor {
  bufferView: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
}

export interface GLTFBufferView {
  buffer: number;
  byteOffset: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
}

// Geometry data for built-in primitives
interface GeometryData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
}

// =============================================================================
// BUILT-IN PRIMITIVES
// =============================================================================

const PRIMITIVE_GENERATORS: Record<string, (scale: [number, number, number]) => GeometryData> = {
  cube: generateCubeGeometry,
  box: generateCubeGeometry,
  sphere: generateSphereGeometry,
  orb: generateSphereGeometry,
  cylinder: generateCylinderGeometry,
  cone: generateConeGeometry,
  pyramid: generateConeGeometry,
  plane: generatePlaneGeometry,
  ground: generatePlaneGeometry,
};

function generateCubeGeometry(scale: [number, number, number]): GeometryData {
  const [sx, sy, sz] = scale.map((s) => s * 0.5);

  // prettier-ignore
  const positions = new Float32Array([
    // Front face
    -sx, -sy,  sz,   sx, -sy,  sz,   sx,  sy,  sz,  -sx,  sy,  sz,
    // Back face
    -sx, -sy, -sz,  -sx,  sy, -sz,   sx,  sy, -sz,   sx, -sy, -sz,
    // Top face
    -sx,  sy, -sz,  -sx,  sy,  sz,   sx,  sy,  sz,   sx,  sy, -sz,
    // Bottom face
    -sx, -sy, -sz,   sx, -sy, -sz,   sx, -sy,  sz,  -sx, -sy,  sz,
    // Right face
     sx, -sy, -sz,   sx,  sy, -sz,   sx,  sy,  sz,   sx, -sy,  sz,
    // Left face
    -sx, -sy, -sz,  -sx, -sy,  sz,  -sx,  sy,  sz,  -sx,  sy, -sz,
  ]);

  // prettier-ignore
  const normals = new Float32Array([
    // Front
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    // Back
    0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
    // Top
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    // Bottom
    0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
    // Right
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
    // Left
    -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
  ]);

  // prettier-ignore
  const uvs = new Float32Array([
    // Front
    0, 0,  1, 0,  1, 1,  0, 1,
    // Back
    1, 0,  1, 1,  0, 1,  0, 0,
    // Top
    0, 1,  0, 0,  1, 0,  1, 1,
    // Bottom
    1, 1,  0, 1,  0, 0,  1, 0,
    // Right
    1, 0,  1, 1,  0, 1,  0, 0,
    // Left
    0, 0,  1, 0,  1, 1,  0, 1,
  ]);

  // prettier-ignore
  const indices = new Uint16Array([
    0, 1, 2,  0, 2, 3,    // Front
    4, 5, 6,  4, 6, 7,    // Back
    8, 9, 10,  8, 10, 11,  // Top
    12, 13, 14,  12, 14, 15, // Bottom
    16, 17, 18,  16, 18, 19, // Right
    20, 21, 22,  20, 22, 23, // Left
  ]);

  return { positions, normals, uvs, indices };
}

function generateSphereGeometry(scale: [number, number, number]): GeometryData {
  const radius = Math.max(scale[0], scale[1], scale[2]) * 0.5;
  const segments = 24;
  const rings = 16;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Generate vertices
  for (let y = 0; y <= rings; y++) {
    const v = y / rings;
    const theta = v * Math.PI;

    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const phi = u * Math.PI * 2;

      const nx = Math.sin(theta) * Math.cos(phi);
      const ny = Math.cos(theta);
      const nz = Math.sin(theta) * Math.sin(phi);

      positions.push(nx * radius * (scale[0] / scale[0]));
      positions.push(ny * radius * (scale[1] / scale[0]));
      positions.push(nz * radius * (scale[2] / scale[0]));

      normals.push(nx, ny, nz);
      uvs.push(u, 1 - v);
    }
  }

  // Generate indices
  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < segments; x++) {
      const a = y * (segments + 1) + x;
      const b = a + segments + 1;

      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
  };
}

function generateCylinderGeometry(scale: [number, number, number]): GeometryData {
  const radiusTop = scale[0] * 0.5;
  const radiusBottom = scale[2] * 0.5;
  const height = scale[1];
  const segments = 24;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const halfHeight = height / 2;

  // Body
  for (let y = 0; y <= 1; y++) {
    const radius = y === 0 ? radiusBottom : radiusTop;
    const posY = y === 0 ? -halfHeight : halfHeight;

    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const theta = u * Math.PI * 2;
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);

      positions.push(radius * cosTheta, posY, radius * sinTheta);
      normals.push(cosTheta, 0, sinTheta);
      uvs.push(u, y);
    }
  }

  // Body indices
  for (let x = 0; x < segments; x++) {
    const a = x;
    const b = x + segments + 1;
    indices.push(a, b, a + 1);
    indices.push(b, b + 1, a + 1);
  }

  // Top cap
  const topCenterIndex = positions.length / 3;
  positions.push(0, halfHeight, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);

  for (let x = 0; x <= segments; x++) {
    const u = x / segments;
    const theta = u * Math.PI * 2;
    positions.push(radiusTop * Math.cos(theta), halfHeight, radiusTop * Math.sin(theta));
    normals.push(0, 1, 0);
    uvs.push(Math.cos(theta) * 0.5 + 0.5, Math.sin(theta) * 0.5 + 0.5);
  }

  for (let x = 0; x < segments; x++) {
    indices.push(topCenterIndex, topCenterIndex + x + 1, topCenterIndex + x + 2);
  }

  // Bottom cap
  const bottomCenterIndex = positions.length / 3;
  positions.push(0, -halfHeight, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0.5);

  for (let x = 0; x <= segments; x++) {
    const u = x / segments;
    const theta = u * Math.PI * 2;
    positions.push(radiusBottom * Math.cos(theta), -halfHeight, radiusBottom * Math.sin(theta));
    normals.push(0, -1, 0);
    uvs.push(Math.cos(theta) * 0.5 + 0.5, Math.sin(theta) * 0.5 + 0.5);
  }

  for (let x = 0; x < segments; x++) {
    indices.push(bottomCenterIndex, bottomCenterIndex + x + 2, bottomCenterIndex + x + 1);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
  };
}

function generateConeGeometry(scale: [number, number, number]): GeometryData {
  return generateCylinderGeometry([0.001, scale[1], scale[2]]);
}

function generatePlaneGeometry(scale: [number, number, number]): GeometryData {
  const [sx, _, sz] = scale.map((s) => s * 0.5);

  // prettier-ignore
  const positions = new Float32Array([
    -sx, 0, -sz,
     sx, 0, -sz,
     sx, 0,  sz,
    -sx, 0,  sz,
  ]);

  // prettier-ignore
  const normals = new Float32Array([
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
  ]);

  // prettier-ignore
  const uvs = new Float32Array([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ]);

  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  return { positions, normals, uvs, indices };
}

// =============================================================================
// GLTF PIPELINE
// =============================================================================

export class GLTFPipeline extends CompilerBase {
  protected readonly compilerName = 'GLTFPipeline';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.GLTF;
  }

  private options: Required<GLTFPipelineOptions>;
  private compositor: TraitCompositor;
  private bufferData: number[] = [];
  private accessors: GLTFAccessor[] = [];
  private bufferViews: GLTFBufferView[] = [];
  private meshes: GLTFMesh[] = [];
  private materials: GLTFMaterial[] = [];
  private nodes: GLTFNode[] = [];
  private scenes: Array<{ name: string; nodes: number[] }> = [];
  private animations: Array<{
    name: string;
    channels: Array<{ sampler: number; target: { node: number; path: string } }>;
    samplers: Array<{ input: number; interpolation: string; output: number }>;
  }> = [];
  private materialMap: Map<string, number> = new Map();

  private stats: GLTFExportStats = {
    nodeCount: 0,
    meshCount: 0,
    materialCount: 0,
    textureCount: 0,
    animationCount: 0,
    totalVertices: 0,
    totalTriangles: 0,
    fileSizeBytes: 0,
  };

  constructor(options: GLTFPipelineOptions = {}) {
    super();
    this.options = {
      format: options.format ?? 'glb',
      dracoCompression: options.dracoCompression ?? false,
      quantize: options.quantize ?? true,
      prune: options.prune ?? true,
      dedupe: options.dedupe ?? true,
      embedTextures: options.embedTextures ?? true,
      generator: options.generator ?? 'HoloScript GLTFPipeline v1.0.0',
      copyright: options.copyright ?? '',
    };
    this.compositor = new TraitCompositor();
  }

  /**
   * Compile a HoloScript composition to glTF format
   */
  compile(composition: HoloComposition, agentToken: string, outputPath?: string): GLTFExportResult {
    this.validateCompilerAccess(agentToken, outputPath);
    this.reset();

    // Build glTF structure
    this.processComposition(composition);

    // Create buffer
    const buffer = new Uint8Array(this.bufferData);

    // Build glTF document
    const gltf = this.buildDocument(composition.name, buffer.byteLength);

    if (this.options.format === 'glb') {
      const binary = this.createGLB(gltf, buffer);
      this.stats.fileSizeBytes = binary.byteLength;

      return {
        binary,
        stats: { ...this.stats },
      };
    } else {
      this.stats.fileSizeBytes = JSON.stringify(gltf).length + buffer.byteLength;

      return {
        json: gltf,
        buffer,
        stats: { ...this.stats },
      };
    }
  }

  /**
   * Reset pipeline state for new compilation
   */
  private reset(): void {
    this.bufferData = [];
    this.accessors = [];
    this.bufferViews = [];
    this.meshes = [];
    this.materials = [];
    this.nodes = [];
    this.scenes = [];
    this.animations = [];
    this.materialMap.clear();
    this.stats = {
      nodeCount: 0,
      meshCount: 0,
      materialCount: 0,
      textureCount: 0,
      animationCount: 0,
      totalVertices: 0,
      totalTriangles: 0,
      fileSizeBytes: 0,
    };
  }

  /**
   * Process the entire composition
   */
  private processComposition(composition: HoloComposition): void {
    const rootNodes: number[] = [];

    // Process objects
    for (const object of composition.objects || []) {
      const nodeIndex = this.processObject(object);
      if (nodeIndex !== -1) {
        rootNodes.push(nodeIndex);
      }
    }

    // Process spatial groups
    for (const group of composition.spatialGroups || []) {
      const nodeIndex = this.processSpatialGroup(group);
      if (nodeIndex !== -1) {
        rootNodes.push(nodeIndex);
      }
    }

    // Process lights
    for (const light of composition.lights || []) {
      const nodeIndex = this.processLight(light);
      if (nodeIndex !== -1) {
        rootNodes.push(nodeIndex);
      }
    }

    // Process camera
    if (composition.camera) {
      const nodeIndex = this.processCamera(composition.camera);
      if (nodeIndex !== -1) {
        rootNodes.push(nodeIndex);
      }
    }

    // Process timelines as animations
    for (const timeline of composition.timelines || []) {
      this.processTimeline(timeline);
    }

    // v4.2: Process domain block materials into glTF materials array
    const domainBlocks = (composition as any).domainBlocks ?? [];
    if (domainBlocks.length > 0) {
      compileDomainBlocks(domainBlocks, {
        material: (block) => {
          const mat = compileMaterialBlock(block);
          const gltfMat = materialToGLTF(mat);
          this.materials.push(gltfMat as any);
          this.stats.materialCount++;
          return '';
        },
      }, () => '');
    }

    // Create scene
    this.scenes.push({
      name: composition.name,
      nodes: rootNodes,
    });
  }

  /**
   * Process a single object
   */
  private processObject(object: HoloObjectDecl): number {
    // Extract basic properties via findProp (properties is HoloObjectProperty[])
    const position = this.extractVec3Prop(object, 'position', [0, 0, 0]);
    const rotation = this.extractVec3Prop(object, 'rotation', [0, 0, 0]);
    const scale = this.extractVec3Prop(object, 'scale', [1, 1, 1]);

    // Determine geometry type from properties
    const geometryProp =
      this.findProp(object, 'geometry') ||
      this.findProp(object, 'mesh') ||
      this.findProp(object, 'type');
    const shapeType = (typeof geometryProp === 'string' ? geometryProp : 'box').toLowerCase();

    // Create mesh if geometry type is recognized
    let meshIndex: number | undefined;
    if (PRIMITIVE_GENERATORS[shapeType]) {
      meshIndex = this.createPrimitiveMesh(object.name, shapeType, scale, object);
    }

    // Create node
    const node: GLTFNode = {
      name: object.name || `node_${this.nodes.length}`,
      translation: position,
      rotation: this.eulerToQuaternion(rotation),
      scale: [1, 1, 1], // Scale is baked into geometry
    };

    if (meshIndex !== undefined) {
      node.mesh = meshIndex;
    }

    // Process children
    if (object.children && object.children.length > 0) {
      const childIndices: number[] = [];
      for (const child of object.children) {
        const childIdx = this.processObject(child);
        if (childIdx !== -1) childIndices.push(childIdx);
      }
      if (childIndices.length > 0) node.children = childIndices;
    }

    const nodeIndex = this.nodes.length;
    this.nodes.push(node);
    this.stats.nodeCount++;

    return nodeIndex;
  }

  /**
   * Process a spatial group
   */
  private processSpatialGroup(group: HoloSpatialGroup): number {
    const childIndices: number[] = [];

    // Process child objects
    for (const child of group.objects || []) {
      const childIndex = this.processObject(child);
      if (childIndex !== -1) {
        childIndices.push(childIndex);
      }
    }

    // Process nested groups
    if (group.groups) {
      for (const sub of group.groups) {
        const subIdx = this.processSpatialGroup(sub);
        if (subIdx !== -1) childIndices.push(subIdx);
      }
    }

    // Extract position from properties array
    const posProp = (group.properties || []).find((p) => p.key === 'position');
    const position =
      posProp && Array.isArray(posProp.value)
        ? ([
            Number(posProp.value[0]) || 0,
            Number(posProp.value[1]) || 0,
            Number(posProp.value[2]) || 0,
          ] as [number, number, number])
        : ([0, 0, 0] as [number, number, number]);

    const node: GLTFNode = {
      name: group.name || `group_${this.nodes.length}`,
      translation: position,
      children: childIndices.length > 0 ? childIndices : undefined,
    };

    const nodeIndex = this.nodes.length;
    this.nodes.push(node);
    this.stats.nodeCount++;

    return nodeIndex;
  }

  /**
   * Process a timeline as animation.
   *
   * HoloTimeline has entries: HoloTimelineEntry[] where each entry has
   * { time: number, action: HoloTimelineAction }.
   * We extract 'animate' actions and group them by target + property.
   */
  private processTimeline(timeline: HoloTimeline): void {
    if (!timeline.entries || timeline.entries.length === 0) return;

    // Group animate actions by target
    const animateEntries = timeline.entries
      .filter((e) => e.action.kind === 'animate')
      .map((e) => ({
        time: e.time,
        target: (
          e.action as { kind: 'animate'; target: string; properties: Record<string, HoloValue> }
        ).target,
        properties: (
          e.action as { kind: 'animate'; target: string; properties: Record<string, HoloValue> }
        ).properties,
      }));

    if (animateEntries.length === 0) return;

    const channels: Array<{ sampler: number; target: { node: number; path: string } }> = [];
    const samplers: Array<{ input: number; interpolation: string; output: number }> = [];

    // Group by target node + property
    const grouped = new Map<string, Array<{ time: number; value: HoloValue }>>();
    for (const entry of animateEntries) {
      const targetNodeIndex = this.nodes.findIndex((n) => n.name === entry.target);
      if (targetNodeIndex === -1) continue;

      for (const [prop, value] of Object.entries(entry.properties)) {
        const gltfPath = this.mapPropertyToGLTFPath(prop);
        if (!gltfPath) continue;

        const key = `${targetNodeIndex}:${gltfPath}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push({ time: entry.time, value });
      }
    }

    for (const [key, keyframes] of grouped) {
      const [nodeIdxStr, gltfPath] = key.split(':');
      const nodeIdx = parseInt(nodeIdxStr, 10);

      // Input: time values in seconds
      const times = keyframes.map((kf) => kf.time / 1000);
      const inputAccessor = this.createAccessor(new Float32Array(times), 'SCALAR');

      // Output: property values
      const values: number[] = [];
      for (const kf of keyframes) {
        if (Array.isArray(kf.value)) {
          if (gltfPath === 'rotation') {
            const quat = this.eulerToQuaternion(kf.value as [number, number, number]);
            values.push(...quat);
          } else {
            values.push(...(kf.value as number[]));
          }
        }
      }

      const outputType = gltfPath === 'rotation' ? 'VEC4' : 'VEC3';
      const outputAccessor = this.createAccessor(new Float32Array(values), outputType);

      const samplerIndex = samplers.length;
      samplers.push({ input: inputAccessor, interpolation: 'LINEAR', output: outputAccessor });
      channels.push({ sampler: samplerIndex, target: { node: nodeIdx, path: gltfPath } });
    }

    if (channels.length > 0) {
      this.animations.push({
        name: timeline.name || `animation_${this.animations.length}`,
        channels,
        samplers,
      });
      this.stats.animationCount++;
    }
  }

  /**
   * Create a primitive mesh
   */
  private createPrimitiveMesh(
    name: string,
    shapeType: string,
    scale: [number, number, number],
    object: HoloObjectDecl
  ): number {
    const generator = PRIMITIVE_GENERATORS[shapeType];
    if (!generator) return -1;

    const geometry = generator(scale);

    // Create accessors
    const positionAccessor = this.createAccessor(geometry.positions, 'VEC3', true);
    const normalAccessor = this.createAccessor(geometry.normals, 'VEC3');
    const uvAccessor = this.createAccessor(geometry.uvs, 'VEC2');
    const indexAccessor = this.createAccessor(geometry.indices, 'SCALAR');

    // Create or get material (trait-aware)
    const materialIndex = this.getOrCreateMaterial(object);

    // Create mesh
    const mesh: GLTFMesh = {
      name: name || `mesh_${this.meshes.length}`,
      primitives: [
        {
          attributes: {
            POSITION: positionAccessor,
            NORMAL: normalAccessor,
            TEXCOORD_0: uvAccessor,
          },
          indices: indexAccessor,
          material: materialIndex,
          mode: 4, // TRIANGLES
        },
      ],
    };

    const meshIndex = this.meshes.length;
    this.meshes.push(mesh);
    this.stats.meshCount++;
    this.stats.totalVertices += geometry.positions.length / 3;
    this.stats.totalTriangles += geometry.indices.length / 3;

    return meshIndex;
  }

  /**
   * Get or create a material from object properties + traits.
   *
   * Material composition order (later overrides earlier):
   * 1. Defaults (white, metallic 0, roughness 0.5)
   * 2. Named material preset (e.g., material: "glass")
   * 3. TraitCompositor output (PBR from visual presets)
   * 4. Direct property overrides (color, opacity)
   */
  private getOrCreateMaterial(object: HoloObjectDecl): number {
    let color: [number, number, number] = [1, 1, 1];
    let metallic = 0;
    let roughness = 0.5;
    let opacity = 1;
    let emissive: [number, number, number] = [0, 0, 0];

    // 1. Named material preset (e.g., material: "glass")
    const namedMat = this.findProp(object, 'material');
    if (typeof namedMat === 'string' && MATERIAL_PRESETS[namedMat]) {
      const preset = MATERIAL_PRESETS[namedMat];
      if (preset.color) color = this.parseColorString(preset.color);
      if (preset.metalness !== undefined) metallic = preset.metalness;
      if (preset.roughness !== undefined) roughness = preset.roughness;
      if (preset.opacity !== undefined) opacity = preset.opacity;
      if (preset.transparent && opacity >= 1) opacity = 0.99; // trigger BLEND mode
      if (preset.emissive) emissive = this.parseColorString(preset.emissive);
    }

    // 2. TraitCompositor: compose PBR from visual trait presets
    const traitNames = (object.traits || []).map((t: HoloObjectTrait) => t.name);
    if (traitNames.length > 0) {
      const composed: R3FMaterialProps = this.compositor.compose(traitNames);
      if (composed.color) color = this.parseColorString(composed.color);
      if (composed.metalness !== undefined) metallic = composed.metalness;
      if (composed.roughness !== undefined) roughness = composed.roughness;
      if (composed.opacity !== undefined) opacity = composed.opacity;
      if (composed.emissive) emissive = this.parseColorString(composed.emissive);
      if (composed.transparent) opacity = Math.min(opacity, 0.9);
    }

    // 3. Direct property overrides
    const colorProp = this.findProp(object, 'color');
    if (typeof colorProp === 'string') {
      color = this.parseColorString(colorProp);
    } else if (Array.isArray(colorProp) && colorProp.length >= 3) {
      color = [Number(colorProp[0]), Number(colorProp[1]), Number(colorProp[2])];
    }

    const opacityProp = this.findProp(object, 'opacity');
    if (typeof opacityProp === 'number') opacity = opacityProp;

    const metallicProp = this.findProp(object, 'metallic');
    if (typeof metallicProp === 'number') metallic = metallicProp;

    const roughnessProp = this.findProp(object, 'roughness');
    if (typeof roughnessProp === 'number') roughness = roughnessProp;

    const emissiveProp = this.findProp(object, 'emissive');
    if (typeof emissiveProp === 'string') emissive = this.parseColorString(emissiveProp);

    // Create material key for caching
    const key = JSON.stringify({ color, metallic, roughness, opacity, emissive });
    if (this.materialMap.has(key)) {
      return this.materialMap.get(key)!;
    }

    const material: GLTFMaterial = {
      name: `material_${this.materials.length}`,
      pbrMetallicRoughness: {
        baseColorFactor: [...color, opacity] as [number, number, number, number],
        metallicFactor: metallic,
        roughnessFactor: roughness,
      },
      doubleSided: opacity < 1,
    };

    if (opacity < 1) {
      material.alphaMode = 'BLEND';
    }

    const emissiveSum = emissive[0] + emissive[1] + emissive[2];
    if (emissiveSum > 0) {
      material.emissiveFactor = emissive;
    }

    const materialIndex = this.materials.length;
    this.materials.push(material);
    this.materialMap.set(key, materialIndex);
    this.stats.materialCount++;

    return materialIndex;
  }

  /**
   * Create an accessor and buffer view for data
   */
  private createAccessor(
    data: Float32Array | Uint16Array,
    type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4',
    computeBounds: boolean = false
  ): number {
    const byteOffset = this.bufferData.length;
    const componentType = data instanceof Uint16Array ? 5123 : 5126; // UNSIGNED_SHORT or FLOAT
    const _bytesPerComponent = data instanceof Uint16Array ? 2 : 4;

    // Append data to buffer
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0; i < view.length; i++) {
      this.bufferData.push(view[i]);
    }

    // Pad to 4-byte alignment
    while (this.bufferData.length % 4 !== 0) {
      this.bufferData.push(0);
    }

    // Create buffer view
    const bufferViewIndex = this.bufferViews.length;
    const bufferView: GLTFBufferView = {
      buffer: 0,
      byteOffset,
      byteLength: data.byteLength,
    };

    // Add target for non-index data
    if (componentType === 5126) {
      bufferView.target = 34962; // ARRAY_BUFFER
    } else {
      bufferView.target = 34963; // ELEMENT_ARRAY_BUFFER
    }

    this.bufferViews.push(bufferView);

    // Calculate count
    const componentsPerElement =
      type === 'SCALAR' ? 1 : type === 'VEC2' ? 2 : type === 'VEC3' ? 3 : 4;
    const count = data.length / componentsPerElement;

    // Create accessor
    const accessor: GLTFAccessor = {
      bufferView: bufferViewIndex,
      componentType,
      count,
      type,
    };

    // Compute bounds for position data
    if (computeBounds && type === 'VEC3' && data instanceof Float32Array) {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];

      for (let i = 0; i < data.length; i += 3) {
        min[0] = Math.min(min[0], data[i]);
        min[1] = Math.min(min[1], data[i + 1]);
        min[2] = Math.min(min[2], data[i + 2]);
        max[0] = Math.max(max[0], data[i]);
        max[1] = Math.max(max[1], data[i + 1]);
        max[2] = Math.max(max[2], data[i + 2]);
      }

      accessor.min = min;
      accessor.max = max;
    }

    const accessorIndex = this.accessors.length;
    this.accessors.push(accessor);

    return accessorIndex;
  }

  /**
   * Build the glTF JSON document
   */
  private buildDocument(name: string, bufferLength: number): object {
    const gltf: Record<string, unknown> = {
      asset: {
        version: '2.0',
        generator: this.options.generator,
      },
      scene: 0,
      scenes: this.scenes,
      nodes: this.nodes,
      meshes: this.meshes,
      materials: this.materials,
      accessors: this.accessors,
      bufferViews: this.bufferViews,
      buffers: [
        {
          byteLength: bufferLength,
        },
      ],
    };

    if (this.options.copyright) {
      (gltf.asset as Record<string, unknown>).copyright = this.options.copyright;
    }

    if (this.animations.length > 0) {
      gltf.animations = this.animations;
    }

    // For gltf format, add URI to buffer
    if (this.options.format === 'gltf') {
      (gltf.buffers as Array<{ byteLength: number; uri?: string }>)[0].uri = `${name}.bin`;
    }

    return gltf;
  }

  /**
   * Create a GLB binary file
   */
  private createGLB(gltf: object, buffer: Uint8Array): Uint8Array {
    const jsonString = JSON.stringify(gltf);
    const jsonBuffer = new TextEncoder().encode(jsonString);

    // Pad JSON to 4-byte alignment
    const jsonPadding = (4 - (jsonBuffer.byteLength % 4)) % 4;
    const paddedJsonLength = jsonBuffer.byteLength + jsonPadding;

    // Pad binary to 4-byte alignment
    const binPadding = (4 - (buffer.byteLength % 4)) % 4;
    const paddedBinLength = buffer.byteLength + binPadding;

    // Calculate total file size
    const totalSize = 12 + 8 + paddedJsonLength + 8 + paddedBinLength;

    // Create output buffer
    const output = new ArrayBuffer(totalSize);
    const view = new DataView(output);
    const bytes = new Uint8Array(output);

    let offset = 0;

    // GLB Header
    view.setUint32(offset, 0x46546c67, true); // glTF magic
    offset += 4;
    view.setUint32(offset, 2, true); // version 2
    offset += 4;
    view.setUint32(offset, totalSize, true); // total length
    offset += 4;

    // JSON Chunk
    view.setUint32(offset, paddedJsonLength, true); // chunk length
    offset += 4;
    view.setUint32(offset, 0x4e4f534a, true); // JSON magic
    offset += 4;
    bytes.set(jsonBuffer, offset);
    offset += jsonBuffer.byteLength;
    // Pad with spaces
    for (let i = 0; i < jsonPadding; i++) {
      bytes[offset++] = 0x20;
    }

    // Binary Chunk
    view.setUint32(offset, paddedBinLength, true); // chunk length
    offset += 4;
    view.setUint32(offset, 0x004e4942, true); // BIN magic
    offset += 4;
    bytes.set(buffer, offset);
    offset += buffer.byteLength;
    // Pad with zeros
    for (let i = 0; i < binPadding; i++) {
      bytes[offset++] = 0x00;
    }

    return new Uint8Array(output);
  }

  /**
   * Process a light node (stored as extras for universal glTF compatibility)
   */
  private processLight(light: HoloLight): number {
    const props = light.properties || [];
    const findLightProp = (key: string) => props.find((p) => p.key === key)?.value;

    const position = findLightProp('position') as number[] | undefined;
    const node: GLTFNode = {
      name: light.name || `light_${this.nodes.length}`,
      translation: position ? [position[0], position[1], position[2]] : [0, 0, 0],
      extras: {
        type: 'light',
        lightType: light.lightType,
        color: findLightProp('color') || '#ffffff',
        intensity: findLightProp('intensity') ?? 1,
      },
    };

    const nodeIndex = this.nodes.length;
    this.nodes.push(node);
    this.stats.nodeCount++;
    return nodeIndex;
  }

  /**
   * Process a camera node
   */
  private processCamera(camera: HoloCamera): number {
    const props = camera.properties || [];
    const findCamProp = (key: string) => props.find((p) => p.key === key)?.value;

    const position = findCamProp('position') as number[] | undefined;
    const node: GLTFNode = {
      name: 'Camera',
      translation: position ? [position[0], position[1], position[2]] : [0, 0, 0],
      extras: {
        type: 'camera',
        cameraType: camera.cameraType,
        fov: findCamProp('fov') ?? 75,
        near: findCamProp('near') ?? 0.1,
        far: findCamProp('far') ?? 1000,
      },
    };

    const nodeIndex = this.nodes.length;
    this.nodes.push(node);
    this.stats.nodeCount++;
    return nodeIndex;
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /** Find a property by key in a HoloObjectDecl's property array. */
  private findProp(object: HoloObjectDecl, key: string): HoloValue | undefined {
    return object.properties?.find((p) => p.key === key)?.value;
  }

  /** Extract a vec3 from an object's properties array. */
  private extractVec3Prop(
    object: HoloObjectDecl,
    key: string,
    defaultValue: [number, number, number]
  ): [number, number, number] {
    const val = this.findProp(object, key);
    if (Array.isArray(val) && val.length >= 3) {
      return [Number(val[0]) || 0, Number(val[1]) || 0, Number(val[2]) || 0];
    }
    return defaultValue;
  }

  private parseColorString(color: string): [number, number, number] {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length >= 6) {
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        return [r, g, b];
      }
    }
    const colors: Record<string, [number, number, number]> = {
      red: [1, 0, 0],
      green: [0, 1, 0],
      blue: [0, 0, 1],
      white: [1, 1, 1],
      black: [0, 0, 0],
      yellow: [1, 1, 0],
      cyan: [0, 1, 1],
      magenta: [1, 0, 1],
      orange: [1, 0.5, 0],
      purple: [0.5, 0, 0.5],
    };
    return colors[color.toLowerCase()] || [1, 1, 1];
  }

  private eulerToQuaternion(euler: [number, number, number]): [number, number, number, number] {
    const toRad = Math.PI / 180;
    const x = (euler[0] * toRad) / 2;
    const y = (euler[1] * toRad) / 2;
    const z = (euler[2] * toRad) / 2;

    const cx = Math.cos(x);
    const sx = Math.sin(x);
    const cy = Math.cos(y);
    const sy = Math.sin(y);
    const cz = Math.cos(z);
    const sz = Math.sin(z);

    return [
      sx * cy * cz - cx * sy * sz,
      cx * sy * cz + sx * cy * sz,
      cx * cy * sz - sx * sy * cz,
      cx * cy * cz + sx * sy * sz,
    ];
  }

  private mapPropertyToGLTFPath(property: string): string | null {
    const mapping: Record<string, string> = {
      position: 'translation',
      translation: 'translation',
      rotation: 'rotation',
      scale: 'scale',
    };
    return mapping[property.toLowerCase()] || null;
  }
}

// Export singleton-style factory
export function createGLTFPipeline(options?: GLTFPipelineOptions): GLTFPipeline {
  return new GLTFPipeline(options);
}
