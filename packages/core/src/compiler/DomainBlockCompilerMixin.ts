import type { Vector3 } from '../types';
/**
 * DomainBlockCompilerMixin.ts
 *
 * Shared utilities for compiling domain blocks and simulation constructs
 * to target platform code. Any compiler can import these helpers.
 *
 * Handles: materials, physics, particles, post-fx, audio, weather,
 * procedural, LOD, navigation, input, annotations.
 *
 * @version 4.2.0
 */

import type { HoloDomainBlock, HoloDomainType, HoloValue } from '../parser/HoloCompositionTypes';
import { escapeStringValue, type EscapeTarget } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from './identity/ANSNamespace';
import {
  applyPerceptualColorPass,
  type PerceptualColorPassInput,
  type PerceptualColorPassResult,
  type PerceptualGradientStop,
} from './PerceptualColorPass';

/**
 * Escape a string for safe interpolation into a specific target language.
 * Convenience alias for DomainBlockCompilerMixin standalone functions.
 *
 * SECURITY: All user-controlled strings interpolated into generated code
 * MUST go through this function to prevent CWE-94 injection attacks.
 */
function esc(value: string, target: EscapeTarget): string {
  return escapeStringValue(value, target);
}

// =============================================================================
// Material Compilation
// =============================================================================

export interface CompiledMaterial {
  name: string;
  type: 'pbr' | 'unlit' | 'shader';
  baseColor?: string;
  roughness?: number;
  metallic?: number;
  opacity?: number;
  ior?: number;
  emissiveColor?: string;
  emissiveIntensity?: number;
  // Physical-material (three MeshPhysicalMaterial) props — emitted when any is set.
  clearcoat?: number;
  clearcoatRoughness?: number;
  transmission?: number;
  thickness?: number;
  sheen?: number;
  sheenColor?: string;
  sheenRoughness?: number;
  specularIntensity?: number;
  iridescence?: number;
  attenuationColor?: string;
  attenuationDistance?: number;
  textureMaps: Record<string, string>;
  traits: string[];
}

/** Physical-material prop keys that, when present, promote a PBR material to
 *  three's MeshPhysicalMaterial. `ior` alone does NOT promote (StandardMaterial
 *  ignores it harmlessly; promotion requires a genuinely-physical effect). */
const PHYSICAL_MATERIAL_KEYS = [
  'clearcoat',
  'clearcoatRoughness',
  'transmission',
  'thickness',
  'sheen',
  'sheenColor',
  'sheenRoughness',
  'specularIntensity',
  'iridescence',
  'attenuationColor',
  'attenuationDistance',
] as const;

/** True when the material declares any genuinely-physical effect. */
export function isPhysicalMaterial(mat: CompiledMaterial): boolean {
  return PHYSICAL_MATERIAL_KEYS.some((k) => mat[k] !== undefined);
}

export function compileMaterialBlock(block: HoloDomainBlock): CompiledMaterial {
  const type =
    block.keyword === 'unlit_material' ? 'unlit' : block.keyword === 'shader' ? 'shader' : 'pbr';

  const textureMaps: Record<string, string> = {};
  const otherProps: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(block.properties || {})) {
    if (key.endsWith('_map')) {
      textureMaps[key] = String(value);
    } else {
      otherProps[key] = value;
    }
  }

  return {
    name: block.name || 'unnamed',
    type,
    baseColor: otherProps.baseColor as string,
    roughness: otherProps.roughness as number,
    metallic: otherProps.metallic as number,
    opacity: otherProps.opacity as number,
    ior: otherProps.ior as number,
    emissiveColor: otherProps.emissive_color as string,
    emissiveIntensity: otherProps.emissive_intensity as number,
    clearcoat: (otherProps.clearcoat ?? otherProps.clear_coat) as number,
    clearcoatRoughness: (otherProps.clearcoat_roughness ?? otherProps.clearcoatRoughness) as number,
    transmission: otherProps.transmission as number,
    thickness: otherProps.thickness as number,
    sheen: otherProps.sheen as number,
    sheenColor: (otherProps.sheen_color ?? otherProps.sheenColor) as string,
    sheenRoughness: (otherProps.sheen_roughness ?? otherProps.sheenRoughness) as number,
    specularIntensity: (otherProps.specular_intensity ?? otherProps.specularIntensity) as number,
    iridescence: otherProps.iridescence as number,
    attenuationColor: (otherProps.attenuation_color ?? otherProps.attenuationColor) as string,
    attenuationDistance: (otherProps.attenuation_distance ??
      otherProps.attenuationDistance) as number,
    textureMaps,
    traits: block.traits || [],
  };
}

// =============================================================================
// Material Graph Compilation (material_graph domain — node-DAG materials)
// =============================================================================
//
// A material_graph is the typed node-graph generalization of a flat material:
// a DAG of value/math/sample nodes whose edges feed a terminal `output` node's
// surface ports (base_color / roughness / metallic / emissive). It lowers to a
// real WGSL function that evaluates the graph in topological order — the
// sovereign, exact answer to Unreal's Material Editor / Substrate (CG-323).
//
// Authoring shape (verified against HoloCompositionParser):
//   material_graph "name" {
//     base   { type: "constant", value: "#8B4513" }
//     rust   { type: "noise",    scale: 8.0 }
//     albedo { type: "lerp" }
//     out    { type: "output" }
//     base -> albedo.a
//     rust -> albedo.t
//     albedo -> out.base_color
//   }
// → HoloDomainBlock.properties = { <nodeId>: {type, ...params}, connections: [{from,to}] }

/** A single node in a compiled material graph. */
export interface CompiledMaterialGraphNode {
  id: string;
  /** Node kind: constant | noise | fresnel | multiply | add | lerp | output */
  nodeType: string;
  /** Scalar/string params authored on the node (value, scale, power, ...). */
  params: Record<string, unknown>;
}

/** A directed edge: fromNodeId → toNodeId.port */
export interface CompiledMaterialGraphEdge {
  from: string;
  toNode: string;
  toPort: string;
}

export interface CompiledMaterialGraph {
  name: string;
  nodes: CompiledMaterialGraphNode[];
  edges: CompiledMaterialGraphEdge[];
  traits: string[];
}

/**
 * Normalize a `material_graph` domain block into a typed node/edge graph.
 * Mirrors compileMaterialBlock: reads the shared HoloDomainBlock.properties bag
 * (each non-`connections` key is a node; `connections` are the edges).
 */
export function compileMaterialGraphBlock(block: HoloDomainBlock): CompiledMaterialGraph {
  const props = (block.properties || {}) as Record<string, unknown>;
  const nodes: CompiledMaterialGraphNode[] = [];

  for (const [key, raw] of Object.entries(props)) {
    if (key === 'connections') continue;
    const nodeObj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const { type: nodeType, ...params } = nodeObj;
    nodes.push({
      id: key,
      nodeType: typeof nodeType === 'string' ? nodeType : 'constant',
      params,
    });
  }

  const rawConns = Array.isArray(props.connections)
    ? (props.connections as Array<{ from?: unknown; to?: unknown }>)
    : [];
  const edges: CompiledMaterialGraphEdge[] = [];
  for (const c of rawConns) {
    const from = typeof c.from === 'string' ? c.from : '';
    const to = typeof c.to === 'string' ? c.to : '';
    if (!from || !to) continue;
    const dot = to.indexOf('.');
    const toNode = dot >= 0 ? to.slice(0, dot) : to;
    const toPort = dot >= 0 ? to.slice(dot + 1) : 'in';
    edges.push({ from, toNode, toPort });
  }

  return {
    name: block.name || 'unnamed',
    nodes,
    edges,
    traits: block.traits || [],
  };
}

/** WGSL-safe identifier from a node id (letters/digits/underscore). */
function sanitizeMgIdent(id: string): string {
  const s = id.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(s) ? s : `n_${s}`;
}

/** Parse a hex color to a WGSL vec3<f32> literal (falls back to mid-grey). */
function mgHexToVec3(value: unknown): string {
  const hex = typeof value === 'string' ? value : '';
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return 'vec3<f32>(0.5, 0.5, 0.5)';
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  return `vec3<f32>(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
}

/** A resolved WGSL expression plus its type, for graph wiring. */
interface MgValue {
  ref: string;
  type: 'vec3' | 'f32';
}

const mgToVec3 = (v: MgValue | undefined): string =>
  !v ? 'vec3<f32>(0.0)' : v.type === 'vec3' ? v.ref : `vec3<f32>(${v.ref})`;
const mgToF32 = (v: MgValue | undefined, fallback = '0.0'): string =>
  !v ? fallback : v.type === 'f32' ? v.ref : `(${v.ref}).x`;

/**
 * Lower a CompiledMaterialGraph to an evaluatable WGSL fragment function.
 *
 * Topologically orders the DAG (Kahn) so every `let mg_<id>` references only
 * already-emitted values; the terminal `output` node's ports become the
 * returned surface struct. This is real executable WGSL, not a scaffold.
 */
export function materialGraphToWGSL(graph: CompiledMaterialGraph): {
  fnName: string;
  wgsl: string;
} {
  const safeName = sanitizeMgIdent(graph.name);
  const fnName = `evalMaterialGraph_${safeName}`;
  const warnings: string[] = [];

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  // incoming edges per node: port -> fromNodeId
  const inputs = new Map<string, Map<string, string>>();
  for (const n of graph.nodes) inputs.set(n.id, new Map());
  for (const e of graph.edges) {
    if (!nodeById.has(e.from)) {
      warnings.push(`edge from unknown node "${e.from}"`);
      continue;
    }
    if (!inputs.has(e.toNode)) {
      warnings.push(`edge to unknown node "${e.toNode}"`);
      continue;
    }
    inputs.get(e.toNode)!.set(e.toPort, e.from);
  }

  // Kahn topological sort over dependency edges (from -> toNode).
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of graph.edges) {
    if (!nodeById.has(e.from) || !nodeById.has(e.toNode)) continue;
    adj.get(e.from)!.push(e.toNode);
    indeg.set(e.toNode, (indeg.get(e.toNode) || 0) + 1);
  }
  const queue = graph.nodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) || []) {
      indeg.set(next, (indeg.get(next) || 0) - 1);
      if ((indeg.get(next) || 0) === 0) queue.push(next);
    }
  }
  if (order.length < graph.nodes.length) {
    warnings.push('material graph has a cycle; emitting nodes in declaration order');
    for (const n of graph.nodes) if (!order.includes(n.id)) order.push(n.id);
  }

  const values = new Map<string, MgValue>();
  const inPort = (nodeId: string, port: string): MgValue | undefined => {
    const from = inputs.get(nodeId)?.get(port);
    return from ? values.get(from) : undefined;
  };

  const body: string[] = [];
  let output: { id: string } | null = null;

  for (const id of order) {
    const node = nodeById.get(id)!;
    const v = sanitizeMgIdent(id);
    switch (node.nodeType) {
      case 'constant': {
        if (typeof node.params.value === 'number') {
          body.push(`  let mg_${v} = ${(node.params.value as number).toFixed(4)}; // constant`);
          values.set(id, { ref: `mg_${v}`, type: 'f32' });
        } else {
          body.push(`  let mg_${v} = ${mgHexToVec3(node.params.value)}; // constant`);
          values.set(id, { ref: `mg_${v}`, type: 'vec3' });
        }
        break;
      }
      case 'noise': {
        const scale = typeof node.params.scale === 'number' ? node.params.scale : 1;
        body.push(`  let mg_${v} = mgNoise(uv * ${scale.toFixed(4)}); // noise`);
        values.set(id, { ref: `mg_${v}`, type: 'f32' });
        break;
      }
      case 'fresnel': {
        const power = typeof node.params.power === 'number' ? node.params.power : 5;
        body.push(
          `  let mg_${v} = pow(1.0 - max(dot(N, V), 0.0), ${power.toFixed(4)}); // fresnel`
        );
        values.set(id, { ref: `mg_${v}`, type: 'f32' });
        break;
      }
      case 'multiply':
      case 'add': {
        const a = inPort(id, 'a');
        const b = inPort(id, 'b');
        const op = node.nodeType === 'multiply' ? '*' : '+';
        const asVec = a?.type === 'vec3' || b?.type === 'vec3';
        if (asVec) {
          body.push(`  let mg_${v} = ${mgToVec3(a)} ${op} ${mgToVec3(b)}; // ${node.nodeType}`);
          values.set(id, { ref: `mg_${v}`, type: 'vec3' });
        } else {
          body.push(`  let mg_${v} = ${mgToF32(a)} ${op} ${mgToF32(b)}; // ${node.nodeType}`);
          values.set(id, { ref: `mg_${v}`, type: 'f32' });
        }
        break;
      }
      case 'lerp': {
        const a = inPort(id, 'a');
        const b = inPort(id, 'b');
        const t = inPort(id, 't');
        body.push(
          `  let mg_${v} = mix(${mgToVec3(a)}, ${mgToVec3(b)}, vec3<f32>(${mgToF32(t)})); // lerp`
        );
        values.set(id, { ref: `mg_${v}`, type: 'vec3' });
        break;
      }
      case 'output': {
        output = { id };
        break;
      }
      default: {
        warnings.push(`unknown node type "${node.nodeType}" (node "${id}") — treated as black`);
        body.push(`  let mg_${v} = vec3<f32>(0.0); // unknown:${esc(node.nodeType, 'TypeScript')}`);
        values.set(id, { ref: `mg_${v}`, type: 'vec3' });
      }
    }
  }

  // Unconnected surface ports fall back to neutral material defaults (grey
  // dielectric), whether the output node is absent or its port is just unwired.
  const baseColorIn = output ? inPort(output.id, 'base_color') : undefined;
  const roughnessIn = output ? inPort(output.id, 'roughness') : undefined;
  const metallicIn = output ? inPort(output.id, 'metallic') : undefined;
  const emissiveIn = output ? inPort(output.id, 'emissive') : undefined;
  const baseColor = baseColorIn ? mgToVec3(baseColorIn) : 'vec3<f32>(0.8)';
  const roughness = roughnessIn ? mgToF32(roughnessIn, '0.5') : '0.5';
  const metallic = metallicIn ? mgToF32(metallicIn, '0.0') : '0.0';
  const emissive = emissiveIn ? mgToVec3(emissiveIn) : 'vec3<f32>(0.0)';

  const header = [
    `// Material Graph "${esc(graph.name, 'TypeScript')}" — generated by HoloScript TSLCompiler`,
    `// Nodes: ${graph.nodes.length} | Edges: ${graph.edges.length} | topo-ordered: [${order
      .map((o) => esc(o, 'TypeScript'))
      .join(' -> ')}]`,
    ...warnings.map((w) => `// WARNING: ${esc(w, 'TypeScript')}`),
  ];

  const wgsl = [
    ...header,
    '',
    'struct MaterialGraphSurface {',
    '  baseColor: vec3<f32>,',
    '  roughness: f32,',
    '  metallic: f32,',
    '  emissive: vec3<f32>,',
    '};',
    '',
    '// Cheap value-noise helper (hash-based); replace with a texture sample for AAA fidelity.',
    'fn mgNoise(p: vec2<f32>) -> f32 {',
    '  return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453);',
    '}',
    '',
    `fn ${fnName}(uv: vec2<f32>, N: vec3<f32>, V: vec3<f32>, time: f32) -> MaterialGraphSurface {`,
    ...body,
    '  var surface: MaterialGraphSurface;',
    `  surface.baseColor = ${baseColor};`,
    `  surface.roughness = ${roughness};`,
    `  surface.metallic = ${metallic};`,
    `  surface.emissive = ${emissive};`,
    '  return surface;',
    '}',
  ].join('\n');

  return { fnName, wgsl };
}

// =============================================================================
// Particle Field Compilation (particle_field domain — typed force-stack GPU particles)
// =============================================================================
//
// A particle_field is the composable-force generalization of a fixed particle
// system: top-level `count`/`lifetime` plus a stack of typed force nodes
// (gravity / drag / vortex / attractor / curl_noise / turbulence) that each
// lower to real WGSL accumulated into per-particle acceleration. The sovereign,
// $0-on-fleet answer to Unreal's Niagara module stack (CG-312) — where the
// current `vfx` block only integrates fixed gravity, this composes N forces.
//
// Authoring shape (verified against HoloCompositionParser):
//   particle_field "embers" {
//     count: 20000
//     lifetime: 3.0
//     grav  { type: "gravity", strength: -2.0 }
//     swirl { type: "vortex",  strength: 4.0 }
//     air   { type: "drag",    coefficient: 0.1 }
//   }
// → properties = { count, lifetime, <forceId>: {type, ...params} }

export interface CompiledParticleForce {
  id: string;
  /** gravity | drag | vortex | attractor | curl_noise | turbulence */
  forceType: string;
  params: Record<string, unknown>;
}

export interface CompiledParticleField {
  name: string;
  count: number;
  lifetime: number;
  forces: CompiledParticleForce[];
  traits: string[];
}

/** Normalize a `particle_field` domain block: scalars stay config, typed
 *  sub-blocks (objects carrying a `type`) become the force stack. */
export function compileParticleFieldBlock(block: HoloDomainBlock): CompiledParticleField {
  const props = (block.properties || {}) as Record<string, unknown>;
  const forces: CompiledParticleForce[] = [];
  let count = 1000;
  let lifetime = 2.0;

  for (const [key, raw] of Object.entries(props)) {
    if (key === 'count' && typeof raw === 'number') {
      count = raw;
      continue;
    }
    if (key === 'lifetime' && typeof raw === 'number') {
      lifetime = raw;
      continue;
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const { type, ...params } = raw as Record<string, unknown>;
      if (typeof type === 'string') forces.push({ id: key, forceType: type, params });
    }
  }

  return { name: block.name || 'unnamed', count, lifetime, forces, traits: block.traits || [] };
}

/**
 * Lower a CompiledParticleField to a WGSL compute shader that integrates the
 * composed force stack per particle (semi-implicit Euler) with lifetime respawn.
 * Real executable compute WGSL — each force is accumulated, not a comment.
 */
export function particleFieldToWGSL(field: CompiledParticleField): {
  fnName: string;
  wgsl: string;
} {
  const safe = sanitizeMgIdent(field.name);
  const fnName = `cs_particle_field_${safe}`;
  const warnings: string[] = [];
  const num = (p: Record<string, unknown>, k: string, d: number): number =>
    typeof p[k] === 'number' ? (p[k] as number) : d;

  const forceLines: string[] = [];
  for (const f of field.forces) {
    const p = f.params;
    switch (f.forceType) {
      case 'gravity':
        forceLines.push(
          `  accel += vec3<f32>(0.0, ${num(p, 'strength', -9.81).toFixed(4)}, 0.0); // gravity:${esc(f.id, 'TypeScript')}`
        );
        break;
      case 'drag':
        forceLines.push(
          `  accel -= p.vel * ${num(p, 'coefficient', 0.1).toFixed(4)}; // drag:${esc(f.id, 'TypeScript')}`
        );
        break;
      case 'vortex':
        forceLines.push(
          `  accel += normalize(vec3<f32>(-p.pos.z, 0.0, p.pos.x) + vec3<f32>(1e-4)) * ${num(p, 'strength', 1.0).toFixed(4)}; // vortex:${esc(f.id, 'TypeScript')}`
        );
        break;
      case 'attractor':
        forceLines.push(
          `  accel += -normalize(p.pos + vec3<f32>(1e-4)) * ${num(p, 'strength', 1.0).toFixed(4)}; // attractor:${esc(f.id, 'TypeScript')}`
        );
        break;
      case 'curl_noise':
      case 'turbulence':
        forceLines.push(
          `  accel += pfCurl(p.pos * ${num(p, 'scale', 1.0).toFixed(4)}) * ${num(p, 'strength', 1.0).toFixed(4)}; // ${f.forceType}:${esc(f.id, 'TypeScript')}`
        );
        break;
      default:
        warnings.push(`unknown force "${f.forceType}" (node "${f.id}") — skipped`);
        forceLines.push(
          `  // unknown force ${esc(f.forceType, 'TypeScript')}:${esc(f.id, 'TypeScript')}`
        );
    }
  }
  if (forceLines.length === 0)
    forceLines.push('  // no forces declared — particles drift inertially');

  const wgsl = [
    `// Particle Field "${esc(field.name, 'TypeScript')}" — generated by HoloScript TSLCompiler`,
    `// count: ${field.count} | lifetime: ${field.lifetime} | forces: [${field.forces
      .map((f) => `${esc(f.forceType, 'TypeScript')}:${esc(f.id, 'TypeScript')}`)
      .join(', ')}]`,
    ...warnings.map((w) => `// WARNING: ${esc(w, 'TypeScript')}`),
    '',
    `struct ParticleField_${safe} {`,
    '  pos: vec3<f32>,',
    '  life: f32,',
    '  vel: vec3<f32>,',
    '  _pad: f32,',
    '};',
    '',
    '// hash-based value noise → cheap curl approximation for turbulent forces',
    'fn pfHash3(p: vec3<f32>) -> f32 {',
    '  return fract(sin(dot(p, vec3<f32>(12.9898, 78.233, 37.719))) * 43758.5453);',
    '}',
    'fn pfCurl(p: vec3<f32>) -> vec3<f32> {',
    '  let e = 0.1;',
    '  let dx = pfHash3(p + vec3<f32>(e, 0.0, 0.0)) - pfHash3(p - vec3<f32>(e, 0.0, 0.0));',
    '  let dy = pfHash3(p + vec3<f32>(0.0, e, 0.0)) - pfHash3(p - vec3<f32>(0.0, e, 0.0));',
    '  let dz = pfHash3(p + vec3<f32>(0.0, 0.0, e)) - pfHash3(p - vec3<f32>(0.0, 0.0, e));',
    '  return vec3<f32>(dy - dz, dz - dx, dx - dy);',
    '}',
    '',
    `@group(0) @binding(0) var<storage, read> pfIn_${safe}: array<ParticleField_${safe}>;`,
    `@group(0) @binding(1) var<storage, read_write> pfOut_${safe}: array<ParticleField_${safe}>;`,
    `@group(0) @binding(2) var<uniform> pfDt_${safe}: f32;`,
    '',
    '@compute @workgroup_size(64)',
    `fn ${fnName}(@builtin(global_invocation_id) gid: vec3<u32>) {`,
    `  let i = gid.x;`,
    `  if (i >= arrayLength(&pfIn_${safe})) { return; }`,
    `  var p = pfIn_${safe}[i];`,
    `  let dt = pfDt_${safe};`,
    '  var accel = vec3<f32>(0.0);',
    ...forceLines,
    '  p.vel += accel * dt;',
    '  p.pos += p.vel * dt;',
    '  p.life -= dt;',
    '  if (p.life <= 0.0) {',
    '    p.pos = vec3<f32>(0.0);',
    '    p.vel = vec3<f32>(0.0, 1.0, 0.0);',
    `    p.life = ${field.lifetime.toFixed(4)};`,
    '  }',
    `  pfOut_${safe}[i] = p;`,
    '}',
  ].join('\n');

  return { fnName, wgsl };
}

// =============================================================================
// Light Field Compilation (light_field domain — typed multi-light + GI model)
// =============================================================================
//
// A light_field is a typed lighting rig: block-level ambient/bounces/intensity
// (a cheap indirect-GI lift) plus a stack of typed lights (directional / point /
// spot / ambient) that lower to a real WGSL lighting function accumulating
// radiance per fragment. The sovereign answer to Unreal's Lumen (CG-309): the
// world model EMITS the lighting pass from typed structure — dynamic, provable,
// and target-portable — instead of a proprietary GI black box.
//
// Authoring shape (verified against HoloCompositionParser):
//   light_field "interior" {
//     ambient: "#202028"
//     bounces: 2
//     sun  { type: "directional", dir_y: -1.0, color: "#FFF4E0", intensity: 3.0 }
//     fill { type: "point", pos_y: 3.0, color: "#88AAFF", intensity: 1.5, range: 10.0 }
//   }
// → properties = { ambient, bounces, intensity?, <lightId>: {type, ...params} }

export interface CompiledLight {
  id: string;
  /** directional | point | spot | ambient */
  lightType: string;
  params: Record<string, unknown>;
}

export interface CompiledLightField {
  name: string;
  ambient: string;
  bounces: number;
  intensity: number;
  lights: CompiledLight[];
  traits: string[];
}

/** Normalize a `light_field` domain block: scalars stay GI config, typed
 *  sub-blocks (objects carrying a `type`) become the light stack. */
export function compileLightFieldBlock(block: HoloDomainBlock): CompiledLightField {
  const props = (block.properties || {}) as Record<string, unknown>;
  const lights: CompiledLight[] = [];
  let ambient = '#000000';
  let bounces = 1;
  let intensity = 1.0;

  for (const [key, raw] of Object.entries(props)) {
    if (key === 'ambient' && typeof raw === 'string') {
      ambient = raw;
      continue;
    }
    if (key === 'bounces' && typeof raw === 'number') {
      bounces = raw;
      continue;
    }
    if (key === 'intensity' && typeof raw === 'number') {
      intensity = raw;
      continue;
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const { type, ...params } = raw as Record<string, unknown>;
      if (typeof type === 'string') lights.push({ id: key, lightType: type, params });
    }
  }

  return {
    name: block.name || 'unnamed',
    ambient,
    bounces,
    intensity,
    lights,
    traits: block.traits || [],
  };
}

/**
 * Lower a CompiledLightField to a WGSL fragment lighting function that
 * accumulates a GI ambient base plus each typed light's direct contribution.
 * Real executable WGSL — each light integrates, GI bounces lift the ambient.
 */
export function lightFieldToWGSL(field: CompiledLightField): { fnName: string; wgsl: string } {
  const safe = sanitizeMgIdent(field.name);
  const fnName = `evalLightField_${safe}`;
  const warnings: string[] = [];
  const num = (p: Record<string, unknown>, k: string, d: number): number =>
    typeof p[k] === 'number' ? (p[k] as number) : d;

  const lightBlocks: string[] = [];
  for (const l of field.lights) {
    const p = l.params;
    const color = mgHexToVec3(p.color);
    const intensity = num(p, 'intensity', 1.0).toFixed(4);
    switch (l.lightType) {
      case 'directional':
      case 'sun':
        lightBlocks.push(
          [
            `  { // directional:${esc(l.id, 'TypeScript')}`,
            `    let L = normalize(-vec3<f32>(${num(p, 'dir_x', 0).toFixed(4)}, ${num(p, 'dir_y', -1).toFixed(4)}, ${num(p, 'dir_z', 0).toFixed(4)}));`,
            `    let NdotL = max(dot(N, L), 0.0);`,
            `    radiance += albedo * ${color} * ${intensity} * NdotL;`,
            `  }`,
          ].join('\n')
        );
        break;
      case 'point':
        lightBlocks.push(
          [
            `  { // point:${esc(l.id, 'TypeScript')}`,
            `    let d = vec3<f32>(${num(p, 'pos_x', 0).toFixed(4)}, ${num(p, 'pos_y', 0).toFixed(4)}, ${num(p, 'pos_z', 0).toFixed(4)}) - worldPos;`,
            `    let dist = length(d);`,
            `    let L = d / max(dist, 1e-4);`,
            `    let NdotL = max(dot(N, L), 0.0);`,
            `    let atten = 1.0 / (1.0 + (dist * dist) / (${num(p, 'range', 10).toFixed(4)} * ${num(p, 'range', 10).toFixed(4)}));`,
            `    radiance += albedo * ${color} * ${intensity} * NdotL * atten;`,
            `  }`,
          ].join('\n')
        );
        break;
      case 'spot':
        lightBlocks.push(
          [
            `  { // spot:${esc(l.id, 'TypeScript')}`,
            `    let d = vec3<f32>(${num(p, 'pos_x', 0).toFixed(4)}, ${num(p, 'pos_y', 5).toFixed(4)}, ${num(p, 'pos_z', 0).toFixed(4)}) - worldPos;`,
            `    let dist = length(d);`,
            `    let L = d / max(dist, 1e-4);`,
            `    let spotDir = normalize(vec3<f32>(${num(p, 'dir_x', 0).toFixed(4)}, ${num(p, 'dir_y', -1).toFixed(4)}, ${num(p, 'dir_z', 0).toFixed(4)}));`,
            `    let cone = smoothstep(${Math.cos((num(p, 'cone', 30) * Math.PI) / 180).toFixed(4)}, 1.0, dot(-L, spotDir));`,
            `    let NdotL = max(dot(N, L), 0.0);`,
            `    let atten = 1.0 / (1.0 + (dist * dist) / (${num(p, 'range', 10).toFixed(4)} * ${num(p, 'range', 10).toFixed(4)}));`,
            `    radiance += albedo * ${color} * ${intensity} * NdotL * atten * cone;`,
            `  }`,
          ].join('\n')
        );
        break;
      case 'ambient':
      case 'ambient_probe':
      case 'sky':
        lightBlocks.push(
          [
            `  { // ambient:${esc(l.id, 'TypeScript')}`,
            `    radiance += albedo * ${color} * ${intensity};`,
            `  }`,
          ].join('\n')
        );
        break;
      default:
        warnings.push(`unknown light "${l.lightType}" (node "${l.id}") — skipped`);
        lightBlocks.push(
          `  // unknown light ${esc(l.lightType, 'TypeScript')}:${esc(l.id, 'TypeScript')}`
        );
    }
  }

  const giScale = `(${field.intensity.toFixed(4)} * (1.0 + f32(${Math.round(field.bounces)}) * 0.5))`;

  const wgsl = [
    `// Light Field "${esc(field.name, 'TypeScript')}" — generated by HoloScript TSLCompiler`,
    `// ambient: ${esc(field.ambient, 'TypeScript')} | bounces: ${field.bounces} | lights: [${field.lights
      .map((l) => `${esc(l.lightType, 'TypeScript')}:${esc(l.id, 'TypeScript')}`)
      .join(', ')}]`,
    ...warnings.map((w) => `// WARNING: ${esc(w, 'TypeScript')}`),
    '',
    `fn ${fnName}(worldPos: vec3<f32>, N: vec3<f32>, V: vec3<f32>, albedo: vec3<f32>, roughness: f32, metallic: f32) -> vec3<f32> {`,
    '  var radiance = vec3<f32>(0.0);',
    '  // ambient / GI base — bounces approximated as an indirect ambient lift',
    `  radiance += albedo * ${mgHexToVec3(field.ambient)} * ${giScale};`,
    ...lightBlocks,
    '  return radiance;',
    '}',
  ].join('\n');

  return { fnName, wgsl };
}

// =============================================================================
// Nav Field Compilation (nav_field domain — typed crowd-steering behaviors)
// =============================================================================
//
// A nav_field is a typed steering rig for a crowd: top-level agents/max_speed
// plus a stack of typed field-based behaviors (seek / flee / flow / arrive) that
// lower to a WGSL compute shader accumulating a per-agent steering force, then
// integrating clamped velocity. The sovereign answer to Unreal's AI/nav +
// crowd framework (CG-325): the behavior stack is typed data the compiler
// lowers to a real solve, not a per-engine behavior-tree binary.
//
// Authoring shape (verified against HoloCompositionParser):
//   nav_field "crowd" {
//     agents: 500
//     max_speed: 3.0
//     goal { type: "seek",   target_x: 10.0, weight: 1.0 }
//     lane { type: "flow",   dir_x: 1.0,     weight: 0.5 }
//   }
// → properties = { agents, max_speed, <behaviorId>: {type, ...params} }

export interface CompiledNavBehavior {
  id: string;
  /** seek | flee | flow | arrive */
  behaviorType: string;
  params: Record<string, unknown>;
}

export interface CompiledNavField {
  name: string;
  agents: number;
  maxSpeed: number;
  behaviors: CompiledNavBehavior[];
  traits: string[];
}

/** Normalize a `nav_field` domain block: scalars stay config, typed sub-blocks
 *  (objects carrying a `type`) become the steering-behavior stack. */
export function compileNavFieldBlock(block: HoloDomainBlock): CompiledNavField {
  const props = (block.properties || {}) as Record<string, unknown>;
  const behaviors: CompiledNavBehavior[] = [];
  let agents = 256;
  let maxSpeed = 2.0;

  for (const [key, raw] of Object.entries(props)) {
    if (key === 'agents' && typeof raw === 'number') {
      agents = raw;
      continue;
    }
    if ((key === 'max_speed' || key === 'maxSpeed') && typeof raw === 'number') {
      maxSpeed = raw;
      continue;
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const { type, ...params } = raw as Record<string, unknown>;
      if (typeof type === 'string') behaviors.push({ id: key, behaviorType: type, params });
    }
  }

  return { name: block.name || 'unnamed', agents, maxSpeed, behaviors, traits: block.traits || [] };
}

/**
 * Lower a CompiledNavField to a WGSL compute shader that accumulates each typed
 * steering behavior into a per-agent force, then integrates velocity clamped to
 * max_speed. Real executable compute WGSL — each behavior steers, not a comment.
 */
export function navFieldToWGSL(field: CompiledNavField): { fnName: string; wgsl: string } {
  const safe = sanitizeMgIdent(field.name);
  const fnName = `cs_nav_field_${safe}`;
  const ms = field.maxSpeed.toFixed(4);
  const warnings: string[] = [];
  const num = (p: Record<string, unknown>, k: string, d: number): number =>
    typeof p[k] === 'number' ? (p[k] as number) : d;

  const steerLines: string[] = [];
  for (const b of field.behaviors) {
    const p = b.params;
    const w = num(p, 'weight', 1.0).toFixed(4);
    const target = `vec3<f32>(${num(p, 'target_x', 0).toFixed(4)}, ${num(p, 'target_y', 0).toFixed(4)}, ${num(p, 'target_z', 0).toFixed(4)})`;
    switch (b.behaviorType) {
      case 'seek':
        steerLines.push(
          `  { let desired = normalize(${target} - a.pos + vec3<f32>(1e-4)) * ${ms}; steer += (desired - a.vel) * ${w}; } // seek:${esc(b.id, 'TypeScript')}`
        );
        break;
      case 'flee':
        steerLines.push(
          `  { let desired = normalize(a.pos - ${target} + vec3<f32>(1e-4)) * ${ms}; steer += (desired - a.vel) * ${w}; } // flee:${esc(b.id, 'TypeScript')}`
        );
        break;
      case 'flow':
        steerLines.push(
          `  { let desired = normalize(vec3<f32>(${num(p, 'dir_x', 1).toFixed(4)}, ${num(p, 'dir_y', 0).toFixed(4)}, ${num(p, 'dir_z', 0).toFixed(4)}) + vec3<f32>(1e-4)) * ${ms}; steer += (desired - a.vel) * ${w}; } // flow:${esc(b.id, 'TypeScript')}`
        );
        break;
      case 'arrive':
        steerLines.push(
          [
            `  { // arrive:${esc(b.id, 'TypeScript')}`,
            `    let to = ${target} - a.pos;`,
            `    let dist = length(to);`,
            `    let speed = ${ms} * clamp(dist / ${num(p, 'slow_radius', 3).toFixed(4)}, 0.0, 1.0);`,
            `    let desired = normalize(to + vec3<f32>(1e-4)) * speed;`,
            `    steer += (desired - a.vel) * ${w};`,
            `  }`,
          ].join('\n')
        );
        break;
      default:
        warnings.push(`unknown behavior "${b.behaviorType}" (node "${b.id}") — skipped`);
        steerLines.push(
          `  // unknown behavior ${esc(b.behaviorType, 'TypeScript')}:${esc(b.id, 'TypeScript')}`
        );
    }
  }
  if (steerLines.length === 0) steerLines.push('  // no behaviors declared — agents coast');

  const wgsl = [
    `// Nav Field "${esc(field.name, 'TypeScript')}" — generated by HoloScript TSLCompiler`,
    `// agents: ${field.agents} | max_speed: ${field.maxSpeed} | behaviors: [${field.behaviors
      .map((b) => `${esc(b.behaviorType, 'TypeScript')}:${esc(b.id, 'TypeScript')}`)
      .join(', ')}]`,
    ...warnings.map((w) => `// WARNING: ${esc(w, 'TypeScript')}`),
    '',
    `struct NavAgent_${safe} {`,
    '  pos: vec3<f32>,',
    '  _pad0: f32,',
    '  vel: vec3<f32>,',
    '  _pad1: f32,',
    '};',
    '',
    `@group(0) @binding(0) var<storage, read> navIn_${safe}: array<NavAgent_${safe}>;`,
    `@group(0) @binding(1) var<storage, read_write> navOut_${safe}: array<NavAgent_${safe}>;`,
    `@group(0) @binding(2) var<uniform> navDt_${safe}: f32;`,
    '',
    '@compute @workgroup_size(64)',
    `fn ${fnName}(@builtin(global_invocation_id) gid: vec3<u32>) {`,
    `  let i = gid.x;`,
    `  if (i >= arrayLength(&navIn_${safe})) { return; }`,
    `  var a = navIn_${safe}[i];`,
    `  let dt = navDt_${safe};`,
    '  var steer = vec3<f32>(0.0);',
    ...steerLines,
    '  a.vel += steer * dt;',
    `  let sp = length(a.vel);`,
    `  if (sp > ${ms}) { a.vel = a.vel / sp * ${ms}; }`,
    '  a.pos += a.vel * dt;',
    `  navOut_${safe}[i] = a;`,
    '}',
  ].join('\n');

  return { fnName, wgsl };
}

// =============================================================================
// Physics Contract Compilation (physics_contract domain — typed rigid-body + constraint stack)
// =============================================================================
//
// A physics_contract is a typed rigid-body rig: top-level gravity/substeps plus
// two kinds of unique-id sub-blocks — bodies (kind:"body") and constraints
// (kind:"constraint", discriminated further by type). It lowers to a WGSL compute
// shader that runs a semi-implicit-Euler integration step and a PBD-style
// positional constraint projection, substepped for convergence. The sovereign
// answer to Unreal's Chaos / PhysX (CG-313): the rig is typed data the compiler
// lowers to a real deterministic solve, not a per-engine physics binary.
//
// Authoring shape (verified against HoloCompositionParser — MUST use the unique-id
// sub-block form; the `body "name" { }` keyword-named form collides in properties):
//   physics_contract "stack" {
//     gravity_y: -9.81
//     substeps: 2
//     ground { kind: "body", mass: 0.0, shape: "box",    pos_y: 0.0 }   // mass 0 = static
//     crate  { kind: "body", mass: 2.0, shape: "box",    pos_y: 4.0 }
//     tether { kind: "constraint", type: "distance", body_a: "crate", body_b: "ground", rest: 2.0 }
//   }
// → properties = { gravity_y, substeps, <bodyId|constraintId>: {kind, ...} }

export interface CompiledPhysBody {
  id: string;
  mass: number;
  /** box | sphere | capsule | ... — kept for downstream; increment-1 treats bodies as point masses */
  shape: string;
  pos: [number, number, number];
}

export interface CompiledPhysConstraint {
  id: string;
  /** distance | hinge | fixed */
  constraintType: string;
  bodyA: string;
  bodyB: string;
  params: Record<string, unknown>;
}

export interface CompiledPhysicsContract {
  name: string;
  gravity: [number, number, number];
  substeps: number;
  bodies: CompiledPhysBody[];
  constraints: CompiledPhysConstraint[];
  traits: string[];
}

/** Normalize a `physics_contract` domain block: scalars stay config, unique-id
 *  sub-blocks split into bodies (kind:"body") and constraints (kind:"constraint"). */
export function compilePhysicsContractBlock(block: HoloDomainBlock): CompiledPhysicsContract {
  const props = (block.properties || {}) as Record<string, unknown>;
  const bodies: CompiledPhysBody[] = [];
  const constraints: CompiledPhysConstraint[] = [];
  const gravity: [number, number, number] = [0, -9.81, 0];
  let substeps = 1;

  const numOf = (v: unknown, d: number): number => (typeof v === 'number' ? v : d);

  for (const [key, raw] of Object.entries(props)) {
    if (key === 'gravity' && Array.isArray(raw)) {
      gravity[0] = numOf(raw[0], gravity[0]);
      gravity[1] = numOf(raw[1], gravity[1]);
      gravity[2] = numOf(raw[2], gravity[2]);
      continue;
    }
    if (key === 'gravity_x' && typeof raw === 'number') {
      gravity[0] = raw;
      continue;
    }
    if (key === 'gravity_y' && typeof raw === 'number') {
      gravity[1] = raw;
      continue;
    }
    if (key === 'gravity_z' && typeof raw === 'number') {
      gravity[2] = raw;
      continue;
    }
    if (key === 'substeps' && typeof raw === 'number') {
      substeps = Math.max(1, Math.floor(raw));
      continue;
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const sub = raw as Record<string, unknown>;
      const kind = sub.kind;
      if (kind === 'body') {
        bodies.push({
          id: key,
          mass: numOf(sub.mass, 1.0),
          shape: typeof sub.shape === 'string' ? sub.shape : 'box',
          pos: [numOf(sub.pos_x, 0), numOf(sub.pos_y, 0), numOf(sub.pos_z, 0)],
        });
      } else if (kind === 'constraint') {
        const { kind: _k, type, body_a, body_b, ...params } = sub;
        constraints.push({
          id: key,
          constraintType: typeof type === 'string' ? type : 'distance',
          bodyA: typeof body_a === 'string' ? body_a : '',
          bodyB: typeof body_b === 'string' ? body_b : '',
          params,
        });
      }
    }
  }

  return {
    name: block.name || 'unnamed',
    gravity,
    substeps,
    bodies,
    constraints,
    traits: block.traits || [],
  };
}

/**
 * Lower a CompiledPhysicsContract to a WGSL compute shader. Each thread owns one
 * rigid body: semi-implicit-Euler integrate under gravity (static bodies, mass 0
 * ⇒ invMass 0, skip), then PBD-style positional constraint projection in declared
 * order, wrapped in a substep loop. Body ids resolve to buffer indices at emit
 * time (unresolved refs ⇒ WARNING + skip). Real executable, deterministic compute
 * WGSL — each constraint corrects position, not a decorative comment.
 *
 * Increment-1 scope (explicit, like particle_field's force stack): bodies are
 * point masses; constraints are distance / hinge (positional pin, angular limit
 * deferred) / fixed (3-DoF weld, rotational lock deferred); one Jacobi projection
 * per substep against step-start neighbor positions. No broadphase, no contact
 * generation, no full 6-DoF solver.
 */
export function physicsContractToWGSL(field: CompiledPhysicsContract): {
  fnName: string;
  wgsl: string;
} {
  const safe = sanitizeMgIdent(field.name);
  const fnName = `cs_physics_contract_${safe}`;
  const warnings: string[] = [];
  const idx = new Map(field.bodies.map((b, i) => [b.id, i]));
  const num = (p: Record<string, unknown>, k: string, d: number): number =>
    typeof p[k] === 'number' ? (p[k] as number) : d;

  const g = `vec3<f32>(${field.gravity[0].toFixed(4)}, ${field.gravity[1].toFixed(4)}, ${field.gravity[2].toFixed(4)})`;
  const substeps = Math.max(1, field.substeps);

  const constraintLines: string[] = [];
  for (const c of field.constraints) {
    const aIdx = idx.get(c.bodyA);
    const bIdx = idx.get(c.bodyB);
    if (aIdx === undefined || bIdx === undefined) {
      warnings.push(`constraint "${c.id}" (${c.constraintType}) references unknown body — skipped`);
      constraintLines.push(
        `      // ${esc(c.constraintType, 'TypeScript')}:${esc(c.id, 'TypeScript')} — unresolved body ref, skipped`
      );
      continue;
    }
    const a = `${aIdx}u`;
    const b = `${bIdx}u`;
    const p = c.params;
    if (c.constraintType === 'distance' || c.constraintType === 'hinge') {
      // hinge = positional pin (rest 0 by default) + documented axis; angular limit deferred.
      const rest = (
        c.constraintType === 'hinge' ? num(p, 'rest', 0.0) : num(p, 'rest', 1.0)
      ).toFixed(4);
      const stiff = num(p, 'stiffness', 1.0).toFixed(4);
      const axisNote =
        c.constraintType === 'hinge'
          ? ` axis (${num(p, 'axis_x', 0).toFixed(2)},${num(p, 'axis_y', 1).toFixed(2)},${num(p, 'axis_z', 0).toFixed(2)}) — angular limit deferred`
          : '';
      constraintLines.push(
        [
          `      // ${c.constraintType}:${esc(c.id, 'TypeScript')}${axisNote}`,
          `      if (i == ${a}) { let o = physIn_${safe}[${b}]; let d = p.pos - o.pos; let dist = length(d) + 1e-6; let n = d / dist; let C = dist - ${rest}; let w = p.invMass + o.invMass + 1e-6; p.pos -= n * (C * (p.invMass / w) * ${stiff}); }`,
          `      if (i == ${b}) { let o = physIn_${safe}[${a}]; let d = p.pos - o.pos; let dist = length(d) + 1e-6; let n = d / dist; let C = dist - ${rest}; let w = p.invMass + o.invMass + 1e-6; p.pos -= n * (C * (p.invMass / w) * ${stiff}); }`,
        ].join('\n')
      );
    } else if (c.constraintType === 'fixed') {
      const off = `vec3<f32>(${num(p, 'rest_x', 0).toFixed(4)}, ${num(p, 'rest_y', 0).toFixed(4)}, ${num(p, 'rest_z', 0).toFixed(4)})`;
      constraintLines.push(
        [
          `      // fixed:${esc(c.id, 'TypeScript')} — 3-DoF weld (rotational lock deferred)`,
          `      if (i == ${a}) { let o = physIn_${safe}[${b}]; let e = (o.pos - p.pos) - ${off}; let w = p.invMass + o.invMass + 1e-6; p.pos += e * (p.invMass / w); }`,
          `      if (i == ${b}) { let o = physIn_${safe}[${a}]; let e = (p.pos - o.pos) - ${off}; let w = p.invMass + o.invMass + 1e-6; p.pos -= e * (p.invMass / w); }`,
        ].join('\n')
      );
    } else {
      warnings.push(`unknown constraint "${c.constraintType}" (node "${c.id}") — skipped`);
      constraintLines.push(
        `      // unknown constraint ${esc(c.constraintType, 'TypeScript')}:${esc(c.id, 'TypeScript')} — skipped`
      );
    }
  }
  if (constraintLines.length === 0)
    constraintLines.push('      // no constraints declared — free integration only');

  const wgsl = [
    `// Physics Contract "${esc(field.name, 'TypeScript')}" — generated by HoloScript TSLCompiler`,
    `// bodies: ${field.bodies.length} | constraints: ${field.constraints.length} | gravity: [${field.gravity.join(', ')}] | substeps: ${substeps}`,
    `// Upload: physIn[i] = { pos, invMass (= mass>0 ? 1/mass : 0), vel, _pad } from the authored body stack.`,
    ...warnings.map((w) => `// WARNING: ${esc(w, 'TypeScript')}`),
    '',
    `struct PhysBody_${safe} {`,
    '  pos: vec3<f32>,',
    '  invMass: f32,',
    '  vel: vec3<f32>,',
    '  _pad: f32,',
    '};',
    '',
    `@group(0) @binding(0) var<storage, read> physIn_${safe}: array<PhysBody_${safe}>;`,
    `@group(0) @binding(1) var<storage, read_write> physOut_${safe}: array<PhysBody_${safe}>;`,
    `@group(0) @binding(2) var<uniform> physDt_${safe}: f32;`,
    '',
    '@compute @workgroup_size(64)',
    `fn ${fnName}(@builtin(global_invocation_id) gid: vec3<u32>) {`,
    `  let i = gid.x;`,
    `  if (i >= arrayLength(&physIn_${safe})) { return; }`,
    `  var p = physIn_${safe}[i];`,
    `  let subDt = physDt_${safe} / ${substeps}.0;`,
    `  for (var s = 0u; s < ${substeps}u; s = s + 1u) {`,
    '    if (p.invMass > 0.0) {',
    `      p.vel += ${g} * subDt;`,
    '      p.pos += p.vel * subDt;',
    '    }',
    ...constraintLines,
    '  }',
    `  physOut_${safe}[i] = p;`,
    '}',
  ].join('\n');

  return { fnName, wgsl };
}

// =============================================================================
// Physics Compilation
// =============================================================================

/** Compiled collider sub-block (box, sphere, capsule, mesh, convex) */
export interface CompiledCollider {
  type: 'collider' | 'trigger';
  shape?: string;
  properties: Record<string, unknown>;
}

/** Compiled rigidbody sub-block (mass, drag, angular_damping, use_gravity) */
export interface CompiledRigidbody {
  properties: Record<string, unknown>;
}

/** Compiled force field sub-block (gravity_zone, wind_zone, buoyancy_zone) */
export interface CompiledForceField {
  keyword: string;
  name?: string;
  properties: Record<string, unknown>;
}

/** Compiled joint sub-block within articulation */
export interface CompiledJoint {
  keyword: string;
  name?: string;
  properties: Record<string, unknown>;
}

export interface CompiledPhysics {
  keyword: string;
  name?: string;
  shape?: string;
  properties: Record<string, unknown>;
  /** Nested collider sub-blocks */
  colliders?: CompiledCollider[];
  /** Nested rigidbody sub-block (at most one) */
  rigidbody?: CompiledRigidbody;
  /** Nested force field sub-blocks */
  forceFields?: CompiledForceField[];
  /** Nested joint sub-blocks (for articulation) */
  joints?: CompiledJoint[];
}

export function compilePhysicsBlock(block: HoloDomainBlock): CompiledPhysics {
  const colliders: CompiledCollider[] = [];
  const forceFields: CompiledForceField[] = [];
  const joints: CompiledJoint[] = [];
  let rigidbody: CompiledRigidbody | undefined;

  for (const child of block.children || []) {
    const c = child as unknown as HoloDomainBlock;
    if (c.type !== 'DomainBlock') continue;

    const kw = c.keyword as string;
    if (kw === 'collider' || kw === 'trigger') {
      colliders.push({
        type: kw as 'collider' | 'trigger',
        shape: c.name, // shape stored as name for collider blocks
        properties: c.properties || {},
      });
    } else if (kw === 'rigidbody') {
      rigidbody = { properties: c.properties || {} };
    } else if (
      [
        'force_field',
        'gravity_zone',
        'wind_zone',
        'buoyancy_zone',
        'magnetic_field',
        'drag_zone',
      ].includes(kw)
    ) {
      forceFields.push({
        keyword: kw,
        name: c.name,
        properties: c.properties || {},
      });
    } else {
      // Joint sub-blocks (hinge, slider, ball_socket, etc.)
      joints.push({
        keyword: kw,
        name: c.name,
        properties: c.properties || {},
      });
    }
  }

  return {
    keyword: block.keyword,
    name: block.name,
    properties: block.properties || {},
    colliders: colliders.length > 0 ? colliders : undefined,
    rigidbody,
    forceFields: forceFields.length > 0 ? forceFields : undefined,
    joints: joints.length > 0 ? joints : undefined,
  };
}

// =============================================================================
// Particle / VFX Compilation
// =============================================================================

/** Compiled particle module sub-block (emission, velocity, color_over_life, etc.) */
export interface CompiledParticleModule {
  /** Module type keyword (emission, velocity, color_over_life, size_over_life, noise, etc.) */
  type: string;
  properties: Record<string, unknown>;
}

export interface CompiledParticleSystem {
  /** Keyword used (particles, emitter, vfx, particle_system) */
  keyword: string;
  name: string;
  /** Trait decorators (@looping, @burst, @gpu, etc.) */
  traits: string[];
  /** Top-level scalar properties (rate, max_particles, start_lifetime, etc.) */
  properties: Record<string, unknown>;
  /** Structured sub-module blocks (emission, velocity, color_over_life, etc.) */
  modules: CompiledParticleModule[];
}

export function compileParticleBlock(block: HoloDomainBlock): CompiledParticleSystem {
  const modules: CompiledParticleModule[] = [];

  for (const child of block.children || []) {
    const c = child as unknown as HoloDomainBlock;
    if (c.type === 'DomainBlock') {
      modules.push({
        type: c.keyword,
        properties: c.properties || {},
      });
    }
  }

  return {
    keyword: block.keyword,
    name: block.name || 'unnamed',
    traits: block.traits || [],
    properties: block.properties || {},
    modules,
  };
}

// =============================================================================
// Post-Processing Compilation
// =============================================================================

/** A single post-processing effect (bloom, depth_of_field, color_grading, etc.) */
export interface CompiledPostEffect {
  /** Effect type keyword (bloom, depth_of_field, vignette, etc.) */
  type: string;
  properties: Record<string, unknown>;
}

export interface CompiledPostProcessing {
  /** Keyword used (post_processing, post_fx, render_pipeline) */
  keyword: string;
  name?: string;
  /** Ordered list of effects in the pipeline */
  effects: CompiledPostEffect[];
}

export function compilePostProcessingBlock(block: HoloDomainBlock): CompiledPostProcessing {
  const effects: CompiledPostEffect[] = [];

  for (const child of block.children || []) {
    const c = child as unknown as HoloDomainBlock;
    if (c.type === 'DomainBlock') {
      effects.push({
        type: c.keyword,
        properties: c.properties || {},
      });
    }
  }

  return {
    keyword: block.keyword,
    name: block.name,
    effects,
  };
}

// =============================================================================
// Audio Source Compilation
// =============================================================================

export interface CompiledAudioSource {
  /** Keyword used (audio_source, audio_listener, reverb_zone, audio_mixer, ambience, sound_emitter) */
  keyword: string;
  name: string;
  /** Trait decorators (@spatial, @hrtf, @stereo, etc.) */
  traits: string[];
  /** Audio properties (clip, volume, pitch, spatial_blend, etc.) */
  properties: Record<string, unknown>;
}

export function compileAudioSourceBlock(block: HoloDomainBlock): CompiledAudioSource {
  return {
    keyword: block.keyword,
    name: block.name || 'unnamed',
    traits: block.traits || [],
    properties: block.properties || {},
  };
}

// =============================================================================
// Weather / Atmosphere Compilation
// =============================================================================

/** A single weather layer (rain, snow, wind, lightning, clouds, etc.) */
export interface CompiledWeatherLayer {
  /** Layer type keyword (rain, snow, wind, lightning, clouds, fog_layer, etc.) */
  type: string;
  properties: Record<string, unknown>;
  intensity?: number;
  color?: string;
}

export interface CompiledWeather {
  /** Keyword used (weather, atmosphere, sky, climate) */
  keyword: string;
  name?: string;
  /** Trait decorators (@dynamic, @cyclical, etc.) */
  traits: string[];
  /** Top-level scalar properties (intensity, transition_time, etc.) */
  properties: Record<string, unknown>;
  /** Structured weather layers (rain, snow, wind, lightning, clouds, etc.) */
  layers: CompiledWeatherLayer[];
  /** Wind configuration */
  wind?: { direction?: [number, number, number]; speed?: number };
}

export function compileWeatherBlock(block: HoloDomainBlock): CompiledWeather {
  const layers: CompiledWeatherLayer[] = [];

  for (const child of block.children || []) {
    const c = child as unknown as HoloDomainBlock;
    if (c.type === 'DomainBlock') {
      layers.push({
        type: c.keyword,
        properties: c.properties || {},
      });
    }
  }

  return {
    keyword: block.keyword,
    name: block.name,
    traits: block.traits || [],
    properties: block.properties || {},
    layers,
  };
}

// =============================================================================
// Target-Specific Code Generation Helpers
// =============================================================================

/** Quality tier context for scaling particle counts, materials, etc. */
export interface TierContext {
  particleScale: number;
  lodLevel: 'draft' | 'mesh' | 'final';
  maxLights: number;
  shadowMapSize: number;
  shaderComplexity: 'basic' | 'standard' | 'physical';
}

/** Generate R3F/Three.js particle system JSX */
export function particlesToR3F(ps: CompiledParticleSystem, tier?: TierContext): string {
  const scale = tier?.particleScale ?? 1.0;
  const props: string[] = [];
  if (ps.properties.rate)
    props.push(`rate={${Math.round((ps.properties.rate as number) * scale)}}`);
  if (ps.properties.max_particles)
    props.push(`maxParticles={${Math.round((ps.properties.max_particles as number) * scale)}}`);
  if (ps.properties.start_lifetime) {
    const lt = ps.properties.start_lifetime;
    props.push(Array.isArray(lt) ? `lifetime={[${lt.join(', ')}]}` : `lifetime={${lt}}`);
  }
  if (ps.properties.start_speed) {
    const sp = ps.properties.start_speed;
    props.push(Array.isArray(sp) ? `speed={[${sp.join(', ')}]}` : `speed={${sp}}`);
  }
  if (ps.properties.gravity_modifier !== undefined) {
    props.push(`gravityModifier={${ps.properties.gravity_modifier}}`);
  }

  const isLooping = ps.traits.includes('looping');
  if (isLooping) props.push('loop');

  const modulesJSX = ps.modules
    .map((m) => {
      const mProps = Object.entries(m.properties)
        .map(([k, v]) => {
          const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          return typeof v === 'string' ? `${camel}="${v}"` : `${camel}={${JSON.stringify(v)}}`;
        })
        .join(' ');
      return `  <${m.type} ${mProps} />`;
    })
    .join('\n');

  return [`<ParticleSystem name="${ps.name}" ${props.join(' ')}>`, modulesJSX, '</ParticleSystem>']
    .filter(Boolean)
    .join('\n');
}

/** Generate R3F/Three.js post-processing JSX (react-postprocessing) */
export function postProcessingToR3F(pp: CompiledPostProcessing): string {
  const effectsJSX = pp.effects
    .map((e) => {
      const componentName = e.type
        .split('_')
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join('');
      const props = Object.entries(e.properties)
        .map(([k, v]) => {
          const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          return typeof v === 'string' ? `${camel}="${v}"` : `${camel}={${JSON.stringify(v)}}`;
        })
        .join(' ');
      return `  <${componentName} ${props} />`;
    })
    .join('\n');

  return ['<EffectComposer>', effectsJSX, '</EffectComposer>'].join('\n');
}

/** Generate R3F/Three.js audio source JSX */
export function audioSourceToR3F(audio: CompiledAudioSource): string {
  const spatialBlend =
    typeof audio.properties.spatial_blend === 'number' ? audio.properties.spatial_blend : 0;
  const isSpatial = audio.traits.includes('spatial') || spatialBlend > 0;
  const tag = isSpatial ? 'PositionalAudio' : 'Audio';

  const props: string[] = [];
  if (audio.properties.clip) props.push(`url="${audio.properties.clip}"`);
  if (audio.properties.volume !== undefined) props.push(`volume={${audio.properties.volume}}`);
  if (audio.properties.loop !== undefined) props.push(`loop={${audio.properties.loop}}`);
  if (isSpatial && audio.properties.max_distance) {
    props.push(`distance={${audio.properties.max_distance}}`);
  }
  if (audio.properties.play_on_awake) props.push('autoplay');

  return `<${tag} name="${audio.name}" ${props.join(' ')} />`;
}

/** Generate USD weather/atmosphere representation */
export function weatherToUSD(weather: CompiledWeather): string {
  const lines: string[] = [`def Scope "${weather.name || 'Weather'}" {`];

  for (const [key, value] of Object.entries(weather.properties)) {
    lines.push(
      `    custom ${typeof value === 'number' ? 'float' : 'string'} ${key} = ${JSON.stringify(value)}`
    );
  }

  for (const layer of weather.layers) {
    lines.push(`    def Scope "${layer.type}" {`);
    for (const [key, value] of Object.entries(layer.properties)) {
      const usdType =
        typeof value === 'number'
          ? 'float'
          : typeof value === 'boolean'
            ? 'bool'
            : Array.isArray(value)
              ? 'float3'
              : 'string';
      const usdVal = Array.isArray(value) ? `(${value.join(', ')})` : JSON.stringify(value);
      lines.push(`        custom ${usdType} ${key} = ${usdVal}`);
    }
    lines.push('    }');
  }

  lines.push('}');
  return lines.join('\n');
}

/** Generate R3F/Three.js material JSX */
export function materialToR3F(mat: CompiledMaterial, tier?: TierContext): string {
  // Tier-based material downgrade: basic tier uses meshBasicMaterial for all
  const shaderLevel = tier?.shaderComplexity ?? 'physical';
  if (shaderLevel === 'basic' && mat.type !== 'unlit') {
    const props = [
      mat.baseColor ? `color="${mat.baseColor}"` : '',
      mat.opacity !== undefined ? `opacity={${mat.opacity}} transparent` : '',
    ]
      .filter(Boolean)
      .join(' ');
    return `<meshBasicMaterial ${props} />`;
  }

  if (mat.type === 'unlit') {
    const props = [
      mat.emissiveColor ? `emissive="${mat.emissiveColor}"` : '',
      mat.emissiveIntensity ? `emissiveIntensity={${mat.emissiveIntensity}}` : '',
      mat.opacity !== undefined ? `opacity={${mat.opacity}} transparent` : '',
    ]
      .filter(Boolean)
      .join(' ');
    return `<meshBasicMaterial ${props} />`;
  }

  const props = [
    mat.baseColor ? `color="${mat.baseColor}"` : '',
    mat.roughness !== undefined ? `roughness={${mat.roughness}}` : '',
    mat.metallic !== undefined ? `metalness={${mat.metallic}}` : '',
    mat.opacity !== undefined ? `opacity={${mat.opacity}} transparent` : '',
    mat.emissiveColor ? `emissive="${mat.emissiveColor}"` : '',
    mat.emissiveIntensity ? `emissiveIntensity={${mat.emissiveIntensity}}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const textures = Object.entries(mat.textureMaps)
    .map(([type, path]) => {
      const propName = type.replace(/_map$/, 'Map').replace(/^albedo/, '');
      return `${propName}={useTexture("${path}")}`;
    })
    .join(' ');

  // Promote to MeshPhysicalMaterial when the material declares a physical effect
  // (clearcoat/transmission/sheen/iridescence/…). StandardMaterial cannot express
  // these — emitting them on it would be silently dropped. `ior` rides along on
  // physical only (StandardMaterial has no ior).
  if (isPhysicalMaterial(mat)) {
    const physical = [
      mat.ior !== undefined ? `ior={${mat.ior}}` : '',
      mat.clearcoat !== undefined ? `clearcoat={${mat.clearcoat}}` : '',
      mat.clearcoatRoughness !== undefined ? `clearcoatRoughness={${mat.clearcoatRoughness}}` : '',
      mat.transmission !== undefined ? `transmission={${mat.transmission}}` : '',
      mat.thickness !== undefined ? `thickness={${mat.thickness}}` : '',
      mat.sheen !== undefined ? `sheen={${mat.sheen}}` : '',
      mat.sheenColor ? `sheenColor="${mat.sheenColor}"` : '',
      mat.sheenRoughness !== undefined ? `sheenRoughness={${mat.sheenRoughness}}` : '',
      mat.specularIntensity !== undefined ? `specularIntensity={${mat.specularIntensity}}` : '',
      mat.iridescence !== undefined ? `iridescence={${mat.iridescence}}` : '',
      mat.attenuationColor ? `attenuationColor="${mat.attenuationColor}"` : '',
      mat.attenuationDistance !== undefined
        ? `attenuationDistance={${mat.attenuationDistance}}`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
    return `<meshPhysicalMaterial ${props} ${physical} ${textures} />`;
  }

  return `<meshStandardMaterial ${props} ${textures} />`;
}

/** Generate USD material prim */
export function materialToUSD(mat: CompiledMaterial): string {
  const lines: string[] = [
    `def Material "${mat.name}" {`,
    `    token outputs:surface.connect = <${mat.name}/PBRShader.outputs:surface>`,
    `    def Shader "PBRShader" {`,
    `        uniform token info:id = "UsdPreviewSurface"`,
  ];
  if (mat.baseColor)
    lines.push(`        color3f inputs:diffuseColor = (${hexToRGB(mat.baseColor)})`);
  if (mat.roughness !== undefined) lines.push(`        float inputs:roughness = ${mat.roughness}`);
  if (mat.metallic !== undefined) lines.push(`        float inputs:metallic = ${mat.metallic}`);
  if (mat.opacity !== undefined) lines.push(`        float inputs:opacity = ${mat.opacity}`);
  if (mat.ior !== undefined) lines.push(`        float inputs:ior = ${mat.ior}`);

  // Emissive — scale color by intensity since USD has no separate intensity input
  if (mat.emissiveColor) {
    const rgb = hexToRGB(mat.emissiveColor).split(', ').map(Number);
    const intensity = mat.emissiveIntensity ?? 1;
    const scaled = rgb.map((c) => Math.min(1, c * intensity));
    lines.push(`        color3f inputs:emissiveColor = (${scaled.join(', ')})`);
  }

  lines.push(`        token outputs:surface`);
  lines.push(`    }`);

  // Texture reader nodes
  const texEntries = Object.entries(mat.textureMaps);
  if (texEntries.length > 0) {
    const TEX_MAP: Record<string, { input: string; type: string }> = {
      albedo_map: { input: 'diffuseColor', type: 'rgb' },
      normal_map: { input: 'normal', type: 'rgb' },
      roughness_map: { input: 'roughness', type: 'r' },
      metallic_map: { input: 'metallic', type: 'r' },
      ao_map: { input: 'occlusion', type: 'r' },
      emission_map: { input: 'emissiveColor', type: 'rgb' },
      displacement_map: { input: 'displacement', type: 'r' },
    };

    lines.push(`    def Shader "stReader" {`);
    lines.push(`        uniform token info:id = "UsdPrimvarReader_float2"`);
    lines.push(`        token inputs:varname = "st"`);
    lines.push(`        float2 outputs:result`);
    lines.push(`    }`);

    for (const [channel, path] of texEntries) {
      const mapping = TEX_MAP[channel];
      if (!mapping) continue;
      const readerName = `${mapping.input}Texture`;
      lines.push(`    def Shader "${readerName}" {`);
      lines.push(`        uniform token info:id = "UsdUVTexture"`);
      lines.push(`        asset inputs:file = @textures/${path}@`);
      lines.push(`        float2 inputs:st.connect = <${mat.name}/stReader.outputs:result>`);
      if (mapping.type === 'rgb') {
        lines.push(`        color3f outputs:rgb`);
      } else {
        lines.push(`        float outputs:r`);
      }
      lines.push(`    }`);
    }
  }

  lines.push(`}`);
  return lines.join('\n');
}

/** Generate glTF material object */
export function materialToGLTF(mat: CompiledMaterial): object {
  const gltfMat: Record<string, unknown> = { name: mat.name };
  if (mat.type === 'pbr' || mat.type === 'shader') {
    gltfMat.pbrMetallicRoughness = {
      baseColorFactor: mat.baseColor ? hexToRGBA(mat.baseColor, mat.opacity ?? 1) : [1, 1, 1, 1],
      metallicFactor: mat.metallic ?? 0,
      roughnessFactor: mat.roughness ?? 0.5,
    };
  }
  if (mat.emissiveColor) {
    gltfMat.emissiveFactor = hexToRGB(mat.emissiveColor).split(', ').map(Number);
  }
  return gltfMat;
}

/** Map joint keyword to URDF joint type */
function jointKeywordToURDF(keyword: string): string {
  switch (keyword) {
    case 'hinge':
      return 'revolute';
    case 'slider':
    case 'prismatic':
      return 'prismatic';
    case 'ball_socket':
      return 'ball';
    case 'fixed_joint':
      return 'fixed';
    case 'd6_joint':
      return 'floating';
    case 'spring_joint':
      return 'revolute'; // closest URDF equivalent
    default:
      return 'fixed';
  }
}

/** Generate URDF collider as collision element */
function colliderToURDF(collider: CompiledCollider): string {
  const shape = collider.shape || 'box';
  const props = collider.properties;
  const lines = ['  <collision>'];

  switch (shape) {
    case 'sphere':
      lines.push(`    <geometry><sphere radius="${props.radius || 0.5}"/></geometry>`);
      break;
    case 'capsule':
      lines.push(
        `    <geometry><cylinder radius="${props.radius || 0.5}" length="${props.height || 1.0}"/></geometry>`
      );
      break;
    case 'box':
    default: {
      const size = Array.isArray(props.size) ? props.size.join(' ') : '1 1 1';
      lines.push(`    <geometry><box size="${size}"/></geometry>`);
      break;
    }
  }

  lines.push('  </collision>');
  return lines.join('\n');
}

/** Generate URDF inertial element from rigidbody */
function rigidbodyToURDF(rb: CompiledRigidbody): string {
  const mass = rb.properties.mass ?? 1.0;
  const inertiaValues = Array.isArray(rb.properties.inertia) ? rb.properties.inertia : undefined;
  return [
    '  <inertial>',
    `    <mass value="${mass}"/>`,
    inertiaValues
      ? `    <inertia ixx="${inertiaValues[0] || 0}" iyy="${inertiaValues[1] || 0}" izz="${inertiaValues[2] || 0}" ixy="0" ixz="0" iyz="0"/>`
      : `    <inertia ixx="0.01" iyy="0.01" izz="0.01" ixy="0" ixz="0" iyz="0"/>`,
    '  </inertial>',
  ].join('\n');
}

/** Generate URDF physics joint */
export function physicsToURDF(physics: CompiledPhysics): string {
  const parts: string[] = [];

  // Articulation with joint sub-blocks
  if (physics.keyword === 'articulation') {
    const joints = (physics.joints || []).map((j) => {
      const props = j.properties;
      const limitsValues = Array.isArray(props.limits) ? props.limits : undefined;
      return [
        `  <joint name="${j.name}" type="${jointKeywordToURDF(j.keyword)}">`,
        props.axis
          ? `    <axis xyz="${Array.isArray(props.axis) ? props.axis.join(' ') : '0 0 1'}"/>`
          : '',
        limitsValues ? `    <limit lower="${limitsValues[0]}" upper="${limitsValues[1]}"/>` : '',
        props.damping ? `    <dynamics damping="${props.damping}"/>` : '',
        `  </joint>`,
      ]
        .filter(Boolean)
        .join('\n');
    });
    parts.push(...joints);
  }

  // Collider sub-blocks -> URDF collision elements
  if (physics.colliders) {
    for (const collider of physics.colliders) {
      parts.push(colliderToURDF(collider));
    }
  }

  // Rigidbody sub-block -> URDF inertial element
  if (physics.rigidbody) {
    parts.push(rigidbodyToURDF(physics.rigidbody));
  }

  // Force fields -> URDF comments (no direct URDF equivalent)
  if (physics.forceFields) {
    for (const ff of physics.forceFields) {
      parts.push(
        `  <!-- ${ff.keyword} "${ff.name || ''}" strength="${ff.properties.strength || 0}" -->`
      );
    }
  }

  if (parts.length > 0) return parts.join('\n');
  return `<!-- ${physics.keyword} ${physics.name || ''} -->`;
}

// =============================================================================
// Unity (C#) Target Helpers
// =============================================================================

/** Generate Unity C# material setup code */
export function materialToUnity(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Material: ${mat.name}`);
  lines.push(
    `var ${varPrefix}Mat = new Material(Shader.Find("${mat.type === 'unlit' ? 'Unlit/Color' : 'Standard'}"));`
  );
  if (mat.baseColor) lines.push(`${varPrefix}Mat.color = ${hexToUnityColor(mat.baseColor)};`);
  if (mat.roughness !== undefined)
    lines.push(`${varPrefix}Mat.SetFloat("_Smoothness", ${(1 - mat.roughness).toFixed(3)}f);`);
  if (mat.metallic !== undefined)
    lines.push(`${varPrefix}Mat.SetFloat("_Metallic", ${mat.metallic}f);`);
  if (mat.opacity !== undefined && mat.opacity < 1) {
    lines.push(`${varPrefix}Mat.SetFloat("_Mode", 3); // Transparent`);
    lines.push(
      `${varPrefix}Mat.color = new Color(${varPrefix}Mat.color.r, ${varPrefix}Mat.color.g, ${varPrefix}Mat.color.b, ${mat.opacity}f);`
    );
  }
  if (mat.emissiveColor) {
    lines.push(`${varPrefix}Mat.EnableKeyword("_EMISSION");`);
    lines.push(
      `${varPrefix}Mat.SetColor("_EmissionColor", ${hexToUnityColor(mat.emissiveColor)}${mat.emissiveIntensity ? ` * ${mat.emissiveIntensity}f` : ''});`
    );
  }
  for (const [mapType, path] of Object.entries(mat.textureMaps)) {
    const shaderProp =
      mapType === 'albedo_map'
        ? '_MainTex'
        : mapType === 'normal_map'
          ? '_BumpMap'
          : mapType === 'metallic_map'
            ? '_MetallicGlossMap'
            : mapType === 'roughness_map'
              ? '_SpecGlossMap'
              : mapType === 'emission_map'
                ? '_EmissionMap'
                : mapType === 'occlusion_map'
                  ? '_OcclusionMap'
                  : `_${mapType.replace(/_map$/, '')}`;
    lines.push(
      `${varPrefix}Mat.SetTexture("${shaderProp}", Resources.Load<Texture2D>("${path}"));`
    );
  }
  return lines.join('\n');
}

/** Generate Unity C# physics setup code */
export function physicsToUnity(physics: CompiledPhysics, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Physics: ${physics.keyword} "${physics.name || ''}"`);

  if (physics.rigidbody) {
    lines.push(`var ${varPrefix}RB = ${varPrefix}GO.AddComponent<Rigidbody>();`);
    const rb = physics.rigidbody.properties;
    if (rb.mass !== undefined) lines.push(`${varPrefix}RB.mass = ${rb.mass}f;`);
    if (rb.drag !== undefined) lines.push(`${varPrefix}RB.drag = ${rb.drag}f;`);
    if (rb.angular_damping !== undefined)
      lines.push(`${varPrefix}RB.angularDrag = ${rb.angular_damping}f;`);
    if (rb.use_gravity === false) lines.push(`${varPrefix}RB.useGravity = false;`);
  }

  if (physics.colliders) {
    for (let i = 0; i < physics.colliders.length; i++) {
      const c = physics.colliders[i];
      const shape = c.shape || 'box';
      const colVar = `${varPrefix}Col${i}`;
      if (shape === 'sphere') {
        lines.push(`var ${colVar} = ${varPrefix}GO.AddComponent<SphereCollider>();`);
        if (c.properties.radius) lines.push(`${colVar}.radius = ${c.properties.radius}f;`);
      } else if (shape === 'capsule') {
        lines.push(`var ${colVar} = ${varPrefix}GO.AddComponent<CapsuleCollider>();`);
        if (c.properties.radius) lines.push(`${colVar}.radius = ${c.properties.radius}f;`);
        if (c.properties.height) lines.push(`${colVar}.height = ${c.properties.height}f;`);
      } else {
        lines.push(`var ${colVar} = ${varPrefix}GO.AddComponent<BoxCollider>();`);
        if (c.properties.size && Array.isArray(c.properties.size)) {
          lines.push(`${colVar}.size = new Vector3(${c.properties.size.join('f, ')}f);`);
        }
      }
      if (c.type === 'trigger') lines.push(`${colVar}.isTrigger = true;`);
    }
  }

  if (physics.forceFields) {
    for (const ff of physics.forceFields) {
      if (ff.keyword === 'wind_zone') {
        lines.push(`var ${varPrefix}Wind = ${varPrefix}GO.AddComponent<WindZone>();`);
        if (ff.properties.strength)
          lines.push(`${varPrefix}Wind.windMain = ${ff.properties.strength}f;`);
      } else {
        lines.push(`// ${ff.keyword} "${ff.name || ''}": ${JSON.stringify(ff.properties)}`);
      }
    }
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      lines.push(`// Joint: ${j.keyword} "${j.name || ''}" — use ConfigurableJoint or HingeJoint`);
    }
  }

  return lines.join('\n');
}

/** Generate Unity C# particle system setup code */
export function particlesToUnity(ps: CompiledParticleSystem, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Particles: ${ps.name}`);
  lines.push(`var ${varPrefix}PS = ${varPrefix}GO.AddComponent<ParticleSystem>();`);
  lines.push(`var ${varPrefix}Main = ${varPrefix}PS.main;`);
  if (ps.properties.max_particles)
    lines.push(`${varPrefix}Main.maxParticles = ${ps.properties.max_particles};`);
  if (ps.properties.start_lifetime) {
    const lt = ps.properties.start_lifetime;
    lines.push(`${varPrefix}Main.startLifetime = ${Array.isArray(lt) ? lt[0] : lt}f;`);
  }
  if (ps.properties.start_speed) {
    const sp = ps.properties.start_speed;
    lines.push(`${varPrefix}Main.startSpeed = ${Array.isArray(sp) ? sp[0] : sp}f;`);
  }
  if (ps.properties.gravity_modifier !== undefined) {
    lines.push(`${varPrefix}Main.gravityModifier = ${ps.properties.gravity_modifier}f;`);
  }
  if (ps.traits.includes('looping')) lines.push(`${varPrefix}Main.loop = true;`);

  for (const m of ps.modules) {
    lines.push(`// Module: ${m.type} — ${JSON.stringify(m.properties)}`);
  }
  return lines.join('\n');
}

/** Generate Unity C# post-processing setup code */
export function postProcessingToUnity(pp: CompiledPostProcessing): string {
  const lines: string[] = [];
  lines.push('// Post-Processing (URP Volume Profile)');
  for (const e of pp.effects) {
    const className = e.type
      .split('_')
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join('');
    lines.push(`// Effect: ${className}`);
    for (const [k, v] of Object.entries(e.properties)) {
      lines.push(`//   ${k} = ${JSON.stringify(v)}`);
    }
  }
  return lines.join('\n');
}

/** Generate Unity C# audio source setup code */
export function audioSourceToUnity(audio: CompiledAudioSource, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Audio: ${audio.name} (${audio.keyword})`);
  if (audio.keyword === 'reverb_zone') {
    lines.push(`var ${varPrefix}Reverb = ${varPrefix}GO.AddComponent<AudioReverbZone>();`);
    if (audio.properties.min_distance)
      lines.push(`${varPrefix}Reverb.minDistance = ${audio.properties.min_distance}f;`);
    if (audio.properties.max_distance)
      lines.push(`${varPrefix}Reverb.maxDistance = ${audio.properties.max_distance}f;`);
  } else {
    lines.push(`var ${varPrefix}AS = ${varPrefix}GO.AddComponent<AudioSource>();`);
    if (audio.properties.clip)
      lines.push(
        `${varPrefix}AS.clip = Resources.Load<AudioClip>("Audio/${audio.properties.clip}");`
      );
    if (audio.properties.volume !== undefined)
      lines.push(`${varPrefix}AS.volume = ${audio.properties.volume}f;`);
    if (audio.properties.loop !== undefined)
      lines.push(`${varPrefix}AS.loop = ${audio.properties.loop};`);
    if (audio.properties.spatial_blend !== undefined)
      lines.push(`${varPrefix}AS.spatialBlend = ${audio.properties.spatial_blend}f;`);
    if (audio.properties.max_distance)
      lines.push(`${varPrefix}AS.maxDistance = ${audio.properties.max_distance}f;`);
    if (audio.traits.includes('spatial') || audio.traits.includes('hrtf')) {
      lines.push(`${varPrefix}AS.spatialBlend = 1.0f;`);
    }
    if (audio.properties.play_on_awake) lines.push(`${varPrefix}AS.playOnAwake = true;`);
  }
  return lines.join('\n');
}

/** Generate Unity C# weather setup code */
export function weatherToUnity(weather: CompiledWeather): string {
  const lines: string[] = [];
  lines.push(`// Weather: ${weather.keyword} "${weather.name || ''}"`);
  for (const layer of weather.layers) {
    lines.push(`// Layer: ${layer.type} — ${JSON.stringify(layer.properties)}`);
  }
  if (weather.properties.intensity !== undefined) {
    lines.push(`// Intensity: ${weather.properties.intensity}`);
  }
  return lines.join('\n');
}

// =============================================================================
// Unreal Engine (C++) Target Helpers
// =============================================================================

/** Generate Unreal C++ material setup code */
export function materialToUnreal(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Material: ${mat.name}`);
  lines.push(`UMaterialInstanceDynamic* ${varPrefix}Mat = UMaterialInstanceDynamic::Create(`);
  lines.push(
    `    LoadObject<UMaterial>(nullptr, TEXT("/Game/Materials/M_${mat.type === 'unlit' ? 'Unlit' : 'PBR'}")), this);`
  );
  if (mat.baseColor) {
    const [r, g, b] = hexToRGBTuple(mat.baseColor);
    lines.push(
      `${varPrefix}Mat->SetVectorParameterValue(TEXT("BaseColor"), FLinearColor(${r}f, ${g}f, ${b}f));`
    );
  }
  if (mat.roughness !== undefined)
    lines.push(`${varPrefix}Mat->SetScalarParameterValue(TEXT("Roughness"), ${mat.roughness}f);`);
  if (mat.metallic !== undefined)
    lines.push(`${varPrefix}Mat->SetScalarParameterValue(TEXT("Metallic"), ${mat.metallic}f);`);
  if (mat.opacity !== undefined)
    lines.push(`${varPrefix}Mat->SetScalarParameterValue(TEXT("Opacity"), ${mat.opacity}f);`);
  if (mat.emissiveColor) {
    const [r, g, b] = hexToRGBTuple(mat.emissiveColor);
    const intensity = mat.emissiveIntensity ?? 1;
    lines.push(
      `${varPrefix}Mat->SetVectorParameterValue(TEXT("EmissiveColor"), FLinearColor(${r * intensity}f, ${g * intensity}f, ${b * intensity}f));`
    );
  }
  for (const [mapType, path] of Object.entries(mat.textureMaps)) {
    lines.push(
      `${varPrefix}Mat->SetTextureParameterValue(TEXT("${mapType}"), LoadObject<UTexture2D>(nullptr, TEXT("/Game/Textures/${path}")));`
    );
  }
  return lines.join('\n');
}

/** Generate Unreal C++ physics setup code */
export function physicsToUnreal(physics: CompiledPhysics, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Physics: ${physics.keyword} "${physics.name || ''}"`);

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    lines.push(`${varPrefix}Mesh->SetSimulatePhysics(true);`);
    if (rb.mass !== undefined)
      lines.push(`${varPrefix}Mesh->SetMassOverrideInKg(NAME_None, ${rb.mass}f);`);
    if (rb.drag !== undefined) lines.push(`${varPrefix}Mesh->SetLinearDamping(${rb.drag}f);`);
    if (rb.angular_damping !== undefined)
      lines.push(`${varPrefix}Mesh->SetAngularDamping(${rb.angular_damping}f);`);
    if (rb.use_gravity === false) lines.push(`${varPrefix}Mesh->SetEnableGravity(false);`);
  }

  if (physics.colliders) {
    for (const c of physics.colliders) {
      const shape = c.shape || 'box';
      if (shape === 'sphere') {
        lines.push(
          `auto* ${varPrefix}Sphere = CreateDefaultSubobject<USphereComponent>(TEXT("${varPrefix}Sphere"));`
        );
        if (c.properties.radius)
          lines.push(`${varPrefix}Sphere->SetSphereRadius(${c.properties.radius}f);`);
      } else if (shape === 'capsule') {
        lines.push(
          `auto* ${varPrefix}Capsule = CreateDefaultSubobject<UCapsuleComponent>(TEXT("${varPrefix}Capsule"));`
        );
      } else {
        lines.push(
          `auto* ${varPrefix}Box = CreateDefaultSubobject<UBoxComponent>(TEXT("${varPrefix}Box"));`
        );
      }
    }
  }

  if (physics.forceFields) {
    for (const ff of physics.forceFields) {
      lines.push(
        `// Force field: ${ff.keyword} "${ff.name || ''}" — ${JSON.stringify(ff.properties)}`
      );
    }
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      lines.push(
        `auto* ${varPrefix}Constraint = CreateDefaultSubobject<UPhysicsConstraintComponent>(TEXT("${j.name || varPrefix + 'Joint'}"));`
      );
      lines.push(`// Joint type: ${j.keyword} — configure constraint limits`);
    }
  }

  return lines.join('\n');
}

/** Generate Unreal C++ Niagara particle system code */
export function particlesToUnreal(ps: CompiledParticleSystem, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Niagara Particles: ${ps.name}`);
  lines.push(
    `auto* ${varPrefix}Niagara = CreateDefaultSubobject<UNiagaraComponent>(TEXT("${ps.name}"));`
  );
  lines.push(`${varPrefix}Niagara->SetupAttachment(RootComponent);`);
  if (ps.properties.rate)
    lines.push(`${varPrefix}Niagara->SetVariableFloat(TEXT("SpawnRate"), ${ps.properties.rate}f);`);
  if (ps.properties.start_lifetime)
    lines.push(
      `${varPrefix}Niagara->SetVariableFloat(TEXT("Lifetime"), ${Array.isArray(ps.properties.start_lifetime) ? ps.properties.start_lifetime[0] : ps.properties.start_lifetime}f);`
    );
  if (ps.traits.includes('looping'))
    lines.push(`${varPrefix}Niagara->SetVariableBool(TEXT("Looping"), true);`);
  for (const m of ps.modules) {
    lines.push(`// Module: ${m.type} — ${JSON.stringify(m.properties)}`);
  }
  return lines.join('\n');
}

/** Generate Unreal C++ post-processing setup code */
export function postProcessingToUnreal(pp: CompiledPostProcessing, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Post-Processing: ${pp.keyword}`);
  lines.push(
    `auto* ${varPrefix}PP = CreateDefaultSubobject<UPostProcessComponent>(TEXT("PostProcess"));`
  );
  lines.push(`${varPrefix}PP->SetupAttachment(RootComponent);`);
  for (const e of pp.effects) {
    if (e.type === 'bloom') {
      lines.push(`${varPrefix}PP->Settings.bOverride_BloomIntensity = true;`);
      if (e.properties.intensity)
        lines.push(`${varPrefix}PP->Settings.BloomIntensity = ${e.properties.intensity}f;`);
      if (e.properties.threshold)
        lines.push(`${varPrefix}PP->Settings.BloomThreshold = ${e.properties.threshold}f;`);
    } else if (e.type === 'depth_of_field') {
      lines.push(`${varPrefix}PP->Settings.bOverride_DepthOfFieldFocalDistance = true;`);
      if (e.properties.focal_distance)
        lines.push(
          `${varPrefix}PP->Settings.DepthOfFieldFocalDistance = ${e.properties.focal_distance}f;`
        );
    } else {
      lines.push(`// Effect: ${e.type} — ${JSON.stringify(e.properties)}`);
    }
  }
  return lines.join('\n');
}

/** Generate Unreal C++ audio component code */
export function audioSourceToUnreal(audio: CompiledAudioSource, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Audio: ${audio.name} (${audio.keyword})`);
  lines.push(
    `auto* ${varPrefix}Audio = CreateDefaultSubobject<UAudioComponent>(TEXT("${audio.name}"));`
  );
  lines.push(`${varPrefix}Audio->SetupAttachment(RootComponent);`);
  if (audio.properties.clip)
    lines.push(
      `${varPrefix}Audio->SetSound(LoadObject<USoundWave>(nullptr, TEXT("/Game/Audio/${audio.properties.clip}")));`
    );
  if (audio.properties.volume !== undefined)
    lines.push(`${varPrefix}Audio->SetVolumeMultiplier(${audio.properties.volume}f);`);
  if (audio.properties.loop !== undefined)
    lines.push(`${varPrefix}Audio->bIsLooping = ${audio.properties.loop ? 'true' : 'false'};`);
  if (
    audio.traits.includes('spatial') ||
    (typeof audio.properties.spatial_blend === 'number' && audio.properties.spatial_blend > 0)
  ) {
    lines.push(`${varPrefix}Audio->bOverrideAttenuation = true;`);
    if (audio.properties.max_distance)
      lines.push(
        `${varPrefix}Audio->AttenuationOverrides.FalloffDistance = ${audio.properties.max_distance}f;`
      );
  }
  if (audio.properties.play_on_awake) lines.push(`${varPrefix}Audio->bAutoActivate = true;`);
  return lines.join('\n');
}

/** Generate Unreal weather/atmosphere comment block */
export function weatherToUnreal(weather: CompiledWeather): string {
  const lines: string[] = [];
  lines.push(`// Weather: ${weather.keyword} "${weather.name || ''}"`);
  lines.push('// Use UltraDynamicSky or custom weather system');
  for (const layer of weather.layers) {
    lines.push(`// Layer: ${layer.type} — ${JSON.stringify(layer.properties)}`);
  }
  return lines.join('\n');
}

// =============================================================================
// Godot (GDScript) Target Helpers
// =============================================================================

/** Generate Godot GDScript material setup code */
export function materialToGodot(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`# Material: ${mat.name}`);
  if (mat.type === 'unlit') {
    lines.push(`var ${varPrefix}_mat = StandardMaterial3D.new()`);
    lines.push(`${varPrefix}_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED`);
  } else {
    lines.push(`var ${varPrefix}_mat = StandardMaterial3D.new()`);
  }
  if (mat.baseColor) lines.push(`${varPrefix}_mat.albedo_color = Color.html("${mat.baseColor}")`);
  if (mat.roughness !== undefined) lines.push(`${varPrefix}_mat.roughness = ${mat.roughness}`);
  if (mat.metallic !== undefined) lines.push(`${varPrefix}_mat.metallic = ${mat.metallic}`);
  if (mat.opacity !== undefined && mat.opacity < 1) {
    lines.push(`${varPrefix}_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA`);
    lines.push(`${varPrefix}_mat.albedo_color.a = ${mat.opacity}`);
  }
  if (mat.emissiveColor) {
    lines.push(`${varPrefix}_mat.emission_enabled = true`);
    lines.push(`${varPrefix}_mat.emission = Color.html("${mat.emissiveColor}")`);
    if (mat.emissiveIntensity)
      lines.push(`${varPrefix}_mat.emission_energy_multiplier = ${mat.emissiveIntensity}`);
  }
  for (const [mapType, path] of Object.entries(mat.textureMaps)) {
    const prop =
      mapType === 'albedo_map'
        ? 'albedo_texture'
        : mapType === 'normal_map'
          ? 'normal_texture'
          : mapType === 'metallic_map'
            ? 'metallic_texture'
            : mapType === 'roughness_map'
              ? 'roughness_texture'
              : mapType === 'emission_map'
                ? 'emission_texture'
                : `${mapType.replace(/_map$/, '_texture')}`;
    lines.push(`${varPrefix}_mat.${prop} = load("res://${path}")`);
  }
  return lines.join('\n');
}

/** Generate Godot GDScript physics setup code */
export function physicsToGodot(physics: CompiledPhysics, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`# Physics: ${physics.keyword} "${physics.name || ''}"`);

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    lines.push(`var ${varPrefix}_rb = RigidBody3D.new()`);
    if (rb.mass !== undefined) lines.push(`${varPrefix}_rb.mass = ${rb.mass}`);
    if (rb.drag !== undefined) lines.push(`${varPrefix}_rb.linear_damp = ${rb.drag}`);
    if (rb.angular_damping !== undefined)
      lines.push(`${varPrefix}_rb.angular_damp = ${rb.angular_damping}`);
    if (rb.use_gravity === false) lines.push(`${varPrefix}_rb.gravity_scale = 0.0`);
  }

  if (physics.colliders) {
    for (let i = 0; i < physics.colliders.length; i++) {
      const c = physics.colliders[i];
      const shape = c.shape || 'box';
      if (shape === 'sphere') {
        lines.push(`var ${varPrefix}_col${i} = CollisionShape3D.new()`);
        lines.push(`${varPrefix}_col${i}.shape = SphereShape3D.new()`);
        if (c.properties.radius)
          lines.push(`${varPrefix}_col${i}.shape.radius = ${c.properties.radius}`);
      } else if (shape === 'capsule') {
        lines.push(`var ${varPrefix}_col${i} = CollisionShape3D.new()`);
        lines.push(`${varPrefix}_col${i}.shape = CapsuleShape3D.new()`);
      } else {
        lines.push(`var ${varPrefix}_col${i} = CollisionShape3D.new()`);
        lines.push(`${varPrefix}_col${i}.shape = BoxShape3D.new()`);
      }
    }
  }

  if (physics.forceFields) {
    for (const ff of physics.forceFields) {
      lines.push(
        `# Force field: ${ff.keyword} "${ff.name || ''}" — ${JSON.stringify(ff.properties)}`
      );
    }
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      const jointType =
        j.keyword === 'hinge'
          ? 'HingeJoint3D'
          : j.keyword === 'slider'
            ? 'SliderJoint3D'
            : 'Generic6DOFJoint3D';
      lines.push(`var ${varPrefix}_joint = ${jointType}.new()`);
      lines.push(`# Joint: ${j.keyword} "${j.name || ''}" — ${JSON.stringify(j.properties)}`);
    }
  }

  return lines.join('\n');
}

/** Generate Godot GDScript particle system code */
export function particlesToGodot(ps: CompiledParticleSystem, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`# Particles: ${ps.name}`);
  lines.push(`var ${varPrefix}_particles = GPUParticles3D.new()`);
  lines.push(`${varPrefix}_particles.name = "${ps.name}"`);
  if (ps.properties.max_particles)
    lines.push(`${varPrefix}_particles.amount = ${ps.properties.max_particles}`);
  if (ps.properties.start_lifetime) {
    const lt = Array.isArray(ps.properties.start_lifetime)
      ? ps.properties.start_lifetime[0]
      : ps.properties.start_lifetime;
    lines.push(`${varPrefix}_particles.lifetime = ${lt}`);
  }
  if (ps.traits.includes('looping')) lines.push(`${varPrefix}_particles.one_shot = false`);
  else lines.push(`${varPrefix}_particles.one_shot = true`);
  for (const m of ps.modules) {
    lines.push(`# Module: ${m.type} — ${JSON.stringify(m.properties)}`);
  }
  return lines.join('\n');
}

/** Generate Godot GDScript post-processing code */
export function postProcessingToGodot(pp: CompiledPostProcessing): string {
  const lines: string[] = [];
  lines.push(`# Post-Processing: ${pp.keyword} (use WorldEnvironment)`);
  lines.push('var env = WorldEnvironment.new()');
  lines.push('var environment = Environment.new()');
  for (const e of pp.effects) {
    if (e.type === 'bloom' || e.type === 'glow') {
      lines.push('environment.glow_enabled = true');
      if (e.properties.intensity)
        lines.push(`environment.glow_intensity = ${e.properties.intensity}`);
      if (e.properties.threshold) lines.push(`environment.glow_bloom = ${e.properties.threshold}`);
    } else if (e.type === 'fog') {
      lines.push('environment.fog_enabled = true');
      if (e.properties.density) lines.push(`environment.fog_density = ${e.properties.density}`);
    } else {
      lines.push(`# Effect: ${e.type} — ${JSON.stringify(e.properties)}`);
    }
  }
  lines.push('env.environment = environment');
  return lines.join('\n');
}

/** Generate Godot GDScript audio source code */
export function audioSourceToGodot(audio: CompiledAudioSource, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`# Audio: ${audio.name} (${audio.keyword})`);
  const isSpatial =
    audio.traits.includes('spatial') ||
    (typeof audio.properties.spatial_blend === 'number' && audio.properties.spatial_blend > 0);
  const nodeType = isSpatial ? 'AudioStreamPlayer3D' : 'AudioStreamPlayer';
  lines.push(`var ${varPrefix}_audio = ${nodeType}.new()`);
  lines.push(`${varPrefix}_audio.name = "${audio.name}"`);
  if (audio.properties.clip)
    lines.push(`${varPrefix}_audio.stream = load("res://${audio.properties.clip}")`);
  if (audio.properties.volume !== undefined)
    lines.push(`${varPrefix}_audio.volume_db = linear_to_db(${audio.properties.volume})`);
  if (isSpatial && audio.properties.max_distance) {
    lines.push(`${varPrefix}_audio.max_distance = ${audio.properties.max_distance}`);
  }
  if (audio.properties.play_on_awake) lines.push(`${varPrefix}_audio.autoplay = true`);
  return lines.join('\n');
}

/** Generate Godot weather comment block */
export function weatherToGodot(weather: CompiledWeather): string {
  const lines: string[] = [];
  lines.push(`# Weather: ${weather.keyword} "${weather.name || ''}"`);
  for (const layer of weather.layers) {
    lines.push(`# Layer: ${layer.type} — ${JSON.stringify(layer.properties)}`);
  }
  return lines.join('\n');
}

// =============================================================================
// VisionOS (Swift / RealityKit) Target Helpers
// =============================================================================

/** Generate VisionOS Swift material setup code */
export function materialToVisionOS(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Material: ${mat.name}`);
  if (mat.type === 'unlit') {
    lines.push(`var ${varPrefix}Mat = UnlitMaterial()`);
    if (mat.baseColor)
      lines.push(`${varPrefix}Mat.color = .init(tint: ${hexToSwiftColor(mat.baseColor)})`);
  } else {
    lines.push(`var ${varPrefix}Mat = PhysicallyBasedMaterial()`);
    if (mat.baseColor)
      lines.push(`${varPrefix}Mat.baseColor = .init(tint: ${hexToSwiftColor(mat.baseColor)})`);
    if (mat.roughness !== undefined)
      lines.push(`${varPrefix}Mat.roughness = .init(floatLiteral: ${mat.roughness})`);
    if (mat.metallic !== undefined)
      lines.push(`${varPrefix}Mat.metallic = .init(floatLiteral: ${mat.metallic})`);
    if (mat.opacity !== undefined && mat.opacity < 1)
      lines.push(
        `${varPrefix}Mat.blending = .transparent(opacity: .init(floatLiteral: ${mat.opacity}))`
      );
    if (mat.emissiveColor) {
      lines.push(
        `${varPrefix}Mat.emissiveColor = .init(color: ${hexToSwiftColor(mat.emissiveColor)})`
      );
      if (mat.emissiveIntensity)
        lines.push(`${varPrefix}Mat.emissiveIntensity = ${mat.emissiveIntensity}`);
    }
  }
  for (const [mapType, path] of Object.entries(mat.textureMaps)) {
    const prop =
      mapType === 'albedo_map'
        ? 'baseColor'
        : mapType === 'normal_map'
          ? 'normal'
          : mapType === 'metallic_map'
            ? 'metallic'
            : mapType === 'roughness_map'
              ? 'roughness'
              : mapType;
    lines.push(`${varPrefix}Mat.${prop} = .init(texture: .init(try! .load(named: "${path}")))`);
  }
  return lines.join('\n');
}

/** Generate VisionOS Swift physics setup code */
export function physicsToVisionOS(physics: CompiledPhysics, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Physics: ${physics.keyword} "${physics.name || ''}"`);

  if (physics.colliders) {
    for (const c of physics.colliders) {
      const shape = c.shape || 'box';
      if (shape === 'sphere') {
        lines.push(
          `${varPrefix}Entity.components.set(CollisionComponent(shapes: [.generateSphere(radius: ${c.properties.radius || 0.5})]))`
        );
      } else if (shape === 'capsule') {
        lines.push(
          `${varPrefix}Entity.components.set(CollisionComponent(shapes: [.generateCapsule(height: ${c.properties.height || 1}, radius: ${c.properties.radius || 0.25})]))`
        );
      } else {
        const size =
          c.properties.size && Array.isArray(c.properties.size) ? c.properties.size : [1, 1, 1];
        lines.push(
          `${varPrefix}Entity.components.set(CollisionComponent(shapes: [.generateBox(size: [${size.join(', ')}])]))`
        );
      }
    }
  }

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    lines.push(
      `var ${varPrefix}Physics = PhysicsBodyComponent(massProperties: .init(mass: ${rb.mass ?? 1}), mode: .dynamic)`
    );
    if (rb.drag !== undefined) lines.push(`${varPrefix}Physics.linearDamping = ${rb.drag}`);
    if (rb.angular_damping !== undefined)
      lines.push(`${varPrefix}Physics.angularDamping = ${rb.angular_damping}`);
    lines.push(`${varPrefix}Entity.components.set(${varPrefix}Physics)`);
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      lines.push(`// Joint: ${j.keyword} "${j.name || ''}" — use PhysicsJoint`);
    }
  }

  return lines.join('\n');
}

/** Generate VisionOS Swift particle system code */
export function particlesToVisionOS(ps: CompiledParticleSystem, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Particles: ${ps.name}`);
  lines.push(`var ${varPrefix}Particles = ParticleEmitterComponent()`);
  if (ps.properties.rate) lines.push(`${varPrefix}Particles.birthRate = ${ps.properties.rate}`);
  if (ps.properties.start_lifetime) {
    const lt = Array.isArray(ps.properties.start_lifetime)
      ? ps.properties.start_lifetime[0]
      : ps.properties.start_lifetime;
    lines.push(`${varPrefix}Particles.lifeSpan = ${lt}`);
  }
  if (ps.traits.includes('looping')) lines.push(`${varPrefix}Particles.isEmitting = true`);
  lines.push(`${varPrefix}Entity.components.set(${varPrefix}Particles)`);
  return lines.join('\n');
}

/** Generate VisionOS audio source code */
export function audioSourceToVisionOS(audio: CompiledAudioSource, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Audio: ${audio.name} (${audio.keyword})`);
  const isSpatial =
    audio.traits.includes('spatial') ||
    (typeof audio.properties.spatial_blend === 'number' && audio.properties.spatial_blend > 0);
  if (isSpatial) {
    lines.push(`let ${varPrefix}Audio = Entity()`);
    lines.push(`${varPrefix}Audio.spatialAudio = SpatialAudioComponent()`);
    if (audio.properties.max_distance)
      lines.push(
        `${varPrefix}Audio.spatialAudio?.distanceAttenuation = .rolloff(factor: .custom(${audio.properties.max_distance}))`
      );
  }
  lines.push(
    `let ${varPrefix}Resource = try! AudioFileResource.load(named: "${audio.properties.clip || audio.name}")`
  );
  lines.push(`let ${varPrefix}Controller = ${varPrefix}Entity.prepareAudio(${varPrefix}Resource)`);
  if (audio.properties.volume !== undefined)
    lines.push(
      `${varPrefix}Controller.gain = AudioPlaybackController.Decibel(${audio.properties.volume})`
    );
  if (audio.properties.play_on_awake) lines.push(`${varPrefix}Controller.play()`);
  return lines.join('\n');
}

// =============================================================================
// Android XR (Kotlin / SceneCore + Filament) Target Helpers
// =============================================================================

/** Generate Android XR Kotlin/Filament material setup code */
export function materialToAndroidXR(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Material: ${mat.name}`);
  if (mat.type === 'unlit') {
    lines.push(`val ${varPrefix}MatBuilder = MaterialInstance.Builder()`);
    lines.push(
      `    .setParameter("baseColor", ${mat.baseColor ? hexToFilamentColor(mat.baseColor) : 'Float4(1f, 1f, 1f, 1f)'})`
    );
    if (mat.opacity !== undefined) lines.push(`    .setParameter("alpha", ${mat.opacity}f)`);
    lines.push(`val ${varPrefix}Mat = ${varPrefix}MatBuilder.build(engine)`);
  } else {
    lines.push(`val ${varPrefix}MatBuilder = MaterialInstance.Builder()`);
    if (mat.baseColor) {
      lines.push(`    .setParameter("baseColor", ${hexToFilamentColor(mat.baseColor)})`);
    }
    if (mat.roughness !== undefined)
      lines.push(`    .setParameter("roughness", ${mat.roughness}f)`);
    if (mat.metallic !== undefined) lines.push(`    .setParameter("metallic", ${mat.metallic}f)`);
    if (mat.opacity !== undefined && mat.opacity < 1) {
      lines.push(`    .setParameter("alpha", ${mat.opacity}f)`);
    }
    if (mat.emissiveColor) {
      const [er, eg, eb] = hexToRGBTuple(mat.emissiveColor);
      const intensity = mat.emissiveIntensity ?? 1;
      lines.push(
        `    .setParameter("emissive", Float4(${er * intensity}f, ${eg * intensity}f, ${eb * intensity}f, 1f))`
      );
    }
    lines.push(`val ${varPrefix}Mat = ${varPrefix}MatBuilder.build(engine)`);
  }
  for (const [mapType, path] of Object.entries(mat.textureMaps)) {
    const paramName =
      mapType === 'albedo_map'
        ? 'baseColorMap'
        : mapType === 'normal_map'
          ? 'normalMap'
          : mapType === 'metallic_map'
            ? 'metallicMap'
            : mapType === 'roughness_map'
              ? 'roughnessMap'
              : mapType === 'emission_map'
                ? 'emissiveMap'
                : mapType === 'occlusion_map'
                  ? 'aoMap'
                  : mapType.replace(/_map$/, 'Map');
    lines.push(`// Texture: ${paramName} -> "${path}"`);
    lines.push(
      `val ${varPrefix}Tex_${paramName} = Texture.Builder().build(engine) // load from "${path}"`
    );
    lines.push(
      `${varPrefix}Mat.setParameter("${paramName}", ${varPrefix}Tex_${paramName}, TextureSampler())`
    );
  }
  return lines.join('\n');
}

/** Generate Android XR Kotlin/SceneCore physics setup code */
export function physicsToAndroidXR(physics: CompiledPhysics, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Physics: ${physics.keyword} "${physics.name || ''}"`);

  if (physics.colliders) {
    for (let i = 0; i < physics.colliders.length; i++) {
      const c = physics.colliders[i];
      const shape = c.shape || 'box';
      const colVar = `${varPrefix}Col${i}`;
      if (shape === 'sphere') {
        lines.push(`val ${colVar} = SphereCollider(engine, ${c.properties.radius || 0.5}f)`);
      } else if (shape === 'capsule') {
        lines.push(
          `val ${colVar} = CapsuleCollider(engine, ${c.properties.radius || 0.25}f, ${c.properties.height || 1.0}f)`
        );
      } else {
        const size =
          c.properties.size && Array.isArray(c.properties.size) ? c.properties.size : [1, 1, 1];
        lines.push(
          `val ${colVar} = BoxCollider(engine, Float3(${size[0]}f, ${size[1]}f, ${size[2]}f))`
        );
      }
      if (c.type === 'trigger') lines.push(`${colVar}.isTrigger = true`);
      lines.push(`${varPrefix}Entity.addComponent(${colVar})`);
    }
  }

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    lines.push(`val ${varPrefix}RB = RigidBodyComponent()`);
    if (rb.mass !== undefined) lines.push(`${varPrefix}RB.mass = ${rb.mass}f`);
    if (rb.drag !== undefined) lines.push(`${varPrefix}RB.linearDamping = ${rb.drag}f`);
    if (rb.angular_damping !== undefined)
      lines.push(`${varPrefix}RB.angularDamping = ${rb.angular_damping}f`);
    if (rb.use_gravity === false) lines.push(`${varPrefix}RB.isGravityEnabled = false`);
    lines.push(`${varPrefix}Entity.addComponent(${varPrefix}RB)`);
  }

  if (physics.forceFields) {
    for (const ff of physics.forceFields) {
      if (ff.keyword === 'wind_zone') {
        lines.push(`// Wind zone: "${ff.name || ''}" strength=${ff.properties.strength || 0}`);
        lines.push(`// Implement via custom force application in physics update loop`);
      } else {
        lines.push(
          `// Force field: ${ff.keyword} "${ff.name || ''}" — ${JSON.stringify(ff.properties)}`
        );
      }
    }
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      lines.push(`// Joint: ${j.keyword} "${j.name || ''}" — configure via PhysicsConstraint`);
      if (j.properties.axis) {
        const axis = Array.isArray(j.properties.axis) ? j.properties.axis : [0, 0, 1];
        lines.push(`// Axis: Float3(${axis[0]}f, ${axis[1]}f, ${axis[2]}f)`);
      }
    }
  }

  return lines.join('\n');
}

/** Generate Android XR Kotlin particle system code (SceneCore + Filament) */
export function particlesToAndroidXR(ps: CompiledParticleSystem, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Particles: ${ps.name}`);
  lines.push(`val ${varPrefix}ParticleEntity = xrSession.scene.createEntity("${ps.name}")`);
  lines.push(`// Configure particle system via Filament ParticleSystem or custom emitter`);

  if (ps.properties.rate) lines.push(`val ${varPrefix}EmitRate = ${ps.properties.rate}f`);
  if (ps.properties.max_particles)
    lines.push(`val ${varPrefix}MaxParticles = ${ps.properties.max_particles}`);
  if (ps.properties.start_lifetime) {
    const lt = Array.isArray(ps.properties.start_lifetime)
      ? ps.properties.start_lifetime[0]
      : ps.properties.start_lifetime;
    lines.push(`val ${varPrefix}Lifetime = ${lt}f`);
  }
  if (ps.properties.start_speed) {
    const sp = Array.isArray(ps.properties.start_speed)
      ? ps.properties.start_speed[0]
      : ps.properties.start_speed;
    lines.push(`val ${varPrefix}Speed = ${sp}f`);
  }
  if (ps.properties.gravity_modifier !== undefined) {
    lines.push(`val ${varPrefix}GravityMod = ${ps.properties.gravity_modifier}f`);
  }
  if (ps.traits.includes('looping')) lines.push(`val ${varPrefix}Looping = true`);
  if (ps.traits.includes('gpu')) lines.push(`// GPU particles: use compute shader pipeline`);

  for (const m of ps.modules) {
    lines.push(`// Module: ${m.type} — ${JSON.stringify(m.properties)}`);
  }
  return lines.join('\n');
}

/** Generate Android XR Kotlin spatial audio code (Oboe / SceneCore SpatialAudioTrack) */
export function audioSourceToAndroidXR(audio: CompiledAudioSource, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Audio: ${audio.name} (${audio.keyword})`);
  const isSpatial =
    audio.traits.includes('spatial') ||
    audio.traits.includes('hrtf') ||
    (typeof audio.properties.spatial_blend === 'number' && audio.properties.spatial_blend > 0);

  if (audio.keyword === 'reverb_zone') {
    lines.push(`// Reverb zone: "${audio.name}" — implement via AudioEffect.EFFECT_TYPE_REVERB`);
    if (audio.properties.min_distance)
      lines.push(`// minDistance = ${audio.properties.min_distance}`);
    if (audio.properties.max_distance)
      lines.push(`// maxDistance = ${audio.properties.max_distance}`);
    return lines.join('\n');
  }

  lines.push(`val ${varPrefix}AudioEntity = xrSession.scene.createEntity("${audio.name}")`);

  if (isSpatial) {
    lines.push(
      `val ${varPrefix}SpatialTrack = SpatialAudioTrack(xrSession, ${varPrefix}AudioEntity)`
    );
    if (audio.properties.max_distance) {
      lines.push(`// Spatial falloff distance: ${audio.properties.max_distance}`);
    }
  }

  if (audio.properties.clip) {
    lines.push(
      `val ${varPrefix}SoundId = soundPool.load(context, R.raw.${audio.properties.clip.toString().replace(/[^a-zA-Z0-9_]/g, '_')}, 1)`
    );
  }
  if (audio.properties.volume !== undefined)
    lines.push(`val ${varPrefix}Volume = ${audio.properties.volume}f`);
  if (audio.properties.loop !== undefined)
    lines.push(
      `val ${varPrefix}Loop = ${audio.properties.loop ? '1' : '0'} // -1 = loop, 0 = once`
    );

  if (audio.properties.play_on_awake || audio.properties.clip) {
    lines.push(`soundPool.setOnLoadCompleteListener { pool, id, _ ->`);
    lines.push(
      `    if (id == ${varPrefix}SoundId) pool.play(id, ${audio.properties.volume ?? 1}f, ${audio.properties.volume ?? 1}f, 1, ${audio.properties.loop ? '-1' : '0'}, 1.0f)`
    );
    lines.push(`}`);
  }

  return lines.join('\n');
}

/** Generate Android XR Kotlin weather/atmosphere code */
export function weatherToAndroidXR(weather: CompiledWeather): string {
  const lines: string[] = [];
  lines.push(`// Weather: ${weather.keyword} "${weather.name || ''}"`);
  lines.push('// Implement weather via Filament IndirectLight + custom particle emitters');

  for (const [key, value] of Object.entries(weather.properties)) {
    lines.push(`// ${key} = ${JSON.stringify(value)}`);
  }

  for (const layer of weather.layers) {
    lines.push(`// Layer: ${layer.type}`);
    if (layer.type === 'rain' || layer.type === 'snow') {
      lines.push(
        `// Use GPU particle emitter for ${layer.type} — rate=${layer.properties.rate || 'default'}, intensity=${layer.properties.intensity || 'default'}`
      );
    } else if (layer.type === 'wind') {
      lines.push(
        `// Apply force to particle systems: strength=${layer.properties.strength || 'default'}, direction=${JSON.stringify(layer.properties.direction) || 'default'}`
      );
    } else if (layer.type === 'fog' || layer.type === 'fog_layer') {
      lines.push(
        `// Configure Filament fog: density=${layer.properties.density || 'default'}, color=${layer.properties.color || 'default'}`
      );
    } else if (layer.type === 'lightning') {
      lines.push(`// Lightning flash: frequency=${layer.properties.frequency || 'default'}`);
    } else if (layer.type === 'clouds') {
      lines.push(`// Volumetric clouds: coverage=${layer.properties.coverage || 'default'}`);
    } else {
      for (const [k, v] of Object.entries(layer.properties)) {
        lines.push(`//   ${k} = ${JSON.stringify(v)}`);
      }
    }
  }

  return lines.join('\n');
}

/** Convert hex color to Filament Float4 */
function hexToFilamentColor(hex: string): string {
  const [r, g, b] = hexToRGBTuple(hex);
  return `Float4(${r}f, ${g}f, ${b}f, 1f)`;
}

// =============================================================================
// Babylon.js Target Helpers
// =============================================================================

/** Generate Babylon.js material setup code */
export function materialToBabylon(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Material: ${mat.name}`);
  if (mat.type === 'unlit') {
    lines.push(`const ${varPrefix}Mat = new BABYLON.StandardMaterial("${mat.name}", scene);`);
    lines.push(`${varPrefix}Mat.disableLighting = true;`);
    if (mat.emissiveColor)
      lines.push(
        `${varPrefix}Mat.emissiveColor = BABYLON.Color3.FromHexString("${mat.emissiveColor}");`
      );
  } else {
    lines.push(`const ${varPrefix}Mat = new BABYLON.PBRMaterial("${mat.name}", scene);`);
    if (mat.baseColor)
      lines.push(`${varPrefix}Mat.albedoColor = BABYLON.Color3.FromHexString("${mat.baseColor}");`);
    if (mat.roughness !== undefined) lines.push(`${varPrefix}Mat.roughness = ${mat.roughness};`);
    if (mat.metallic !== undefined) lines.push(`${varPrefix}Mat.metallic = ${mat.metallic};`);
    if (mat.opacity !== undefined && mat.opacity < 1) {
      lines.push(`${varPrefix}Mat.alpha = ${mat.opacity};`);
    }
    if (mat.emissiveColor) {
      lines.push(
        `${varPrefix}Mat.emissiveColor = BABYLON.Color3.FromHexString("${mat.emissiveColor}");`
      );
      if (mat.emissiveIntensity)
        lines.push(`${varPrefix}Mat.emissiveIntensity = ${mat.emissiveIntensity};`);
    }
    if (mat.ior !== undefined) lines.push(`${varPrefix}Mat.indexOfRefraction = ${mat.ior};`);
  }
  for (const [mapType, path] of Object.entries(mat.textureMaps)) {
    const prop =
      mapType === 'albedo_map'
        ? 'albedoTexture'
        : mapType === 'normal_map'
          ? 'bumpTexture'
          : mapType === 'metallic_map'
            ? 'metallicTexture'
            : mapType === 'roughness_map'
              ? 'microSurfaceTexture'
              : mapType === 'emission_map'
                ? 'emissiveTexture'
                : mapType === 'occlusion_map'
                  ? 'ambientTexture'
                  : `${mapType.replace(/_map$/, 'Texture')}`;
    lines.push(`${varPrefix}Mat.${prop} = new BABYLON.Texture("${path}", scene);`);
  }
  return lines.join('\n');
}

/** Generate Babylon.js physics setup code */
export function physicsToBabylon(physics: CompiledPhysics, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Physics: ${physics.keyword} "${physics.name || ''}"`);

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    lines.push(
      `const ${varPrefix}Aggregate = new BABYLON.PhysicsAggregate(${varPrefix}Mesh, BABYLON.PhysicsShapeType.BOX, {`
    );
    if (rb.mass !== undefined) lines.push(`  mass: ${rb.mass},`);
    if (rb.drag !== undefined) lines.push(`  linearDamping: ${rb.drag},`);
    if (rb.angular_damping !== undefined) lines.push(`  angularDamping: ${rb.angular_damping},`);
    lines.push('}, scene);');
  }

  if (physics.colliders) {
    for (const c of physics.colliders) {
      const shape = c.shape || 'box';
      const shapeType = shape === 'sphere' ? 'SPHERE' : shape === 'capsule' ? 'CAPSULE' : 'BOX';
      lines.push(`// Collider: ${shape} — PhysicsShapeType.${shapeType}`);
    }
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      const jointType =
        j.keyword === 'hinge'
          ? 'HingeConstraint'
          : j.keyword === 'slider'
            ? 'SliderConstraint'
            : j.keyword === 'ball_socket'
              ? 'BallAndSocketConstraint'
              : 'Physics6DoFConstraint';
      lines.push(`// Joint: ${j.keyword} — BABYLON.${jointType}`);
    }
  }

  return lines.join('\n');
}

/** Generate Babylon.js particle system code */
export function particlesToBabylon(ps: CompiledParticleSystem, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Particles: ${ps.name}`);
  const useGPU = ps.traits.includes('gpu');
  if (useGPU) {
    lines.push(
      `const ${varPrefix}PS = new BABYLON.GPUParticleSystem("${ps.name}", { capacity: ${ps.properties.max_particles || 1000} }, scene);`
    );
  } else {
    lines.push(
      `const ${varPrefix}PS = new BABYLON.ParticleSystem("${ps.name}", ${ps.properties.max_particles || 1000}, scene);`
    );
  }
  if (ps.properties.rate) lines.push(`${varPrefix}PS.emitRate = ${ps.properties.rate};`);
  if (ps.properties.start_lifetime) {
    const lt = ps.properties.start_lifetime;
    if (Array.isArray(lt)) {
      lines.push(`${varPrefix}PS.minLifeTime = ${lt[0]};`);
      lines.push(`${varPrefix}PS.maxLifeTime = ${lt[1] || lt[0]};`);
    } else {
      lines.push(`${varPrefix}PS.minLifeTime = ${lt};`);
      lines.push(`${varPrefix}PS.maxLifeTime = ${lt};`);
    }
  }
  if (ps.properties.start_speed) {
    const sp = ps.properties.start_speed;
    if (Array.isArray(sp)) {
      lines.push(`${varPrefix}PS.minEmitPower = ${sp[0]};`);
      lines.push(`${varPrefix}PS.maxEmitPower = ${sp[1] || sp[0]};`);
    } else {
      lines.push(`${varPrefix}PS.minEmitPower = ${sp};`);
      lines.push(`${varPrefix}PS.maxEmitPower = ${sp};`);
    }
  }
  if (ps.properties.gravity_modifier !== undefined) {
    const gravMod =
      typeof ps.properties.gravity_modifier === 'number' ? ps.properties.gravity_modifier : 1;
    lines.push(`${varPrefix}PS.gravity = new BABYLON.Vector3(0, ${-9.81 * gravMod}, 0);`);
  }
  lines.push(`${varPrefix}PS.start();`);
  return lines.join('\n');
}

/** Generate Babylon.js post-processing code */
export function postProcessingToBabylon(pp: CompiledPostProcessing): string {
  const lines: string[] = [];
  lines.push(`// Post-Processing: ${pp.keyword}`);
  lines.push(
    'const pipeline = new BABYLON.DefaultRenderingPipeline("default", true, scene, [camera]);'
  );
  for (const e of pp.effects) {
    if (e.type === 'bloom') {
      lines.push('pipeline.bloomEnabled = true;');
      if (e.properties.intensity) lines.push(`pipeline.bloomWeight = ${e.properties.intensity};`);
      if (e.properties.threshold)
        lines.push(`pipeline.bloomThreshold = ${e.properties.threshold};`);
    } else if (e.type === 'depth_of_field') {
      lines.push('pipeline.depthOfFieldEnabled = true;');
      if (e.properties.focal_length)
        lines.push(`pipeline.depthOfField.focalLength = ${e.properties.focal_length};`);
    } else if (e.type === 'chromatic_aberration') {
      lines.push('pipeline.chromaticAberrationEnabled = true;');
      if (e.properties.amount)
        lines.push(`pipeline.chromaticAberration.aberrationAmount = ${e.properties.amount};`);
    } else if (e.type === 'vignette') {
      lines.push('pipeline.imageProcessing.vignetteEnabled = true;');
      if (e.properties.weight)
        lines.push(`pipeline.imageProcessing.vignetteWeight = ${e.properties.weight};`);
    } else {
      lines.push(`// Effect: ${e.type} — ${JSON.stringify(e.properties)}`);
    }
  }
  return lines.join('\n');
}

/** Generate Babylon.js audio source code */
export function audioSourceToBabylon(audio: CompiledAudioSource, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Audio: ${audio.name} (${audio.keyword})`);
  const isSpatial =
    audio.traits.includes('spatial') ||
    (typeof audio.properties.spatial_blend === 'number' && audio.properties.spatial_blend > 0);
  lines.push(
    `const ${varPrefix}Sound = new BABYLON.Sound("${audio.name}", "${audio.properties.clip || ''}", scene, null, {`
  );
  if (audio.properties.loop !== undefined) lines.push(`  loop: ${audio.properties.loop},`);
  if (audio.properties.volume !== undefined) lines.push(`  volume: ${audio.properties.volume},`);
  if (isSpatial) lines.push('  spatialSound: true,');
  if (audio.properties.play_on_awake) lines.push('  autoplay: true,');
  if (isSpatial && audio.properties.max_distance)
    lines.push(`  maxDistance: ${audio.properties.max_distance},`);
  lines.push('});');
  return lines.join('\n');
}

// =============================================================================
// PlayCanvas Target Helpers
// =============================================================================

/** Generate PlayCanvas material setup code */
export function materialToPlayCanvas(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Material: ${mat.name}`);
  lines.push(`const ${varPrefix}Mat = new pc.StandardMaterial();`);
  lines.push(`${varPrefix}Mat.name = "${mat.name}";`);
  if (mat.baseColor)
    lines.push(`${varPrefix}Mat.diffuse = new pc.Color().fromString("${mat.baseColor}");`);
  if (mat.roughness !== undefined)
    lines.push(`${varPrefix}Mat.gloss = ${1 - mat.roughness}; // roughness inverted`);
  if (mat.metallic !== undefined) lines.push(`${varPrefix}Mat.metalness = ${mat.metallic};`);
  if (mat.metallic !== undefined) lines.push(`${varPrefix}Mat.useMetalness = true;`);
  if (mat.opacity !== undefined && mat.opacity < 1) {
    lines.push(`${varPrefix}Mat.opacity = ${mat.opacity};`);
    lines.push(`${varPrefix}Mat.blendType = pc.BLEND_NORMAL;`);
  }
  if (mat.emissiveColor) {
    lines.push(`${varPrefix}Mat.emissive = new pc.Color().fromString("${mat.emissiveColor}");`);
    if (mat.emissiveIntensity)
      lines.push(`${varPrefix}Mat.emissiveIntensity = ${mat.emissiveIntensity};`);
  }
  lines.push(`${varPrefix}Mat.update();`);
  return lines.join('\n');
}

/** Generate PlayCanvas physics setup code */
export function physicsToPlayCanvas(physics: CompiledPhysics, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Physics: ${physics.keyword} "${physics.name || ''}"`);

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    lines.push(`${varPrefix}Entity.addComponent("rigidbody", {`);
    lines.push(`  type: "dynamic",`);
    if (rb.mass !== undefined) lines.push(`  mass: ${rb.mass},`);
    if (rb.drag !== undefined) lines.push(`  linearDamping: ${rb.drag},`);
    if (rb.angular_damping !== undefined) lines.push(`  angularDamping: ${rb.angular_damping},`);
    lines.push('});');
  }

  if (physics.colliders) {
    for (const c of physics.colliders) {
      const shape = c.shape || 'box';
      lines.push(`${varPrefix}Entity.addComponent("collision", {`);
      lines.push(`  type: "${shape}",`);
      if (c.properties.radius) lines.push(`  radius: ${c.properties.radius},`);
      if (c.properties.height) lines.push(`  height: ${c.properties.height},`);
      if (c.properties.size && Array.isArray(c.properties.size)) {
        lines.push(
          `  halfExtents: new pc.Vec3(${c.properties.size.map((s: number) => s / 2).join(', ')}),`
        );
      }
      lines.push('});');
    }
  }

  return lines.join('\n');
}

/** Generate PlayCanvas particle system code */
export function particlesToPlayCanvas(ps: CompiledParticleSystem, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Particles: ${ps.name}`);
  lines.push(`${varPrefix}Entity.addComponent("particlesystem", {`);
  if (ps.properties.max_particles) lines.push(`  numParticles: ${ps.properties.max_particles},`);
  if (ps.properties.rate) lines.push(`  rate: ${ps.properties.rate},`);
  if (ps.properties.start_lifetime)
    lines.push(
      `  lifetime: ${Array.isArray(ps.properties.start_lifetime) ? ps.properties.start_lifetime[0] : ps.properties.start_lifetime},`
    );
  if (ps.properties.start_speed)
    lines.push(
      `  emitterExtents: new pc.Vec3(${Array.isArray(ps.properties.start_speed) ? ps.properties.start_speed[0] : ps.properties.start_speed}, 0, 0),`
    );
  lines.push(`  loop: ${ps.traits.includes('looping')},`);
  lines.push('});');
  return lines.join('\n');
}

/** Generate PlayCanvas audio source code */
export function audioSourceToPlayCanvas(audio: CompiledAudioSource, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Audio: ${audio.name} (${audio.keyword})`);
  lines.push(`${varPrefix}Entity.addComponent("sound", {`);
  lines.push(
    `  positional: ${audio.traits.includes('spatial') || (typeof audio.properties.spatial_blend === 'number' && audio.properties.spatial_blend > 0)},`
  );
  if (audio.properties.volume !== undefined) lines.push(`  volume: ${audio.properties.volume},`);
  if (audio.properties.max_distance) lines.push(`  maxDistance: ${audio.properties.max_distance},`);
  lines.push('});');
  if (audio.properties.clip) {
    lines.push(
      `${varPrefix}Entity.sound.addSlot("${audio.name}", { asset: app.assets.find("${audio.properties.clip}"),`
    );
    if (audio.properties.loop !== undefined) lines.push(`  loop: ${audio.properties.loop},`);
    if (audio.properties.play_on_awake) lines.push('  autoPlay: true,');
    lines.push('});');
  }
  return lines.join('\n');
}

// =============================================================================
// SDF (Gazebo) Target Helpers
// =============================================================================

/** Generate SDF material element */
export function materialToSDF(mat: CompiledMaterial): string {
  const lines: string[] = [];
  lines.push(`<material>`);
  lines.push(`  <script><name>${mat.name}</name></script>`);
  if (mat.baseColor) {
    const [r, g, b] = hexToRGBTuple(mat.baseColor);
    lines.push(`  <ambient>${r} ${g} ${b} 1</ambient>`);
    lines.push(`  <diffuse>${r} ${g} ${b} ${mat.opacity ?? 1}</diffuse>`);
  }
  if (mat.metallic !== undefined && mat.metallic > 0.5) {
    lines.push(`  <specular>0.8 0.8 0.8 1</specular>`);
  }
  if (mat.emissiveColor) {
    const [r, g, b] = hexToRGBTuple(mat.emissiveColor);
    lines.push(`  <emissive>${r} ${g} ${b} 1</emissive>`);
  }
  lines.push(`</material>`);
  return lines.join('\n');
}

/** Generate SDF physics (already well supported via collider/inertial) */
export function physicsToSDF(physics: CompiledPhysics): string {
  const lines: string[] = [];

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    lines.push('<inertial>');
    lines.push(`  <mass>${rb.mass ?? 1.0}</mass>`);
    lines.push('</inertial>');
  }

  if (physics.colliders) {
    for (const c of physics.colliders) {
      const shape = c.shape || 'box';
      lines.push('<collision name="collision">');
      lines.push('  <geometry>');
      if (shape === 'sphere') {
        lines.push(`    <sphere><radius>${c.properties.radius || 0.5}</radius></sphere>`);
      } else if (shape === 'capsule' || shape === 'cylinder') {
        lines.push(
          `    <cylinder><radius>${c.properties.radius || 0.5}</radius><length>${c.properties.height || 1.0}</length></cylinder>`
        );
      } else {
        const size =
          c.properties.size && Array.isArray(c.properties.size) ? c.properties.size : [1, 1, 1];
        lines.push(`    <box><size>${size.join(' ')}</size></box>`);
      }
      lines.push('  </geometry>');
      lines.push('</collision>');
    }
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      const sdfType =
        j.keyword === 'hinge'
          ? 'revolute'
          : j.keyword === 'slider'
            ? 'prismatic'
            : j.keyword === 'ball_socket'
              ? 'ball'
              : j.keyword === 'fixed_joint'
                ? 'fixed'
                : 'revolute';
      lines.push(`<joint name="${j.name || 'joint'}" type="${sdfType}">`);
      if (j.properties.axis) {
        const axis = Array.isArray(j.properties.axis) ? j.properties.axis : [0, 0, 1];
        lines.push(`  <axis><xyz>${axis.join(' ')}</xyz></axis>`);
      }
      if (j.properties.limits) {
        const limVals = Array.isArray(j.properties.limits) ? j.properties.limits : undefined;
        if (limVals)
          lines.push(
            `  <axis><limit><lower>${limVals[0]}</lower><upper>${limVals[1]}</upper></limit></axis>`
          );
      }
      lines.push('</joint>');
    }
  }

  return lines.join('\n');
}

// =============================================================================
// VRChat (C# / Udon) Target Helpers
// =============================================================================

/** Generate VRChat material code (Unity-based with VRC extensions) */
export function materialToVRChat(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// VRChat Material: ${mat.name}`);
  lines.push(`var ${varPrefix}Mat = new Material(Shader.Find("VRChat/Mobile/Standard Lite"));`);
  if (mat.baseColor)
    lines.push(`${varPrefix}Mat.SetColor("_Color", ${hexToUnityColor(mat.baseColor)});`);
  if (mat.roughness !== undefined)
    lines.push(`${varPrefix}Mat.SetFloat("_Glossiness", ${(1 - mat.roughness).toFixed(3)}f);`);
  if (mat.metallic !== undefined)
    lines.push(`${varPrefix}Mat.SetFloat("_Metallic", ${mat.metallic}f);`);
  if (mat.emissiveColor) {
    lines.push(`${varPrefix}Mat.EnableKeyword("_EMISSION");`);
    lines.push(
      `${varPrefix}Mat.SetColor("_EmissionColor", ${hexToUnityColor(mat.emissiveColor)});`
    );
  }
  return lines.join('\n');
}

// =============================================================================
// USD Particle / Post-Processing / Audio Helpers
// =============================================================================

/** Generate USD particle system prim */
export function particlesToUSD(ps: CompiledParticleSystem): string {
  const lines: string[] = [];
  lines.push(`def Scope "Particles_${ps.name.replace(/[^a-zA-Z0-9_]/g, '_')}" {`);
  lines.push(`    custom string holoscript:type = "particle_system"`);
  if (ps.properties.rate) lines.push(`    custom float holoscript:rate = ${ps.properties.rate}`);
  if (ps.properties.max_particles)
    lines.push(`    custom int holoscript:maxParticles = ${ps.properties.max_particles}`);
  if (ps.properties.start_lifetime)
    lines.push(
      `    custom float holoscript:lifetime = ${Array.isArray(ps.properties.start_lifetime) ? ps.properties.start_lifetime[0] : ps.properties.start_lifetime}`
    );
  for (const m of ps.modules) {
    lines.push(`    def Scope "${m.type}" {`);
    for (const [k, v] of Object.entries(m.properties)) {
      const usdType = typeof v === 'number' ? 'float' : typeof v === 'boolean' ? 'bool' : 'string';
      lines.push(`        custom ${usdType} ${k} = ${JSON.stringify(v)}`);
    }
    lines.push('    }');
  }
  lines.push('}');
  return lines.join('\n');
}

/** Generate USD post-processing scope */
export function postProcessingToUSD(pp: CompiledPostProcessing): string {
  const lines: string[] = [];
  lines.push(`def Scope "PostProcessing" {`);
  for (const e of pp.effects) {
    lines.push(`    def Scope "${e.type}" {`);
    for (const [k, v] of Object.entries(e.properties)) {
      const usdType = typeof v === 'number' ? 'float' : typeof v === 'boolean' ? 'bool' : 'string';
      lines.push(`        custom ${usdType} ${k} = ${JSON.stringify(v)}`);
    }
    lines.push('    }');
  }
  lines.push('}');
  return lines.join('\n');
}

/** Generate USD audio source prim */
export function audioSourceToUSD(audio: CompiledAudioSource): string {
  const lines: string[] = [];
  lines.push(`def Scope "Audio_${audio.name.replace(/[^a-zA-Z0-9_]/g, '_')}" {`);
  lines.push(`    custom string holoscript:type = "${audio.keyword}"`);
  if (audio.properties.clip) lines.push(`    asset holoscript:clip = @${audio.properties.clip}@`);
  if (audio.properties.volume !== undefined)
    lines.push(`    custom float holoscript:volume = ${audio.properties.volume}`);
  if (audio.properties.loop !== undefined)
    lines.push(`    custom bool holoscript:loop = ${audio.properties.loop}`);
  if (audio.properties.spatial_blend !== undefined)
    lines.push(`    custom float holoscript:spatialBlend = ${audio.properties.spatial_blend}`);
  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// R3F Physics / Weather Helpers
// =============================================================================

/** Generate R3F/Three.js physics JSX (rapier or cannon) */
export function physicsToR3F(physics: CompiledPhysics): string {
  const lines: string[] = [];

  if (physics.rigidbody) {
    const rb = physics.rigidbody.properties;
    const bodyType = rb.use_gravity === false ? 'kinematicPosition' : 'dynamic';
    lines.push(
      `<RigidBody type="${bodyType}"${rb.mass ? ` mass={${rb.mass}}` : ''}${rb.drag ? ` linearDamping={${rb.drag}}` : ''}${rb.angular_damping ? ` angularDamping={${rb.angular_damping}}` : ''}>`
    );
  }

  if (physics.colliders) {
    for (const c of physics.colliders) {
      const shape = c.shape || 'cuboid';
      const r3fShape = shape === 'box' ? 'cuboid' : shape === 'sphere' ? 'ball' : shape;
      const args =
        shape === 'sphere' && c.properties.radius ? ` args={[${c.properties.radius}]}` : '';
      lines.push(
        `  <${c.type === 'trigger' ? 'CuboidCollider sensor' : `${capitalizeFirst(r3fShape)}Collider`}${args} />`
      );
    }
  }

  if (physics.rigidbody) {
    lines.push('</RigidBody>');
  }

  if (physics.joints) {
    for (const j of physics.joints) {
      lines.push(
        `{/* Joint: ${j.keyword} "${j.name || ''}" — use useRevoluteJoint/useSphericalJoint */}`
      );
    }
  }

  if (physics.forceFields) {
    for (const ff of physics.forceFields) {
      lines.push(
        `{/* Force field: ${ff.keyword} "${ff.name || ''}" — ${JSON.stringify(ff.properties)} */}`
      );
    }
  }

  return lines.join('\n');
}

/** Generate R3F weather JSX (custom components) */
export function weatherToR3F(weather: CompiledWeather): string {
  const lines: string[] = [];
  lines.push(`{/* Weather: ${weather.keyword} "${weather.name || ''}" */}`);
  for (const layer of weather.layers) {
    const componentName = capitalizeFirst(layer.type);
    const props = Object.entries(layer.properties)
      .map(([k, v]) => {
        const camel = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        return typeof v === 'string' ? `${camel}="${v}"` : `${camel}={${JSON.stringify(v)}}`;
      })
      .join(' ');
    lines.push(`<${componentName} ${props} />`);
  }
  return lines.join('\n');
}

// =============================================================================
// WebGPU Target Helpers
// =============================================================================

/** Generate WebGPU material uniform buffer layout */
export function materialToWebGPU(mat: CompiledMaterial, varPrefix: string): string {
  const lines: string[] = [];
  lines.push(`// Material: ${mat.name}`);
  lines.push(`const ${varPrefix}MaterialData = new Float32Array([`);
  if (mat.baseColor) {
    const [r, g, b] = hexToRGBTuple(mat.baseColor);
    lines.push(`  ${r}, ${g}, ${b}, ${mat.opacity ?? 1},  // baseColor + opacity`);
  } else {
    lines.push('  1.0, 1.0, 1.0, 1.0,  // baseColor + opacity');
  }
  lines.push(
    `  ${mat.roughness ?? 0.5}, ${mat.metallic ?? 0}, ${mat.ior ?? 1.5}, 0.0,  // roughness, metallic, ior, pad`
  );
  if (mat.emissiveColor) {
    const [r, g, b] = hexToRGBTuple(mat.emissiveColor);
    lines.push(`  ${r}, ${g}, ${b}, ${mat.emissiveIntensity ?? 1},  // emissive + intensity`);
  } else {
    lines.push('  0.0, 0.0, 0.0, 0.0,  // emissive + intensity');
  }
  lines.push(']);');
  lines.push(`const ${varPrefix}MaterialBuffer = device.createBuffer({`);
  lines.push(`  size: ${varPrefix}MaterialData.byteLength,`);
  lines.push('  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,');
  lines.push('});');
  lines.push(`device.queue.writeBuffer(${varPrefix}MaterialBuffer, 0, ${varPrefix}MaterialData);`);
  return lines.join('\n');
}

// =============================================================================
// Additional Utility Helpers
// =============================================================================

function hexToRGBTuple(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseFloat((parseInt(h.substring(0, 2), 16) / 255).toFixed(3)),
    parseFloat((parseInt(h.substring(2, 4), 16) / 255).toFixed(3)),
    parseFloat((parseInt(h.substring(4, 6), 16) / 255).toFixed(3)),
  ];
}

function hexToUnityColor(hex: string): string {
  const [r, g, b] = hexToRGBTuple(hex);
  return `new Color(${r}f, ${g}f, ${b}f)`;
}

function hexToSwiftColor(hex: string): string {
  return `.init(red: 0x${hex.slice(1, 3)}, green: 0x${hex.slice(3, 5)}, blue: 0x${hex.slice(5, 7)})`;
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// =============================================================================
// Narrative / StoryWeaver Protocol Compilation
// =============================================================================

import type {
  CompiledNarrative,
  CompiledChapter,
  CompiledDialogueLine,
  CompiledChoice,
  CompiledCutsceneAction,
} from '../parser/HoloCompositionTypes';

export function compileNarrativeBlock(block: HoloDomainBlock): CompiledNarrative {
  const chapters: CompiledChapter[] = [];
  let hasChoices = false;

  for (const child of block.children || []) {
    const c = child as unknown as HoloDomainBlock;
    if (c.type !== 'DomainBlock') continue;

    const kw = c.keyword as string;
    if (kw === 'chapter' || kw === 'act' || kw === 'scene') {
      const chapter = compileChapterBlock(c);
      if (chapter.choices && chapter.choices.length > 0) hasChoices = true;
      chapters.push(chapter);
    } else if (kw === 'dialogue_tree') {
      // Dialogue tree as a virtual chapter
      const dialogueLines: CompiledDialogueLine[] = [];
      const choices: CompiledChoice[] = [];
      for (const dc of c.children || []) {
        const dck = (dc as unknown as HoloDomainBlock).keyword as string;
        if (dck === 'line' || dck === 'dialogue') {
          dialogueLines.push(compileDialogueLine(dc as unknown as HoloDomainBlock));
        } else if (dck === 'choice') {
          choices.push(compileChoiceNode(dc as unknown as HoloDomainBlock));
          hasChoices = true;
        }
      }
      chapters.push({
        name: c.name || 'dialogue',
        dialogueLines: dialogueLines.length > 0 ? dialogueLines : undefined,
        choices: choices.length > 0 ? choices : undefined,
      });
    }
  }

  const props = block.properties || {};
  const narrativeType: CompiledNarrative['type'] = hasChoices
    ? 'branching'
    : (props.type as string) === 'open_world'
      ? 'open_world'
      : 'linear';

  return {
    name: block.name || 'unnamed',
    type: narrativeType,
    chapters,
    startChapter: (props.start_chapter || props.startChapter) as string | undefined,
    variables: props.variables as Record<string, HoloValue> | undefined,
  };
}

function compileChapterBlock(block: HoloDomainBlock): CompiledChapter {
  const props = block.properties || {};
  const dialogueLines: CompiledDialogueLine[] = [];
  const choices: CompiledChoice[] = [];
  const cutsceneActions: CompiledCutsceneAction[] = [];

  for (const child of block.children || []) {
    const c = child as unknown as HoloDomainBlock;
    const kw = c.keyword as string;
    if (kw === 'line' || kw === 'dialogue') {
      dialogueLines.push(compileDialogueLine(c));
    } else if (kw === 'choice') {
      choices.push(compileChoiceNode(c));
    } else if (
      kw === 'cutscene' ||
      kw === 'camera' ||
      kw === 'action' ||
      kw === 'wait' ||
      kw === 'effect' ||
      kw === 'audio'
    ) {
      cutsceneActions.push(compileCutsceneAction(c));
    }
  }

  return {
    name: block.name || 'unnamed',
    trigger: (props.trigger || props.on_enter) as string | undefined,
    dialogueLines: dialogueLines.length > 0 ? dialogueLines : undefined,
    choices: choices.length > 0 ? choices : undefined,
    onComplete: (props.on_complete || props.next) as string | undefined,
    cutsceneActions: cutsceneActions.length > 0 ? cutsceneActions : undefined,
  };
}

function compileDialogueLine(block: HoloDomainBlock): CompiledDialogueLine {
  const props = block.properties || {};
  return {
    speaker: (props.speaker || props.character) as string | undefined,
    text: (props.text || props.content || block.name || '') as string,
    emotion: props.emotion as string | undefined,
    duration: props.duration as number | undefined,
    voiceClip: (props.voice_clip || props.voiceClip || props.audio) as string | undefined,
  };
}

function compileChoiceNode(block: HoloDomainBlock): CompiledChoice {
  const props = block.properties || {};
  return {
    text: (props.text || block.name || '') as string,
    condition: props.condition as string | undefined,
    nextChapter: (props.next || props.next_chapter || props.goto) as string | undefined,
    action: props.action as string | undefined,
  };
}

function compileCutsceneAction(block: HoloDomainBlock): CompiledCutsceneAction {
  const props = block.properties || {};
  const kw = block.keyword as string;
  const type: CompiledCutsceneAction['type'] =
    kw === 'camera' || kw === 'camera_move'
      ? 'camera_move'
      : kw === 'action' || kw === 'character_action'
        ? 'character_action'
        : kw === 'wait'
          ? 'wait'
          : kw === 'audio'
            ? 'audio'
            : 'effect';

  return {
    type,
    target: (props.target || block.name) as string | undefined,
    params: { ...props },
    duration: props.duration as number | undefined,
  };
}

/** Generate Unity C# ScriptableObject + Timeline narrative code */
export function narrativeToUnity(narrative: CompiledNarrative): string {
  const lines: string[] = [];
  const safeName = narrative.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`// StoryWeaver Narrative: ${narrative.name}`);
  lines.push(`[CreateAssetMenu(menuName = "StoryWeaver/${safeName}")]`);
  lines.push(`public class ${safeName}Narrative : ScriptableObject {`);
  lines.push(`    public NarrativeType type = NarrativeType.${capitalizeFirst(narrative.type)};`);
  if (narrative.startChapter) {
    lines.push(`    public string startChapter = "${narrative.startChapter}";`);
  }
  lines.push('');

  for (const chapter of narrative.chapters) {
    lines.push(`    [Header("${chapter.name}")]`);
    lines.push(`    public Chapter ${chapter.name.replace(/[^a-zA-Z0-9_]/g, '_')} = new Chapter {`);
    if (chapter.trigger) lines.push(`        trigger = "${chapter.trigger}",`);
    if (chapter.onComplete) lines.push(`        onComplete = "${chapter.onComplete}",`);

    if (chapter.dialogueLines && chapter.dialogueLines.length > 0) {
      lines.push('        dialogueLines = new DialogueLine[] {');
      for (const dl of chapter.dialogueLines) {
        const parts = [`text = "${dl.text}"`];
        if (dl.speaker) parts.push(`speaker = "${dl.speaker}"`);
        if (dl.emotion) parts.push(`emotion = "${dl.emotion}"`);
        if (dl.duration) parts.push(`duration = ${dl.duration}f`);
        if (dl.voiceClip) parts.push(`voiceClip = "${dl.voiceClip}"`);
        lines.push(`            new DialogueLine { ${parts.join(', ')} },`);
      }
      lines.push('        },');
    }

    if (chapter.choices && chapter.choices.length > 0) {
      lines.push('        choices = new Choice[] {');
      for (const ch of chapter.choices) {
        const parts = [`text = "${ch.text}"`];
        if (ch.nextChapter) parts.push(`nextChapter = "${ch.nextChapter}"`);
        if (ch.condition) parts.push(`condition = "${ch.condition}"`);
        if (ch.action) parts.push(`action = "${ch.action}"`);
        lines.push(`            new Choice { ${parts.join(', ')} },`);
      }
      lines.push('        },');
    }

    lines.push('    };');
  }

  lines.push('}');
  return lines.join('\n');
}

/** Generate Godot 4 GDScript signal-based narrative controller */
export function narrativeToGodot(narrative: CompiledNarrative): string {
  const lines: string[] = [];
  const safeName = narrative.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`# StoryWeaver Narrative: ${narrative.name}`);
  lines.push('extends Node');
  lines.push(`class_name ${safeName}Narrative`);
  lines.push('');
  lines.push('signal chapter_started(chapter_name: String)');
  lines.push('signal chapter_complete(chapter_name: String)');
  lines.push('signal dialogue_line(speaker: String, text: String, emotion: String)');
  lines.push('signal choice_presented(choices: Array)');
  lines.push('');
  lines.push(`var narrative_type: String = "${narrative.type}"`);
  lines.push(
    `var current_chapter: String = "${narrative.startChapter || narrative.chapters[0]?.name || ''}"`
  );

  // Chapter data dictionary
  lines.push('');
  lines.push('var chapters: Dictionary = {');
  for (const chapter of narrative.chapters) {
    const chKey = chapter.name.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`    "${chKey}": {`);
    if (chapter.trigger) lines.push(`        "trigger": "${chapter.trigger}",`);
    if (chapter.onComplete) lines.push(`        "on_complete": "${chapter.onComplete}",`);

    if (chapter.dialogueLines && chapter.dialogueLines.length > 0) {
      lines.push('        "dialogue": [');
      for (const dl of chapter.dialogueLines) {
        lines.push(
          `            {"speaker": "${dl.speaker || ''}", "text": "${dl.text}", "emotion": "${dl.emotion || 'neutral'}"},`
        );
      }
      lines.push('        ],');
    }

    if (chapter.choices && chapter.choices.length > 0) {
      lines.push('        "choices": [');
      for (const ch of chapter.choices) {
        lines.push(`            {"text": "${ch.text}", "next": "${ch.nextChapter || ''}"},`);
      }
      lines.push('        ],');
    }

    lines.push('    },');
  }
  lines.push('}');

  // Advance function
  lines.push('');
  lines.push('func advance_chapter(chapter_name: String) -> void:');
  lines.push('    current_chapter = chapter_name');
  lines.push('    chapter_started.emit(chapter_name)');
  lines.push('    if chapters.has(chapter_name):');
  lines.push('        var ch = chapters[chapter_name]');
  lines.push('        if ch.has("dialogue"):');
  lines.push('            for line in ch["dialogue"]:');
  lines.push('                dialogue_line.emit(line["speaker"], line["text"], line["emotion"])');
  lines.push('        if ch.has("choices"):');
  lines.push('            choice_presented.emit(ch["choices"])');
  lines.push('        elif ch.has("on_complete"):');
  lines.push('            chapter_complete.emit(chapter_name)');
  lines.push('            advance_chapter(ch["on_complete"])');

  return lines.join('\n');
}

/** Generate VRChat SDK3 UdonSharp narrative controller */
export function narrativeToVRChat(narrative: CompiledNarrative): string {
  const lines: string[] = [];
  const safeName = narrative.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`// StoryWeaver Narrative: ${narrative.name} (VRChat UdonSharp)`);
  lines.push('[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]');
  lines.push(`public class ${safeName}Narrative : UdonSharpBehaviour {`);
  lines.push('    [UdonSynced] public int currentChapter = 0;');
  lines.push(
    `    private string[] chapterNames = new string[] { ${narrative.chapters.map((c) => `"${esc(c.name, 'CSharp')}"`).join(', ')} };`
  );
  lines.push('');

  // Trigger detection
  for (let i = 0; i < narrative.chapters.length; i++) {
    const chapter = narrative.chapters[i];
    if (chapter.trigger) {
      lines.push(`    // Trigger for chapter "${chapter.name}": ${chapter.trigger}`);
    }
  }

  lines.push('');
  lines.push('    public void AdvanceChapter() {');
  lines.push('        if (!Networking.IsOwner(gameObject)) {');
  lines.push('            Networking.SetOwner(Networking.LocalPlayer, gameObject);');
  lines.push('        }');
  lines.push('        currentChapter++;');
  lines.push(
    '        if (currentChapter >= chapterNames.Length) currentChapter = chapterNames.Length - 1;'
  );
  lines.push('        RequestSerialization();');
  lines.push('    }');

  lines.push('');
  lines.push('    public override void OnDeserialization() {');
  lines.push('        // Sync chapter state across all players');
  lines.push('        UpdateNarrativeUI();');
  lines.push('    }');

  lines.push('');
  lines.push('    private void UpdateNarrativeUI() {');
  for (let i = 0; i < narrative.chapters.length; i++) {
    const chapter = narrative.chapters[i];
    if (chapter.dialogueLines && chapter.dialogueLines.length > 0) {
      const dl = chapter.dialogueLines[0];
      lines.push(`        if (currentChapter == ${i}) {`);
      lines.push(`            // ${dl.speaker || 'Narrator'}: "${dl.text}"`);
      lines.push('        }');
    }
  }
  lines.push('    }');

  lines.push('}');
  return lines.join('\n');
}

/** Generate React-compatible narrative state for R3F renderer */
export function narrativeToR3F(narrative: CompiledNarrative): string {
  const lines: string[] = [];
  const safeName = narrative.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`// StoryWeaver Narrative: ${narrative.name} (R3F/React)`);
  lines.push(`export const ${safeName}NarrativeData = {`);
  lines.push(`  name: "${narrative.name}",`);
  lines.push(`  type: "${narrative.type}",`);
  if (narrative.startChapter) lines.push(`  startChapter: "${narrative.startChapter}",`);

  lines.push('  chapters: [');
  for (const chapter of narrative.chapters) {
    lines.push('    {');
    lines.push(`      name: "${chapter.name}",`);
    if (chapter.trigger) lines.push(`      trigger: "${chapter.trigger}",`);
    if (chapter.onComplete) lines.push(`      onComplete: "${chapter.onComplete}",`);

    if (chapter.dialogueLines && chapter.dialogueLines.length > 0) {
      lines.push('      dialogueLines: [');
      for (const dl of chapter.dialogueLines) {
        const parts: string[] = [`text: "${dl.text}"`];
        if (dl.speaker) parts.push(`speaker: "${dl.speaker}"`);
        if (dl.emotion) parts.push(`emotion: "${dl.emotion}"`);
        if (dl.duration) parts.push(`duration: ${dl.duration}`);
        lines.push(`        { ${parts.join(', ')} },`);
      }
      lines.push('      ],');
    }

    if (chapter.choices && chapter.choices.length > 0) {
      lines.push('      choices: [');
      for (const ch of chapter.choices) {
        const parts: string[] = [`text: "${ch.text}"`];
        if (ch.nextChapter) parts.push(`nextChapter: "${ch.nextChapter}"`);
        if (ch.condition) parts.push(`condition: "${ch.condition}"`);
        lines.push(`        { ${parts.join(', ')} },`);
      }
      lines.push('      ],');
    }

    lines.push('    },');
  }
  lines.push('  ],');
  lines.push('};');

  return lines.join('\n');
}

/** Generate USD customData annotations for AR narratives */
export function narrativeToUSDA(narrative: CompiledNarrative): string {
  const lines: string[] = [];
  const safeName = narrative.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`def Scope "Narrative_${safeName}" {`);
  lines.push(`    custom string holoscript:narrativeType = "${narrative.type}"`);
  if (narrative.startChapter) {
    lines.push(`    custom string holoscript:startChapter = "${narrative.startChapter}"`);
  }

  for (const chapter of narrative.chapters) {
    const chName = chapter.name.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`    def Scope "Chapter_${chName}" {`);
    lines.push(`        custom string holoscript:chapterName = "${chapter.name}"`);
    if (chapter.trigger)
      lines.push(`        custom string holoscript:trigger = "${chapter.trigger}"`);
    if (chapter.onComplete)
      lines.push(`        custom string holoscript:onComplete = "${chapter.onComplete}"`);

    if (chapter.dialogueLines) {
      for (let i = 0; i < chapter.dialogueLines.length; i++) {
        const dl = chapter.dialogueLines[i];
        lines.push(`        def Scope "Dialogue_${i}" {`);
        lines.push(`            custom string holoscript:text = "${dl.text}"`);
        if (dl.speaker)
          lines.push(`            custom string holoscript:speaker = "${dl.speaker}"`);
        if (dl.emotion)
          lines.push(`            custom string holoscript:emotion = "${dl.emotion}"`);
        if (dl.duration)
          lines.push(`            custom float holoscript:duration = ${dl.duration}`);
        lines.push('        }');
      }
    }

    if (chapter.choices) {
      for (let i = 0; i < chapter.choices.length; i++) {
        const ch = chapter.choices[i];
        lines.push(`        def Scope "Choice_${i}" {`);
        lines.push(`            custom string holoscript:text = "${ch.text}"`);
        if (ch.nextChapter)
          lines.push(`            custom string holoscript:nextChapter = "${ch.nextChapter}"`);
        if (ch.condition)
          lines.push(`            custom string holoscript:condition = "${ch.condition}"`);
        lines.push('        }');
      }
    }

    if (chapter.cutsceneActions) {
      for (let i = 0; i < chapter.cutsceneActions.length; i++) {
        const ca = chapter.cutsceneActions[i];
        lines.push(`        def Scope "CutsceneAction_${i}" {`);
        lines.push(`            custom string holoscript:actionType = "${ca.type}"`);
        if (ca.target) lines.push(`            custom string holoscript:target = "${ca.target}"`);
        if (ca.duration)
          lines.push(`            custom float holoscript:duration = ${ca.duration}`);
        lines.push('        }');
      }
    }

    lines.push('    }');
  }

  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// x402 Payment Protocol Compilation
// =============================================================================

import type { CompiledPaywall } from '../parser/HoloCompositionTypes';

export function compilePaymentBlock(block: HoloDomainBlock): CompiledPaywall {
  const props = block.properties || {};

  const paywallType: CompiledPaywall['type'] =
    block.keyword === 'subscription'
      ? 'subscription'
      : block.keyword === 'tip_jar'
        ? 'tip'
        : block.keyword === 'per_use' || props.per_use
          ? 'per_use'
          : 'one_time';

  // Extract gated content from children or property
  const gatedContent: string[] = [];
  if (props.gated_content && Array.isArray(props.gated_content)) {
    gatedContent.push(...(props.gated_content as string[]));
  } else if (typeof props.gated_content === 'string') {
    gatedContent.push(props.gated_content as string);
  }
  for (const child of block.children || []) {
    const c = child as unknown as HoloDomainBlock;
    if (c.name) gatedContent.push(c.name);
  }

  // Extract revenue split
  let revenueSplit: CompiledPaywall['revenueSplit'] | undefined;
  if (props.revenue_split && typeof props.revenue_split === 'object') {
    const rs = props.revenue_split as Record<string, unknown>;
    revenueSplit = {
      creator: (rs.creator as number) ?? 80,
      platform: (rs.platform as number) ?? 10,
      agent: (rs.agent as number) ?? 10,
    };
  }

  return {
    name: block.name || 'unnamed',
    price: (props.price as number) ?? 0,
    asset: ((props.asset as string) ?? 'USDC') as CompiledPaywall['asset'],
    network: ((props.network as string) ?? 'base') as CompiledPaywall['network'],
    recipient: (props.recipient || props.wallet || '') as string,
    description: (props.description || props.message) as string | undefined,
    type: paywallType,
    gatedContent: gatedContent.length > 0 ? gatedContent : undefined,
    revenueSplit,
  };
}

/** Generate Unity C# ScriptableObject paywall controller */
export function paymentToUnity(paywall: CompiledPaywall): string {
  const lines: string[] = [];
  const safeName = paywall.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`// x402 Paywall: ${paywall.name}`);
  lines.push(`[CreateAssetMenu(menuName = "x402/${safeName}")]`);
  lines.push(`public class ${safeName}Paywall : ScriptableObject {`);
  lines.push(`    public decimal price = ${paywall.price}m;`);
  lines.push(`    public string asset = "${paywall.asset}";`);
  lines.push(`    public string network = "${paywall.network}";`);
  lines.push(`    public string recipientWallet = "${paywall.recipient}";`);
  lines.push(`    public string paywallType = "${paywall.type}";`);
  if (paywall.description) {
    lines.push(`    public string description = "${paywall.description}";`);
  }
  if (paywall.gatedContent && paywall.gatedContent.length > 0) {
    lines.push(
      `    public string[] gatedObjects = new string[] { ${paywall.gatedContent.map((g) => `"${esc(g, 'CSharp')}"`).join(', ')} };`
    );
  }
  if (paywall.revenueSplit) {
    lines.push(
      `    // Revenue split: ${paywall.revenueSplit.creator}% Creator, ${paywall.revenueSplit.platform}% Platform, ${paywall.revenueSplit.agent}% Agent`
    );
  }
  lines.push('');
  lines.push('    public bool IsUnlocked { get; private set; }');
  lines.push('');
  lines.push('    public async Task<bool> RequestPayment() {');
  lines.push('        // HTTP 402 payment flow via x402 protocol');
  lines.push('        var response = await Http.Get(paymentEndpoint);');
  lines.push('        if (response.StatusCode == 402) {');
  lines.push('            var challenge = JsonUtility.FromJson<PaymentChallenge>(response.Body);');
  lines.push('            return await ProcessPayment(challenge);');
  lines.push('        }');
  lines.push('        return false;');
  lines.push('    }');
  lines.push('}');

  return lines.join('\n');
}

/** Generate Godot 4 GDScript payment gate controller */
export function paymentToGodot(paywall: CompiledPaywall): string {
  const lines: string[] = [];
  const safeName = paywall.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`# x402 Paywall: ${paywall.name}`);
  lines.push('extends Node');
  lines.push(`class_name ${safeName}Paywall`);
  lines.push('');
  lines.push('signal payment_required(price: float, asset: String)');
  lines.push('signal payment_verified(tx_hash: String)');
  lines.push('signal access_granted');
  lines.push('');
  lines.push(`var price: float = ${paywall.price}`);
  lines.push(`var asset: String = "${paywall.asset}"`);
  lines.push(`var network: String = "${paywall.network}"`);
  lines.push(`var recipient: String = "${paywall.recipient}"`);
  lines.push(`var paywall_type: String = "${paywall.type}"`);
  lines.push('var is_unlocked: bool = false');
  if (paywall.gatedContent && paywall.gatedContent.length > 0) {
    lines.push(
      `var gated_objects: Array = [${paywall.gatedContent.map((g) => `"${esc(g, 'GDScript')}"`).join(', ')}]`
    );
  }
  lines.push('');
  lines.push('func request_payment() -> void:');
  lines.push('    payment_required.emit(price, asset)');
  lines.push('');
  lines.push('func verify_payment(tx_hash: String) -> void:');
  lines.push('    payment_verified.emit(tx_hash)');
  lines.push('    is_unlocked = true');
  lines.push('    access_granted.emit()');
  if (paywall.gatedContent && paywall.gatedContent.length > 0) {
    lines.push('    for obj_name in gated_objects:');
    lines.push('        var node = get_node_or_null(obj_name)');
    lines.push('        if node: node.visible = true');
  }

  return lines.join('\n');
}

/** Generate VRChat SDK3 UdonSharp paywall controller */
export function paymentToVRChat(paywall: CompiledPaywall): string {
  const lines: string[] = [];
  const safeName = paywall.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`// x402 Paywall: ${paywall.name} (VRChat UdonSharp)`);
  lines.push('[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]');
  lines.push(`public class ${safeName}Paywall : UdonSharpBehaviour {`);
  lines.push('    [UdonSynced] public bool isUnlocked = false;');
  lines.push(`    public float price = ${paywall.price}f;`);
  lines.push(`    public string asset = "${paywall.asset}";`);
  lines.push(`    public string network = "${paywall.network}";`);
  lines.push(`    public string paymentUrl = "https://hololand.app/pay/${safeName}";`);
  if (paywall.gatedContent && paywall.gatedContent.length > 0) {
    lines.push('    public GameObject[] gatedObjects;');
  }
  lines.push('');
  lines.push('    public override void Interact() {');
  lines.push('        if (!isUnlocked) {');
  lines.push('            VRCUrl url = new VRCUrl(paymentUrl);');
  lines.push('        }');
  lines.push('    }');
  lines.push('');
  lines.push('    public void OnPaymentVerified() {');
  lines.push('        if (!Networking.IsOwner(gameObject)) {');
  lines.push('            Networking.SetOwner(Networking.LocalPlayer, gameObject);');
  lines.push('        }');
  lines.push('        isUnlocked = true;');
  lines.push('        RequestSerialization();');
  lines.push('    }');
  lines.push('');
  lines.push('    public override void OnDeserialization() {');
  if (paywall.gatedContent && paywall.gatedContent.length > 0) {
    lines.push('        foreach (var obj in gatedObjects) {');
    lines.push('            if (obj != null) obj.SetActive(isUnlocked);');
    lines.push('        }');
  }
  lines.push('    }');
  lines.push('}');

  return lines.join('\n');
}

/** Generate React-compatible payment gate config for R3F renderer */
export function paymentToR3F(paywall: CompiledPaywall): string {
  const lines: string[] = [];
  const safeName = paywall.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`// x402 Paywall: ${paywall.name} (R3F/React)`);
  lines.push(`export const ${safeName}PaywallConfig = {`);
  lines.push(`  name: "${paywall.name}",`);
  lines.push(`  price: ${paywall.price},`);
  lines.push(`  asset: "${paywall.asset}",`);
  lines.push(`  network: "${paywall.network}",`);
  lines.push(`  recipient: "${paywall.recipient}",`);
  lines.push(`  type: "${paywall.type}",`);
  if (paywall.description) {
    lines.push(`  description: "${paywall.description}",`);
  }
  if (paywall.gatedContent && paywall.gatedContent.length > 0) {
    lines.push(
      `  gatedContent: [${paywall.gatedContent.map((g) => `"${esc(g, 'TypeScript')}"`).join(', ')}],`
    );
  }
  if (paywall.revenueSplit) {
    lines.push(
      `  revenueSplit: { creator: ${paywall.revenueSplit.creator}, platform: ${paywall.revenueSplit.platform}, agent: ${paywall.revenueSplit.agent} },`
    );
  }
  lines.push('};');

  return lines.join('\n');
}

/** Generate USD customData annotations for AR monetization */
export function paymentToUSDA(paywall: CompiledPaywall): string {
  const lines: string[] = [];
  const safeName = paywall.name.replace(/[^a-zA-Z0-9_]/g, '_');

  lines.push(`def Scope "Paywall_${safeName}" {`);
  lines.push(`    custom string holoscript:paywallType = "${paywall.type}"`);
  lines.push(`    custom float holoscript:price = ${paywall.price}`);
  lines.push(`    custom string holoscript:asset = "${paywall.asset}"`);
  lines.push(`    custom string holoscript:network = "${paywall.network}"`);
  if (paywall.recipient) {
    lines.push(`    custom string holoscript:recipient = "${paywall.recipient}"`);
  }
  if (paywall.description) {
    lines.push(`    custom string holoscript:description = "${paywall.description}"`);
  }
  if (paywall.gatedContent && paywall.gatedContent.length > 0) {
    lines.push(
      `    custom string[] holoscript:gatedContent = [${paywall.gatedContent.map((g) => `"${esc(g, 'USD')}"`).join(', ')}]`
    );
  }
  if (paywall.revenueSplit) {
    lines.push(`    custom float holoscript:revenueSplitCreator = ${paywall.revenueSplit.creator}`);
    lines.push(
      `    custom float holoscript:revenueSplitPlatform = ${paywall.revenueSplit.platform}`
    );
    lines.push(`    custom float holoscript:revenueSplitAgent = ${paywall.revenueSplit.agent}`);
  }
  lines.push('}');

  return lines.join('\n');
}

// =============================================================================
// Healthcare / Medical Domain Compilation
// =============================================================================

import type { CompiledHealthcare, CompiledRobotics } from '../parser/HoloCompositionTypes';

export function compileHealthcareBlock(block: HoloDomainBlock): CompiledHealthcare {
  const props = block.properties || {};

  // Extract DICOM window/level
  let dicomWindow: CompiledHealthcare['dicomWindow'];
  if (props.window_center != null || props.window_width != null) {
    dicomWindow = {
      center: (props.window_center as number) ?? 40,
      width: (props.window_width as number) ?? 400,
    };
  }

  // Extract vital signs
  let vitalSigns: string[] | undefined;
  if (Array.isArray(props.vital_signs)) {
    vitalSigns = props.vital_signs as string[];
  } else if (typeof props.vital_signs === 'string') {
    vitalSigns = [props.vital_signs as string];
  }

  // Extract alert thresholds
  let alertThresholds: CompiledHealthcare['alertThresholds'];
  if (props.alert_thresholds && typeof props.alert_thresholds === 'object') {
    alertThresholds = props.alert_thresholds as Record<string, { min: number; max: number }>;
  }

  // Extract procedure steps from children or property
  const procedureSteps: string[] = [];
  if (Array.isArray(props.steps)) {
    procedureSteps.push(...(props.steps as string[]));
  }
  for (const child of block.children || []) {
    const c = child as unknown as HoloDomainBlock;
    if (c.keyword === 'step' && c.name) procedureSteps.push(c.name);
  }

  // Display fields
  let displayFields: string[] | undefined;
  if (Array.isArray(props.display_fields)) {
    displayFields = props.display_fields as string[];
  }

  return {
    name: block.name || 'unnamed',
    keyword: block.keyword,
    modality: props.modality as string | undefined,
    bodySystem: (props.body_system || props.bodySystem) as string | undefined,
    dicomWindow,
    vitalSigns,
    alertThresholds,
    procedureSteps: procedureSteps.length > 0 ? procedureSteps : undefined,
    displayFields,
    traits: block.traits || [],
    properties: props,
  };
}

/** React Three Fiber medical visualization component */
export function healthcareToR3F(healthcare: CompiledHealthcare): string {
  const safeName = healthcare.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];

  lines.push(`// Medical: ${healthcare.name} (${healthcare.keyword})`);
  lines.push(`export const ${safeName}Config = {`);
  lines.push(`  name: "${healthcare.name}",`);
  lines.push(`  type: "${healthcare.keyword}",`);
  if (healthcare.modality) {
    lines.push(`  modality: "${healthcare.modality}",`);
  }
  if (healthcare.bodySystem) {
    lines.push(`  bodySystem: "${healthcare.bodySystem}",`);
  }
  if (healthcare.dicomWindow) {
    lines.push(
      `  dicomWindow: { center: ${healthcare.dicomWindow.center}, width: ${healthcare.dicomWindow.width} },`
    );
  }
  if (healthcare.vitalSigns) {
    lines.push(
      `  vitalSigns: [${healthcare.vitalSigns.map((v) => `"${esc(v, 'TypeScript')}"`).join(', ')}],`
    );
  }
  if (healthcare.alertThresholds) {
    lines.push(`  alertThresholds: ${JSON.stringify(healthcare.alertThresholds)},`);
  }
  if (healthcare.procedureSteps) {
    lines.push(
      `  steps: [${healthcare.procedureSteps.map((s) => `"${esc(s, 'TypeScript')}"`).join(', ')}],`
    );
  }
  lines.push('};');

  return lines.join('\n');
}

/** Unity C# medical component */
export function healthcareToUnity(healthcare: CompiledHealthcare): string {
  const safeName = healthcare.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];

  lines.push(`// Medical: ${healthcare.name}`);
  lines.push(`public class ${safeName}Medical : MonoBehaviour {`);
  lines.push(`    public string medicalType = "${healthcare.keyword}";`);
  if (healthcare.modality) {
    lines.push(`    public string modality = "${healthcare.modality}";`);
  }
  if (healthcare.bodySystem) {
    lines.push(`    public string bodySystem = "${healthcare.bodySystem}";`);
  }
  if (healthcare.dicomWindow) {
    lines.push(`    public float windowCenter = ${healthcare.dicomWindow.center}f;`);
    lines.push(`    public float windowWidth = ${healthcare.dicomWindow.width}f;`);
  }
  if (healthcare.vitalSigns) {
    lines.push(
      `    public string[] vitalSigns = new string[] { ${healthcare.vitalSigns.map((v) => `"${esc(v, 'CSharp')}"`).join(', ')} };`
    );
  }
  if (healthcare.procedureSteps) {
    lines.push(
      `    public string[] procedureSteps = new string[] { ${healthcare.procedureSteps.map((s) => `"${esc(s, 'CSharp')}"`).join(', ')} };`
    );
  }
  lines.push('');
  if (healthcare.dicomWindow) {
    lines.push('    // DICOM window-leveling shader uniforms');
    lines.push('    void Start() {');
    lines.push('        var renderer = GetComponent<Renderer>();');
    lines.push('        if (renderer != null) {');
    lines.push(
      `            renderer.material.SetFloat("_WindowCenter", ${healthcare.dicomWindow.center}f);`
    );
    lines.push(
      `            renderer.material.SetFloat("_WindowWidth", ${healthcare.dicomWindow.width}f);`
    );
    lines.push('        }');
    lines.push('    }');
  }
  lines.push('}');

  return lines.join('\n');
}

/** Godot GDScript medical node */
export function healthcareToGodot(healthcare: CompiledHealthcare): string {
  const lines: string[] = [];

  lines.push(`# Medical: ${healthcare.name}`);
  lines.push('extends Node3D');
  lines.push('');
  lines.push(`@export var medical_type: String = "${healthcare.keyword}"`);
  if (healthcare.modality) {
    lines.push(`@export var modality: String = "${healthcare.modality}"`);
  }
  if (healthcare.bodySystem) {
    lines.push(`@export var body_system: String = "${healthcare.bodySystem}"`);
  }
  if (healthcare.dicomWindow) {
    lines.push(`@export var window_center: float = ${healthcare.dicomWindow.center}`);
    lines.push(`@export var window_width: float = ${healthcare.dicomWindow.width}`);
  }
  if (healthcare.vitalSigns) {
    lines.push(
      `@export var vital_signs: PackedStringArray = [${healthcare.vitalSigns.map((v) => `"${esc(v, 'GDScript')}"`).join(', ')}]`
    );
  }
  if (healthcare.dicomWindow) {
    lines.push('');
    lines.push('signal window_level_changed(center: float, width: float)');
    lines.push('');
    lines.push('func set_window_level(center: float, width: float) -> void:');
    lines.push('    window_center = center');
    lines.push('    window_width = width');
    lines.push('    var mat = get_node("MeshInstance3D").get_surface_override_material(0)');
    lines.push('    if mat:');
    lines.push('        mat.set_shader_parameter("window_center", center)');
    lines.push('        mat.set_shader_parameter("window_width", width)');
    lines.push('    window_level_changed.emit(center, width)');
  }

  return lines.join('\n');
}

/** VRChat UdonSharp medical display */
export function healthcareToVRChat(healthcare: CompiledHealthcare): string {
  const safeName = healthcare.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];

  lines.push(`// Medical: ${healthcare.name}`);
  lines.push(`[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]`);
  lines.push(`public class ${safeName}Medical : UdonSharpBehaviour {`);
  lines.push(`    public string medicalType = "${healthcare.keyword}";`);
  if (healthcare.vitalSigns) {
    lines.push(`    [UdonSynced] public string vitalData = "";`);
  }
  if (healthcare.dicomWindow) {
    lines.push(`    [UdonSynced] public float windowCenter = ${healthcare.dicomWindow.center}f;`);
    lines.push(`    [UdonSynced] public float windowWidth = ${healthcare.dicomWindow.width}f;`);
  }
  lines.push('}');

  return lines.join('\n');
}

/** USD medical annotations */
export function healthcareToUSDA(healthcare: CompiledHealthcare): string {
  const safeName = healthcare.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];

  lines.push(`def Scope "Medical_${safeName}" {`);
  lines.push(`    custom string holoscript:medicalType = "${healthcare.keyword}"`);
  if (healthcare.modality) {
    lines.push(`    custom string holoscript:modality = "${healthcare.modality}"`);
  }
  if (healthcare.bodySystem) {
    lines.push(`    custom string holoscript:bodySystem = "${healthcare.bodySystem}"`);
  }
  if (healthcare.dicomWindow) {
    lines.push(`    custom float holoscript:dicomWindowCenter = ${healthcare.dicomWindow.center}`);
    lines.push(`    custom float holoscript:dicomWindowWidth = ${healthcare.dicomWindow.width}`);
  }
  lines.push('}');

  return lines.join('\n');
}

// =============================================================================
// Robotics Domain Compilation
// =============================================================================

export function compileRoboticsBlock(block: HoloDomainBlock): CompiledRobotics {
  const props = block.properties || {};

  // Extract joint limits
  let jointLimits: CompiledRobotics['jointLimits'];
  if (
    props.lower != null ||
    props.upper != null ||
    props.effort != null ||
    props.velocity != null
  ) {
    jointLimits = {
      lower: (props.lower as number) ?? -3.14159,
      upper: (props.upper as number) ?? 3.14159,
      effort: (props.effort as number) ?? 100,
      velocity: (props.velocity as number) ?? 1.0,
    };
  } else if (props.limits && typeof props.limits === 'object') {
    const lim = props.limits as Record<string, unknown>;
    jointLimits = {
      lower: (lim.lower as number) ?? -3.14159,
      upper: (lim.upper as number) ?? 3.14159,
      effort: (lim.effort as number) ?? 100,
      velocity: (lim.velocity as number) ?? 1.0,
    };
  }

  // ROS 2 configuration
  let ros2: CompiledRobotics['ros2'];
  if (props.ros2_package || props.ros2_node || props.ros2_topic) {
    ros2 = {
      packageName: props.ros2_package as string | undefined,
      nodeType: props.ros2_node as string | undefined,
      topicName: props.ros2_topic as string | undefined,
    };
  }

  return {
    name: block.name || 'unnamed',
    keyword: block.keyword,
    jointType: (props.joint_type || props.type) as string | undefined,
    jointLimits,
    driveType: (props.drive_type || props.drive) as string | undefined,
    controllerType: (props.controller_type || props.controller) as string | undefined,
    effectorType: (props.effector_type || props.effector) as string | undefined,
    sensorType: (props.sensor_type || props.sensor) as string | undefined,
    ros2,
    safetyRating: (props.safety_rating || props.safety) as string | undefined,
    traits: block.traits || [],
    properties: props,
  };
}

/** React Three Fiber robot component config */
export function roboticsToR3F(robotics: CompiledRobotics): string {
  const safeName = robotics.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];

  lines.push(`// Robotics: ${robotics.name} (${robotics.keyword})`);
  lines.push(`export const ${safeName}Config = {`);
  lines.push(`  name: "${robotics.name}",`);
  lines.push(`  type: "${robotics.keyword}",`);
  if (robotics.jointType) {
    lines.push(`  jointType: "${robotics.jointType}",`);
  }
  if (robotics.jointLimits) {
    lines.push(
      `  jointLimits: { lower: ${robotics.jointLimits.lower}, upper: ${robotics.jointLimits.upper}, effort: ${robotics.jointLimits.effort}, velocity: ${robotics.jointLimits.velocity} },`
    );
  }
  if (robotics.driveType) {
    lines.push(`  driveType: "${robotics.driveType}",`);
  }
  if (robotics.controllerType) {
    lines.push(`  controllerType: "${robotics.controllerType}",`);
  }
  if (robotics.effectorType) {
    lines.push(`  effectorType: "${robotics.effectorType}",`);
  }
  if (robotics.sensorType) {
    lines.push(`  sensorType: "${robotics.sensorType}",`);
  }
  if (robotics.safetyRating) {
    lines.push(`  safetyRating: "${robotics.safetyRating}",`);
  }
  lines.push('};');

  return lines.join('\n');
}

/** Unity C# robotics component */
export function roboticsToUnity(robotics: CompiledRobotics): string {
  const safeName = robotics.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];

  lines.push(`// Robotics: ${robotics.name}`);
  lines.push(`public class ${safeName}Robotics : MonoBehaviour {`);
  lines.push(`    public string roboticsType = "${robotics.keyword}";`);
  if (robotics.jointType) {
    lines.push(
      `    public ArticulationJointType jointType = ArticulationJointType.${capitalizeFirst(robotics.jointType)};`
    );
  }
  if (robotics.jointLimits) {
    lines.push(`    public float lowerLimit = ${robotics.jointLimits.lower}f;`);
    lines.push(`    public float upperLimit = ${robotics.jointLimits.upper}f;`);
    lines.push(`    public float effortLimit = ${robotics.jointLimits.effort}f;`);
    lines.push(`    public float velocityLimit = ${robotics.jointLimits.velocity}f;`);
  }
  if (robotics.driveType) {
    lines.push(`    public string driveType = "${robotics.driveType}";`);
  }
  if (robotics.controllerType) {
    lines.push(`    public string controllerType = "${robotics.controllerType}";`);
  }
  if (robotics.safetyRating) {
    lines.push(`    public string safetyRating = "${robotics.safetyRating}";`);
  }
  lines.push('');
  if (robotics.jointLimits) {
    lines.push('    void Start() {');
    lines.push('        var body = GetComponent<ArticulationBody>();');
    lines.push('        if (body != null) {');
    lines.push('            var drive = body.xDrive;');
    lines.push(`            drive.lowerLimit = ${robotics.jointLimits.lower}f * Mathf.Rad2Deg;`);
    lines.push(`            drive.upperLimit = ${robotics.jointLimits.upper}f * Mathf.Rad2Deg;`);
    lines.push(`            drive.forceLimit = ${robotics.jointLimits.effort}f;`);
    lines.push('            body.xDrive = drive;');
    lines.push('        }');
    lines.push('    }');
  }
  lines.push('}');

  return lines.join('\n');
}

/** Godot GDScript robotics node */
export function roboticsToGodot(robotics: CompiledRobotics): string {
  const lines: string[] = [];

  lines.push(`# Robotics: ${robotics.name}`);
  lines.push('extends Node3D');
  lines.push('');
  lines.push(`@export var robotics_type: String = "${robotics.keyword}"`);
  if (robotics.jointType) {
    lines.push(`@export var joint_type: String = "${robotics.jointType}"`);
  }
  if (robotics.jointLimits) {
    lines.push(`@export var lower_limit: float = ${robotics.jointLimits.lower}`);
    lines.push(`@export var upper_limit: float = ${robotics.jointLimits.upper}`);
    lines.push(`@export var effort_limit: float = ${robotics.jointLimits.effort}`);
    lines.push(`@export var velocity_limit: float = ${robotics.jointLimits.velocity}`);
  }
  if (robotics.driveType) {
    lines.push(`@export var drive_type: String = "${robotics.driveType}"`);
  }
  if (robotics.controllerType) {
    lines.push(`@export var controller_type: String = "${robotics.controllerType}"`);
  }
  if (robotics.safetyRating) {
    lines.push(`@export var safety_rating: String = "${robotics.safetyRating}"`);
  }
  if (robotics.jointType === 'revolute' || robotics.jointType === 'continuous') {
    lines.push('');
    lines.push('signal joint_position_changed(angle_rad: float)');
    lines.push('');
    lines.push('var current_angle: float = 0.0');
    lines.push('');
    lines.push('func set_joint_angle(angle: float) -> void:');
    if (robotics.jointLimits) {
      lines.push(
        `    angle = clampf(angle, ${robotics.jointLimits.lower}, ${robotics.jointLimits.upper})`
      );
    }
    lines.push('    current_angle = angle');
    lines.push('    rotation[0] = angle');
    lines.push('    joint_position_changed.emit(angle)');
  }

  return lines.join('\n');
}

/** VRChat UdonSharp robotics component */
export function roboticsToVRChat(robotics: CompiledRobotics): string {
  const safeName = robotics.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];

  lines.push(`// Robotics: ${robotics.name}`);
  lines.push(`[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]`);
  lines.push(`public class ${safeName}Robotics : UdonSharpBehaviour {`);
  lines.push(`    public string roboticsType = "${robotics.keyword}";`);
  if (robotics.jointType) {
    lines.push(`    public string jointType = "${robotics.jointType}";`);
  }
  if (robotics.jointLimits) {
    lines.push(`    [UdonSynced] public float jointAngle = 0f;`);
    lines.push(`    public float lowerLimit = ${robotics.jointLimits.lower}f;`);
    lines.push(`    public float upperLimit = ${robotics.jointLimits.upper}f;`);
  }
  if (robotics.safetyRating) {
    lines.push(`    public string safetyRating = "${robotics.safetyRating}";`);
  }
  lines.push('}');

  return lines.join('\n');
}

/** USD robotics annotations */
export function roboticsToUSDA(robotics: CompiledRobotics): string {
  const safeName = robotics.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];

  lines.push(`def Scope "Robotics_${safeName}" {`);
  lines.push(`    custom string holoscript:roboticsType = "${robotics.keyword}"`);
  if (robotics.jointType) {
    lines.push(`    custom string holoscript:jointType = "${robotics.jointType}"`);
  }
  if (robotics.jointLimits) {
    lines.push(`    custom float holoscript:jointLower = ${robotics.jointLimits.lower}`);
    lines.push(`    custom float holoscript:jointUpper = ${robotics.jointLimits.upper}`);
    lines.push(`    custom float holoscript:jointEffort = ${robotics.jointLimits.effort}`);
    lines.push(`    custom float holoscript:jointVelocity = ${robotics.jointLimits.velocity}`);
  }
  if (robotics.driveType) {
    lines.push(`    custom string holoscript:driveType = "${robotics.driveType}"`);
  }
  if (robotics.safetyRating) {
    lines.push(`    custom string holoscript:safetyRating = "${robotics.safetyRating}"`);
  }
  lines.push('}');

  return lines.join('\n');
}

// =============================================================================
// IoT Domain Compilation
// =============================================================================

import type {
  CompiledIoT,
  CompiledDataViz,
  CompiledEducation,
  CompiledMusic,
  CompiledArchitecture,
  CompiledWeb3,
  CompiledProcedural,
  CompiledRendering,
  CompiledNavigation,
  CompiledInput,
} from '../parser/HoloCompositionTypes';

export function compileIoTBlock(block: HoloDomainBlock): CompiledIoT {
  const props = block.properties || {};
  let telemetryFields: string[] | undefined;
  if (Array.isArray(props.telemetry_fields)) {
    telemetryFields = props.telemetry_fields as string[];
  } else if (typeof props.telemetry_fields === 'string') {
    telemetryFields = [props.telemetry_fields as string];
  }
  let bindings: Record<string, string> | undefined;
  if (props.bindings && typeof props.bindings === 'object') {
    bindings = props.bindings as Record<string, string>;
  }
  return {
    name: block.name || 'unnamed',
    keyword: block.keyword,
    deviceType: (props.device_type || props.type) as string | undefined,
    protocol: props.protocol as string | undefined,
    telemetryFields,
    updateInterval: props.update_interval as number | undefined,
    twinModel: (props.twin_model || props.model) as string | undefined,
    bindings,
    traits: block.traits || [],
    properties: props,
  };
}

export function iotToR3F(iot: CompiledIoT): string {
  const safeName = iot.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// IoT: ${iot.name} (${iot.keyword})`);
  lines.push(`export const ${safeName}Config = {`);
  lines.push(`  name: "${iot.name}",`);
  lines.push(`  type: "${iot.keyword}",`);
  if (iot.deviceType) lines.push(`  deviceType: "${iot.deviceType}",`);
  if (iot.protocol) lines.push(`  protocol: "${esc(iot.protocol, 'TypeScript')}",`);
  if (iot.telemetryFields)
    lines.push(
      `  telemetryFields: [${iot.telemetryFields.map((f) => `"${esc(f, 'TypeScript')}"`).join(', ')}],`
    );
  if (iot.updateInterval) lines.push(`  updateInterval: ${iot.updateInterval},`);
  if (iot.twinModel) lines.push(`  twinModel: "${esc(iot.twinModel, 'TypeScript')}",`);
  lines.push('};');
  return lines.join('\n');
}

export function iotToUnity(iot: CompiledIoT): string {
  const safeName = iot.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// IoT: ${iot.name}`);
  lines.push(`public class ${safeName}IoT : MonoBehaviour {`);
  lines.push(`    public string deviceType = "${esc(iot.keyword, 'CSharp')}";`);
  if (iot.protocol) lines.push(`    public string protocol = "${esc(iot.protocol, 'CSharp')}";`);
  if (iot.updateInterval)
    lines.push(`    public float updateInterval = ${iot.updateInterval / 1000}f;`);
  if (iot.telemetryFields)
    lines.push(
      `    public string[] telemetryFields = new string[] { ${iot.telemetryFields.map((f) => `"${esc(f, 'CSharp')}"`).join(', ')} };`
    );
  if (iot.twinModel) lines.push(`    public string twinModel = "${esc(iot.twinModel, 'CSharp')}";`);
  lines.push('}');
  return lines.join('\n');
}

export function iotToGodot(iot: CompiledIoT): string {
  const lines: string[] = [];
  lines.push(`# IoT: ${iot.name}`);
  lines.push('extends Node');
  lines.push('');
  lines.push(`@export var device_type: String = "${esc(iot.keyword, 'GDScript')}"`);
  if (iot.protocol) lines.push(`@export var protocol: String = "${esc(iot.protocol, 'GDScript')}"`);
  if (iot.updateInterval)
    lines.push(`@export var update_interval: float = ${iot.updateInterval / 1000}`);
  if (iot.telemetryFields)
    lines.push(
      `@export var telemetry_fields: PackedStringArray = [${iot.telemetryFields.map((f) => `"${esc(f, 'GDScript')}"`).join(', ')}]`
    );
  if (iot.twinModel)
    lines.push(`@export var twin_model: String = "${esc(iot.twinModel, 'GDScript')}"`);
  lines.push('');
  lines.push('signal telemetry_received(field: String, value: float)');
  lines.push('signal connection_changed(connected: bool)');
  return lines.join('\n');
}

export function iotToVRChat(iot: CompiledIoT): string {
  const safeName = iot.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// IoT: ${iot.name}`);
  lines.push('[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]');
  lines.push(`public class ${safeName}IoT : UdonSharpBehaviour {`);
  lines.push(`    public string deviceType = "${iot.keyword}";`);
  if (iot.telemetryFields) lines.push(`    [UdonSynced] public string telemetryData = "";`);
  if (iot.updateInterval)
    lines.push(`    public float updateInterval = ${iot.updateInterval / 1000}f;`);
  lines.push('}');
  return lines.join('\n');
}

export function iotToUSDA(iot: CompiledIoT): string {
  const safeName = iot.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`def Scope "IoT_${safeName}" {`);
  lines.push(`    custom string holoscript:deviceType = "${iot.keyword}"`);
  if (iot.protocol) lines.push(`    custom string holoscript:protocol = "${iot.protocol}"`);
  if (iot.updateInterval)
    lines.push(`    custom float holoscript:updateInterval = ${iot.updateInterval}`);
  if (iot.twinModel) lines.push(`    custom string holoscript:twinModel = "${iot.twinModel}"`);
  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// DataViz Domain Compilation
// =============================================================================

export interface PerceptualColorCompilerMetadata {
  mapName: string;
  colors: string[];
  stops: PerceptualGradientStop[];
  minDeltaE: number;
  maxDeltaE: number;
  meanDeltaE: number;
  warnings: string[];
  pass: PerceptualColorPassResult;
}

export type CompiledPerceptualDataViz = CompiledDataViz & {
  colorMap?: string;
  perceptualColorPass?: PerceptualColorCompilerMetadata;
};

function stringProperty(
  props: Record<string, unknown>,
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = props[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function numberProperty(
  props: Record<string, unknown>,
  keys: readonly string[]
): number | undefined {
  for (const key of keys) {
    const value = props[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function booleanProperty(
  props: Record<string, unknown>,
  keys: readonly string[]
): boolean | undefined {
  for (const key of keys) {
    const value = props[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function stringArrayProperty(
  props: Record<string, unknown>,
  keys: readonly string[]
): string[] | undefined {
  for (const key of keys) {
    const value = props[key];
    if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
      return [...value];
    }
  }
  return undefined;
}

function gradientStopsProperty(
  props: Record<string, unknown>,
  keys: readonly string[]
): PerceptualGradientStop[] | undefined {
  for (const key of keys) {
    const value = props[key];
    if (!Array.isArray(value)) continue;
    const stops: PerceptualGradientStop[] = [];
    for (const entry of value) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as Record<string, unknown>).t === 'number' &&
        typeof (entry as Record<string, unknown>).color === 'string'
      ) {
        const stop = entry as { t: number; color: string };
        stops.push({ t: stop.t, color: stop.color });
      }
    }
    if (stops.length > 0) return stops;
  }
  return undefined;
}

function sampledStopsFromColors(colors: readonly string[]): PerceptualGradientStop[] {
  if (colors.length === 0) return [];
  if (colors.length === 1) return [{ t: 0, color: colors[0] }];
  return colors.map((color, index) => ({
    t: index / (colors.length - 1),
    color,
  }));
}

function buildPerceptualColorMetadata(
  props: Record<string, unknown>,
  traits: readonly string[],
  fallbackColorMap = 'viridis'
): PerceptualColorCompilerMetadata | undefined {
  const colorMap = stringProperty(props, ['color_map', 'colormap', 'colorMap']);
  const palette = stringArrayProperty(props, ['palette', 'colors']);
  const gradient =
    gradientStopsProperty(props, ['gradient', 'color_gradient', 'colorGradient']) ??
    stringArrayProperty(props, ['gradient', 'color_gradient', 'colorGradient']);
  const enabled =
    traits.includes('perceptual_color') ||
    booleanProperty(props, ['perceptual_color', 'perceptualColor', 'scientific']) === true ||
    colorMap !== undefined ||
    palette !== undefined ||
    gradient !== undefined;

  if (!enabled) return undefined;

  const input: PerceptualColorPassInput = {
    colorMap: colorMap ?? (palette || gradient ? undefined : fallbackColorMap),
    palette,
    gradient,
    steps: numberProperty(props, ['steps', 'color_steps', 'colorSteps']),
    dampening: numberProperty(props, ['dampening', 'perceptual_dampening', 'perceptualDampening']),
    targetDeltaE: numberProperty(props, ['target_delta_e', 'targetDeltaE']),
    neutralAxis: booleanProperty(props, ['neutral_axis', 'neutralAxis']),
    scientific: true,
  };

  const pass = applyPerceptualColorPass(input);
  const source = pass.colorMap ?? pass.gradient ?? pass.palette;
  const colors = source?.colors ?? [];
  const stops = pass.colorMap?.stops ?? pass.gradient?.stops ?? sampledStopsFromColors(colors);

  return {
    mapName:
      pass.colorMap?.name ??
      colorMap ??
      (palette ? 'palette' : gradient ? 'gradient' : fallbackColorMap),
    colors,
    stops,
    minDeltaE: source?.minDeltaE ?? 0,
    maxDeltaE: source?.maxDeltaE ?? 0,
    meanDeltaE: source?.meanDeltaE ?? 0,
    warnings: pass.warnings,
    pass,
  };
}

function perceptualColorRampFloat32(metadata: PerceptualColorCompilerMetadata): string {
  return metadata.colors
    .map((color) => {
      const [r, g, b] = hexToRGBTuple(color);
      return `${r}, ${g}, ${b}, 1.0`;
    })
    .join(', ');
}

function perceptualColorRampLinearColors(metadata: PerceptualColorCompilerMetadata): string {
  return metadata.colors
    .map((color) => {
      const [r, g, b] = hexToRGBTuple(color);
      return `FLinearColor(${r}f, ${g}f, ${b}f, 1.0f)`;
    })
    .join(', ');
}

export function compileDataVizBlock(block: HoloDomainBlock): CompiledPerceptualDataViz {
  const props = block.properties || {};
  let axes: CompiledDataViz['axes'];
  if (props.x_axis || props.y_axis || props.z_axis) {
    axes = [String(props.x_axis ?? ''), String(props.y_axis ?? ''), String(props.z_axis ?? '')];
  } else if (props.axes && typeof props.axes === 'object') {
    const a = props.axes as Record<string, unknown>;
    axes = [String(a[0] ?? ''), String(a[1] ?? ''), String(a[2] ?? '')];
  }
  let dimensions: CompiledDataViz['dimensions'];
  if (props.width != null || props.height != null) {
    dimensions = { width: (props.width as number) ?? 400, height: (props.height as number) ?? 300 };
  }
  const traits = block.traits || [];
  const colorMap = stringProperty(props, ['color_map', 'colormap', 'colorMap']);
  const perceptualColorPass = buildPerceptualColorMetadata(props, traits, colorMap ?? 'viridis');
  return {
    name: block.name || 'unnamed',
    keyword: block.keyword,
    chartType: (props.chart_type || props.type) as string | undefined,
    dataSource: (props.data_source || props.source) as string | undefined,
    axes,
    aggregation: props.aggregation as string | undefined,
    refreshInterval: props.refresh_interval as number | undefined,
    dimensions,
    colorMap: colorMap ?? perceptualColorPass?.mapName,
    perceptualColorPass,
    traits,
    properties: props,
  };
}

export function datavizToR3F(dv: CompiledDataViz): string {
  const perceptual = (dv as CompiledPerceptualDataViz).perceptualColorPass;
  const safeName = dv.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// DataViz: ${dv.name} (${dv.keyword})`);
  lines.push(`export const ${safeName}Config = {`);
  lines.push(`  name: "${dv.name}",`);
  lines.push(`  type: "${dv.keyword}",`);
  if (dv.chartType) lines.push(`  chartType: "${dv.chartType}",`);
  if (dv.dataSource) lines.push(`  dataSource: "${dv.dataSource}",`);
  if (dv.axes) lines.push(`  axes: ${JSON.stringify(dv.axes)},`);
  if (dv.aggregation) lines.push(`  aggregation: "${dv.aggregation}",`);
  if (dv.refreshInterval) lines.push(`  refreshInterval: ${dv.refreshInterval},`);
  if (dv.dimensions)
    lines.push(`  dimensions: { width: ${dv.dimensions.width}, height: ${dv.dimensions.height} },`);
  if ((dv as CompiledPerceptualDataViz).colorMap)
    lines.push(`  colorMap: ${JSON.stringify((dv as CompiledPerceptualDataViz).colorMap)},`);
  if (perceptual) lines.push(`  perceptualColorPass: ${JSON.stringify(perceptual)},`);
  lines.push('};');
  return lines.join('\n');
}

export function datavizToUnity(dv: CompiledDataViz): string {
  const perceptual = (dv as CompiledPerceptualDataViz).perceptualColorPass;
  const safeName = dv.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// DataViz: ${dv.name}`);
  lines.push(`public class ${safeName}DataViz : MonoBehaviour {`);
  lines.push(`    public string vizType = "${dv.keyword}";`);
  if (dv.chartType) lines.push(`    public string chartType = "${dv.chartType}";`);
  if (dv.dataSource) lines.push(`    public string dataSource = "${dv.dataSource}";`);
  if (dv.refreshInterval)
    lines.push(`    public float refreshInterval = ${dv.refreshInterval / 1000}f;`);
  if (dv.dimensions) {
    lines.push(`    public float width = ${dv.dimensions.width}f;`);
    lines.push(`    public float height = ${dv.dimensions.height}f;`);
  }
  if ((dv as CompiledPerceptualDataViz).colorMap)
    lines.push(
      `    public string colorMap = "${esc((dv as CompiledPerceptualDataViz).colorMap!, 'CSharp')}";`
    );
  if (perceptual) {
    lines.push(
      `    public string[] perceptualColorRamp = new string[] { ${perceptual.colors.map((color) => `"${color}"`).join(', ')} };`
    );
    lines.push(`    public float perceptualMinDeltaE = ${perceptual.minDeltaE.toFixed(3)}f;`);
    lines.push(`    public float perceptualMeanDeltaE = ${perceptual.meanDeltaE.toFixed(3)}f;`);
  }
  lines.push('}');
  return lines.join('\n');
}

export function datavizToUnreal(dv: CompiledDataViz, varPrefix: string): string {
  const perceptual = (dv as CompiledPerceptualDataViz).perceptualColorPass;
  const lines: string[] = [];
  lines.push(`// DataViz: ${dv.name}`);
  lines.push(`FString ${varPrefix}DataVizType = TEXT("${esc(dv.keyword, 'CSharp')}");`);
  if (dv.chartType)
    lines.push(`FString ${varPrefix}ChartType = TEXT("${esc(dv.chartType, 'CSharp')}");`);
  if (dv.dataSource)
    lines.push(`FString ${varPrefix}DataSource = TEXT("${esc(dv.dataSource, 'CSharp')}");`);
  if (perceptual) {
    lines.push(`// PerceptualColorPass: ${perceptual.mapName}, ${perceptual.colors.length} stops`);
    lines.push(
      `TArray<FLinearColor> ${varPrefix}PerceptualColorRamp = { ${perceptualColorRampLinearColors(perceptual)} };`
    );
    lines.push(`float ${varPrefix}PerceptualMinDeltaE = ${perceptual.minDeltaE.toFixed(3)}f;`);
  }
  return lines.join('\n');
}

export function datavizToWebGPU(dv: CompiledDataViz, varPrefix: string): string {
  const perceptual = (dv as CompiledPerceptualDataViz).perceptualColorPass;
  const lines: string[] = [];
  lines.push(`// DataViz: ${dv.name}`);
  lines.push(
    `const ${varPrefix}DataVizConfig = ${JSON.stringify({
      name: dv.name,
      type: dv.keyword,
      chartType: dv.chartType,
      dataSource: dv.dataSource,
      axes: dv.axes,
      aggregation: dv.aggregation,
      refreshInterval: dv.refreshInterval,
      dimensions: dv.dimensions,
      colorMap: (dv as CompiledPerceptualDataViz).colorMap,
    })};`
  );
  if (perceptual) {
    lines.push(
      `const ${varPrefix}PerceptualColorRamp = new Float32Array([${perceptualColorRampFloat32(perceptual)}]);`
    );
    lines.push(
      `const ${varPrefix}PerceptualColorStats = ${JSON.stringify({
        minDeltaE: perceptual.minDeltaE,
        maxDeltaE: perceptual.maxDeltaE,
        meanDeltaE: perceptual.meanDeltaE,
        warnings: perceptual.warnings,
      })};`
    );
  }
  return lines.join('\n');
}

export function datavizToGodot(dv: CompiledDataViz): string {
  const lines: string[] = [];
  lines.push(`# DataViz: ${dv.name}`);
  lines.push('extends Control');
  lines.push('');
  lines.push(`@export var viz_type: String = "${dv.keyword}"`);
  if (dv.chartType) lines.push(`@export var chart_type: String = "${dv.chartType}"`);
  if (dv.dataSource) lines.push(`@export var data_source: String = "${dv.dataSource}"`);
  if (dv.refreshInterval)
    lines.push(`@export var refresh_interval: float = ${dv.refreshInterval / 1000}`);
  if (dv.dimensions) {
    lines.push(`@export var chart_width: float = ${dv.dimensions.width}`);
    lines.push(`@export var chart_height: float = ${dv.dimensions.height}`);
  }
  lines.push('');
  lines.push('signal data_updated(values: Array)');
  return lines.join('\n');
}

export function datavizToVRChat(dv: CompiledDataViz): string {
  const safeName = dv.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// DataViz: ${dv.name}`);
  lines.push('[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]');
  lines.push(`public class ${safeName}DataViz : UdonSharpBehaviour {`);
  lines.push(`    public string vizType = "${dv.keyword}";`);
  if (dv.chartType) lines.push(`    public string chartType = "${dv.chartType}";`);
  if (dv.dataSource) lines.push(`    [UdonSynced] public string dataJson = "";`);
  lines.push('}');
  return lines.join('\n');
}

export function datavizToUSDA(dv: CompiledDataViz): string {
  const safeName = dv.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`def Scope "DataViz_${safeName}" {`);
  lines.push(`    custom string holoscript:vizType = "${dv.keyword}"`);
  if (dv.chartType) lines.push(`    custom string holoscript:chartType = "${dv.chartType}"`);
  if (dv.dataSource) lines.push(`    custom string holoscript:dataSource = "${dv.dataSource}"`);
  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// Education Domain Compilation
// =============================================================================

export function compileEducationBlock(block: HoloDomainBlock): CompiledEducation {
  const props = block.properties || {};
  let objectives: string[] | undefined;
  if (Array.isArray(props.objectives)) objectives = props.objectives as string[];
  let prerequisites: string[] | undefined;
  if (Array.isArray(props.prerequisites)) prerequisites = props.prerequisites as string[];
  let questions: CompiledEducation['questions'];
  if (Array.isArray(props.questions)) {
    questions = (props.questions as unknown[]).map((q) =>
      typeof q === 'string'
        ? { question: q }
        : (q as { question: string; options?: string[]; answer?: string })
    );
  }
  // Extract questions from children (quiz sub-blocks)
  for (const child of block.children || []) {
    const c = child as unknown as HoloDomainBlock;
    if (c.keyword === 'question' && c.name) {
      if (!questions) questions = [];
      questions.push({
        question: c.name,
        options: c.properties?.options as string[] | undefined,
        answer: c.properties?.answer as string | undefined,
      });
    }
  }
  return {
    name: block.name || 'unnamed',
    keyword: block.keyword,
    contentType: (props.content_type || block.keyword) as string,
    difficulty: props.difficulty as string | undefined,
    objectives,
    questions,
    prerequisites,
    duration: props.duration as number | undefined,
    traits: block.traits || [],
    properties: props,
  };
}

export function educationToR3F(edu: CompiledEducation): string {
  const safeName = edu.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Education: ${edu.name} (${edu.keyword})`);
  lines.push(`export const ${safeName}Config = {`);
  lines.push(`  name: "${edu.name}",`);
  lines.push(`  type: "${edu.keyword}",`);
  if (edu.difficulty) lines.push(`  difficulty: "${esc(edu.difficulty, 'TypeScript')}",`);
  if (edu.objectives)
    lines.push(
      `  objectives: [${edu.objectives.map((o) => `"${esc(o, 'TypeScript')}"`).join(', ')}],`
    );
  if (edu.duration) lines.push(`  duration: ${edu.duration},`);
  if (edu.questions) lines.push(`  questions: ${JSON.stringify(edu.questions)},`);
  if (edu.prerequisites)
    lines.push(
      `  prerequisites: [${edu.prerequisites.map((p) => `"${esc(p, 'TypeScript')}"`).join(', ')}],`
    );
  lines.push('};');
  return lines.join('\n');
}

export function educationToUnity(edu: CompiledEducation): string {
  const safeName = edu.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Education: ${edu.name}`);
  lines.push(`public class ${safeName}Education : MonoBehaviour {`);
  lines.push(`    public string contentType = "${esc(edu.keyword, 'CSharp')}";`);
  if (edu.difficulty)
    lines.push(`    public string difficulty = "${esc(edu.difficulty, 'CSharp')}";`);
  if (edu.duration) lines.push(`    public int durationMinutes = ${edu.duration};`);
  if (edu.objectives)
    lines.push(
      `    public string[] objectives = new string[] { ${edu.objectives.map((o) => `"${esc(o, 'CSharp')}"`).join(', ')} };`
    );
  if (edu.questions) lines.push(`    public int questionCount = ${edu.questions.length};`);
  lines.push('}');
  return lines.join('\n');
}

export function educationToGodot(edu: CompiledEducation): string {
  const lines: string[] = [];
  lines.push(`# Education: ${edu.name}`);
  lines.push('extends Node');
  lines.push('');
  lines.push(`@export var content_type: String = "${esc(edu.keyword, 'GDScript')}"`);
  if (edu.difficulty)
    lines.push(`@export var difficulty: String = "${esc(edu.difficulty, 'GDScript')}"`);
  if (edu.duration) lines.push(`@export var duration_minutes: int = ${edu.duration}`);
  if (edu.objectives)
    lines.push(
      `@export var objectives: PackedStringArray = [${edu.objectives.map((o) => `"${esc(o, 'GDScript')}"`).join(', ')}]`
    );
  lines.push('');
  lines.push('signal lesson_completed(score: float)');
  lines.push('signal quiz_submitted(answers: Dictionary)');
  return lines.join('\n');
}

export function educationToVRChat(edu: CompiledEducation): string {
  const safeName = edu.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Education: ${edu.name}`);
  lines.push('[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]');
  lines.push(`public class ${safeName}Education : UdonSharpBehaviour {`);
  lines.push(`    public string contentType = "${edu.keyword}";`);
  if (edu.difficulty) lines.push(`    public string difficulty = "${edu.difficulty}";`);
  if (edu.questions) lines.push(`    [UdonSynced] public int currentQuestion = 0;`);
  lines.push('}');
  return lines.join('\n');
}

export function educationToUSDA(edu: CompiledEducation): string {
  const safeName = edu.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`def Scope "Education_${safeName}" {`);
  lines.push(`    custom string holoscript:contentType = "${edu.keyword}"`);
  if (edu.difficulty) lines.push(`    custom string holoscript:difficulty = "${edu.difficulty}"`);
  if (edu.duration) lines.push(`    custom int holoscript:durationMinutes = ${edu.duration}`);
  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// Music Domain Compilation
// =============================================================================

export function compileMusicBlock(block: HoloDomainBlock): CompiledMusic {
  const props = block.properties || {};
  let timeSignature: [number, number] | undefined;
  if (Array.isArray(props.time_signature) && props.time_signature.length === 2) {
    timeSignature = props.time_signature as [number, number];
  }
  let effects: string[] | undefined;
  if (Array.isArray(props.effects)) effects = props.effects as string[];
  // Extract effects from children
  for (const child of block.children || []) {
    const c = child as unknown as HoloDomainBlock;
    if (c.keyword === 'effect' && c.name) {
      if (!effects) effects = [];
      effects.push(c.name);
    }
  }
  return {
    name: block.name || 'unnamed',
    keyword: block.keyword,
    instrumentType: (props.instrument_type || props.type) as string | undefined,
    bpm: props.bpm as number | undefined,
    timeSignature,
    key: props.key as string | undefined,
    effects,
    pattern: props.pattern as string | undefined,
    bars: props.bars as number | undefined,
    traits: block.traits || [],
    properties: props,
  };
}

export function musicToR3F(music: CompiledMusic): string {
  const safeName = music.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Music: ${music.name} (${music.keyword})`);
  lines.push(`export const ${safeName}Config = {`);
  lines.push(`  name: "${music.name}",`);
  lines.push(`  type: "${music.keyword}",`);
  if (music.instrumentType) lines.push(`  instrumentType: "${music.instrumentType}",`);
  if (music.bpm) lines.push(`  bpm: ${music.bpm},`);
  if (music.timeSignature) lines.push(`  timeSignature: [${music.timeSignature.join(', ')}],`);
  if (music.key) lines.push(`  key: "${esc(music.key, 'TypeScript')}",`);
  if (music.effects)
    lines.push(`  effects: [${music.effects.map((e) => `"${esc(e, 'TypeScript')}"`).join(', ')}],`);
  if (music.pattern) lines.push(`  pattern: "${esc(music.pattern, 'TypeScript')}",`);
  if (music.bars) lines.push(`  bars: ${music.bars},`);
  lines.push('};');
  return lines.join('\n');
}

export function musicToUnity(music: CompiledMusic): string {
  const safeName = music.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Music: ${music.name}`);
  lines.push(`public class ${safeName}Music : MonoBehaviour {`);
  lines.push(`    public string musicType = "${esc(music.keyword, 'CSharp')}";`);
  if (music.instrumentType)
    lines.push(`    public string instrumentType = "${esc(music.instrumentType, 'CSharp')}";`);
  if (music.bpm) lines.push(`    public float bpm = ${music.bpm}f;`);
  if (music.key) lines.push(`    public string musicalKey = "${esc(music.key, 'CSharp')}";`);
  if (music.effects)
    lines.push(
      `    public string[] effects = new string[] { ${music.effects.map((e) => `"${esc(e, 'CSharp')}"`).join(', ')} };`
    );
  lines.push('}');
  return lines.join('\n');
}

export function musicToGodot(music: CompiledMusic): string {
  const lines: string[] = [];
  lines.push(`# Music: ${music.name}`);
  lines.push('extends Node');
  lines.push('');
  lines.push(`@export var music_type: String = "${music.keyword}"`);
  if (music.instrumentType)
    lines.push(`@export var instrument_type: String = "${music.instrumentType}"`);
  if (music.bpm) lines.push(`@export var bpm: float = ${music.bpm}`);
  if (music.key) lines.push(`@export var musical_key: String = "${music.key}"`);
  if (music.bars) lines.push(`@export var bars: int = ${music.bars}`);
  lines.push('');
  lines.push('signal beat(beat_number: int)');
  lines.push('signal bar_changed(bar_number: int)');
  return lines.join('\n');
}

export function musicToVRChat(music: CompiledMusic): string {
  const safeName = music.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Music: ${music.name}`);
  lines.push('[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]');
  lines.push(`public class ${safeName}Music : UdonSharpBehaviour {`);
  lines.push(`    public string musicType = "${music.keyword}";`);
  if (music.bpm) lines.push(`    [UdonSynced] public float bpm = ${music.bpm}f;`);
  if (music.instrumentType)
    lines.push(`    public string instrumentType = "${music.instrumentType}";`);
  lines.push('}');
  return lines.join('\n');
}

export function musicToUSDA(music: CompiledMusic): string {
  const safeName = music.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`def Scope "Music_${safeName}" {`);
  lines.push(`    custom string holoscript:musicType = "${music.keyword}"`);
  if (music.instrumentType)
    lines.push(`    custom string holoscript:instrumentType = "${music.instrumentType}"`);
  if (music.bpm) lines.push(`    custom float holoscript:bpm = ${music.bpm}`);
  if (music.key) lines.push(`    custom string holoscript:key = "${music.key}"`);
  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// Architecture Domain Compilation
// =============================================================================

export function compileArchitectureBlock(block: HoloDomainBlock): CompiledArchitecture {
  const props = block.properties || {};
  return {
    name: block.name || 'unnamed',
    keyword: block.keyword,
    structureType: (props.structure_type || block.keyword) as string,
    area: props.area as number | undefined,
    height: props.height as number | undefined,
    wallMaterial: (props.wall_material || props.wall) as string | undefined,
    floorMaterial: (props.floor_material || props.floor) as string | undefined,
    temperatureSetpoint: (props.temperature_setpoint || props.temperature) as number | undefined,
    capacity: props.capacity as number | undefined,
    buildingCode: (props.building_code || props.code) as string | undefined,
    traits: block.traits || [],
    properties: props,
  };
}

export function architectureToR3F(arch: CompiledArchitecture): string {
  const safeName = arch.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Architecture: ${arch.name} (${arch.keyword})`);
  lines.push(`export const ${safeName}Config = {`);
  lines.push(`  name: "${arch.name}",`);
  lines.push(`  type: "${arch.keyword}",`);
  if (arch.area) lines.push(`  area: ${arch.area},`);
  if (arch.height) lines.push(`  height: ${arch.height},`);
  if (arch.wallMaterial) lines.push(`  wallMaterial: "${arch.wallMaterial}",`);
  if (arch.floorMaterial) lines.push(`  floorMaterial: "${arch.floorMaterial}",`);
  if (arch.capacity) lines.push(`  capacity: ${arch.capacity},`);
  if (arch.temperatureSetpoint) lines.push(`  temperatureSetpoint: ${arch.temperatureSetpoint},`);
  lines.push('};');
  return lines.join('\n');
}

export function architectureToUnity(arch: CompiledArchitecture): string {
  const safeName = arch.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Architecture: ${arch.name}`);
  lines.push(`public class ${safeName}Architecture : MonoBehaviour {`);
  lines.push(`    public string structureType = "${arch.keyword}";`);
  if (arch.area) lines.push(`    public float area = ${arch.area}f;`);
  if (arch.height) lines.push(`    public float height = ${arch.height}f;`);
  if (arch.wallMaterial) lines.push(`    public string wallMaterial = "${arch.wallMaterial}";`);
  if (arch.floorMaterial) lines.push(`    public string floorMaterial = "${arch.floorMaterial}";`);
  if (arch.capacity) lines.push(`    public int capacity = ${arch.capacity};`);
  if (arch.temperatureSetpoint)
    lines.push(`    public float temperatureSetpoint = ${arch.temperatureSetpoint}f;`);
  lines.push('}');
  return lines.join('\n');
}

export function architectureToGodot(arch: CompiledArchitecture): string {
  const lines: string[] = [];
  lines.push(`# Architecture: ${arch.name}`);
  lines.push('extends Node3D');
  lines.push('');
  lines.push(`@export var structure_type: String = "${arch.keyword}"`);
  if (arch.area) lines.push(`@export var area: float = ${arch.area}`);
  if (arch.height) lines.push(`@export var height: float = ${arch.height}`);
  if (arch.wallMaterial) lines.push(`@export var wall_material: String = "${arch.wallMaterial}"`);
  if (arch.floorMaterial)
    lines.push(`@export var floor_material: String = "${arch.floorMaterial}"`);
  if (arch.capacity) lines.push(`@export var capacity: int = ${arch.capacity}`);
  if (arch.temperatureSetpoint) {
    lines.push(`@export var temperature_setpoint: float = ${arch.temperatureSetpoint}`);
    lines.push('');
    lines.push('signal temperature_changed(temp: float)');
  }
  return lines.join('\n');
}

export function architectureToVRChat(arch: CompiledArchitecture): string {
  const safeName = arch.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Architecture: ${arch.name}`);
  lines.push('[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]');
  lines.push(`public class ${safeName}Architecture : UdonSharpBehaviour {`);
  lines.push(`    public string structureType = "${arch.keyword}";`);
  if (arch.area) lines.push(`    public float area = ${arch.area}f;`);
  if (arch.height) lines.push(`    public float height = ${arch.height}f;`);
  if (arch.capacity) lines.push(`    public int capacity = ${arch.capacity};`);
  lines.push('}');
  return lines.join('\n');
}

export function architectureToUSDA(arch: CompiledArchitecture): string {
  const safeName = arch.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`def Scope "Architecture_${safeName}" {`);
  lines.push(`    custom string holoscript:structureType = "${arch.keyword}"`);
  if (arch.area) lines.push(`    custom float holoscript:area = ${arch.area}`);
  if (arch.height) lines.push(`    custom float holoscript:height = ${arch.height}`);
  if (arch.wallMaterial)
    lines.push(`    custom string holoscript:wallMaterial = "${arch.wallMaterial}"`);
  if (arch.capacity) lines.push(`    custom int holoscript:capacity = ${arch.capacity}`);
  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// Web3 Domain Compilation
// =============================================================================

export function compileWeb3Block(block: HoloDomainBlock): CompiledWeb3 {
  const props = block.properties || {};
  let functions: string[] | undefined;
  if (Array.isArray(props.functions)) functions = props.functions as string[];
  // Extract functions from children
  for (const child of block.children || []) {
    const c = child as unknown as HoloDomainBlock;
    if (c.keyword === 'function' && c.name) {
      if (!functions) functions = [];
      functions.push(c.name);
    }
  }
  return {
    name: block.name || 'unnamed',
    keyword: block.keyword,
    standard: (props.standard || props.token_standard) as string | undefined,
    network: props.network as string | undefined,
    contractAddress: (props.contract_address || props.address) as string | undefined,
    functions,
    supply: (props.supply || props.total_supply) as number | undefined,
    votingThreshold: (props.voting_threshold || props.threshold) as number | undefined,
    traits: block.traits || [],
    properties: props,
  };
}

export function web3ToR3F(web3: CompiledWeb3): string {
  const safeName = web3.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Web3: ${web3.name} (${web3.keyword})`);
  lines.push(`export const ${safeName}Config = {`);
  lines.push(`  name: "${web3.name}",`);
  lines.push(`  type: "${web3.keyword}",`);
  if (web3.standard) lines.push(`  standard: "${web3.standard}",`);
  if (web3.network) lines.push(`  network: "${web3.network}",`);
  if (web3.contractAddress)
    lines.push(`  contractAddress: "${esc(web3.contractAddress, 'TypeScript')}",`);
  if (web3.functions)
    lines.push(
      `  functions: [${web3.functions.map((f) => `"${esc(f, 'TypeScript')}"`).join(', ')}],`
    );
  if (web3.supply) lines.push(`  supply: ${web3.supply},`);
  if (web3.votingThreshold) lines.push(`  votingThreshold: ${web3.votingThreshold},`);
  lines.push('};');
  return lines.join('\n');
}

export function web3ToUnity(web3: CompiledWeb3): string {
  const safeName = web3.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Web3: ${web3.name}`);
  lines.push(`public class ${safeName}Web3 : MonoBehaviour {`);
  lines.push(`    public string web3Type = "${web3.keyword}";`);
  if (web3.standard) lines.push(`    public string standard = "${web3.standard}";`);
  if (web3.network) lines.push(`    public string network = "${web3.network}";`);
  if (web3.contractAddress)
    lines.push(`    public string contractAddress = "${web3.contractAddress}";`);
  if (web3.supply) lines.push(`    public long totalSupply = ${web3.supply};`);
  lines.push('}');
  return lines.join('\n');
}

export function web3ToGodot(web3: CompiledWeb3): string {
  const lines: string[] = [];
  lines.push(`# Web3: ${web3.name}`);
  lines.push('extends Node');
  lines.push('');
  lines.push(`@export var web3_type: String = "${web3.keyword}"`);
  if (web3.standard) lines.push(`@export var standard: String = "${web3.standard}"`);
  if (web3.network) lines.push(`@export var network: String = "${web3.network}"`);
  if (web3.contractAddress)
    lines.push(`@export var contract_address: String = "${web3.contractAddress}"`);
  lines.push('');
  lines.push('signal transaction_confirmed(tx_hash: String)');
  lines.push('signal wallet_connected(address: String)');
  return lines.join('\n');
}

export function web3ToVRChat(web3: CompiledWeb3): string {
  const safeName = web3.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Web3: ${web3.name}`);
  lines.push('[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]');
  lines.push(`public class ${safeName}Web3 : UdonSharpBehaviour {`);
  lines.push(`    public string web3Type = "${web3.keyword}";`);
  if (web3.standard) lines.push(`    public string standard = "${web3.standard}";`);
  if (web3.network) lines.push(`    public string network = "${web3.network}";`);
  if (web3.contractAddress) lines.push(`    [UdonSynced] public string walletState = "";`);
  lines.push('}');
  return lines.join('\n');
}

export function web3ToUSDA(web3: CompiledWeb3): string {
  const safeName = web3.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`def Scope "Web3_${safeName}" {`);
  lines.push(`    custom string holoscript:web3Type = "${web3.keyword}"`);
  if (web3.standard) lines.push(`    custom string holoscript:standard = "${web3.standard}"`);
  if (web3.network) lines.push(`    custom string holoscript:network = "${web3.network}"`);
  if (web3.contractAddress)
    lines.push(`    custom string holoscript:contractAddress = "${web3.contractAddress}"`);
  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// Procedural Domain Compilation
// =============================================================================

export function compileProceduralBlock(block: HoloDomainBlock): CompiledProcedural {
  const props = block.properties || {};
  let scaleRange: [number, number] | undefined;
  if (Array.isArray(props.scale_range) && props.scale_range.length === 2) {
    scaleRange = props.scale_range as [number, number];
  }
  let noise: CompiledProcedural['noise'];
  if (props.noise_type || props.octaves || props.frequency) {
    noise = {
      type: (props.noise_type as string) ?? 'perlin',
      octaves: (props.octaves as number) ?? 4,
      frequency: (props.frequency as number) ?? 1.0,
      amplitude: (props.amplitude as number) ?? 1.0,
    };
  } else if (props.noise && typeof props.noise === 'object') {
    const n = props.noise as Record<string, unknown>;
    noise = {
      type: (n.type as string) ?? 'perlin',
      octaves: (n.octaves as number) ?? 4,
      frequency: (n.frequency as number) ?? 1.0,
      amplitude: (n.amplitude as number) ?? 1.0,
    };
  }
  return {
    name: block.name || 'unnamed',
    keyword: block.keyword,
    genType: (props.gen_type || props.type || block.keyword) as string,
    seed: props.seed as number | undefined,
    density: props.density as number | undefined,
    scaleRange,
    noise,
    sourceMesh: (props.source_mesh || props.source || props.mesh) as string | undefined,
    traits: block.traits || [],
    properties: props,
  };
}

export function proceduralToR3F(proc: CompiledProcedural): string {
  const safeName = proc.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Procedural: ${proc.name} (${proc.keyword})`);
  lines.push(`export const ${safeName}Config = {`);
  lines.push(`  name: "${proc.name}",`);
  lines.push(`  type: "${proc.keyword}",`);
  if (proc.genType) lines.push(`  genType: "${proc.genType}",`);
  if (proc.seed != null) lines.push(`  seed: ${proc.seed},`);
  if (proc.density) lines.push(`  density: ${proc.density},`);
  if (proc.scaleRange) lines.push(`  scaleRange: [${proc.scaleRange.join(', ')}],`);
  if (proc.noise) lines.push(`  noise: ${JSON.stringify(proc.noise)},`);
  if (proc.sourceMesh) lines.push(`  sourceMesh: "${proc.sourceMesh}",`);
  lines.push('};');
  return lines.join('\n');
}

export function proceduralToUnity(proc: CompiledProcedural): string {
  const safeName = proc.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Procedural: ${proc.name}`);
  lines.push(`public class ${safeName}Procedural : MonoBehaviour {`);
  lines.push(`    public string genType = "${proc.keyword}";`);
  if (proc.seed != null) lines.push(`    public int seed = ${proc.seed};`);
  if (proc.density) lines.push(`    public float density = ${proc.density}f;`);
  if (proc.scaleRange) {
    lines.push(`    public float scaleMin = ${proc.scaleRange[0]}f;`);
    lines.push(`    public float scaleMax = ${proc.scaleRange[1]}f;`);
  }
  if (proc.noise) {
    lines.push(`    public int octaves = ${proc.noise.octaves};`);
    lines.push(`    public float frequency = ${proc.noise.frequency}f;`);
    lines.push(`    public float amplitude = ${proc.noise.amplitude}f;`);
  }
  if (proc.sourceMesh) lines.push(`    public string sourceMesh = "${proc.sourceMesh}";`);
  lines.push('}');
  return lines.join('\n');
}

export function proceduralToGodot(proc: CompiledProcedural): string {
  const lines: string[] = [];
  lines.push(`# Procedural: ${proc.name}`);
  lines.push('extends Node3D');
  lines.push('');
  lines.push(`@export var gen_type: String = "${proc.keyword}"`);
  if (proc.seed != null) lines.push(`@export var seed: int = ${proc.seed}`);
  if (proc.density) lines.push(`@export var density: float = ${proc.density}`);
  if (proc.scaleRange) {
    lines.push(`@export var scale_min: float = ${proc.scaleRange[0]}`);
    lines.push(`@export var scale_max: float = ${proc.scaleRange[1]}`);
  }
  if (proc.noise) {
    lines.push(`@export var octaves: int = ${proc.noise.octaves}`);
    lines.push(`@export var frequency: float = ${proc.noise.frequency}`);
    lines.push(`@export var amplitude: float = ${proc.noise.amplitude}`);
  }
  lines.push('');
  lines.push('signal generation_complete(instance_count: int)');
  return lines.join('\n');
}

export function proceduralToVRChat(proc: CompiledProcedural): string {
  const safeName = proc.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Procedural: ${proc.name}`);
  lines.push('[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]');
  lines.push(`public class ${safeName}Procedural : UdonSharpBehaviour {`);
  lines.push(`    public string genType = "${proc.keyword}";`);
  if (proc.seed != null) lines.push(`    [UdonSynced] public int seed = ${proc.seed};`);
  if (proc.density) lines.push(`    public float density = ${proc.density}f;`);
  lines.push('}');
  return lines.join('\n');
}

export function proceduralToUSDA(proc: CompiledProcedural): string {
  const safeName = proc.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`def Scope "Procedural_${safeName}" {`);
  lines.push(`    custom string holoscript:genType = "${proc.keyword}"`);
  if (proc.seed != null) lines.push(`    custom int holoscript:seed = ${proc.seed}`);
  if (proc.density) lines.push(`    custom float holoscript:density = ${proc.density}`);
  if (proc.sourceMesh) lines.push(`    custom string holoscript:sourceMesh = "${proc.sourceMesh}"`);
  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// Rendering Domain Compilation
// =============================================================================

export function compileRenderingBlock(block: HoloDomainBlock): CompiledRendering {
  const props = block.properties || {};
  let lodLevels: CompiledRendering['lodLevels'];
  if (Array.isArray(props.levels)) {
    lodLevels = (props.levels as unknown[]).map((l) =>
      typeof l === 'object' && l !== null
        ? (l as { distance: number; mesh?: string; detail?: number })
        : { distance: l as number }
    );
  }
  // Extract LOD levels from children
  for (const child of block.children || []) {
    const c = child as unknown as HoloDomainBlock;
    if (c.keyword === 'level' || c.keyword === 'lod_level') {
      if (!lodLevels) lodLevels = [];
      lodLevels.push({
        distance: (c.properties?.distance as number) ?? 0,
        mesh: c.name || undefined,
        detail: c.properties?.detail as number | undefined,
      });
    }
  }
  return {
    name: block.name || 'unnamed',
    keyword: block.keyword,
    lodLevels,
    renderLayer: (props.render_layer || props.layer) as string | undefined,
    shadowMode: (props.shadow_mode || props.shadow) as string | undefined,
    cullingMode: (props.culling_mode || props.culling) as string | undefined,
    sortOrder: props.sort_order as number | undefined,
    traits: block.traits || [],
    properties: props,
  };
}

export function renderingToR3F(rendering: CompiledRendering): string {
  const safeName = rendering.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Rendering: ${rendering.name} (${rendering.keyword})`);
  lines.push(`export const ${safeName}Config = {`);
  lines.push(`  name: "${rendering.name}",`);
  lines.push(`  type: "${rendering.keyword}",`);
  if (rendering.lodLevels) lines.push(`  lodLevels: ${JSON.stringify(rendering.lodLevels)},`);
  if (rendering.renderLayer) lines.push(`  renderLayer: "${rendering.renderLayer}",`);
  if (rendering.shadowMode) lines.push(`  shadowMode: "${rendering.shadowMode}",`);
  if (rendering.cullingMode) lines.push(`  cullingMode: "${rendering.cullingMode}",`);
  if (rendering.sortOrder != null) lines.push(`  sortOrder: ${rendering.sortOrder},`);
  lines.push('};');
  return lines.join('\n');
}

export function renderingToUnity(rendering: CompiledRendering): string {
  const safeName = rendering.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Rendering: ${rendering.name}`);
  lines.push(`public class ${safeName}Rendering : MonoBehaviour {`);
  lines.push(`    public string renderType = "${rendering.keyword}";`);
  if (rendering.lodLevels) {
    lines.push('    void Start() {');
    lines.push('        var lodGroup = gameObject.AddComponent<LODGroup>();');
    lines.push(`        var lods = new LOD[${rendering.lodLevels.length}];`);
    rendering.lodLevels.forEach((l, i) => {
      const screenHeight = 1 / (1 + l.distance * 0.01);
      lines.push(
        `        lods[${i}] = new LOD(${screenHeight.toFixed(3)}f, GetComponentsInChildren<Renderer>());`
      );
    });
    lines.push('        lodGroup.SetLODs(lods);');
    lines.push('    }');
  }
  if (rendering.shadowMode) {
    const mode =
      rendering.shadowMode === 'none' ? 'Off' : rendering.shadowMode === 'cast' ? 'On' : 'TwoSided';
    lines.push(`    public ShadowCastingMode shadowMode = ShadowCastingMode.${mode};`);
  }
  lines.push('}');
  return lines.join('\n');
}

export function renderingToGodot(rendering: CompiledRendering): string {
  const lines: string[] = [];
  lines.push(`# Rendering: ${rendering.name}`);
  lines.push('extends Node3D');
  lines.push('');
  lines.push(`@export var render_type: String = "${rendering.keyword}"`);
  if (rendering.shadowMode)
    lines.push(`@export var shadow_mode: String = "${rendering.shadowMode}"`);
  if (rendering.cullingMode)
    lines.push(`@export var culling_mode: String = "${rendering.cullingMode}"`);
  if (rendering.sortOrder != null)
    lines.push(`@export var sort_order: int = ${rendering.sortOrder}`);
  if (rendering.lodLevels) {
    lines.push('');
    for (let i = 0; i < rendering.lodLevels.length; i++) {
      const l = rendering.lodLevels[i];
      lines.push(`@export var lod${i}_distance: float = ${l.distance}`);
    }
  }
  return lines.join('\n');
}

export function renderingToVRChat(rendering: CompiledRendering): string {
  const safeName = rendering.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Rendering: ${rendering.name}`);
  lines.push(`public class ${safeName}Rendering : UdonSharpBehaviour {`);
  lines.push(`    public string renderType = "${rendering.keyword}";`);
  if (rendering.lodLevels) lines.push(`    public int lodLevels = ${rendering.lodLevels.length};`);
  if (rendering.shadowMode) lines.push(`    public string shadowMode = "${rendering.shadowMode}";`);
  lines.push('}');
  return lines.join('\n');
}

export function renderingToUSDA(rendering: CompiledRendering): string {
  const safeName = rendering.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`def Scope "Rendering_${safeName}" {`);
  lines.push(`    custom string holoscript:renderType = "${rendering.keyword}"`);
  if (rendering.shadowMode)
    lines.push(`    custom string holoscript:shadowMode = "${rendering.shadowMode}"`);
  if (rendering.cullingMode)
    lines.push(`    custom string holoscript:cullingMode = "${rendering.cullingMode}"`);
  if (rendering.lodLevels)
    lines.push(`    custom int holoscript:lodLevels = ${rendering.lodLevels.length}`);
  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// Navigation Domain Compilation
// =============================================================================

export function compileNavigationBlock(block: HoloDomainBlock): CompiledNavigation {
  const props = block.properties || {};
  return {
    name: block.name || 'unnamed',
    keyword: block.keyword,
    agentRadius: (props.agent_radius || props.radius) as number | undefined,
    agentHeight: (props.agent_height || props.height) as number | undefined,
    maxSlope: (props.max_slope || props.slope) as number | undefined,
    stepHeight: (props.step_height || props.step) as number | undefined,
    speed: props.speed as number | undefined,
    avoidancePriority: (props.avoidance_priority || props.priority) as number | undefined,
    behaviorRoot: (props.behavior_root || props.root_node) as string | undefined,
    traits: block.traits || [],
    properties: props,
  };
}

export function navigationToR3F(nav: CompiledNavigation): string {
  const safeName = nav.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Navigation: ${nav.name} (${nav.keyword})`);
  lines.push(`export const ${safeName}Config = {`);
  lines.push(`  name: "${nav.name}",`);
  lines.push(`  type: "${nav.keyword}",`);
  if (nav.agentRadius) lines.push(`  agentRadius: ${nav.agentRadius},`);
  if (nav.agentHeight) lines.push(`  agentHeight: ${nav.agentHeight},`);
  if (nav.maxSlope) lines.push(`  maxSlope: ${nav.maxSlope},`);
  if (nav.stepHeight) lines.push(`  stepHeight: ${nav.stepHeight},`);
  if (nav.speed) lines.push(`  speed: ${nav.speed},`);
  if (nav.avoidancePriority != null) lines.push(`  avoidancePriority: ${nav.avoidancePriority},`);
  if (nav.behaviorRoot) lines.push(`  behaviorRoot: "${nav.behaviorRoot}",`);
  lines.push('};');
  return lines.join('\n');
}

export function navigationToUnity(nav: CompiledNavigation): string {
  const safeName = nav.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Navigation: ${nav.name}`);
  lines.push(`public class ${safeName}Navigation : MonoBehaviour {`);
  lines.push(`    public string navType = "${nav.keyword}";`);
  lines.push('    void Start() {');
  if (nav.keyword === 'navmesh' || nav.keyword === 'nav_mesh') {
    lines.push('        var surface = gameObject.AddComponent<NavMeshSurface>();');
    if (nav.agentRadius) lines.push(`        // Agent radius: ${nav.agentRadius}`);
    if (nav.maxSlope) lines.push(`        // Max slope: ${nav.maxSlope} degrees`);
  } else {
    lines.push('        var agent = gameObject.AddComponent<NavMeshAgent>();');
    if (nav.speed) lines.push(`        agent.speed = ${nav.speed}f;`);
    if (nav.agentRadius) lines.push(`        agent.radius = ${nav.agentRadius}f;`);
    if (nav.agentHeight) lines.push(`        agent.height = ${nav.agentHeight}f;`);
    if (nav.stepHeight) lines.push(`        agent.baseOffset = ${nav.stepHeight}f;`);
    if (nav.avoidancePriority != null)
      lines.push(`        agent.avoidancePriority = ${nav.avoidancePriority};`);
  }
  lines.push('    }');
  lines.push('}');
  return lines.join('\n');
}

export function navigationToGodot(nav: CompiledNavigation): string {
  const lines: string[] = [];
  lines.push(`# Navigation: ${nav.name}`);
  if (nav.keyword === 'navmesh' || nav.keyword === 'nav_mesh') {
    lines.push('extends NavigationRegion3D');
    lines.push('');
    if (nav.agentRadius) lines.push(`@export var agent_radius: float = ${nav.agentRadius}`);
    if (nav.maxSlope) lines.push(`@export var max_slope: float = ${nav.maxSlope}`);
  } else {
    lines.push('extends NavigationAgent3D');
    lines.push('');
    if (nav.speed) lines.push(`@export var speed: float = ${nav.speed}`);
    if (nav.agentRadius) lines.push(`@export var agent_radius: float = ${nav.agentRadius}`);
    if (nav.agentHeight) lines.push(`@export var agent_height: float = ${nav.agentHeight}`);
    if (nav.avoidancePriority != null)
      lines.push(`@export var avoidance_priority: int = ${nav.avoidancePriority}`);
  }
  lines.push('');
  lines.push('signal navigation_finished');
  lines.push('signal path_changed(new_path: PackedVector3Array)');
  return lines.join('\n');
}

export function navigationToVRChat(nav: CompiledNavigation): string {
  const safeName = nav.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Navigation: ${nav.name}`);
  lines.push('[UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]');
  lines.push(`public class ${safeName}Navigation : UdonSharpBehaviour {`);
  lines.push(`    public string navType = "${nav.keyword}";`);
  if (nav.speed) lines.push(`    public float speed = ${nav.speed}f;`);
  if (nav.agentRadius) lines.push(`    public float agentRadius = ${nav.agentRadius}f;`);
  lines.push('}');
  return lines.join('\n');
}

export function navigationToUSDA(nav: CompiledNavigation): string {
  const safeName = nav.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`def Scope "Navigation_${safeName}" {`);
  lines.push(`    custom string holoscript:navType = "${nav.keyword}"`);
  if (nav.agentRadius) lines.push(`    custom float holoscript:agentRadius = ${nav.agentRadius}`);
  if (nav.agentHeight) lines.push(`    custom float holoscript:agentHeight = ${nav.agentHeight}`);
  if (nav.speed) lines.push(`    custom float holoscript:speed = ${nav.speed}`);
  if (nav.maxSlope) lines.push(`    custom float holoscript:maxSlope = ${nav.maxSlope}`);
  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// Input Domain Compilation
// =============================================================================

export function compileInputBlock(block: HoloDomainBlock): CompiledInput {
  const props = block.properties || {};
  return {
    name: block.name || 'unnamed',
    keyword: block.keyword,
    inputType: (props.input_type || props.type || block.keyword) as string,
    platform: props.platform as string | undefined,
    binding: (props.binding || props.key || props.button) as string | undefined,
    action: props.action as string | undefined,
    threshold: props.threshold as number | undefined,
    interactionDistance: (props.interaction_distance || props.distance) as number | undefined,
    traits: block.traits || [],
    properties: props,
  };
}

export function inputToR3F(input: CompiledInput): string {
  const safeName = input.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Input: ${input.name} (${input.keyword})`);
  lines.push(`export const ${safeName}Config = {`);
  lines.push(`  name: "${input.name}",`);
  lines.push(`  type: "${input.keyword}",`);
  if (input.inputType) lines.push(`  inputType: "${input.inputType}",`);
  if (input.platform) lines.push(`  platform: "${input.platform}",`);
  if (input.binding) lines.push(`  binding: "${input.binding}",`);
  if (input.action) lines.push(`  action: "${input.action}",`);
  if (input.threshold) lines.push(`  threshold: ${input.threshold},`);
  if (input.interactionDistance) lines.push(`  interactionDistance: ${input.interactionDistance},`);
  lines.push('};');
  return lines.join('\n');
}

export function inputToUnity(input: CompiledInput): string {
  const safeName = input.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Input: ${input.name}`);
  lines.push(`public class ${safeName}Input : MonoBehaviour {`);
  lines.push(`    public string inputType = "${input.keyword}";`);
  if (input.binding) lines.push(`    public string binding = "${input.binding}";`);
  if (input.action) lines.push(`    public string action = "${input.action}";`);
  if (input.threshold) lines.push(`    public float threshold = ${input.threshold}f;`);
  if (input.interactionDistance)
    lines.push(`    public float interactionDistance = ${input.interactionDistance}f;`);
  if (input.platform === 'vr_controller') {
    lines.push('    void Update() {');
    lines.push('        // XR input polling');
    lines.push('        var device = InputDevices.GetDeviceAtXRNode(XRNode.RightHand);');
    lines.push(`        device.TryGetFeatureValue(CommonUsages.trigger, out float triggerValue);`);
    lines.push('    }');
  }
  lines.push('}');
  return lines.join('\n');
}

export function inputToGodot(input: CompiledInput): string {
  const lines: string[] = [];
  lines.push(`# Input: ${input.name}`);
  lines.push('extends Node');
  lines.push('');
  lines.push(`@export var input_type: String = "${input.keyword}"`);
  if (input.binding) lines.push(`@export var binding: String = "${input.binding}"`);
  if (input.action) lines.push(`@export var action_name: String = "${input.action}"`);
  if (input.threshold) lines.push(`@export var threshold: float = ${input.threshold}`);
  if (input.interactionDistance)
    lines.push(`@export var interaction_distance: float = ${input.interactionDistance}`);
  lines.push('');
  lines.push('signal action_triggered(action: String, value: float)');
  lines.push('signal gesture_recognized(gesture: String)');
  return lines.join('\n');
}

export function inputToVRChat(input: CompiledInput): string {
  const safeName = input.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`// Input: ${input.name}`);
  lines.push(`public class ${safeName}Input : UdonSharpBehaviour {`);
  lines.push(`    public string inputType = "${input.keyword}";`);
  if (input.action) lines.push(`    public string action = "${input.action}";`);
  if (input.interactionDistance)
    lines.push(`    public float interactionDistance = ${input.interactionDistance}f;`);
  if (input.keyword === 'interaction' || input.keyword === 'gesture_profile') {
    lines.push('    public override void Interact() {');
    lines.push('        // Handle VRChat interaction');
    lines.push('    }');
  }
  lines.push('}');
  return lines.join('\n');
}

export function inputToUSDA(input: CompiledInput): string {
  const safeName = input.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];
  lines.push(`def Scope "Input_${safeName}" {`);
  lines.push(`    custom string holoscript:inputType = "${input.keyword}"`);
  if (input.binding) lines.push(`    custom string holoscript:binding = "${input.binding}"`);
  if (input.action) lines.push(`    custom string holoscript:action = "${input.action}"`);
  if (input.interactionDistance)
    lines.push(`    custom float holoscript:interactionDistance = ${input.interactionDistance}`);
  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// Simulation Domain (Thermal, Structural, Hydraulic)
// =============================================================================

/** World-level rendering + physics hints for R3F (gravity, skybox, engine overrides). */
export interface SimulationEnvironment {
  /** World gravity (m/s²); default is negative Y when given as a scalar magnitude. */
  gravity?: [number, number, number];
  /** `@react-three/drei` Environment HDR preset (e.g. sunset, city, studio). */
  skyboxPreset?: string;
  /** Solid canvas / scene background (hex, e.g. #87ceeb). */
  skyboxColor?: string;
  /** Extra props for the host `<Physics>` / engine (restitution, timestep, etc.). */
  physicsOverrides?: Record<string, unknown>;
}

export interface CompiledSimulation {
  keyword: string;
  name: string;
  simulationType: 'thermal' | 'structural' | 'hydraulic' | 'unknown';
  traits: string[];
  config: Record<string, unknown>;
  /** Parsed from block properties + `environment` / `skybox` / `gravity` children. */
  environment?: SimulationEnvironment;
  overlays: Array<{
    source: string;
    colormap: string;
    range: [number, number];
    opacity: number;
    visible: boolean;
    label: string;
    perceptualColorPass?: PerceptualColorCompilerMetadata;
  }>;
}

function parseGravityVector(props: Record<string, unknown>): [number, number, number] | undefined {
  const gv = props.gravity_vector ?? props.gravityVector;
  if (Array.isArray(gv) && gv.length === 3 && gv.every((n) => typeof n === 'number')) {
    return [gv[0] as number, gv[1] as number, gv[2] as number];
  }
  const g = props.gravity;
  if (typeof g === 'number' && !Number.isNaN(g)) {
    return [0, -Math.abs(g), 0];
  }
  return undefined;
}

function parseSimulationEnvironment(block: HoloDomainBlock): SimulationEnvironment | undefined {
  const p = block.properties || {};
  const env: SimulationEnvironment = {};

  const topG = parseGravityVector(p);
  if (topG) env.gravity = topG;

  if (typeof p.skybox === 'string' && p.skybox.trim()) {
    env.skyboxPreset = p.skybox.trim();
  }
  const colorRaw = p.skybox_color ?? p.skyboxColor ?? p.background_color;
  if (colorRaw != null && String(colorRaw).trim() !== '') {
    env.skyboxColor = String(colorRaw).trim();
  }
  const po = p.physics_overrides ?? p.physicsOverrides;
  if (po && typeof po === 'object' && !Array.isArray(po)) {
    env.physicsOverrides = { ...(po as Record<string, unknown>) };
  }

  for (const child of block.children || []) {
    const c = child as unknown as HoloDomainBlock;
    if (c.type !== 'DomainBlock') continue;
    const kw = c.keyword;
    const cp = c.properties || {};

    if (kw === 'skybox' || kw === 'environment_sky' || kw === 'hdri') {
      if (typeof cp.preset === 'string' && cp.preset.trim()) env.skyboxPreset = cp.preset.trim();
      if (cp.color != null && String(cp.color).trim() !== '')
        env.skyboxColor = String(cp.color).trim();
    }
    if (kw === 'gravity' || kw === 'world_gravity') {
      const g = parseGravityVector(cp);
      if (g) env.gravity = g;
    }
    if (kw === 'physics_world' || kw === 'physics_overrides') {
      env.physicsOverrides = { ...env.physicsOverrides, ...cp };
    }
  }

  if (!env.gravity && !env.skyboxPreset && !env.skyboxColor && !env.physicsOverrides) {
    return undefined;
  }
  return env;
}

export function compileSimulationBlock(block: HoloDomainBlock): CompiledSimulation {
  const traits = block.traits || [];

  // Determine simulation type from attached traits
  let simulationType: CompiledSimulation['simulationType'] = 'unknown';
  if (traits.includes('thermal_simulation')) simulationType = 'thermal';
  else if (traits.includes('structural_fem')) simulationType = 'structural';
  else if (traits.includes('hydraulic_pipe')) simulationType = 'hydraulic';

  // Extract overlay configs from children
  const overlays: CompiledSimulation['overlays'] = [];
  for (const child of block.children || []) {
    const c = child as unknown as HoloDomainBlock;
    if (c.traits?.includes('scalar_field_overlay') || c.keyword === 'scalar_field_overlay') {
      const p = c.properties || {};
      const colormap = (p.colormap as string) ?? 'turbo';
      overlays.push({
        source: (p.source as string) ?? '',
        colormap,
        range: (p.range as [number, number]) ?? [0, 1],
        opacity: (p.opacity as number) ?? 0.7,
        visible: (p.visible as boolean) ?? true,
        label: (p.label as string) ?? '',
        perceptualColorPass: buildPerceptualColorMetadata(
          { ...p, colormap },
          c.traits || [],
          colormap
        ),
      });
    }
  }

  const environment = parseSimulationEnvironment(block);

  return {
    keyword: block.keyword,
    name: block.name,
    simulationType,
    traits,
    config: block.properties || {},
    environment,
    overlays,
  };
}

/** R3F fragments for sky / background / world metadata (pairs with `SimulationProvider`). */
function simulationEnvironmentToR3FChunks(env?: SimulationEnvironment): {
  visualLines: string[];
  userDataExpr: string | null;
} {
  if (!env) return { visualLines: [], userDataExpr: null };

  const visualLines: string[] = [];
  if (env.skyboxColor) {
    const hex = env.skyboxColor.startsWith('#') ? env.skyboxColor : `#${env.skyboxColor}`;
    visualLines.push(`<color attach="background" args={['${hex}']} />`);
  }
  if (env.skyboxPreset) {
    visualLines.push(`<Environment preset={${JSON.stringify(env.skyboxPreset)}} background />`);
  }

  const meta: Record<string, unknown> = {};
  if (env.gravity) meta.gravity = env.gravity;
  if (env.physicsOverrides && Object.keys(env.physicsOverrides).length > 0) {
    meta.physicsOverrides = env.physicsOverrides;
  }
  const userDataExpr = Object.keys(meta).length > 0 ? JSON.stringify({ holoscript: meta }) : null;

  return { visualLines, userDataExpr };
}

export function simulationToR3F(sim: CompiledSimulation): string {
  const configExpr = JSON.stringify(sim.config);
  const { visualLines, userDataExpr } = simulationEnvironmentToR3FChunks(sim.environment);

  const overlayJSX = sim.overlays
    .map((o) => {
      const perceptualComment = o.perceptualColorPass
        ? `{/* PerceptualColorPass ${JSON.stringify({
            mapName: o.perceptualColorPass.mapName,
            colors: o.perceptualColorPass.colors,
            minDeltaE: o.perceptualColorPass.minDeltaE,
            meanDeltaE: o.perceptualColorPass.meanDeltaE,
          })} */}\n        `
        : '';
      return `${perceptualComment}<ScalarFieldOverlay colormap="${o.colormap}" range={[${o.range.join(', ')}]} opacity={${o.opacity}} visible={${o.visible}} label="${o.label}" />`;
    })
    .join('\n        ');

  const envVisual = visualLines.length > 0 ? `${visualLines.join('\n      ')}\n      ` : '';

  const wrapWithGroup = (body: string): string =>
    userDataExpr ? `<group userData={${userDataExpr}}>\n      ${body}\n      </group>` : body;

  if (sim.simulationType === 'unknown') {
    const body = `${envVisual}${overlayJSX}`;
    return `{/* Simulation: ${sim.name} (unknown solver — add thermal_simulation, structural_fem, or hydraulic_pipe trait) */}
      ${wrapWithGroup(body)}`;
  }

  const providerInner = overlayJSX ? `\n        ${overlayJSX}\n      ` : '\n      ';
  const provider = `${envVisual}<SimulationProvider type="${sim.simulationType}" config={${configExpr}}>${providerInner}</SimulationProvider>`;

  return `{/* Simulation: ${sim.name} (${sim.simulationType}) */}
      ${wrapWithGroup(provider)}`;
}

// =============================================================================
// Domain Block Router
// =============================================================================

export type DomainCompileFn<T = string> = (block: HoloDomainBlock) => T;

/** Route domain blocks to appropriate compilation function */
export function compileDomainBlocks<T = string>(
  blocks: HoloDomainBlock[],
  handlers: Partial<Record<HoloDomainType, DomainCompileFn<T>>>,
  fallback?: DomainCompileFn<T>
): T[] {
  return blocks.map((block) => {
    const handler = handlers[block.domain];
    if (handler) return handler(block);
    if (fallback) return fallback(block);
    return `/* Unhandled domain block: ${block.domain}/${block.keyword} "${block.name}" */` as unknown as T;
  });
}

// =============================================================================
// Utility Helpers
// =============================================================================

function hexToRGB(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return `${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}`;
}

function hexToRGBA(hex: string, alpha: number): number[] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
    alpha,
  ];
}

// =============================================================================
// ANS Capability Path (P5 Compiler Fleet Migration)
// =============================================================================

/**
 * ANS capability path for the DomainBlockCompilerMixin.
 *
 * Since DomainBlockCompilerMixin is a utility module (not a CompilerBase subclass),
 * it exposes its required capability as an exported constant and helper function.
 */
// Use getter to avoid circular dependency initialization order issues in CJS bundles
// (ANSCapabilityPath may not be initialized when this module first loads)
export const DOMAIN_BLOCK_COMPILER_MIXIN_CAPABILITY: ANSCapabilityPathValue =
  '/compile/mixin/domain-block' as ANSCapabilityPathValue;

/**
 * Get the ANS capability namespace path for DomainBlockCompilerMixin.
 *
 * Mirrors the `getRequiredCapability()` pattern used by CompilerBase subclasses,
 * adapted for a standalone utility module.
 *
 * @returns The ANS capability path "/compile/mixin/domain-block"
 */
export function getRequiredCapability(): ANSCapabilityPathValue {
  return ANSCapabilityPath.DOMAIN_BLOCK;
}
