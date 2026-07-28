/**
 * splat-render — native WebGPU Gaussian-splat render to verified pixels (render "Part 2").
 *
 * The volumetric sibling of `character-render.ts` (Part 1, rasterized skinned mesh): packs raw
 * Gaussian splats into the sorter's `SplatRaw` layout, drives the existing Paper-grade
 * `GaussianSplatSorter` (depth-sort → EWA splat raster) on a live GPUDevice, and reads pixels
 * back. This is the photoreal "skin/mesh upgrade" route for a character — a splat cloud trained
 * from capture renders as the same entity the rasterized mesh represents.
 *
 * NO Three.js, NO R3F. Like character-render, this is BOTH a production render entry AND the
 * headless verification/fallback floor (G.GOLD.006): it runs under Dawn in CI and on a real
 * browser device identically. It reuses the sorter unchanged except for two additive seams
 * (`GaussianSplatSorter.fromDevice` + the `renderFormat` option) so the trained splat pipeline
 * is not forked.
 *
 * @module native-render/splat-render
 */

import { GaussianSplatSorter, type CameraState } from '../gpu/GaussianSplatSorter';
import type { Gaussian3D } from '../gpu/GaussianTrainer3D';
import type { GaussianSplatData } from '../gpu/codecs/types';
import type { PixelGrid } from './gpu-verify';

// WebGPU flag values (numeric — avoids global-availability deps; matches character-render.ts).
const TEX_RENDER_ATTACHMENT = 0x10;
const TEX_COPY_SRC = 0x01;
const BUF_COPY_DST = 0x0008;
const BUF_MAP_READ = 0x0001;
const MAP_READ = 0x0001;

/** A single Gaussian splat in world space (the high-level input to {@link packRawSplats}). */
export interface RawSplatInput {
  /** World-space center. */
  position: [number, number, number];
  /** LINEAR per-axis scale (already exponentiated from the trained log-scale). */
  scale: [number, number, number];
  /** Orientation quaternion in (w, x, y, z) order. */
  rotation: [number, number, number, number];
  /** RGBA in 0..1; `a` is opacity. */
  color: [number, number, number, number];
}

/** Floats per splat in the sorter's 64-byte `SplatRaw` std-layout (see GaussianSplatSorter). */
const FLOATS_PER_RAW_SPLAT = 16;

/**
 * Pack high-level splats into the GPU `SplatRaw` buffer layout the sorter's compress pass reads
 * (64 bytes / 16 floats per splat, vec3 fields followed by 4 bytes of std-layout padding):
 *   pos@0 (+pad@3), scale@4 (+pad@7), rotation@8 (w,x,y,z), color@12 (rgba).
 * Returns an `ArrayBuffer`-backed Float32Array so it is a valid `writeBuffer` source.
 */
export function packRawSplats(splats: readonly RawSplatInput[]): Float32Array<ArrayBuffer> {
  const out = new Float32Array(splats.length * FLOATS_PER_RAW_SPLAT);
  for (let i = 0; i < splats.length; i++) {
    const s = splats[i];
    const o = i * FLOATS_PER_RAW_SPLAT;
    out[o + 0] = s.position[0];
    out[o + 1] = s.position[1];
    out[o + 2] = s.position[2];
    // out[o + 3] padding
    out[o + 4] = s.scale[0];
    out[o + 5] = s.scale[1];
    out[o + 6] = s.scale[2];
    // out[o + 7] padding
    out[o + 8] = s.rotation[0];
    out[o + 9] = s.rotation[1];
    out[o + 10] = s.rotation[2];
    out[o + 11] = s.rotation[3];
    out[o + 12] = s.color[0];
    out[o + 13] = s.color[1];
    out[o + 14] = s.color[2];
    out[o + 15] = s.color[3];
  }
  return out;
}

/**
 * Adapt the trainer / PLY-loader `Gaussian3D` SoA buffers (the `loadGaussianPly` output, the
 * decode proven correct against real captures) into render-input splats. `Gaussian3D` already
 * uses this pipeline's conventions: LINEAR scale, `(w,x,y,z)` quaternion, `[0,1]` color+opacity —
 * so this is a straight per-splat gather, no convention conversion.
 */
export function gaussian3DToSplats(g: Gaussian3D): RawSplatInput[] {
  const out: RawSplatInput[] = new Array(g.N);
  for (let i = 0; i < g.N; i++) {
    out[i] = {
      position: [g.x[i], g.y[i], g.z[i]],
      scale: [g.sx[i], g.sy[i], g.sz[i]],
      rotation: [g.qr[i], g.qx[i], g.qy[i], g.qz[i]],
      color: [g.r[i], g.gr[i], g.bl[i], g.op[i]],
    };
  }
  return out;
}

/**
 * Adapt the codec interchange format (`GaussianSplatData` — the `GltfGaussianSplatCodec` /
 * KHR_gaussian_splatting / SPZ decode target) into render-input splats. Two conventions differ
 * from this pipeline and are converted here: codec rotations are `(x,y,z,w)` → reordered to
 * `(w,x,y,z)`, and opacity is the dedicated `opacities[i]` (used as the splat's alpha). Scales are
 * already LINEAR (the codec exponentiates KHR log-space scales on decode).
 */
export function gaussianSplatDataToSplats(d: GaussianSplatData): RawSplatInput[] {
  const out: RawSplatInput[] = new Array(d.count);
  for (let i = 0; i < d.count; i++) {
    out[i] = {
      position: [d.positions[i * 3], d.positions[i * 3 + 1], d.positions[i * 3 + 2]],
      scale: [d.scales[i * 3], d.scales[i * 3 + 1], d.scales[i * 3 + 2]],
      // codec (x,y,z,w) → SplatRaw (w,x,y,z)
      rotation: [
        d.rotations[i * 4 + 3],
        d.rotations[i * 4],
        d.rotations[i * 4 + 1],
        d.rotations[i * 4 + 2],
      ],
      color: [d.colors[i * 4], d.colors[i * 4 + 1], d.colors[i * 4 + 2], d.opacities[i]],
    };
  }
  return out;
}

/**
 * Default headless camera that frames splats placed at positive camera-space Z. The splat
 * pipeline treats `depth = (view·pos).z` and culls `depth < 0.01` to the back, so the view is
 * identity (camera at the origin looking down +Z) and the projection is a +Z-forward perspective
 * (`clip.w = z_eye`). Square `size`, `fovYDeg` vertical FoV. focalX/Y are derived so the compress
 * pass recovers the same FoV (`tanFov = 0.5·dim / focal`).
 */
export function defaultSplatCamera(size: number, fovYDeg = 60): CameraState {
  const fovY = (fovYDeg * Math.PI) / 180;
  const tanFov = Math.tan(fovY / 2);
  const f = 1 / tanFov;
  const aspect = 1;

  // Column-major (index = col*4 + row). +Z-forward: row3 of col2 = 1 → clip.w = z_eye.
  const proj = new Float32Array(16) as Float32Array<ArrayBuffer>;
  proj[0] = f / aspect; // ndc.x = (f/aspect)·x / z
  proj[5] = f; // ndc.y = f·y / z
  // clip.z = 0.5·(input w = 1) → ndc.z = 0.5 / z_eye, safely inside [0,1] (avoids far-plane
  // clipping). depthCompare is 'always', so the exact value only needs to stay in-frustum.
  proj[14] = 0.5; // col3 row2
  proj[11] = 1; // col2 row3 → clip.w = z_eye (positive in front)

  const view = new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ]) as Float32Array<ArrayBuffer>;
  const focal = (0.5 * size) / tanFov;

  return {
    viewMatrix: view,
    projMatrix: proj,
    viewProjectionMatrix: proj, // view is identity → VP = P
    cameraPosition: [0, 0, 0],
    focalX: focal,
    focalY: focal,
  };
}

export interface SplatRenderOptions {
  /** Square framebuffer edge (default 128 → bytesPerRow 512, 256-aligned). */
  size?: number;
  /** Camera override; defaults to {@link defaultSplatCamera}. */
  camera?: CameraState;
  /** Clear RGBA, 0..1 (default opaque black). */
  clear?: [number, number, number, number];
  /** Vertical FoV in degrees for the default camera (ignored when `camera` is given). */
  fovYDeg?: number;
}

/**
 * Render depth-sorted Gaussian splats to an offscreen rgba8unorm texture and read the pixels
 * back. Builds a `GaussianSplatSorter` over the given device (`fromDevice`, `renderFormat`
 * matched to the readback texture), uploads the packed splats, runs the full sort+raster frame,
 * then copies the color attachment to a mappable buffer.
 */
export async function renderSplats(
  device: GPUDevice,
  splats: readonly RawSplatInput[],
  opts: SplatRenderOptions = {}
): Promise<PixelGrid> {
  const size = opts.size ?? 128;
  const clear = opts.clear ?? [0, 0, 0, 1];
  const camera = opts.camera ?? defaultSplatCamera(size, opts.fovYDeg);
  const count = splats.length;

  const sorter = GaussianSplatSorter.fromDevice(device, {
    maxSplats: Math.max(count, 1),
    canvasWidth: size,
    canvasHeight: size,
    renderFormat: 'rgba8unorm',
  });
  await sorter.initialize();
  sorter.uploadSplatData(packRawSplats(splats), count);

  const color = device.createTexture({
    size: [size, size],
    format: 'rgba8unorm',
    usage: TEX_RENDER_ATTACHMENT | TEX_COPY_SRC,
  });
  const depth = device.createTexture({
    size: [size, size],
    format: 'depth24plus',
    usage: TEX_RENDER_ATTACHMENT,
  });

  // sort + raster + submit (the sorter owns its command encoder).
  sorter.frame(camera, color.createView(), depth.createView(), {
    r: clear[0],
    g: clear[1],
    b: clear[2],
    a: clear[3],
  });

  // Read the rendered pixels back (separate encoder; queue ordering runs it after the frame).
  const bytesPerRow = size * 4;
  const readback = device.createBuffer({
    size: bytesPerRow * size,
    usage: BUF_COPY_DST | BUF_MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer(
    { texture: color },
    { buffer: readback, bytesPerRow, rowsPerImage: size },
    { width: size, height: size, depthOrArrayLayers: 1 }
  );
  device.queue.submit([encoder.finish()]);

  await readback.mapAsync(MAP_READ);
  const data = new Uint8Array(readback.getMappedRange().slice(0));
  readback.unmap();

  readback.destroy();
  color.destroy();
  depth.destroy();
  sorter.destroy();

  return { width: size, height: size, data };
}
