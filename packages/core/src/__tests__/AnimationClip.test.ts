import { describe, it, expect, beforeEach } from 'vitest';
import { AnimClip, ClipTrack } from '../animation/AnimationClip';

describe('AnimClip', () => {
  let clip: AnimClip;
  const track: ClipTrack = {
    id: 't1',
    targetPath: 'root',
    property: 'position',
    component: 'x',
    interpolation: 'linear',
    keyframes: [
      { time: 0, value: 0 },
      { time: 1, value: 10 },
    ],
  };

  beforeEach(() => {
    clip = new AnimClip('c1', 'Walk', 1);
    clip.addTrack(track);
  });

  it('stores track and reports count', () => {
    expect(clip.getTrackCount()).toBe(1);
    expect(clip.getTrack('t1')?.targetPath).toBe('root');
  });

  it('samples linear interpolation at midpoint', () => {
    const s = clip.sample(0.5);
    expect(s.get('root.position.x')).toBeCloseTo(5, 1);
  });

  it('samples returns first value at time 0', () => {
    const s = clip.sample(0);
    expect(s.get('root.position.x')).toBe(0);
  });

  it('samples returns last value at or beyond duration', () => {
    const s = clip.sample(1);
    expect(s.get('root.position.x')).toBe(10);
  });

  it('step interpolation returns previous keyframe value', () => {
    clip.addTrack({
      id: 't2',
      targetPath: 'a',
      property: 'p',
      interpolation: 'step',
      keyframes: [
        { time: 0, value: 0 },
        { time: 1, value: 99 },
      ],
    });
    const s = clip.sample(0.5);
    expect(s.get('a.p')).toBe(0);
  });

  it('loop wrap mode cycles time', () => {
    clip.setLoop(true);
    expect(clip.isLooping()).toBe(true);
    const s = clip.sample(1.5);
    expect(s.get('root.position.x')).toBeCloseTo(5, 1);
  });

  it('ping-pong wrap mode reverses', () => {
    clip.setWrapMode('ping-pong');
    const s = clip.sample(1.5); // Should be going back: 0.5*dur = 5
    expect(s.get('root.position.x')).toBeCloseTo(5, 1);
  });

  it('speed multiplier scales time', () => {
    clip.setSpeed(2);
    expect(clip.getSpeed()).toBe(2);
    const s = clip.sample(0.25); // effective time=0.5 → value 5
    expect(s.get('root.position.x')).toBeCloseTo(5, 1);
  });

  it('clip events are sorted and queried', () => {
    clip.addEvent(0.8, 'footstep', { foot: 'left' });
    clip.addEvent(0.2, 'footstep', { foot: 'right' });
    const events = clip.getEventsInRange(0, 0.5);
    expect(events.length).toBe(1);
    expect(events[0].data.foot).toBe('right');
  });

  it('static blend interpolates between samples', () => {
    const a = new Map([['x', 0]]);
    const b = new Map([['x', 10]]);
    const blended = AnimClip.blend(a, b, 0.5);
    expect(blended.get('x')).toBe(5);
  });

  it('updates duration when track keyframe exceeds initial', () => {
    clip.addTrack({
      id: 't3',
      targetPath: 'b',
      property: 'p',
      interpolation: 'linear',
      keyframes: [
        { time: 0, value: 0 },
        { time: 5, value: 1 },
      ],
    });
    expect(clip.getDuration()).toBe(5);
  });
});
