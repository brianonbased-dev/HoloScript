// MediaPipelineCompiler — SOVEREIGN video / media-pipeline target (audit gap: media).
//
// WebGPU renders single frames; there was no path from a .holo to a moving picture. This
// is the media pipeline: it renders an animated TURNTABLE of the scene (camera orbiting
// the auto-framed bounds) as a frame sequence on the CPU, then encodes the frames to an
// APNG — a real animated media file — with our OWN encoder (no ffmpeg / codec / muxer
// dependency; pure TypeScript + node:zlib). Runs anywhere Node runs; fully verifiable.
//
// A fast flat projector (project → painter-sort → shaded filled shapes) is used per frame
// so a many-frame turntable stays quick; it consumes the SAME shared raytrace-scene
// extraction (geometry-registry primitives + geometry-purpose visibility + skybox), so a
// media clip shows exactly what the renderers show. (Browser-native WebCodecs H.264/WebM
// encoding is the natural follow-on; APNG is the sovereign, dependency-free core.)

import { deflateSync } from 'node:zlib';
import type { HoloComposition } from '../parser/HoloCompositionTypes';
import { extractRaytraceScene, type RayPrim } from './render-modules/raytrace-scene';

export interface MediaOptions {
  width?: number;
  height?: number;
  frames?: number;
  fps?: number;
}

export interface MediaClip {
  width: number;
  height: number;
  fps: number;
  /** One tonemapped RGBA buffer per frame. */
  frames: Uint8Array[];
}

type V3 = [number, number, number];

export class MediaPipelineCompiler {
  render(composition: HoloComposition, opts: MediaOptions = {}): MediaClip {
    const width = opts.width ?? 480;
    const height = opts.height ?? 360;
    const nframes = opts.frames ?? 36;
    const fps = opts.fps ?? 18;
    const { prims, sky } = extractRaytraceScene(composition, { width, height });

    // Scene bounds → orbit centre + radius.
    const centers = prims.map((p) =>
      p.kind === 0
        ? ([p.a[0], p.a[1], p.a[2]] as V3)
        : ([(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2] as V3)
    );
    const center: V3 = [0, 0, 0];
    let radius = 3;
    if (centers.length > 0) {
      const min: V3 = [Infinity, Infinity, Infinity];
      const max: V3 = [-Infinity, -Infinity, -Infinity];
      for (const c of centers)
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], c[i]);
          max[i] = Math.max(max[i], c[i]);
        }
      for (let i = 0; i < 3; i++) center[i] = (min[i] + max[i]) / 2;
      radius = 1;
      for (const c of centers)
        radius = Math.max(
          radius,
          Math.hypot(c[0] - center[0], c[1] - center[1], c[2] - center[2]) + 1.5
        );
    }
    const fov = 50;
    const tanf = Math.tan((fov * Math.PI) / 180 / 2);
    const dist = (radius / Math.sin((fov * Math.PI) / 180 / 2)) * 1.25;
    const bg: V3 = [sky[0], sky[1], sky[2]];

    const frames: Uint8Array[] = [];
    for (let f = 0; f < nframes; f++) {
      const ang = (2 * Math.PI * f) / nframes;
      const eye: V3 = [
        center[0] + Math.sin(ang) * dist,
        center[1] + dist * 0.35,
        center[2] + Math.cos(ang) * dist,
      ];
      frames.push(this.renderFrame(width, height, prims, eye, center, tanf, bg));
    }
    return { width, height, fps, frames };
  }

  // Fast flat projector: project each primitive's centre, painter-sort back-to-front,
  // draw a shaded filled disc (sphere) or square (box) sized by world radius / distance.
  private renderFrame(
    width: number,
    height: number,
    prims: RayPrim[],
    eye: V3,
    target: V3,
    tanf: number,
    bg: V3
  ): Uint8Array {
    const px = new Uint8Array(width * height * 4);
    const bgR = to8(bg[0]),
      bgG = to8(bg[1]),
      bgB = to8(bg[2]);
    for (let i = 0; i < width * height; i++) {
      px[i * 4] = bgR;
      px[i * 4 + 1] = bgG;
      px[i * 4 + 2] = bgB;
      px[i * 4 + 3] = 255;
    }
    // Camera basis.
    const fwd = norm([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
    const right = norm(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    const focal = height / 2 / tanf;
    const L = norm([0.4, 0.8, 0.55]); // fixed key light

    type Draw = { sx: number; sy: number; sr: number; z: number; box: boolean; col: V3; emis: V3 };
    const draws: Draw[] = [];
    for (const p of prims) {
      const c: V3 =
        p.kind === 0
          ? [p.a[0], p.a[1], p.a[2]]
          : [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2];
      const wr =
        p.kind === 0
          ? p.a[3]
          : Math.max(
              Math.abs(p.b[0] - p.a[0]),
              Math.abs(p.b[1] - p.a[1]),
              Math.abs(p.b[2] - p.a[2])
            ) * 0.5;
      const rel: V3 = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
      const z = dot(rel, fwd);
      if (z <= 0.05) continue; // behind camera
      const xcam = dot(rel, right);
      const ycam = dot(rel, up);
      const sx = width / 2 + (xcam / z) * focal;
      const sy = height / 2 - (ycam / z) * focal;
      const sr = Math.max(1, (wr / z) * focal);
      draws.push({ sx, sy, sr, z, box: p.kind === 1, col: p.albedo, emis: p.emissive });
    }
    draws.sort((a, b) => b.z - a.z); // far first (painter's)

    for (const d of draws) {
      // Cheap shade: a lambert-ish gradient across the disc + emissive floor.
      const el = clamp01(d.emis[0] + d.emis[1] + d.emis[2] > 0 ? 1 : 0);
      const x0 = Math.max(0, Math.floor(d.sx - d.sr));
      const x1 = Math.min(width - 1, Math.ceil(d.sx + d.sr));
      const y0 = Math.max(0, Math.floor(d.sy - d.sr));
      const y1 = Math.min(height - 1, Math.ceil(d.sy + d.sr));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = (x - d.sx) / d.sr;
          const dy = (y - d.sy) / d.sr;
          const rr = dx * dx + dy * dy;
          if (!d.box && rr > 1) continue; // disc
          if (d.box && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) continue; // square
          // Fake sphere normal for shading (disc → hemisphere).
          let shade = 0.55;
          if (!d.box) {
            const nz = Math.sqrt(Math.max(0, 1 - rr));
            const nrm: V3 = norm([dx, -dy, nz]);
            shade = 0.2 + 0.8 * Math.max(0, dot(nrm, L));
          }
          const r = el > 0 ? d.emis[0] : d.col[0] * shade;
          const g = el > 0 ? d.emis[1] : d.col[1] * shade;
          const b = el > 0 ? d.emis[2] : d.col[2] * shade;
          const idx = (y * width + x) * 4;
          px[idx] = to8(reinhard(r));
          px[idx + 1] = to8(reinhard(g));
          px[idx + 2] = to8(reinhard(b));
          px[idx + 3] = 255;
        }
      }
    }
    return px;
  }

  /** Encode a MediaClip as an APNG (animated PNG) — sovereign, node:zlib only. */
  static toAPNG(clip: MediaClip): Uint8Array {
    const { width, height, fps, frames } = clip;
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const out: Buffer[] = [sig];

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6; // RGBA
    out.push(chunk('IHDR', ihdr));

    const actl = Buffer.alloc(8);
    actl.writeUInt32BE(frames.length, 0);
    actl.writeUInt32BE(0, 4); // num_plays = infinite
    out.push(chunk('acTL', actl));

    let seq = 0;
    const fcTL = (): Buffer => {
      const b = Buffer.alloc(26);
      b.writeUInt32BE(seq++, 0);
      b.writeUInt32BE(width, 4);
      b.writeUInt32BE(height, 8);
      b.writeUInt32BE(0, 12); // x
      b.writeUInt32BE(0, 16); // y
      b.writeUInt16BE(1, 20); // delay_num
      b.writeUInt16BE(fps, 22); // delay_den → delay = 1/fps s
      b[24] = 0; // dispose = none
      b[25] = 0; // blend = source
      return b;
    };
    const compress = (rgba: Uint8Array): Buffer => {
      const raw = Buffer.alloc(height * (1 + width * 4));
      for (let y = 0; y < height; y++) {
        const ro = y * (1 + width * 4);
        raw[ro] = 0;
        Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, ro + 1);
      }
      return deflateSync(raw);
    };

    for (let i = 0; i < frames.length; i++) {
      out.push(chunk('fcTL', fcTL()));
      const data = compress(frames[i]);
      if (i === 0) {
        out.push(chunk('IDAT', data));
      } else {
        const fd = Buffer.alloc(4 + data.length);
        fd.writeUInt32BE(seq++, 0);
        data.copy(fd, 4);
        out.push(chunk('fdAT', fd));
      }
    }
    out.push(chunk('IEND', Buffer.alloc(0)));
    return new Uint8Array(Buffer.concat(out));
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}
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
function reinhard(v: number): number {
  return v / (1 + v);
}
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
function to8(v: number): number {
  const g = Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2);
  return Math.max(0, Math.min(255, Math.round(g * 255)));
}
