/**
 * renderCharacter baseColor texture bindings: a 2x2 synthetic checker on a quad must render
 * its four texel colours at known pixels through the native WebGPU path (headless Dawn), and
 * the untextured path must stay a flat colour. Synthetic textures only; no imported assets.
 */
import { describe, it, expect } from 'vitest';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import {
  renderCharacter,
  deriveCharacterTextureBindingReceipt,
  CHARACTER_TEXTURE_BIND_GROUP,
} from '../character-render';
import { JOINT_COUNT } from '../AgentAvatarMesh';
import type { CharacterDrawSpec, DecodedTexture } from '../../native-render/draw-spec';
import type { PixelGrid } from '../../native-render/gpu-verify';

const itGpu = GPU_LIVE ? it : it.skip;

/** 2x2 RGBA checker: red | green / blue | white (row 0 = top of image = v 0). */
function checker(): DecodedTexture {
  return {
    width: 2,
    height: 2,
    data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
    filter: 'nearest',
  };
}

/** A camera-facing quad filling clip space [-0.8, 0.8]^2, UV (0,0) at top-left. */
function quadSpec(material: CharacterDrawSpec['material']): CharacterDrawSpec {
  const s = 0.8;
  const palette = new Float32Array(JOINT_COUNT * 16);
  for (let j = 0; j < JOINT_COUNT; j++)
    palette.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], j * 16);
  return {
    entityId: 'tex-quad',
    mesh: {
      positions: new Float32Array([-s, -s, 0, s, -s, 0, s, s, 0, -s, s, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      tangents: new Float32Array([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]),
      uvs: new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      jointIndices: new Uint32Array(4),
      jointWeights: new Float32Array(4),
      vertexCount: 4,
    },
    jointMatrices: palette,
    jointCount: JOINT_COUNT,
    material,
    modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  };
}

const VIEW = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 1]);
const OPTS = {
  size: 64,
  viewProj: VIEW,
  cameraPos: [0, 0, 5] as [number, number, number],
  clear: [0, 0, 0, 1] as [number, number, number, number],
};
const WHITE = { color: 0xffffff, metalness: 0, roughness: 0.8, emissive: 0, opacity: 1 };

function px(g: PixelGrid, x: number, y: number): [number, number, number] {
  const i = (y * g.width + x) * 4;
  return [g.data[i], g.data[i + 1], g.data[i + 2]];
}
function distinctColours(g: PixelGrid): number {
  const set = new Set<number>();
  for (let i = 0; i < g.data.length; i += 4)
    set.add((g.data[i] << 16) | (g.data[i + 1] << 8) | g.data[i + 2]);
  return set.size;
}

describe('renderCharacter - baseColor texture bindings', () => {
  it('receipt: textured lambert groups bind texture+sampler at @group(2); untextured groups do not', () => {
    const plain = deriveCharacterTextureBindingReceipt(quadSpec(WHITE));
    expect(plain.texturedGroupCount).toBe(0);
    expect(plain.groups[0]).toMatchObject({ textured: false, fragmentEntry: 'fs_lambert' });
    const tex = deriveCharacterTextureBindingReceipt(
      quadSpec({ ...WHITE, baseColorTexture: checker(), baseColorFactor: [1, 0.5, 1, 1] })
    );
    expect(CHARACTER_TEXTURE_BIND_GROUP).toBe(2);
    expect(tex.texturedGroupCount).toBe(1);
    expect(tex.groups[0]).toMatchObject({
      textured: true,
      fragmentEntry: 'fs_lambert_textured',
      textureSize: [2, 2],
      filter: 'nearest',
      baseColorFactor: [1, 0.5, 1, 1],
      bindings: [
        { group: 2, binding: 0, kind: 'texture_2d<f32>' },
        { group: 2, binding: 1, kind: 'sampler' },
      ],
    });
  });

  it('rejects a texture whose byte length does not match width*height*4', () => {
    expect(() =>
      deriveCharacterTextureBindingReceipt(
        quadSpec({ ...WHITE, baseColorTexture: { width: 2, height: 2, data: new Uint8Array(4) } })
      )
    ).toThrow(/baseColorTexture/);
  });

  itGpu('untextured path stays a single flat colour inside the quad (unchanged)', async () => {
    const g = await renderCharacter(testDevice!, quadSpec({ ...WHITE, color: 0x8080ff }), OPTS);
    const a = px(g, 16, 16),
      b = px(g, 48, 48);
    expect(a).toEqual(b);
    expect(a[2]).toBeGreaterThan(a[0]);
  });

  itGpu('2x2 checker renders its four texel colours at the four quadrants', async () => {
    const g = await renderCharacter(
      testDevice!,
      quadSpec({ ...WHITE, baseColorTexture: checker() }),
      OPTS
    );
    const [tl, tr, bl, br] = [px(g, 18, 18), px(g, 46, 18), px(g, 18, 46), px(g, 46, 46)];
    expect(tl[0]).toBeGreaterThan(120);
    expect(tl[1]).toBeLessThan(30);
    expect(tl[2]).toBeLessThan(30);
    expect(tr[1]).toBeGreaterThan(120);
    expect(tr[0]).toBeLessThan(30);
    expect(tr[2]).toBeLessThan(30);
    expect(bl[2]).toBeGreaterThan(120);
    expect(bl[0]).toBeLessThan(30);
    expect(bl[1]).toBeLessThan(30);
    expect(br[0]).toBeGreaterThan(120);
    expect(br[1]).toBeGreaterThan(120);
    expect(br[2]).toBeGreaterThan(120);
    // the flat path on the same quad is one colour; the textured one has >= 4 + background
    const flat = await renderCharacter(testDevice!, quadSpec(WHITE), OPTS);
    expect(distinctColours(g)).toBeGreaterThanOrEqual(distinctColours(flat) + 3);
    // white texel matches the flat white render exactly (texture multiplies, no other change)
    expect(br).toEqual(px(flat, 46, 46));
  });

  itGpu('baseColorFactor multiplies the sampled texel', async () => {
    const g = await renderCharacter(
      testDevice!,
      quadSpec({ ...WHITE, baseColorTexture: checker(), baseColorFactor: [0, 1, 1, 1] }),
      OPTS
    );
    const br = px(g, 46, 46);
    expect(br[0]).toBeLessThan(10);
    expect(br[1]).toBeGreaterThan(120);
    expect(px(g, 18, 18)[0]).toBeLessThan(10); // red texel x factor.r = 0
  });

  itGpu('per-group materials: one textured and one flat group in one pass', async () => {
    const base = quadSpec(WHITE);
    const spec: CharacterDrawSpec = {
      ...base,
      materialGroups: [
        {
          indexStart: 0,
          indexCount: 3,
          material: { ...WHITE, shadingModel: 'lambert', baseColorTexture: checker() },
        },
        {
          indexStart: 3,
          indexCount: 3,
          material: { ...WHITE, color: 0x0000ff, shadingModel: 'lambert' },
        },
      ],
    };
    const g = await renderCharacter(testDevice!, spec, OPTS);
    // triangle 0 (0,1,2) covers the bottom-right half; triangle 1 the top-left half
    const br = px(g, 50, 50),
      tl = px(g, 12, 12);
    expect(br[0]).toBeGreaterThan(120);
    expect(br[1]).toBeGreaterThan(120);
    expect(tl[2]).toBeGreaterThan(120);
    expect(tl[0]).toBeLessThan(30);
  });
});
