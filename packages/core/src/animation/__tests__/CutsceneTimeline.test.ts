import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CutsceneTimeline, CutsceneBuilder } from '../CutsceneTimeline';
import type { CutsceneDefinition, TimelineEvent } from '../CutsceneTimeline';

function makeSimpleCutscene(id = 'intro', duration = 5): CutsceneDefinition {
  return new CutsceneBuilder(id, 'Test Cutscene')
    .addTrack('main')
    .addEvent(0, 'animation', 0, 2, { clip: 'walk' })
    .addEvent(0, 'dialogue', 2, 1.5, { text: 'Hello' })
    .addEvent(0, 'camera', 3.5, 1.5, { angle: 'closeup' })
    .build();
}

describe('CutsceneTimeline', () => {
  let timeline: CutsceneTimeline;

  beforeEach(() => {
    timeline = new CutsceneTimeline();
  });

  // ---------------------------------------------------------------------------
  // Load / Remove
  // ---------------------------------------------------------------------------

  it('load registers a cutscene and returns id', () => {
    const id = timeline.load(makeSimpleCutscene());
    expect(id).toBe('intro');
  });

  it('removeCutscene removes a loaded cutscene', () => {
    timeline.load(makeSimpleCutscene());
    expect(timeline.removeCutscene('intro')).toBe(true);
    expect(timeline.getState('intro')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Play / Pause / Stop
  // ---------------------------------------------------------------------------

  it('play starts playback', () => {
    timeline.load(makeSimpleCutscene());
    expect(timeline.play('intro')).toBe(true);
    expect(timeline.isPlaying('intro')).toBe(true);
  });

  it('play returns false for unknown cutscene', () => {
    expect(timeline.play('nope')).toBe(false);
  });

  it('pause and resume control playback', () => {
    timeline.load(makeSimpleCutscene());
    timeline.play('intro');
    timeline.pause('intro');
    const state = timeline.getState('intro')!;
    expect(state.isPaused).toBe(true);
    timeline.resume('intro');
    expect(timeline.getState('intro')!.isPaused).toBe(false);
  });

  it('stop resets playback', () => {
    timeline.load(makeSimpleCutscene());
    timeline.play('intro');
    timeline.update(1);
    timeline.stop('intro');
    expect(timeline.isPlaying('intro')).toBe(false);
    expect(timeline.getCurrentTime('intro')).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Update / Time
  // ---------------------------------------------------------------------------

  it('update advances currentTime', () => {
    timeline.load(makeSimpleCutscene());
    timeline.play('intro');
    timeline.update(1.5);
    expect(timeline.getCurrentTime('intro')).toBeCloseTo(1.5);
  });

  it('update returns active events', () => {
    timeline.load(makeSimpleCutscene());
    timeline.play('intro');
    const events = timeline.update(0.5);
    const active = events.get('intro')!;
    expect(active.length).toBeGreaterThan(0);
    expect(active[0].type).toBe('animation');
  });

  it('update paused cutscene does not advance', () => {
    timeline.load(makeSimpleCutscene());
    timeline.play('intro');
    timeline.pause('intro');
    timeline.update(5);
    expect(timeline.getCurrentTime('intro')).toBe(0);
  });

  it('cutscene stops at end when not looping', () => {
    timeline.load(makeSimpleCutscene());
    timeline.play('intro');
    timeline.update(10);
    expect(timeline.isPlaying('intro')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Speed / Seek
  // ---------------------------------------------------------------------------

  it('setSpeed affects time progression', () => {
    timeline.load(makeSimpleCutscene());
    timeline.play('intro');
    timeline.setSpeed('intro', 2);
    timeline.update(1);
    expect(timeline.getCurrentTime('intro')).toBeCloseTo(2);
  });

  it('seek jumps to a specific time', () => {
    timeline.load(makeSimpleCutscene());
    timeline.play('intro');
    timeline.seek('intro', 3);
    expect(timeline.getCurrentTime('intro')).toBeCloseTo(3);
  });

  // ---------------------------------------------------------------------------
  // Progress
  // ---------------------------------------------------------------------------

  it('getProgress returns 0-1 ratio', () => {
    timeline.load(makeSimpleCutscene());
    timeline.play('intro');
    const def = timeline.getState('intro')!.definition;
    timeline.seek('intro', def.duration / 2);
    expect(timeline.getProgress('intro')).toBeCloseTo(0.5);
  });

  it('getProgress returns 0 for unknown', () => {
    expect(timeline.getProgress('nope')).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Callbacks
  // ---------------------------------------------------------------------------

  it('registerCallback fires during callback events', () => {
    const fn = vi.fn();
    timeline.registerCallback('greet', fn);

    const def = new CutsceneBuilder('cb_test', 'Callback Test')
      .addTrack('main')
      .addEvent(0, 'callback', 0, 1, { callbackId: 'greet' })
      .build();

    timeline.load(def);
    timeline.play('cb_test');
    timeline.update(0.5);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('unregisterCallback prevents callback from firing', () => {
    const fn = vi.fn();
    timeline.registerCallback('greet', fn);
    timeline.unregisterCallback('greet');

    const def = new CutsceneBuilder('cb_test', 'Callback Test')
      .addTrack('main')
      .addEvent(0, 'callback', 0, 1, { callbackId: 'greet' })
      .build();

    timeline.load(def);
    timeline.play('cb_test');
    timeline.update(0.5);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('CutsceneBuilder', () => {
  it('builds a cutscene definition with tracks and events', () => {
    const def = new CutsceneBuilder('test', 'Test Scene')
      .addTrack('cam')
      .addTrack('anim')
      .addEvent(0, 'camera', 0, 2, { angle: 'wide' })
      .addEvent(1, 'animation', 1, 3, { clip: 'walk' })
      .build();

    expect(def.id).toBe('test');
    expect(def.tracks).toHaveLength(2);
    expect(def.tracks[0].events).toHaveLength(1);
    expect(def.tracks[1].events).toHaveLength(1);
    expect(def.duration).toBe(4); // max(2, 1+3)
  });

  it('computes duration from latest event end', () => {
    const def = new CutsceneBuilder('test', 'Test')
      .addTrack('main')
      .addEvent(0, 'wait', 5, 2, {})
      .build();
    expect(def.duration).toBe(7);
  });
});
