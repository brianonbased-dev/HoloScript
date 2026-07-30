import { describe, expect, it } from 'vitest';
import { GPU_LIVE, testDevice } from '../../physics/__tests__/gpu-setup';
import {
  deriveCharacterMicroMotionConfig,
  sampleCharacterMicroMotion,
} from '../AgentAvatarMicroMotion';
import { CharacterHost } from '../CharacterHost';
import {
  deriveCharacterMotionVectorFrame,
  rasterizeCharacterMotionVectorsGPU,
} from '../CharacterMotionVectors';
import { framingMatrix } from '../character-render';

function characterHost(entityId: string): CharacterHost {
  return new CharacterHost({
    entityId,
    faceTopology: 'neutral-anatomical-v2',
    faceRadialSegments: 44,
    faceVerticalSegments: 30,
    upperBodyProfile: 'coherent-expressive-anatomy-v7',
    ocularProfile: 'layered-ocular-calibrated-v3',
  });
}

function motionPair() {
  const previous = characterHost('motion-vector-resident');
  const current = characterHost('motion-vector-resident');
  const sampled = sampleCharacterMicroMotion(
    deriveCharacterMicroMotionConfig({ seed: 'motion-vector-resident' }),
    3.25
  );
  previous.applyMicroMotionSample({
    ...sampled,
    blink: { ...sampled.blink, weight: 0 },
    gaze: { ...sampled.gaze, yawRadians: 0, pitchRadians: 0 },
    breath: { ...sampled.breath, scale: 1 },
  });
  current.applyMicroMotionSample({
    ...sampled,
    blink: { ...sampled.blink, weight: 0 },
    gaze: { ...sampled.gaze, yawRadians: 0.1, pitchRadians: -0.05 },
    breath: { ...sampled.breath, scale: 1.03 },
  });
  return { previous: previous.getDrawSpec(), current: current.getDrawSpec() };
}

describe('deriveCharacterMotionVectorFrame', () => {
  it('derives deterministic velocity from native ocular and chest deformation', () => {
    const { current, previous } = motionPair();
    const options = {
      width: 64,
      height: 64,
      currentViewProjection: framingMatrix(),
    };
    const first = deriveCharacterMotionVectorFrame(current, previous, options);
    const replay = deriveCharacterMotionVectorFrame(current, previous, options);

    expect(first.receipt).toMatchObject({
      schemaVersion: 'holoscript.character-motion-vectors.v1',
      entityId: 'motion-vector-resident',
      vertexCount: current.mesh.vertexCount,
      invalidVertexCount: 0,
      motionVectorSpace: 'current-minus-previous-pixels',
      dualInfluenceSkinningConsumed: true,
      topologyIdentityRequired: true,
    });
    expect(first.receipt.movingVertexCount).toBeGreaterThan(0);
    expect(first.receipt.maximumMagnitudePixels).toBeGreaterThan(0);
    expect(first.receipt.motionDigest).toBe(replay.receipt.motionDigest);
    expect(first.motionPixels).toEqual(replay.motionPixels);
  });

  it('emits exact zero velocity for a repeated frame', () => {
    const { current } = motionPair();
    const frame = deriveCharacterMotionVectorFrame(current, current, {
      width: 64,
      height: 64,
      currentViewProjection: framingMatrix(),
    });
    expect(frame.receipt.movingVertexCount).toBe(0);
    expect(frame.receipt.maximumMagnitudePixels).toBe(0);
    expect([...frame.motionPixels].every((value) => value === 0)).toBe(true);
  });

  it('captures root model translation for every resident vertex', () => {
    const previousHost = characterHost('translated-resident');
    const currentHost = characterHost('translated-resident');
    previousHost.applyWorldState({ position: { x: 0, y: 0, z: 0 } });
    currentHost.applyWorldState({ position: { x: 0.1, y: 0, z: 0 } });
    const frame = deriveCharacterMotionVectorFrame(
      currentHost.getDrawSpec(),
      previousHost.getDrawSpec(),
      {
        width: 64,
        height: 64,
        currentViewProjection: framingMatrix(),
      }
    );
    expect(frame.receipt.movingVertexCount).toBe(frame.vertexCount);
    expect(frame.receipt.meanMagnitudePixels).toBeCloseTo(3.2, 4);
    expect(frame.receipt.maximumMagnitudePixels).toBeCloseTo(3.2, 4);
  });
});

const itGpu = GPU_LIVE ? it : it.skip;

describe('rasterizeCharacterMotionVectorsGPU', () => {
  itGpu('rasterizes velocity and depth on the live WebGPU device', async () => {
    const { current, previous } = motionPair();
    const frame = deriveCharacterMotionVectorFrame(current, previous, {
      width: 64,
      height: 64,
      currentViewProjection: framingMatrix(),
    });
    const raster = await rasterizeCharacterMotionVectorsGPU(
      testDevice!,
      frame,
      current.mesh.indices
    );

    expect(raster.receipt).toMatchObject({
      backend: 'webgpu',
      deviceExecutionMeasured: true,
      width: 64,
      height: 64,
      motionVectorSpace: 'current-minus-previous-pixels',
      depthConvention: 'webgpu-ndc-zero-to-one',
      gpuTimestampMeasured: false,
      timingClassification: 'not-measured',
    });
    expect(raster.receipt.rasterizedPixelCount).toBeGreaterThan(0);
    expect(raster.receipt.movingPixelCount).toBeGreaterThan(0);
    expect(raster.depth.data.some((value) => value < 1)).toBe(true);
  });
});
