#!/usr/bin/env tsx
/**
 * fuse-depthprobe-to-ply — sovereign $0 depth-fusion of a depthprobe sweep into a 3DGS .ply.
 *
 * Each depthprobe frame carries: a full-res JPEG, a 160x90 depth grid (mm), an ARCore camera->world
 * pose (column-major 4x4), and shared camera intrinsics. We back-project every depth pixel through the
 * pose, color it from the (downscaled) JPEG, and emit one Gaussian per point -> a real colored cloud of
 * the captured scene. No GPU, no iterative training, no paid service — pure CPU from data we have.
 *
 *   Run:  npx tsx apps/quest-universal-qr-scanner/scripts/fuse-depthprobe-to-ply.mts <manifest.json> <out.ply> [stride]
 *
 * Output .ply matches GaussianPlyLoader's decode exactly (inria layout, 14 floats, no normals):
 *   scale stored log, opacity stored logit, color stored as SH-DC ((c-0.5)/C0), rot (w,x,y,z) normalized.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { loadGaussianPly } from '../../../packages/engine/src/gpu/GaussianPlyLoader';

const C0 = 0.28209479177387814;
const logit = (p: number) => Math.log(p / (1 - p));

async function main() {
  const manifestPath = process.argv[2] || 'C:/tmp/sweep-manifest.json';
  const outPath = process.argv[3] || 'C:/tmp/s23-improved.ply';
  const stride = process.argv[4] ? parseInt(process.argv[4], 10) : 3;
  const DEPTH_MIN = 0.15;                                              // m — reject too-near noise
  const DEPTH_MAX = process.argv[5] ? parseFloat(process.argv[5]) : 8; // m — reject far/invalid depth that explodes the bbox

  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const baseDir = dirname(manifestPath);
  const { imageWidth, imageHeight, fx, fy, cx, cy } = m.intrinsics;
  const DW = m.frames[0].depthWidth, DH = m.frames[0].depthHeight;
  // intrinsics scaled to depth resolution
  const sxk = DW / imageWidth, syk = DH / imageHeight;
  const fxd = fx * sxk, fyd = fy * syk, cxd = cx * sxk, cyd = cy * syk;

  const OPACITY = 0.9, SCALE = 0.02;
  const fdcStore = (c: number) => (c - 0.5) / C0;           // inverse of color = 0.5 + C0*f_dc
  const opStore = logit(OPACITY);
  const scStore = Math.log(SCALE);

  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  const r: number[] = [], g: number[] = [], b: number[] = [];

  for (const f of m.frames) {
    const depth: number[] = f.depthMillimeters;
    const P: number[] = f.cameraTransformColumnMajor4x4; // column-major camera->world
    // downscale the HD frame to the depth grid so depth pixel (u,v) == color pixel (u,v)
    const rgb = await sharp(join(baseDir, f.jpeg)).resize(DW, DH, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    for (let v = 0; v < DH; v++) {
      for (let u = 0; u < DW; u++) {
        const di = v * DW + u;
        if ((di % stride) !== 0) continue;
        const dmm = depth[di];
        if (!dmm || dmm <= 0) continue;
        const d = dmm / 1000; // meters
        if (d < DEPTH_MIN || d > DEPTH_MAX) continue; // drop near-noise + far/invalid (bbox explosion)
        // pinhole back-projection in ARCore camera space: +X right, +Y up, -Z forward
        const Xc = (u - cxd) * d / fxd;
        const Yc = (cyd - v) * d / fyd; // image y is down, camera y is up
        const Zc = -d;                   // camera looks down -Z
        // world = pose * [Xc,Yc,Zc,1] (column-major)
        const wx = P[0] * Xc + P[4] * Yc + P[8] * Zc + P[12];
        const wy = P[1] * Xc + P[5] * Yc + P[9] * Zc + P[13];
        const wz = P[2] * Xc + P[6] * Yc + P[10] * Zc + P[14];
        xs.push(wx); ys.push(wy); zs.push(wz);
        const ci = di * 3;
        r.push(rgb[ci] / 255); g.push(rgb[ci + 1] / 255); b.push(rgb[ci + 2] / 255);
      }
    }
  }

  const N = xs.length;
  if (N === 0) { console.error('[fuse] no points produced'); process.exit(1); }

  // ── write binary-LE 3DGS .ply (14 floats/vertex, no normals) ──
  const props = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
  const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${N}\n` +
    props.map(p => `property float ${p}`).join('\n') + '\nend_header\n';
  const headerBuf = Buffer.from(header, 'ascii');
  const body = Buffer.alloc(N * props.length * 4);
  let o = 0;
  const put = (val: number) => { body.writeFloatLE(val, o); o += 4; };
  for (let i = 0; i < N; i++) {
    put(xs[i]); put(ys[i]); put(zs[i]);
    put(fdcStore(r[i])); put(fdcStore(g[i])); put(fdcStore(b[i]));
    put(opStore);
    put(scStore); put(scStore); put(scStore);
    put(1); put(0); put(0); put(0); // rot (w,x,y,z) identity
  }
  const ply = Buffer.concat([headerBuf, body]);
  writeFileSync(outPath, ply);

  // ── verify via the repo loader + report bbox ──
  const g3 = loadGaussianPly(new Uint8Array(ply));
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < g3.N; i++) {
    minX = Math.min(minX, g3.x[i]); maxX = Math.max(maxX, g3.x[i]);
    minY = Math.min(minY, g3.y[i]); maxY = Math.max(maxY, g3.y[i]);
    minZ = Math.min(minZ, g3.z[i]); maxZ = Math.max(maxZ, g3.z[i]);
  }
  console.log(`[fuse] frames=${m.frames.length} stride=${stride} -> ${N.toLocaleString()} gaussians, ${(ply.length / 1e6).toFixed(1)} MB`);
  console.log(`[fuse] loader round-trip: parsed N=${g3.N}`);
  console.log(`[fuse] bbox extent (m): ${(maxX - minX).toFixed(2)} x ${(maxY - minY).toFixed(2)} x ${(maxZ - minZ).toFixed(2)}`);
  console.log(`[fuse] sample pos[0]=(${g3.x[0].toFixed(2)},${g3.y[0].toFixed(2)},${g3.z[0].toFixed(2)}) color0=(${g3.r[0].toFixed(2)},${g3.gr[0].toFixed(2)},${g3.bl[0].toFixed(2)})`);
  console.log(`[fuse] wrote ${outPath}`);
}

main().catch(e => { console.error('[fuse] failed:', e); process.exit(1); });
