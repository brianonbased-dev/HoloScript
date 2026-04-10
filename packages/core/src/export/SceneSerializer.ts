/**
 * Scene Serializer
 *
 * Serializes HoloScript scenes to/from the intermediate representation (IR).
 * Supports JSON and binary formats.
 *
 * @module export
 * @version 3.3.0
 */

import {
  ISceneGraph,
  ISceneNode,
  ITransform,
  IQuaternion,
  createIdentityTransform,
} from './SceneGraph';

// ============================================================================
// Types
// ============================================================================

/**
 * Serialization options
 */
export interface ISerializeOptions {
  /** Pretty-print JSON with indentation */
  prettyPrint?: boolean;

  /** Include empty arrays/objects */
  includeEmpty?: boolean;

  /** Embed buffer data as base64 */
  embedBuffers?: boolean;

  /** Compress buffer data */
  compressBuffers?: boolean;

  /** Custom property filter */
  propertyFilter?: (key: string, value: unknown) => boolean;
}

/**
 * Deserialization options
 */
export interface IDeserializeOptions {
  /** Validate schema on load */
  validate?: boolean;

  /** Resolve external buffer URIs */
  resolveBuffers?: boolean;

  /** Buffer resolver function */
  bufferResolver?: (uri: string) => Promise<ArrayBuffer>;

  /** Strict mode (error on unknown properties) */
  strict?: boolean;
}

/**
 * Serialization result
 */
export interface ISerializeResult {
  /** JSON string output */
  json?: string;

  /** Binary output */
  binary?: ArrayBuffer;

  /** Separate buffer files */
  buffers?: Map<string, ArrayBuffer>;

  /** Statistics */
  stats: ISerializeStats;
}

/**
 * Serialization statistics
 */
export interface ISerializeStats {
  /** Total nodes serialized */
  nodeCount: number;

  /** Total materials */
  materialCount: number;

  /** Total textures */
  textureCount: number;

  /** Total meshes */
  meshCount: number;

  /** Total animations */
  animationCount: number;

  /** JSON size in bytes */
  jsonSize: number;

  /** Binary size in bytes (if applicable) */
  binarySize: number;

  /** Total buffer size */
  bufferSize: number;

  /** Serialization time (ms) */
  serializationTime: number;
}

/**
 * Validation error
 */
export interface IValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validation result
 */
export interface IValidationResult {
  valid: boolean;
  errors: IValidationError[];
  warnings: IValidationError[];
}

// ============================================================================
// Scene Serializer
// ============================================================================

/**
 * Serializer for HoloScript scene graphs
 */
export class SceneSerializer {
  private static readonly SCHEMA_VERSION = '3.3.0';
  private static readonly MAGIC_NUMBER = 0x484f4c4f; // 'HOLO' in ASCII
  private static readonly BINARY_VERSION = 1;

  /**
   * Serialize a scene graph to JSON
   */
  serialize(sceneGraph: ISceneGraph, options: ISerializeOptions = {}): ISerializeResult {
    const startTime = performance.now();

    // Clone to avoid modifying original
    const graph = this.prepareForSerialization(sceneGraph, options);

    // Count elements
    const nodeCount = graph.root ? this.countNodes(graph.root) : 0;
    const materialCount = (graph.materials || []).length;
    const textureCount = (graph.textures || []).length;
    const meshCount = (graph.meshes || []).length;
    const animationCount = (graph.animations || []).length;

    // Handle buffers
    let bufferSize = 0;
    const buffers = new Map<string, ArrayBuffer>();

    if (!options.embedBuffers) {
      // Extract buffers to separate files
      for (const buffer of graph.buffers || []) {
        if (buffer.data) {
          const bufferId = buffer.id || `buffer_${buffers.size}`;
          buffers.set(`${bufferId}.bin`, buffer.data);
          bufferSize += buffer.data.byteLength;
          buffer.uri = `${bufferId}.bin`;
          delete buffer.data;
        }
      }
    } else {
      // Embed buffers as base64
      for (const buffer of graph.buffers || []) {
        if (buffer.data) {
          bufferSize += buffer.data.byteLength;
          buffer.uri = this.arrayBufferToBase64DataUri(buffer.data);
          delete buffer.data;
        }
      }
    }

    // Serialize to JSON
    const replacer = options.propertyFilter
      ? (key: string, value: unknown) => {
          if (options.propertyFilter!(key, value)) {
            return value;
          }
          return undefined;
        }
      : undefined;

    const indent = options.prettyPrint ? 2 : undefined;
    const json = JSON.stringify(graph, replacer, indent);
    const jsonSize = new TextEncoder().encode(json).length;

    const endTime = performance.now();

    return {
      json,
      buffers: buffers.size > 0 ? buffers : undefined,
      stats: {
        nodeCount,
        materialCount,
        textureCount,
        meshCount,
        animationCount,
        jsonSize,
        binarySize: 0,
        bufferSize,
        serializationTime: endTime - startTime,
      },
    };
  }

  /**
   * Serialize a scene graph to binary format
   */
  serializeBinary(sceneGraph: ISceneGraph, options: ISerializeOptions = {}): ISerializeResult {
    const startTime = performance.now();

    // First serialize to JSON (without embedded buffers)
    const jsonResult = this.serialize(sceneGraph, {
      ...options,
      embedBuffers: false,
      prettyPrint: false,
    });

    const jsonBytes = new TextEncoder().encode(jsonResult.json!);

    // Collect all buffer data
    const bufferData: ArrayBuffer[] = [];
    let totalBufferSize = 0;

    if (jsonResult.buffers) {
      for (const [, buffer] of jsonResult.buffers) {
        bufferData.push(buffer);
        totalBufferSize += buffer.byteLength;
      }
    }

    // Binary format:
    // [Header: 16 bytes]
    //   - Magic number: 4 bytes (HOLO)
    //   - Version: 4 bytes
    //   - JSON length: 4 bytes
    //   - Buffer length: 4 bytes
    // [JSON: padded to 4-byte boundary]
    // [Buffers: concatenated]

    const headerSize = 16;
    const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
    const jsonChunkSize = jsonBytes.length + jsonPadding;
    const totalSize = headerSize + jsonChunkSize + totalBufferSize;

    const binary = new ArrayBuffer(totalSize);
    const view = new DataView(binary);
    const bytes = new Uint8Array(binary);

    // Write header
    view.setUint32(0, SceneSerializer.MAGIC_NUMBER, true);
    view.setUint32(4, SceneSerializer.BINARY_VERSION, true);
    view.setUint32(8, jsonBytes.length, true);
    view.setUint32(12, totalBufferSize, true);

    // Write JSON
    bytes.set(jsonBytes, headerSize);

    // Write buffers
    let bufferOffset = headerSize + jsonChunkSize;
    for (const buffer of bufferData) {
      bytes.set(new Uint8Array(buffer), bufferOffset);
      bufferOffset += buffer.byteLength;
    }

    const endTime = performance.now();

    return {
      binary,
      stats: {
        ...jsonResult.stats,
        binarySize: totalSize,
        serializationTime: endTime - startTime,
      },
    };
  }

  /**
   * Deserialize a scene graph from JSON
   */
  deserialize(json: string, options: IDeserializeOptions = {}): ISceneGraph {
    const parsed = JSON.parse(json) as ISceneGraph;

    if (options.validate) {
      const validation = this.validate(parsed);
      if (!validation.valid) {
        const errors = validation.errors.map((e) => e.message).join(', ');
        throw new Error(`Invalid scene graph: ${errors}`);
      }
    }

    // Restore defaults for missing optional fields
    this.restoreDefaults(parsed);

    return parsed;
  }

  /**
   * Deserialize a scene graph from binary
   */
  async deserializeBinary(
    binary: ArrayBuffer,
    options: IDeserializeOptions = {}
  ): Promise<ISceneGraph> {
    const view = new DataView(binary);

    // Read header
    const magic = view.getUint32(0, true);
    if (magic !== SceneSerializer.MAGIC_NUMBER) {
      throw new Error('Invalid binary scene: wrong magic number');
    }

    const version = view.getUint32(4, true);
    if (version > SceneSerializer.BINARY_VERSION) {
      throw new Error(`Unsupported binary version: ${version}`);
    }

    const jsonLength = view.getUint32(8, true);
    const bufferLength = view.getUint32(12, true);

    // Read JSON
    const headerSize = 16;
    const jsonBytes = new Uint8Array(binary, headerSize, jsonLength);
    const json = new TextDecoder().decode(jsonBytes);
    const sceneGraph = this.deserialize(json, { ...options, validate: false });

    // Read buffers
    const jsonPadding = (4 - (jsonLength % 4)) % 4;
    const bufferOffset = headerSize + jsonLength + jsonPadding;

    if (bufferLength > 0) {
      let currentOffset = bufferOffset;
      for (const buffer of sceneGraph.buffers) {
        if (buffer.byteLength > 0) {
          buffer.data = binary.slice(currentOffset, currentOffset + buffer.byteLength);
          currentOffset += buffer.byteLength;
        }
      }
    }

    if (options.validate) {
      const validation = this.validate(sceneGraph);
      if (!validation.valid) {
        const errors = validation.errors.map((e) => e.message).join(', ');
        throw new Error(`Invalid scene graph: ${errors}`);
      }
    }

    return sceneGraph;
  }

  /**
   * Validate a scene graph
   */
  validate(sceneGraph: ISceneGraph): IValidationResult {
    const errors: IValidationError[] = [];
    const warnings: IValidationError[] = [];

    // Check version
    if (!sceneGraph.version) {
      errors.push({
        path: 'version',
        message: 'Missing version field',
        severity: 'error',
      });
    }

    // Check root node
    if (!sceneGraph.root) {
      errors.push({
        path: 'root',
        message: 'Missing root node',
        severity: 'error',
      });
    } else {
      this.validateNode(sceneGraph.root, 'root', errors, warnings);
    }

    // Check material references
    const materialIds = new Set(sceneGraph.materials.map((m) => m.id));
    const _meshIds = new Set(sceneGraph.meshes.map((m) => m.id));
    const textureIds = new Set(sceneGraph.textures.map((t) => t.id));

    // Validate meshes reference valid materials
    for (const mesh of sceneGraph.meshes) {
      for (const primitive of mesh.primitives) {
        if (primitive.materialRef && !materialIds.has(primitive.materialRef)) {
          warnings.push({
            path: `meshes.${mesh.id}`,
            message: `References unknown material: ${primitive.materialRef}`,
            severity: 'warning',
          });
        }
      }
    }

    // Validate materials reference valid textures
    for (const material of sceneGraph.materials) {
      const textureRefs = [
        material.baseColorTexture,
        material.metallicRoughnessTexture,
        material.normalTexture,
        material.occlusionTexture,
        material.emissiveTexture,
      ].filter(Boolean);

      for (const texRef of textureRefs) {
        if (texRef && !textureIds.has(texRef.id)) {
          warnings.push({
            path: `materials.${material.id}`,
            message: `References unknown texture: ${texRef.id}`,
            severity: 'warning',
          });
        }
      }
    }

    // Check for duplicate IDs
    this.checkDuplicateIds(sceneGraph, errors);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Convert a scene graph to JSON string
   */
  toJSON(sceneGraph: ISceneGraph, prettyPrint = false): string {
    return JSON.stringify(sceneGraph, null, prettyPrint ? 2 : undefined);
  }

  /**
   * Parse a scene graph from JSON string
   */
  fromJSON(json: string): ISceneGraph {
    return this.deserialize(json, { validate: true });
  }

  /**
   * Clone a scene graph
   */
  clone(sceneGraph: ISceneGraph): ISceneGraph {
    return JSON.parse(JSON.stringify(sceneGraph));
  }

  /**
   * Merge two scene graphs
   */
  merge(target: ISceneGraph, source: ISceneGraph): ISceneGraph {
    const result = this.clone(target);

    // Add source nodes as children of target root
    const sourceRootClone = this.cloneNode(source.root);
    sourceRootClone.name = `${source.metadata.name}_root`;
    result.root.children.push(sourceRootClone);

    // Merge materials (with ID prefix to avoid conflicts)
    for (const material of source.materials) {
      const clonedMaterial = { ...material };
      clonedMaterial.id = `${source.metadata.name}_${material.id}`;
      result.materials.push(clonedMaterial);
    }

    // Merge textures
    for (const texture of source.textures) {
      const clonedTexture = { ...texture };
      clonedTexture.id = `${source.metadata.name}_${texture.id}`;
      result.textures.push(clonedTexture);
    }

    // Merge meshes
    for (const mesh of source.meshes) {
      const clonedMesh = { ...mesh, primitives: [...mesh.primitives] };
      clonedMesh.id = `${source.metadata.name}_${mesh.id}`;
      // Update material references
      for (const primitive of clonedMesh.primitives) {
        if (primitive.materialRef) {
          primitive.materialRef = `${source.metadata.name}_${primitive.materialRef}`;
        }
      }
      result.meshes.push(clonedMesh);
    }

    // Merge animations
    for (const animation of source.animations) {
      const clonedAnimation = { ...animation, channels: [...animation.channels] };
      clonedAnimation.id = `${source.metadata.name}_${animation.id}`;
      result.animations.push(clonedAnimation);
    }

    // Update metadata
    result.metadata.modifiedAt = new Date().toISOString();

    return result;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private prepareForSerialization(
    sceneGraph: ISceneGraph,
    options: ISerializeOptions
  ): ISceneGraph {
    const graph = this.clone(sceneGraph);

    // Update metadata
    graph.metadata.modifiedAt = new Date().toISOString();
    graph.generator = 'HoloScript';
    graph.version = SceneSerializer.SCHEMA_VERSION;

    // Remove empty arrays if not including empty
    if (!options.includeEmpty) {
      this.removeEmptyArrays(graph as unknown as Record<string, unknown>);
    }

    return graph;
  }

  private removeEmptyArrays(obj: Record<string, unknown>): void {
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (Array.isArray(value) && value.length === 0) {
        delete obj[key];
      } else if (typeof value === 'object' && value !== null) {
        this.removeEmptyArrays(value as Record<string, unknown>);
      }
    }
  }

  private countNodes(node: ISceneNode): number {
    let count = 1;
    for (const child of node.children || []) {
      count += this.countNodes(child);
    }
    return count;
  }

  private validateNode(
    node: ISceneNode,
    path: string,
    errors: IValidationError[],
    warnings: IValidationError[]
  ): void {
    if (!node.id) {
      errors.push({
        path,
        message: 'Node missing id',
        severity: 'error',
      });
    }

    if (!node.transform) {
      errors.push({
        path: `${path}.transform`,
        message: 'Node missing transform',
        severity: 'error',
      });
    }

    // Validate children recursively
    for (let i = 0; i < node.children.length; i++) {
      this.validateNode(node.children[i], `${path}.children[${i}]`, errors, warnings);
    }
  }

  private checkDuplicateIds(sceneGraph: ISceneGraph, errors: IValidationError[]): void {
    const nodeIds = new Set<string>();
    if (sceneGraph.root) {
      this.collectNodeIds(sceneGraph.root, nodeIds, errors);
    }

    const materialIds = new Set<string>();
    for (const material of sceneGraph.materials || []) {
      if (materialIds.has(material.id)) {
        errors.push({
          path: `materials`,
          message: `Duplicate material id: ${material.id}`,
          severity: 'error',
        });
      }
      materialIds.add(material.id);
    }
  }

  private collectNodeIds(node: ISceneNode, ids: Set<string>, errors: IValidationError[]): void {
    if (ids.has(node.id)) {
      errors.push({
        path: `nodes`,
        message: `Duplicate node id: ${node.id}`,
        severity: 'error',
      });
    }
    ids.add(node.id);

    for (const child of node.children || []) {
      this.collectNodeIds(child, ids, errors);
    }
  }

  private restoreDefaults(sceneGraph: ISceneGraph): void {
    // Ensure arrays exist
    sceneGraph.materials = sceneGraph.materials || [];
    sceneGraph.textures = sceneGraph.textures || [];
    sceneGraph.meshes = sceneGraph.meshes || [];
    sceneGraph.animations = sceneGraph.animations || [];
    sceneGraph.skins = sceneGraph.skins || [];
    sceneGraph.buffers = sceneGraph.buffers || [];
    sceneGraph.bufferViews = sceneGraph.bufferViews || [];
    sceneGraph.accessors = sceneGraph.accessors || [];
    sceneGraph.extensions = sceneGraph.extensions || {};
    sceneGraph.extras = sceneGraph.extras || {};

    // Restore node defaults
    this.restoreNodeDefaults(sceneGraph.root);
  }

  private restoreNodeDefaults(node: ISceneNode): void {
    node.children = node.children || [];
    node.components = node.components || [];
    node.tags = node.tags || [];
    node.metadata = node.metadata || {};
    node.active = node.active ?? true;
    node.layers = node.layers ?? 1;

    if (!node.transform) {
      node.transform = createIdentityTransform();
    }

    for (const child of node.children) {
      this.restoreNodeDefaults(child);
    }
  }

  private cloneNode(node: ISceneNode): ISceneNode {
    return JSON.parse(JSON.stringify(node));
  }

  private arrayBufferToBase64DataUri(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:application/octet-stream;base64,${btoa(binary)}`;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Find a node by ID in the scene graph
 */
export function findNodeById(root: ISceneNode, id: string): ISceneNode | undefined {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children || []) {
    const found = findNodeById(child, id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * Find nodes by tag
 */
export function findNodesByTag(root: ISceneNode, tag: string): ISceneNode[] {
  const results: ISceneNode[] = [];
  if ((root.tags || []).includes(tag)) {
    results.push(root);
  }
  for (const child of root.children || []) {
    results.push(...findNodesByTag(child, tag));
  }
  return results;
}

/**
 * Traverse all nodes in the scene graph
 */
export function traverseNodes(
  root: ISceneNode,
  callback: (node: ISceneNode, depth: number) => void,
  depth = 0
): void {
  callback(root, depth);
  for (const child of root.children || []) {
    traverseNodes(child, callback, depth + 1);
  }
}

/**
 * Calculate world transform for a node
 */
export function getWorldTransform(root: ISceneNode, targetId: string): ITransform | undefined {
  const path = findNodePath(root, targetId);
  if (!path) {
    return undefined;
  }

  // Accumulate transforms along path
  let worldTransform = createIdentityTransform();
  for (const node of path) {
    worldTransform = multiplyTransforms(worldTransform, node.transform);
  }
  return worldTransform;
}

/**
 * Find path from root to target node
 */
export function findNodePath(root: ISceneNode, targetId: string): ISceneNode[] | undefined {
  if (root.id === targetId) {
    return [root];
  }
  for (const child of root.children || []) {
    const path = findNodePath(child, targetId);
    if (path) {
      return [root, ...path];
    }
  }
  return undefined;
}

/**
 * Multiply two transforms
 */
export function multiplyTransforms(a: ITransform, b: ITransform): ITransform {
  // Simplified: just add positions and multiply scales
  // Full implementation would use matrix multiplication
  return {
    position: {
      x: a.position.x + b.position.x * a.scale.x,
      y: a.position.y + b.position.y * a.scale.y,
      z: a.position.z + b.position.z * a.scale.z,
    },
    rotation: multiplyQuaternions(a.rotation, b.rotation),
    scale: {
      x: a.scale.x * b.scale.x,
      y: a.scale.y * b.scale.y,
      z: a.scale.z * b.scale.z,
    },
  };
}

/**
 * Multiply two quaternions
 */
export function multiplyQuaternions(a: IQuaternion, b: IQuaternion): IQuaternion {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}
