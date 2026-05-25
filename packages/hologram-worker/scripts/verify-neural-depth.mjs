#!/usr/bin/env node
/**
 * verify-neural-depth.mjs — FALSIFIABLE proof that the HoloGram Node depth path
 * runs REAL Depth-Anything-V2 ONNX inference, not the luminance fallback.
 *
 * Deep-ratchet (2026-05-24) found gate-32 honestly runs the luminance heuristic
 * because no ONNX model was provisioned. This proves the neural path now engages
 * and is genuinely different from luminance — the tautology guard a green check
 * alone cannot give.
 *
 * Method: resize a real image to a fixed grid, run inferDepthForRaster twice on
 * the SAME input — once with the provisioned model (neural), once forced to
 * luminance — and assert the two depth maps materially diverge. If "neural" were
 * a relabeled luminance map, MAE -> 0 and correlation -> 1 and this FAILS.
 *
 *   node packages/hologram-worker/scripts/verify-neural-depth.mjs
 *   (provision the model first: node .../provision-depth-model.mjs)
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

const { inferDepthForRaster, resolveDepthModelPath } = await import(
  pathToFileURL(join(here, '..', 'src', 'depth-infer.ts')).href
);

const W = 256;
const H = 192;
const IMG = process.argv[2] ?? join(repoRoot, 'examples', 'gold-game', 'assets', 'gold-vault-vista-wlNgg.jpg');

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    cov += da * db; va += da * da; vb += db * db;
  }
  const denom = Math.sqrt(va * vb) || 1e-12;
  return cov / denom;
}

function mae(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s / n;
}

async function main() {
  const modelPath = resolveDepthModelPath();
  const checks = [];
  const check = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail }); };

  check('Depth-Anything-V2 ONNX model is provisioned', !!modelPath, modelPath ?? 'NOT FOUND — run provision-depth-model.mjs');
  if (!modelPath) { report(checks); process.exit(2); }

  // Normalize the input to a fixed PNG grid so both backends consume identical pixels.
  const tmp = mkdtempSync(join(tmpdir(), 'holo-depth-'));
  const pngPath = join(tmp, 'input.png');
  await sharp(IMG).resize(W, H, { fit: 'fill' }).png().toFile(pngPath);

  delete process.env.HOLOGRAM_WORKER_DEPTH_BACKEND;
  const neural = await inferDepthForRaster(pngPath, W, H, 'image');

  process.env.HOLOGRAM_WORKER_DEPTH_BACKEND = 'luminance';
  const lum = await inferDepthForRaster(pngPath, W, H, 'image');
  delete process.env.HOLOGRAM_WORKER_DEPTH_BACKEND;

  const m = mae(neural.depthMap, lum.depthMap);
  const r = pearson(neural.depthMap, lum.depthMap);

  let nMin = Infinity, nMax = -Infinity;
  for (const v of neural.depthMap) { if (v < nMin) nMin = v; if (v > nMax) nMax = v; }

  check('neural backend ran onnxruntime-node', neural.backend === 'onnxruntime-node', `backend=${neural.backend}`);
  check('luminance control ran cpu backend', lum.backend === 'cpu', `backend=${lum.backend}`);
  check('neural depth has real dynamic range', nMax - nMin > 0.05, `range=${(nMax - nMin).toFixed(4)}`);
  // FALSIFIABLE: a relabeled-luminance "neural" map would have MAE~0, corr~1.
  check('neural depth MATERIALLY differs from luminance (MAE)', m > 0.02, `MAE=${m.toFixed(4)} (threshold 0.02)`);
  check('neural depth is NOT a relabeled luminance map (corr < 0.98)', r < 0.98, `pearson=${r.toFixed(4)}`);

  report(checks);
  process.exit(checks.every((c) => c.pass) ? 0 : 1);
}

function report(checks) {
  process.stdout.write('\n  HoloGram neural depth verification\n\n');
  for (const c of checks) {
    process.stdout.write(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}\n`);
  }
  const passed = checks.filter((c) => c.pass).length;
  process.stdout.write(`\n  ${passed}/${checks.length} checks pass — ${passed === checks.length ? 'NEURAL DEPTH REAL' : 'FAIL'}\n`);
}

main().catch((err) => {
  process.stderr.write(`verify-neural-depth ERROR: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
