/**
 * Canonical mobile sensor bundle adapter for HoloMap replay.
 *
 * This is the device-transport seam between ARKit/ARCore capture and
 * HoloMapRuntime.step(). It is intentionally JSON-friendly for first-pass
 * device upload, while preserving typed arrays when a native caller has them.
 */

import {
  createHoloMapRuntime,
  HOLOMAP_DEFAULTS,
  type CameraPose,
  type HoloMapConfig,
  type ReconstructionFrame,
  type ReconstructionManifest,
  type ReconstructionStep,
} from './HoloMapRuntime';

export const HOLOMAP_MOBILE_SENSOR_BUNDLE_VERSION = 'holomap-mobile-sensor-bundle/v1';

export type MobileSensorPlatform =
  | 'ios-arkit-lidar'
  | 'android-arcore-depth'
  | 'holoshell-native'
  | 'synthetic-replay';

export interface MobileCameraIntrinsics {
  width: number;
  height: number;
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  source: string;
}

export interface MobileSensorBundleCapture {
  platform: MobileSensorPlatform;
  deviceModel?: string;
  coordinateSystem:
    | 'arkit-right-handed-y-up'
    | 'arcore-right-handed-y-up'
    | 'holoshell-right-handed-y-up'
    | 'synthetic-right-handed-y-up';
  intrinsics: MobileCameraIntrinsics;
}

export interface MobileSensorDepthPlane {
  width: number;
  height: number;
  /** Normalized 0=near .. 1=far values matching ReconstructionFrame.depth. */
  values: ArrayLike<number>;
}

export interface MobileSensorConfidencePlane {
  width: number;
  height: number;
  /**
   * Confidence values. `unit` means 0..1; `arkit-0-2` means ARKit low/medium/high;
   * `uint8` means 0..255.
   */
  encoding: 'unit' | 'arkit-0-2' | 'uint8';
  values: ArrayLike<number>;
}

export interface MobileSensorMeshAnchor {
  id: string;
  transformColumnMajor4x4: ArrayLike<number>;
  vertexCount: number;
  faceCount: number;
  confidence?: number;
}

export interface MobileSensorBundleFrame {
  index: number;
  timestampMs: number;
  width: number;
  height: number;
  stride: 3 | 4;
  rgb: ArrayLike<number>;
  sceneDepth?: MobileSensorDepthPlane;
  sceneDepthConfidence?: MobileSensorConfidencePlane;
  /** ARKit/ARCore camera transform, column-major 4x4. */
  cameraTransformColumnMajor4x4?: ArrayLike<number>;
  /** Optional pre-decoded pose for non-matrix transports. Matrix wins when present. */
  devicePose?: CameraPose;
  meshAnchors?: MobileSensorMeshAnchor[];
}

export interface ArCoreDepthRangeMillimeters {
  /** Nearest depth treated as normalized 0. Google's guidance says depth is best from ~0.5m. */
  near: number;
  /** Farthest depth treated as normalized 1. Google guidance calls out ~5m as the useful range. */
  far: number;
}

export interface ArCoreDepthImage16Bits {
  width: number;
  height: number;
  /**
   * Row-major unsigned 16-bit millimeter values from ARCore
   * Frame.acquireDepthImage16Bits() or acquireRawDepthImage16Bits().
   * A zero cell is invalid and is carried with zero confidence.
   */
  millimeters: ArrayLike<number>;
}

export interface ArCoreRawDepthConfidenceImage {
  width: number;
  height: number;
  /** Row-major 0..255 confidence values from Frame.acquireRawDepthConfidenceImage(). */
  values: ArrayLike<number>;
}

export interface ArCoreDepthFrameInput {
  index: number;
  timestampMs: number;
  width: number;
  height: number;
  stride: 3 | 4;
  rgb: ArrayLike<number>;
  depthImage16Bits: ArCoreDepthImage16Bits;
  rawDepthConfidenceImage?: ArCoreRawDepthConfidenceImage;
  /** ARCore camera pose matrix, column-major 4x4. Matrix wins over devicePose. */
  cameraTransformColumnMajor4x4?: ArrayLike<number>;
  devicePose?: CameraPose;
}

export interface ArCoreDepthMobileSensorBundleInput {
  bundleId: string;
  deviceModel?: string;
  intrinsics: MobileCameraIntrinsics;
  frames: ArCoreDepthFrameInput[];
  depthRangeMillimeters?: Partial<ArCoreDepthRangeMillimeters>;
}

export interface MobileSensorBundle {
  schemaVersion: typeof HOLOMAP_MOBILE_SENSOR_BUNDLE_VERSION;
  bundleId: string;
  capture: MobileSensorBundleCapture;
  frames: MobileSensorBundleFrame[];
}

export interface MobileSensorReplayResult {
  source: {
    bundleId: string;
    platform: MobileSensorPlatform;
    frameCount: number;
    meshAnchorCount: number;
  };
  steps: ReconstructionStep[];
  manifest: ReconstructionManifest;
}

export const ARCORE_DEPTH_RECOMMENDED_RANGE_MILLIMETERS: ArCoreDepthRangeMillimeters = {
  near: 500,
  far: 5000,
};

function finiteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function finiteArray(values: ArrayLike<number>, expectedLength: number): boolean {
  if (values.length !== expectedLength) return false;
  for (let i = 0; i < values.length; i += 1) {
    if (!finiteNumber(Number(values[i]))) return false;
  }
  return true;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function normalizeArCoreDepthRange(
  range: Partial<ArCoreDepthRangeMillimeters> | undefined
): ArCoreDepthRangeMillimeters {
  const near = range?.near ?? ARCORE_DEPTH_RECOMMENDED_RANGE_MILLIMETERS.near;
  const far = range?.far ?? ARCORE_DEPTH_RECOMMENDED_RANGE_MILLIMETERS.far;
  if (!finiteNumber(near) || near <= 0)
    throw new Error('arCoreDepthRange.near must be positive finite');
  if (!finiteNumber(far) || far <= near)
    throw new Error('arCoreDepthRange.far must be finite and greater than near');
  return { near, far };
}

function requirePlane(
  width: number,
  height: number,
  values: ArrayLike<number>,
  name: string,
  maxValue: number
): void {
  requirePositiveInteger(width, `${name}.width`);
  requirePositiveInteger(height, `${name}.height`);
  const expected = width * height;
  if (values.length !== expected) {
    throw new Error(`${name}.values length must be ${expected}`);
  }
  for (let i = 0; i < values.length; i += 1) {
    const value = Number(values[i]);
    if (!Number.isFinite(value) || value < 0 || value > maxValue) {
      throw new Error(`${name}.values[${i}] must be a finite value from 0 to ${maxValue}`);
    }
  }
}

function nearestPlaneIndex(
  x: number,
  y: number,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number
): number {
  const sx = Math.min(srcWidth - 1, Math.max(0, Math.floor(((x + 0.5) * srcWidth) / dstWidth)));
  const sy = Math.min(srcHeight - 1, Math.max(0, Math.floor(((y + 0.5) * srcHeight) / dstHeight)));
  return sy * srcWidth + sx;
}

function arCoreDepthMillimetersToUnit(
  depthMillimeters: number,
  range: ArCoreDepthRangeMillimeters
): number {
  if (!Number.isFinite(depthMillimeters) || depthMillimeters <= 0) return 1;
  return clampUnit((depthMillimeters - range.near) / (range.far - range.near));
}

function arCoreDepthCellIsTrusted(
  depthMillimeters: number,
  range: ArCoreDepthRangeMillimeters
): boolean {
  return Number.isFinite(depthMillimeters) && depthMillimeters > 0 && depthMillimeters <= range.far;
}

function toUint8Array(values: ArrayLike<number>, name: string): Uint8Array {
  const out = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    const value = Number(values[i]);
    if (!Number.isFinite(value) || value < 0 || value > 255) {
      throw new Error(`${name}[${i}] must be a finite byte`);
    }
    out[i] = Math.round(value);
  }
  return out;
}

function toFloat32UnitArray(values: ArrayLike<number>, name: string): Float32Array {
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    const value = Number(values[i]);
    if (!Number.isFinite(value)) throw new Error(`${name}[${i}] must be finite`);
    out[i] = clampUnit(value);
  }
  return out;
}

function confidenceToUnitArray(plane: MobileSensorConfidencePlane): Float32Array {
  const out = new Float32Array(plane.values.length);
  for (let i = 0; i < plane.values.length; i += 1) {
    const value = Number(plane.values[i]);
    if (!Number.isFinite(value)) throw new Error(`sceneDepthConfidence[${i}] must be finite`);
    if (plane.encoding === 'unit') out[i] = clampUnit(value);
    else if (plane.encoding === 'arkit-0-2') out[i] = clampUnit(value / 2);
    else out[i] = clampUnit(value / 255);
  }
  return out;
}

export function arCoreDepthFrameToMobileSensorFrame(
  frame: ArCoreDepthFrameInput,
  depthRangeMillimeters?: Partial<ArCoreDepthRangeMillimeters>
): MobileSensorBundleFrame {
  requirePositiveInteger(frame.width, 'arCoreFrame.width');
  requirePositiveInteger(frame.height, 'arCoreFrame.height');
  if (frame.stride !== 3 && frame.stride !== 4) {
    throw new Error('arCoreFrame.stride must be 3 or 4');
  }
  if (!finiteNumber(frame.timestampMs)) throw new Error('arCoreFrame.timestampMs must be finite');
  if (!Number.isInteger(frame.index) || frame.index < 0) {
    throw new Error('arCoreFrame.index must be a non-negative integer');
  }
  if (!finiteArray(frame.rgb, frame.width * frame.height * frame.stride)) {
    throw new Error('arCoreFrame.rgb length/content invalid');
  }

  const depth = frame.depthImage16Bits;
  const range = normalizeArCoreDepthRange(depthRangeMillimeters);
  requirePlane(depth.width, depth.height, depth.millimeters, 'arCoreFrame.depthImage16Bits', 65535);

  if (frame.rawDepthConfidenceImage) {
    const confidence = frame.rawDepthConfidenceImage;
    requirePlane(
      confidence.width,
      confidence.height,
      confidence.values,
      'arCoreFrame.rawDepthConfidenceImage',
      255
    );
    if (confidence.width !== depth.width || confidence.height !== depth.height) {
      throw new Error('arCoreFrame.rawDepthConfidenceImage dimensions must match depthImage16Bits');
    }
  }

  const pixelCount = frame.width * frame.height;
  const normalizedDepth = new Float32Array(pixelCount);
  const normalizedConfidence = new Float32Array(pixelCount);
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const dstIndex = y * frame.width + x;
      const srcIndex = nearestPlaneIndex(
        x,
        y,
        depth.width,
        depth.height,
        frame.width,
        frame.height
      );
      const depthMillimeters = Number(depth.millimeters[srcIndex]);
      normalizedDepth[dstIndex] = arCoreDepthMillimetersToUnit(depthMillimeters, range);
      const sensorConfidence = frame.rawDepthConfidenceImage
        ? clampUnit(Number(frame.rawDepthConfidenceImage.values[srcIndex]) / 255)
        : 1;
      normalizedConfidence[dstIndex] = arCoreDepthCellIsTrusted(depthMillimeters, range)
        ? sensorConfidence
        : 0;
    }
  }

  return {
    index: frame.index,
    timestampMs: frame.timestampMs,
    width: frame.width,
    height: frame.height,
    stride: frame.stride,
    rgb: frame.rgb,
    sceneDepth: {
      width: frame.width,
      height: frame.height,
      values: normalizedDepth,
    },
    sceneDepthConfidence: {
      width: frame.width,
      height: frame.height,
      encoding: 'unit',
      values: normalizedConfidence,
    },
    cameraTransformColumnMajor4x4: frame.cameraTransformColumnMajor4x4,
    devicePose: frame.devicePose,
  };
}

export function createArCoreDepthMobileSensorBundle(
  input: ArCoreDepthMobileSensorBundleInput
): MobileSensorBundle {
  if (!input.bundleId) throw new Error('arCoreBundle.bundleId missing');
  if (!Array.isArray(input.frames) || input.frames.length === 0) {
    throw new Error('arCoreBundle.frames missing');
  }
  return {
    schemaVersion: HOLOMAP_MOBILE_SENSOR_BUNDLE_VERSION,
    bundleId: input.bundleId,
    capture: {
      platform: 'android-arcore-depth',
      deviceModel: input.deviceModel,
      coordinateSystem: 'arcore-right-handed-y-up',
      intrinsics: input.intrinsics,
    },
    frames: input.frames.map((frame) =>
      arCoreDepthFrameToMobileSensorFrame(frame, input.depthRangeMillimeters)
    ),
  };
}

function normalizeQuaternion(
  q: [number, number, number, number]
): [number, number, number, number] {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (len <= 1e-12) return [0, 0, 0, 1];
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

export function cameraPoseFromColumnMajorTransform(
  transform: ArrayLike<number>,
  confidence = 1
): CameraPose {
  if (transform.length !== 16 || !finiteArray(transform, 16)) {
    throw new Error('cameraTransformColumnMajor4x4 must contain 16 finite numbers');
  }

  const m00 = Number(transform[0]);
  const m01 = Number(transform[4]);
  const m02 = Number(transform[8]);
  const m10 = Number(transform[1]);
  const m11 = Number(transform[5]);
  const m12 = Number(transform[9]);
  const m20 = Number(transform[2]);
  const m21 = Number(transform[6]);
  const m22 = Number(transform[10]);
  const trace = m00 + m11 + m22;
  let rotation: [number, number, number, number];

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    rotation = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    rotation = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    rotation = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    rotation = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }

  return {
    position: [Number(transform[12]), Number(transform[13]), Number(transform[14])],
    rotation: normalizeQuaternion(rotation),
    confidence: clampUnit(confidence),
  };
}

export function validateMobileSensorBundle(bundle: MobileSensorBundle): string[] {
  const errors: string[] = [];
  if (bundle.schemaVersion !== HOLOMAP_MOBILE_SENSOR_BUNDLE_VERSION)
    errors.push('schemaVersion mismatch');
  if (!bundle.bundleId) errors.push('bundleId missing');
  if (!bundle.capture?.platform) errors.push('capture.platform missing');
  const intrinsics = bundle.capture?.intrinsics;
  if (!intrinsics) {
    errors.push('capture.intrinsics missing');
  } else {
    for (const key of ['width', 'height', 'fx', 'fy', 'cx', 'cy'] as const) {
      if (!finiteNumber(intrinsics[key]) || intrinsics[key] <= 0) {
        errors.push(`capture.intrinsics.${key} must be positive finite`);
      }
    }
    if (!intrinsics.source) errors.push('capture.intrinsics.source missing');
  }
  if (!Array.isArray(bundle.frames) || bundle.frames.length === 0) errors.push('frames missing');

  for (const frame of bundle.frames ?? []) {
    const prefix = `frame[${frame?.index ?? '?'}]`;
    if (!Number.isInteger(frame.index) || frame.index < 0)
      errors.push(`${prefix}.index must be a non-negative integer`);
    if (!finiteNumber(frame.timestampMs)) errors.push(`${prefix}.timestampMs must be finite`);
    if (!Number.isInteger(frame.width) || frame.width <= 0)
      errors.push(`${prefix}.width must be positive integer`);
    if (!Number.isInteger(frame.height) || frame.height <= 0)
      errors.push(`${prefix}.height must be positive integer`);
    if (frame.stride !== 3 && frame.stride !== 4) errors.push(`${prefix}.stride must be 3 or 4`);
    const pixelCount = frame.width * frame.height;
    if (!finiteArray(frame.rgb, pixelCount * frame.stride))
      errors.push(`${prefix}.rgb length/content invalid`);
    if (frame.sceneDepth) {
      if (frame.sceneDepth.width !== frame.width || frame.sceneDepth.height !== frame.height) {
        errors.push(`${prefix}.sceneDepth dimensions must match frame`);
      }
      if (!finiteArray(frame.sceneDepth.values, pixelCount))
        errors.push(`${prefix}.sceneDepth values invalid`);
    }
    if (frame.sceneDepthConfidence) {
      if (
        frame.sceneDepthConfidence.width !== frame.width ||
        frame.sceneDepthConfidence.height !== frame.height
      ) {
        errors.push(`${prefix}.sceneDepthConfidence dimensions must match frame`);
      }
      if (!finiteArray(frame.sceneDepthConfidence.values, pixelCount)) {
        errors.push(`${prefix}.sceneDepthConfidence values invalid`);
      }
    }
    if (
      frame.cameraTransformColumnMajor4x4 &&
      !finiteArray(frame.cameraTransformColumnMajor4x4, 16)
    ) {
      errors.push(`${prefix}.cameraTransformColumnMajor4x4 invalid`);
    }
  }
  return errors;
}

export function mobileSensorBundleToFrames(bundle: MobileSensorBundle): ReconstructionFrame[] {
  const errors = validateMobileSensorBundle(bundle);
  if (errors.length > 0)
    throw new Error(`Invalid HoloMap mobile sensor bundle: ${errors.join('; ')}`);

  return bundle.frames.map((frame) => ({
    index: frame.index,
    timestampMs: frame.timestampMs,
    width: frame.width,
    height: frame.height,
    stride: frame.stride,
    rgb: toUint8Array(frame.rgb, `frame[${frame.index}].rgb`),
    depth: frame.sceneDepth
      ? toFloat32UnitArray(frame.sceneDepth.values, `frame[${frame.index}].sceneDepth`)
      : undefined,
    depthConfidence: frame.sceneDepthConfidence
      ? confidenceToUnitArray(frame.sceneDepthConfidence)
      : undefined,
    devicePose: frame.cameraTransformColumnMajor4x4
      ? cameraPoseFromColumnMajorTransform(
          frame.cameraTransformColumnMajor4x4,
          frame.devicePose?.confidence ?? 1
        )
      : frame.devicePose,
  }));
}

export async function replayMobileSensorBundle(
  bundle: MobileSensorBundle,
  config: Partial<HoloMapConfig> = {}
): Promise<MobileSensorReplayResult> {
  const frames = mobileSensorBundleToFrames(bundle);
  const runtime = createHoloMapRuntime();
  await runtime.init({
    ...HOLOMAP_DEFAULTS,
    seed: 0,
    modelHash: bundle.bundleId,
    videoHash: bundle.bundleId,
    targetFPS: 100000,
    ...config,
  });

  const steps: ReconstructionStep[] = [];
  try {
    for (const frame of frames) {
      const step = await runtime.step(frame);
      if (step) steps.push(step);
    }
    const manifest = await runtime.finalize();
    const meshAnchorCount = bundle.frames.reduce(
      (sum, frame) => sum + (frame.meshAnchors?.length ?? 0),
      0
    );
    return {
      source: {
        bundleId: bundle.bundleId,
        platform: bundle.capture.platform,
        frameCount: bundle.frames.length,
        meshAnchorCount,
      },
      steps,
      manifest,
    };
  } finally {
    await runtime.dispose();
  }
}
