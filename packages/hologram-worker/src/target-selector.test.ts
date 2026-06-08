import { describe, it, expect } from 'vitest';

import { selectTargets, type DeviceHint } from './target-selector.js';

describe('selectTargets', () => {
  it('still image + looking-glass hint selects quilt', () => {
    const result = selectTargets({ mediaType: 'image', deviceHint: 'looking-glass' });
    expect(result).toEqual(['quilt']);
  });

  it('video + visionpro hint selects mvhevc', () => {
    const result = selectTargets({ mediaType: 'video', deviceHint: 'visionpro' });
    expect(result).toEqual(['mvhevc']);
  });

  it('video + vision-pro hint selects mvhevc', () => {
    const result = selectTargets({ mediaType: 'video', deviceHint: 'vision-pro' });
    expect(result).toEqual(['mvhevc']);
  });

  it('video + quest hint selects mvhevc', () => {
    const result = selectTargets({ mediaType: 'video', deviceHint: 'quest' });
    expect(result).toEqual(['mvhevc']);
  });

  it('gif + looking-glass hint selects quilt', () => {
    const result = selectTargets({ mediaType: 'gif', deviceHint: 'looking-glass' });
    expect(result).toEqual(['quilt']);
  });

  it('auto: still image defaults to quilt', () => {
    const result = selectTargets({ mediaType: 'image' });
    expect(result).toEqual(['quilt']);
  });

  it('auto: video defaults to mvhevc', () => {
    const result = selectTargets({ mediaType: 'video' });
    expect(result).toEqual(['mvhevc']);
  });

  it('auto: gif defaults to mvhevc', () => {
    const result = selectTargets({ mediaType: 'gif' });
    expect(result).toEqual(['mvhevc']);
  });

  it('explicit targets override device hint', () => {
    const result = selectTargets({
      mediaType: 'image',
      deviceHint: 'looking-glass',
      explicitTargets: ['parallax'],
    });
    expect(result).toEqual(['parallax']);
  });

  it('throws on unknown device hint', () => {
    expect(() =>
      selectTargets({ mediaType: 'image', deviceHint: 'unknown-device' as DeviceHint })
    ).toThrow('Unknown deviceHint');
  });

  it('fails if wrong compiler is dispatched (still -> mvhevc)', () => {
    // This test guards the core invariant: still images should NOT silently
    // route to mvhevc under the looking-glass hint.
    const result = selectTargets({ mediaType: 'image', deviceHint: 'looking-glass' });
    expect(result).not.toContain('mvhevc');
    expect(result).toContain('quilt');
  });

  it('fails if wrong compiler is dispatched (video -> quilt)', () => {
    // Headset-targeted video should NOT silently route to quilt.
    const result = selectTargets({ mediaType: 'video', deviceHint: 'visionpro' });
    expect(result).not.toContain('quilt');
    expect(result).toContain('mvhevc');
  });
});
