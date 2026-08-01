import { describe, expect, it } from 'vitest';
import {
  deriveCharacterMicroMotionConfig,
  sampleCharacterMicroMotion,
} from '../../../character-render/AgentAvatarMicroMotion';
import { CharacterHost } from '../../../character-render/CharacterHost';
import { framingMatrix } from '../../../character-render/character-render';
import { GPU_LIVE, testDevice } from '../../../physics/__tests__/gpu-setup';
import { CharacterTemporalFrameGraph } from '../CharacterTemporalFrameGraph';

function characterHost(): CharacterHost {
  return new CharacterHost({
    entityId: 'h4f-zero-copy-resident',
    faceTopology: 'neutral-anatomical-v2',
    faceRadialSegments: 44,
    faceVerticalSegments: 30,
    upperBodyProfile: 'coherent-expressive-anatomy-v7',
    ocularProfile: 'layered-ocular-calibrated-v3',
  });
}

function motionPair() {
  const previousHost = characterHost();
  const currentHost = characterHost();
  const sample = sampleCharacterMicroMotion(
    deriveCharacterMicroMotionConfig({ seed: 'h4f-zero-copy-resident' }),
    5.5
  );
  previousHost.applyMicroMotionSample({
    ...sample,
    gaze: { ...sample.gaze, yawRadians: 0, pitchRadians: 0 },
    breath: { ...sample.breath, scale: 1 },
  });
  currentHost.applyMicroMotionSample({
    ...sample,
    gaze: { ...sample.gaze, yawRadians: 0.08, pitchRadians: -0.04 },
    breath: { ...sample.breath, scale: 1.02 },
  });
  return { previous: previousHost.getDrawSpec(), current: currentHost.getDrawSpec() };
}

const itGpu = GPU_LIVE ? it : it.skip;

describe('CharacterTemporalFrameGraph', () => {
  itGpu('runs color, motion/depth, and temporal resolve in one zero-copy submission', async () => {
    const device = testDevice!;
    const size = 64;
    const { previous, current } = motionPair();
    const graph = new CharacterTemporalFrameGraph(device, previous, {
      width: size,
      height: size,
      enableGpuTimestamps: true,
      label: 'h4f-live-dawn',
    });
    const viewProjection = framingMatrix();

    const initial = await graph.execute({
      currentSpec: previous,
      previousSpec: previous,
      currentViewProjection: viewProjection,
      feedback: 0,
      historyValid: false,
    });
    expect(initial.receipt).toMatchObject({
      historyConsumed: false,
      fixedTopology: true,
      persistentGpuResources: true,
      zeroCopyColorToTemporalResolve: true,
      zeroCopyMotionDepthToTemporalResolve: true,
      zeroCopyResolveToHistory: true,
      intermediateFrameReadbackCount: 0,
      evidenceFrameReadbackCount: 0,
      commandBufferCount: 1,
      queueSubmissionCount: 1,
      color: {
        persistentGeometryBuffers: true,
        zeroCopyTextureOutput: true,
        intermediateCpuReadbackCount: 0,
      },
      motionDepth: {
        persistentPipeline: true,
        zeroCopyTextureOutputs: true,
        intermediateCpuReadbackCount: 0,
      },
      resolve: {
        zeroCopyTextureInputs: true,
        persistentPipelineConsumed: true,
      },
    });

    const moving = await graph.execute({
      currentSpec: current,
      previousSpec: previous,
      currentViewProjection: viewProjection,
      feedback: 0.5,
      historyValid: true,
      capturePixels: true,
    });
    expect(moving.receipt).toMatchObject({
      deviceExecutionMeasured: true,
      historyConsumed: true,
      evidenceFrameReadbackCount: 1,
      timestampMetadataReadbackCount: graph.timestampQueryEnabled ? 1 : 0,
      timedScope: graph.timestampQueryEnabled
        ? 'character-color-through-temporal-resolve-gpu-scope'
        : 'not-measured',
      cpuMotionDerivationExcludedFromTimedScope: true,
      cpuToGpuUploadsExcludedFromTimedScope: true,
      historyCopiesExcludedFromTimedScope: true,
      evidenceAndTimestampReadbackExcludedFromTimedScope: true,
      resolve: {
        historyValid: true,
        motionVectorsConsumed: true,
        disocclusionInputConsumed: true,
      },
    });
    expect(moving.receipt.motionDerivation.movingVertexCount).toBeGreaterThan(0);
    expect(moving.receipt.motionDepth.maximumMagnitudePixels).toBeGreaterThan(0);
    expect(moving.pixels).not.toBeNull();
    expect(moving.pixels!.data.some((channel, index) => index % 4 !== 3 && channel > 40)).toBe(
      true
    );
    if (graph.timestampQueryEnabled) {
      expect(moving.receipt.gpuTimestampMeasured).toBe(true);
      expect(moving.receipt.durations.characterColorNanoseconds).toBeGreaterThan(0);
      expect(moving.receipt.durations.motionDepthNanoseconds).toBeGreaterThan(0);
      expect(moving.receipt.durations.temporalResolveNanoseconds).toBeGreaterThan(0);
      expect(moving.receipt.durations.aggregateNanoseconds).toBeGreaterThan(0);
    } else {
      expect(moving.receipt).toMatchObject({
        gpuTimestampMeasured: false,
        timingClassification: 'feature-not-enabled',
      });
    }

    graph.destroy();
  });
});
