import { describe, expect, it } from 'vitest';
import { LoroDoc } from 'loro-crdt';
import { FILM3D_VOLUMETRICS_ROOT, syncVirtualProductionToVolumetricCrdt } from './volumetricLoroBridge';
import type { VirtualProductionConfig } from './traits/VirtualProductionTrait';

const sampleVp: VirtualProductionConfig = {
  stageId: 'stage_a',
  walls: [
    {
      id: 'wall_main',
      layout: 'flat_wall',
      dimensions: [6, 3],
      resolution: [3840, 2160],
      pixelPitch: 2.5,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    },
  ],
  frustum: {
    sensorWidth: 36,
    sensorHeight: 24,
    focalLength: 50,
    nearClip: 0.1,
    farClip: 100,
  },
  tracking: { system: 'mo-sys' },
  syncMode: 'genlock',
  frameRate: 24,
};

describe('syncVirtualProductionToVolumetricCrdt', () => {
  it('writes FilmVFX VP snapshot under film3d_volumetrics', () => {
    const doc = new LoroDoc();
    syncVirtualProductionToVolumetricCrdt(doc, sampleVp);

    const root = doc.getMap(FILM3D_VOLUMETRICS_ROOT);
    const meta = root.get('filmvfx_vp_stage_a::meta') as string;
    expect(meta).toBeDefined();
    const parsed = JSON.parse(meta!) as { source: string; stageId: string; wallCount: number };
    expect(parsed.source).toBe('FilmVFXPlugin');
    expect(parsed.stageId).toBe('stage_a');
    expect(parsed.wallCount).toBe(1);
  });
});
