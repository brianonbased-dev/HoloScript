/**
 * gait tests — skeletal locomotion. Pure-data: the stride animates over time, legs swing in
 * opposite phase, idle drops the arms. GPU-gated: idle differs from the T-pose bind, and a
 * walk stride changes the rendered pixels across its phase (the body actually strides).
 */
import { describe, it, expect } from 'vitest';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import { gaitPose } from '../gait';
import { CharacterHost } from '../CharacterHost';
import { renderCharacter } from '../character-render';
import type { PixelGrid } from '../../native-render/gpu-verify';

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

describe('gait — skeletal locomotion (pure data)', () => {
  it('walk swings legs in opposite phase and animates over time', () => {
    const mid = gaitPose('walk', 0.45); // mid-stride (≈ quarter phase)
    const lThigh = mid.get('left_upper_leg')!;
    const rThigh = mid.get('right_upper_leg')!;
    expect(lThigh).toBeDefined();
    expect(rThigh).toBeDefined();
    // Opposite fore/aft swing → opposite-sign X rotation component.
    expect(lThigh.x * rThigh.x).toBeLessThan(0);

    // The pose evolves over time (it's a cycle, not a static stance).
    const a = gaitPose('walk', 0.2).get('left_upper_leg')!;
    const b = gaitPose('walk', 0.6).get('left_upper_leg')!;
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(0.05);
  });

  it('idle drops the arms but keeps the legs at rest', () => {
    const pose = gaitPose('idle', 0.5);
    const lArm = pose.get('left_upper_arm')!;
    expect(lArm.w).toBeLessThan(0.999); // not identity — arm rotated down
    const lThigh = pose.get('left_upper_leg')!;
    expect(Math.abs(lThigh.x)).toBeLessThan(1e-6); // legs at rest in idle
  });
});

describe('gait — rendered locomotion (native WebGPU)', () => {
  itGpu('idle pose visibly differs from the T-pose bind', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    const bind = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });
    host.applyLocomotion('idle', 0);
    const idle = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });
    expect(pixelDiff(bind, idle)).toBeGreaterThan(100); // arms drop from horizontal
  });

  itGpu('a walk stride changes the rendered pixels across its phase', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    host.applyLocomotion('walk', 0.45);
    const a = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });
    host.applyLocomotion('walk', 1.35); // ~half a cycle later — legs swapped
    const b = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });
    expect(pixelDiff(a, b)).toBeGreaterThan(30);
  });
});
