import { describe, it, expect } from 'vitest';
import { bindRemotionR3F } from '../index';

describe('remotion-r3f-plugin stub', () => {
  it('computes duration seconds from fps + frame count', () => {
    const r = bindRemotionR3F(
      { id: 'intro', width: 1920, height: 1080, fps: 30, duration_frames: 90 },
      { composition_id: 'intro', scene_ref: 'scenes/Hero', camera_mode: 'tracking' }
    );
    expect(r.duration_seconds).toBeCloseTo(3);
    expect(r.frame_count).toBe(90);
  });

  it('defaults render_passes to [color]', () => {
    const r = bindRemotionR3F(
      { id: 'c', width: 100, height: 100, fps: 24, duration_frames: 24 },
      { composition_id: 'c', scene_ref: 'x', camera_mode: 'fixed' }
    );
    expect(r.trait.params.render_passes).toEqual(['color']);
  });

  it('emits @cinematic + @timeline pair', () => {
    const r = bindRemotionR3F(
      { id: 'c', width: 100, height: 100, fps: 60, duration_frames: 60 },
      { composition_id: 'c', scene_ref: 'x', camera_mode: 'orbit', render_passes: ['color', 'depth'] }
    );
    expect(r.trait.kind).toBe('@cinematic');
    expect(r.timeline.kind).toBe('@timeline');
    expect(r.timeline.params.duration_frames).toBe(60);
  });
});
