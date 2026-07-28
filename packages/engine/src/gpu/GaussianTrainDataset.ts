/**
 * @fileoverview GaussianTrainDataset — the posed-view dataset adapter for the sovereign 3DGS trainer.
 *
 * Turns real capture poses into the trainer's representation: a column-major 4x4 view matrix (the
 * `cam.json` / WebGPU-renderer format produced by the capture pipeline) → `SplatCamera`, plus helpers
 * to assemble `TrainView[]` and to downsample intrinsics for cheaper CPU training. This is the bridge
 * between a captured dataset (images + per-image poses) and `runGaussianTrainJob` — drop a real
 * multi-view capture in and it trains.
 *
 * Convention: the view matrix is column-major (m[col*4 + row]) and maps world → camera as
 * `camPos = viewMatrix * vec4(pos, 1)` (exactly how splat-compress.wgsl applies it). `SplatCamera`
 * stores the same transform as a row-major 3x3 rotation `Vrow` + translation `t`, with
 * `camPos = Vrow·pos + t`. cameraFromViewMatrix maps one to the other (verified by round-trip test).
 */

import { type SplatCamera } from './GaussianTrainer3D';
import { type TrainView } from './GaussianTrainRunner';

/**
 * Convert a column-major 4x4 world→camera view matrix (16 floats, the cam.json format) into a
 * SplatCamera. Pulls the upper-left 3x3 into row-major `Vrow` and the 4th column into `t`.
 *
 *   viewMatrix[col*4 + row]  →  camPos.row = Σ_col viewMatrix[col*4+row] · pos[col]  (+ translation col 3)
 *   Vrow[row*3 + col] = viewMatrix[col*4 + row]   ;   t[row] = viewMatrix[3*4 + row]
 */
export function cameraFromViewMatrix(
  viewMatrix: ArrayLike<number>,
  focalX: number,
  focalY: number,
  cx?: number,
  cy?: number
): SplatCamera {
  const m = viewMatrix;
  const cam: SplatCamera = {
    Vrow: [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]],
    t: [m[12], m[13], m[14]],
    fx: focalX,
    fy: focalY,
  };
  if (cx !== undefined) (cam as { cx?: number }).cx = cx;
  if (cy !== undefined) (cam as { cy?: number }).cy = cy;
  return cam;
}

/**
 * Scale a camera's intrinsics for training at a downsampled resolution (cheaper on CPU). Only the
 * focal lengths scale; the principal point defaults to the new image centre (W'/2 = (W/2)·s), so an
 * undefined cx/cy stays consistent — leave them unset when the capture is centre-principal.
 */
export function cameraScaled(cam: SplatCamera, scale: number): SplatCamera {
  const out: SplatCamera = { Vrow: cam.Vrow, t: cam.t, fx: cam.fx * scale, fy: cam.fy * scale };
  if (cam.cx !== undefined) (out as { cx?: number }).cx = cam.cx * scale;
  if (cam.cy !== undefined) (out as { cy?: number }).cy = cam.cy * scale;
  return out;
}

/**
 * Assemble a TrainView from a camera + a target image (W*H*3, row-major RGB in [0,1]). Throws on a
 * size mismatch so a mis-decoded image fails loudly rather than training against garbage.
 */
export function makeTrainView(
  cam: SplatCamera,
  W: number,
  H: number,
  target: Float64Array
): TrainView {
  if (target.length !== W * H * 3) {
    throw new Error(`makeTrainView: target length ${target.length} != W*H*3 = ${W * H * 3}`);
  }
  return { cam, W, H, target };
}

/** A posed capture frame before the image is decoded — the on-disk shape a loader produces. */
export interface PosedFrame {
  /** Column-major 4x4 world→camera view matrix (cam.json format). */
  viewMatrix: ArrayLike<number>;
  focalX: number;
  focalY: number;
  /** Decoded target image, W*H*3 RGB in [0,1]. */
  target: Float64Array;
  width: number;
  height: number;
  cx?: number;
  cy?: number;
}

/**
 * Build a multi-view TrainView[] from decoded posed frames, optionally downsampling intrinsics by
 * `scale` (the caller downsamples the pixels to match). This is what feeds runGaussianTrainJob for a
 * real capture.
 */
export function viewsFromFrames(frames: readonly PosedFrame[], scale = 1): TrainView[] {
  return frames.map((f) => {
    const base = cameraFromViewMatrix(f.viewMatrix, f.focalX, f.focalY, f.cx, f.cy);
    const cam = scale === 1 ? base : cameraScaled(base, scale);
    return makeTrainView(cam, f.width, f.height, f.target);
  });
}
