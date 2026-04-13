import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CinematicTrack, CinematicKeyframe } from '../CinematicTrack';

function kf(time: number, opts: Partial<CinematicKeyframe> = {}): CinematicKeyframe {
  return { time, easing: 'linear', ...opts };
}

describe('CinematicTrack', () => {
  let track: CinematicTrack;

  beforeEach(() => {
    track = new CinematicTrack();
  });

  // ---- Keyframe Management ----

  it('addKeyframe increases count', () => {
    track.addKeyframe(kf(0, { position: [0, 0, 0] }));
    expect(track.getKeyframeCount()).toBe(1);
  });

  it('keyframes sorted by time', () => {
    track.addKeyframe(kf(2));
    track.addKeyframe(kf(0));
    track.addKeyframe(kf(1));
    expect(track.getDuration()).toBe(2);
  });

  it('removeKeyframesAt removes matching', () => {
    track.addKeyframe(kf(0));
    track.addKeyframe(kf(1));
    track.addKeyframe(kf(2));
    const removed = track.removeKeyframesAt(1);
    expect(removed).toBe(1);
    expect(track.getKeyframeCount()).toBe(2);
  });

  // ---- Playback ----

  it('play starts playback', () => {
    track.addKeyframe(kf(0));
    track.play();
    expect(track.isPlaying()).toBe(true);
  });

  it('pause stops', () => {
    track.play();
    track.pause();
    expect(track.isPlaying()).toBe(false);
  });

  it('stop resets time', () => {
    track.addKeyframe(kf(0, { position: [0, 0, 0] }));
    track.addKeyframe(kf(1, { position: [10, 0, 0] }));
    track.play();
    track.update(0.5);
    track.stop();
    expect(track.getCurrentTime()).toBe(0);
  });

  it('seek clamps to duration', () => {
    track.addKeyframe(kf(0));
    track.addKeyframe(kf(2));
    track.seek(5);
    expect(track.getCurrentTime()).toBe(2);
  });

  // ---- Update / Evaluate ----

  it('update advances time', () => {
    track.addKeyframe(kf(0, { position: [0, 0, 0] }));
    track.addKeyframe(kf(2, { position: [20, 0, 0] }));
    track.play();
    const state = track.update(1);
    expect(state).not.toBeNull();
    expect(state!.position.x).toBeCloseTo(10, 0);
  });

  it('update returns null when not playing', () => {
    track.addKeyframe(kf(0));
    expect(track.update(0.1)).toBeNull();
  });

  it('update stops at end when not looping', () => {
    track.addKeyframe(kf(0, { position: [0, 0, 0] }));
    track.addKeyframe(kf(1, { position: [10, 0, 0] }));
    track.play();
    track.update(2);
    expect(track.isPlaying()).toBe(false);
    expect(track.getCurrentTime()).toBe(1);
  });

  it('update loops when enabled', () => {
    track.addKeyframe(kf(0, { position: [0, 0, 0] }));
    track.addKeyframe(kf(1, { position: [10, 0, 0] }));
    track.setLooping(true);
    track.play();
    track.update(1.5);
    expect(track.isPlaying()).toBe(true);
    expect(track.getCurrentTime()).toBeLessThan(1);
  });

  // ---- Easing ----

  it('easeIn produces slower start', () => {
    track.addKeyframe(kf(0, { position: [0, 0, 0] }));
    track.addKeyframe(kf(1, { position: [10, 0, 0], easing: 'easeIn' }));
    const state = track.evaluate(0.25);
    // easeIn: t*t → 0.0625 → x ≈ 0.625  (less than linear 2.5)
    expect(state.position.x).toBeLessThan(2.5);
  });

  // ---- FOV / Zoom ----

  it('interpolates fov between keyframes', () => {
    track.addKeyframe(kf(0, { fov: 60 }));
    track.addKeyframe(kf(1, { fov: 90 }));
    const state = track.evaluate(0.5);
    expect(state.fov).toBeCloseTo(75, 0);
  });

  // ---- Cues ----

  it('fires cues at correct time', () => {
    const listener = vi.fn();
    track.onCue(listener);
    track.addKeyframe(kf(0, { position: [0, 0, 0] }));
    track.addKeyframe(kf(2, { position: [20, 0, 0] }));
    track.addCue(0.5, 'explosion', { size: 5 });
    track.play();
    track.update(1);
    expect(listener).toHaveBeenCalledWith('explosion', { size: 5 });
  });

  it('cue fires only once', () => {
    const listener = vi.fn();
    track.onCue(listener);
    track.addKeyframe(kf(0, { position: [0, 0, 0] }));
    track.addKeyframe(kf(2, { position: [20, 0, 0] }));
    track.addCue(0.1, 'hit', {});
    track.play();
    track.update(0.5);
    track.update(0.5);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // ---- Clear ----

  it('clear resets everything', () => {
    track.addKeyframe(kf(0));
    track.addKeyframe(kf(1));
    track.addCue(0.5, 'e', {});
    track.clear();
    expect(track.getKeyframeCount()).toBe(0);
    expect(track.getCueCount()).toBe(0);
    expect(track.getDuration()).toBe(0);
  });

  // ---- Speed ----

  it('setSpeed doubles time advancement', () => {
    track.addKeyframe(kf(0, { position: [0, 0, 0] }));
    track.addKeyframe(kf(2, { position: [20, 0, 0] }));
    track.setSpeed(2);
    track.play();
    track.update(0.5); // Should advance by 1 second
    expect(track.getCurrentTime()).toBeCloseTo(1);
  });
});
