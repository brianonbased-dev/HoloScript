/**
 * @holoscript/vrm-avatar-plugin — ADAPTER CONTRACT TEST
 *
 * Contract gate for the VRM 1.0 column of the Universal-IR coverage matrix
 * (docs/universal-ir-coverage.md). MUST keep passing or the matrix row cannot
 * claim "✅ Native (subset) + 🟡 Stub" status.
 *
 * Source: .ai-ecosystem/research/reviews/2026-04-23-wave-d-negative-sweep/stream-3-universal-ir-negative-sweep.md
 * Audit task: task_1776937048052_ybf4 (Wave D negative sweep, stream 3)
 *
 * Contract surface (what the adapter promises):
 *   1. mapVrmToAvatar returns an emission with kind: '@avatar_rig' on rig.
 *   2. target_id on the rig matches the input vrm.name (identity preserved).
 *   3. bone_coverage is in [0, 1] and tracks the 7 required-humanoid bones.
 *   4. Full required-bone set → coverage === 1 (within float tolerance).
 *   5. No expressions input → emissions.expressions is [] (never undefined).
 *   6. Each expression preset produces exactly one @expression emission with
 *      stable target_id format "<name>:<preset>".
 *   7. Adapter never mutates the input VRM object.
 */
import { describe, it, expect } from 'vitest';
import * as mod from '../index';
import { mapVrmToAvatar, type VrmAvatar } from '../index';

const FULL_REQUIRED: VrmAvatar = {
  name: 'hero',
  version: '1.0',
  humanoid_bones: {
    hips: 'h',
    spine: 's',
    head: 'hd',
    leftUpperArm: 'la',
    rightUpperArm: 'ra',
    leftUpperLeg: 'll',
    rightUpperLeg: 'rl',
  },
};

describe('CONTRACT: vrm-avatar-plugin adapter', () => {
  it('exposes mapVrmToAvatar at a stable public path', () => {
    expect(typeof mod.mapVrmToAvatar).toBe('function');
  });

  it('returns rig with kind "@avatar_rig"', () => {
    const out = mapVrmToAvatar(FULL_REQUIRED);
    expect(out.rig.kind).toBe('@avatar_rig');
  });

  it('rig.target_id preserves vrm.name identity', () => {
    const out = mapVrmToAvatar(FULL_REQUIRED);
    expect(out.rig.target_id).toBe('hero');
  });

  it('bone_coverage stays in [0, 1] and tracks the 7 required bones', () => {
    const out = mapVrmToAvatar(FULL_REQUIRED);
    expect(out.bone_coverage).toBeGreaterThanOrEqual(0);
    expect(out.bone_coverage).toBeLessThanOrEqual(1);
    expect(out.bone_coverage).toBeCloseTo(1);
  });

  it('partial bone set → fractional coverage', () => {
    const out = mapVrmToAvatar({
      name: 'x',
      version: '1.0',
      humanoid_bones: { hips: 'a', spine: 'b', head: 'c' },
    });
    expect(out.bone_coverage).toBeCloseTo(3 / 7);
  });

  it('omitted expressions → emissions.expressions is an empty array (never undefined)', () => {
    const out = mapVrmToAvatar(FULL_REQUIRED);
    expect(Array.isArray(out.expressions)).toBe(true);
    expect(out.expressions.length).toBe(0);
  });

  it('each expression preset yields one emission with stable "<name>:<preset>" target_id', () => {
    const out = mapVrmToAvatar({
      ...FULL_REQUIRED,
      expressions: [
        { preset: 'happy', target_shape_keys: ['s1'] },
        { preset: 'blink', target_shape_keys: ['s2', 's3'] },
      ],
    });
    expect(out.expressions.length).toBe(2);
    expect(out.expressions[0].kind).toBe('@expression');
    expect(out.expressions[0].target_id).toBe('hero:happy');
    expect(out.expressions[1].target_id).toBe('hero:blink');
  });

  it('adapter does not mutate the input VRM object', () => {
    const input: VrmAvatar = {
      name: 'h',
      version: '1.0',
      humanoid_bones: { hips: 'h1' },
      expressions: [{ preset: 'neutral', target_shape_keys: ['s'] }],
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    mapVrmToAvatar(input);
    expect(input).toEqual(snapshot);
  });
});
