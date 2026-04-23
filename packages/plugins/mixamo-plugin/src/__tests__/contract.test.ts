/**
 * @holoscript/mixamo-plugin — ADAPTER CONTRACT TEST
 *
 * Universal-IR coverage row 6 (Mixamo). 🔴 + 🟡 Stub — read-only metadata only.
 */
import { describe, it, expect } from 'vitest';
import * as mod from '../index';
import { mapMixamoClip, type MixamoClipMetadata } from '../index';

function clip(overrides: Partial<MixamoClipMetadata> = {}): MixamoClipMetadata {
  return {
    clip_id: 'clip_123',
    name: 'Walk Forward',
    duration_seconds: 2.0,
    fps: 30,
    bone_names: ['Hips', 'Spine', 'Head', 'LeftArm', 'RightArm', 'LeftLeg', 'RightLeg'],
    in_place: true,
    ...overrides,
  };
}

describe('CONTRACT: mixamo-plugin adapter', () => {
  it('exposes mapMixamoClip at stable public path', () => {
    expect(typeof mod.mapMixamoClip).toBe('function');
  });

  it('trait.kind is @anim_clip and target_id preserves clip_id', () => {
    const r = mapMixamoClip(clip());
    expect(r.trait.kind).toBe('@anim_clip');
    expect(r.trait.target_id).toBe('clip_123');
  });

  it('frame_count = round(duration_seconds * fps)', () => {
    expect(mapMixamoClip(clip({ duration_seconds: 2, fps: 30 })).trait.params.frame_count).toBe(60);
    expect(mapMixamoClip(clip({ duration_seconds: 1.5, fps: 24 })).trait.params.frame_count).toBe(36);
  });

  it('retarget_compat is one of vrm | urdf | unknown', () => {
    for (const fps of [24, 30, 60]) {
      const r = mapMixamoClip(clip({ fps }));
      expect(['vrm', 'urdf', 'unknown']).toContain(r.retarget_compat);
    }
  });

  it('vrm-like skeleton with ≥5 bone hints → retarget_compat=vrm', () => {
    const r = mapMixamoClip(clip());
    expect(r.retarget_compat).toBe('vrm');
  });

  it('sparse skeleton → retarget_compat=unknown', () => {
    const r = mapMixamoClip(clip({ bone_names: ['Bone1', 'Bone2'] }));
    expect(r.retarget_compat).toBe('unknown');
  });

  it('unusual fps (e.g. 45) produces a warning', () => {
    const r = mapMixamoClip(clip({ fps: 45 }));
    expect(r.warnings.some((w) => /fps/.test(w))).toBe(true);
  });

  it('with-root-motion clip lacking a root bone produces a warning', () => {
    const r = mapMixamoClip(clip({ in_place: false, bone_names: ['Hips', 'Head'] }));
    expect(r.warnings.some((w) => /root/i.test(w))).toBe(true);
  });

  it('in_place is preserved on trait params', () => {
    const r = mapMixamoClip(clip({ in_place: false }));
    expect(r.trait.params.in_place).toBe(false);
  });
});
