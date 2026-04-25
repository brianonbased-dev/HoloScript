/**
 * glTF/GLB to .holo Importer
 *
 * Reads a glTF 2.0 or GLB binary file and generates HoloScript .holo
 * composition code. Handles node hierarchy, PBR materials, animations,
 * and common physics extensions (KHR_rigid_bodies, etc.).
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

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

/**
 * Narrow extension shapes for the glTF extensions this importer reads.
 * The wider `extensions: Record<string, unknown>` field on GltfNode/GltfData
 * keeps the door open for unknown extensions, but every consumer below
 * narrows via `as XExt | undefined` so strict TS doesn't error on field
 * access. Was previously masked by `as any` (removed in d5b42fa51,
 * unmasking these as deploy-blockers in pre-flight).
 */
interface KhrRigidBodyExt {
  isKinematic?: boolean;
  mass?: number;
  linearVelocity?: [number, number, number];
  angularVelocity?: [number, number, number];
  linearDamping?: number;
  angularDamping?: number;
}

interface MsftPhysicsExt {
  rigidBody?: KhrRigidBodyExt;
}

interface KhrLightsPunctualExt {
  lights?: Array<{
    type: string;
    color?: [number, number, number];
    intensity?: number;
  }>;
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

interface GltfMeshPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
}

interface GltfMesh {
  name?: string;
  primitives: GltfMeshPrimitive[];
}

interface GltfAnimationChannelTarget {
  node?: number;
  path: string; // "translation" | "rotation" | "scale" | "weights"
}

interface GltfAnimationChannel {
  sampler: number;
  target: GltfAnimationChannelTarget;
}

interface GltfAnimationSampler {
  input: number;
  output: number;
  interpolation?: string; // "LINEAR" | "STEP" | "CUBICSPLINE"
}

interface GltfAnimation {
  name?: string;
  channels: GltfAnimationChannel[];
  samplers: GltfAnimationSampler[];
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
// GLB Constants
// ---------------------------------------------------------------------------

const GLB_MAGIC = 0x46546c67; // "glTF" in little-endian
const GLB_VERSION = 2;
const GLB_CHUNK_JSON = 0x4e4f534a; // "JSON" in little-endian
const _GLB_CHUNK_BIN = 0x004e4942; // "BIN\0" in little-endian
const GLB_HEADER_SIZE = 12;
const GLB_CHUNK_HEADER_SIZE = 8;

// ---------------------------------------------------------------------------
// GLB Parser
// ---------------------------------------------------------------------------

/**
 * Parse a GLB binary container and extract the JSON chunk as GltfData.
 * The binary chunk is not interpreted here since we reference geometry
 * by name in the output .holo rather than embedding raw vertex data.
 */
function parseGlb(buffer: Buffer): GltfData {
  if (buffer.length < GLB_HEADER_SIZE) {
    throw new Error('GLB file too small to contain a valid header.');
  }

  const magic = buffer.readUInt32LE(0);
  if (magic !== GLB_MAGIC) {
    throw new Error(
      `Invalid GLB magic number: expected 0x${GLB_MAGIC.toString(16)}, got 0x${magic.toString(16)}.`
    );
  }

  const version = buffer.readUInt32LE(4);
  if (version !== GLB_VERSION) {
    throw new Error(`Unsupported GLB version ${version}. Only version 2 is supported.`);
  }

  const totalLength = buffer.readUInt32LE(8);
  if (buffer.length < totalLength) {
    throw new Error(
      `GLB file truncated: header declares ${totalLength} bytes but buffer is ${buffer.length} bytes.`
    );
  }

  // Walk chunks
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
    // We intentionally skip the BIN chunk - geometry is referenced by path

    offset = chunkDataOffset + chunkLength;
  }

  if (!jsonData) {
    throw new Error('GLB file does not contain a JSON chunk.');
  }

  return jsonData;
}

// ---------------------------------------------------------------------------
// Color Utilities
// ---------------------------------------------------------------------------

/**
 * Convert linear RGB float values (0-1 range) to a hex color string.
 * Applies a simple sRGB gamma correction (power of 1/2.2) before encoding.
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toSrgb = (c: number): number => {
    const clamped = Math.max(0, Math.min(1, c));
    // Linear to sRGB approximation
    const corrected =
      clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1.0 / 2.4) - 0.055;
    return Math.round(corrected * 255);
  };

  const rr = toSrgb(r).toString(16).padStart(2, '0');
  const gg = toSrgb(g).toString(16).padStart(2, '0');
  const bb = toSrgb(b).toString(16).padStart(2, '0');

  return `#${rr}${gg}${bb}`;
}

// ---------------------------------------------------------------------------
// Quaternion to Euler Conversion
// ---------------------------------------------------------------------------

/**
 * Convert a quaternion [x, y, z, w] to Euler angles [rx, ry, rz] in degrees.
 * Uses intrinsic Tait-Bryan angles (XYZ order).
 */
function quaternionToEulerDeg(q: [number, number, number, number]): [number, number, number] {
  const [x, y, z, w] = q;

  // Roll (X)
  const sinrCosp = 2.0 * (w * x + y * z);
  const cosrCosp = 1.0 - 2.0 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);

  // Pitch (Y)
  const sinp = 2.0 * (w * y - z * x);
  let pitch: number;
  if (Math.abs(sinp) >= 1) {
    pitch = Math.sign(sinp) * (Math.PI / 2); // gimbal lock
  } else {
    pitch = Math.asin(sinp);
  }

  // Yaw (Z)
  const sinyCosp = 2.0 * (w * z + x * y);
  const cosyCosp = 1.0 - 2.0 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);

  const toDeg = (rad: number): number => {
    const deg = (rad * 180.0) / Math.PI;
    return Math.round(deg * 1000) / 1000; // 3 decimal places
  };

  return [toDeg(roll), toDeg(pitch), toDeg(yaw)];
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

function formatVec3(v: [number, number, number]): string {
  const fmt = (n: number): string => {
    const rounded = Math.round(n * 1000) / 1000;
    return String(rounded);
  };
  return `[${fmt(v[0])}, ${fmt(v[1])}, ${fmt(v[2])}]`;
}

/**
 * Sanitize a name for use as a HoloScript identifier.
 * Replaces non-alphanumeric characters (except underscores) with underscores.
 */
function sanitizeName(name: string): string {
  let clean = name.replace(/[^a-zA-Z0-9_]/g, '_');
  // Ensure it does not start with a digit
  if (/^\d/.test(clean)) {
    clean = '_' + clean;
  }
  // Collapse multiple underscores
  clean = clean.replace(/_+/g, '_');
  // Trim trailing underscores
  clean = clean.replace(/_+$/, '');
  return clean || 'unnamed';
}

// ---------------------------------------------------------------------------
// Trait Inference
// ---------------------------------------------------------------------------

/**
 * Infer HoloScript traits from a glTF node based on its name, properties,
 * extensions, and relationships within the glTF document.
 */
function inferTraits(node: GltfNode, gltf: GltfData): string[] {
  const traits: string[] = [];
  const nameLower = (node.name || '').toLowerCase();

  // --- Name-based inference ---

  // Light sources
  if (/light|lamp|lantern|candle|torch|bulb|emitter/.test(nameLower)) {
    traits.push('@glowing');
    traits.push('@emissive');
  }

  // Interactive objects
  if (/button|switch|lever|toggle|handle/.test(nameLower)) {
    traits.push('@clickable');
  }

  if (/door|gate|hatch|lid/.test(nameLower)) {
    traits.push('@clickable');
    traits.push('@animated');
  }

  if (/grab|pickup|pick_up|item|tool|weapon|sword|axe|hammer|key/.test(nameLower)) {
    traits.push('@grabbable');
  }

  // Physics objects
  if (/crate|box|barrel|rock|stone|debris|plank|brick/.test(nameLower)) {
    traits.push('@physics');
    traits.push('@collidable');
  }

  if (/ball|projectile|missile/.test(nameLower)) {
    traits.push('@physics');
    traits.push('@throwable');
    traits.push('@grabbable');
  }

  // Platforms and terrain
  if (/floor|ground|terrain|platform|wall|ceiling|ramp|stair/.test(nameLower)) {
    traits.push('@collidable');
  }

  // Characters and NPCs
  if (/npc|character|enemy|creature|avatar|player|companion|guard|villager/.test(nameLower)) {
    traits.push('@animated');
    traits.push('@collidable');
  }

  // Portals and teleporters
  if (/portal|teleport|warp|gate/.test(nameLower)) {
    traits.push('@portal');
    traits.push('@glowing');
  }

  // Audio
  if (/speaker|radio|audio|music|sound/.test(nameLower)) {
    traits.push('@spatial_audio');
  }

  // Glass / transparent
  if (/glass|window|transparent|crystal|ice/.test(nameLower)) {
    traits.push('@transparent');
  }

  // Mirror / reflective
  if (/mirror|chrome|metal|shiny|polished/.test(nameLower)) {
    traits.push('@reflective');
  }

  // Particle sources
  if (/fire|smoke|fountain|waterfall|steam|spark|flame/.test(nameLower)) {
    traits.push('@particle_emitter');
  }

  // --- Extension-based inference ---
  const ext = node.extensions || {};

  // KHR_rigid_bodies or similar physics extensions
  const rigidBody = (ext['KHR_rigid_bodies'] || ext['KHR_physics_rigid_bodies']) as
    | KhrRigidBodyExt
    | undefined;
  if (rigidBody) {
    if (rigidBody.isKinematic) {
      traits.push('@kinematic');
    } else {
      traits.push('@physics');
      traits.push('@rigid');
    }
    traits.push('@collidable');
  }

  // MSFT_physics (Microsoft physics extension)
  const physics = ext['MSFT_physics'] as MsftPhysicsExt | undefined;
  if (physics?.rigidBody) {
    if (physics.rigidBody.isKinematic) {
      traits.push('@kinematic');
    } else {
      traits.push('@physics');
    }
    traits.push('@collidable');
  }

  // KHR_lights_punctual
  if (ext['KHR_lights_punctual']) {
    traits.push('@emissive');
    traits.push('@glowing');
  }

  // --- Extras-based inference ---
  const extras = node.extras || {};

  if (extras.holoscript_traits && Array.isArray(extras.holoscript_traits)) {
    for (const t of extras.holoscript_traits) {
      const traitStr = String(t).startsWith('@') ? String(t) : `@${t}`;
      if (!traits.includes(traitStr)) {
        traits.push(traitStr);
      }
    }
  }

  if (extras.interactive === true || extras.interactable === true) {
    if (!traits.includes('@clickable')) {
      traits.push('@clickable');
    }
  }

  if (extras.physics === true || extras.rigidbody === true) {
    if (!traits.includes('@physics')) {
      traits.push('@physics');
      traits.push('@collidable');
    }
  }

  // --- Animation-based inference ---
  if (gltf.animations && gltf.animations.length > 0 && gltf.nodes) {
    const nodeIndex = gltf.nodes.indexOf(node);
    if (nodeIndex >= 0) {
      const hasAnimation = gltf.animations.some((anim) =>
        anim.channels.some((ch) => ch.target.node === nodeIndex)
      );
      if (hasAnimation && !traits.includes('@animated')) {
        traits.push('@animated');
      }
    }
  }

  // Deduplicate
  return [...new Set(traits)];
}

// ---------------------------------------------------------------------------
// Material Mapping
// ---------------------------------------------------------------------------

/**
 * Map a glTF PBR material to HoloScript property lines and trait strings.
 */
function materialToTraits(material: GltfMaterial): { properties: string[]; traits: string[] } {
  const properties: string[] = [];
  const traits: string[] = [];
  const pbr = material.pbrMetallicRoughness;

  // Base color
  if (pbr?.baseColorFactor) {
    const [r, g, b, a] = pbr.baseColorFactor;
    properties.push(`color: "${rgbToHex(r, g, b)}"`);

    if (a < 1.0) {
      traits.push('@transparent');
      properties.push(`opacity: ${Math.round(a * 100) / 100}`);
    }
  }

  // Metalness
  if (pbr?.metallicFactor !== undefined) {
    properties.push(`metalness: ${Math.round(pbr.metallicFactor * 100) / 100}`);
    if (pbr.metallicFactor > 0.7) {
      traits.push('@reflective');
    }
  }

  // Roughness
  if (pbr?.roughnessFactor !== undefined) {
    properties.push(`roughness: ${Math.round(pbr.roughnessFactor * 100) / 100}`);
  }

  // Emissive
  if (material.emissiveFactor) {
    const [er, eg, eb] = material.emissiveFactor;
    if (er > 0 || eg > 0 || eb > 0) {
      traits.push('@emissive');
      properties.push(`emissive_color: "${rgbToHex(er, eg, eb)}"`);
      const intensity = Math.max(er, eg, eb);
      properties.push(`emissive_intensity: ${Math.round(intensity * 100) / 100}`);
    }
  }

  // Alpha mode
  if (material.alphaMode === 'BLEND') {
    if (!traits.includes('@transparent')) {
      traits.push('@transparent');
    }
  } else if (material.alphaMode === 'MASK') {
    const cutoff = material.alphaCutoff ?? 0.5;
    properties.push(`alpha_cutoff: ${cutoff}`);
  }

  // Double-sided
  if (material.doubleSided) {
    properties.push(`double_sided: true`);
  }

  return { properties, traits };
}

// ---------------------------------------------------------------------------
// Animation Mapping
// ---------------------------------------------------------------------------

/**
 * Gather animation clip names that target a specific node index.
 */
function getAnimationClipsForNode(nodeIndex: number, gltf: GltfData): string[] {
  const clips: string[] = [];

  if (!gltf.animations) {
    return clips;
  }

  for (const anim of gltf.animations) {
    const targetsThisNode = anim.channels.some((ch) => ch.target.node === nodeIndex);
    if (targetsThisNode) {
      const clipName = anim.name || `animation_${gltf.animations.indexOf(anim)}`;
      if (!clips.includes(clipName)) {
        clips.push(clipName);
      }
    }
  }

  return clips;
}

// ---------------------------------------------------------------------------
// Physics Extension Mapping
// ---------------------------------------------------------------------------

/**
 * Extract physics trait parameters from glTF extensions on a node.
 */
function extractPhysicsParams(node: GltfNode): string[] {
  const params: string[] = [];
  const ext = node.extensions || {};

  // KHR_rigid_bodies
  const rigid = (ext['KHR_rigid_bodies'] || ext['KHR_physics_rigid_bodies']) as
    | KhrRigidBodyExt
    | undefined;
  if (rigid) {
    if (rigid.mass !== undefined) {
      params.push(`mass: ${rigid.mass}`);
    }
    if (rigid.linearVelocity) {
      params.push(`linear_velocity: ${formatVec3(rigid.linearVelocity)}`);
    }
    if (rigid.angularVelocity) {
      params.push(`angular_velocity: ${formatVec3(rigid.angularVelocity)}`);
    }
  }

  // MSFT_physics
  const msft = ext['MSFT_physics'] as MsftPhysicsExt | undefined;
  if (msft?.rigidBody) {
    const rb = msft.rigidBody;
    if (rb.mass !== undefined) {
      params.push(`mass: ${rb.mass}`);
    }
    if (rb.linearDamping !== undefined) {
      params.push(`linear_damping: ${rb.linearDamping}`);
    }
    if (rb.angularDamping !== undefined) {
      params.push(`angular_damping: ${rb.angularDamping}`);
    }
  }

  return params;
}

// ---------------------------------------------------------------------------
// Node-to-Holo Conversion
// ---------------------------------------------------------------------------

/**
 * Convert a single glTF node (and its children recursively) into .holo
 * object block(s).
 */
function nodeToHolo(nodeIndex: number, gltf: GltfData, inputPath: string, indent: number): string {
  const nodes = gltf.nodes;
  if (!nodes || nodeIndex < 0 || nodeIndex >= nodes.length) {
    return '';
  }

  const node = nodes[nodeIndex];
  const pad = '  '.repeat(indent);
  const innerPad = '  '.repeat(indent + 1);
  const rawName = node.name || `node_${nodeIndex}`;
  const _safeName = sanitizeName(rawName);
  const displayName = node.name || `Node_${nodeIndex}`;

  // Collect traits
  const inferredTraits = inferTraits(node, gltf);

  // Material traits and properties
  let materialProps: string[] = [];
  let materialTraits: string[] = [];

  if (node.mesh !== undefined && gltf.meshes) {
    const mesh = gltf.meshes[node.mesh];
    if (mesh && mesh.primitives.length > 0) {
      const primMaterialIdx = mesh.primitives[0].material;
      if (primMaterialIdx !== undefined && gltf.materials && gltf.materials[primMaterialIdx]) {
        const mat = gltf.materials[primMaterialIdx];
        const mapped = materialToTraits(mat);
        materialProps = mapped.properties;
        materialTraits = mapped.traits;
      }
    }
  }

  // Merge traits (deduplicate)
  const allTraits = [...new Set([...inferredTraits, ...materialTraits])];

  // Animation clips
  const animClips = getAnimationClipsForNode(nodeIndex, gltf);
  if (animClips.length > 0 && !allTraits.includes('@animated')) {
    allTraits.push('@animated');
  }

  // Physics parameters
  const physicsParams = extractPhysicsParams(node);

  // Build the trait string
  const traitStr = allTraits.length > 0 ? ' ' + allTraits.join(' ') : '';

  // Start building object block
  const lines: string[] = [];
  lines.push(`${pad}object "${displayName}"${traitStr} {`);

  // Geometry reference - point back to the source model
  const sourceFile = path.basename(inputPath);
  if (node.mesh !== undefined) {
    lines.push(`${innerPad}geometry: "${sourceFile}#${displayName}"`);
  }

  // Transform: position
  if (node.translation) {
    lines.push(`${innerPad}position: ${formatVec3(node.translation)}`);
  }

  // Transform: rotation (quaternion -> euler degrees)
  if (node.rotation) {
    const euler = quaternionToEulerDeg(node.rotation);
    // Only emit if non-zero
    if (euler[0] !== 0 || euler[1] !== 0 || euler[2] !== 0) {
      lines.push(`${innerPad}rotation: ${formatVec3(euler)}`);
    }
  }

  // Transform: scale
  if (node.scale) {
    const isUniform = node.scale[0] === node.scale[1] && node.scale[1] === node.scale[2];
    const isDefault = isUniform && node.scale[0] === 1;
    if (!isDefault) {
      lines.push(`${innerPad}scale: ${formatVec3(node.scale)}`);
    }
  }

  // Material properties
  for (const prop of materialProps) {
    lines.push(`${innerPad}${prop}`);
  }

  // Animation clips
  if (animClips.length > 0) {
    if (animClips.length === 1) {
      lines.push(`${innerPad}animation_clip: "${animClips[0]}"`);
    } else {
      const clipsStr = animClips.map((c) => `"${c}"`).join(', ');
      lines.push(`${innerPad}animation_clips: [${clipsStr}]`);
    }
  }

  // Physics parameters from extensions
  for (const param of physicsParams) {
    lines.push(`${innerPad}${param}`);
  }

  // Custom extras as comments
  if (node.extras) {
    const extrasKeys = Object.keys(node.extras).filter((k) => k !== 'holoscript_traits');
    if (extrasKeys.length > 0) {
      lines.push(`${innerPad}// Custom properties from glTF extras:`);
      for (const key of extrasKeys) {
        const value = node.extras[key];
        if (typeof value === 'string') {
          lines.push(`${innerPad}// ${key}: "${value}"`);
        } else {
          lines.push(`${innerPad}// ${key}: ${JSON.stringify(value)}`);
        }
      }
    }
  }

  // Recursively process child nodes
  if (node.children && node.children.length > 0) {
    lines.push('');
    for (const childIdx of node.children) {
      const childBlock = nodeToHolo(childIdx, gltf, inputPath, indent + 1);
      if (childBlock) {
        lines.push(childBlock);
      }
    }
  }

  lines.push(`${pad}}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Scene Composition Builder
// ---------------------------------------------------------------------------

/**
 * Build the complete .holo composition string from parsed glTF data.
 */
function buildHoloComposition(gltf: GltfData, inputPath: string): string {
  const lines: string[] = [];

  // Header comment
  const generator = gltf.asset.generator || 'unknown';
  const gltfVersion = gltf.asset.version || '2.0';
  const sourceFile = path.basename(inputPath);

  lines.push(`// Imported from ${sourceFile}`);
  lines.push(`// glTF ${gltfVersion} - Generator: ${generator}`);
  if (gltf.asset.copyright) {
    lines.push(`// Copyright: ${gltf.asset.copyright}`);
  }
  lines.push('');

  // Determine scene name
  const activeSceneIdx = gltf.scene ?? 0;
  const scenes = gltf.scenes || [];
  const activeScene = scenes[activeSceneIdx];
  const sceneName = activeScene?.name || path.basename(inputPath, path.extname(inputPath));

  lines.push(`composition "${sceneName}" {`);

  // Environment block
  lines.push('  environment {');
  lines.push('    skybox: "gradient"');
  lines.push('    ambient_light: 0.4');

  // Check for global lighting extensions
  const lightsExt = gltf.extensions?.['KHR_lights_punctual'] as
    | KhrLightsPunctualExt
    | undefined;
  if (lightsExt?.lights) {
    const directionalLight = lightsExt.lights.find((l) => l.type === 'directional');
    if (directionalLight) {
      const color = directionalLight.color || [1, 1, 1];
      const intensity = directionalLight.intensity ?? 1;
      lines.push(`    directional_light_color: "${rgbToHex(color[0], color[1], color[2])}"`);
      lines.push(`    directional_light_intensity: ${Math.round(intensity * 100) / 100}`);
    }
  }

  lines.push('  }');
  lines.push('');

  // Get root nodes from the active scene
  const rootNodes = activeScene?.nodes || [];

  if (rootNodes.length === 0 && gltf.nodes && gltf.nodes.length > 0) {
    // No scene defined; treat all parentless nodes as roots
    const childSet = new Set<number>();
    for (const node of gltf.nodes) {
      if (node.children) {
        for (const childIdx of node.children) {
          childSet.add(childIdx);
        }
      }
    }
    for (let i = 0; i < gltf.nodes.length; i++) {
      if (!childSet.has(i)) {
        rootNodes.push(i);
      }
    }
  }

  // Wrap root nodes in a spatial_group
  lines.push('  spatial_group "Root" {');

  for (const nodeIdx of rootNodes) {
    const block = nodeToHolo(nodeIdx, gltf, inputPath, 2);
    if (block) {
      lines.push(block);
      lines.push('');
    }
  }

  lines.push('  }');

  // Animation summary as a comment block
  if (gltf.animations && gltf.animations.length > 0) {
    lines.push('');
    lines.push('  // --- Animations ---');
    for (let i = 0; i < gltf.animations.length; i++) {
      const anim = gltf.animations[i];
      const animName = anim.name || `animation_${i}`;
      const targetNodes = new Set<number>();
      for (const ch of anim.channels) {
        if (ch.target.node !== undefined) {
          targetNodes.add(ch.target.node);
        }
      }
      const targetNames = [...targetNodes].map((idx) => {
        if (gltf.nodes && gltf.nodes[idx]) {
          return gltf.nodes[idx].name || `node_${idx}`;
        }
        return `node_${idx}`;
      });
      lines.push(`  // "${animName}" -> targets: ${targetNames.join(', ')}`);
    }
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import a glTF or GLB file and return the generated .holo composition code
 * as a string.
 *
 * @param inputPath - Absolute or relative path to a .gltf or .glb file.
 * @returns The .holo composition code string.
 *
 * @throws If the file cannot be read or parsed.
 *
 * @example
 * ```ts
 * import { importGltf } from './importers/gltf-importer';
 *
 * const holoCode = importGltf('./scene.glb');
 * console.log(holoCode);
 * ```
 */
export function importGltf(inputPath: string): string {
  const resolvedPath = path.resolve(inputPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  let gltfData: GltfData;

  if (ext === '.glb') {
    const buffer = fs.readFileSync(resolvedPath);
    gltfData = parseGlb(buffer);
  } else if (ext === '.gltf') {
    const rawJson = fs.readFileSync(resolvedPath, 'utf8');
    try {
      gltfData = JSON.parse(rawJson) as GltfData;
    } catch (e) {
      throw new Error(`Failed to parse glTF JSON from ${resolvedPath}: ${(e as Error).message}`);
    }
  } else {
    throw new Error(`Unsupported file extension "${ext}". Expected ".gltf" or ".glb".`);
  }

  // Validate minimal glTF structure
  if (!gltfData.asset || !gltfData.asset.version) {
    throw new Error('Invalid glTF: missing required "asset.version" field.');
  }

  return buildHoloComposition(gltfData, resolvedPath);
}

/**
 * Import a glTF or GLB file and write the generated .holo composition code
 * to an output file.
 *
 * @param inputPath  - Path to the source .gltf or .glb file.
 * @param outputPath - Path where the .holo file will be written.
 *
 * @throws If the input file cannot be read/parsed or the output cannot be written.
 *
 * @example
 * ```ts
 * import { importGltfToFile } from './importers/gltf-importer';
 *
 * importGltfToFile('./scene.glb', './scene.holo');
 * console.log('Conversion complete!');
 * ```
 */
export function importGltfToFile(inputPath: string, outputPath: string): void {
  const holoCode = importGltf(inputPath);

  const resolvedOutput = path.resolve(outputPath);
  const outputDir = path.dirname(resolvedOutput);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(resolvedOutput, holoCode, 'utf8');
}
