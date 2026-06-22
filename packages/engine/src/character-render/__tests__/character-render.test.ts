/**
 * character-render e2e — native WebGPU GPU-skinned humanoid → verified pixels.
 *
 * The Phase-0 falsifiable claim: a procedural humanoid (NOT a primitive/sphere) renders
 * through the native WebGPU rasterizer, and posing a joint changes the rendered pixels (GPU
 * skinning works). Gated on GPU_LIVE so it skips — never false-greens — where Dawn is absent
 * (G.GOLD.006: the headless readback is also the WASM/CPU-fallback verification floor).
 */
import { describe, it, expect } from 'vitest';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import { CharacterHost } from '../CharacterHost';
import { renderCharacter } from '../character-render';
import { quatFromAxisAngle } from '../skin-math';
import type { PixelGrid } from '../../native-render/gpu-verify';

const CLEAR = [18, 18, 23]; // 0.07,0.07,0.09 × 255

/** Count pixels that visibly differ from the clear colour (the figure). */
function figurePixels(g: PixelGrid): number {
  let n = 0;
  for (let i = 0; i < g.data.length; i += 4) {
    const d =
      Math.abs(g.data[i] - CLEAR[0]) +
      Math.abs(g.data[i + 1] - CLEAR[1]) +
      Math.abs(g.data[i + 2] - CLEAR[2]);
    if (d > 40) n++;
  }
  return n;
}

/** Figure pixels within a fractional vertical band [y0,y1) of the image (0=top, 1=bottom). */
function figureInBand(g: PixelGrid, y0: number, y1: number): number {
  let n = 0;
  const r0 = Math.floor(y0 * g.height),
    r1 = Math.floor(y1 * g.height);
  for (let row = r0; row < r1; row++) {
    for (let col = 0; col < g.width; col++) {
      const i = (row * g.width + col) * 4;
      const d =
        Math.abs(g.data[i] - CLEAR[0]) +
        Math.abs(g.data[i + 1] - CLEAR[1]) +
        Math.abs(g.data[i + 2] - CLEAR[2]);
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

describe('character-render — native WebGPU GPU-skinned humanoid', () => {
  itGpu('renders a vertically-extended humanoid (head up top, feet down low)', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    const grid = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });

    expect(figurePixels(grid)).toBeGreaterThan(150); // a real figure, not empty
    expect(figureInBand(grid, 0.0, 0.35)).toBeGreaterThan(5); // head/torso up top
    expect(figureInBand(grid, 0.65, 1.0)).toBeGreaterThan(5); // legs/feet down low
  });

  itGpu('posing the shoulder changes the rendered pixels (GPU skinning works)', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    const bind = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });

    host.setBoneRotation('left_upper_arm', quatFromAxisAngle(0, 0, 1, -1.2));
    const posed = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });

    expect(pixelDiff(bind, posed)).toBeGreaterThan(30); // the arm moved
  });

  it('GPU_LIVE gate is recorded (pixel tests skip, never false-pass, when no live GPU)', () => {
    expect(typeof GPU_LIVE).toBe('boolean');
  });
});

describe('character-render — material groups (skin-SSS) + lambert fallback', () => {
  itGpu('the lambert fallback path (no materialGroups) still renders a figure', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    const spec = host.getDrawSpec();
    // Strip groups → exercise the single-draw lambert fallback (the additive guard).
    const fallback = { ...spec, materialGroups: undefined };
    const grid = await renderCharacter(testDevice!, fallback, { size: 128 });
    expect(figurePixels(grid)).toBeGreaterThan(150);
  });

  itGpu('SSS skin shades differently from the flat lambert fallback', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    const spec = host.getDrawSpec(); // emits a skin-sss material group
    const skin = await renderCharacter(testDevice!, spec, { size: 128 });
    const lambert = await renderCharacter(testDevice!, { ...spec, materialGroups: undefined }, { size: 128 });
    // Same silhouette, different shading → many pixels differ but the figure area is similar.
    expect(pixelDiff(skin, lambert)).toBeGreaterThan(50);
    expect(figurePixels(skin)).toBeGreaterThan(150);
  });
});
