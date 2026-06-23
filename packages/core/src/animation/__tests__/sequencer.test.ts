/**
 * Unit tests for the keyframe-track sequencer core (Theatre.js harvest S2).
 *
 * `sampleTrack` interpolates a track's keyframes at a time `t`, applying the
 * destination keyframe's `easing` to each segment (reusing the shipped
 * spring/bounce/easeX). Pure-function coverage of endpoints, clamping,
 * per-segment easing, spring overshoot, and multi-segment tracks.
 *
 * **See**: packages/core/src/animation/sequencer.ts
 */

import { describe, it, expect } from 'vitest';
import { sampleTrack, type SampledKeyframe } from '../sequencer';

describe('sampleTrack — degenerate tracks', () => {
  it('empty track samples 0', () => {
    expect(sampleTrack([], 0.5)).toBe(0);
  });
  it('single keyframe samples its value at any t', () => {
    const ks: SampledKeyframe[] = [{ time: 0, value: 5 }];
    expect(sampleTrack(ks, -1)).toBe(5);
    expect(sampleTrack(ks, 0.3)).toBe(5);
    expect(sampleTrack(ks, 99)).toBe(5);
  });
});

describe('sampleTrack — clamping & linear default', () => {
  const ks: SampledKeyframe[] = [
    { time: 0, value: 0 },
    { time: 1, value: 10 },
  ];
  it('clamps below the first and above the last keyframe', () => {
    expect(sampleTrack(ks, -1)).toBe(0);
    expect(sampleTrack(ks, 2)).toBe(10);
  });
  it('linear-interpolates with no easing specified', () => {
    expect(sampleTrack(ks, 0.5)).toBeCloseTo(5);
    expect(sampleTrack(ks, 0.25)).toBeCloseTo(2.5);
  });

  it('uses the caller default easing when a destination keyframe omits easing', () => {
    expect(sampleTrack(ks, 0.5, 'smoothstep')).toBeCloseTo(5);
    expect(sampleTrack(ks, 0.25, 'smoothstep')).toBeCloseTo(1.5625);
  });
});

describe('sampleTrack — per-segment easing (destination keyframe governs)', () => {
  it('applies easeIn (t²) on the arriving segment', () => {
    const ks: SampledKeyframe[] = [
      { time: 0, value: 0 },
      { time: 1, value: 10, easing: 'easeIn' },
    ];
    // easeIn(0.5) = 0.25 → 0 + 10*0.25
    expect(sampleTrack(ks, 0.5)).toBeCloseTo(2.5);
  });

  it('spring overshoots the destination mid-segment then settles exactly', () => {
    const ks: SampledKeyframe[] = [
      { time: 0, value: 0 },
      { time: 1, value: 10, easing: 'spring' },
    ];
    expect(sampleTrack(ks, 0)).toBe(0); // clamp at start
    expect(sampleTrack(ks, 0.4)).toBeGreaterThan(10); // the bounce overshoots past 10
    expect(sampleTrack(ks, 1)).toBeCloseTo(10); // spring is endpoint-anchored
  });
});

describe('sampleTrack — multi-segment & ordering', () => {
  it('selects the correct segment across multiple keyframes', () => {
    const ks: SampledKeyframe[] = [
      { time: 0, value: 0 },
      { time: 1, value: 10 },
      { time: 2, value: 0 },
    ];
    expect(sampleTrack(ks, 0.5)).toBeCloseTo(5); // first segment up
    expect(sampleTrack(ks, 1)).toBeCloseTo(10); // on the middle key
    expect(sampleTrack(ks, 1.5)).toBeCloseTo(5); // second segment down
  });

  it('defensively sorts unordered keyframes by time', () => {
    const ks: SampledKeyframe[] = [
      { time: 1, value: 10 },
      { time: 0, value: 0 },
    ];
    expect(sampleTrack(ks, 0.5)).toBeCloseTo(5);
  });
});
