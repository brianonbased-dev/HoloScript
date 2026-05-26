#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// image-to-world.mjs — generalized HoloGram IMAGE-TO-WORLD (the Gate-32 pipeline,
// for ANY image).
//
// Gate 32 proved the founder-art→3D-world pipeline but is pinned to one fixed
// asset (assets/gold-vault-vista-wlNgg.jpg). This is the same REAL shipped pipeline
// parameterized to ingest any image path: it runs the genuine
// packages/engine/src/hologram/DepthEstimationService (Depth Anything V2 when an
// on-device neural runtime is present; the deterministic luminance proxy otherwise),
// derives Sobel normals via the shipped depthToNormalMap, displaces a vertex grid
// into a 3D world source, seals it with the REAL computeStateDigest, AND renders
// VISIBLE depth + normal preview PNGs so a human can see the 2D→depth→3D result
// (F.074: visual is first-class proof).
//
// Usage:
//   node_modules/.bin/tsx examples/gold-game/image-to-world.mjs --image <path> \
//        [--name <worldName>] [--grid 96x64] [--out <dir>] [--scale 8]
//
// Emits into <out> (default examples/gold-game/worlds/):
//   <name>-world.json    the 3D world source (depthGrid + backdrop + worldDigest)
//   <name>-depth.png     grayscale depth map (bright = near, dark = far), upscaled
//   <name>-normals.png   Sobel normal map (RGB-encoded surface orientation), upscaled
// ═══════════════════════════════════════════════════════════════════════════

import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(HERE, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}

const imagePath = arg('image');
if (!imagePath) {
  console.error('usage: tsx examples/gold-game/image-to-world.mjs --image <path> [--name <world>] [--grid 96x64] [--out <dir>] [--scale 8]');
  process.exit(2);
}
const resolvedImage = path.isAbsolute(imagePath) ? imagePath : path.resolve(process.cwd(), imagePath);
const [GRID_W, GRID_H] = arg('grid', '96x64').split('x').map(Number);
const SCALE = parseInt(arg('scale', '8'), 10);
// Depth backend: 'cpu' (→ onnxruntime-node native, the working Node path for the
// real Depth Anything V2 neural net), 'wasm', or 'webgpu' (browser only). Default
// 'cpu' in Node so the tool runs TRUE neural depth, not the luminance fallback.
const BACKEND = arg('backend', 'cpu');
const name = arg('name', path.basename(resolvedImage).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-'));
const outDir = arg('out', path.join(HERE, 'worlds'));

const { computeStateDigest } = await imp(path.join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts'));
const { DepthEstimationService, depthToNormalMap } = await imp(
  path.join(repo, 'packages', 'engine', 'src', 'hologram', 'DepthEstimationService.ts'),
);

// World placement of the generated backdrop (identical to Gate 32 — same projection).
const BACKDROP = { originX: 0, originY: 6, originZ: -24, spanX: 24, spanY: 16, depthScale: 8 };
const q = (v) => Math.round(v * 1e4);

// ── minimal real PNG encoder (RGB, 8-bit, filter 0) ────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(rgb, W, H) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) { raw[y * (1 + W * 3)] = 0; rgb.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
// nearest-neighbor upscale of an RGB buffer for a viewable preview.
function upscale(rgb, W, H, s) {
  const W2 = W * s, H2 = H * s, out = Buffer.alloc(W2 * H2 * 3);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const sx = (x / s) | 0, sy = (y / s) | 0, si = (sy * W + sx) * 3, di = (y * W2 + x) * 3;
    out[di] = rgb[si]; out[di + 1] = rgb[si + 1]; out[di + 2] = rgb[si + 2];
  }
  return { buf: out, W: W2, H: H2 };
}

async function main() {
  // ── ingest the image → raw RGBA at a fixed deterministic grid ───────────────
  let rgba, info;
  try {
    ({ data: rgba, info } = await sharp(await fs.readFile(resolvedImage))
      .resize(GRID_W, GRID_H, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  } catch (e) {
    console.error(`image-to-world: could not read/decode image at ${resolvedImage}\n  ${e.message}`);
    process.exit(1);
  }

  // ── REAL shipped depth + normals ────────────────────────────────────────────
  DepthEstimationService.resetInstance();
  const svc = DepthEstimationService.getInstance({ backend: BACKEND, maxResolution: 512, enableCache: false });
  await svc.initialize();
  const neuralPipelineLoaded = !!svc.pipeline;
  const { depthMap, normalMap, width: dW, height: dH, backend } = await svc.estimateDepth({
    width: GRID_W, height: GRID_H, data: new Uint8ClampedArray(rgba),
  });
  const depthPath = neuralPipelineLoaded ? `depth-anything-v2 (${backend})` : 'luminance-fallback (deterministic)';

  // independently re-derive normals to prove they are the genuine shipped Sobel map.
  const reNorm = depthToNormalMap(depthMap, dW, dH);
  let normalsMatch = reNorm.length === normalMap.length;
  if (normalsMatch) for (let i = 0; i < normalMap.length; i++) if (Math.abs(reNorm[i] - normalMap[i]) > 1e-6) { normalsMatch = false; break; }

  let dMin = Infinity, dMax = -Infinity;
  for (let i = 0; i < depthMap.length; i++) { if (depthMap[i] < dMin) dMin = depthMap[i]; if (depthMap[i] > dMax) dMax = depthMap[i]; }
  const depthRange = dMax - dMin;

  // ── displace a vertex grid by inferred depth → the 3D WORLD SOURCE ──────────
  const posField = [], normField = [], sampleVertices = [];
  for (let y = 0; y < dH; y++) for (let x = 0; x < dW; x++) {
    const u = dW > 1 ? x / (dW - 1) : 0, v = dH > 1 ? y / (dH - 1) : 0;
    const wx = BACKDROP.originX + (u - 0.5) * BACKDROP.spanX;
    const wy = BACKDROP.originY + (0.5 - v) * BACKDROP.spanY;
    const d = depthMap[y * dW + x];
    const wz = BACKDROP.originZ - (1 - d) * BACKDROP.depthScale;
    posField.push(q(wx), q(wy), q(wz));
    const ni = (y * dW + x) * 3;
    normField.push(q(normalMap[ni]), q(normalMap[ni + 1]), q(normalMap[ni + 2]));
    if (sampleVertices.length < 6) sampleVertices.push({ grid: [x, y], world: [+wx.toFixed(4), +wy.toFixed(4), +wz.toFixed(4)], depth: +d.toFixed(4) });
  }
  const vertexCount = posField.length / 3;

  const worldDigest = computeStateDigest(
    { fieldNames: ['vista_position', 'vista_normal'], getField: (n) => Float32Array.from(n === 'vista_normal' ? normField : posField) },
    'sha256',
  );

  // ── VISIBLE previews: grayscale depth + RGB-encoded normals (upscaled) ──────
  const depthRgb = Buffer.alloc(dW * dH * 3);
  for (let i = 0; i < depthMap.length; i++) {
    const g = depthRange > 0 ? Math.round(((depthMap[i] - dMin) / depthRange) * 255) : 0; // near=bright
    depthRgb[i * 3] = g; depthRgb[i * 3 + 1] = g; depthRgb[i * 3 + 2] = g;
  }
  const normRgb = Buffer.alloc(dW * dH * 3);
  for (let i = 0; i < dW * dH; i++) {
    normRgb[i * 3] = Math.round((normalMap[i * 3] * 0.5 + 0.5) * 255);
    normRgb[i * 3 + 1] = Math.round((normalMap[i * 3 + 1] * 0.5 + 0.5) * 255);
    normRgb[i * 3 + 2] = Math.round((normalMap[i * 3 + 2] * 0.5 + 0.5) * 255);
  }
  const depthUp = upscale(depthRgb, dW, dH, SCALE);
  const normUp = upscale(normRgb, dW, dH, SCALE);

  const world = {
    schema: 'gold-game-image-to-world-v1',
    pipeline: 'Gate-32 HoloGram image-to-world (generalized for any image)',
    source_image: resolvedImage,
    name,
    inference: { grid: `${GRID_W}x${GRID_H}`, detectedBackend: backend, neuralPipelineLoaded, actualDepthPath: depthPath, depthMin: +dMin.toFixed(4), depthMax: +dMax.toFixed(4), depthRange: +depthRange.toFixed(4), normalsMatch },
    generated_group: {
      spatial_group: name + 'Backdrop',
      origin: [BACKDROP.originX, BACKDROP.originY, BACKDROP.originZ],
      geometry: 'depth_displaced_grid',
      grid: { width: dW, height: dH },
      vertexCount,
      sampleVertices,
      depthGrid: { width: dW, height: dH, depths: Array.from(depthMap, (d) => +d.toFixed(4)), backdrop: { ...BACKDROP } },
    },
    contract: { spine: 'REAL computeStateDigest(field-bag, sha256)', worldDigest },
    previews: { depth: `${name}-depth.png`, normals: `${name}-normals.png` },
  };

  await fs.mkdir(outDir, { recursive: true });
  const worldOut = path.join(outDir, `${name}-world.json`);
  const depthOut = path.join(outDir, `${name}-depth.png`);
  const normOut = path.join(outDir, `${name}-normals.png`);
  const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
  const depthPng = encodePng(depthUp.buf, depthUp.W, depthUp.H);
  const normPng = encodePng(normUp.buf, normUp.W, normUp.H);
  await fs.writeFile(worldOut, JSON.stringify(world, null, 2) + '\n');
  await fs.writeFile(depthOut, depthPng);
  await fs.writeFile(normOut, normPng);

  console.log(`image-to-world: ${path.basename(resolvedImage)} → "${name}"`);
  console.log(`  depth path:   ${depthPath}  (backend=${backend}, neural=${neuralPipelineLoaded})`);
  console.log(`  depth range:  ${(+depthRange.toFixed(4))}  (min ${(+dMin.toFixed(4))}, max ${(+dMax.toFixed(4))})  normalsMatch=${normalsMatch}`);
  console.log(`  world:        ${vertexCount} vertices, group "${name}Backdrop"`);
  console.log(`  worldDigest:  ${worldDigest}`);
  console.log(`  WORLD  ->     ${worldOut}`);
  console.log(`  DEPTH  ->     ${depthOut}  (${depthUp.W}x${depthUp.H}, sha ${sha(depthPng)})`);
  console.log(`  NORMALS ->    ${normOut}  (${normUp.W}x${normUp.H}, sha ${sha(normPng)})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
