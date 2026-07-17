import { describe, it, expect, beforeEach } from 'vitest';
import {
  AnimClip,
  type ClipSampleValue,
  type ClipTrack,
  type QuaternionValue,
} from '@holoscript/engine/animation/AnimationClip';

function asQuaternion(value: ClipSampleValue | undefined): QuaternionValue {
  expect(Array.isArray(value)).toBe(true);
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error('expected a quaternion sample');
  }
  return value as QuaternionValue;
}

function quaternionNorm(value: QuaternionValue): number {
  return Math.hypot(value[0], value[1], value[2], value[3]);
}

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
    expect(clip.sample(1).get('a.p')).toBe(99);
    expect(clip.sample(2).get('a.p')).toBe(99);
  });

  it('preserves legacy component-vector scalar tracks', () => {
    clip.addTrack({
      id: 'legacy-vector',
      targetPath: 'legacy',
      property: 'position',
      component: 'y',
      interpolation: 'linear',
      keyframes: [
        { time: 0, value: [1, 2, 3] },
        { time: 1, value: [4, 8, 12] },
      ],
    });

    expect(clip.sample(0.5).get('legacy.position.y')).toBe(5);
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

  it('samples shortest-arc normalized quaternion tracks at endpoints and large angles', () => {
    const angle = (179.9 * Math.PI) / 180;
    const end: QuaternionValue = [0, Math.sin(angle / 2) * 3, 0, Math.cos(angle / 2) * 3];
    clip.addTrack({
      id: 'rotation',
      targetPath: 'root',
      property: 'rotation',
      interpolation: 'nlerp',
      keyframes: [
        { time: 0, value: [0, 0, 0, 2] },
        { time: 1, value: end },
      ],
    });

    for (const time of [0, 0.25, 0.5, 0.75, 1]) {
      expect(
        quaternionNorm(asQuaternion(clip.sampleValues(time).get('root.rotation')))
      ).toBeCloseTo(1, 12);
    }

    const midpoint = asQuaternion(clip.sampleValues(0.5).get('root.rotation'));
    const endUnit: QuaternionValue = [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
    const expectedScale = 1 / Math.hypot(endUnit[1] / 2, (1 + endUnit[3]) / 2);
    expect(midpoint[1]).toBeCloseTo((endUnit[1] / 2) * expectedScale, 12);
    expect(midpoint[3]).toBeCloseTo(((1 + endUnit[3]) / 2) * expectedScale, 12);
  });

  it('treats q and -q as the same orientation without crossing zero', () => {
    const orientation: QuaternionValue = [0.2, -0.3, 0.1, 0.9];
    clip.addTrack({
      id: 'sign-equivalent-rotation',
      targetPath: 'joint',
      property: 'rotation',
      interpolation: 'nlerp',
      keyframes: [
        { time: 0, value: orientation },
        { time: 1, value: orientation.map((component) => -component) as QuaternionValue },
      ],
    });

    const start = asQuaternion(clip.sampleValues(0).get('joint.rotation'));
    const midpoint = asQuaternion(clip.sampleValues(0.5).get('joint.rotation'));
    expect(quaternionNorm(midpoint)).toBeCloseTo(1, 12);
    expect(midpoint).toEqual(start);
  });

  it('normalizes finite extreme-magnitude quaternion inputs without overflow or underflow', () => {
    clip.addTrack({
      id: 'extreme-rotation',
      targetPath: 'extreme',
      property: 'rotation',
      interpolation: 'nlerp',
      keyframes: [
        { time: 0, value: [Number.MAX_VALUE, 0, 0, Number.MAX_VALUE] },
        { time: 1, value: [0, Number.MIN_VALUE, 0, Number.MIN_VALUE] },
      ],
    });

    for (const time of [0, 0.5, 1]) {
      const value = asQuaternion(clip.sampleValues(time).get('extreme.rotation'));
      expect(value.every(Number.isFinite)).toBe(true);
      expect(quaternionNorm(value)).toBeCloseTo(1, 12);
    }
  });

  it('defensively copies caller and getter track data', () => {
    const input: ClipTrack = {
      id: 'mutable-rotation',
      targetPath: 'mutable',
      property: 'rotation',
      interpolation: 'nlerp',
      keyframes: [{ time: 0, value: [0, 0, 0, 1] }],
    };
    clip.addTrack(input);
    if (input.interpolation !== 'nlerp') {
      throw new Error('expected quaternion input track');
    }
    input.keyframes[0].value = [0, 0, 0, 0];

    const stored = clip.getTrack('mutable-rotation');
    if (!stored || stored.interpolation !== 'nlerp') {
      throw new Error('expected quaternion track');
    }
    stored.keyframes[0].value = [0, 0, 0, 0];

    expect(clip.sampleValues(0).get('mutable.rotation')).toEqual([0, 0, 0, 1]);
  });

  it('migrates legacy scalar slerp labels to their actual linear behavior', () => {
    clip.addTrack({
      id: 'legacy-slerp-label',
      targetPath: 'legacy',
      property: 'rotation',
      component: 'w',
      interpolation: 'slerp',
      keyframes: [
        { time: 0, value: 0 },
        { time: 1, value: 1 },
      ],
    });

    expect(clip.getTrack('legacy-slerp-label')?.interpolation).toBe('linear');
    expect(clip.sample(0.5).get('legacy.rotation.w')).toBe(0.5);
  });

  it('keeps sample() scalar-compatible while sampleValues() exposes quaternion tuples', () => {
    clip.addTrack({
      id: 'compatible-rotation',
      targetPath: 'compatible',
      property: 'rotation',
      interpolation: 'nlerp',
      keyframes: [{ time: 0, value: [0, 0, 0, 2] }],
    });

    const legacySample: Map<string, number> = clip.sample(0);
    expect(legacySample.get('compatible.rotation.w')).toBe(1);
    expect(legacySample.has('compatible.rotation')).toBe(false);
    expect(clip.sampleValues(0).get('compatible.rotation')).toEqual([0, 0, 0, 1]);
  });

  it('normalizes quaternion blends while leaving scalar blending unchanged', () => {
    const a = new Map<string, ClipSampleValue>([
      ['root.rotation', [0, 0, 0, 2]],
      ['root.position.x', 0],
    ]);
    const b = new Map<string, ClipSampleValue>([
      ['root.rotation', [0, 2, 0, 0]],
      ['root.position.x', 10],
    ]);

    const blended = AnimClip.blend(a, b, 0.5);
    const rotation = asQuaternion(blended.get('root.rotation'));
    expect(quaternionNorm(rotation)).toBeCloseTo(1, 12);
    expect(rotation[1]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(rotation[3]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(blended.get('root.position.x')).toBe(5);
  });

  it('uses zero for missing scalar keys and identity for missing quaternion keys', () => {
    const scalar = AnimClip.blend(new Map([['x', 8]]), new Map<string, number>(), 0.25);
    expect(scalar.get('x')).toBe(6);

    const orientation: QuaternionValue = [0, 2, 0, 0];
    const quaternion = AnimClip.blend(
      new Map<string, ClipSampleValue>(),
      new Map<string, ClipSampleValue>([['rotation', orientation]]),
      0.5
    );
    const value = asQuaternion(quaternion.get('rotation'));
    expect(quaternionNorm(value)).toBeCloseTo(1, 12);
    expect(value[1]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(value[3]).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it('blends q and -q without crossing the zero quaternion', () => {
    const orientation: QuaternionValue = [0.2, -0.3, 0.1, 0.9];
    const opposite = orientation.map((component) => -component) as QuaternionValue;
    const blended = AnimClip.blend(
      new Map<string, ClipSampleValue>([['rotation', orientation]]),
      new Map<string, ClipSampleValue>([['rotation', opposite]]),
      0.5
    );
    const value = asQuaternion(blended.get('rotation'));
    expect(quaternionNorm(value)).toBeCloseTo(1, 12);
    expect(value).toEqual(
      orientation.map((component) => component / Math.hypot(...orientation)) as QuaternionValue
    );
  });

  it('rejects malformed, non-finite, zero, and mixed quaternion data', () => {
    const quaternionTrack = (value: unknown, interpolation: string = 'nlerp') =>
      ({
        id: 'invalid-rotation',
        targetPath: 'root',
        property: 'rotation',
        interpolation,
        keyframes: [{ time: 0, value }],
      }) as unknown as ClipTrack;

    expect(() => clip.addTrack(quaternionTrack([0, 0, 1]))).toThrow(/exactly four/);
    expect(() => clip.addTrack(quaternionTrack([0, 0, Number.NaN, 1]))).toThrow(/finite/);
    expect(() => clip.addTrack(quaternionTrack([0, 0, 0, 0]))).toThrow(/zero quaternion/);
    expect(() => clip.addTrack(quaternionTrack(1))).toThrow(/must be a tuple/);
    expect(() =>
      clip.addTrack({
        ...quaternionTrack([0, 0, 0, 1]),
        component: 'w',
      } as unknown as ClipTrack)
    ).toThrow(/without a component/);
    expect(() =>
      clip.addTrack({
        id: 'mixed-scalar-track',
        targetPath: 'root',
        property: 'rotation',
        interpolation: 'linear',
        keyframes: [{ time: 0, value: [0, 0, 0, 1] }],
      } as unknown as ClipTrack)
    ).toThrow(/requires an explicit component/);
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
