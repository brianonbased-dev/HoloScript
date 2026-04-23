import { describe, it, expect } from 'vitest';
import { mapMixamoClip } from '../index';

describe('mixamo-plugin stub', () => {
  it('flags VRM-compatible skeleton', () => {
    const r = mapMixamoClip({
      clip_id: 'walk',
      name: 'Walking',
      duration_seconds: 1.5,
      fps: 30,
      bone_names: ['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Head', 'mixamorig:LeftArm', 'mixamorig:RightArm', 'mixamorig:LeftLeg', 'mixamorig:RightLeg'],
      in_place: true,
    });
    expect(r.retarget_compat).toBe('vrm');
    expect(r.trait.params.frame_count).toBe(45);
  });

  it('warns on with-root-motion clip lacking root bone', () => {
    const r = mapMixamoClip({
      clip_id: 'run',
      name: 'Running',
      duration_seconds: 1,
      fps: 30,
      bone_names: ['mixamorig:Hips'],
      in_place: false,
    });
    expect(r.warnings.some((w) => w.includes('root'))).toBe(true);
  });

  it('warns on unusual fps', () => {
    const r = mapMixamoClip({
      clip_id: 'x',
      name: 'Odd',
      duration_seconds: 1,
      fps: 25,
      bone_names: ['root'],
      in_place: true,
    });
    expect(r.warnings.some((w) => w.includes('fps'))).toBe(true);
  });
});
