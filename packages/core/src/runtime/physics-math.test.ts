/**
 * Unit tests for physics-math — AUDIT-mode coverage
 *
 * Slice 2 pure helper. Computes projectile arc velocity. Degenerate
 * cases (coincident start/end, zero speed) are specifically tested
 * since they are the most common runtime inputs in sparse test content.
 *
 * **See**: packages/core/src/runtime/physics-math.ts (slice 2)
 */

import { describe, it, expect } from 'vitest';
import { calculateArc } from './physics-math';
import type { SpatialPosition } from '../types';

/** Gravity constant from the module (duplicated here for test math). */
const GRAVITY = 9.81;

describe('calculateArc — output shape', () => {
  it('returns [vx, vy, vz] triple', () => {
    const v = calculateArc([0, 0, 0], [10, 0, 0], 5);
    expect(Array.isArray(v)).toBe(true);
    expect(v).toHaveLength(3);
  });

  it('all components are finite numbers', () => {
    const v = calculateArc([0, 0, 0], [5, 3, 7], 10);
    expect(Number.isFinite(v[0])).toBe(true);
    expect(Number.isFinite(v[1])).toBe(true);
    expect(Number.isFinite(v[2])).toBe(true);
  });
});

describe('calculateArc — degenerate cases', () => {
  it('coincident start/end → [0, speed, 0] (pure upward)', () => {
    expect(calculateArc([0, 0, 0], [0, 0, 0], 5)).toEqual([0, 5, 0]);
  });

  it('tiny horizontal distance (< ARC_MIN_DISTANCE) → pure upward', () => {
    // Horizontal distance sqrt(dx² + dz²) = sqrt(0.01² + 0) = 0.01 < 0.1
    const v = calculateArc([0, 0, 0], [0.01, 1, 0], 3);
    expect(v).toEqual([0, 3, 0]);
  });

  it('y-only delta with no horizontal → pure upward (sqrt(dx²+dz²)=0)', () => {
    const v = calculateArc([0, 0, 0], [0, 100, 0], 7);
    expect(v).toEqual([0, 7, 0]);
  });

  it('exactly at threshold (0.1) → pure upward (dist < 0.1 fails, so follows arc)', () => {
    // dist = 0.1, which is NOT < 0.1 → arc path; shouldn't degenerate
    const v = calculateArc([0, 0, 0], [0.1, 0, 0], 1);
    expect(v[0]).toBeGreaterThan(0); // has horizontal velocity
  });
});

describe('calculateArc — horizontal trajectory', () => {
  it('vx matches dx/t where t = dist/speed', () => {
    const start: SpatialPosition = [0, 0, 0];
    const end: SpatialPosition = [10, 0, 0];
    const speed = 5;
    const v = calculateArc(start, end, speed);

    const dist = 10;
    const t = dist / speed; // = 2
    expect(v[0]).toBeCloseTo(10 / t, 10); // = 5
    expect(v[2]).toBeCloseTo(0, 10); // no z-delta
  });

  it('vz component for pure z-axis shot', () => {
    const v = calculateArc([0, 0, 0], [0, 0, 10], 5);
    // dx = 0, dz = 10, dist = 10
    const t = 10 / 5;
    expect(v[0]).toBeCloseTo(0, 10);
    expect(v[2]).toBeCloseTo(10 / t, 10); // = 5
  });
});

describe('calculateArc — vertical + gravity compensation', () => {
  it('flat trajectory (same y): vy compensates gravity for apex over flight', () => {
    const v = calculateArc([0, 0, 0], [10, 0, 0], 5);
    // dy = 0, dist = 10, t = 2
    // vy = 0/2 + 0.5 * 9.81 * 2 = 9.81
    expect(v[1]).toBeCloseTo(0 + 0.5 * GRAVITY * 2, 5);
  });

  it('upward shot adds extra vy', () => {
    const v = calculateArc([0, 0, 0], [10, 5, 0], 5);
    // dy = 5, dist = 10, t = 2
    // vy = 5/2 + 0.5 * 9.81 * 2 = 2.5 + 9.81 = 12.31
    expect(v[1]).toBeCloseTo(5 / 2 + 0.5 * GRAVITY * 2, 5);
  });

  it('downward shot reduces vy (can go negative)', () => {
    const v = calculateArc([0, 10, 0], [10, 0, 0], 5);
    // dy = -10, dist = 10, t = 2
    // vy = -10/2 + 0.5 * 9.81 * 2 = -5 + 9.81 = 4.81
    expect(v[1]).toBeCloseTo(-10 / 2 + 0.5 * GRAVITY * 2, 5);
  });
});

describe('calculateArc — speed scaling', () => {
  it('doubling speed halves flight time, doubles vx', () => {
    const a = calculateArc([0, 0, 0], [10, 0, 0], 5);
    const b = calculateArc([0, 0, 0], [10, 0, 0], 10);
    expect(b[0]).toBeCloseTo(a[0] * 2, 5);
  });

  it('vy-gravity-component SHRINKS when speed doubles (shorter flight)', () => {
    // vy_grav = 0.5 * g * t = 0.5 * g * dist / speed
    // speed doubles → vy_grav halves
    const slow = calculateArc([0, 0, 0], [10, 0, 0], 5);
    const fast = calculateArc([0, 0, 0], [10, 0, 0], 10);
    expect(fast[1]).toBeCloseTo(slow[1] / 2, 5);
  });
});

describe('calculateArc — diagonal 3D trajectory', () => {
  it('combined xz motion preserves direction', () => {
    const v = calculateArc([0, 0, 0], [3, 0, 4], 5);
    // dist = sqrt(9 + 16) = 5; t = 5/5 = 1
    expect(v[0]).toBeCloseTo(3, 5);
    expect(v[2]).toBeCloseTo(4, 5);
    // vy = 0/1 + 0.5 * 9.81 * 1 = 4.905
    expect(v[1]).toBeCloseTo(0.5 * GRAVITY, 5);
  });
});
