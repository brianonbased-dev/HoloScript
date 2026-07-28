#!/usr/bin/env tsx
/**
 * transcode-ply-to-spz — the sovereign $0 glue from a trained 3DGS `.ply` to a Quest-ready `.spz`.
 *
 * Decodes a standard inria/gsplat `.ply` (via the engine's GaussianPlyLoader), optionally DECIMATES to
 * the Quest 3 Splat budget (≤150k, keeping the highest-opacity splats — the visible ones), RECENTERS to
 * the world origin (3DGS/COLMAP captures land at arbitrary offsets), maps the SoA Gaussian3D to the
 * codec's interleaved GaussianSplatData (incl. the (w,x,y,z)→(x,y,z,w) quaternion reorder), encodes to
 * Niantic SPZ v3 via our OWN production SpzCodec, round-trips it, and writes the `.spz`.
 *
 *   Run:  npx tsx apps/quest-universal-qr-scanner/scripts/transcode-ply-to-spz.mts <in.ply> <out.spz> [maxSplats]
 *
 * Dogfoods packages/engine (GaussianPlyLoader + SpzCodec) — no third-party tool, no paid service.
 * SPZ is gzip-wrapped, so Node's global CompressionStream is required (Node 18+).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadGaussianPly } from '../../../packages/engine/src/gpu/GaussianPlyLoader';
import { SpzCodec } from '../../../packages/engine/src/gpu/codecs/SpzCodec';
import type { GaussianSplatData } from '../../../packages/engine/src/gpu/codecs/types';

const QUEST_SPLAT_CAP = 150_000;

async function main() {
  const inPath = process.argv[2];
  const outPath = process.argv[3];
  const maxSplats = process.argv[4] ? parseInt(process.argv[4], 10) : 140_000;
  if (!inPath || !outPath) {
    console.error('usage: transcode-ply-to-spz.mts <in.ply> <out.spz> [maxSplats]');
    process.exit(2);
  }

  // ── decode the trained .ply → Gaussian3D (SoA) ────────────────────────────────────────────────
  const g = loadGaussianPly(readFileSync(inPath));
  console.log(`[transcode] decoded ${g.N.toLocaleString()} gaussians from ${inPath}`);

  // ── decimate to the Quest budget: keep the highest-opacity splats (prunes faint floaters) ───────
  const order = Array.from({ length: g.N }, (_, i) => i).sort((a, b) => g.op[b] - g.op[a]);
  const K = Math.min(g.N, maxSplats);
  const keep = order.slice(0, K);
  if (K < g.N)
    console.log(
      `[transcode] decimated ${g.N.toLocaleString()} → ${K.toLocaleString()} (top opacity; Quest cap ${QUEST_SPLAT_CAP.toLocaleString()})`
    );

  // ── recenter to origin + measure extent (captures sit at arbitrary COLMAP offsets) ─────────────
  let cx = 0,
    cy = 0,
    cz = 0;
  for (const i of keep) {
    cx += g.x[i];
    cy += g.y[i];
    cz += g.z[i];
  }
  cx /= K;
  cy /= K;
  cz /= K;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  const positions = new Float32Array(K * 3);
  const scales = new Float32Array(K * 3);
  const rotations = new Float32Array(K * 4);
  const colors = new Float32Array(K * 4);
  const opacities = new Float32Array(K);

  for (let k = 0; k < K; k++) {
    const i = keep[k];
    const px = g.x[i] - cx,
      py = g.y[i] - cy,
      pz = g.z[i] - cz;
    positions[k * 3 + 0] = px;
    positions[k * 3 + 1] = py;
    positions[k * 3 + 2] = pz;
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
    minZ = Math.min(minZ, pz);
    maxZ = Math.max(maxZ, pz);

    // scales are LINEAR out of the loader (it already exp'd the log-scale); SpzCodec log-encodes.
    scales[k * 3 + 0] = g.sx[i];
    scales[k * 3 + 1] = g.sy[i];
    scales[k * 3 + 2] = g.sz[i];

    // loader returns quat (r,x,y,z)=(w,x,y,z); codec expects (x,y,z,w).
    rotations[k * 4 + 0] = g.qx[i];
    rotations[k * 4 + 1] = g.qy[i];
    rotations[k * 4 + 2] = g.qz[i];
    rotations[k * 4 + 3] = g.qr[i];

    // loader returns final RGB in [0..1]; codec applies the SH-DC inverse internally.
    colors[k * 4 + 0] = g.r[i];
    colors[k * 4 + 1] = g.gr[i];
    colors[k * 4 + 2] = g.bl[i];
    colors[k * 4 + 3] = g.op[i];
    opacities[k] = g.op[i];
  }

  const ext = [maxX - minX, maxY - minY, maxZ - minZ];
  console.log(
    `[transcode] pre-recenter centroid (${cx.toFixed(3)}, ${cy.toFixed(3)}, ${cz.toFixed(3)})`
  );
  console.log(
    `[transcode] recentered extent (m, COLMAP units): ${ext.map((e) => e.toFixed(2)).join(' x ')}`
  );

  const data: GaussianSplatData = {
    positions,
    scales,
    rotations,
    colors,
    opacities,
    shDegree: 0,
    count: K,
  };

  // ── encode → round-trip → write ───────────────────────────────────────────────────────────────
  const codec = new SpzCodec();
  const enc = await codec.encode(data, { encodingVersion: 3, shDegree: 0 });
  const bytes = new Uint8Array(enc.data.data);

  const dec = await codec.decode(enc.data.data, { decodeSH: false });
  if (dec.data.count !== K) {
    console.error(`[transcode] ROUND-TRIP FAILED: count ${dec.data.count} != ${K}`);
    process.exit(1);
  }
  let maxPosErr = 0;
  for (let i = 0; i < K * 3; i++)
    maxPosErr = Math.max(maxPosErr, Math.abs(dec.data.positions[i] - positions[i]));

  if (K > QUEST_SPLAT_CAP) {
    console.error(`[transcode] ${K} > Quest cap ${QUEST_SPLAT_CAP}`);
    process.exit(1);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, bytes);
  console.log(
    `[transcode] .spz size ${(bytes.length / 1024).toFixed(1)} KiB; round-trip max pos err ${maxPosErr.toFixed(6)} m`
  );
  console.log(`[transcode] ROUND-TRIP OK ✓  wrote ${outPath}`);
}

main().catch((e) => {
  console.error('[transcode] failed:', e);
  process.exit(1);
});
