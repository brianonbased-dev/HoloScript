import { describe, it, expect } from 'vitest';
import { mapVrmToAvatar } from '../index';

describe('vrm-avatar-plugin stub', () => {
  it('emits @avatar_rig with bone_coverage from required-humanoid bones', () => {
    const r = mapVrmToAvatar({
      name: 'hero',
      version: '1.0',
      humanoid_bones: {
        hips: 'hips_node',
        spine: 'spine_node',
        head: 'head_node',
        leftUpperArm: 'la',
        rightUpperArm: 'ra',
        leftUpperLeg: 'll',
        rightUpperLeg: 'rl',
      },
    });
    expect(r.rig.kind).toBe('@avatar_rig');
    expect(r.bone_coverage).toBeCloseTo(1);
  });

  it('maps each expression preset to @expression trait', () => {
    const r = mapVrmToAvatar({
      name: 'hero',
      version: '1.0',
      humanoid_bones: { hips: 'h' },
      expressions: [
        { preset: 'happy', target_shape_keys: ['mouth_smile', 'eye_close'] },
        { preset: 'blink', target_shape_keys: ['eye_close_l', 'eye_close_r'] },
      ],
    });
    expect(r.expressions.length).toBe(2);
    expect(r.expressions[0].target_id).toBe('hero:happy');
  });

  it('partial bone coverage reports fractional score', () => {
    const r = mapVrmToAvatar({ name: 'h', version: '1.0', humanoid_bones: { hips: 'x', spine: 'y' } });
    expect(r.bone_coverage).toBeCloseTo(2 / 7);
  });
});
