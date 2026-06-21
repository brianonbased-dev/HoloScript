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
const smoothUnion = (smoothness: number, ...children: SDF[]): SDF =>
  ({ type: 'csg', operation: 'smooth_union', smoothness, children }) as unknown as SDF;
const subtract = (...children: SDF[]): SDF =>
  ({ type: 'csg', operation: 'subtract', children }) as unknown as SDF;

interface Piece {
  name: string;
  sdf: SDF;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  res: [number, number, number];
  color: [number, number, number, number];
}

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
  });
  const outPath = join(outDir, `${p.name}.glb`);
  writeFileSync(outPath, Buffer.from(glb));
  console.log(`  ${p.name}.glb  verts=${verts} tris=${tris}  ${glb.byteLength} bytes`);
}
console.log(`gen-world-meshes: wrote ${PIECES.length} GLB(s) -> assets/models/`);
