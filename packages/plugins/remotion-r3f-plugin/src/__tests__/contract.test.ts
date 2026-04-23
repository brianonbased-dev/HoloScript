/**
 * @holoscript/remotion-r3f-plugin — ADAPTER CONTRACT TEST
 *
 * Universal-IR coverage row 13 (Remotion + R3F cinematic capture).
 */
import { describe, it, expect } from 'vitest';
import * as mod from '../index';
import { bindRemotionR3F, type RemotionComposition, type R3FCaptureConfig } from '../index';

function comp(overrides: Partial<RemotionComposition> = {}): RemotionComposition {
  return {
    id: 'intro',
    width: 1920,
    height: 1080,
    fps: 60,
    duration_frames: 300,
    ...overrides,
  };
}
function capture(overrides: Partial<R3FCaptureConfig> = {}): R3FCaptureConfig {
  return {
    composition_id: 'intro',
    scene_ref: 'scenes/Intro.tsx',
    camera_mode: 'orbit',
    ...overrides,
  };
}

describe('CONTRACT: remotion-r3f-plugin adapter', () => {
  it('exposes bindRemotionR3F at stable public path', () => {
    expect(typeof mod.bindRemotionR3F).toBe('function');
  });

  it('trait.kind = @cinematic, target_id = composition.id', () => {
    const r = bindRemotionR3F(comp(), capture());
    expect(r.trait.kind).toBe('@cinematic');
    expect(r.trait.target_id).toBe('intro');
  });

  it('timeline.kind = @timeline, target_id = <composition.id>:timeline', () => {
    const r = bindRemotionR3F(comp(), capture());
    expect(r.timeline.kind).toBe('@timeline');
    expect(r.timeline.target_id).toBe('intro:timeline');
  });

  it('duration_seconds = duration_frames / fps', () => {
    const r = bindRemotionR3F(comp({ duration_frames: 300, fps: 60 }), capture());
    expect(r.duration_seconds).toBe(5);
  });

  it('frame_count = composition.duration_frames', () => {
    const r = bindRemotionR3F(comp({ duration_frames: 720 }), capture());
    expect(r.frame_count).toBe(720);
  });

  it('trait.params.resolution preserves [width, height]', () => {
    const r = bindRemotionR3F(comp({ width: 1280, height: 720 }), capture());
    expect(r.trait.params.resolution).toEqual([1280, 720]);
  });

  it('camera_mode is one of fixed | tracking | orbit and preserved', () => {
    for (const m of ['fixed', 'tracking', 'orbit'] as const) {
      const r = bindRemotionR3F(comp(), capture({ camera_mode: m }));
      expect(r.trait.params.camera_mode).toBe(m);
    }
  });

  it('default render_passes = ["color"] when not specified', () => {
    const r = bindRemotionR3F(comp(), capture());
    expect(r.trait.params.render_passes).toEqual(['color']);
  });

  it('custom render_passes preserved', () => {
    const r = bindRemotionR3F(comp(), capture({ render_passes: ['color', 'depth', 'normal'] }));
    expect(r.trait.params.render_passes).toEqual(['color', 'depth', 'normal']);
  });

  it('fps=0 guarded → duration_seconds does not divide by zero', () => {
    expect(() => bindRemotionR3F(comp({ fps: 0 }), capture())).not.toThrow();
  });
});
