/**
 * HoloScript glTF/GLB Exporter CLI
 *
 * Exports HoloScript .holo compositions to glTF 2.0 or binary GLB format.
 * Uses the GLTFPipeline from @holoscript/core for high-quality output.
 *
 * Usage:
 *   holo export --format=gltf scene.holo -o output.gltf
 *   holo export --format=glb scene.holo -o output.glb
 *   holo export scene.holo  # defaults to GLB
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

interface HoloTrait {
  name: string;
  params: Record<string, string | number | boolean>;
}

interface HoloObject {
  name: string;
  type: 'object' | 'spatial_group';
  shape: string;
  traits: HoloTrait[];
  properties: Record<string, unknown>;
  children: HoloObject[];
}

interface HoloKeyframe {
  time: number;
  property: string;
  value: unknown;
}

interface HoloTimeline {
  name: string;
  target: string;
  keyframes: HoloKeyframe[];
}

interface HoloEnvironment {
  skybox?: string;
  ambientLight?: number;
  fog?: boolean;
  shadows?: boolean;
  gravity?: [number, number, number];
  backgroundColor?: string;
}

interface HoloComposition {
  name: string;
  environment: HoloEnvironment;
  objects: HoloObject[];
  timelines: HoloTimeline[];
}

export interface GLTFExportOptions {
  /** Input .holo file path */
  input: string;
  /** Output file path (.gltf or .glb) */
  output?: string;
  /** Export format */
  format?: 'gltf' | 'glb';
  /** Enable Draco compression */
  draco?: boolean;
  /** Enable quantization */
  quantize?: boolean;
  /** Pretty-print JSON (for gltf) */
  pretty?: boolean;
  /** Verbose logging */
  verbose?: boolean;
}

// =============================================================================
// PARSER
// =============================================================================

/**
 * Minimal .holo parser for export
 */
class HoloParser {
  private pos = 0;
  private src = '';

  parse(source: string): HoloComposition {
    this.src = source;
    this.pos = 0;

    this.skipWhitespaceAndComments();
    this.expect('composition');
    this.skipWhitespaceAndComments();
    const name = this.parseQuotedString();
    this.skipWhitespaceAndComments();
    this.expect('{');

    const composition: HoloComposition = {
      name,
      environment: {},
      objects: [],
      timelines: [],
    };

    while (!this.isAtEnd() && this.peek() !== '}') {
      this.skipWhitespaceAndComments();
      if (this.isAtEnd() || this.peek() === '}') break;

      const keyword = this.peekWord();

      if (keyword === 'environment') {
        this.advance(keyword.length);
        this.skipWhitespaceAndComments();
        this.expect('{');
        composition.environment = this.parseEnvironment();
      } else if (keyword === 'object') {
        this.advance(keyword.length);
        composition.objects.push(this.parseObject());
      } else if (keyword === 'spatial_group' || keyword === 'group') {
        this.advance(keyword.length);
        composition.objects.push(this.parseSpatialGroup());
      } else if (keyword === 'timeline') {
        this.advance(keyword.length);
        composition.timelines.push(this.parseTimeline());
      } else {
        // Skip unknown content
        this.advance(1);
      }
    }

    return composition;
  }

  private parseEnvironment(): HoloEnvironment {
    const env: HoloEnvironment = {};

    while (!this.isAtEnd() && this.peek() !== '}') {
      this.skipWhitespaceAndComments();
      if (this.peek() === '}') break;

      const key = this.parseIdentifier();
      this.skipWhitespaceAndComments();
      this.expect(':');
      this.skipWhitespaceAndComments();
      const value = this.parseValue();
      this.skipWhitespaceAndComments();

      // Handle optional comma
      if (this.peek() === ',') this.advance(1);

      (env as Record<string, unknown>)[key] = value;
    }

    this.expect('}');
    return env;
  }

  private parseObject(): HoloObject {
    this.skipWhitespaceAndComments();
    const name = this.parseQuotedString();
    this.skipWhitespaceAndComments();
    this.expect(':');
    this.skipWhitespaceAndComments();
    const shape = this.parseIdentifier();
    this.skipWhitespaceAndComments();
    this.expect('{');

    const obj: HoloObject = {
      name,
      type: 'object',
      shape,
      traits: [],
      properties: {},
      children: [],
    };

    while (!this.isAtEnd() && this.peek() !== '}') {
      this.skipWhitespaceAndComments();
      if (this.peek() === '}') break;

      const key = this.peekWord();

      if (key === 'object') {
        this.advance(key.length);
        obj.children.push(this.parseObject());
      } else if (key === 'trait' || key === 'with') {
        this.advance(key.length);
        obj.traits.push(this.parseTrait());
      } else {
        // Property
        const propKey = this.parseIdentifier();
        this.skipWhitespaceAndComments();
        this.expect(':');
        this.skipWhitespaceAndComments();
        obj.properties[propKey] = this.parseValue();
        this.skipWhitespaceAndComments();
        if (this.peek() === ',') this.advance(1);
      }
    }

    this.expect('}');
    return obj;
  }

  private parseSpatialGroup(): HoloObject {
    this.skipWhitespaceAndComments();
    const name = this.parseQuotedString();
    this.skipWhitespaceAndComments();
    this.expect('{');

    const group: HoloObject = {
      name,
      type: 'spatial_group',
      shape: 'group',
      traits: [],
      properties: {},
      children: [],
    };

    while (!this.isAtEnd() && this.peek() !== '}') {
      this.skipWhitespaceAndComments();
      if (this.peek() === '}') break;

      const key = this.peekWord();

      if (key === 'object') {
        this.advance(key.length);
        group.children.push(this.parseObject());
      } else if (key === 'spatial_group' || key === 'group') {
        this.advance(key.length);
        group.children.push(this.parseSpatialGroup());
      } else if (key === 'position' || key === 'rotation' || key === 'scale') {
        const propKey = this.parseIdentifier();
        this.skipWhitespaceAndComments();
        this.expect(':');
        this.skipWhitespaceAndComments();
        group.properties[propKey] = this.parseValue();
        this.skipWhitespaceAndComments();
        if (this.peek() === ',') this.advance(1);
      } else {
        this.advance(1);
      }
    }

    this.expect('}');
    return group;
  }

  private parseTrait(): HoloTrait {
    this.skipWhitespaceAndComments();
    const name = this.parseIdentifier();
    this.skipWhitespaceAndComments();

    const params: Record<string, string | number | boolean> = {};

    if (this.peek() === '(') {
      this.advance(1);
      while (!this.isAtEnd() && this.peek() !== ')') {
        this.skipWhitespaceAndComments();
        if (this.peek() === ')') break;

        const key = this.parseIdentifier();
        this.skipWhitespaceAndComments();
        this.expect(':');
        this.skipWhitespaceAndComments();
        const value = this.parseValue();
        this.skipWhitespaceAndComments();
        if (this.peek() === ',') this.advance(1);

        params[key] = value as string | number | boolean;
      }
      this.expect(')');
    }

    return { name, params };
  }

  private parseTimeline(): HoloTimeline {
    this.skipWhitespaceAndComments();
    const name = this.parseQuotedString();
    this.skipWhitespaceAndComments();
    this.expect('{');

    const timeline: HoloTimeline = {
      name,
      target: '',
      keyframes: [],
    };

    while (!this.isAtEnd() && this.peek() !== '}') {
      this.skipWhitespaceAndComments();
      if (this.peek() === '}') break;

      const key = this.peekWord();

      if (key === 'target') {
        this.advance(key.length);
        this.skipWhitespaceAndComments();
        this.expect(':');
        this.skipWhitespaceAndComments();
        timeline.target = this.parseQuotedString();
      } else if (key === 'keyframe' || key === 'at') {
        this.advance(key.length);
        timeline.keyframes.push(this.parseKeyframe());
      } else {
        this.advance(1);
      }
    }

    this.expect('}');
    return timeline;
  }

  private parseKeyframe(): HoloKeyframe {
    this.skipWhitespaceAndComments();

    // Parse time: at 0ms { ... } or keyframe 1000 { ... }
    const time = this.parseNumber();
    this.skipWhitespaceAndComments();

    // Skip optional 'ms' suffix
    if (this.peekWord() === 'ms') {
      this.advance(2);
      this.skipWhitespaceAndComments();
    }

    this.expect('{');
    this.skipWhitespaceAndComments();

    const property = this.parseIdentifier();
    this.skipWhitespaceAndComments();
    this.expect(':');
    this.skipWhitespaceAndComments();
    const value = this.parseValue();
    this.skipWhitespaceAndComments();

    if (this.peek() === ',') this.advance(1);
    this.skipWhitespaceAndComments();
    this.expect('}');

    return { time, property, value };
  }

  // === Utility Methods ===

  private parseValue(): unknown {
    this.skipWhitespaceAndComments();
    const ch = this.peek();

    if (ch === '"' || ch === "'") {
      return this.parseQuotedString();
    } else if (ch === '[') {
      return this.parseArray();
    } else if (ch === '{') {
      return this.parseObject();
    } else if (ch === '-' || (ch >= '0' && ch <= '9')) {
      return this.parseNumber();
    } else if (this.peekWord() === 'true') {
      this.advance(4);
      return true;
    } else if (this.peekWord() === 'false') {
      this.advance(5);
      return false;
    } else {
      return this.parseIdentifier();
    }
  }

  private parseArray(): unknown[] {
    this.expect('[');
    const arr: unknown[] = [];

    while (!this.isAtEnd() && this.peek() !== ']') {
      this.skipWhitespaceAndComments();
      if (this.peek() === ']') break;

      arr.push(this.parseValue());
      this.skipWhitespaceAndComments();
      if (this.peek() === ',') this.advance(1);
    }

    this.expect(']');
    return arr;
  }

  private parseNumber(): number {
    let numStr = '';

    if (this.peek() === '-') {
      numStr += '-';
      this.advance(1);
    }

    while (!this.isAtEnd()) {
      const ch = this.peek();
      if ((ch >= '0' && ch <= '9') || ch === '.') {
        numStr += ch;
        this.advance(1);
      } else {
        break;
      }
    }

    return parseFloat(numStr);
  }

  private parseQuotedString(): string {
    const quote = this.peek();
    if (quote !== '"' && quote !== "'") {
      // Not a quoted string, try identifier
      return this.parseIdentifier();
    }

    this.advance(1);
    let str = '';

    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance(1);
        str += this.peek();
      } else {
        str += this.peek();
      }
      this.advance(1);
    }

    this.advance(1); // closing quote
    return str;
  }

  private parseIdentifier(): string {
    let id = '';
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (/[a-zA-Z0-9_]/.test(ch)) {
        id += ch;
        this.advance(1);
      } else {
        break;
      }
    }
    return id;
  }

  private peekWord(): string {
    let word = '';
    let i = this.pos;
    while (i < this.src.length && /[a-zA-Z0-9_]/.test(this.src[i])) {
      word += this.src[i];
      i++;
    }
    return word;
  }

  private skipWhitespaceAndComments(): void {
    while (!this.isAtEnd()) {
      const ch = this.peek();

      if (/\s/.test(ch)) {
        this.advance(1);
      } else if (ch === '/' && this.src[this.pos + 1] === '/') {
        // Line comment
        while (!this.isAtEnd() && this.peek() !== '\n') {
          this.advance(1);
        }
      } else if (ch === '/' && this.src[this.pos + 1] === '*') {
        // Block comment
        this.advance(2);
        while (!this.isAtEnd() && !(this.peek() === '*' && this.src[this.pos + 1] === '/')) {
          this.advance(1);
        }
        this.advance(2);
      } else {
        break;
      }
    }
  }

  private peek(): string {
    return this.src[this.pos] || '';
  }

  private advance(n: number): void {
    this.pos += n;
  }

  private expect(s: string): void {
    for (let i = 0; i < s.length; i++) {
      if (this.src[this.pos + i] !== s[i]) {
        throw new Error(
          `Expected '${s}' at position ${this.pos}, got '${this.src.slice(this.pos, this.pos + 10)}'`
        );
      }
    }
    this.pos += s.length;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.src.length;
  }
}

// =============================================================================
// GLTF DOCUMENT BUILDER
// =============================================================================

interface GLTFDocument {
  asset: { version: string; generator: string; copyright?: string };
  scene: number;
  scenes: Array<{ name: string; nodes: number[] }>;
  nodes: GLTFNode[];
  meshes: GLTFMesh[];
  materials: GLTFMaterial[];
  accessors: GLTFAccessor[];
  bufferViews: GLTFBufferView[];
  buffers: Array<{ byteLength: number; uri?: string }>;
  animations?: GLTFAnimation[];
}

interface GLTFNode {
  name: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  mesh?: number;
  children?: number[];
}

interface GLTFMesh {
  name: string;
  primitives: Array<{
    attributes: Record<string, number>;
    indices?: number;
    material?: number;
    mode?: number;
  }>;
}

interface GLTFMaterial {
  name: string;
  pbrMetallicRoughness: {
    baseColorFactor?: [number, number, number, number];
    metallicFactor?: number;
    roughnessFactor?: number;
  };
  emissiveFactor?: [number, number, number];
  alphaMode?: string;
  doubleSided?: boolean;
}

interface GLTFAccessor {
  bufferView: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
}

interface GLTFBufferView {
  buffer: number;
  byteOffset: number;
  byteLength: number;
  target?: number;
}

interface GLTFAnimation {
  name: string;
  channels: Array<{ sampler: number; target: { node: number; path: string } }>;
  samplers: Array<{ input: number; interpolation: string; output: number }>;
}

// Geometry type
interface GeometryData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
}

/**
 * Build glTF document from HoloComposition
 */
class GLTFBuilder {
  private bufferData: number[] = [];
  private nodes: GLTFNode[] = [];
  private meshes: GLTFMesh[] = [];
  private materials: GLTFMaterial[] = [];
  private accessors: GLTFAccessor[] = [];
  private bufferViews: GLTFBufferView[] = [];
  private animations: GLTFAnimation[] = [];
  private materialCache = new Map<string, number>();
  private nodeNameToIndex = new Map<string, number>();

  build(composition: HoloComposition): { gltf: GLTFDocument; buffer: Uint8Array } {
    this.reset();

    const rootNodes: number[] = [];

    // Process objects
    for (const obj of composition.objects) {
      const nodeIndex = this.processObject(obj);
      if (nodeIndex !== -1) {
        rootNodes.push(nodeIndex);
      }
    }

    // Process timelines
    for (const timeline of composition.timelines) {
      this.processTimeline(timeline);
    }

    const buffer = new Uint8Array(this.bufferData);

    const gltf: GLTFDocument = {
      asset: { version: '2.0', generator: 'HoloScript glTF Exporter v1.0.0' },
      scene: 0,
      scenes: [{ name: composition.name, nodes: rootNodes }],
      nodes: this.nodes,
      meshes: this.meshes,
      materials: this.materials,
      accessors: this.accessors,
      bufferViews: this.bufferViews,
      buffers: [{ byteLength: buffer.byteLength }],
    };

    if (this.animations.length > 0) {
      gltf.animations = this.animations;
    }

    return { gltf, buffer };
  }

  private reset(): void {
    this.bufferData = [];
    this.nodes = [];
    this.meshes = [];
    this.materials = [];
    this.accessors = [];
    this.bufferViews = [];
    this.animations = [];
    this.materialCache.clear();
    this.nodeNameToIndex.clear();
  }

  private processObject(obj: HoloObject): number {
    const position = this.extractVec3(obj.properties, 'position', [0, 0, 0]);
    const rotation = this.extractVec3(obj.properties, 'rotation', [0, 0, 0]);
    const scale = this.extractVec3(obj.properties, 'scale', [1, 1, 1]);

    let meshIndex: number | undefined;

    if (obj.type === 'object' && obj.shape) {
      meshIndex = this.createMesh(obj.name, obj.shape, scale, obj.properties);
    }

    const node: GLTFNode = {
      name: obj.name,
      translation: position,
      rotation: this.eulerToQuaternion(rotation),
      scale: [1, 1, 1],
    };

    if (meshIndex !== undefined) {
      node.mesh = meshIndex;
    }

    // Process children
    if (obj.children.length > 0) {
      const childIndices: number[] = [];
      for (const child of obj.children) {
        const childIndex = this.processObject(child);
        if (childIndex !== -1) {
          childIndices.push(childIndex);
        }
      }
      if (childIndices.length > 0) {
        node.children = childIndices;
      }
    }

    const nodeIndex = this.nodes.length;
    this.nodes.push(node);
    this.nodeNameToIndex.set(obj.name, nodeIndex);

    return nodeIndex;
  }

  private processTimeline(timeline: HoloTimeline): void {
    const nodeIndex = this.nodeNameToIndex.get(timeline.target);
    if (nodeIndex === undefined) return;

    // Sort keyframes by time
    const keyframes = [...timeline.keyframes].sort((a, b) => a.time - b.time);
    if (keyframes.length === 0) return;

    // Group by property
    const byProperty = new Map<string, HoloKeyframe[]>();
    for (const kf of keyframes) {
      const key = kf.property;
      if (!byProperty.has(key)) {
        byProperty.set(key, []);
      }
      byProperty.get(key)!.push(kf);
    }

    const channels: GLTFAnimation['channels'] = [];
    const samplers: GLTFAnimation['samplers'] = [];

    for (const [property, kfs] of byProperty) {
      const gltfPath = this.propertyToPath(property);
      if (!gltfPath) continue;

      // Create input accessor (times)
      const times = kfs.map((kf) => kf.time / 1000);
      const inputAccessor = this.createAccessor(new Float32Array(times), 'SCALAR');

      // Create output accessor (values)
      const values: number[] = [];
      for (const kf of kfs) {
        const val = kf.value;
        if (Array.isArray(val)) {
          if (gltfPath === 'rotation') {
            const quat = this.eulerToQuaternion(val as [number, number, number]);
            values.push(...quat);
          } else {
            values.push(...(val as number[]));
          }
        }
      }

      const outputType = gltfPath === 'rotation' ? 'VEC4' : 'VEC3';
      const outputAccessor = this.createAccessor(new Float32Array(values), outputType);

      const samplerIndex = samplers.length;
      samplers.push({
        input: inputAccessor,
        interpolation: 'LINEAR',
        output: outputAccessor,
      });

      channels.push({
        sampler: samplerIndex,
        target: { node: nodeIndex, path: gltfPath },
      });
    }

    if (channels.length > 0) {
      this.animations.push({
        name: timeline.name,
        channels,
        samplers,
      });
    }
  }

  private createMesh(
    name: string,
    shape: string,
    scale: [number, number, number],
    properties: Record<string, unknown>
  ): number | undefined {
    const geometry = this.generateGeometry(shape.toLowerCase(), scale);
    if (!geometry) return undefined;

    const positionAccessor = this.createAccessor(geometry.positions, 'VEC3', true);
    const normalAccessor = this.createAccessor(geometry.normals, 'VEC3');
    const uvAccessor = this.createAccessor(geometry.uvs, 'VEC2');
    const indexAccessor = this.createAccessor(geometry.indices, 'SCALAR');

    const materialIndex = this.getOrCreateMaterial(properties);

    const mesh: GLTFMesh = {
      name,
      primitives: [
        {
          attributes: {
            POSITION: positionAccessor,
            NORMAL: normalAccessor,
            TEXCOORD_0: uvAccessor,
          },
          indices: indexAccessor,
          material: materialIndex,
          mode: 4,
        },
      ],
    };

    const meshIndex = this.meshes.length;
    this.meshes.push(mesh);
    return meshIndex;
  }

  private getOrCreateMaterial(properties: Record<string, unknown>): number {
    const color = this.extractColor(properties, 'color', [1, 1, 1]);
    const metallic = this.extractNumber(properties, 'metallic', 0);
    const roughness = this.extractNumber(properties, 'roughness', 0.5);
    const opacity = this.extractNumber(properties, 'opacity', 1);

    const key = JSON.stringify({ color, metallic, roughness, opacity });
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key)!;
    }

    const material: GLTFMaterial = {
      name: `material_${this.materials.length}`,
      pbrMetallicRoughness: {
        baseColorFactor: [...color, opacity],
        metallicFactor: metallic,
        roughnessFactor: roughness,
      },
    };

    if (opacity < 1) {
      material.alphaMode = 'BLEND';
      material.doubleSided = true;
    }

    const index = this.materials.length;
    this.materials.push(material);
    this.materialCache.set(key, index);

    return index;
  }

  private generateGeometry(shape: string, scale: [number, number, number]): GeometryData | null {
    switch (shape) {
      case 'cube':
      case 'box':
        return this.generateCube(scale);
      case 'sphere':
      case 'orb':
        return this.generateSphere(scale);
      case 'cylinder':
        return this.generateCylinder(scale);
      case 'cone':
      case 'pyramid':
        return this.generateCone(scale);
      case 'plane':
      case 'ground':
        return this.generatePlane(scale);
      default:
        return this.generateCube(scale); // Default fallback
    }
  }

  private generateCube(scale: [number, number, number]): GeometryData {
    const [sx, sy, sz] = scale.map((s) => s * 0.5);

    // prettier-ignore
    const positions = new Float32Array([
      -sx, -sy,  sz,   sx, -sy,  sz,   sx,  sy,  sz,  -sx,  sy,  sz,
      -sx, -sy, -sz,  -sx,  sy, -sz,   sx,  sy, -sz,   sx, -sy, -sz,
      -sx,  sy, -sz,  -sx,  sy,  sz,   sx,  sy,  sz,   sx,  sy, -sz,
      -sx, -sy, -sz,   sx, -sy, -sz,   sx, -sy,  sz,  -sx, -sy,  sz,
       sx, -sy, -sz,   sx,  sy, -sz,   sx,  sy,  sz,   sx, -sy,  sz,
      -sx, -sy, -sz,  -sx, -sy,  sz,  -sx,  sy,  sz,  -sx,  sy, -sz,
    ]);

    // prettier-ignore
    const normals = new Float32Array([
      0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
      0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
      0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
      0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
      1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
      -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    ]);

    // prettier-ignore
    const uvs = new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 1,
      1, 0, 1, 1, 0, 1, 0, 0,
      0, 1, 0, 0, 1, 0, 1, 1,
      1, 1, 0, 1, 0, 0, 1, 0,
      1, 0, 1, 1, 0, 1, 0, 0,
      0, 0, 1, 0, 1, 1, 0, 1,
    ]);

    // prettier-ignore
    const indices = new Uint16Array([
      0, 1, 2,  0, 2, 3,
      4, 5, 6,  4, 6, 7,
      8, 9, 10, 8, 10, 11,
      12, 13, 14, 12, 14, 15,
      16, 17, 18, 16, 18, 19,
      20, 21, 22, 20, 22, 23,
    ]);

    return { positions, normals, uvs, indices };
  }

  private generateSphere(scale: [number, number, number]): GeometryData {
    const radius = Math.max(...scale) * 0.5;
    const segments = 24;
    const rings = 16;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let y = 0; y <= rings; y++) {
      const v = y / rings;
      const theta = v * Math.PI;

      for (let x = 0; x <= segments; x++) {
        const u = x / segments;
        const phi = u * Math.PI * 2;

        const nx = Math.sin(theta) * Math.cos(phi);
        const ny = Math.cos(theta);
        const nz = Math.sin(theta) * Math.sin(phi);

        positions.push(nx * radius, ny * radius, nz * radius);
        normals.push(nx, ny, nz);
        uvs.push(u, 1 - v);
      }
    }

    for (let y = 0; y < rings; y++) {
      for (let x = 0; x < segments; x++) {
        const a = y * (segments + 1) + x;
        const b = a + segments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint16Array(indices),
    };
  }

  private generateCylinder(scale: [number, number, number]): GeometryData {
    const radius = scale[0] * 0.5;
    const height = scale[1];
    const segments = 24;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const halfHeight = height / 2;

    for (let y = 0; y <= 1; y++) {
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

    for (let x = 0; x < segments; x++) {
      const a = x;
      const b = x + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint16Array(indices),
    };
  }

  private generateCone(scale: [number, number, number]): GeometryData {
    return this.generateCylinder([0.001, scale[1], scale[2]]);
  }

  private generatePlane(scale: [number, number, number]): GeometryData {
    const [sx, , sz] = scale.map((s) => s * 0.5);

    const positions = new Float32Array([-sx, 0, -sz, sx, 0, -sz, sx, 0, sz, -sx, 0, sz]);
    const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

    return { positions, normals, uvs, indices };
  }

  private createAccessor(
    data: Float32Array | Uint16Array,
    type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4',
    computeBounds = false
  ): number {
    const byteOffset = this.bufferData.length;
    const componentType = data instanceof Uint16Array ? 5123 : 5126;

    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0; i < view.length; i++) {
      this.bufferData.push(view[i]);
    }

    while (this.bufferData.length % 4 !== 0) {
      this.bufferData.push(0);
    }

    const bufferViewIndex = this.bufferViews.length;
    this.bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: data.byteLength,
      target: componentType === 5126 ? 34962 : 34963,
    });

    const componentsPerElement =
      type === 'SCALAR' ? 1 : type === 'VEC2' ? 2 : type === 'VEC3' ? 3 : 4;
    const count = data.length / componentsPerElement;

    const accessor: GLTFAccessor = {
      bufferView: bufferViewIndex,
      componentType,
      count,
      type,
    };

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

    const index = this.accessors.length;
    this.accessors.push(accessor);
    return index;
  }

  // Utility methods
  private extractVec3(
    props: Record<string, unknown>,
    key: string,
    def: [number, number, number]
  ): [number, number, number] {
    const val = props[key];
    if (Array.isArray(val) && val.length >= 3) {
      return [Number(val[0]) || 0, Number(val[1]) || 0, Number(val[2]) || 0];
    }
    return def;
  }

  private extractColor(
    props: Record<string, unknown>,
    key: string,
    def: [number, number, number]
  ): [number, number, number] {
    const val = props[key];
    if (typeof val === 'string') {
      if (val.startsWith('#')) {
        const hex = val.slice(1);
        if (hex.length === 6) {
          return [
            parseInt(hex.slice(0, 2), 16) / 255,
            parseInt(hex.slice(2, 4), 16) / 255,
            parseInt(hex.slice(4, 6), 16) / 255,
          ];
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
      };
      return colors[val.toLowerCase()] || def;
    }
    if (Array.isArray(val) && val.length >= 3) {
      return [Number(val[0]) || 0, Number(val[1]) || 0, Number(val[2]) || 0];
    }
    return def;
  }

  private extractNumber(props: Record<string, unknown>, key: string, def: number): number {
    const val = props[key];
    return typeof val === 'number' ? val : def;
  }

  private eulerToQuaternion(euler: [number, number, number]): [number, number, number, number] {
    const x = (euler[0] * Math.PI) / 180 / 2;
    const y = (euler[1] * Math.PI) / 180 / 2;
    const z = (euler[2] * Math.PI) / 180 / 2;

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

  private propertyToPath(prop: string): string | null {
    const map: Record<string, string> = {
      position: 'translation',
      translation: 'translation',
      rotation: 'rotation',
      scale: 'scale',
    };
    return map[prop.toLowerCase()] || null;
  }
}

// =============================================================================
// GLB WRITER
// =============================================================================

function writeGLB(gltf: GLTFDocument, buffer: Uint8Array): Uint8Array {
  const jsonString = JSON.stringify(gltf);
  const jsonBuffer = new TextEncoder().encode(jsonString);

  const jsonPadding = (4 - (jsonBuffer.byteLength % 4)) % 4;
  const paddedJsonLength = jsonBuffer.byteLength + jsonPadding;

  const binPadding = (4 - (buffer.byteLength % 4)) % 4;
  const paddedBinLength = buffer.byteLength + binPadding;

  const totalSize = 12 + 8 + paddedJsonLength + 8 + paddedBinLength;

  const output = new ArrayBuffer(totalSize);
  const view = new DataView(output);
  const bytes = new Uint8Array(output);

  let offset = 0;

  // Header
  view.setUint32(offset, 0x46546c67, true);
  offset += 4;
  view.setUint32(offset, 2, true);
  offset += 4;
  view.setUint32(offset, totalSize, true);
  offset += 4;

  // JSON chunk
  view.setUint32(offset, paddedJsonLength, true);
  offset += 4;
  view.setUint32(offset, 0x4e4f534a, true);
  offset += 4;
  bytes.set(jsonBuffer, offset);
  offset += jsonBuffer.byteLength;
  for (let i = 0; i < jsonPadding; i++) {
    bytes[offset++] = 0x20;
  }

  // Binary chunk
  view.setUint32(offset, paddedBinLength, true);
  offset += 4;
  view.setUint32(offset, 0x004e4942, true);
  offset += 4;
  bytes.set(buffer, offset);
  offset += buffer.byteLength;
  for (let i = 0; i < binPadding; i++) {
    bytes[offset++] = 0x00;
  }

  return new Uint8Array(output);
}

// =============================================================================
// MAIN EXPORT FUNCTION
// =============================================================================

export async function exportGLTF(options: GLTFExportOptions): Promise<void> {
  const { input, output, format = 'glb', verbose = false } = options;

  // Read input file
  if (!fs.existsSync(input)) {
    throw new Error(`Input file not found: ${input}`);
  }

  const source = fs.readFileSync(input, 'utf-8');

  if (verbose) {
    console.log(`Reading: ${input}`);
  }

  // Parse
  const parser = new HoloParser();
  const composition = parser.parse(source);

  if (verbose) {
    console.log(`Parsed composition: ${composition.name}`);
    console.log(`  Objects: ${composition.objects.length}`);
    console.log(`  Timelines: ${composition.timelines.length}`);
  }

  // Build glTF
  const builder = new GLTFBuilder();
  const { gltf, buffer } = builder.build(composition);

  // Determine output path
  const ext = format === 'glb' ? '.glb' : '.gltf';
  const outputPath =
    output || path.join(path.dirname(input), path.basename(input, path.extname(input)) + ext);

  // Write output
  if (format === 'glb') {
    const glbData = writeGLB(gltf, buffer);
    fs.writeFileSync(outputPath, glbData);

    if (verbose) {
      console.log(`Wrote GLB: ${outputPath} (${glbData.byteLength} bytes)`);
    }
  } else {
    // Write .gltf JSON
    const _json = options.pretty ? JSON.stringify(gltf, null, 2) : JSON.stringify(gltf);
    gltf.buffers[0].uri = path.basename(outputPath, '.gltf') + '.bin';
    fs.writeFileSync(outputPath, JSON.stringify(gltf, null, options.pretty ? 2 : undefined));

    // Write .bin buffer
    const binPath = outputPath.replace(/\.gltf$/, '.bin');
    fs.writeFileSync(binPath, buffer);

    if (verbose) {
      console.log(`Wrote glTF: ${outputPath}`);
      console.log(`Wrote buffer: ${binPath} (${buffer.byteLength} bytes)`);
    }
  }

  console.log(`✓ Exported to ${outputPath}`);
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  let input = '';
  let output = '';
  let format: 'gltf' | 'glb' = 'glb';
  let verbose = false;
  let pretty = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-o' || arg === '--output') {
      output = args[++i];
    } else if (arg === '-f' || arg === '--format') {
      format = args[++i] as 'gltf' | 'glb';
    } else if (arg === '--format=gltf') {
      format = 'gltf';
    } else if (arg === '--format=glb') {
      format = 'glb';
    } else if (arg === '-v' || arg === '--verbose') {
      verbose = true;
    } else if (arg === '-p' || arg === '--pretty') {
      pretty = true;
    } else if (!arg.startsWith('-')) {
      input = arg;
    }
  }

  if (!input) {
    console.error('Usage: holo export [options] <input.holo>');
    console.error('Options:');
    console.error('  -o, --output <file>    Output file path');
    console.error('  -f, --format <format>  Output format: gltf or glb (default: glb)');
    console.error('  -v, --verbose          Verbose output');
    console.error('  -p, --pretty           Pretty-print JSON (gltf only)');
    process.exit(1);
  }

  exportGLTF({ input, output, format, verbose, pretty }).catch((err) => {
    console.error('Export failed:', err.message);
    process.exit(1);
  });
}
