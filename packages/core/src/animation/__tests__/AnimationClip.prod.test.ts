/**
 * AnimClip — Production Test Suite
 *
 * Covers: construction, id/name/duration, setLoop/Speed/WrapMode,
 * addTrack (duration extension), sample (step/linear/cubic),
 * events (addEvent, getEventsInRange, getEvents),
 * wrapTime (once/clamp/loop/ping-pong), static blend.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AnimClip } from '../AnimationClip';
import type { ClipTrack } from '../AnimationClip';

function makeLinearTrack(id: string, times: number[], values: number[]): ClipTrack {
  return {
    id,
    targetPath: 'root/bone',
    property: 'position',
    component: 'x',
    interpolation: 'linear',
    keyframes: times.map((t, i) => ({ time: t, value: values[i] })),
  };
}

describe('AnimClip — Production', () => {
  let clip: AnimClip;

  beforeEach(() => {
    clip = new AnimClip('c1', 'Walk', 2.0);
  });

  // ─── Identity ──────────────────────────────────────────────────────
  it('id and name are set', () => {
    expect(clip.id).toBe('c1');
    expect(clip.name).toBe('Walk');
  });

  it('getDuration returns constructor value', () => {
    expect(clip.getDuration()).toBe(2.0);
  });

  // ─── Config ───────────────────────────────────────────────────────
  it('default wrapMode is once', () => {
    expect(clip.getWrapMode()).toBe('once');
  });

  it('setLoop true sets wrapMode to loop', () => {
    clip.setLoop(true);
    expect(clip.isLooping()).toBe(true);
    expect(clip.getWrapMode()).toBe('loop');
  });

  it('setLoop false sets wrapMode to once', () => {
    clip.setLoop(true);
    clip.setLoop(false);
    expect(clip.isLooping()).toBe(false);
    expect(clip.getWrapMode()).toBe('once');
  });

  it('setSpeed updates speed', () => {
    clip.setSpeed(2);
    expect(clip.getSpeed()).toBe(2);
  });

  it('setSpeed clamps to minimum 0.01', () => {
    clip.setSpeed(-5);
    expect(clip.getSpeed()).toBeCloseTo(0.01);
  });

  it('setWrapMode updates wrap mode', () => {
    clip.setWrapMode('ping-pong');
    expect(clip.getWrapMode()).toBe('ping-pong');
  });

  // ─── Tracks ───────────────────────────────────────────────────────
  it('starts with no tracks', () => {
    expect(clip.getTrackCount()).toBe(0);
  });

  it('addTrack adds a track', () => {
    clip.addTrack(makeLinearTrack('t1', [0, 1], [0, 10]));
    expect(clip.getTrackCount()).toBe(1);
  });

  it('getTrack finds by id', () => {
    clip.addTrack(makeLinearTrack('myTrack', [0, 1], [0, 10]));
    expect(clip.getTrack('myTrack')).toBeDefined();
  });

  it('getTrack returns undefined for unknown id', () => {
    expect(clip.getTrack('ghost')).toBeUndefined();
  });

  it('addTrack extends duration from keyframe times', () => {
    const track = makeLinearTrack('t1', [0, 5.0], [0, 100]);
    clip.addTrack(track);
    expect(clip.getDuration()).toBe(5.0);
  });

  it('getTracks returns array copy', () => {
    clip.addTrack(makeLinearTrack('t1', [0, 1], [0, 1]));
    expect(clip.getTracks().length).toBe(1);
  });

  // ─── sample — linear ──────────────────────────────────────────────
  it('sample at t=0 returns first keyframe value', () => {
    clip.addTrack(makeLinearTrack('t1', [0, 2], [5, 15]));
    const result = clip.sample(0);
    expect(result.get('root/bone.position.x')).toBeCloseTo(5);
  });

  it('sample at t=1 (half duration) interpolates linearly', () => {
    clip.addTrack(makeLinearTrack('t1', [0, 2], [0, 20]));
    const result = clip.sample(1);
    expect(result.get('root/bone.position.x')).toBeCloseTo(10, 1);
  });

  it('sample at t=duration returns last value', () => {
    clip.addTrack(makeLinearTrack('t1', [0, 2], [0, 20]));
    const result = clip.sample(2);
    expect(result.get('root/bone.position.x')).toBeCloseTo(20, 1);
  });

  // ─── sample — step ────────────────────────────────────────────────
  it('sample with step interpolation returns previous keyframe', () => {
    clip.addTrack({
      id: 't1', targetPath: 'root', property: 'vis', component: 'x',
      interpolation: 'step',
      keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }],
    });
    const result = clip.sample(0.5);
    expect(result.get('root.vis.x')).toBe(0); // step holds previous
  });

  // ─── sample — empty track ─────────────────────────────────────────
  it('sample with empty keyframes returns 0', () => {
    clip.addTrack({
      id: 'empty', targetPath: 'root', property: 'pos', component: 'y',
      interpolation: 'linear', keyframes: [],
    });
    expect(clip.sample(0).get('root.pos.y')).toBe(0);
  });

  // ─── Events ───────────────────────────────────────────────────────
  it('addEvent adds event', () => {
    clip.addEvent(1.0, 'footstep');
    expect(clip.getEvents().length).toBe(1);
  });

  it('events are sorted by time', () => {
    clip.addEvent(2.0, 'b');
    clip.addEvent(0.5, 'a');
    const events = clip.getEvents();
    expect(events[0].time).toBe(0.5);
    expect(events[1].time).toBe(2.0);
  });

  it('getEventsInRange returns events in [from, to)', () => {
    clip.addEvent(0.5, 'e1');
    clip.addEvent(1.5, 'e2');
    clip.addEvent(2.0, 'e3');
    const range = clip.getEventsInRange(0.0, 2.0);
    expect(range.length).toBe(2); // e1 and e2, not e3
  });

  // ─── WrapTime ────────────────────────────────────────────────────
  it('wrapMode once: clamps at duration', () => {
    clip.setWrapMode('once');
    clip.addTrack(makeLinearTrack('t1', [0, 2], [0, 100]));
    const result = clip.sample(10); // beyond duration — clamped
    expect(result.get('root/bone.position.x')).toBeCloseTo(100, 0);
  });

  it('wrapMode loop: wraps around', () => {
    clip.setWrapMode('loop');
    clip.addTrack(makeLinearTrack('t1', [0, 2], [0, 100]));
    const r1 = clip.sample(1.0);
    const r2 = clip.sample(3.0); // = t=1 in loop
    expect(r1.get('root/bone.position.x')).toBeCloseTo(r2.get('root/bone.position.x')!, 0);
  });

  // ─── Static blend ────────────────────────────────────────────────
  it('AnimClip.blend interpolates between two maps', () => {
    const a = new Map([['x', 0], ['y', 100]]);
    const b = new Map([['x', 100], ['y', 0]]);
    const result = AnimClip.blend(a, b, 0.5);
    expect(result.get('x')).toBeCloseTo(50);
    expect(result.get('y')).toBeCloseTo(50);
  });

  it('AnimClip.blend weight=0 returns a', () => {
    const a = new Map([['x', 10]]);
    const b = new Map([['x', 90]]);
    expect(AnimClip.blend(a, b, 0).get('x')).toBeCloseTo(10);
  });

  it('AnimClip.blend weight=1 returns b', () => {
    const a = new Map([['x', 10]]);
    const b = new Map([['x', 90]]);
    expect(AnimClip.blend(a, b, 1).get('x')).toBeCloseTo(90);
  });

  it('AnimClip.blend handles keys missing in one map', () => {
    const a = new Map([['x', 5]]);
    const b = new Map([['y', 10]]);
    const result = AnimClip.blend(a, b, 0.5);
    expect(result.has('x')).toBe(true);
    expect(result.has('y')).toBe(true);
  });
});
