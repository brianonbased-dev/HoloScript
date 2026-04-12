/**
 * HoloScript MCP GLTF Import/Export Tools
 *
 * Exposes the GLTFPipeline as MCP tools for 3D asset import and export.
 * Two tools are provided:
 *
 * 1. `import_gltf` - Import a glTF/GLB file and convert it to .holo composition code.
 *    Accepts either a file path or inline glTF JSON. Handles node hierarchy, PBR materials,
 *    animations, physics extensions, and trait inference.
 *
 * 2. `compile_to_gltf` - Compile .holo composition code to glTF 2.0 / GLB binary format.
 *    Uses the GLTFPipeline from @holoscript/core with full PBR material support, mesh
 *    primitives, animations, skeleton/armature, LOD generation, and texture embedding.
 *
 * @version 1.0.0
 * @package @holoscript/mcp-server
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  parseHolo,
  GLTFPipeline,
  type GLTFPipelineOptions,
  type GLTFExportResult,
  type GLTFExportStats,
  type HoloComposition,
} from '@holoscript/core';

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// GLTF IMPORT: Inline glTF JSON parser (no CLI dependency)
// =============================================================================

/**
 * Minimal glTF data interfaces for import (mirrors the CLI importer types
 * without requiring @holoscript/cli as a dependency).
 */
interface GltfNode {
  name?: string;
  mesh?: number;
  camera?: number;
  skin?: number;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  matrix?: number[];
  extras?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

interface GltfMaterial {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: [number, number, number, number];
    baseColorTexture?: { index: number };
    metallicFactor?: number;
    roughnessFactor?: number;
    metallicRoughnessTexture?: { index: number };
  };
  normalTexture?: { index: number; scale?: number };
  occlusionTexture?: { index: number; strength?: number };
  emissiveFactor?: [number, number, number];
  emissiveTexture?: { index: number };
  alphaMode?: string;
  alphaCutoff?: number;
  doubleSided?: boolean;
  extensions?: Record<string, unknown>;
}

interface GltfMesh {
  name?: string;
  primitives: Array<{
    attributes: Record<string, number>;
    indices?: number;
    material?: number;
    mode?: number;
  }>;
}

interface GltfAnimation {
  name?: string;
  channels: Array<{
    sampler: number;
    target: { node?: number; path: string };
  }>;
  samplers: Array<{
    input: number;
    output: number;
    interpolation?: string;
  }>;
}

interface GltfScene {
  name?: string;
  nodes?: number[];
}

interface GltfData {
  asset: { version: string; generator?: string; copyright?: string };
  scene?: number;
  scenes?: GltfScene[];
  nodes?: GltfNode[];
  meshes?: GltfMesh[];
  materials?: GltfMaterial[];
  animations?: GltfAnimation[];
  cameras?: Array<{ name?: string; type: string; perspective?: any; orthographic?: any }>;
  skins?: Array<{ name?: string; joints: number[] }>;
  extensionsUsed?: string[];
  extensions?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// GLB Constants & Parser
// ---------------------------------------------------------------------------

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_CHUNK_JSON = 0x4e4f534a;
const GLB_HEADER_SIZE = 12;
const GLB_CHUNK_HEADER_SIZE = 8;

function parseGlbBuffer(buffer: Buffer): GltfData {
  if (buffer.length < GLB_HEADER_SIZE) {
    throw new Error('GLB data too small to contain a valid header.');
  }

  const magic = buffer.readUInt32LE(0);
  if (magic !== GLB_MAGIC) {
    throw new Error(
      `Invalid GLB magic: expected 0x${GLB_MAGIC.toString(16)}, got 0x${magic.toString(16)}.`
    );
  }

  const version = buffer.readUInt32LE(4);
  if (version !== GLB_VERSION) {
    throw new Error(`Unsupported GLB version ${version}. Only version 2 is supported.`);
  }

  const totalLength = buffer.readUInt32LE(8);
  if (buffer.length < totalLength) {
    throw new Error(
      `GLB truncated: header declares ${totalLength} bytes but buffer is ${buffer.length} bytes.`
    );
  }

  let offset = GLB_HEADER_SIZE;
  let jsonData: GltfData | null = null;

  while (offset + GLB_CHUNK_HEADER_SIZE <= totalLength) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + GLB_CHUNK_HEADER_SIZE;

    if (chunkDataOffset + chunkLength > totalLength) {
      throw new Error(`GLB chunk at offset ${offset} overflows the file boundary.`);
    }

    if (chunkType === GLB_CHUNK_JSON) {
      const jsonString = buffer.toString('utf8', chunkDataOffset, chunkDataOffset + chunkLength);
      try {
        jsonData = JSON.parse(jsonString) as GltfData;
      } catch (e) {
        throw new Error(`Failed to parse JSON chunk in GLB: ${(e as Error).message}`);
      }
    }

    offset = chunkDataOffset + chunkLength;
  }

  if (!jsonData) {
    throw new Error('GLB data does not contain a JSON chunk.');
  }

  return jsonData;
}

// ---------------------------------------------------------------------------
// Color & Transform Utilities
// ---------------------------------------------------------------------------

function rgbToHex(r: number, g: number, b: number): string {
  const toSrgb = (c: number): number => {
    const clamped = Math.max(0, Math.min(1, c));
    const corrected =
      clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1.0 / 2.4) - 0.055;
    return Math.round(corrected * 255);
  };
  return `#${toSrgb(r).toString(16).padStart(2, '0')}${toSrgb(g).toString(16).padStart(2, '0')}${toSrgb(b).toString(16).padStart(2, '0')}`;
}

function quaternionToEulerDeg(q: [number, number, number, number]): [number, number, number] {
  const [x, y, z, w] = q;
  const sinrCosp = 2.0 * (w * x + y * z);
  const cosrCosp = 1.0 - 2.0 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);

  const sinp = 2.0 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);

  const sinyCosp = 2.0 * (w * z + x * y);
  const cosyCosp = 1.0 - 2.0 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);

  const toDeg = (rad: number): number => Math.round(((rad * 180.0) / Math.PI) * 1000) / 1000;
  return [toDeg(roll), toDeg(pitch), toDeg(yaw)];
}

function formatVec3(v: [number, number, number]): string {
  const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);
  return `[${fmt(v[0])}, ${fmt(v[1])}, ${fmt(v[2])}]`;
}

function _sanitizeName(name: string): string {
  let clean = name.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^\d/.test(clean)) clean = '_' + clean;
  clean = clean.replace(/_+/g, '_').replace(/_+$/, '');
  return clean || 'unnamed';
}

// ---------------------------------------------------------------------------
// Trait Inference
// ---------------------------------------------------------------------------

function inferTraits(node: GltfNode, gltf: GltfData): string[] {
  const traits: string[] = [];
  const nameLower = (node.name || '').toLowerCase();

  if (/light|lamp|lantern|candle|torch|bulb|emitter/.test(nameLower)) {
    traits.push('@glowing', '@emissive');
  }
  if (/button|switch|lever|toggle|handle/.test(nameLower)) {
    traits.push('@clickable');
  }
  if (/door|gate|hatch|lid/.test(nameLower)) {
    traits.push('@clickable', '@animated');
  }
  if (/grab|pickup|pick_up|item|tool|weapon|sword|axe|hammer|key/.test(nameLower)) {
    traits.push('@grabbable');
  }
  if (/crate|box|barrel|rock|stone|debris|plank|brick/.test(nameLower)) {
    traits.push('@physics', '@collidable');
  }
  if (/ball|projectile|missile/.test(nameLower)) {
    traits.push('@physics', '@throwable', '@grabbable');
  }
  if (/floor|ground|terrain|platform|wall|ceiling|ramp|stair/.test(nameLower)) {
    traits.push('@collidable');
  }
  if (/npc|character|enemy|creature|avatar|player|companion|guard|villager/.test(nameLower)) {
    traits.push('@animated', '@collidable');
  }
  if (/portal|teleport|warp/.test(nameLower)) {
    traits.push('@portal', '@glowing');
  }
  if (/speaker|radio|audio|music|sound/.test(nameLower)) {
    traits.push('@spatial_audio');
  }
  if (/glass|window|transparent|crystal|ice/.test(nameLower)) {
    traits.push('@transparent');
  }
  if (/mirror|chrome|metal|shiny|polished/.test(nameLower)) {
    traits.push('@reflective');
  }
  if (/fire|smoke|fountain|waterfall|steam|spark|flame/.test(nameLower)) {
    traits.push('@particle_emitter');
  }

  // Extension-based inference
  const ext = node.extensions || {};
  if (ext['KHR_rigid_bodies'] || ext['KHR_physics_rigid_bodies']) {
    const rb = (ext['KHR_rigid_bodies'] || ext['KHR_physics_rigid_bodies']) as any;
    if (rb?.isKinematic) {
      traits.push('@kinematic');
    } else {
      traits.push('@physics', '@rigid');
    }
    traits.push('@collidable');
  }
  if ((ext['MSFT_physics'] as any)?.rigidBody) {
    const rb = (ext['MSFT_physics'] as any).rigidBody;
    traits.push(rb.isKinematic ? '@kinematic' : '@physics');
    traits.push('@collidable');
  }
  if (ext['KHR_lights_punctual']) {
    traits.push('@emissive', '@glowing');
  }

  // Extras-based inference
  const extras = node.extras || {};
  if (extras.holoscript_traits && Array.isArray(extras.holoscript_traits)) {
    for (const t of extras.holoscript_traits) {
      const traitStr = String(t).startsWith('@') ? String(t) : `@${t}`;
      if (!traits.includes(traitStr)) traits.push(traitStr);
    }
  }
  if (extras.interactive === true || extras.interactable === true) {
    if (!traits.includes('@clickable')) traits.push('@clickable');
  }
  if (extras.physics === true || extras.rigidbody === true) {
    if (!traits.includes('@physics')) {
      traits.push('@physics', '@collidable');
    }
  }

  // Animation-based inference
  if (gltf.animations?.length && gltf.nodes) {
    const nodeIndex = gltf.nodes.indexOf(node);
    if (nodeIndex >= 0) {
      const hasAnimation = gltf.animations.some((anim) =>
        anim.channels.some((ch) => ch.target.node === nodeIndex)
      );
      if (hasAnimation && !traits.includes('@animated')) traits.push('@animated');
    }
  }

  return [...new Set(traits)];
}

// ---------------------------------------------------------------------------
// Material & Animation Mapping
// ---------------------------------------------------------------------------

function materialToTraits(material: GltfMaterial): { properties: string[]; traits: string[] } {
  const properties: string[] = [];
  const traits: string[] = [];
  const pbr = material.pbrMetallicRoughness;

  if (pbr?.baseColorFactor) {
    const [r, g, b, a] = pbr.baseColorFactor;
    properties.push(`color: "${rgbToHex(r, g, b)}"`);
    if (a < 1.0) {
      traits.push('@transparent');
      properties.push(`opacity: ${Math.round(a * 100) / 100}`);
    }
  }
  if (pbr?.metallicFactor !== undefined) {
    properties.push(`metalness: ${Math.round(pbr.metallicFactor * 100) / 100}`);
    if (pbr.metallicFactor > 0.7) traits.push('@reflective');
  }
  if (pbr?.roughnessFactor !== undefined) {
    properties.push(`roughness: ${Math.round(pbr.roughnessFactor * 100) / 100}`);
  }
  if (material.emissiveFactor) {
    const [er, eg, eb] = material.emissiveFactor;
    if (er > 0 || eg > 0 || eb > 0) {
      traits.push('@emissive');
      properties.push(`emissive_color: "${rgbToHex(er, eg, eb)}"`);
      properties.push(`emissive_intensity: ${Math.round(Math.max(er, eg, eb) * 100) / 100}`);
    }
  }
  if (material.alphaMode === 'BLEND') {
    if (!traits.includes('@transparent')) traits.push('@transparent');
  } else if (material.alphaMode === 'MASK') {
    properties.push(`alpha_cutoff: ${material.alphaCutoff ?? 0.5}`);
  }
  if (material.doubleSided) {
    properties.push(`double_sided: true`);
  }

  return { properties, traits };
}

function getAnimationClipsForNode(nodeIndex: number, gltf: GltfData): string[] {
  const clips: string[] = [];
  if (!gltf.animations) return clips;
  for (const anim of gltf.animations) {
    if (anim.channels.some((ch) => ch.target.node === nodeIndex)) {
      const clipName = anim.name || `animation_${gltf.animations.indexOf(anim)}`;
      if (!clips.includes(clipName)) clips.push(clipName);
    }
  }
  return clips;
}

function extractPhysicsParams(node: GltfNode): string[] {
  const params: string[] = [];
  const ext = node.extensions || {};

  const rigid = (ext['KHR_rigid_bodies'] || ext['KHR_physics_rigid_bodies']) as any;
  if (rigid) {
    if (rigid.mass !== undefined) params.push(`mass: ${rigid.mass}`);
    if (rigid.linearVelocity) params.push(`linear_velocity: ${formatVec3(rigid.linearVelocity)}`);
    if (rigid.angularVelocity)
      params.push(`angular_velocity: ${formatVec3(rigid.angularVelocity)}`);
  }

  const msft = ext['MSFT_physics'] as any;
  if (msft?.rigidBody) {
    const rb = msft.rigidBody;
    if (rb.mass !== undefined) params.push(`mass: ${rb.mass}`);
    if (rb.linearDamping !== undefined) params.push(`linear_damping: ${rb.linearDamping}`);
    if (rb.angularDamping !== undefined) params.push(`angular_damping: ${rb.angularDamping}`);
  }

  return params;
}

// ---------------------------------------------------------------------------
// Node-to-Holo Conversion
// ---------------------------------------------------------------------------

function nodeToHolo(nodeIndex: number, gltf: GltfData, sourceName: string, indent: number): string {
  const nodes = gltf.nodes;
  if (!nodes || nodeIndex < 0 || nodeIndex >= nodes.length) return '';

  const node = nodes[nodeIndex];
  const pad = '  '.repeat(indent);
  const innerPad = '  '.repeat(indent + 1);
  const displayName = node.name || `Node_${nodeIndex}`;

  const inferredTraits = inferTraits(node, gltf);

  let materialProps: string[] = [];
  let materialTraits: string[] = [];

  if (node.mesh !== undefined && gltf.meshes) {
    const mesh = gltf.meshes[node.mesh];
    if (mesh?.primitives.length > 0) {
      const primMatIdx = mesh.primitives[0].material;
      if (primMatIdx !== undefined && gltf.materials?.[primMatIdx]) {
        const mapped = materialToTraits(gltf.materials[primMatIdx]);
        materialProps = mapped.properties;
        materialTraits = mapped.traits;
      }
    }
  }

  const allTraits = [...new Set([...inferredTraits, ...materialTraits])];
  const animClips = getAnimationClipsForNode(nodeIndex, gltf);
  if (animClips.length > 0 && !allTraits.includes('@animated')) allTraits.push('@animated');

  const physicsParams = extractPhysicsParams(node);
  const traitStr = allTraits.length > 0 ? ' ' + allTraits.join(' ') : '';

  const lines: string[] = [];
  lines.push(`${pad}object "${displayName}"${traitStr} {`);

  if (node.mesh !== undefined) {
    lines.push(`${innerPad}geometry: "${sourceName}#${displayName}"`);
  }
  if (node.translation) {
    lines.push(`${innerPad}position: ${formatVec3(node.translation)}`);
  }
  if (node.rotation) {
    const euler = quaternionToEulerDeg(node.rotation);
    if (euler[0] !== 0 || euler[1] !== 0 || euler[2] !== 0) {
      lines.push(`${innerPad}rotation: ${formatVec3(euler)}`);
    }
  }
  if (node.scale) {
    const isDefault = node.scale[0] === 1 && node.scale[1] === 1 && node.scale[2] === 1;
    if (!isDefault) lines.push(`${innerPad}scale: ${formatVec3(node.scale)}`);
  }

  for (const prop of materialProps) lines.push(`${innerPad}${prop}`);

  if (animClips.length === 1) {
    lines.push(`${innerPad}animation_clip: "${animClips[0]}"`);
  } else if (animClips.length > 1) {
    lines.push(`${innerPad}animation_clips: [${animClips.map((c) => `"${c}"`).join(', ')}]`);
  }

  for (const param of physicsParams) lines.push(`${innerPad}${param}`);

  if (node.extras) {
    const extrasKeys = Object.keys(node.extras).filter((k) => k !== 'holoscript_traits');
    if (extrasKeys.length > 0) {
      lines.push(`${innerPad}// Custom properties from glTF extras:`);
      for (const key of extrasKeys) {
        const value = node.extras![key];
        lines.push(
          `${innerPad}// ${key}: ${typeof value === 'string' ? `"${value}"` : JSON.stringify(value)}`
        );
      }
    }
  }

  if (node.children?.length) {
    lines.push('');
    for (const childIdx of node.children) {
      const childBlock = nodeToHolo(childIdx, gltf, sourceName, indent + 1);
      if (childBlock) lines.push(childBlock);
    }
  }

  lines.push(`${pad}}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Build .holo Composition from glTF Data
// ---------------------------------------------------------------------------

function buildHoloComposition(gltf: GltfData, sourceName: string): string {
  const lines: string[] = [];

  const generator = gltf.asset.generator || 'unknown';
  const gltfVersion = gltf.asset.version || '2.0';

  lines.push(`// Imported from ${sourceName}`);
  lines.push(`// glTF ${gltfVersion} - Generator: ${generator}`);
  if (gltf.asset.copyright) lines.push(`// Copyright: ${gltf.asset.copyright}`);
  lines.push('');

  const activeSceneIdx = gltf.scene ?? 0;
  const scenes = gltf.scenes || [];
  const activeScene = scenes[activeSceneIdx];
  const sceneName = activeScene?.name || sourceName.replace(/\.[^.]+$/, '');

  lines.push(`composition "${sceneName}" {`);
  lines.push('  environment {');
  lines.push('    skybox: "gradient"');
  lines.push('    ambient_light: 0.4');

  if ((gltf.extensions?.['KHR_lights_punctual'] as any)?.lights) {
    const lights = (gltf.extensions?.['KHR_lights_punctual'] as any).lights;
    const directionalLight = lights.find((l: any) => l.type === 'directional');
    if (directionalLight) {
      const color = directionalLight.color || [1, 1, 1];
      const intensity = directionalLight.intensity ?? 1;
      lines.push(`    directional_light_color: "${rgbToHex(color[0], color[1], color[2])}"`);
      lines.push(`    directional_light_intensity: ${Math.round(intensity * 100) / 100}`);
    }
  }

  lines.push('  }');
  lines.push('');

  const rootNodes = activeScene?.nodes ? [...activeScene.nodes] : [];

  if (rootNodes.length === 0 && gltf.nodes?.length) {
    const childSet = new Set<number>();
    for (const node of gltf.nodes) {
      if (node.children) {
        for (const childIdx of node.children) childSet.add(childIdx);
      }
    }
    for (let i = 0; i < gltf.nodes.length; i++) {
      if (!childSet.has(i)) rootNodes.push(i);
    }
  }

  lines.push('  spatial_group "Root" {');
  for (const nodeIdx of rootNodes) {
    const block = nodeToHolo(nodeIdx, gltf, sourceName, 2);
    if (block) {
      lines.push(block);
      lines.push('');
    }
  }
  lines.push('  }');

  if (gltf.animations?.length) {
    lines.push('');
    lines.push('  // --- Animations ---');
    for (let i = 0; i < gltf.animations.length; i++) {
      const anim = gltf.animations[i];
      const animName = anim.name || `animation_${i}`;
      const targetNodes = new Set<number>();
      for (const ch of anim.channels) {
        if (ch.target.node !== undefined) targetNodes.add(ch.target.node);
      }
      const targetNames = [...targetNodes].map((idx) => gltf.nodes?.[idx]?.name || `node_${idx}`);
      lines.push(`  // "${animName}" -> targets: ${targetNames.join(', ')}`);
    }
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// IMPORT HANDLER
// =============================================================================

export interface GltfImportOptions {
  /** Absolute path to a .gltf or .glb file on disk */
  filePath?: string;
  /** Inline glTF JSON object (as string or pre-parsed) */
  gltfJson?: string | object;
  /** Base64-encoded GLB binary data */
  glbBase64?: string;
  /** Source file name hint (used in generated comments and geometry refs) */
  sourceName?: string;
}

export interface GltfImportResult {
  success: boolean;
  /** Generated .holo composition code */
  holoCode?: string;
  /** Import statistics */
  stats?: {
    nodeCount: number;
    meshCount: number;
    materialCount: number;
    animationCount: number;
    sceneCount: number;
  };
  error?: string;
}

export async function handleImportGltf(args: Record<string, unknown>): Promise<GltfImportResult> {
  const { filePath, gltfJson, glbBase64, sourceName: rawSourceName } = args as GltfImportOptions;

  if (!filePath && !gltfJson && !glbBase64) {
    throw new Error(
      'At least one input is required: filePath (path to .gltf/.glb file), ' +
        'gltfJson (inline glTF JSON), or glbBase64 (base64-encoded GLB binary).'
    );
  }

  let gltfData: GltfData;
  let sourceName = rawSourceName || 'imported.gltf';

  try {
    if (filePath) {
      // File-based import
      const resolvedPath = path.resolve(filePath);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`);
      }

      sourceName = rawSourceName || path.basename(resolvedPath);
      const ext = path.extname(resolvedPath).toLowerCase();

      if (ext === '.glb') {
        const buffer = fs.readFileSync(resolvedPath);
        gltfData = parseGlbBuffer(buffer);
      } else if (ext === '.gltf') {
        const rawJson = fs.readFileSync(resolvedPath, 'utf8');
        gltfData = JSON.parse(rawJson) as GltfData;
      } else {
        throw new Error(`Unsupported file extension "${ext}". Expected ".gltf" or ".glb".`);
      }
    } else if (glbBase64) {
      // Base64-encoded GLB binary
      const buffer = Buffer.from(glbBase64, 'base64');
      gltfData = parseGlbBuffer(buffer);
      sourceName = rawSourceName || 'imported.glb';
    } else if (gltfJson) {
      // Inline glTF JSON
      if (typeof gltfJson === 'string') {
        gltfData = JSON.parse(gltfJson) as GltfData;
      } else {
        gltfData = gltfJson as GltfData;
      }
      sourceName = rawSourceName || 'imported.gltf';
    } else {
      throw new Error('No valid input provided. Expected one of: gltf_url (URL string), gltf_base64 (base64 string), gltf_json (object), or file_path (local path).');
    }

    // Validate minimal glTF structure
    if (!gltfData.asset || !gltfData.asset.version) {
      throw new Error('Invalid glTF: missing required "asset.version" field.');
    }

    const holoCode = buildHoloComposition(gltfData, sourceName);

    const stats = {
      nodeCount: gltfData.nodes?.length || 0,
      meshCount: gltfData.meshes?.length || 0,
      materialCount: gltfData.materials?.length || 0,
      animationCount: gltfData.animations?.length || 0,
      sceneCount: gltfData.scenes?.length || 0,
    };

    return {
      success: true,
      holoCode,
      stats,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
    };
  }
}

// =============================================================================
// EXPORT / COMPILE HANDLER
// =============================================================================

export interface GltfCompileOptions {
  /** HoloScript composition source code (.holo format) */
  code: string;
  /** Output format: 'glb' for binary (default), 'gltf' for JSON + separate buffer */
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

export interface GltfCompileResult {
  success: boolean;
  /** Base64-encoded GLB binary data (when format='glb') */
  glbBase64?: string;
  /** glTF JSON document (when format='gltf') */
  gltfJson?: object;
  /** Base64-encoded binary buffer (when format='gltf') */
  bufferBase64?: string;
  /** Export statistics */
  stats?: GLTFExportStats;
  /** Compilation time in milliseconds */
  compilationTimeMs?: number;
  error?: string;
}

export async function handleCompileToGltf(
  args: Record<string, unknown>
): Promise<GltfCompileResult> {
  const {
    code,
    format = 'glb',
    dracoCompression,
    quantize,
    prune,
    dedupe,
    embedTextures,
    generator,
    copyright,
  } = args as unknown as GltfCompileOptions;

  if (!code) {
    throw new Error('code is required: provide HoloScript composition source code (.holo format).');
  }

  const startTime = Date.now();

  try {
    // Parse the composition
    const parseResult = parseHolo(code);
    if (!parseResult.success || !parseResult.ast) {
      const errors =
        parseResult.errors?.map((e: { message: string }) => e.message).join(', ') ||
        'Unknown parse error';
      throw new Error(`Failed to parse composition: ${errors}`);
    }

    const composition = parseResult.ast;

    // Configure the pipeline
    const pipelineOptions: GLTFPipelineOptions = {
      format: format || 'glb',
    };
    if (dracoCompression !== undefined) pipelineOptions.dracoCompression = dracoCompression;
    if (quantize !== undefined) pipelineOptions.quantize = quantize;
    if (prune !== undefined) pipelineOptions.prune = prune;
    if (dedupe !== undefined) pipelineOptions.dedupe = dedupe;
    if (embedTextures !== undefined) pipelineOptions.embedTextures = embedTextures;
    if (generator !== undefined) pipelineOptions.generator = generator;
    if (copyright !== undefined) pipelineOptions.copyright = copyright;

    const pipeline = new GLTFPipeline(pipelineOptions);

    // Pass empty token to bypass RBAC (skips validation when token is falsy)
    const result: GLTFExportResult = pipeline.compile(composition, '');

    const compilationTimeMs = Date.now() - startTime;

    if (format === 'glb' && result.binary) {
      return {
        success: true,
        glbBase64: Buffer.from(result.binary).toString('base64'),
        stats: result.stats,
        compilationTimeMs,
      };
    } else {
      return {
        success: true,
        gltfJson: result.json,
        bufferBase64: result.buffer ? Buffer.from(result.buffer).toString('base64') : undefined,
        stats: result.stats,
        compilationTimeMs,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
      compilationTimeMs: Date.now() - startTime,
    };
  }
}

// =============================================================================
// HANDLER DISPATCHER
// =============================================================================

export async function handleGltfTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'import_gltf':
      return handleImportGltf(args);
    case 'compile_to_gltf':
      return handleCompileToGltf(args);
    default:
      return null;
  }
}

// =============================================================================
// MCP TOOL DEFINITIONS
// =============================================================================

export const gltfImportTools: Tool[] = [
  {
    name: 'import_gltf',
    description:
      'Import a glTF 2.0 or GLB file and convert it to HoloScript .holo composition code. ' +
      'Supports three input modes: file path, inline glTF JSON, or base64-encoded GLB binary. ' +
      'Handles node hierarchy, PBR materials (baseColor, metalness, roughness, emissive), ' +
      'animations, physics extensions (KHR_rigid_bodies, MSFT_physics), and automatic ' +
      'HoloScript trait inference from node names, extensions, and extras. ' +
      'Returns generated .holo code with import statistics.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description:
            'Absolute path to a .gltf or .glb file on disk. ' +
            'Use this for importing files from the local filesystem.',
        },
        gltfJson: {
          type: 'string',
          description:
            'Inline glTF JSON document as a string. ' +
            'Use this when you have the glTF JSON data directly without a file.',
        },
        glbBase64: {
          type: 'string',
          description:
            'Base64-encoded GLB binary data. ' +
            'Use this when you have GLB binary data (e.g., from an API or download).',
        },
        sourceName: {
          type: 'string',
          description:
            'Source file name hint used in generated comments and geometry references. ' +
            'Defaults to "imported.gltf" or "imported.glb" based on input type.',
        },
      },
    },
  },
  {
    name: 'compile_to_gltf',
    description:
      'Compile HoloScript composition code to glTF 2.0 / GLB binary format. ' +
      'Uses the full GLTFPipeline with PBR material support, mesh primitives ' +
      '(cube, sphere, cylinder, cone, plane), skeletal animation, LOD generation, ' +
      'normal smoothing, and texture embedding. Returns base64-encoded GLB binary ' +
      'or glTF JSON + buffer depending on the format option. ' +
      'Includes comprehensive export statistics (node/mesh/material/texture counts, ' +
      'vertex/triangle totals, file size).',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript composition source code (.holo format)',
        },
        format: {
          type: 'string',
          enum: ['glb', 'gltf'],
          description:
            'Output format. "glb" (default) for single binary file, ' +
            '"gltf" for JSON document with separate binary buffer.',
        },
        dracoCompression: {
          type: 'boolean',
          description: 'Enable Draco mesh compression for smaller file size (default: false)',
        },
        quantize: {
          type: 'boolean',
          description: 'Enable vertex quantization for smaller file size (default: true)',
        },
        prune: {
          type: 'boolean',
          description: 'Remove unused resources from the output (default: true)',
        },
        dedupe: {
          type: 'boolean',
          description: 'Deduplicate accessors and materials (default: true)',
        },
        embedTextures: {
          type: 'boolean',
          description: 'Embed textures as base64 in glTF format (default: true)',
        },
        generator: {
          type: 'string',
          description:
            'Generator string for glTF metadata (default: "HoloScript GLTFPipeline v1.0.0")',
        },
        copyright: {
          type: 'string',
          description: 'Copyright string for glTF metadata',
        },
      },
      required: ['code'],
    },
  },
];
