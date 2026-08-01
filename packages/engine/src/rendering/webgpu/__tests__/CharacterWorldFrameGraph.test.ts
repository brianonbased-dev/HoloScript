import { describe, expect, it } from 'vitest';
import {
  deriveCharacterMicroMotionConfig,
  sampleCharacterMicroMotion,
} from '../../../character-render/AgentAvatarMicroMotion';
import { CharacterHost } from '../../../character-render/CharacterHost';
import { framingMatrix } from '../../../character-render/character-render';
import type { CharacterDrawSpec } from '../../../native-render/draw-spec';
import { GPU_LIVE, testDevice } from '../../../physics/__tests__/gpu-setup';
import { CharacterWorldFrameGraph } from '../CharacterWorldFrameGraph';

const RESIDENT_IDS = ['Claude', 'OpenAI', 'Gemini', 'Grok'] as const;

function characterHost(id: string): CharacterHost {
  return new CharacterHost({
    entityId: `h4g-shared-${id}`,
    faceTopology: 'neutral-anatomical-v2',
    faceRadialSegments: 44,
    faceVerticalSegments: 30,
    upperBodyProfile: 'coherent-expressive-anatomy-v7',
    ocularProfile: 'layered-ocular-calibrated-v3',
  });
}

function motionPair(id: string): { previous: CharacterDrawSpec; current: CharacterDrawSpec } {
  const previousHost = characterHost(id);
  const currentHost = characterHost(id);
  const sample = sampleCharacterMicroMotion(
    deriveCharacterMicroMotionConfig({ seed: `h4g-shared-${id}` }),
    7.25
  );
  previousHost.applyMicroMotionSample({
    ...sample,
    gaze: { ...sample.gaze, yawRadians: 0, pitchRadians: 0 },
    breath: { ...sample.breath, scale: 1 },
  });
  currentHost.applyMicroMotionSample({
    ...sample,
    gaze: { ...sample.gaze, yawRadians: 0.06, pitchRadians: -0.035 },
    breath: { ...sample.breath, scale: 1.015 },
  });
  return { previous: previousHost.getDrawSpec(), current: currentHost.getDrawSpec() };
}

const itGpu = GPU_LIVE ? it : it.skip;

describe('CharacterWorldFrameGraph', () => {
  itGpu(
    'shares one submission across four temporal residents and a zero-copy composite',
    async () => {
      const device = testDevice!;
      const size = 64;
      const pairs = RESIDENT_IDS.map((id) => ({ id, ...motionPair(id) }));
      const graph = new CharacterWorldFrameGraph(
        device,
        pairs.map(({ id, previous }) => ({ id, initialSpec: previous })),
        {
          tileWidth: size,
          tileHeight: size,
          enableGpuTimestamps: true,
          label: 'h4g-live-dawn',
        }
      );
      const viewProjection = framingMatrix();

      const initial = await graph.execute({
        residents: pairs.map(({ id, previous }) => ({
          id,
          input: {
            currentSpec: previous,
            previousSpec: previous,
            currentViewProjection: viewProjection,
            feedback: 0,
            historyValid: false,
          },
        })),
      });
      expect(initial.receipt).toMatchObject({
        residentCount: 4,
        layout: 'two-by-two',
        outputWidth: size * 2,
        outputHeight: size * 2,
        fixedTopology: true,
        persistentGpuResources: true,
        residentReceiptsShareCommandBuffer: true,
        intermediateFrameReadbackCount: 0,
        evidenceFrameReadbackCount: 0,
        commandBufferCount: 1,
        queueSubmissionCount: 1,
        composite: {
          inputTextureCount: 4,
          zeroCopyResidentTextureInputs: true,
          persistentPipeline: true,
          persistentBindGroup: true,
          persistentOutputTexture: true,
        },
      });
      expect(initial.receipt.residents).toHaveLength(4);
      expect(
        initial.receipt.residents.every(({ temporalFrame }) => !temporalFrame.historyConsumed)
      ).toBe(true);

      const moving = await graph.execute({
        residents: pairs.map(({ id, previous, current }) => ({
          id,
          input: {
            currentSpec: current,
            previousSpec: previous,
            currentViewProjection: viewProjection,
            feedback: 0.5,
            historyValid: true,
          },
        })),
        capturePixels: true,
      });
      expect(moving.receipt).toMatchObject({
        deviceExecutionMeasured: true,
        evidenceFrameReadbackCount: 1,
        timestampMetadataReadbackCount: graph.timestampQueryEnabled ? 1 : 0,
        timedScope: graph.timestampQueryEnabled
          ? 'four-character-color-motion-depth-temporal-through-composite-gpu-scope'
          : 'not-measured',
        cpuMotionDerivationExcludedFromTimedScope: true,
        cpuToGpuUploadsExcludedFromTimedScope: true,
        historyCopiesExcludedFromTimedScope: true,
        evidenceAndTimestampReadbackExcludedFromTimedScope: true,
      });
      expect(moving.receipt.residents).toHaveLength(4);
      for (const resident of moving.receipt.residents) {
        expect(resident.temporalFrame).toMatchObject({
          historyConsumed: true,
          intermediateFrameReadbackCount: 0,
          evidenceFrameReadbackCount: 0,
          timestampMetadataReadbackCount: 0,
          commandBufferCount: 1,
          queueSubmissionCount: 1,
        });
        expect(resident.temporalFrame.motionDerivation.movingVertexCount).toBeGreaterThan(0);
        expect(resident.temporalFrame.motionDepth.maximumMagnitudePixels).toBeGreaterThan(0);
      }
      expect(moving.pixels).not.toBeNull();
      expect(moving.pixels).toMatchObject({ width: size * 2, height: size * 2 });
      expect(moving.pixels!.data.some((channel, index) => index % 4 !== 3 && channel > 40)).toBe(
        true
      );

      if (graph.timestampQueryEnabled) {
        expect(moving.receipt.gpuTimestampMeasured).toBe(true);
        expect(moving.receipt.durations.compositeNanoseconds).toBeGreaterThan(0);
        expect(moving.receipt.durations.aggregateNanoseconds).toBeGreaterThan(0);
        for (const resident of moving.receipt.durations.residents) {
          expect(resident.characterColorNanoseconds).toBeGreaterThan(0);
          expect(resident.motionDepthNanoseconds).toBeGreaterThan(0);
          expect(resident.temporalResolveNanoseconds).toBeGreaterThan(0);
          expect(resident.aggregateNanoseconds).toBeGreaterThan(0);
        }
      } else {
        expect(moving.receipt).toMatchObject({
          gpuTimestampMeasured: false,
          timingClassification: 'feature-not-enabled',
        });
      }

      graph.destroy();
    }
  );
});
