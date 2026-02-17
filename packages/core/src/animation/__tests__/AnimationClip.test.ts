import { describe, it, expect, beforeEach } from 'vitest';
import { AnimClip, type ClipTrack } from '../AnimationClip';

function linearTrack(id: string, path: string, prop: string, kfs: Array<{ time: number; value: number }>): ClipTrack {
  return { id, targetPath: path, property: prop, interpolation: 'linear', keyframes: kfs };
}

describe('AnimClip', () => {
  let clip: AnimClip;

  beforeEach(() => { clip = new AnimClip('c1', 'Walk', 2); });

  // Construction
  it('stores id, name, duration', () => {
    expect(clip.id).toBe('c1');
    expect(clip.name).toBe('Walk');
    expect(clip.getDuration()).toBe(2);
  });

  // Loop / Speed / WrapMode
  it('setLoop toggles loop', () => {
    clip.setLoop(true);
    expect(clip.isLooping()).toBe(true);
    expect(clip.getWrapMode()).toBe('loop');
  });

  it('setSpeed clamps minimum', () => {
    clip.setSpeed(0);
    expect(clip.getSpeed()).toBeCloseTo(0.01);
  });

  it('setWrapMode changes mode', () => {
    clip.setWrapMode('ping-pong');
    expect(clip.getWrapMode()).toBe('ping-pong');
  });

  // Tracks
  it('addTrack increases count', () => {
    clip.addTrack(linearTrack('t1', 'root', 'position', [{ time: 0, value: 0 }]));
    expect(clip.getTrackCount()).toBe(1);
  });

  it('addTrack extends duration when keyframe exceeds it', () => {
    clip.addTrack(linearTrack('t1', 'root', 'pos', [{ time: 0, value: 0 }, { time: 5, value: 10 }]));
    expect(clip.getDuration()).toBe(5);
  });

  it('getTrack finds by id', () => {
    clip.addTrack(linearTrack('track_x', 'root', 'pos', [{ time: 0, value: 0 }]));
    expect(clip.getTrack('track_x')).toBeDefined();
    expect(clip.getTrack('nope')).toBeUndefined();
  });

  it('getTracks returns copy', () => {
    clip.addTrack(linearTrack('t1', 'root', 'a', []));
    const a = clip.getTracks();
    const b = clip.getTracks();
    expect(a).not.toBe(b);
  });

  // Events
  it('addEvent and getEvents', () => {
    clip.addEvent(0.5, 'footstep', { foot: 'left' });
    clip.addEvent(1.5, 'footstep', { foot: 'right' });
    expect(clip.getEvents().length).toBe(2);
  });

  it('getEventsInRange filters by time', () => {
    clip.addEvent(0.5, 'a');
    clip.addEvent(1.5, 'b');
    expect(clip.getEventsInRange(0, 1).length).toBe(1);
    expect(clip.getEventsInRange(0, 2).length).toBe(2);
  });

  // Sampling — linear interpolation
  it('sample interpolates linear track', () => {
    clip.addTrack(linearTrack('t1', 'root', 'x', [{ time: 0, value: 0 }, { time: 2, value: 10 }]));
    const result = clip.sample(1);
    expect(result.get('root.x')).toBeCloseTo(5);
  });

  // Step interpolation
  it('sample step holds previous value', () => {
    clip.addTrack({
      id: 's1', targetPath: 'root', property: 'visible',
      interpolation: 'step', keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }],
    });
    const r = clip.sample(0.5);
    expect(r.get('root.visible')).toBe(0);
  });

  // Wrap modes
  it('sample with loop wraps time', () => {
    clip.setLoop(true);
    clip.addTrack(linearTrack('t1', 'root', 'x', [{ time: 0, value: 0 }, { time: 2, value: 10 }]));
    const r = clip.sample(3); // wraps to 1
    expect(r.get('root.x')).toBeCloseTo(5);
  });

  it('sample with once clamps to duration', () => {
    clip.addTrack(linearTrack('t1', 'root', 'x', [{ time: 0, value: 0 }, { time: 2, value: 10 }]));
    const r = clip.sample(5);
    expect(r.get('root.x')).toBeCloseTo(10);
  });

  // Blend
  it('static blend interpolates two poses', () => {
    const a = new Map([['x', 0], ['y', 10]]);
    const b = new Map([['x', 10], ['y', 0]]);
    const r = AnimClip.blend(a, b, 0.5);
    expect(r.get('x')).toBeCloseTo(5);
    expect(r.get('y')).toBeCloseTo(5);
  });

  it('blend at weight=0 equals A', () => {
    const a = new Map([['v', 100]]);
    const b = new Map([['v', 0]]);
    const r = AnimClip.blend(a, b, 0);
    expect(r.get('v')).toBe(100);
  });
});
