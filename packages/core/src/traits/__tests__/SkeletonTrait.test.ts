import { describe, it, expect, beforeEach } from 'vitest';
import { SkeletonTrait } from '../SkeletonTrait';

describe('SkeletonTrait', () => {
  let skel: SkeletonTrait;

  beforeEach(() => {
    skel = new SkeletonTrait({
      rigType: 'humanoid',
      bones: [
        {
          name: 'Hips',
          bindPose: {
            position: [0, 1, 0],
            rotation: [0, 0, 0, 1 ],
            scale: [1, 1, 1 ],
          },
          length: 0.1,
        },
        {
          name: 'Spine',
          parent: 'Hips',
          bindPose: {
            position: [0, 1.1, 0],
            rotation: [0, 0, 0, 1 ],
            scale: [1, 1, 1 ],
          },
          length: 0.2,
        },
      ],
      clips: [
        { name: 'idle', duration: 2.0, loop: true },
        { name: 'walk', duration: 1.0, loop: true },
      ],
      defaultClip: 'idle',
      speed: 1.0,
    });
  });

  it('initializes with config', () => {
    const cfg = skel.getConfig();
    expect(cfg.rigType).toBe('humanoid');
  });

  it('has correct bone count', () => {
    expect(skel.getBoneCount()).toBe(2);
  });

  it('getBoneNames returns bone names', () => {
    const names = skel.getBoneNames();
    expect(names).toContain('Hips');
    expect(names).toContain('Spine');
  });

  it('getClipNames returns clip names', () => {
    const names = skel.getClipNames();
    expect(names).toContain('idle');
    expect(names).toContain('walk');
  });

  it('play starts animation', () => {
    skel.play('walk');
    expect(skel.isPlaying()).toBe(true);
    expect(skel.getCurrentClip()).toBe('walk');
  });

  it('stop halts animation', () => {
    skel.play('walk');
    skel.stop();
    expect(skel.isPlaying()).toBe(false);
  });

  it('pause and resume', () => {
    skel.play('idle');
    skel.pause();
    expect(skel.isPlaying()).toBe(false);
    skel.resume();
    expect(skel.isPlaying()).toBe(true);
  });

  it('setSpeed changes playback speed', () => {
    skel.setSpeed(2.0);
    expect(skel.getSpeed()).toBe(2.0);
  });

  it('setParameter and getParameter', () => {
    skel.setParameter('speed', 0.5);
    expect(skel.getParameter('speed')).toBe(0.5);
  });

  it('play with crossfade sets target', () => {
    skel.play('idle');
    skel.play('walk', { crossfade: 0.3 });
    // During crossfade, currentClip stays on source; crossfadeTarget holds the new one
    expect(skel.getCurrentClip()).toBe('idle');
    const state = skel.getState();
    expect(state.crossfadeTarget).toBe('walk');
  });

  it('getBoneTransform returns transform', () => {
    const t = skel.getBoneTransform('Hips');
    expect(t).toBeDefined();
    expect(t?.position[1]).toBe(1);
  });

  it('getBoneTransform returns undefined for missing', () => {
    expect(skel.getBoneTransform('NonExistent')).toBeUndefined();
  });

  it('getClipDuration returns correct duration', () => {
    expect(skel.getClipDuration('idle')).toBe(2.0);
    expect(skel.getClipDuration('walk')).toBe(1.0);
  });

  it('addClip adds new clip', () => {
    skel.addClip({ name: 'run', duration: 0.5 });
    expect(skel.getClipNames()).toContain('run');
  });

  it('update advances time', () => {
    skel.play('idle');
    skel.update(0.5);
    const state = skel.getState();
    expect(state.currentTime).toBeGreaterThan(0);
  });
});
