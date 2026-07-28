/**
 * hair tests — procedural hair geometry + combined body+hair mesh.
 *
 * Pure-data: every hair vertex skins to the head bone (index + weight), strand tangents are
 * unit-length, strandT spans 0..1, hair sits above the head anchor, and the combined mesh
 * concatenates body+hair with correct index ranges. GPU-gated: hair adds pixels above the
 * head, and a head-bone pose rotation moves the hair with the head (proves palette reuse).
 */
import { describe, it, expect } from 'vitest';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import {
  AGENT_AVATAR_HAIR_STYLES,
  buildAgentAvatarHair,
  buildCharacterMesh,
  resolveAgentAvatarHairStyle,
} from '../AgentAvatarHair';
import { CharacterHost } from '../CharacterHost';
import { renderCharacter } from '../character-render';
import { quatFromAxisAngle } from '../skin-math';
import { HUMANOID_BONE_NAMES } from '../../character/HumanoidSkeleton';
import type { PixelGrid } from '../../native-render/gpu-verify';

const HEAD_INDEX = HUMANOID_BONE_NAMES.indexOf('head');

function bandFigure(g: PixelGrid, y0: number, y1: number): number {
  const clear = [18, 18, 23];
  let n = 0;
  const r0 = Math.floor(y0 * g.height),
    r1 = Math.floor(y1 * g.height);
  for (let row = r0; row < r1; row++) {
    for (let col = 0; col < g.width; col++) {
      const i = (row * g.width + col) * 4;
      const d =
        Math.abs(g.data[i] - clear[0]) +
        Math.abs(g.data[i + 1] - clear[1]) +
        Math.abs(g.data[i + 2] - clear[2]);
      if (d > 40) n++;
    }
  }
  return n;
}
function pixelDiff(a: PixelGrid, b: PixelGrid): number {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d =
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 40) n++;
  }
  return n;
}

const itGpu = GPU_LIVE ? it : it.skip;

describe('hair — procedural geometry (pure data)', () => {
  it('every hair vertex skins to the head bone with real tangent + strandT', () => {
    const hair = buildAgentAvatarHair();
    expect(hair.vertexCount).toBeGreaterThan(100);
    expect(hair.tangents.length).toBe(hair.vertexCount * 4);

    let minY = Infinity;
    for (let i = 0; i < hair.vertexCount; i++) {
      expect(hair.jointIndices[i]).toBe(HEAD_INDEX); // rides the head bone
      expect(hair.jointWeights[i]).toBe(1);
      const tx = hair.tangents[i * 4],
        ty = hair.tangents[i * 4 + 1],
        tz = hair.tangents[i * 4 + 2],
        st = hair.tangents[i * 4 + 3];
      expect(Math.hypot(tx, ty, tz)).toBeCloseTo(1, 1); // unit tangent
      expect(st).toBeGreaterThanOrEqual(0);
      expect(st).toBeLessThanOrEqual(1);
      minY = Math.min(minY, hair.positions[i * 3 + 1]);
    }
    expect(minY).toBeGreaterThan(1.4); // sits on/above the head (world-bind y≈1.51)
    // strandT actually varies (not all root / all tip — the bug the critique caught).
    const ts = new Set(
      Array.from({ length: hair.vertexCount }, (_, i) => hair.tangents[i * 4 + 3])
    );
    expect(ts.size).toBeGreaterThan(1);
  });

  it('combined mesh concatenates body+hair with contiguous, exhaustive index ranges', () => {
    const c = buildCharacterMesh({ entityId: 'brittney' });
    expect(c.bodyRange.indexStart).toBe(0);
    expect(c.hairRange.indexStart).toBe(c.bodyRange.indexCount);
    // body + hair + eyes are contiguous and exhaustive over the index buffer.
    expect(c.bodyRange.indexCount + c.hairRange.indexCount + c.eyeRange.indexCount).toBe(
      c.mesh.indices.length
    );
    // every index addresses a real vertex; tangents present for all
    expect(c.mesh.tangents.length).toBe(c.mesh.vertexCount * 4);
    for (let i = 0; i < c.mesh.indices.length; i++) {
      expect(c.mesh.indices[i]).toBeLessThan(c.mesh.vertexCount);
    }
  });

  it('neutral anatomical faces use a smaller embedded ocular surface', () => {
    const legacy = buildCharacterMesh({ includeHair: false });
    const anatomical = buildCharacterMesh({
      includeHair: false,
      faceTopology: 'neutral-anatomical-v2',
    });
    const firstEyeDiameter = (mesh: typeof legacy) => {
      const start = mesh.eyeVertexRange.vertexStart;
      const end = start + mesh.eyeVertexRange.vertexCount / 2;
      let minX = Infinity;
      let maxX = -Infinity;
      for (let vertex = start; vertex < end; vertex++) {
        const x = mesh.mesh.positions[vertex * 3];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
      return maxX - minX;
    };
    expect(firstEyeDiameter(anatomical)).toBeLessThan(firstEyeDiameter(legacy) * 0.8);
  });

  it('source style profiles are deterministic and materially change native topology', () => {
    const signatures = new Set<string>();
    for (const style of AGENT_AVATAR_HAIR_STYLES) {
      const first = buildAgentAvatarHair({ style });
      const replay = buildAgentAvatarHair({ style });
      expect(Array.from(replay.positions)).toEqual(Array.from(first.positions));
      expect(Array.from(replay.indices)).toEqual(Array.from(first.indices));
      signatures.add(
        `${first.vertexCount}:${Array.from(first.positions.slice(-24))
          .map((value) => value.toFixed(5))
          .join(',')}`
      );
    }
    expect(signatures.size).toBe(AGENT_AVATAR_HAIR_STYLES.length);
    expect(buildAgentAvatarHair({ style: 'long' }).vertexCount).toBeGreaterThan(
      buildAgentAvatarHair({ style: 'short' }).vertexCount
    );
    expect(resolveAgentAvatarHairStyle('Medium Wavy')).toBe('medium_wavy');
    expect(resolveAgentAvatarHairStyle('not_a_style')).toBeUndefined();
  });

  it('source-authored hair topology budgets reduce guides, cards, and curve segments', () => {
    const lod0 = buildAgentAvatarHair({
      style: 'cropped_coils',
      guides: 168,
      cardsPerGuide: 2,
      segments: 7,
    });
    const lod1 = buildAgentAvatarHair({
      style: 'cropped_coils',
      guides: 92,
      cardsPerGuide: 1,
      segments: 5,
    });
    const lod2 = buildAgentAvatarHair({
      style: 'cropped_coils',
      guides: 48,
      cardsPerGuide: 1,
      segments: 3,
    });

    expect(lod0.vertexCount).toBeGreaterThan(lod1.vertexCount);
    expect(lod1.vertexCount).toBeGreaterThan(lod2.vertexCount);
    expect(lod0.indices.length).toBeGreaterThan(lod1.indices.length);
    expect(lod1.indices.length).toBeGreaterThan(lod2.indices.length);
    expect(
      Array.from(
        buildAgentAvatarHair({
          style: 'cropped_coils',
          guides: 48,
          cardsPerGuide: 1,
          segments: 3,
        }).positions
      )
    ).toEqual(Array.from(lod2.positions));
  });
});

describe('hair — rendered (native WebGPU)', () => {
  itGpu('hair adds pixels in the head band vs a body with no hair group', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    const spec = host.getDrawSpec(); // body=skin + hair=marschner
    const withHair = await renderCharacter(testDevice!, spec, { size: 128 });
    // Same mesh, but only the body (skin) group → no hair drawn.
    const bodyOnly = await renderCharacter(
      testDevice!,
      { ...spec, materialGroups: spec.materialGroups!.slice(0, 1) },
      { size: 128 }
    );
    // Head band (top ~30%) gains pixels when hair is drawn.
    expect(bandFigure(withHair, 0.0, 0.3)).toBeGreaterThan(bandFigure(bodyOnly, 0.0, 0.3));
  });

  itGpu('hair moves with a head-bone pose (palette reuse skins it)', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    const a = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });
    host.setBoneRotation('head', quatFromAxisAngle(0, 0, 1, 0.5)); // tilt head
    const b = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });
    expect(pixelDiff(a, b)).toBeGreaterThan(20); // head + hair tilt together
  });
});
