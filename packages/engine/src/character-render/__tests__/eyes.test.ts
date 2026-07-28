/**
 * eyes tests — refractive eye geometry + material group.
 *
 * Pure-data: two eyeball spheres skin to the head bone, sit at the front of the face, and the
 * combined mesh exposes a non-empty eyeRange whose indices are valid + after the hair range.
 * GPU-gated: the eye material group adds a bright catchlight in the head region (eyes vs no-eyes).
 */
import { describe, it, expect } from 'vitest';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import {
  buildAgentAvatarEyes,
  buildAgentAvatarOcularRegions,
  buildCharacterMesh,
} from '../AgentAvatarHair';
import { CharacterHost } from '../CharacterHost';
import { packCharacterMaterial, renderCharacter } from '../character-render';
import { HUMANOID_BONE_NAMES } from '../../character/HumanoidSkeleton';
import type { PixelGrid } from '../../native-render/gpu-verify';

const HEAD_INDEX = HUMANOID_BONE_NAMES.indexOf('head');

/** Brightest luma in the top band (the wet eye catchlight shows up here). */
function maxLumaInBand(g: PixelGrid, y0: number, y1: number): number {
  let m = 0;
  const r0 = Math.floor(y0 * g.height),
    r1 = Math.floor(y1 * g.height);
  for (let row = r0; row < r1; row++) {
    for (let col = 0; col < g.width; col++) {
      const i = (row * g.width + col) * 4;
      m = Math.max(m, g.data[i] + g.data[i + 1] + g.data[i + 2]);
    }
  }
  return m;
}

function changedPixelCount(a: PixelGrid, b: PixelGrid): number {
  let changed = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    if (
      Math.abs(a.data[index] - b.data[index]) +
        Math.abs(a.data[index + 1] - b.data[index + 1]) +
        Math.abs(a.data[index + 2] - b.data[index + 2]) >
      8
    ) {
      changed++;
    }
  }
  return changed;
}

function headFramingMatrix(): Float32Array {
  const matrix = new Float32Array(16);
  const halfHeight = 0.15;
  matrix[0] = 1 / 0.18;
  matrix[5] = 1 / halfHeight;
  matrix[10] = -1 / 3;
  matrix[13] = -1.63 / halfHeight;
  matrix[14] = 0.5;
  matrix[15] = 1;
  return matrix;
}

const itGpu = GPU_LIVE ? it : it.skip;

describe('eyes — refractive eye geometry (pure data)', () => {
  it('two eyeballs skin to the head bone at the front of the face', () => {
    const eyes = buildAgentAvatarEyes();
    expect(eyes.vertexCount).toBeGreaterThan(100);
    for (let i = 0; i < eyes.vertexCount; i++) {
      expect(eyes.jointIndices[i]).toBe(HEAD_INDEX);
      expect(eyes.jointWeights[i]).toBe(1);
    }
    // Eyes sit on the face: above mid-head (y>1.55) and forward (+Z).
    let minY = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < eyes.vertexCount; i++) {
      minY = Math.min(minY, eyes.positions[i * 3 + 1]);
      maxZ = Math.max(maxZ, eyes.positions[i * 3 + 2]);
    }
    expect(minY).toBeGreaterThan(1.55);
    expect(maxZ).toBeGreaterThan(0.05);
  });

  it('combined mesh exposes a valid eyeRange after body+hair', () => {
    const c = buildCharacterMesh({ entityId: 'brittney' });
    expect(c.eyeRange.indexStart).toBe(c.hairRange.indexStart + c.hairRange.indexCount);
    expect(c.eyeRange.indexCount).toBeGreaterThan(0);
    expect(c.bodyRange.indexCount + c.hairRange.indexCount + c.eyeRange.indexCount).toBe(
      c.mesh.indices.length
    );
  });

  it('layered profile emits two native ranges for sclera, iris, pupil, and cornea', () => {
    const eyes = buildAgentAvatarOcularRegions({
      faceTopology: 'neutral-anatomical-v2',
      irisScale: 0.51,
      pupilScale: 0.37,
    });
    expect(eyes.vertexCount).toBeGreaterThan(500);
    expect(eyes.uvs.length).toBe(eyes.vertexCount * 2);
    for (const region of ['sclera', 'iris', 'pupil', 'cornea'] as const) {
      expect(eyes.regionRanges[region]).toHaveLength(2);
      expect(eyes.regionRanges[region].every((range) => range.indexCount > 0)).toBe(true);
    }

    const combined = buildCharacterMesh({
      entityId: 'native-ocular',
      faceTopology: 'neutral-anatomical-v2',
      ocularProfile: 'layered-ocular-v1',
    });
    expect(combined.ocularProfile).toBe('layered-ocular-v1');
    expect(
      Object.values(combined.ocularRanges)
        .flat()
        .reduce((sum, range) => sum + range.indexCount, 0)
    ).toBe(combined.eyeRange.indexCount);
  });

  it('recessed orbital fit moves the layered globes behind native eyelid shells', () => {
    const exposed = buildAgentAvatarOcularRegions({
      faceTopology: 'neutral-anatomical-v2',
    });
    const recessed = buildAgentAvatarOcularRegions({
      faceTopology: 'neutral-anatomical-v2',
      orbitalProfile: 'recessed-lids-v1',
      eyeRecess: 0.3,
    });
    const maxZ = (positions: Float32Array): number => {
      let result = -Infinity;
      for (let offset = 2; offset < positions.length; offset += 3) {
        result = Math.max(result, positions[offset]);
      }
      return result;
    };
    expect(maxZ(recessed.positions)).toBeLessThan(maxZ(exposed.positions) - 0.004);

    const combined = buildCharacterMesh({
      faceTopology: 'neutral-anatomical-v2',
      faceTearline: true,
      orbitalProfile: 'recessed-lids-v1',
      eyeRecess: 0.3,
      lidOpening: 0.54,
      canthalTilt: 0.14,
      ocularProfile: 'layered-ocular-v1',
    });
    expect(combined.orbital).toMatchObject({
      profile: 'recessed-lids-v1',
      eyeRecess: 0.3,
      lidOpening: 0.54,
      canthalTilt: 0.14,
    });
  });

  it('serializes one material group per layered eye region without changing the default profile', () => {
    const legacy = new CharacterHost({ entityId: 'legacy-eye' }).getDrawSpec();
    expect(
      legacy.materialGroups?.filter((group) => group.material.shadingModel === 'refractive-eye')
    ).toHaveLength(1);

    const layered = new CharacterHost({
      entityId: 'layered-eye',
      faceTopology: 'neutral-anatomical-v2',
      ocularProfile: 'layered-ocular-v1',
      irisColor: 0x4f7f9c,
      scleraColor: 0xeee9df,
      irisScale: 0.5,
      pupilScale: 0.38,
      corneaIor: 1.376,
    }).getDrawSpec();
    const ocular = layered.materialGroups?.filter(
      (group) => group.material.shadingModel === 'refractive-eye'
    );
    expect(ocular).toHaveLength(8);
    const regions = ocular?.map((group) =>
      group.material.shadingModel === 'refractive-eye' ? group.material.eyeRegion : undefined
    );
    for (const region of ['sclera', 'iris', 'pupil', 'cornea'] as const) {
      expect(regions?.filter((candidate) => candidate === region)).toHaveLength(2);
    }
    expect(
      ocular
        ?.filter(
          (group) =>
            group.material.shadingModel === 'refractive-eye' &&
            group.material.eyeRegion === 'cornea'
        )
        .every((group) => group.transparent === true)
    ).toBe(true);

    const packedCodes = ['sclera', 'iris', 'pupil', 'cornea'].map(
      (eyeRegion) =>
        packCharacterMaterial({
          shadingModel: 'refractive-eye',
          eyeRegion: eyeRegion as 'sclera' | 'iris' | 'pupil' | 'cornea',
          color: 0xffffff,
          metalness: 0,
          roughness: 0.1,
          emissive: 0,
          opacity: 1,
          ior: 1.376,
        })[5]
    );
    expect(packedCodes).toEqual([1, 2, 3, 4]);
  });
});

describe('eyes — rendered (native WebGPU)', () => {
  itGpu('the eye material group adds a bright catchlight in the head region', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    const spec = host.getDrawSpec(); // body + hair + eyes
    const withEyes = await renderCharacter(testDevice!, spec, { size: 256 });
    const noEyes = await renderCharacter(
      testDevice!,
      { ...spec, materialGroups: spec.materialGroups!.slice(0, 2) }, // body + hair only
      { size: 256 }
    );
    // The wet specular catchlight pushes peak brightness up in the head band.
    expect(maxLumaInBand(withEyes, 0.0, 0.35)).toBeGreaterThan(maxLumaInBand(noEyes, 0.0, 0.35));
  });

  itGpu(
    'the layered ocular profile renders its native opaque and transparent regions',
    async () => {
      const legacy = new CharacterHost({
        entityId: 'ocular-gpu',
        faceTopology: 'neutral-anatomical-v2',
        irisColor: 0x80512e,
      }).getDrawSpec();
      const layered = new CharacterHost({
        entityId: 'ocular-gpu',
        faceTopology: 'neutral-anatomical-v2',
        ocularProfile: 'layered-ocular-v1',
        irisColor: 0x3e82a3,
        scleraColor: 0xf0ebe2,
        irisScale: 0.52,
        pupilScale: 0.36,
        corneaIor: 1.376,
      }).getDrawSpec();
      const viewProj = headFramingMatrix();
      const legacyPixels = await renderCharacter(testDevice!, legacy, { size: 256, viewProj });
      const layeredPixels = await renderCharacter(testDevice!, layered, { size: 256, viewProj });
      expect(changedPixelCount(layeredPixels, legacyPixels)).toBeGreaterThan(80);
      expect(maxLumaInBand(layeredPixels, 0.0, 1.0)).toBeGreaterThan(0);
    }
  );

  itGpu(
    'the recessed-lids profile changes native head pixels around the layered eyes',
    async () => {
      const exposed = new CharacterHost({
        entityId: 'orbital-gpu',
        faceTopology: 'neutral-anatomical-v2',
        ocularProfile: 'layered-ocular-v1',
        irisColor: 0x4f7f9c,
      }).getDrawSpec();
      const fitted = new CharacterHost({
        entityId: 'orbital-gpu',
        faceTopology: 'neutral-anatomical-v2',
        faceTearline: true,
        orbitalProfile: 'recessed-lids-v1',
        eyeRecess: 0.3,
        lidOpening: 0.54,
        canthalTilt: 0.14,
        ocularProfile: 'layered-ocular-v1',
        irisColor: 0x4f7f9c,
      }).getDrawSpec();
      const viewProj = headFramingMatrix();
      const exposedPixels = await renderCharacter(testDevice!, exposed, { size: 256, viewProj });
      const fittedPixels = await renderCharacter(testDevice!, fitted, { size: 256, viewProj });
      expect(changedPixelCount(fittedPixels, exposedPixels)).toBeGreaterThan(40);
    }
  );
});
