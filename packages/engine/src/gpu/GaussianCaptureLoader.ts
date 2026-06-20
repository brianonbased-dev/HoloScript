/**
 * @fileoverview GaussianCaptureLoader — ingest a depthprobe RGBD capture into the native 3DGS trainer.
 *
 * The HoloScript `com.holoscript.depthprobe` mobile app banks a "sweep": N full-res JPEG frames, each
 * with an ARCore camera pose (`cameraTransformColumnMajor4x4`) and a low-res depth map. This module
 * turns that into the trainer's inputs — a depth-fused Gaussian3D INIT (real geometry, not random)
 * and posed TrainViews — closing the last /critic gap (#1b: capture ingestion) on REAL data.
 *
 * THE COORDINATE CONVENTION (the verification-critical part — proven by the round-trip test):
 * ARCore's pose is camera-TO-world in OpenGL convention (camera looks down −Z, +Y up). forward3D wants
 * a CV pinhole: world→camera with +Z forward, +Y down (image v increases downward). The bridge is
 * D = diag(1,−1,−1):
 *   world→CV rotation  Vrow = D · Rᵀ           (R = pose's upper-left 3×3, camera-to-world)
 *   world→CV translation  t  = −Vrow · t_cw     (t_cw = pose's translation column)
 * and depth back-projection inverts it: a CV camera point (X,Y,Z) maps to world via the GL point
 * (X,−Y,−Z): world = R · (X,−Y,−Z) + t_cw.
 *
 * Frame decoding (JPEG → pixels) is injected as a callback so the engine takes no image-codec dep —
 * the caller supplies sharp (Node) or a canvas (browser).
 */

import { type SplatCamera } from './GaussianTrainer3D';
import { type Gaussian3D } from './GaussianTrainer3D';
import { type TrainView } from './GaussianTrainRunner';

/** ARCore camera-image intrinsics (pixels, for the full image resolution). */
export interface CaptureIntrinsics {
  fx: number; fy: number; cx: number; cy: number;
  imageWidth: number; imageHeight: number;
}

/** One banked frame from the depthprobe manifest. */
export interface CaptureFrame {
  index: number;
  /** Column-major 4×4 ARCore camera-to-world transform. */
  cameraTransformColumnMajor4x4: number[];
  depthWidth: number;
  depthHeight: number;
  /** Row-major depth in millimetres, length depthWidth*depthHeight. */
  depthMillimeters: number[];
}

export interface CaptureManifest {
  intrinsics: CaptureIntrinsics;
  frames: CaptureFrame[];
}

/** pose (col-major) → camera-to-world rotation (row-major 3×3) + translation. */
function poseRt(m: ArrayLike<number>): { R: number[]; t: [number, number, number] } {
  return { R: [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]], t: [m[12], m[13], m[14]] };
}

/**
 * Convert an ARCore camera-to-world pose into the trainer's SplatCamera (world→CV pinhole), scaled to
 * a render width (intrinsics scale with resolution; centre-principal stays consistent).
 */
export function cameraFromArcorePose(pose: ArrayLike<number>, intr: CaptureIntrinsics, renderWidth: number): SplatCamera {
  const { R, t } = poseRt(pose);
  const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]; // transpose = world→GL rotation
  const Vrow = [Rt[0], Rt[1], Rt[2], -Rt[3], -Rt[4], -Rt[5], -Rt[6], -Rt[7], -Rt[8]]; // D · Rᵀ
  const tcv: [number, number, number] = [
    -(Vrow[0] * t[0] + Vrow[1] * t[1] + Vrow[2] * t[2]),
    -(Vrow[3] * t[0] + Vrow[4] * t[1] + Vrow[5] * t[2]),
    -(Vrow[6] * t[0] + Vrow[7] * t[1] + Vrow[8] * t[2]),
  ];
  const s = renderWidth / intr.imageWidth;
  return { Vrow, t: tcv, fx: intr.fx * s, fy: intr.fy * s, cx: intr.cx * s, cy: intr.cy * s };
}

/** A back-projected world point with its source depth-pixel (for colour lookup). */
export interface DepthPoint { x: number; y: number; z: number; du: number; dv: number; }

/**
 * Back-project a frame's depth map into world-space points (subsampled by `step`, depth gated to
 * `[minM, maxM]` metres). Uses the full-image intrinsics with depth-pixel→image-pixel scaling.
 */
export function backprojectDepth(
  frame: CaptureFrame, intr: CaptureIntrinsics,
  opts: { step?: number; minM?: number; maxM?: number } = {},
): DepthPoint[] {
  const step = opts.step ?? 3, minM = opts.minM ?? 0.1, maxM = opts.maxM ?? 6;
  const { R, t } = poseRt(frame.cameraTransformColumnMajor4x4);
  const DW = frame.depthWidth, DH = frame.depthHeight;
  const sxImg = intr.imageWidth / DW, syImg = intr.imageHeight / DH;
  const out: DepthPoint[] = [];
  for (let dv = 0; dv < DH; dv += step) for (let du = 0; du < DW; du += step) {
    const z = frame.depthMillimeters[dv * DW + du] / 1000;
    if (!(z > minM && z < maxM)) continue;
    const X = ((du + 0.5) * sxImg - intr.cx) * z / intr.fx;
    const Y = ((dv + 0.5) * syImg - intr.cy) * z / intr.fy;
    // CV (X,Y,Z) → GL (X,−Y,−Z) → world = R·GL + t_cw
    const gx = X, gy = -Y, gz = -z;
    out.push({
      x: R[0] * gx + R[1] * gy + R[2] * gz + t[0],
      y: R[3] * gx + R[4] * gy + R[5] * gz + t[1],
      z: R[6] * gx + R[7] * gy + R[8] * gz + t[2],
      du, dv,
    });
  }
  return out;
}

/** Decode callback: return a frame's RGB as Float64Array (w*h*3, [0,1]). */
export type DecodeFrame = (frameIndex: number, width: number, height: number) => Float64Array;

/**
 * Build a depth-fused Gaussian3D init from all frames: back-project depth, colour each point from the
 * frame (sampled at depth resolution), isotropic small scale, identity rotation, high opacity.
 */
export function captureToGaussianInit(
  manifest: CaptureManifest, decode: DecodeFrame,
  opts: { step?: number; minM?: number; maxM?: number; scale?: number; opacity?: number } = {},
): Gaussian3D {
  const scale = opts.scale ?? 0.012, opacity = opts.opacity ?? 0.8;
  const px: number[] = [], py: number[] = [], pz: number[] = [], pr: number[] = [], pg: number[] = [], pb: number[] = [];
  for (const f of manifest.frames) {
    const rgb = decode(f.index, f.depthWidth, f.depthHeight); // colour sampled at depth res
    for (const p of backprojectDepth(f, manifest.intrinsics, opts)) {
      const o = (p.dv * f.depthWidth + p.du) * 3;
      px.push(p.x); py.push(p.y); pz.push(p.z); pr.push(rgb[o]); pg.push(rgb[o + 1]); pb.push(rgb[o + 2]);
    }
  }
  const N = px.length;
  return {
    N,
    x: Float64Array.from(px), y: Float64Array.from(py), z: Float64Array.from(pz),
    sx: new Float64Array(N).fill(scale), sy: new Float64Array(N).fill(scale), sz: new Float64Array(N).fill(scale),
    qr: new Float64Array(N).fill(1), qx: new Float64Array(N), qy: new Float64Array(N), qz: new Float64Array(N),
    op: new Float64Array(N).fill(opacity),
    r: Float64Array.from(pr), gr: Float64Array.from(pg), bl: Float64Array.from(pb),
  };
}

/** Build posed TrainViews at a render resolution (every `viewStep`-th frame). */
export function captureToViews(
  manifest: CaptureManifest, decode: DecodeFrame, renderWidth: number, renderHeight: number, viewStep = 1,
): TrainView[] {
  const views: TrainView[] = [];
  for (let i = 0; i < manifest.frames.length; i += viewStep) {
    const f = manifest.frames[i];
    views.push({
      cam: cameraFromArcorePose(f.cameraTransformColumnMajor4x4, manifest.intrinsics, renderWidth),
      W: renderWidth, H: renderHeight,
      target: decode(f.index, renderWidth, renderHeight),
    });
  }
  return views;
}
