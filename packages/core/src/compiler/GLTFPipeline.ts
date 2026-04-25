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
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import {
  compileDomainBlocks,
  compileMaterialBlock,
  materialToGLTF,
} from './DomainBlockCompilerMixin';
import {
  generateSplineGeometry,
  generateHullGeometry,
  generateMembraneGeometry,
  type GeometryData,
  type BlobDef,
} from './ProceduralGeometry';
import {
  createClearcoatExtension,
  createTransmissionExtension,
  createIORExtension,
  createSheenExtension,
  createAnisotropyExtension,
  createVolumeExtension,
  createIridescenceExtension,
  createEmissiveStrengthExtension,
  declareExtensions,
} from './gltf/extensions';
import { ASTNodePool } from './ObjectPool';

// OOM fix: Pre-allocation reduced from 10K to 0 (demand-allocated).
// Pool IS used (acquire in processObject) but 10K × ~80 bytes = ~800KB
// pre-allocated upfront was wasteful. Nodes created on-demand now.
const gltfNodePool = new ASTNodePool<GLTFNode>(
  () => ({ name: '' }),
  (node) => {
    node.name = '';
    node.translation = undefined;
    node.rotation = undefined;
    node.scale = undefined;
    node.mesh = undefined;
    node.skin = undefined;
    node.children = undefined;
    node.camera = undefined;
    node.extras = undefined;
  },
  0 // Was 10000 — demand-allocate instead of pre-allocating
);

// =============================================================================
// TYPES
// =============================================================================

export interface GLTFPipelineOptions {
  /** When set, adds `holoscript.provenanceHash` under `asset.extras` (Paper 10/12 bench). */
  provenanceHash?: string;
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
  /** Pre-loaded texture image data keyed by path/name (PNG or JPEG bytes) */
  textureData?: Record<string, Uint8Array>;
  /** Generator string for metadata */
  generator?: string;
  /** Copyright string */
  copyright?: string;
}

import type { GLTFExportResult, GLTFExportStats } from './CompilerTypes';
export type { GLTFExportResult, GLTFExportStats } from './CompilerTypes';

export interface GLTFNode {
  name: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number]; // quaternion
  scale?: [number, number, number];
  mesh?: number;
  skin?: number;
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

// =============================================================================
// PROCEDURAL SCALE TEXTURE GENERATOR
// =============================================================================

/**
 * Generate a hexagonal dragon-scale pattern as RGBA pixel data.
 * Each scale is a rounded hexagon cell with a dark border and lighter center.
 */
export function generateScaleTexture(
  size: number = 512,
  baseColor: [number, number, number] = [30, 15, 61], // #1e0f3d
  borderColor: [number, number, number] = [20, 12, 40], // softer — less contrast
  highlightColor: [number, number, number] = [70, 50, 120]
): Uint8Array {
  const data = new Uint8Array(size * size * 4);

  const scaleSize = size / 16;
  const hexH = scaleSize;
  const hexW = scaleSize * Math.sqrt(3);

  // Simple hash for per-scale color jitter
  function scaleHash(row: number, col: number): number {
    let h = (row * 73856093) ^ (col * 19349663);
    h = ((h >> 16) ^ h) * 0x45d9f3b;
    h = ((h >> 16) ^ h) * 0x45d9f3b;
    return ((h >> 16) ^ h) & 0xff;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / (hexH * 0.75));
      const isOddRow = row % 2 === 1;
      const xOff = isOddRow ? hexW * 0.5 : 0;
      const col = Math.floor((x + xOff) / hexW);

      const cx = col * hexW - xOff + hexW * 0.5;
      const cy = row * hexH * 0.75 + hexH * 0.5;

      const dx = (x - cx) / (hexW * 0.5);
      const dy = (y - cy) / (hexH * 0.5);

      const q = Math.abs(dx);
      const r = Math.abs(dy);
      const hexDist = Math.max(q, (q + r * Math.sqrt(3)) / 2);

      // Per-scale color variation: wider jitter range for organic feel
      const jitter = (scaleHash(row, col) / 255 - 0.5) * 40;
      const jR = Math.round(jitter * 0.4);
      const jG = Math.round(jitter * 0.3);
      const jB = Math.round(jitter * 0.6);

      const idx = (y * size + x) * 4;

      if (hexDist > 0.94) {
        // Narrow groove — thin line between scales, not a thick border
        data[idx] = Math.max(0, borderColor[0] + jR);
        data[idx + 1] = Math.max(0, borderColor[1] + jG);
        data[idx + 2] = Math.max(0, borderColor[2] + jB);
        data[idx + 3] = 255;
      } else if (hexDist < 0.12) {
        // Specular highlight — bright dot at center of each scale
        const t = hexDist / 0.12;
        const specR = 100,
          specG = 80,
          specB = 160;
        data[idx] = Math.min(255, Math.round(specR * (1 - t) + highlightColor[0] * t) + jR);
        data[idx + 1] = Math.min(255, Math.round(specG * (1 - t) + highlightColor[1] * t) + jG);
        data[idx + 2] = Math.min(255, Math.round(specB * (1 - t) + highlightColor[2] * t) + jB);
        data[idx + 3] = 255;
      } else if (hexDist < 0.35) {
        // Highlight zone — raised center of scale
        const t = (hexDist - 0.12) / 0.23;
        data[idx] = Math.min(255, Math.round(highlightColor[0] * (1 - t) + baseColor[0] * t) + jR);
        data[idx + 1] = Math.min(
          255,
          Math.round(highlightColor[1] * (1 - t) + baseColor[1] * t) + jG
        );
        data[idx + 2] = Math.min(
          255,
          Math.round(highlightColor[2] * (1 - t) + baseColor[2] * t) + jB
        );
        data[idx + 3] = 255;
      } else {
        // Mid-scale — smooth gradient, mostly base color
        const t = (hexDist - 0.35) / 0.59;
        data[idx] = Math.max(
          0,
          Math.min(255, Math.round(baseColor[0] * (1 - t * 0.3) + borderColor[0] * (t * 0.3)) + jR)
        );
        data[idx + 1] = Math.max(
          0,
          Math.min(255, Math.round(baseColor[1] * (1 - t * 0.3) + borderColor[1] * (t * 0.3)) + jG)
        );
        data[idx + 2] = Math.max(
          0,
          Math.min(255, Math.round(baseColor[2] * (1 - t * 0.3) + borderColor[2] * (t * 0.3)) + jB)
        );
        data[idx + 3] = 255;
      }
    }
  }

  return data;
}

/**
 * Generate a tangent-space normal map for hexagonal scales.
 * Encodes raised scale centers and grooved borders into RGB normals.
 * R = tangent X, G = tangent Y, B = normal Z (all [0-255] mapping to [-1,1])
 */
export function generateScaleNormalMap(size: number = 512): Uint8Array {
  const data = new Uint8Array(size * size * 4);

  const scaleSize = size / 16;
  const hexH = scaleSize;
  const hexW = scaleSize * Math.sqrt(3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / (hexH * 0.75));
      const isOddRow = row % 2 === 1;
      const xOff = isOddRow ? hexW * 0.5 : 0;
      const col = Math.floor((x + xOff) / hexW);

      const cx = col * hexW - xOff + hexW * 0.5;
      const cy = row * hexH * 0.75 + hexH * 0.5;

      const dx = (x - cx) / (hexW * 0.5);
      const dy = (y - cy) / (hexH * 0.5);

      const q = Math.abs(dx);
      const r = Math.abs(dy);
      const hexDist = Math.max(q, (q + r * Math.sqrt(3)) / 2);

      const idx = (y * size + x) * 4;

      let nx = 0,
        ny = 0,
        nz = 1;

      if (hexDist > 0.92 && hexDist < 1.0) {
        // Narrow groove — moderate deflection (not overpowering)
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const strength = 0.55;
        nx = (dx / len) * strength;
        ny = (dy / len) * strength;
        nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      } else if (hexDist < 0.5) {
        // Smooth dome — gentle curvature across most of the scale face
        const strength = 0.25;
        nx = -dx * strength;
        ny = -dy * strength;
        nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      }

      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  return data;
}

/**
 * Minimal PNG encoder — creates an uncompressed PNG from RGBA pixel data.
 * Uses zlib deflate via Node.js or falls back to stored blocks.
 */
function encodePNG(pixels: Uint8Array, width: number, height: number): Uint8Array {
  // Build IDAT raw data: each row is [filter_byte=0, ...pixels]
  const rowSize = width * 4 + 1;
  const rawData = new Uint8Array(rowSize * height);
  for (let y = 0; y < height; y++) {
    rawData[y * rowSize] = 0; // No filter
    rawData.set(pixels.slice(y * width * 4, (y + 1) * width * 4), y * rowSize + 1);
  }

  // Manual deflate stored blocks (no compression, max portability)
  const deflated = deflateStored(rawData);

  // CRC32 table
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  function crc32(buf: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeChunk(type: string, data: Uint8Array): Uint8Array {
    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, data.length);
    // Type
    for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
    // Data
    chunk.set(data, 8);
    // CRC (over type + data)
    const crcInput = new Uint8Array(4 + data.length);
    crcInput.set(chunk.slice(4, 8));
    crcInput.set(data, 4);
    dv.setUint32(8 + data.length, crc32(crcInput));
    return chunk;
  }

  // PNG signature
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk: 13 bytes
  const ihdr = new Uint8Array(13);
  const ihdrDV = new DataView(ihdr.buffer);
  ihdrDV.setUint32(0, width);
  ihdrDV.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = writeChunk('IHDR', ihdr);

  // IDAT chunk
  const idatChunk = writeChunk('IDAT', deflated);

  // IEND chunk
  const iendChunk = writeChunk('IEND', new Uint8Array(0));

  // Assemble PNG
  const png = new Uint8Array(
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length
  );
  let offset = 0;
  png.set(signature, offset);
  offset += signature.length;
  png.set(ihdrChunk, offset);
  offset += ihdrChunk.length;
  png.set(idatChunk, offset);
  offset += idatChunk.length;
  png.set(iendChunk, offset);

  return png;
}

// =============================================================================
// LOD DECIMATION — Vertex clustering for level-of-detail generation
// =============================================================================

/**
 * Decimate geometry by vertex clustering.
 * Merges vertices within a grid cell, reducing triangle count by ~ratio.
 * @param geometry Source geometry data
 * @param ratio Target reduction ratio (0.5 = half the triangles)
 */
function decimateGeometry(geometry: GeometryData, ratio: number): GeometryData {
  const cellSize = Math.max(0.01, (1 - ratio) * 0.3); // larger cells = more reduction
  const positions = geometry.positions;
  const normals = geometry.normals;
  const uvs = geometry.uvs;
  const indices = geometry.indices;

  const vertCount = positions.length / 3;

  // Map each vertex to a grid cell, cluster them
  const cellMap = new Map<string, number>(); // cellKey → new vertex index
  const remap = new Int32Array(vertCount); // old index → new index
  const newPositions: number[] = [];
  const newNormals: number[] = [];
  const newUVs: number[] = [];
  let newIdx = 0;

  for (let i = 0; i < vertCount; i++) {
    const px = positions[i * 3],
      py = positions[i * 3 + 1],
      pz = positions[i * 3 + 2];
    const cx = Math.round(px / cellSize),
      cy = Math.round(py / cellSize),
      cz = Math.round(pz / cellSize);
    const key = `${cx},${cy},${cz}`;

    if (cellMap.has(key)) {
      remap[i] = cellMap.get(key)!;
    } else {
      cellMap.set(key, newIdx);
      remap[i] = newIdx;
      newPositions.push(px, py, pz);
      newNormals.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
      newUVs.push(uvs[i * 2], uvs[i * 2 + 1]);
      newIdx++;
    }
  }

  // Rebuild indices, skip degenerate triangles
  const newIndices: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = remap[indices[i]],
      b = remap[indices[i + 1]],
      c = remap[indices[i + 2]];
    if (a !== b && b !== c && a !== c) {
      newIndices.push(a, b, c);
    }
  }

  const newVertexCount = newPositions.length / 3;
  const IndexArrayType = newVertexCount > 65535 ? Uint32Array : Uint16Array;

  return {
    positions: new Float32Array(newPositions),
    normals: new Float32Array(newNormals),
    uvs: new Float32Array(newUVs),
    indices: new IndexArrayType(newIndices),
  };
}

// =============================================================================
// SKELETON / ARMATURE TYPES
// =============================================================================

/** Bone definition for skeletal animation */
interface BoneDef {
  name: string;
  position: [number, number, number];
  parent?: string;
  children?: string[];
}

/** Dragon skeleton with predefined bone hierarchy */
const DRAGON_SKELETON: BoneDef[] = [
  { name: 'Root', position: [0, 2.5, 0] },
  { name: 'Spine', position: [0, 2.5, 0], parent: 'Root' },
  { name: 'Neck', position: [0, 3.5, 2.0], parent: 'Spine' },
  { name: 'Head', position: [0, 4.5, 4.2], parent: 'Neck' },
  { name: 'Jaw', position: [0, 4.2, 4.6], parent: 'Head' },
  { name: 'Tail1', position: [0, 2.2, -2.0], parent: 'Spine' },
  { name: 'Tail2', position: [0, 1.0, -3.5], parent: 'Tail1' },
  { name: 'TailTip', position: [0, -0.05, -4.6], parent: 'Tail2' },
  { name: 'LeftWing', position: [-1.2, 3.0, 0.2], parent: 'Spine' },
  { name: 'LeftWingTip', position: [-2.6, 3.8, 0.2], parent: 'LeftWing' },
  { name: 'RightWing', position: [1.2, 3.0, 0.2], parent: 'Spine' },
  { name: 'RightWingTip', position: [2.6, 3.8, 0.2], parent: 'RightWing' },
  { name: 'LeftFrontLeg', position: [-0.9, 1.6, 1.2], parent: 'Spine' },
  { name: 'LeftFrontFoot', position: [-0.95, 0.15, 1.4], parent: 'LeftFrontLeg' },
  { name: 'RightFrontLeg', position: [0.9, 1.6, 1.2], parent: 'Spine' },
  { name: 'RightFrontFoot', position: [0.95, 0.15, 1.4], parent: 'RightFrontLeg' },
  { name: 'LeftBackLeg', position: [-0.9, 1.5, -1.0], parent: 'Spine' },
  { name: 'LeftBackFoot', position: [-0.95, 0.1, -1.15], parent: 'LeftBackLeg' },
  { name: 'RightBackLeg', position: [0.9, 1.5, -1.0], parent: 'Spine' },
  { name: 'RightBackFoot', position: [0.95, 0.1, -1.15], parent: 'RightBackLeg' },
];

/**
 * Deflate with stored blocks only (no compression).
 * Wraps raw data in zlib-compatible format: CMF + FLG + stored blocks + Adler32.
 */
function deflateStored(data: Uint8Array): Uint8Array {
  const BLOCK_MAX = 0xffff;
  const numBlocks = Math.ceil(data.length / BLOCK_MAX) || 1;

  // Calculate output size: 2 (zlib header) + blocks + 4 (adler32)
  let size = 2 + 4;
  for (let i = 0; i < numBlocks; i++) {
    size += 5; // block header (1 + 2 + 2)
    const blockLen = Math.min(BLOCK_MAX, data.length - i * BLOCK_MAX);
    size += blockLen;
  }

  const out = new Uint8Array(size);
  let pos = 0;

  // Zlib header: CMF=8 (deflate, window=0), FLG=29 (check bits)
  out[pos++] = 0x78;
  out[pos++] = 0x01;

  // Stored blocks
  for (let i = 0; i < numBlocks; i++) {
    const blockStart = i * BLOCK_MAX;
    const blockLen = Math.min(BLOCK_MAX, data.length - blockStart);
    const isLast = i === numBlocks - 1;

    out[pos++] = isLast ? 0x01 : 0x00; // BFINAL + BTYPE=00(stored)
    out[pos++] = blockLen & 0xff;
    out[pos++] = (blockLen >> 8) & 0xff;
    out[pos++] = ~blockLen & 0xff;
    out[pos++] = (~blockLen >> 8) & 0xff;

    out.set(data.slice(blockStart, blockStart + blockLen), pos);
    pos += blockLen;
  }

  // Adler32 checksum
  let a = 1,
    b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  const adler = ((b << 16) | a) >>> 0;
  out[pos++] = (adler >> 24) & 0xff;
  out[pos++] = (adler >> 16) & 0xff;
  out[pos++] = (adler >> 8) & 0xff;
  out[pos++] = adler & 0xff;

  return out;
}

// Advanced geometry types that need more than just scale
const ADVANCED_GEOMETRY_TYPES = new Set(['spline', 'membrane', 'hull', 'blob', 'metaball']);

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
  const sx = scale[0] * 0.5;
  const sy = scale[1] * 0.5;
  const sz = scale[2] * 0.5;
  const segments = 32;
  const rings = 24;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Generate vertices — anisotropic scaling for organic shapes
  for (let y = 0; y <= rings; y++) {
    const v = y / rings;
    const theta = v * Math.PI;

    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const phi = u * Math.PI * 2;

      const nx = Math.sin(theta) * Math.cos(phi);
      const ny = Math.cos(theta);
      const nz = Math.sin(theta) * Math.sin(phi);

      positions.push(nx * sx);
      positions.push(ny * sy);
      positions.push(nz * sz);

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
  const segments = 32;

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

// Shared compilation buffer — starts at 1MB, grows as needed.
// Reused across synchronous compilation runs. Shrinks back after large builds
// to prevent unbounded memory growth (see post-compile shrink in compile()).
const INITIAL_COMPILE_BUFFER_SIZE = 1024 * 1024; // 1MB
const MAX_RETAINED_BUFFER_SIZE = 1024 * 1024 * 20; // 20MB — shrink back above this
let SHARED_COMPILE_BUFFER: Uint8Array = new Uint8Array(INITIAL_COMPILE_BUFFER_SIZE);

export class GLTFPipeline extends CompilerBase {
  protected readonly compilerName = 'GLTFPipeline';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.GLTF;
  }

  private options: Required<GLTFPipelineOptions>;
  private compositor: TraitCompositor;

  private get bufferData() {
    return SHARED_COMPILE_BUFFER;
  }
  private set bufferData(v: Uint8Array) {
    SHARED_COMPILE_BUFFER = v;
  }
  private bufferByteLength: number = 0;

  private ensureBufferCapacity(needed: number): void {
    if (this.bufferByteLength + needed > this.bufferData.length) {
      const newLen = Math.max(this.bufferData.length * 2, this.bufferByteLength + needed);
      const newArr = new Uint8Array(newLen);
      newArr.set(this.bufferData.subarray(0, this.bufferByteLength));
      this.bufferData = newArr;
    }
  }

  private appendToBuffer(data: Uint8Array): void {
    this.ensureBufferCapacity(data.length);
    this.bufferData.set(data, this.bufferByteLength);
    this.bufferByteLength += data.length;
  }

  private padBuffer(alignment: number): void {
    const remainder = this.bufferByteLength % alignment;
    if (remainder !== 0) {
      const padding = alignment - remainder;
      this.ensureBufferCapacity(padding);
      this.bufferByteLength += padding;
    }
  }

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
  private images: Array<{ bufferView: number; mimeType: string }> = [];
  private textures: Array<{ source: number; sampler: number }> = [];
  private samplers: Array<{ magFilter: number; minFilter: number; wrapS: number; wrapT: number }> =
    [];
  private scaleTextureIndex: number = -1;
  private scaleNormalTextureIndex: number = -1;
  private textureIndexMap: Map<string, number> = new Map();

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
      provenanceHash: options.provenanceHash ?? '',
      format: options.format ?? 'glb',
      dracoCompression: options.dracoCompression ?? false,
      quantize: options.quantize ?? true,
      prune: options.prune ?? true,
      dedupe: options.dedupe ?? true,
      embedTextures: options.embedTextures ?? true,
      textureData: options.textureData ?? {},
      generator: options.generator ?? 'HoloScript GLTFPipeline v1.0.0',
      copyright: options.copyright ?? '',
    };
    this.compositor = new TraitCompositor();
  }

  /**
   * Global smooth normals pass.
   * Finds vertices at the same 3D position across all meshes and averages
   * their normals. This eliminates hard seams where separate meshes meet
   * (e.g., neck spline meets the head sphere).
   */
  private smoothNormalsGlobal(): void {
    // tolerance for position matching (in world units)
    const QUANT = 100; // 0.01 precision

    // Collect all (position → normal) entries with buffer write-back locations
    type NormalEntry = { nx: number; ny: number; nz: number; byteOffset: number };
    const posMap = new Map<string, NormalEntry[]>();

    for (const mesh of this.meshes) {
      for (const prim of mesh.primitives) {
        const posIdx = prim.attributes.POSITION;
        const nrmIdx = prim.attributes.NORMAL;
        if (posIdx === undefined || nrmIdx === undefined) continue;

        const posAcc = this.accessors[posIdx];
        const nrmAcc = this.accessors[nrmIdx];
        if (!posAcc || !nrmAcc) continue;

        const posBV = this.bufferViews[posAcc.bufferView];
        const nrmBV = this.bufferViews[nrmAcc.bufferView];
        if (!posBV || !nrmBV) continue;

        const count = posAcc.count;

        for (let i = 0; i < count; i++) {
          // Read position from buffer
          const pOff = posBV.byteOffset + i * 12; // 3 floats * 4 bytes
          const px = this.readFloat32(pOff);
          const py = this.readFloat32(pOff + 4);
          const pz = this.readFloat32(pOff + 8);

          // Read normal from buffer
          const nOff = nrmBV.byteOffset + i * 12;
          const nx = this.readFloat32(nOff);
          const ny = this.readFloat32(nOff + 4);
          const nz = this.readFloat32(nOff + 8);

          // Quantized position key
          const key = `${Math.round(px * QUANT)},${Math.round(py * QUANT)},${Math.round(pz * QUANT)}`;

          let entries = posMap.get(key);
          if (!entries) {
            entries = [];
            posMap.set(key, entries);
          }
          entries.push({ nx, ny, nz, byteOffset: nOff });
        }
      }
    }

    // Average normals at shared positions and write back
    for (const entries of posMap.values()) {
      if (entries.length < 2) continue; // nothing to smooth

      // Compute average normal
      let ax = 0,
        ay = 0,
        az = 0;
      for (const e of entries) {
        ax += e.nx;
        ay += e.ny;
        az += e.nz;
      }
      const len = Math.sqrt(ax * ax + ay * ay + az * az);
      if (len < 1e-8) continue;
      ax /= len;
      ay /= len;
      az /= len;

      // Write back to all entries
      for (const e of entries) {
        this.writeFloat32(e.byteOffset, ax);
        this.writeFloat32(e.byteOffset + 4, ay);
        this.writeFloat32(e.byteOffset + 8, az);
      }
    }
  }

  /** Read a Float32 from the buffer at byteOffset */
  private readFloat32(byteOffset: number): number {
    const bytes = new Uint8Array(4);
    bytes.set(this.bufferData.subarray(byteOffset, byteOffset + 4));
    return new Float32Array(bytes.buffer)[0];
  }

  /** Write a Float32 to the buffer at byteOffset */
  private writeFloat32(byteOffset: number, value: number): void {
    const f32 = new Float32Array([value]);
    const view = new Uint8Array(f32.buffer);
    this.bufferData.set(view, byteOffset);
  }

  /**
   * Generate LOD meshes for the MSFT_lod extension.
   * Creates 2 lower detail levels (50% and 25%) per mesh.
   */
  private generateLODs(): void {
    const ratios = [0.5, 0.25]; // LOD1 = 50%, LOD2 = 25%
    const originalCount = this.meshes.length;

    // LOD coverage thresholds (screen coverage at which to switch)
    const coverages: number[] = [];

    for (let mi = 0; mi < originalCount; mi++) {
      const mesh = this.meshes[mi];
      const lodIds: number[] = [];

      for (const ratio of ratios) {
        for (const prim of mesh.primitives) {
          const posIdx = prim.attributes.POSITION;
          const nrmIdx = prim.attributes.NORMAL;
          const uvIdx = prim.attributes.TEXCOORD_0;
          const idxIdx = prim.indices;
          if (posIdx === undefined || nrmIdx === undefined || idxIdx === undefined) continue;

          const posAcc = this.accessors[posIdx];
          const nrmAcc = this.accessors[nrmIdx];
          const idxAcc = this.accessors[idxIdx];
          if (!posAcc || !nrmAcc || !idxAcc) continue;

          // Read geometry data from buffer
          const posBV = this.bufferViews[posAcc.bufferView];
          const nrmBV = this.bufferViews[nrmAcc.bufferView];
          const idxBV = this.bufferViews[idxAcc.bufferView];
          if (!posBV || !nrmBV || !idxBV) continue;

          const vCount = posAcc.count;
          const iCount = idxAcc.count;

          const positions = new Float32Array(vCount * 3);
          const normals = new Float32Array(vCount * 3);
          const uvs = new Float32Array(vCount * 2);
          const indices = new Uint16Array(iCount);

          for (let i = 0; i < vCount * 3; i++) {
            positions[i] = this.readFloat32(posBV.byteOffset + i * 4);
            normals[i] = this.readFloat32(nrmBV.byteOffset + i * 4);
          }

          // Read UVs if present
          if (uvIdx !== undefined) {
            const uvAcc = this.accessors[uvIdx];
            const uvBV = uvAcc ? this.bufferViews[uvAcc.bufferView] : null;
            if (uvBV) {
              for (let i = 0; i < vCount * 2; i++) {
                uvs[i] = this.readFloat32(uvBV.byteOffset + i * 4);
              }
            }
          }

          // Read indices
          const compSize = idxAcc.componentType === 5123 ? 2 : 4;
          for (let i = 0; i < iCount; i++) {
            const off = idxBV.byteOffset + i * compSize;
            if (compSize === 2) {
              indices[i] = this.bufferData[off] | (this.bufferData[off + 1] << 8);
            } else {
              indices[i] = this.readFloat32(off); // uint32 — rare for our use
            }
          }

          const geom: GeometryData = { positions, normals, uvs, indices };
          const decimated = decimateGeometry(geom, ratio);

          // Write decimated mesh
          const lodMeshIndex = this.meshes.length;
          const lodPrim: GLTFPrimitive = { attributes: {}, material: prim.material };
          lodPrim.attributes.POSITION = this.createAccessor(decimated.positions, 'VEC3', true);
          lodPrim.attributes.NORMAL = this.createAccessor(decimated.normals, 'VEC3');
          lodPrim.attributes.TEXCOORD_0 = this.createAccessor(decimated.uvs, 'VEC2');
          lodPrim.indices = this.createAccessor(decimated.indices, 'SCALAR');

          this.meshes.push({ name: `LOD${ratio}_mesh${mi}`, primitives: [lodPrim] } as GLTFMesh);
          lodIds.push(lodMeshIndex);
        }
      }

      if (lodIds.length > 0) {
        // Store LOD mesh IDs on the original mesh as extension data
        (mesh as unknown as Record<string, unknown>)['extensions'] = {
          MSFT_lod: { ids: lodIds },
        };
        coverages.push(0.5, 0.2); // switch at 50% and 20% screen coverage
      }
    }

    // Store LOD extension metadata for buildDocument
    if (coverages.length > 0) {
      this._lodCoverages = coverages;
    }
  }

  private _lodCoverages: number[] | null = null;

  /**
   * Build skeleton hierarchy and embed as glTF skin.
   * Creates 20 joint nodes with inverse bind matrices.
   */
  private buildSkeleton(): void {
    const bones = DRAGON_SKELETON;
    const boneNameToIdx = new Map<string, number>();

    // Create joint nodes (appended after scene nodes)
    const jointStartIndex = this.nodes.length;
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i];
      const nodeIdx = this.nodes.length;
      boneNameToIdx.set(bone.name, nodeIdx);

      const node: Record<string, unknown> = {
        name: `Joint_${bone.name}`,
        translation: bone.position,
      };

      this.nodes.push(node as unknown as GLTFNode);
    }

    // Set parent-child relationships
    for (const bone of bones) {
      if (bone.parent) {
        const parentIdx = boneNameToIdx.get(bone.parent);
        const childIdx = boneNameToIdx.get(bone.name);
        if (parentIdx !== undefined && childIdx !== undefined) {
          const parentNode = this.nodes[parentIdx] as unknown as Record<string, unknown>;
          if (!parentNode.children) parentNode.children = [];
          (parentNode.children as number[]).push(childIdx);
        }
      }
    }

    // Generate inverse bind matrices (4x4 identity with negative translation)
    const ibmData = new Float32Array(bones.length * 16);
    for (let i = 0; i < bones.length; i++) {
      const p = bones[i].position;
      const off = i * 16;
      // Identity matrix with inverse translation
      ibmData[off + 0] = 1;
      ibmData[off + 5] = 1;
      ibmData[off + 10] = 1;
      ibmData[off + 15] = 1;
      ibmData[off + 12] = -p[0];
      ibmData[off + 13] = -p[1];
      ibmData[off + 14] = -p[2];
    }

    const ibmAccessor = this.createAccessorRaw(ibmData, 'MAT4', 5126);

    // Build joints array
    const joints: number[] = [];
    for (let i = 0; i < bones.length; i++) {
      joints.push(jointStartIndex + i);
    }

    // Create skin
    this._skins = [
      {
        skeleton: jointStartIndex,
        joints,
        inverseBindMatrices: ibmAccessor,
      },
    ];

    // Store joint index offset so skinMeshes can reference bone indices correctly
    this._jointStartIndex = jointStartIndex;
  }

  private _skins: Array<{
    skeleton: number;
    joints: number[];
    inverseBindMatrices: number;
  }> | null = null;
  private _jointStartIndex = 0;

  /**
   * Skin all mesh nodes to the skeleton.
   * For each vertex, finds the 4 nearest bones by distance and assigns
   * normalized inverse-distance weights. Writes JOINTS_0 (Uint8) and
   * WEIGHTS_0 (Float32) attributes into each mesh primitive.
   */
  private skinMeshes(): void {
    if (!this._skins || this._skins.length === 0) return;

    const bones = DRAGON_SKELETON;
    const bonePositions = bones.map((b) => b.position);

    // Determine how many nodes existed before LOD generation added extra meshes.
    // We only skin original mesh nodes, not LOD copies.
    const originalNodeCount = this._jointStartIndex; // joints were appended right after original nodes

    for (let ni = 0; ni < originalNodeCount; ni++) {
      const node = this.nodes[ni];
      if (node.mesh === undefined) continue;

      const mesh = this.meshes[node.mesh];
      if (!mesh) continue;

      for (const prim of mesh.primitives) {
        const posIdx = prim.attributes.POSITION;
        if (posIdx === undefined) continue;

        const posAcc = this.accessors[posIdx];
        if (!posAcc) continue;

        const posBV = this.bufferViews[posAcc.bufferView];
        if (!posBV) continue;

        const vCount = posAcc.count;
        if (vCount === 0) continue;

        // Node's world-space translation offset
        const tx = node.translation ? node.translation[0] : 0;
        const ty = node.translation ? node.translation[1] : 0;
        const tz = node.translation ? node.translation[2] : 0;

        // Allocate skinning buffers: 4 influences per vertex
        const jointsData = new Uint8Array(vCount * 4);
        const weightsData = new Float32Array(vCount * 4);

        for (let vi = 0; vi < vCount; vi++) {
          // Read vertex position from buffer
          const pOff = posBV.byteOffset + vi * 12;
          const vx = this.readFloat32(pOff) + tx;
          const vy = this.readFloat32(pOff + 4) + ty;
          const vz = this.readFloat32(pOff + 8) + tz;

          // Find 4 nearest bones by squared distance
          const distances: Array<{ boneIdx: number; distSq: number }> = [];
          for (let bi = 0; bi < bonePositions.length; bi++) {
            const bp = bonePositions[bi];
            const dx = vx - bp[0],
              dy = vy - bp[1],
              dz = vz - bp[2];
            distances.push({ boneIdx: bi, distSq: dx * dx + dy * dy + dz * dz });
          }

          // Sort by distance ascending, take top 4
          distances.sort((a, b) => a.distSq - b.distSq);
          const top4 = distances.slice(0, 4);

          // Compute inverse-distance weights
          let totalWeight = 0;
          const rawWeights: number[] = [];
          for (const d of top4) {
            // Avoid division by zero — if vertex is exactly on a bone
            const w = 1.0 / (d.distSq + 0.0001);
            rawWeights.push(w);
            totalWeight += w;
          }

          // Normalize weights to sum to 1.0
          const off = vi * 4;
          for (let j = 0; j < 4; j++) {
            if (j < top4.length) {
              jointsData[off + j] = top4[j].boneIdx;
              weightsData[off + j] = rawWeights[j] / totalWeight;
            } else {
              jointsData[off + j] = 0;
              weightsData[off + j] = 0;
            }
          }
        }

        // Create JOINTS_0 accessor (component type 5121 = UNSIGNED_BYTE)
        prim.attributes.JOINTS_0 = this.createAccessorRaw(jointsData, 'VEC4', 5121);

        // Create WEIGHTS_0 accessor
        prim.attributes.WEIGHTS_0 = this.createAccessor(weightsData, 'VEC4');
      }
    }

    // NOTE: We intentionally do NOT set node.skin on any mesh node.
    // The glTF skins[] array holds the skeleton definition (joints + IBM),
    // and mesh primitives carry JOINTS_0 + WEIGHTS_0 attributes.
    // External tools (Blender, Unity, Unreal) import and rebind automatically.
    // Setting node.skin would make Three.js create SkinnedMesh objects that
    // apply skeletal transforms at runtime, distorting the rest-pose geometry.
  }

  /**
   * Compile a HoloScript composition to glTF format
   */
  compile(composition: HoloComposition, agentToken: string, outputPath?: string): GLTFExportResult {
    this.validateCompilerAccess(agentToken, outputPath);
    this.reset();

    // Build glTF structure
    this.processComposition(composition);

    // Post-process: smooth normals across adjacent meshes
    this.smoothNormalsGlobal();

    // Generate LOD meshes
    this.generateLODs();

    // Build skeleton/armature
    this.buildSkeleton();

    // Skin meshes to skeleton (bind vertices to nearest bones)
    this.skinMeshes();

    // Create buffer
    const buffer = this.bufferData.slice(0, this.bufferByteLength);

    // OOM fix: shrink the shared buffer back if it grew beyond retention limit.
    // Prevents unbounded memory growth across repeated compilations (e.g. dragon
    // models that temporarily need 50MB+ aren't retained forever).
    if (SHARED_COMPILE_BUFFER.length > MAX_RETAINED_BUFFER_SIZE) {
      SHARED_COMPILE_BUFFER = new Uint8Array(INITIAL_COMPILE_BUFFER_SIZE);
    }

    // Build glTF document with semantic metadata
    const gltf = this.buildDocument(composition, buffer.byteLength);

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
    this.bufferByteLength = 0;
    this.accessors = [];
    this.bufferViews = [];
    this.meshes = [];
    this.materials = [];
    this.nodes = [];
    this.scenes = [];
    this.animations = [];
    this.materialMap.clear();
    this.images = [];
    this.textures = [];
    this.samplers = [];
    this.scaleTextureIndex = -1;
    this.scaleNormalTextureIndex = -1;
    this.textureIndexMap.clear();
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
    const domainBlocks = composition.domainBlocks ?? [];
    if (domainBlocks.length > 0) {
      compileDomainBlocks(
        domainBlocks,
        {
          material: (block) => {
            const mat = compileMaterialBlock(block);
            const gltfMat = materialToGLTF(mat);
            this.materials.push(gltfMat as GLTFMaterial);
            this.stats.materialCount++;
            return '';
          },
        },
        () => ''
      );
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
    } else if (ADVANCED_GEOMETRY_TYPES.has(shapeType)) {
      meshIndex = this.createAdvancedMesh(object.name, shapeType, scale, object);
    }

    // Create node from pool
    const node = gltfNodePool.acquire();
    node.name = object.name || `node_${this.nodes.length}`;
    node.translation = position;
    node.rotation = this.eulerToQuaternion(rotation);
    node.scale = [1, 1, 1]; // Scale is baked into geometry

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

    const node = gltfNodePool.acquire();
    node.name = group.name || `group_${this.nodes.length}`;
    node.translation = position;
    if (childIndices.length > 0) {
      node.children = childIndices;
    }

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

    // Create or get material (trait-aware, with geometry type for texture selection)
    const materialIndex = this.getOrCreateMaterial(object, shapeType);

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
   * Create an advanced mesh (spline, membrane, hull/metaball).
   * These geometry types need additional properties beyond scale.
   */
  private createAdvancedMesh(
    name: string,
    shapeType: string,
    scale: [number, number, number],
    object: HoloObjectDecl
  ): number {
    let geometry: GeometryData;

    switch (shapeType) {
      case 'spline': {
        // Extract control points and radii
        const pointsProp = this.findProp(object, 'points');
        const radiiProp = this.findProp(object, 'radii');
        const segmentsProp = this.findProp(object, 'segments');
        const stepsProp = this.findProp(object, 'steps');

        const points = this.extractNestedArray(pointsProp, 3);
        const radii = Array.isArray(radiiProp) ? (radiiProp as number[]).map(Number) : [0.1];

        // Fill radii to match points length
        while (radii.length < points.length) {
          radii.push(radii[radii.length - 1] ?? 0.1);
        }

        const radialSegments = typeof segmentsProp === 'number' ? segmentsProp : 24;
        const lengthSteps = typeof stepsProp === 'number' ? stepsProp : 8;

        geometry = generateSplineGeometry(points, radii, radialSegments, lengthSteps);
        break;
      }

      case 'membrane': {
        // Extract anchor points
        const anchorsProp = this.findProp(object, 'anchors');
        const subdivisionsProp = this.findProp(object, 'subdivisions');
        const bulgeProp = this.findProp(object, 'bulge');

        const anchors = this.extractNestedArray(anchorsProp, 3);
        const subdivisions = typeof subdivisionsProp === 'number' ? subdivisionsProp : 8;
        const bulge = typeof bulgeProp === 'number' ? bulgeProp : 0.15;

        geometry = generateMembraneGeometry(anchors, subdivisions, bulge);
        break;
      }

      case 'hull':
      case 'blob':
      case 'metaball': {
        // Extract blob definitions
        const blobsProp = this.findProp(object, 'blobs');
        const resolutionProp = this.findProp(object, 'resolution');
        const thresholdProp = this.findProp(object, 'threshold');

        const blobs: Array<{ center: number[]; radius: number[] }> = [];
        if (Array.isArray(blobsProp)) {
          for (const blobItem of blobsProp as unknown[]) {
            if (blobItem && typeof blobItem === 'object') {
              const b = blobItem as Record<string, unknown>;
              const center = Array.isArray(b.center)
                ? (b.center as number[]).map(Number)
                : [0, 0, 0];
              const radius = Array.isArray(b.radius)
                ? (b.radius as number[]).map(Number)
                : [0.5, 0.5, 0.5];
              blobs.push({ center, radius });
            }
          }
        }

        // Fallback: if no blobs, create a single blob from scale
        if (blobs.length === 0) {
          blobs.push({
            center: [0, 0, 0],
            radius: [scale[0] * 0.5, scale[1] * 0.5, scale[2] * 0.5],
          });
        }

        const resolution = typeof resolutionProp === 'number' ? resolutionProp : 24;
        const threshold = typeof thresholdProp === 'number' ? thresholdProp : 1.0;

        geometry = generateHullGeometry(blobs, resolution, threshold);
        break;
      }

      default:
        return -1;
    }

    // Create accessors
    const positionAccessor = this.createAccessor(geometry.positions, 'VEC3', true);
    const normalAccessor = this.createAccessor(geometry.normals, 'VEC3');
    const uvAccessor = this.createAccessor(geometry.uvs, 'VEC2');
    const indexAccessor = this.createAccessor(geometry.indices, 'SCALAR');

    // Create or get material (with geometry type for texture selection)
    const materialIndex = this.getOrCreateMaterial(object, shapeType);

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
   * Extract a nested array of vec3s from a HoloValue.
   * e.g. [[0, 1, 2], [3, 4, 5]] => [[0,1,2], [3,4,5]]
   */
  private extractNestedArray(val: unknown, expectedLength: number): number[][] {
    const result: number[][] = [];
    if (!Array.isArray(val)) return result;

    for (const item of val) {
      if (Array.isArray(item) && item.length >= expectedLength) {
        result.push(item.slice(0, expectedLength).map(Number));
      }
    }
    return result;
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
  private getOrCreateMaterial(object: HoloObjectDecl, shapeType?: string): number {
    let color: [number, number, number] = [1, 1, 1];
    let metallic = 0;
    let roughness = 0.5;
    let opacity = 1;
    let emissive: [number, number, number] = [0, 0, 0];

    // Advanced PBR properties for KHR extensions
    let transmission = 0;
    let ior = 1.5;
    let thickness = 0;
    let clearcoat = 0;
    let clearcoatRoughness = 0;
    let sheen = 0;
    let sheenRoughness = 0.5;
    let sheenColor: [number, number, number] = [1, 1, 1];
    let iridescence = 0;
    let iridescenceIOR = 1.3;
    let anisotropy = 0;
    let anisotropyRotation = 0;
    let attenuationColor: [number, number, number] | undefined;
    let attenuationDistance: number | undefined;

    // 1. Named material preset (e.g., material: "glass")
    const namedMat = this.findProp(object, 'material');
    if (typeof namedMat === 'string' && MATERIAL_PRESETS[namedMat]) {
      const preset = MATERIAL_PRESETS[namedMat] as R3FMaterialProps;
      if (preset.color) color = this.parseColorString(preset.color);
      if (preset.metalness !== undefined) metallic = preset.metalness;
      if (preset.roughness !== undefined) roughness = preset.roughness;
      if (preset.opacity !== undefined) opacity = preset.opacity;
      if (preset.transparent && opacity >= 1) opacity = 0.99; // trigger BLEND mode
      if (preset.emissive) emissive = this.parseColorString(preset.emissive);
      // Advanced PBR from preset
      if (preset.transmission !== undefined) transmission = preset.transmission;
      if (preset.ior !== undefined) ior = preset.ior;
      if (preset.thickness !== undefined) thickness = preset.thickness;
      if (preset.clearcoat !== undefined) clearcoat = preset.clearcoat;
      if (preset.clearcoatRoughness !== undefined) clearcoatRoughness = preset.clearcoatRoughness;
      if (preset.sheen !== undefined) sheen = preset.sheen;
      if (preset.sheenRoughness !== undefined) sheenRoughness = preset.sheenRoughness;
      if (preset.sheenColor) sheenColor = this.parseColorString(preset.sheenColor);
      if (preset.iridescence !== undefined) iridescence = preset.iridescence;
      if (preset.iridescenceIOR !== undefined) iridescenceIOR = preset.iridescenceIOR;
      if (preset.anisotropy !== undefined) anisotropy = preset.anisotropy;
      if (preset.anisotropyRotation !== undefined) anisotropyRotation = preset.anisotropyRotation;
      if (preset.attenuationColor)
        attenuationColor = this.parseColorString(preset.attenuationColor);
      if (preset.attenuationDistance !== undefined)
        attenuationDistance = preset.attenuationDistance;
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
      // Advanced PBR from trait composition
      if (composed.transmission !== undefined) transmission = composed.transmission;
      if (composed.ior !== undefined) ior = composed.ior;
      if (composed.thickness !== undefined) thickness = composed.thickness;
      if (composed.clearcoat !== undefined) clearcoat = composed.clearcoat;
      if (composed.clearcoatRoughness !== undefined)
        clearcoatRoughness = composed.clearcoatRoughness;
      if (composed.sheen !== undefined) sheen = composed.sheen;
      if (composed.sheenRoughness !== undefined) sheenRoughness = composed.sheenRoughness;
      if (composed.sheenColor) sheenColor = this.parseColorString(composed.sheenColor);
      if (composed.iridescence !== undefined) iridescence = composed.iridescence;
      if (composed.iridescenceIOR !== undefined) iridescenceIOR = composed.iridescenceIOR;
      if (composed.anisotropy !== undefined) anisotropy = composed.anisotropy;
      if (composed.anisotropyRotation !== undefined)
        anisotropyRotation = composed.anisotropyRotation;
      if (composed.attenuationColor)
        attenuationColor = this.parseColorString(composed.attenuationColor);
      if (composed.attenuationDistance !== undefined)
        attenuationDistance = composed.attenuationDistance;
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

    const metallicProp = this.findProp(object, 'metallic') ?? this.findProp(object, 'metalness');
    if (typeof metallicProp === 'number') metallic = metallicProp;

    const roughnessProp = this.findProp(object, 'roughness');
    if (typeof roughnessProp === 'number') roughness = roughnessProp;

    const emissiveIntensityProp = this.findProp(object, 'emissiveIntensity');
    const emissiveIntensity =
      typeof emissiveIntensityProp === 'number' ? emissiveIntensityProp : 1.0;

    const emissiveProp = this.findProp(object, 'emissive');
    if (typeof emissiveProp === 'string') emissive = this.parseColorString(emissiveProp);

    // Direct overrides for advanced PBR
    const transmissionProp = this.findProp(object, 'transmission');
    if (typeof transmissionProp === 'number') transmission = transmissionProp;

    const iorProp = this.findProp(object, 'ior');
    if (typeof iorProp === 'number') ior = iorProp;

    const clearcoatProp = this.findProp(object, 'clearcoat');
    if (typeof clearcoatProp === 'number') clearcoat = clearcoatProp;

    // 4. Extract texture map references from object properties
    const texturePaths: Record<string, string> = {};
    const TEX_PROP_MAP: Record<string, string> = {
      // HoloScript property name → glTF slot key
      baseColorMap: 'baseColor',
      albedo_map: 'baseColor',
      colorMap: 'baseColor',
      normalMap: 'normal',
      normal_map: 'normal',
      roughnessMap: 'metallicRoughness',
      roughness_map: 'metallicRoughness',
      metallicMap: 'metallicRoughness',
      metallic_map: 'metallicRoughness',
      metalnessMap: 'metallicRoughness',
      occlusionMap: 'occlusion',
      ao_map: 'occlusion',
      ambientOcclusionMap: 'occlusion',
      emissiveMap: 'emissive',
      emissive_map: 'emissive',
      emissionMap: 'emissive',
    };
    for (const [propName, slotKey] of Object.entries(TEX_PROP_MAP)) {
      const val = this.findProp(object, propName);
      if (typeof val === 'string' && val.length > 0 && !texturePaths[slotKey]) {
        texturePaths[slotKey] = val;
      }
    }

    // Create material key for caching (includes advanced PBR props + texture paths)
    const key = JSON.stringify({
      color,
      metallic,
      roughness,
      opacity,
      emissive,
      transmission,
      ior,
      thickness,
      clearcoat,
      clearcoatRoughness,
      sheen,
      sheenRoughness,
      sheenColor,
      iridescence,
      iridescenceIOR,
      anisotropy,
      anisotropyRotation,
      attenuationColor,
      attenuationDistance,
      texturePaths,
    });
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
      doubleSided: opacity < 1 || transmission > 0,
    };

    if (opacity < 1 || transmission > 0) {
      material.alphaMode = 'BLEND';
    }

    const emissiveSum = emissive[0] + emissive[1] + emissive[2];
    if (emissiveSum > 0) {
      // Apply emissiveIntensity scaling — allow >1.0 for HDR bloom in Three.js
      material.emissiveFactor = emissive.map((c) => c * emissiveIntensity) as [
        number,
        number,
        number,
      ];
    }

    // Build KHR material extensions from advanced PBR properties
    const extensions: Record<string, unknown> = {};

    if (transmission > 0) {
      Object.assign(extensions, createTransmissionExtension(transmission));
    }
    if (ior !== 1.5) {
      Object.assign(extensions, createIORExtension(ior));
    }
    if (clearcoat > 0) {
      Object.assign(
        extensions,
        createClearcoatExtension({ factor: clearcoat, roughness: clearcoatRoughness })
      );
    }
    if (sheen > 0) {
      Object.assign(
        extensions,
        createSheenExtension({ color: sheenColor, roughness: sheenRoughness })
      );
    }
    if (iridescence > 0) {
      Object.assign(
        extensions,
        createIridescenceExtension({ factor: iridescence, ior: iridescenceIOR })
      );
    }
    if (anisotropy > 0) {
      Object.assign(
        extensions,
        createAnisotropyExtension({ strength: anisotropy, rotation: anisotropyRotation })
      );
    }
    if (thickness > 0 || attenuationDistance !== undefined) {
      Object.assign(
        extensions,
        createVolumeExtension({
          thickness: thickness || 1,
          attenuationDistance,
          attenuationColor,
        })
      );
    }
    if (emissiveIntensity > 1) {
      Object.assign(extensions, createEmissiveStrengthExtension(emissiveIntensity));
    }

    if (Object.keys(extensions).length > 0) {
      material.extensions = extensions;
    }

    // Apply procedural scale texture to hull/metaball meshes and skin materials
    const isScaledGeometry = shapeType === 'hull' || shapeType === 'metaball';
    const isScaledMaterial =
      typeof namedMat === 'string' && (namedMat === 'skin_dark' || namedMat === 'leather');
    if (isScaledGeometry || isScaledMaterial) {
      const texIdx = this.ensureScaleTexture();
      if (texIdx >= 0) {
        (material.pbrMetallicRoughness as Record<string, unknown>).baseColorTexture = {
          index: texIdx,
          texCoord: 0,
        };
        if (this.scaleNormalTextureIndex >= 0) {
          (material as unknown as Record<string, unknown>).normalTexture = {
            index: this.scaleNormalTextureIndex,
            texCoord: 0,
            scale: 1.0,
          };
        }
        this.stats.textureCount = 2;
      }
    }

    // Apply external texture maps from composition properties
    if (Object.keys(texturePaths).length > 0) {
      const pbr = material.pbrMetallicRoughness as Record<string, unknown>;

      if (texturePaths.baseColor && !pbr.baseColorTexture) {
        const idx = this.getOrCreateExternalTexture(texturePaths.baseColor);
        if (idx >= 0) pbr.baseColorTexture = { index: idx, texCoord: 0 };
      }

      if (texturePaths.metallicRoughness && !pbr.metallicRoughnessTexture) {
        const idx = this.getOrCreateExternalTexture(texturePaths.metallicRoughness);
        if (idx >= 0) pbr.metallicRoughnessTexture = { index: idx, texCoord: 0 };
      }

      const matRecord = material as unknown as Record<string, unknown>;

      if (texturePaths.normal && !matRecord.normalTexture) {
        const idx = this.getOrCreateExternalTexture(texturePaths.normal);
        if (idx >= 0) matRecord.normalTexture = { index: idx, texCoord: 0, scale: 1.0 };
      }

      if (texturePaths.occlusion && !matRecord.occlusionTexture) {
        const idx = this.getOrCreateExternalTexture(texturePaths.occlusion);
        if (idx >= 0) matRecord.occlusionTexture = { index: idx, texCoord: 0, strength: 1.0 };
      }

      if (texturePaths.emissive && !matRecord.emissiveTexture) {
        const idx = this.getOrCreateExternalTexture(texturePaths.emissive);
        if (idx >= 0) matRecord.emissiveTexture = { index: idx, texCoord: 0 };
      }
    }

    const materialIndex = this.materials.length;
    this.materials.push(material);
    this.materialMap.set(key, materialIndex);
    this.stats.materialCount++;

    return materialIndex;
  }

  /**
   * Embed an external texture image in the glTF buffer. Returns the texture
   * index, or -1 if the image data is not available in options.textureData.
   * Caches by path so the same image is only embedded once.
   */
  private getOrCreateExternalTexture(path: string): number {
    if (this.textureIndexMap.has(path)) {
      return this.textureIndexMap.get(path)!;
    }

    const imageData = this.options.textureData[path];
    if (!imageData || imageData.length === 0) {
      return -1;
    }

    // Detect MIME type from magic bytes
    const isPNG = imageData[0] === 0x89 && imageData[1] === 0x50;
    const isJPEG = imageData[0] === 0xff && imageData[1] === 0xd8;
    const mimeType = isPNG ? 'image/png' : isJPEG ? 'image/jpeg' : 'image/png';

    // Embed image bytes in the glTF buffer
    const byteOffset = this.bufferByteLength;
    this.appendToBuffer(imageData);
    this.padBuffer(4);

    // Create buffer view
    const bufferViewIndex = this.bufferViews.length;
    this.bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: imageData.length,
    });

    // Create image
    const imageIndex = this.images.length;
    this.images.push({
      bufferView: bufferViewIndex,
      mimeType,
    });

    // Create sampler (reuse if one already exists, otherwise create)
    let samplerIndex: number;
    if (this.samplers.length > 0) {
      samplerIndex = 0; // reuse first sampler (LINEAR + REPEAT)
    } else {
      samplerIndex = this.samplers.length;
      this.samplers.push({
        magFilter: 9729, // LINEAR
        minFilter: 9987, // LINEAR_MIPMAP_LINEAR
        wrapS: 10497, // REPEAT
        wrapT: 10497, // REPEAT
      });
    }

    // Create texture
    const textureIndex = this.textures.length;
    this.textures.push({
      source: imageIndex,
      sampler: samplerIndex,
    });

    this.textureIndexMap.set(path, textureIndex);
    this.stats.textureCount++;
    return textureIndex;
  }

  /**
   * Ensure the procedural scale texture is generated and embedded in the glTF.
   * Returns the texture index, or -1 if generation failed.
   */
  private ensureScaleTexture(): number {
    if (this.scaleTextureIndex >= 0) return this.scaleTextureIndex;

    const TEX_SIZE = 256;

    // Generate the hex scale pixel data
    const pixels = generateScaleTexture(TEX_SIZE);

    // Encode as PNG
    const pngData = encodePNG(pixels, TEX_SIZE, TEX_SIZE);

    // Embed PNG in the glTF buffer
    const byteOffset = this.bufferByteLength;
    this.appendToBuffer(pngData);
    this.padBuffer(4);

    // Create buffer view for the image
    const bufferViewIndex = this.bufferViews.length;
    this.bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: pngData.length,
    });

    // Create image
    const imageIndex = this.images.length;
    this.images.push({
      bufferView: bufferViewIndex,
      mimeType: 'image/png',
    });

    // Create sampler (repeat wrap for tiling)
    const samplerIndex = this.samplers.length;
    this.samplers.push({
      magFilter: 9729, // LINEAR
      minFilter: 9987, // LINEAR_MIPMAP_LINEAR
      wrapS: 10497, // REPEAT
      wrapT: 10497, // REPEAT
    });

    // Create texture (color)
    this.scaleTextureIndex = this.textures.length;
    this.textures.push({
      source: imageIndex,
      sampler: samplerIndex,
    });

    // --- Normal Map ---
    const normalPixels = generateScaleNormalMap(TEX_SIZE);
    const normalPng = encodePNG(normalPixels, TEX_SIZE, TEX_SIZE);

    const normalByteOffset = this.bufferByteLength;
    this.appendToBuffer(normalPng);
    this.padBuffer(4);

    const normalBVIndex = this.bufferViews.length;
    this.bufferViews.push({
      buffer: 0,
      byteOffset: normalByteOffset,
      byteLength: normalPng.length,
    });

    const normalImageIndex = this.images.length;
    this.images.push({
      bufferView: normalBVIndex,
      mimeType: 'image/png',
    });

    this.scaleNormalTextureIndex = this.textures.length;
    this.textures.push({
      source: normalImageIndex,
      sampler: samplerIndex, // reuse same sampler
    });

    return this.scaleTextureIndex;
  }

  /**
   * Create an accessor with arbitrary type string (e.g., MAT4 for skeleton data, VEC4 for skinning).
   * Supports Uint8Array for UNSIGNED_BYTE (5121), Uint16Array for UNSIGNED_SHORT (5123),
   * Uint32Array for UNSIGNED_INT (5125), and Float32Array for FLOAT (5126).
   */
  private createAccessorRaw(
    data: Float32Array | Uint16Array | Uint32Array | Uint8Array,
    type: string,
    componentType: number
  ): number {
    const byteOffset = this.bufferByteLength;

    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.appendToBuffer(view);
    this.padBuffer(4);

    const bufferViewIndex = this.bufferViews.length;
    this.bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: data.byteLength,
    });

    // Calculate count based on type and actual element count
    const comps =
      type === 'MAT4' ? 16 : type === 'VEC4' ? 4 : type === 'VEC3' ? 3 : type === 'VEC2' ? 2 : 1;
    const count = data.length / comps;

    const accessorIndex = this.accessors.length;
    this.accessors.push({
      bufferView: bufferViewIndex,
      componentType,
      count,
      type: type as 'SCALAR',
    });

    return accessorIndex;
  }

  /**
   * Create an accessor and buffer view for data
   */
  private createAccessor(
    data: Float32Array | Uint16Array | Uint32Array,
    type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4',
    computeBounds: boolean = false
  ): number {
    const byteOffset = this.bufferByteLength;
    const componentType =
      data instanceof Uint32Array ? 5125 : data instanceof Uint16Array ? 5123 : 5126; // UNSIGNED_INT, UNSIGNED_SHORT, or FLOAT
    const _bytesPerComponent =
      data instanceof Uint32Array ? 4 : data instanceof Uint16Array ? 2 : 4;

    // Append data to buffer
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.appendToBuffer(view);
    this.padBuffer(4);

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
      bufferView.target = 34963; // ELEMENT_ARRAY_BUFFER (for Uint16Array or Uint32Array indices)
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
  private buildDocument(composition: HoloComposition, bufferLength: number): object {
    const name = composition.name;
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

    if (this.images.length > 0) {
      gltf.images = this.images;
      gltf.textures = this.textures;
      gltf.samplers = this.samplers;
    }

    // Skins (skeleton)
    if (this._skins && this._skins.length > 0) {
      gltf.skins = this._skins;
    }

    // HoloScript Semantic AST in extras (MSF Interoperability)
    // Per Metaverse Standards Forum 3D Asset Interoperability WG guidance,
    // behavioral metadata is placed in the glTF `extras` field to enable
    // round-trip semantic preservation across tools and engines.
    const objectNames = (composition.objects || []).map(o => o.name);
    const allTraits = new Set<string>();
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        allTraits.add(typeof trait === 'string' ? trait : trait.name);
      }
    }
    const groupNames = (composition.spatialGroups || []).map(g => g.name);

    (gltf.asset as Record<string, unknown>).extras = {
      holoscript: {
        version: '6.0',
        compositionName: name,
        objects: objectNames,
        traits: [...allTraits],
        spatialGroups: groupNames,
        ...(this.options.provenanceHash
          ? { provenanceHash: this.options.provenanceHash }
          : {}),
      },
    };

    // Auto-collect all extensions (KHR material extensions + MSFT_lod + etc.)
    declareExtensions(gltf as Record<string, unknown>);

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
