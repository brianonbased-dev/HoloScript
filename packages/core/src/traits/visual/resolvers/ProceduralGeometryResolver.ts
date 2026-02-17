import type { TraitVisualConfig } from '../types';
import type { AssetResolverPlugin, ResolvedAsset } from './types';

// ─── Geometry descriptor ──────────────────────────────────────────────────────

/** Describes a procedurally-generated 3D shape in a renderer-agnostic way. */
export interface ProceduralGeometry {
  /** Primitive type that guides the renderer. */
  primitive: 'tree' | 'rock' | 'terrain_patch' | 'building' | 'arch' | 'crystal_cluster';
  /** Float32Array of vertex positions (x, y, z triplets). */
  vertices: Float32Array;
  /** Uint16Array of triangle indices. */
  indices: Uint16Array;
  /** Float32Array of per-vertex normals (x, y, z triplets). */
  normals: Float32Array;
  /** Float32Array of UV coordinates (u, v pairs). */
  uvs: Float32Array;
  /** Generation parameters (for reproducibility). */
  params: Record<string, number>;
}

// ─── Traits that can be generated procedurally ───────────────────────────────

const GEOMETRY_TRAITS: Record<string, { primitive: ProceduralGeometry['primitive']; params: Record<string, number> }> = {
  // Nature
  tree:          { primitive: 'tree',          params: { trunkHeight: 1.5, trunkRadius: 0.15, crownRadius: 0.8, branches: 6 } },
  dead_tree:     { primitive: 'tree',          params: { trunkHeight: 2.0, trunkRadius: 0.12, crownRadius: 0.0, branches: 4 } },
  pine_tree:     { primitive: 'tree',          params: { trunkHeight: 2.5, trunkRadius: 0.1,  crownRadius: 0.5, branches: 8, conical: 1 } },
  rock:          { primitive: 'rock',          params: { radius: 0.5, noise: 0.25, faces: 8, seed: 42 } },
  boulder:       { primitive: 'rock',          params: { radius: 1.2, noise: 0.35, faces: 12, seed: 7 } },
  pebble:        { primitive: 'rock',          params: { radius: 0.1, noise: 0.15, faces: 6, seed: 99 } },
  crystal:       { primitive: 'crystal_cluster', params: { count: 5, maxHeight: 0.8, baseRadius: 0.08, spread: 0.3 } },
  // Terrain patches
  cliff:         { primitive: 'terrain_patch', params: { width: 4, depth: 4, heightScale: 3, roughness: 0.8, seed: 12 } },
  hill:          { primitive: 'terrain_patch', params: { width: 6, depth: 6, heightScale: 1.5, roughness: 0.4, seed: 5 } },
  flat_ground:   { primitive: 'terrain_patch', params: { width: 4, depth: 4, heightScale: 0.05, roughness: 0.1, seed: 1 } },
  // Structures
  tower:         { primitive: 'building',      params: { width: 1, depth: 1, height: 4, floors: 3, style: 0 } },
  house:         { primitive: 'building',      params: { width: 3, depth: 2, height: 2, floors: 1, style: 1 } },
  ruin:          { primitive: 'building',      params: { width: 3, depth: 2, height: 1.5, floors: 1, style: 2 } },
  arch:          { primitive: 'arch',          params: { width: 2, height: 2.5, depth: 0.5, segments: 12 } },
};

// ─── Geometry generators ──────────────────────────────────────────────────────

/** Deterministic hash noise. */
function hashNoise(x: number, y: number, seed: number = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.3) * 43758.5453;
  return n - Math.floor(n);
}

function buildTree(p: Record<string, number>): Omit<ProceduralGeometry, 'primitive' | 'params'> {
  const { trunkHeight, trunkRadius, crownRadius, branches, conical = 0 } = p;
  const verts: number[] = [];
  const norms: number[] = [];
  const uvs2: number[] = [];
  const idxs: number[] = [];

  // Trunk — cylinder approximation (8 segments)
  const segs = 8;
  const trunkTop = trunkHeight - crownRadius * 0.3;
  for (let i = 0; i <= segs; i++) {
    const angle = (i / segs) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const u = i / segs;
    // Bottom ring
    verts.push(cos * trunkRadius, 0, sin * trunkRadius);
    norms.push(cos, 0, sin);
    uvs2.push(u, 0);
    // Top ring
    verts.push(cos * trunkRadius * 0.6, trunkTop, sin * trunkRadius * 0.6);
    norms.push(cos, 0, sin);
    uvs2.push(u, 1);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    idxs.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }

  // Crown — sphere/cone approximation
  if (crownRadius > 0) {
    const crownBase = verts.length / 3;
    const crownSegs = Math.max(4, branches);
    const crownCenter = trunkHeight;
    for (let lat = 0; lat <= crownSegs; lat++) {
      const phi = (lat / crownSegs) * Math.PI;
      for (let lon = 0; lon <= crownSegs; lon++) {
        const theta = (lon / crownSegs) * Math.PI * 2;
        const r = crownRadius * (conical ? (1 - lat / crownSegs) : Math.sin(phi));
        const y = crownCenter + crownRadius * Math.cos(phi) * (conical ? 0.5 : 1);
        verts.push(r * Math.cos(theta), y, r * Math.sin(theta));
        norms.push(Math.cos(theta) * Math.sin(phi), Math.cos(phi), Math.sin(theta) * Math.sin(phi));
        uvs2.push(lon / crownSegs, lat / crownSegs);
      }
    }
    for (let lat = 0; lat < crownSegs; lat++) {
      for (let lon = 0; lon < crownSegs; lon++) {
        const a = crownBase + lat * (crownSegs + 1) + lon;
        const b = a + crownSegs + 1;
        idxs.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }

  return {
    vertices: new Float32Array(verts),
    normals: new Float32Array(norms),
    uvs: new Float32Array(uvs2),
    indices: new Uint16Array(idxs),
  };
}

function buildRock(p: Record<string, number>): Omit<ProceduralGeometry, 'primitive' | 'params'> {
  const { radius, noise, faces, seed } = p;
  const verts: number[] = [];
  const norms: number[] = [];
  const uvs2: number[] = [];
  const idxs: number[] = [];

  // Ico-sphere subdivision
  const t = (1 + Math.sqrt(5)) / 2;
  const baseVerts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => {
    const len = Math.sqrt(x * x + y * y + z * z);
    return [x / len, y / len, z / len];
  });

  const baseFaces = [
    [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
    [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
    [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
    [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
  ];

  const subdivide = faces >= 12;
  const facesToUse = subdivide ? subdivideFaces(baseVerts, baseFaces) : { verts: baseVerts, faces: baseFaces };

  for (let i = 0; i < facesToUse.verts.length; i++) {
    const [x, y, z] = facesToUse.verts[i];
    const n = hashNoise(x * 4.7, y * 6.3 + z * 3.1, seed);
    const r = radius * (1 + (n - 0.5) * noise);
    verts.push(x * r, y * r, z * r);
    norms.push(x, y, z);
    uvs2.push(0.5 + Math.atan2(z, x) / (2 * Math.PI), 0.5 - Math.asin(y) / Math.PI);
  }

  for (const [a, b, c] of facesToUse.faces) {
    idxs.push(a, b, c);
  }

  return {
    vertices: new Float32Array(verts),
    normals: new Float32Array(norms),
    uvs: new Float32Array(uvs2),
    indices: new Uint16Array(idxs),
  };
}

function subdivideFaces(
  verts: number[][],
  faces: number[][],
): { verts: number[][]; faces: number[][] } {
  const outVerts = [...verts];
  const outFaces: number[][] = [];
  const midCache = new Map<string, number>();

  function midpoint(a: number, b: number): number {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (midCache.has(key)) return midCache.get(key)!;
    const av = outVerts[a];
    const bv = outVerts[b];
    const mx = (av[0] + bv[0]) / 2;
    const my = (av[1] + bv[1]) / 2;
    const mz = (av[2] + bv[2]) / 2;
    const len = Math.sqrt(mx * mx + my * my + mz * mz);
    const idx = outVerts.length;
    outVerts.push([mx / len, my / len, mz / len]);
    midCache.set(key, idx);
    return idx;
  }

  for (const [a, b, c] of faces) {
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    outFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }

  return { verts: outVerts, faces: outFaces };
}

function buildTerrainPatch(p: Record<string, number>): Omit<ProceduralGeometry, 'primitive' | 'params'> {
  const { width, depth, heightScale, roughness, seed } = p;
  const res = 16; // grid resolution
  const verts: number[] = [];
  const norms: number[] = [];
  const uvs2: number[] = [];
  const idxs: number[] = [];

  for (let row = 0; row <= res; row++) {
    for (let col = 0; col <= res; col++) {
      const u = col / res;
      const v = row / res;
      const x = (u - 0.5) * width;
      const z = (v - 0.5) * depth;
      // Fractal noise — 4 octaves
      let h = 0;
      let amp = heightScale;
      let freq = 1;
      for (let oct = 0; oct < 4; oct++) {
        h += hashNoise(x * freq * 0.5 + seed, z * freq * 0.5) * amp;
        amp *= roughness;
        freq *= 2;
      }
      verts.push(x, h, z);
      uvs2.push(u, v);
      // Approximate normal: will be corrected below
      norms.push(0, 1, 0);
    }
  }

  // Indices
  for (let row = 0; row < res; row++) {
    for (let col = 0; col < res; col++) {
      const a = row * (res + 1) + col;
      const b = a + 1;
      const c = a + res + 1;
      const d = c + 1;
      idxs.push(a, c, b, b, c, d);
    }
  }

  // Recompute flat normals per triangle
  const normsOut = new Float32Array(verts.length);
  for (let i = 0; i < idxs.length; i += 3) {
    const ai = idxs[i] * 3, bi = idxs[i + 1] * 3, ci = idxs[i + 2] * 3;
    const ax = verts[ai], ay = verts[ai + 1], az = verts[ai + 2];
    const bx = verts[bi], by = verts[bi + 1], bz = verts[bi + 2];
    const cx = verts[ci], cy = verts[ci + 1], cz = verts[ci + 2];
    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const fx = cx - ax, fy = cy - ay, fz = cz - az;
    const nx = ey * fz - ez * fy;
    const ny = ez * fx - ex * fz;
    const nz = ex * fy - ey * fx;
    for (const idx of [idxs[i], idxs[i + 1], idxs[i + 2]]) {
      normsOut[idx * 3] += nx;
      normsOut[idx * 3 + 1] += ny;
      normsOut[idx * 3 + 2] += nz;
    }
  }

  return {
    vertices: new Float32Array(verts),
    normals: normsOut,
    uvs: new Float32Array(uvs2),
    indices: new Uint16Array(idxs),
  };
}

function buildBuilding(p: Record<string, number>): Omit<ProceduralGeometry, 'primitive' | 'params'> {
  const { width, depth, height, style } = p;
  const verts: number[] = [];
  const norms: number[] = [];
  const uvs2: number[] = [];
  const idxs: number[] = [];

  // Box body — 4 walls + roof
  const hw = width / 2, hd = depth / 2;
  const wallVerts = [
    // front
    [-hw, 0, hd], [hw, 0, hd], [hw, height, hd], [-hw, height, hd],
    // back
    [hw, 0, -hd], [-hw, 0, -hd], [-hw, height, -hd], [hw, height, -hd],
    // left
    [-hw, 0, -hd], [-hw, 0, hd], [-hw, height, hd], [-hw, height, -hd],
    // right
    [hw, 0, hd], [hw, 0, -hd], [hw, height, -hd], [hw, height, hd],
    // top
    [-hw, height, -hd], [-hw, height, hd], [hw, height, hd], [hw, height, -hd],
  ];
  const wallNormals = [
    [0,0,1],[0,0,1],[0,0,1],[0,0,1],
    [0,0,-1],[0,0,-1],[0,0,-1],[0,0,-1],
    [-1,0,0],[-1,0,0],[-1,0,0],[-1,0,0],
    [1,0,0],[1,0,0],[1,0,0],[1,0,0],
    [0,1,0],[0,1,0],[0,1,0],[0,1,0],
  ];
  for (let f = 0; f < 5; f++) {
    const base = f * 4;
    const vi = verts.length / 3;
    for (let i = 0; i < 4; i++) {
      verts.push(...wallVerts[base + i]);
      norms.push(...wallNormals[base + i]);
      uvs2.push(i % 2, Math.floor(i / 2));
    }
    idxs.push(vi, vi+1, vi+2, vi, vi+2, vi+3);
  }

  // Pitched roof (style 1)
  if (style === 1) {
    const ri = verts.length / 3;
    const rh = height + width * 0.4;
    verts.push(
      -hw, height, hd,  hw, height, hd,  0, rh, hd,   // front gable
      hw, height, -hd, -hw, height, -hd,  0, rh, -hd,  // back gable
      -hw, height, -hd, -hw, height, hd,  0, rh, 0,   // left slope (apex)
      hw, height, hd,  hw, height, -hd,  0, rh, 0,   // right slope
    );
    for (let tri = 0; tri < 4; tri++) {
      const b = ri + tri * 3;
      idxs.push(b, b+1, b+2);
      for (let k = 0; k < 3; k++) norms.push(0, 0.7, 0.7), uvs2.push(0, 0);
    }
  }

  return {
    vertices: new Float32Array(verts),
    normals: new Float32Array(norms),
    uvs: new Float32Array(uvs2),
    indices: new Uint16Array(idxs),
  };
}

function buildArch(p: Record<string, number>): Omit<ProceduralGeometry, 'primitive' | 'params'> {
  const { width, height, depth, segments } = p;
  const segs = Math.max(6, segments);
  const verts: number[] = [];
  const norms: number[] = [];
  const uvs2: number[] = [];
  const idxs: number[] = [];
  const hw = width / 2, hd = depth / 2;
  const archRadius = hw;
  const archCenterY = height - archRadius;

  for (let i = 0; i <= segs; i++) {
    const angle = (i / segs) * Math.PI; // 0 → π
    const ax = -Math.cos(angle) * archRadius;
    const ay = archCenterY + Math.sin(angle) * archRadius;

    for (let side = 0; side < 2; side++) {
      const z = side === 0 ? hd : -hd;
      verts.push(ax, ay, z);
      norms.push(-Math.cos(angle), Math.sin(angle), 0);
      uvs2.push(i / segs, side);
    }
  }

  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    idxs.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }

  return {
    vertices: new Float32Array(verts),
    normals: new Float32Array(norms),
    uvs: new Float32Array(uvs2),
    indices: new Uint16Array(idxs),
  };
}

function buildCrystalCluster(p: Record<string, number>): Omit<ProceduralGeometry, 'primitive' | 'params'> {
  const { count, maxHeight, baseRadius, spread } = p;
  const verts: number[] = [];
  const norms: number[] = [];
  const uvs2: number[] = [];
  const idxs: number[] = [];

  for (let c = 0; c < count; c++) {
    const angle = (c / count) * Math.PI * 2 + hashNoise(c, 0) * 0.5;
    const dist = hashNoise(c, 1) * spread;
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;
    const h = maxHeight * (0.5 + hashNoise(c, 2) * 0.5);
    const r = baseRadius * (0.6 + hashNoise(c, 3) * 0.4);

    const tilt = hashNoise(c, 4) * 0.2;
    const base = verts.length / 3;
    const sides = 6;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const cos = Math.cos(a), sin = Math.sin(a);
      verts.push(cx + cos * r, 0, cz + sin * r); // base
      verts.push(cx + cos * tilt * r * 0.2, h, cz + sin * tilt * r * 0.2); // tip
      norms.push(cos, 0.4, sin);
      norms.push(cos, 0.4, sin);
      uvs2.push(s / sides, 0, s / sides, 1);
    }
    for (let s = 0; s < sides; s++) {
      const b = base + s * 2;
      idxs.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }

  return {
    vertices: new Float32Array(verts),
    normals: new Float32Array(norms),
    uvs: new Float32Array(uvs2),
    indices: new Uint16Array(idxs),
  };
}

// ─── Serialise geometry → ArrayBuffer ────────────────────────────────────────

/**
 * Pack geometry into a simple binary format:
 * [4b vertCount][4b idxCount][vertices...][normals...][uvs...][indices...]
 */
export function packGeometry(geo: Omit<ProceduralGeometry, 'primitive' | 'params'>): ArrayBuffer {
  const header = 8;
  const vertBytes = geo.vertices.byteLength;
  const normBytes = geo.normals.byteLength;
  const uvBytes = geo.uvs.byteLength;
  const idxBytes = geo.indices.byteLength;
  const total = header + vertBytes + normBytes + uvBytes + idxBytes;

  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  view.setUint32(0, geo.vertices.length / 3, true);
  view.setUint32(4, geo.indices.length / 3, true);

  let offset = header;
  new Float32Array(buf, offset, geo.vertices.length).set(geo.vertices); offset += vertBytes;
  new Float32Array(buf, offset, geo.normals.length).set(geo.normals);   offset += normBytes;
  new Float32Array(buf, offset, geo.uvs.length).set(geo.uvs);            offset += uvBytes;
  new Uint16Array(buf, offset, geo.indices.length).set(geo.indices);

  return buf;
}

// ─── ProceduralGeometryResolver ───────────────────────────────────────────────

/**
 * Resolver that generates 3D geometry procedurally for structural/nature traits.
 *
 * Covers: trees, rocks, terrain patches, buildings, arches, crystal clusters.
 * No external dependencies — all geometry is generated from mathematical functions.
 * Output is a packed binary buffer (custom format) + metadata describing the geometry.
 *
 * Priority 15 — runs after cache but before Text3DAdapter.
 */
export class ProceduralGeometryResolver implements AssetResolverPlugin {
  readonly name = 'procedural-geometry';
  readonly priority = 15;

  canResolve(trait: string, _config: TraitVisualConfig): boolean {
    return trait in GEOMETRY_TRAITS;
  }

  async resolve(trait: string, _config: TraitVisualConfig): Promise<ResolvedAsset> {
    const spec = GEOMETRY_TRAITS[trait];
    if (!spec) throw new Error(`ProceduralGeometryResolver: unknown trait "${trait}"`);

    const geo = this.generate(spec.primitive, spec.params);
    const data = packGeometry(geo);

    return {
      type: 'model',
      data,
      metadata: {
        generator: 'procedural-geometry',
        primitive: spec.primitive,
        vertexCount: geo.vertices.length / 3,
        triangleCount: geo.indices.length / 3,
        params: spec.params,
        trait,
      },
    };
  }

  private generate(
    primitive: ProceduralGeometry['primitive'],
    params: Record<string, number>,
  ): Omit<ProceduralGeometry, 'primitive' | 'params'> {
    switch (primitive) {
      case 'tree':             return buildTree(params);
      case 'rock':             return buildRock(params);
      case 'terrain_patch':   return buildTerrainPatch(params);
      case 'building':        return buildBuilding(params);
      case 'arch':             return buildArch(params);
      case 'crystal_cluster': return buildCrystalCluster(params);
      default:
        throw new Error(`ProceduralGeometryResolver: unknown primitive "${primitive}"`);
    }
  }
}

/** Export the trait map for external use (e.g. tests, manifest generation). */
export { GEOMETRY_TRAITS };
