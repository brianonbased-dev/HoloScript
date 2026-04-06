import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CutsceneTimeline, CutsceneBuilder } from '@holoscript/engine/animation/CutsceneTimeline';

// =============================================================================
// C263 — Cutscene Timeline
// =============================================================================

function simpleCutscene() {
  return new CutsceneBuilder('cs1', 'Test Cutscene')
    .addTrack('camera')
    .addTrack('dialogue')
    .addEvent(0, 'camera', 0, 2, { moveToX: 10 })
    .addEvent(1, 'dialogue', 1, 3, { text: 'Hello!' })
    .build();
}

describe('CutsceneTimeline', () => {
  let timeline: CutsceneTimeline;
  beforeEach(() => {
    timeline = new CutsceneTimeline();
  });

  it('load stores cutscene', () => {
    const def = simpleCutscene();
    timeline.load(def);
    expect(timeline.getState(def.id)).toBeDefined();
  });

  it('play sets isPlaying and resets time', () => {
    const def = simpleCutscene();
    timeline.load(def);
    timeline.play(def.id);
    expect(timeline.isPlaying(def.id)).toBe(true);
    expect(timeline.getCurrentTime(def.id)).toBe(0);
  });

  it('pause and resume', () => {
    const def = simpleCutscene();
    timeline.load(def);
    timeline.play(def.id);
    timeline.pause(def.id);
    const t1 = timeline.getCurrentTime(def.id);
    timeline.update(1);
    expect(timeline.getCurrentTime(def.id)).toBe(t1); // no advance
    timeline.resume(def.id);
    timeline.update(0.5);
    expect(timeline.getCurrentTime(def.id)).toBeGreaterThan(t1);
  });

  it('stop resets to beginning', () => {
    const def = simpleCutscene();
    timeline.load(def);
    timeline.play(def.id);
    timeline.update(1);
    timeline.stop(def.id);
    expect(timeline.isPlaying(def.id)).toBe(false);
    expect(timeline.getCurrentTime(def.id)).toBe(0);
  });

  it('update advances time', () => {
    const def = simpleCutscene();
    timeline.load(def);
    timeline.play(def.id);
    timeline.update(0.5);
    expect(timeline.getCurrentTime(def.id)).toBeCloseTo(0.5);
  });

  it('update returns active events', () => {
    const def = simpleCutscene();
    timeline.load(def);
    timeline.play(def.id);
    const result = timeline.update(1.5); // camera at [0,2] is active, dialogue at [1,4] is active
    const events = result.get(def.id) ?? [];
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it('cutscene stops at end when not looping', () => {
    const def = simpleCutscene();
    timeline.load(def);
    timeline.play(def.id);
    timeline.update(10); // well past duration
    expect(timeline.isPlaying(def.id)).toBe(false);
  });

  it('loop wraps time around', () => {
    const def = simpleCutscene();
    def.loop = true;
    timeline.load(def);
    timeline.play(def.id);
    timeline.update(def.duration + 1);
    expect(timeline.isPlaying(def.id)).toBe(true);
    expect(timeline.getCurrentTime(def.id)).toBeLessThan(def.duration);
  });

  it('setSpeed changes playback rate', () => {
    const def = simpleCutscene();
    timeline.load(def);
    timeline.play(def.id);
    timeline.setSpeed(def.id, 2);
    timeline.update(1);
    expect(timeline.getCurrentTime(def.id)).toBeCloseTo(2);
  });

  it('seek jumps to time', () => {
    const def = simpleCutscene();
    timeline.load(def);
    timeline.play(def.id);
    timeline.seek(def.id, 2);
    expect(timeline.getCurrentTime(def.id)).toBe(2);
  });

  it('getProgress returns 0-1 fraction', () => {
    const def = simpleCutscene();
    timeline.load(def);
    timeline.play(def.id);
    timeline.update(def.duration / 2);
    expect(timeline.getProgress(def.id)).toBeCloseTo(0.5);
  });

  it('callback events trigger registered functions', () => {
    const cb = vi.fn();
    timeline.registerCallback('onExplosion', cb);
    const def = new CutsceneBuilder('cs2', 'Callback Test')
      .addTrack('fx')
      .addEvent(0, 'callback', 0, 1, { callbackId: 'onExplosion' })
      .build();
    timeline.load(def);
    timeline.play(def.id);
    timeline.update(0.5);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('muted tracks are skipped', () => {
    const def = simpleCutscene();
    def.tracks[0].muted = true;
    timeline.load(def);
    timeline.play(def.id);
    const result = timeline.update(0.5); // camera track muted
    const events = result.get(def.id) ?? [];
    expect(events.every((e) => e.type !== 'camera')).toBe(true);
  });

  it('removeCutscene deletes cutscene', () => {
    const def = simpleCutscene();
    timeline.load(def);
    expect(timeline.removeCutscene(def.id)).toBe(true);
    expect(timeline.getState(def.id)).toBeUndefined();
  });
});
