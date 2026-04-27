/**
 * TrajectoryVisualizer — pure-function helpers (WIRE-3)
 *
 * R3F React rendering can't be unit-tested without a full WebGL context,
 * but the buffer-construction helpers are pure functions over arrays.
 * Tests target those — visual proof comes when Studio adopts the component.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildGradientColors,
  buildPositionBuffer,
} from '../TrajectoryVisualizer';

describe('TrajectoryVisualizer — buildPositionBuffer', () => {
  it('translates each trajectory point by origin + floorOffset', () => {
    const traj: Array<[number, number, number]> = [
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ];
    const origin: [number, number, number] = [10, 5, 0];
    const buf = buildPositionBuffer(traj, origin, 0.02);
    expect(buf.length).toBe(9);
    // First point: (10+1, 5+0+0.02, 0+0) = (11, 5.02, 0)
    expect(buf[0]).toBeCloseTo(11);
    expect(buf[1]).toBeCloseTo(5.02);
    expect(buf[2]).toBeCloseTo(0);
    // Last point: (10+3, 5+0+0.02, 0+0) = (13, 5.02, 0)
    expect(buf[6]).toBeCloseTo(13);
    expect(buf[7]).toBeCloseTo(5.02);
    expect(buf[8]).toBeCloseTo(0);
  });

  it('preserves Y when trajectory has non-zero Y component', () => {
    const traj: Array<[number, number, number]> = [[0, 0.5, 0]];
    const buf = buildPositionBuffer(traj, [0, 0, 0], 0);
    expect(buf[1]).toBeCloseTo(0.5);
  });

  it('returns empty buffer for empty trajectory', () => {
    const buf = buildPositionBuffer([], [0, 0, 0], 0.02);
    expect(buf.length).toBe(0);
  });
});

describe('TrajectoryVisualizer — buildGradientColors', () => {
  it('first point exactly matches nearColor', () => {
    const c = buildGradientColors(5, 0xff0000, 0x00ff00);
    // Red = (1, 0, 0)
    expect(c[0]).toBeCloseTo(1);
    expect(c[1]).toBeCloseTo(0);
    expect(c[2]).toBeCloseTo(0);
  });

  it('last point exactly matches farColor', () => {
    const c = buildGradientColors(5, 0xff0000, 0x00ff00);
    // Green = (0, 1, 0); last index = 4*3 = 12
    expect(c[12]).toBeCloseTo(0);
    expect(c[13]).toBeCloseTo(1);
    expect(c[14]).toBeCloseTo(0);
  });

  it('mid point is the linear interpolation', () => {
    const c = buildGradientColors(3, 0xff0000, 0x00ff00);
    // Index 1 (mid): (0.5, 0.5, 0)
    expect(c[3]).toBeCloseTo(0.5);
    expect(c[4]).toBeCloseTo(0.5);
    expect(c[5]).toBeCloseTo(0);
  });

  it('count=0 produces empty buffer', () => {
    const c = buildGradientColors(0, 0xffffff, 0x000000);
    expect(c.length).toBe(0);
  });

  it('count=1 produces nearColor only', () => {
    const c = buildGradientColors(1, 0xff9933, 0x33dd66);
    // Compare against THREE.Color directly — handles sRGB/linear color
    // management consistently with what the actual buffer contains.
    const expected = new THREE.Color(0xff9933);
    expect(c[0]).toBeCloseTo(expected.r, 4);
    expect(c[1]).toBeCloseTo(expected.g, 4);
    expect(c[2]).toBeCloseTo(expected.b, 4);
  });

  it('default-spec gradient (orange→green) produces sensible RGB shape', () => {
    const c = buildGradientColors(12, 0xff9933, 0x33dd66);
    expect(c.length).toBe(36);
    // Near end is more red than far end
    expect(c[0]).toBeGreaterThan(c[33]);
    // Far end is more green than near end
    expect(c[34]).toBeGreaterThan(c[1]);
  });
});
