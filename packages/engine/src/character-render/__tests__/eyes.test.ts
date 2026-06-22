/**
 * eyes tests — refractive eye geometry + material group.
 *
 * Pure-data: two eyeball spheres skin to the head bone, sit at the front of the face, and the
 * combined mesh exposes a non-empty eyeRange whose indices are valid + after the hair range.
 * GPU-gated: the eye material group adds a bright catchlight in the head region (eyes vs no-eyes).
 */
import { describe, it, expect } from 'vitest';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import { buildAgentAvatarEyes, buildCharacterMesh } from '../AgentAvatarHair';
import { CharacterHost } from '../CharacterHost';
import { renderCharacter } from '../character-render';
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
});
