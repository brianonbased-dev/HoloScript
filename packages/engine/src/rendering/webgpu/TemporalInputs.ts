/**
 * Typed screen-space inputs shared by native renderers and temporal resolve.
 *
 * Motion vectors use pixel units and the convention:
 *
 *   previousPixel = currentPixel - motionPixels
 *
 * Depth values use WebGPU NDC depth in [0, 1]. Reactive-mask values use [0, 1].
 */

export interface MotionVectorGrid {
  width: number;
  height: number;
  /** Interleaved XY float32 motion in pixels, row-major. */
  data: Float32Array;
  space: 'current-minus-previous-pixels';
}

export interface DepthGrid {
  width: number;
  height: number;
  /** WebGPU NDC depth in [0, 1], row-major. */
  data: Float32Array;
}

export interface ReactiveMaskGrid {
  width: number;
  height: number;
  /** History rejection strength in [0, 1], row-major. */
  data: Float32Array;
}
