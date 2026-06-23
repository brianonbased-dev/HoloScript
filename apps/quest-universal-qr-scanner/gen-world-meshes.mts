#!/usr/bin/env tsx
/**
 * Sovereign SDF -> GLB hero-mesh generator for the Shangri-La world.
 *
 * Uses the WORKING sovereign skill (no API key, $0): Simulation.marchingCubes (the same native
 * SDF/CSG marching-cubes the studio manufacturing lane uses) authors real watertight triangle
 * meshes, then GLTFPipeline.addSurfaceMesh (the bridge) writes them as Quest-loadable .glb into the
 * app's assets/models/ slot. Meta Spatial SDK loads glb only — this is what turns "blocks and
 * globes" into real sculpted geometry. Spatial Transform has no scale, so each piece is authored at
 * final METER size and placed by position in shangri-la.holo via `model: "<name>.glb"`.
 *
 * Run: npx tsx gen-world-meshes.mts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Simulation } from '@holoscript/engine';
import { GLTFPipeline } from '../../packages/core/src/compiler/GLTFPipeline';

type SDF = Simulation.SDFNode;
const prim = (primitive: string, params: Record<string, number>, translate?: [number, number, number]): SDF =>
  ({ type: 'primitive', primitive, params, ...(translate ? { translate } : {}) }) as unknown as SDF;
const box = (w: number, h: number, d: number, t?: [number, number, number]): SDF =>
  prim('box', { width: w, height: h, depth: d }, t); // half-extents
const sphere = (r: number, t?: [number, number, number]): SDF => prim('sphere', { radius: r }, t);
const cyl = (h: number, r: number, t?: [number, number, number]): SDF => prim('cylinder', { height: h, radius: r }, t);
// cone: c0/c1 = base/apex ratio, height = vertical extent (apex at -height, base widens upward); see SDFPointEvaluator.coneDistance
const cone = (height: number, c0: number, c1: number, t?: [number, number, number]): SDF =>
  prim('cone', { height, c0, c1 }, t);
// capsule: vertical along Y, spans y∈[-height,+height] with hemispherical caps of `radius`
const capsule = (height: number, radius: number, t?: [number, number, number]): SDF =>
  prim('capsule', { height, radius }, t);
// round_cone: r1 bottom radius, r2 top radius, along Y from y=0 (r1) up to y=height (r2). A tapered, rounded trunk/blade.
const roundCone = (height: number, r1: number, r2: number, t?: [number, number, number]): SDF =>
  prim('round_cone', { height, r1, r2 }, t);
// ellipsoid: rx/ry/rz semi-axes
const ellipsoid = (rx: number, ry: number, rz: number, t?: [number, number, number]): SDF =>
  prim('ellipsoid', { rx, ry, rz }, t);
const smoothUnion = (smoothness: number, ...children: SDF[]): SDF =>
  ({ type: 'csg', operation: 'smooth_union', smoothness, children }) as unknown as SDF;
const subtract = (...children: SDF[]): SDF =>
  ({ type: 'csg', operation: 'subtract', children }) as unknown as SDF;
// ── domain ops (exactly one child) ──
// repeat: infinite-grid tiling with cell sizes cx/cy/cz; marchingCubes bounds + closeBoundary limit how many tiles appear.
const repeat = (cx: number, cy: number, cz: number, child: SDF): SDF =>
  ({ type: 'domain', operation: 'repeat', params: { cx, cy, cz }, children: [child] }) as unknown as SDF;
// twist: rotate around Y by k*y radians (organic lean of a trunk/foliage)
const twist = (k: number, child: SDF): SDF =>
  ({ type: 'domain', operation: 'twist', params: { k }, children: [child] }) as unknown as SDF;
// bend: rotate around X by k*x radians (gentle canopy droop)
const bend = (k: number, child: SDF): SDF =>
  ({ type: 'domain', operation: 'bend', params: { k }, children: [child] }) as unknown as SDF;

type RGB = [number, number, number];
type Bounds = { min: [number, number, number]; max: [number, number, number] };
type VertexColorFn = (pos: [number, number, number], i: number, b: Bounds) => RGB;

interface Piece {
  name: string;
  sdf: SDF;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  res: [number, number, number];
  color: [number, number, number, number];
  /** PBR: metallic 0 + matte roughness by default; overridden per-piece for stone/gold/rock. */
  metallic?: number;
  roughness?: number;
  /** Optional per-vertex color — bakes organic gradient + mottling into the mesh ($0, no textures). */
  vertexColor?: VertexColorFn;
}

// ── vertex-color helpers (cheap deterministic organic richness) ──────────────
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
// Cheap, position-deterministic hash noise in [-1,1]; stable across runs (no RNG state).
const hashNoise = (x: number, y: number, z: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1; // [-1,1]
};
// Normalized height 0 (bottom) .. 1 (top) of a vertex within the mesh bounds.
const heightT = (py: number, b: Bounds) => clamp01((py - b.min[1]) / Math.max(1e-4, b.max[1] - b.min[1]));

/**
 * Foliage gradient: darker/cooler green at the base & interior, brighter/yellower at tips & top,
 * plus subtle per-vertex mottling. `darken` shifts the whole tree (mature vs young), `mottle`
 * the noise amplitude.
 */
const foliageColor =
  (base: RGB, tip: RGB, mottle = 0.06): VertexColorFn =>
  (pos, _i, b) => {
    const t = heightT(pos[1], b);
    // Radial term: interior (near trunk axis) reads darker than the lit outer canopy.
    const r = clamp01(Math.hypot(pos[0], pos[2]) / Math.max(1e-4, Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) * 0.5));
    const lift = clamp01(0.55 * t + 0.45 * r);
    const c = mix(base, tip, lift);
    const n = hashNoise(pos[0] * 7.1, pos[1] * 7.1, pos[2] * 7.1) * mottle;
    return [clamp01(c[0] + n), clamp01(c[1] + n), clamp01(c[2] + n)];
  };

/**
 * Trunk+canopy welded mesh: brown bark at low height, green canopy above, with a smooth blend band.
 * Used where the trunk and foliage are one welded SDF (all the trees here).
 */
const trunkCanopyColor =
  (bark: RGB, base: RGB, tip: RGB, trunkTop = 0.32, mottle = 0.06): VertexColorFn =>
  (pos, i, b) => {
    const t = heightT(pos[1], b);
    if (t < trunkTop) {
      // bark zone: warm brown with vertical darkening toward the ground (AO-ish)
      const k = clamp01(t / trunkTop);
      const dark = mix([bark[0] * 0.7, bark[1] * 0.7, bark[2] * 0.7], bark, k);
      const n = hashNoise(pos[0] * 9, pos[1] * 9, pos[2] * 9) * mottle * 0.8;
      return [clamp01(dark[0] + n), clamp01(dark[1] + n), clamp01(dark[2] + n)];
    }
    // blend band then full canopy gradient
    const fol = foliageColor(base, tip, mottle)(pos, i, b);
    const blend = clamp01((t - trunkTop) / 0.08); // 8% band
    return mix(bark, fol, blend);
  };

/** Rock/stone mottling: grey base with lighter/darker random patches; optional crevice darkening by height. */
const stoneColor =
  (grey: RGB, mottle = 0.1, creviceDarken = 0): VertexColorFn =>
  (pos, _i, b) => {
    const n = hashNoise(pos[0] * 5.3, pos[1] * 5.3, pos[2] * 5.3) * mottle;
    let c: RGB = [clamp01(grey[0] + n), clamp01(grey[1] + n), clamp01(grey[2] + n)];
    if (creviceDarken > 0) {
      // darken low/recessed areas (cheap AO proxy: lower height = more occluded)
      const t = heightT(pos[1], b);
      const ao = 1 - creviceDarken * (1 - t);
      c = [c[0] * ao, c[1] * ao, c[2] * ao];
    }
    return c;
  };

// All authored at final meter size, base sitting on y=0 (placed by position in the .holo).
const PIECES: Piece[] = [
  {
    // 3-tier temple crowned by a spire — the centerpiece.
    name: 'temple',
    sdf: smoothUnion(
      0.18,
      box(1.8, 0.6, 1.8, [0, 0.6, 0]),
      box(1.25, 0.55, 1.25, [0, 1.6, 0]),
      box(0.8, 0.5, 0.8, [0, 2.5, 0]),
      box(0.18, 0.7, 0.18, [0, 3.5, 0])
    ),
    bounds: { min: [-2.1, -0.2, -2.1], max: [2.1, 4.4, 2.1] },
    res: [88, 110, 88],
    color: [0.74, 0.6, 0.42, 1], // warm stone + gold
    metallic: 0.0,
    roughness: 0.82, // rough non-metal stone
    // Warm sandstone, brighter at the top spire (sun-lit), AO-darkening into the lower crevices.
    vertexColor: stoneColor([0.74, 0.6, 0.42], 0.05, 0.22),
  },
  {
    // Torii-style gate: two pillars + a top lintel.
    name: 'gate',
    sdf: smoothUnion(
      0.1,
      box(0.22, 1.6, 0.22, [-1.5, 1.6, 0]),
      box(0.22, 1.6, 0.22, [1.5, 1.6, 0]),
      box(2.0, 0.24, 0.3, [0, 3.1, 0]),
      box(1.7, 0.16, 0.24, [0, 2.6, 0])
    ),
    bounds: { min: [-2.3, -0.2, -0.6], max: [2.3, 3.6, 0.6] },
    res: [120, 96, 40],
    color: [0.7, 0.22, 0.16, 1], // vermilion torii
    metallic: 0.0,
    roughness: 0.7, // lacquered-wood torii: slightly less matte than stone
    // Vermilion with subtle weathering mottle + slight darkening toward the base of the pillars.
    vertexColor: stoneColor([0.7, 0.22, 0.16], 0.04, 0.18),
  },
  {
    // Jade cliff outcrop — irregular smooth_union of spheres + a base box.
    name: 'cliff',
    sdf: smoothUnion(
      0.5,
      box(1.4, 0.5, 1.4, [0, 0.45, 0]),
      sphere(0.95, [-0.3, 1.1, 0.2]),
      sphere(0.8, [0.5, 1.5, -0.2]),
      sphere(0.6, [0.1, 2.1, 0.3])
    ),
    bounds: { min: [-1.8, -0.2, -1.8], max: [1.8, 2.9, 1.8] },
    res: [80, 72, 80],
    color: [0.24, 0.42, 0.36, 1], // jade
    metallic: 0.05,
    roughness: 0.8, // jade stone: rough, faint mineral sheen
    // Jade with mineral mottling + crevice darkening so the outcrop reads with depth.
    vertexColor: stoneColor([0.24, 0.42, 0.36], 0.08, 0.25),
  },
  {
    // Lotus pad with a bud — stacked flattened forms.
    name: 'lotus',
    sdf: smoothUnion(
      0.22,
      cyl(0.08, 1.0, [0, 0.1, 0]),
      sphere(0.45, [0, 0.5, 0])
    ),
    bounds: { min: [-1.2, -0.1, -1.2], max: [1.2, 1.1, 1.2] },
    res: [80, 56, 80],
    color: [0.9, 0.55, 0.75, 1], // lotus pink
    metallic: 0.0,
    roughness: 0.6, // soft waxy petal
    // Green pad at the base (the lily pad), pink bud on top — vertical gradient.
    vertexColor: foliageColor([0.32, 0.5, 0.34], [0.95, 0.62, 0.8], 0.05),
  },

  // ── VEGETATION (sovereign SDF, quantity baked into each GLB) ─────────────────
  {
    // pine — tall conifer: a slim capsule trunk smooth_union'd with 4 stacked
    // round_cone foliage tiers (r1 bottom > r2 top = wide-at-base spruce shape),
    // gently twisted for organic life. ~4m tall.
    name: 'pine',
    sdf: smoothUnion(
      0.06,
      capsule(1.7, 0.12, [0, 1.7, 0]), // trunk: y∈[0,3.4]
      twist(
        0.05,
        smoothUnion(
          0.12,
          roundCone(1.4, 0.95, 0.05, [0, 0.7, 0]), // lowest, widest tier
          roundCone(1.1, 0.75, 0.04, [0, 1.7, 0]),
          roundCone(0.85, 0.55, 0.04, [0, 2.55, 0]),
          roundCone(0.6, 0.38, 0.02, [0, 3.25, 0]) // crown
        )
      )
    ),
    bounds: { min: [-1.1, -0.15, -1.1], max: [1.1, 4.0, 1.1] },
    res: [64, 116, 64],
    color: [0.176, 0.302, 0.18, 1], // deep pine green #2d4d2e
    metallic: 0.0,
    roughness: 0.9,
    // brown trunk low → deep pine green base → brighter blue-green tips at crown
    vertexColor: trunkCanopyColor([0.32, 0.22, 0.14], [0.13, 0.26, 0.15], [0.32, 0.5, 0.3], 0.42),
  },
  {
    // pine2 — shorter, fuller fir variant: 3 broad tiers + a slight bend lean. ~3m.
    name: 'pine2',
    sdf: smoothUnion(
      0.06,
      capsule(1.2, 0.13, [0, 1.2, 0]), // trunk y∈[0,2.4]
      bend(
        0.04,
        smoothUnion(
          0.14,
          roundCone(1.25, 1.05, 0.06, [0, 0.55, 0]),
          roundCone(1.0, 0.78, 0.05, [0, 1.45, 0]),
          roundCone(0.7, 0.5, 0.03, [0, 2.25, 0])
        )
      )
    ),
    bounds: { min: [-1.25, -0.15, -1.25], max: [1.25, 3.1, 1.25] },
    res: [68, 96, 68],
    color: [0.122, 0.302, 0.18, 1], // darker spruce #1f4d2e
    metallic: 0.0,
    roughness: 0.9,
    vertexColor: trunkCanopyColor([0.3, 0.2, 0.13], [0.1, 0.25, 0.15], [0.28, 0.46, 0.27], 0.36),
  },
  {
    // pine3 — slim young sapling: 3 narrow tiers, slight twist. ~2m, for clusters/understory.
    name: 'pine3',
    sdf: smoothUnion(
      0.05,
      capsule(0.85, 0.08, [0, 0.85, 0]), // trunk y∈[0,1.7]
      twist(
        0.08,
        smoothUnion(
          0.1,
          roundCone(0.85, 0.6, 0.04, [0, 0.5, 0]),
          roundCone(0.65, 0.42, 0.03, [0, 1.2, 0]),
          roundCone(0.45, 0.26, 0.02, [0, 1.75, 0])
        )
      )
    ),
    bounds: { min: [-0.75, -0.12, -0.75], max: [0.75, 2.3, 0.75] },
    res: [56, 88, 56],
    color: [0.227, 0.42, 0.208, 1], // fresh young green #3a6b35
    metallic: 0.0,
    roughness: 0.9,
    // young sapling: lighter, more yellow-green tips
    vertexColor: trunkCanopyColor([0.34, 0.24, 0.16], [0.2, 0.38, 0.19], [0.45, 0.6, 0.32], 0.32),
  },
  {
    // broadleaf — rounded-canopy deciduous tree: a capsule trunk smooth_union'd
    // with a cluster of ellipsoid/sphere canopy lobes. ~3.5m, lush and round.
    name: 'broadleaf',
    sdf: smoothUnion(
      0.08,
      capsule(1.0, 0.16, [0, 1.0, 0]), // trunk y∈[0,2.0]
      smoothUnion(
        0.3,
        ellipsoid(1.1, 0.85, 1.1, [0, 2.55, 0]), // main crown
        sphere(0.7, [-0.7, 2.3, 0.3]), // side lobes
        sphere(0.65, [0.65, 2.4, -0.35]),
        sphere(0.6, [0.1, 3.1, 0.4]),
        sphere(0.55, [-0.25, 2.2, -0.6])
      )
    ),
    bounds: { min: [-1.5, -0.15, -1.5], max: [1.5, 3.6, 1.5] },
    res: [88, 108, 88],
    color: [0.227, 0.42, 0.208, 1], // canopy green #3a6b35
    metallic: 0.0,
    roughness: 0.9,
    // lush rounded canopy: warm bark → mid green → bright yellow-green sunlit tips
    vertexColor: trunkCanopyColor([0.36, 0.25, 0.15], [0.18, 0.36, 0.18], [0.5, 0.66, 0.34], 0.36),
  },
  {
    // broadleaf2 — bigger, wider shade tree variant; offset lobes for asymmetry. ~4m.
    name: 'broadleaf2',
    sdf: smoothUnion(
      0.09,
      capsule(1.15, 0.2, [0, 1.15, 0]), // trunk y∈[0,2.3]
      smoothUnion(
        0.35,
        ellipsoid(1.35, 0.95, 1.25, [0.15, 2.9, 0]), // broad crown
        sphere(0.85, [-0.95, 2.55, 0.4]),
        sphere(0.78, [0.9, 2.7, -0.45]),
        sphere(0.7, [0.0, 3.5, 0.2]),
        sphere(0.62, [-0.4, 2.4, -0.75])
      )
    ),
    bounds: { min: [-1.85, -0.15, -1.7], max: [1.85, 4.1, 1.7] },
    res: [96, 112, 92],
    color: [0.176, 0.341, 0.165, 1], // mature deep green #2d572a
    metallic: 0.0,
    roughness: 0.9,
    // mature shade tree: deeper, more saturated greens than broadleaf
    vertexColor: trunkCanopyColor([0.34, 0.23, 0.14], [0.14, 0.3, 0.14], [0.4, 0.58, 0.28], 0.34),
  },
  {
    // grass_patch — a dense tuft field: ONE thin tapered round_cone blade,
    // repeat-tiled on a ~0.28m grid across a ~2.5x2.5m patch. closeBoundary caps
    // the field edges; interior yields a dense bed of ~80+ blades in ONE mesh = ONE draw call.
    name: 'grass_patch',
    sdf: repeat(
      0.28,
      10, // tall cy so blades are NOT tiled vertically (single layer)
      0.28,
      roundCone(0.34, 0.05, 0.012, [0, 0.0, 0]) // a single blade rising from y=0
    ),
    bounds: { min: [-1.25, -0.02, -1.25], max: [1.25, 0.42, 1.25] },
    res: [138, 26, 138],
    color: [0.227, 0.42, 0.208, 1], // grass green #3a6b35
    metallic: 0.0,
    roughness: 0.9,
    // blade gradient: darker green at the soil, brighter yellow-green at the tips + mottle per blade
    vertexColor: foliageColor([0.15, 0.3, 0.14], [0.42, 0.62, 0.3], 0.08),
  },
  {
    // grass_patch2 — taller, sparser wild-grass field on a wider grid (variety against grass_patch).
    name: 'grass_patch2',
    sdf: repeat(
      0.36,
      10,
      0.36,
      roundCone(0.48, 0.055, 0.01, [0, 0.0, 0])
    ),
    bounds: { min: [-1.3, -0.02, -1.3], max: [1.3, 0.56, 1.3] },
    res: [140, 36, 140],
    color: [0.176, 0.353, 0.184, 1], // meadow green #2d5a2f
    metallic: 0.0,
    roughness: 0.9,
    // wild meadow grass: slightly drier/yellower tips than grass_patch
    vertexColor: foliageColor([0.14, 0.28, 0.13], [0.5, 0.6, 0.26], 0.1),
  },
  {
    // rock_cluster — a natural pile of several smooth_union'd ellipsoids of varying
    // size, settled around y=0. Grey stone. ~1.6m across.
    name: 'rock_cluster',
    sdf: smoothUnion(
      0.18,
      ellipsoid(0.7, 0.5, 0.6, [0, 0.42, 0]), // main boulder
      ellipsoid(0.45, 0.38, 0.5, [0.55, 0.3, 0.25]),
      ellipsoid(0.4, 0.3, 0.42, [-0.5, 0.26, -0.3]),
      ellipsoid(0.3, 0.26, 0.32, [0.1, 0.62, -0.45]),
      ellipsoid(0.26, 0.22, 0.28, [-0.35, 0.2, 0.5])
    ),
    bounds: { min: [-1.05, -0.05, -1.0], max: [1.1, 1.0, 1.0] },
    res: [80, 56, 80],
    color: [0.42, 0.42, 0.44, 1], // grey rock #6b6b70
    metallic: 0.05,
    roughness: 0.8, // grey stone, slight mineral sheen
    // grey with strong lighter/darker patches + AO darkening in the lower piles
    vertexColor: stoneColor([0.42, 0.42, 0.44], 0.13, 0.28),
  },
  {
    // bush — low shrub ground filler: a tight cluster of small spheres/ellipsoids
    // smooth_union'd into a rounded mound. ~1.2m across, ~0.7m tall.
    name: 'bush',
    sdf: smoothUnion(
      0.2,
      ellipsoid(0.6, 0.42, 0.6, [0, 0.4, 0]),
      sphere(0.34, [0.42, 0.34, 0.18]),
      sphere(0.32, [-0.4, 0.32, -0.15]),
      sphere(0.3, [0.05, 0.58, -0.35]),
      sphere(0.28, [-0.18, 0.3, 0.42])
    ),
    bounds: { min: [-1.0, -0.05, -1.0], max: [1.0, 0.95, 1.0] },
    res: [76, 44, 76],
    color: [0.176, 0.302, 0.18, 1], // shrub green #2d4d2e
    metallic: 0.0,
    roughness: 0.9,
    // shrub: dark interior/base → brighter outer/top leaves
    vertexColor: foliageColor([0.13, 0.25, 0.14], [0.34, 0.52, 0.26], 0.08),
  },
];

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'android-mr', 'app', 'src', 'main', 'assets', 'models');
mkdirSync(outDir, { recursive: true });

for (const p of PIECES) {
  const mesh = Simulation.marchingCubes(p.sdf, { bounds: p.bounds, resolution: p.res });
  const verts = mesh.vertices.length / 3;
  const tris = mesh.triangles.length / 3;
  const positions = new Float32Array(mesh.vertices as ArrayLike<number>);
  const indices = new Uint32Array(mesh.triangles as ArrayLike<number>);
  const glb = new GLTFPipeline({ format: 'glb' }).addSurfaceMesh(positions, indices, {
    baseColor: p.color,
    name: p.name,
    metallic: p.metallic,
    roughness: p.roughness,
    vertexColor: p.vertexColor,
  });
  const outPath = join(outDir, `${p.name}.glb`);
  writeFileSync(outPath, Buffer.from(glb));
  console.log(`  ${p.name}.glb  verts=${verts} tris=${tris}  ${glb.byteLength} bytes`);
}
console.log(`gen-world-meshes: wrote ${PIECES.length} GLB(s) -> assets/models/`);
