import { describe, expect, it } from 'vitest';
import { GPU_LIVE, testDevice } from '../../../physics/__tests__/gpu-setup';
import type { PixelGrid } from '../../../native-render/gpu-verify';
import {
  TEMPORAL_CONVERGENCE_PROFILES,
  TemporalConvergenceController,
  jitterProjectionMatrix,
  resolveTemporalFrameGPU,
  temporalHaltonJitter,
} from '../TemporalConvergence';

describe('TemporalConvergenceController', () => {
  it('invalidates deterministically on initial, camera, resident, and LOD changes', () => {
    const controller = TemporalConvergenceController.fromProfile('browser-balanced');

    const initial = controller.beginFrame({
      cameraStateId: 'camera-a',
      residentStateId: 'pose-a',
      lodLevel: 0,
    });
    expect(initial.invalidationReason).toBe('initial');
    expect(initial.feedback).toBe(0);

    const stable = controller.beginFrame({
      cameraStateId: 'camera-a',
      residentStateId: 'pose-a',
      lodLevel: 0,
    });
    expect(stable.invalidated).toBe(false);
    expect(stable.historyValid).toBe(true);
    expect(stable.feedback).toBe(0.5);

    const camera = controller.beginFrame({
      cameraStateId: 'camera-b',
      residentStateId: 'pose-a',
      lodLevel: 0,
    });
    expect(camera.invalidationReason).toBe('camera-motion');
    expect(camera.feedback).toBe(0);

    const resident = controller.beginFrame({
      cameraStateId: 'camera-b',
      residentStateId: 'pose-b',
      lodLevel: 0,
    });
    expect(resident.invalidationReason).toBe('resident-motion');

    const lod = controller.beginFrame({
      cameraStateId: 'camera-b',
      residentStateId: 'pose-b',
      lodLevel: 1,
    });
    expect(lod.invalidationReason).toBe('lod-change');

    expect(controller.getReceipt().invalidationCounts).toEqual({
      initial: 1,
      'camera-motion': 1,
      'resident-motion': 1,
      'lod-change': 1,
      manual: 0,
    });
  });

  it('admits convergence only after the configured stable sample window', () => {
    const controller = TemporalConvergenceController.fromProfile('quest-90hz-budget');
    const config = TEMPORAL_CONVERGENCE_PROFILES['quest-90hz-budget'];
    const frames = Array.from({ length: config.sampleCount }, () =>
      controller.beginFrame({
        cameraStateId: 'camera-stable',
        residentStateId: 'pose-stable',
        lodLevel: 2,
      })
    );

    expect(frames.at(-2)?.converged).toBe(false);
    expect(frames.at(-1)?.converged).toBe(true);
    expect(frames.at(-1)?.feedback).toBe(config.feedbackCeiling);
    expect(controller.getReceipt()).toMatchObject({
      frameCount: config.sampleCount,
      stableFrameCount: config.sampleCount,
      converged: true,
      motionVectorResidentFramesAdmitted: 0,
      reactiveMaskConsumed: false,
      requiredHistoryPolicy: 'reproject-resident-motion-invalidate-camera-or-lod-v2',
    });
  });

  it('admits resident motion only when matching motion vectors are available', () => {
    const controller = TemporalConvergenceController.fromProfile('browser-balanced');
    controller.beginFrame({
      cameraStateId: 'camera',
      residentStateId: 'pose-a',
      lodLevel: 0,
      motionVectorsAvailable: true,
    });
    const reprojected = controller.beginFrame({
      cameraStateId: 'camera',
      residentStateId: 'pose-b',
      lodLevel: 0,
      motionVectorsAvailable: true,
    });
    expect(reprojected).toMatchObject({
      invalidated: false,
      historyValid: true,
      feedback: 0.5,
    });
    expect(controller.getReceipt().motionVectorResidentFramesAdmitted).toBe(1);

    const missingVelocity = controller.beginFrame({
      cameraStateId: 'camera',
      residentStateId: 'pose-c',
      lodLevel: 0,
      motionVectorsAvailable: false,
    });
    expect(missingVelocity.invalidationReason).toBe('resident-motion');
  });

  it('produces deterministic jitter and never mutates the source matrix', () => {
    expect(temporalHaltonJitter(3, 0.5)).toEqual(temporalHaltonJitter(3, 0.5));
    expect(temporalHaltonJitter(3, 0.5)).not.toEqual(temporalHaltonJitter(4, 0.5));

    const source = new Float32Array(16);
    source[0] = source[5] = source[10] = source[15] = 1;
    const jittered = jitterProjectionMatrix(source, [0.25, -0.25], 128, 64);
    expect(source[12]).toBe(0);
    expect(source[13]).toBe(0);
    expect(jittered[12]).toBeCloseTo(0.00390625);
    expect(jittered[13]).toBeCloseTo(-0.0078125);
  });

  it('rejects unsafe configuration and ambiguous state ids', () => {
    expect(
      () =>
        new TemporalConvergenceController({
          sampleCount: 1,
          feedbackCeiling: 0.9,
          jitterScalePixels: 0.5,
        })
    ).toThrow(/sampleCount/);

    const controller = TemporalConvergenceController.fromProfile('browser-balanced');
    expect(() =>
      controller.beginFrame({ cameraStateId: '', residentStateId: 'pose', lodLevel: 0 })
    ).toThrow(/cameraStateId/);
  });
});

function checkerboard(size: number, low: number, high: number): PixelGrid {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const value = (x + y) % 2 === 0 ? low : high;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

const itGpu = GPU_LIVE ? it : it.skip;

describe('resolveTemporalFrameGPU', () => {
  itGpu('executes a neighborhood-clamped resolve and records exact claim boundaries', async () => {
    const current = checkerboard(64, 0, 200);
    const history = checkerboard(64, 100, 100);
    const resolved = await resolveTemporalFrameGPU(testDevice!, current, history, {
      feedback: 0.5,
      historyValid: true,
    });

    expect(resolved.pixels.data[0]).toBeGreaterThan(40);
    expect(resolved.pixels.data[0]).toBeLessThan(60);
    expect(resolved.pixels.data[4]).toBeGreaterThan(140);
    expect(resolved.pixels.data[4]).toBeLessThan(160);
    expect(resolved.receipt).toMatchObject({
      backend: 'webgpu',
      deviceExecutionMeasured: true,
      historyValid: true,
      neighborhoodClamping: true,
      motionVectorsConsumed: false,
      reactiveMaskConsumed: false,
      disocclusionInputConsumed: false,
      gpuTimestampMeasured: false,
      timingClassification: 'not-measured',
    });
  });

  itGpu('discards history exactly when the controller invalidates it', async () => {
    const current = checkerboard(64, 20, 180);
    const history = checkerboard(64, 100, 100);
    const resolved = await resolveTemporalFrameGPU(testDevice!, current, history, {
      feedback: 0.75,
      historyValid: false,
    });
    expect(resolved.pixels.data).toEqual(current.data);
    expect(resolved.receipt.historyValid).toBe(false);
  });

  itGpu('reprojects velocity and rejects disoccluded depth on the GPU', async () => {
    const size = 64;
    const history = checkerboard(size, 0, 0);
    const current = checkerboard(size, 0, 0);
    for (let y = 18; y < 46; y += 1) {
      for (let x = 12; x < 30; x += 1) {
        const historyOffset = (y * size + x) * 4;
        const currentOffset = (y * size + x + 1) * 4;
        history.data[historyOffset] = 210;
        history.data[historyOffset + 1] = 120;
        history.data[historyOffset + 2] = 60;
        current.data[currentOffset] = 210;
        current.data[currentOffset + 1] = 120;
        current.data[currentOffset + 2] = 60;
      }
    }
    const motionData = new Float32Array(size * size * 2);
    for (let pixel = 0; pixel < size * size; pixel += 1) {
      motionData[pixel * 2] = 1;
    }
    const currentDepthData = new Float32Array(size * size).fill(0.5);
    const historyDepthData = new Float32Array(size * size).fill(0.5);
    currentDepthData[24 * size + 20] = 0.2;
    const reactiveData = new Float32Array(size * size);
    reactiveData[25 * size + 20] = 1;

    const resolved = await resolveTemporalFrameGPU(testDevice!, current, history, {
      feedback: 0.75,
      historyValid: true,
      motionVectors: {
        width: size,
        height: size,
        data: motionData,
        space: 'current-minus-previous-pixels',
      },
      currentDepth: { width: size, height: size, data: currentDepthData },
      historyDepth: { width: size, height: size, data: historyDepthData },
      reactiveMask: { width: size, height: size, data: reactiveData },
      disocclusionDepthThreshold: 0.01,
    });

    expect(resolved.pixels.data).toEqual(current.data);
    expect(resolved.receipt).toMatchObject({
      schemaVersion: 'holoscript.webgpu-temporal-resolve.v2',
      motionVectorsConsumed: true,
      motionVectorSpace: 'current-minus-previous-pixels',
      disocclusionInputConsumed: true,
      reactiveMaskConsumed: true,
      outOfBoundsHistoryPixelCount: size,
      disocclusionRejectedPixelCount: 1,
      fullyReactivePixelCount: 1,
      gpuTimestampMeasured: false,
    });
  });
});
