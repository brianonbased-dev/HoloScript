// CpuPathTracer — SOVEREIGN CPU compute fallback for offline rendering (audit gap #5).
//
// WebGPU / desktop-gpu / pathtrace all need a GPU. This runs the SAME path-tracing
// algorithm on the CPU in pure TypeScript — so an offline render works with NO GPU: on a
// server, in CI, on an old device, anywhere Node/JS runs. It is a compute BACKEND (it
// executes), not a code emitter; it shares extractRaytraceScene with the GPU path tracer
// so the two render the same scene. Correctness over speed — the fallback's job is to
// produce the right image everywhere, not to be fast.
//
// Ships its own tiny PNG encoder (deflate via node:zlib) so it has zero runtime deps.

import { deflateSync } from 'node:zlib';
import type { HoloComposition } from '../parser/HoloCompositionTypes';
import { extractRaytraceScene, type RayPrim, type RayScene } from './render-modules/raytrace-scene';

export interface CpuRenderOptions {
  width?: number;
  height?: number;
  samples?: number;
  bounces?: number;
}

export interface CpuImage {
  width: number;
  height: number;
  /** Tonemapped 8-bit RGBA, length = width*height*4. */
  pixels: Uint8Array;
}

type V3 = [number, number, number];

export class CpuPathTracer {
  render(composition: HoloComposition, opts: CpuRenderOptions = {}): CpuImage {
    const width = opts.width ?? 480;
    const height = opts.height ?? 360;
    const samples = opts.samples ?? 32;
    const bounces = opts.bounces ?? 5;
    const scene = extractRaytraceScene(composition, { width, height });
    const { camera: cam, sky } = scene;
    const pixels = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Per-pixel PCG state (deterministic → reproducible renders).
        let rng = (x * 1973 + y * 9277 + 26699) >>> 0;
        rng |= 1;
        const rand = (): number => {
          rng = (Math.imul(rng, 747796405) + 2891336453) >>> 0;
          let w = Math.imul((rng >>> ((rng >>> 28) + 4)) ^ rng, 277803737) >>> 0;
          w = (w >>> 22) ^ w;
          return (w >>> 0) / 4294967295;
        };
        let ar = 0,
          ag = 0,
          ab = 0;
        for (let s = 0; s < samples; s++) {
          const jx = rand();
          const jy = rand();
          const px = ((2 * (x + jx)) / width - 1) * cam.tanf * cam.aspect;
          const py = (1 - (2 * (y + jy)) / height) * cam.tanf;
          const dir = norm([
            cam.fwd[0] + cam.right[0] * px + cam.up[0] * py,
            cam.fwd[1] + cam.right[1] * px + cam.up[1] * py,
            cam.fwd[2] + cam.right[2] * px + cam.up[2] * py,
          ]);
          const rad = this.trace(cam.eye, dir, sky, scene, bounces, rand);
          ar += rad[0];
          ag += rad[1];
          ab += rad[2];
        }
        const inv = 1 / samples;
        const idx = (y * width + x) * 4;
        pixels[idx] = this.tonemap(ar * inv);
        pixels[idx + 1] = this.tonemap(ag * inv);
        pixels[idx + 2] = this.tonemap(ab * inv);
        pixels[idx + 3] = 255;
      }
    }
    return { width, height, pixels };
  }

  private trace(
    roIn: V3,
    rdIn: V3,
    sky: V3,
    scene: RayScene,
    bounces: number,
    rand: () => number
  ): V3 {
    let ro = roIn;
    let rd = rdIn;
    let tr: V3 = [1, 1, 1];
    let rad: V3 = [0, 0, 0];
    const prims = scene.prims;
    for (let bounce = 0; bounce < bounces; bounce++) {
      let best = 1e30;
      let hit = -1;
      for (let i = 0; i < prims.length; i++) {
        const pr = prims[i];
        const t = pr.kind === 0 ? hitSphere(ro, rd, pr.a, best) : hitBox(ro, rd, pr.a, pr.b, best);
        if (t > 0 && t < best) {
          best = t;
          hit = i;
        }
      }
      if (hit < 0) {
        rad = [rad[0] + tr[0] * sky[0], rad[1] + tr[1] * sky[1], rad[2] + tr[2] * sky[2]];
        break;
      }
      const pr = prims[hit];
      const p: V3 = [ro[0] + rd[0] * best, ro[1] + rd[1] * best, ro[2] + rd[2] * best];
      let n: V3 =
        pr.kind === 0
          ? norm([p[0] - pr.a[0], p[1] - pr.a[1], p[2] - pr.a[2]])
          : boxNormal(p, pr.a, pr.b);
      if (dot(n, rd) > 0) n = [-n[0], -n[1], -n[2]];
      rad = [
        rad[0] + tr[0] * pr.emissive[0],
        rad[1] + tr[1] * pr.emissive[1],
        rad[2] + tr[2] * pr.emissive[2],
      ];
      tr = [tr[0] * pr.albedo[0], tr[1] * pr.albedo[1], tr[2] * pr.albedo[2]];
      ro = [p[0] + n[0] * 0.001, p[1] + n[1] * 0.001, p[2] + n[2] * 0.001];
      rd = cosineDir(n, rand);
    }
    return rad;
  }

  private tonemap(v: number): number {
    const m = v / (1 + v); // Reinhard
    const g = Math.pow(m, 1 / 2.2); // gamma 2.2
    return Math.max(0, Math.min(255, Math.round(g * 255)));
  }

  /** Encode a CpuImage as a PNG (Node, via zlib). Zero third-party deps. */
  static toPNG(img: CpuImage): Uint8Array {
    const { width, height, pixels } = img;
    // Raw = per-row filter byte (0) + RGBA row.
    const raw = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
      const ro = y * (1 + width * 4);
      raw[ro] = 0;
      pixels.subarray(y * width * 4, (y + 1) * width * 4).forEach((b, i) => {
        raw[ro + 1 + i] = b;
      });
    }
    const idat = deflateSync(raw);
    const chunk = (type: string, data: Buffer): Buffer => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length, 0);
      const typeBuf = Buffer.from(type, 'ascii');
      const body = Buffer.concat([typeBuf, data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(body) >>> 0, 0);
      return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    return new Uint8Array(
      Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
    );
  }
}

// ── ray-primitive intersection (ports of the WGSL) ─────────────────────────────
function hitSphere(ro: V3, rd: V3, a: number[], tmax: number): number {
  const oc: V3 = [ro[0] - a[0], ro[1] - a[1], ro[2] - a[2]];
  const b = dot(oc, rd);
  const cc = dot(oc, oc) - a[3] * a[3];
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0.001) t = -b + s;
  if (t < 0.001 || t > tmax) return -1;
  return t;
}
function hitBox(ro: V3, rd: V3, mn: number[], mx: number[], tmax: number): number {
  let tn = -1e30;
  let tf = 1e30;
  for (let i = 0; i < 3; i++) {
    const inv = 1 / rd[i];
    let t0 = (mn[i] - ro[i]) * inv;
    let t1 = (mx[i] - ro[i]) * inv;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    tn = Math.max(tn, t0);
    tf = Math.min(tf, t1);
  }
  if (tf < tn || tf < 0.001) return -1;
  let t = tn;
  if (t < 0.001) t = tf;
  if (t > tmax) return -1;
  return t;
}
function boxNormal(p: V3, mn: number[], mx: number[]): V3 {
  const cx = (mn[0] + mx[0]) / 2,
    cy = (mn[1] + mx[1]) / 2,
    cz = (mn[2] + mx[2]) / 2;
  const dx = (mx[0] - mn[0]) / 2 || 1e-6,
    dy = (mx[1] - mn[1]) / 2 || 1e-6,
    dz = (mx[2] - mn[2]) / 2 || 1e-6;
  const rx = (p[0] - cx) / dx,
    ry = (p[1] - cy) / dy,
    rz = (p[2] - cz) / dz;
  const ax = Math.abs(rx),
    ay = Math.abs(ry),
    az = Math.abs(rz);
  if (ax > ay && ax > az) return [Math.sign(rx), 0, 0];
  if (ay > az) return [0, Math.sign(ry), 0];
  return [0, 0, Math.sign(rz)];
}
function cosineDir(n: V3, rand: () => number): V3 {
  const u1 = rand();
  const u2 = rand();
  const r = Math.sqrt(u1);
  const theta = 6.2831853 * u2;
  const x = r * Math.cos(theta);
  const y = r * Math.sin(theta);
  const z = Math.sqrt(Math.max(0, 1 - u1));
  const t: V3 = Math.abs(n[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
  const b1 = norm(cross(t, n));
  const b2 = cross(n, b1);
  return norm([
    b1[0] * x + b2[0] * y + n[0] * z,
    b1[1] * x + b2[1] * y + n[1] * z,
    b1[2] * x + b2[2] * y + n[2] * z,
  ]);
}
function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

// CRC-32 (PNG polynomial) for chunk checksums.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Re-export the prim type so consumers can inspect the traced scene.
export type { RayPrim };
