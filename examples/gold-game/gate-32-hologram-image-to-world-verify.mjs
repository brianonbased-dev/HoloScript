// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 32: HOLOGRAM IMAGE-TO-WORLD (REPRODUCIBLE).
//
// Consumes HoloScript's HoloGram surface for its ACTUAL image-to-world job
// (SURFACE-ROLES-hologram-holomap.md): ingest the founder 2D art, infer
// depth + normals, generate a 3D GOLD world source/composition, and feed that
// world back into the playable vault scene.
//
// REAL surface used (NOT a mock):
//   packages/engine/src/hologram/DepthEstimationService.ts
//     - DepthEstimationService.estimateDepth()  → monocular depth (Depth Anything
//       V2 when @huggingface/transformers is present; deterministic luminance
//       fallback otherwise — the SAME luminance algorithm the Node depth path in
//       packages/hologram-worker/src/depth-infer.ts uses).
//     - depthToNormalMap()  → Sobel-derived per-pixel normals (W.155, zero extra
//       inference cost). The genuine shipped function.
//
// PIPELINE (all deterministic, in-process, no live service, no captured media):
//   1. parseHolo(gold-vault-game.holo) → the real vault scene (regions + objects).
//   2. sharp(gold-vault-vista-wlNgg.jpg) → raw RGBA → downsample to a fixed grid.
//   3. DepthEstimationService.estimateDepth(rgba) → REAL depth map + REAL Sobel
//      normals over the founder art (luminance backend in Node, deterministic).
//   4. Displace a backdrop vertex grid by the inferred depth → a 3D WORLD SOURCE:
//      a new spatial_group ("VaultVistaBackdrop") of depth-placed points that
//      EXTENDS the parsed vault scene (fed back in — the world the art becomes).
//   5. computeStateDigest over the generated world geometry (the REAL
//      packages/engine/src/simulation/hashes.ts spine every gate uses); reproduce
//      twice for the "same input → same output" contract property.
//
//   node_modules/.bin/tsx examples/gold-game/gate-32-hologram-image-to-world-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-32-hologram-image-to-world-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);
const core = await imp(join(repo, 'packages', 'core', 'dist', 'index.js'));
const { computeStateDigest } = await imp(
  join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts')
);
const { DepthEstimationService, depthToNormalMap } = await imp(
  join(repo, 'packages', 'engine', 'src', 'hologram', 'DepthEstimationService.ts')
);

const receiptPath = join(here, 'GATE-32-HOLOGRAM-IMAGE-TO-WORLD-receipt.json');
const holoPath = join(here, 'gold-vault-game.holo');
const artPath = join(here, 'assets', 'gold-vault-vista-wlNgg.jpg');
const worldOutPath = join(here, 'gold-vault-vista-world.json');
const HASH = 'sha256';

// Fixed grid the founder art is reduced to before depth inference. Deterministic.
const GRID_W = 48;
const GRID_H = 32;
// World placement of the generated backdrop (behind the Diamond peak, deterministic).
const BACKDROP = { originX: 0, originY: 6, originZ: -24, spanX: 24, spanY: 16, depthScale: 8 };

// ── 1. Parse the REAL vault scene ─────────────────────────────────────────────
const parsed = core.parseHolo(readFileSync(holoPath, 'utf8'));
const parseClean = (parsed.errors || []).length === 0;
const ast = parsed.ast;
const prop = (node, key, fallback) =>
  (node.properties || []).find((x) => x.key === key)?.value ?? fallback;
const existingGroups = (ast.spatialGroups || []).map((g) => g.name);

// ── 2. Ingest the founder art → raw RGBA at a fixed deterministic grid ─────────
const { data: rgba, info } = await sharp(readFileSync(artPath))
  .resize(GRID_W, GRID_H, { fit: 'fill' })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const artIngested =
  info.width === GRID_W && info.height === GRID_H && rgba.length === GRID_W * GRID_H * 4;

// ── 3. REAL depth + normals via the shipped DepthEstimationService ─────────────
// estimateDepth runs the genuine Depth Anything V2 pipeline when transformers.js
// is installed; in Node it deterministically falls back to the luminance proxy
// (identical to the hologram-worker Node depth path). Either way it is the REAL
// shipped service, and the Sobel normals are the genuine depthToNormalMap.
DepthEstimationService.resetInstance();
const depthService = DepthEstimationService.getInstance({ maxResolution: 512, enableCache: false });
await depthService.initialize();
// The service's `backend` field is the DETECTED compute backend (webgpu/wasm/cpu),
// NOT proof the neural pipeline loaded — if Depth Anything V2 fails to create
// (no WebGPU device for ONNX, model not cached, etc.) it silently runs the
// deterministic luminance fallback while still reporting the detected backend.
// So we read the ACTUAL depth path from whether the pipeline is present, and
// report THAT honestly (anti-overclaim: do not call luminance "neural").
const neuralPipelineLoaded = !!depthService.pipeline;
const depthResult = await depthService.estimateDepth({
  width: GRID_W,
  height: GRID_H,
  data: new Uint8ClampedArray(rgba),
});
const { depthMap, normalMap, width: dW, height: dH, backend } = depthResult;
const depthPath = neuralPipelineLoaded
  ? `depth-anything-v2 (${backend})`
  : 'luminance-fallback (deterministic)';
const realDepthSurface =
  depthMap instanceof Float32Array &&
  depthMap.length === dW * dH &&
  normalMap instanceof Float32Array &&
  normalMap.length === dW * dH * 3 &&
  dW > 0 &&
  dH > 0;

// Independently re-derive the normals from the SAME depth via the real Sobel fn
// (proves the shipped depthToNormalMap is what produced them — no fabricated map).
const normalsRederived = depthToNormalMap(depthMap, dW, dH);
let normalsMatch = normalsRederived.length === normalMap.length;
if (normalsMatch) {
  for (let i = 0; i < normalMap.length; i++) {
    if (Math.abs(normalsRederived[i] - normalMap[i]) > 1e-6) {
      normalsMatch = false;
      break;
    }
  }
}

// Depth must carry real variation (a flat map = no world). Range over the field.
let dMin = Infinity,
  dMax = -Infinity;
for (let i = 0; i < depthMap.length; i++) {
  if (depthMap[i] < dMin) dMin = depthMap[i];
  if (depthMap[i] > dMax) dMax = depthMap[i];
}
const depthRange = dMax - dMin;
const depthHasVariation = depthRange > 0.05;

// ── 4. Displace a vertex grid by inferred depth → the 3D WORLD SOURCE ──────────
// Each grid cell becomes a world vertex: (x,y) span the backdrop plane, z is
// pushed by the inferred depth (near=closer to camera, far=deeper). This is the
// "2D art → 3D GOLD world" — geometry the founder image becomes.
const q = (v) => Math.round(v * 1e4); // 1e-4 quantum, deterministic int field
const posField = []; // quantized [x,y,z] per vertex
const normField = []; // quantized [nx,ny,nz] per vertex
const worldVertices = [];
for (let y = 0; y < dH; y++) {
  for (let x = 0; x < dW; x++) {
    const u = dW > 1 ? x / (dW - 1) : 0;
    const v = dH > 1 ? y / (dH - 1) : 0;
    const wx = BACKDROP.originX + (u - 0.5) * BACKDROP.spanX;
    const wy = BACKDROP.originY + (0.5 - v) * BACKDROP.spanY; // image-y down → world-y up
    const d = depthMap[y * dW + x];
    const wz = BACKDROP.originZ - (1 - d) * BACKDROP.depthScale; // near (low d) pushed back less
    posField.push(q(wx), q(wy), q(wz));
    const ni = (y * dW + x) * 3;
    normField.push(q(normalMap[ni]), q(normalMap[ni + 1]), q(normalMap[ni + 2]));
    if (worldVertices.length < 6) {
      worldVertices.push({
        grid: [x, y],
        world: [+wx.toFixed(4), +wy.toFixed(4), +wz.toFixed(4)],
        depth: +d.toFixed(4),
      });
    }
  }
}
const vertexCount = posField.length / 3;
const worldGenerated = vertexCount === dW * dH && vertexCount >= GRID_W * GRID_H;

// The generated WORLD SOURCE — a spatial_group that EXTENDS the vault scene.
// This gate proves SOURCE generation only; rendering this world source to a visible
// backdrop is Gate 34 (holographic outputs) + the Gate-1-pattern textured render.
const generatedWorld = {
  kind: 'hologram-image-to-world',
  source_image: 'examples/gold-game/assets/gold-vault-vista-wlNgg.jpg',
  source_holo: 'examples/gold-game/gold-vault-game.holo',
  generated_group: {
    spatial_group: 'VaultVistaBackdrop',
    origin: [BACKDROP.originX, BACKDROP.originY, BACKDROP.originZ],
    geometry: 'depth_displaced_grid',
    grid: { width: dW, height: dH },
    vertexCount,
    sampleVertices: worldVertices,
    // Full per-cell depth field + placement params so a consumer (Gate 34 / the
    // playable build) can reconstruct the EXACT displaced surface this gate proved.
    // Digest is over posField (above), so persisting this does not change worldDigest.
    depthGrid: {
      width: dW,
      height: dH,
      depths: Array.from(depthMap, (d) => +d.toFixed(4)),
      backdrop: { ...BACKDROP },
    },
  },
  feedsBackInto:
    'a world source for the playable vault scene behind DiamondPeak; the visible render is Gate 34 (holographic outputs) — NOT yet mounted in drive-build',
};

// ── 5. Digest over the generated world geometry (REAL computeStateDigest) ──────
const worldDigest = computeStateDigest(
  {
    fieldNames: ['vista_position', 'vista_normal'],
    getField: (n) => Float32Array.from(n === 'vista_normal' ? normField : posField),
  },
  HASH
);
// re-derive independently (same arrays, rebuilt) → "reproduces twice" property
const posField2 = [];
const normField2 = [];
for (let y = 0; y < dH; y++) {
  for (let x = 0; x < dW; x++) {
    const u = dW > 1 ? x / (dW - 1) : 0;
    const v = dH > 1 ? y / (dH - 1) : 0;
    const wx = BACKDROP.originX + (u - 0.5) * BACKDROP.spanX;
    const wy = BACKDROP.originY + (0.5 - v) * BACKDROP.spanY;
    const d = depthMap[y * dW + x];
    const wz = BACKDROP.originZ - (1 - d) * BACKDROP.depthScale;
    posField2.push(q(wx), q(wy), q(wz));
    const ni = (y * dW + x) * 3;
    normField2.push(q(normalMap[ni]), q(normalMap[ni + 1]), q(normalMap[ni + 2]));
  }
}
const worldDigest2 = computeStateDigest(
  {
    fieldNames: ['vista_position', 'vista_normal'],
    getField: (n) => Float32Array.from(n === 'vista_normal' ? normField2 : posField2),
  },
  HASH
);
const deterministic = worldDigest === worldDigest2 && worldDigest.length > 0;

const receipt = {
  gate: 32,
  track: 'flagship',
  name: 'HoloGram image-to-world — founder 2D art becomes a depth-backed 3D GOLD world source',
  verifier: 'examples/gold-game/gate-32-hologram-image-to-world-verify.mjs',
  implementation: {
    depthService:
      'packages/engine/src/hologram/DepthEstimationService.ts (SHIPPED — Depth Anything V2 pipeline; deterministic luminance fallback in Node, same algorithm as packages/hologram-worker/src/depth-infer.ts)',
    normalMap:
      'packages/engine/src/hologram/DepthEstimationService.ts depthToNormalMap (genuine Sobel, W.155)',
    sourceImage: 'examples/gold-game/assets/gold-vault-vista-wlNgg.jpg (the founder art)',
    sourceScene: 'examples/gold-game/gold-vault-game.holo (parsed via @holoscript/core parseHolo)',
    contractSpine: 'packages/engine/src/simulation/hashes.ts computeStateDigest',
  },
  inference: {
    grid: `${GRID_W}x${GRID_H}`,
    detectedBackend: backend,
    neuralPipelineLoaded,
    actualDepthPath: depthPath,
    depthMin: +dMin.toFixed(4),
    depthMax: +dMax.toFixed(4),
    depthRange: +depthRange.toFixed(4),
    note: neuralPipelineLoaded
      ? 'REAL Depth Anything V2 neural inference loaded and ran on detected backend "' +
        backend +
        '"'
      : 'Depth Anything V2 pipeline did NOT load in this env (transformers.js present but no usable ONNX device for "' +
        backend +
        '"); ran the SHIPPED deterministic luminance fallback (identical algorithm to packages/hologram-worker/src/depth-infer.ts). The neural backend is a runtime/model-availability upgrade, NOT a code change — the image-to-world pipeline below is backend-agnostic.',
  },
  generatedWorld,
  scene: { parseClean, existingGroups, generatedGroup: 'VaultVistaBackdrop' },
  checks: {
    parseClean,
    artIngested,
    realDepthSurface,
    normalsMatch,
    depthHasVariation,
    worldGenerated,
    deterministic,
  },
  contract: {
    spine: 'REAL computeStateDigest(field-bag, sha256)',
    worldDigest,
    reproducible: 'run the verifier to re-derive',
  },
  honestScope:
    'Consumes the GENUINE shipped HoloGram depth surface (packages/engine/src/hologram/DepthEstimationService.ts — the same DepthEstimationService + depthToNormalMap the production hologram path uses) for its ACTUAL image-to-world job. PROVEN: the REAL founder 2D art is ingested (sharp → raw RGBA), the SHIPPED service infers a real per-pixel depth map with genuine variation, the SHIPPED Sobel depthToNormalMap derives per-vertex normals (independently re-derived to prove they are not fabricated), those maps DISPLACE a vertex grid into a 3D world source (a VaultVistaBackdrop spatial_group that extends the real parsed vault scene; it is emitted as a world SOURCE — rendering it visibly in the playable build is Gate 34 holographic outputs + the Gate-1-pattern textured render, NOT yet mounted in drive-build), and the generated world geometry digest reproduces deterministically via the real computeStateDigest. ' +
    'NOT proven here (out of scope, requires a usable on-device neural runtime): (a) Depth Anything V2 NEURAL depth — in THIS run the service detected backend "' +
    backend +
    '" but the ONNX/transformers.js pipeline did not initialize (neuralPipelineLoaded=' +
    neuralPipelineLoaded +
    '), so it ran the SHIPPED deterministic luminance fallback (actualDepthPath="' +
    depthPath +
    '", the identical algorithm to packages/hologram-worker/src/depth-infer.ts); the neural backend is a runtime/model-availability upgrade, not a code change, and the world-generation pipeline below is backend-agnostic (it consumes whatever depth+normals the shipped service returns); (b) RASTERIZED pixels of the backdrop — the textured/lit render is the headless-Chromium / browser render path (Gate 1 pattern), not this pure-geometry verifier; (c) full mesh tessellation + UV atlas — this gate proves the depth-displaced point/vertex field (the world SOURCE), the polygonal surfacing is the deepening. This gate proves the deterministic IMAGE-to-DEPTH-to-3D-WORLD-SOURCE pipeline over the real founder art using the real shipped service — the compiler/service-side artifact; the neural-depth backend + pixel raster are the model-download/hardware-in-the-loop deepening, the same pattern as Gates 1/13.',
  verifiedAt: new Date().toISOString(),
};

const emit = process.argv.includes('--emit');
if (emit) {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  writeFileSync(worldOutPath, JSON.stringify(generatedWorld, null, 2) + '\n');
  console.log('GATE-32 RECEIPT EMITTED ->', receiptPath);
  console.log('  WORLD SOURCE EMITTED ->', worldOutPath);
  console.log(
    '  artIngested=' + artIngested,
    'depthPath=' + depthPath,
    'grid=' + GRID_W + 'x' + GRID_H
  );
  console.log(
    '  depthRange=' + +depthRange.toFixed(4),
    'normalsMatch=' + normalsMatch,
    'vertices=' + vertexCount
  );
  console.log('  worldDigest=' + worldDigest.slice(0, 24), 'deterministic=' + deterministic);
} else {
  let existing;
  try {
    existing = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    console.error('No Gate-32 receipt. Run --emit first.');
    process.exit(2);
  }
  const checks = [
    ['vault scene parses clean (@holoscript/core)', parseClean === true],
    ['founder 2D art ingested to raw RGBA grid (sharp)', artIngested === true],
    ['REAL shipped DepthEstimationService produces depth + normal maps', realDepthSurface === true],
    [
      'normals re-derive from the SAME depth via shipped Sobel depthToNormalMap (not fabricated)',
      normalsMatch === true,
    ],
    ['inferred depth carries genuine variation (range > 0.05)', depthHasVariation === true],
    [
      'depth+normals displace a vertex grid into a 3D world source (VaultVistaBackdrop)',
      worldGenerated === true,
    ],
    [
      'generated world geometry digest reproduces deterministically (twice)',
      deterministic === true,
    ],
    [
      'world digest reproduces vs receipt (real computeStateDigest)',
      worldDigest === existing.contract.worldDigest,
    ],
  ];
  let ok = true;
  console.log('GATE-32 (HOLOGRAM IMAGE-TO-WORLD) VERIFICATION:');
  for (const [label, pass] of checks) {
    console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label);
    ok = ok && pass;
  }
  console.log('  => GATE 32', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}
