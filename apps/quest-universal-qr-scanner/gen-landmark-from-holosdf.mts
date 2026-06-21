#!/usr/bin/env tsx
/**
 * Hero-mesh generator sourced from the LIVE holo-sdf model (NOT hand-authored).
 *
 * This is the first end-to-end "generated-geometry -> on-headset" pass: a text prompt -> holo-sdf:v0
 * (the sovereign SDFNode model served on the Jetson) -> SDFNode JSON -> Simulation.marchingCubes ->
 * GLTFPipeline.addSurfaceMesh -> .glb in the world's model: slot. Same mesh->GLB path as
 * gen-world-meshes.mts, but the SDF tree is authored by the model, not by hand. The GLB is then
 * referenced from shangri-la.holo and compiled to Meta by the quest target; the build-verify gate
 * proves the resulting app builds.
 *
 *   npx tsx gen-landmark-from-holosdf.mts [in.jsonl] [out-name]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Import marchingCubes from engine SOURCE (not the @holoscript/engine package entry, which needs a
// built @holoscript/core/dist that isn't present) — same approach as the .ai-ecosystem mesher.
import { marchingCubes } from '../../packages/engine/src/simulation/manufacturing/MarchingCubes';
import { GLTFPipeline } from '../../packages/core/src/compiler/GLTFPipeline';

const here = dirname(fileURLToPath(import.meta.url));
const inPath = process.argv[2] ?? 'C:/tmp/landmark.jsonl';
const outName = process.argv[3] ?? 'holo_spire';

const row = JSON.parse(readFileSync(inPath, 'utf8').trim().split('\n')[0]);
console.log(`[holo-sdf] "${row.prompt}" -> ${outName}.glb`);

const mesh = marchingCubes(row.sdf as never, {
  // tight bounds around the model's ~0.5m params, base near y=0; placed by position in the .holo.
  bounds: { min: [-0.9, -0.4, -0.9], max: [0.9, 1.4, 0.9] },
  resolution: [80, 96, 80],
});
const tris = mesh.triangles.length / 3;
const positions = new Float32Array(mesh.vertices as ArrayLike<number>);
const indices = new Uint32Array(mesh.triangles as ArrayLike<number>);
const glb = new GLTFPipeline({ format: 'glb' }).addSurfaceMesh(positions, indices, {
  baseColor: [0.58, 0.82, 0.7, 1], // luminous jade-gold, fits the Shangri-La palette
  name: outName,
});
const outDir = join(here, 'android-mr', 'app', 'src', 'main', 'assets', 'models');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${outName}.glb`);
writeFileSync(outPath, Buffer.from(glb));
console.log(`gen-landmark-from-holosdf: ${outName}.glb  tris=${tris}  ${glb.byteLength} bytes -> ${outPath}`);
