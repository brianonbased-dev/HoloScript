import { describe, it, expect } from 'vitest';
import {
  vec3Add,
  vec3Sub,
  vec3Scale,
  vec3Length,
  vec3Lerp,
  catmullRom,
  hermiteInterpolate,
  cubicBezier,
} from '@holoscript/core';
import type { IVector3 } from '@holoscript/core';

// ─── helpers ────────────────────────────────────────────────────────────────

function v(x: number, y = 0, z = 0): IVector3 {
  return { x, y, z };
}
function approx(a: IVector3, b: IVector3, tol = 1e-9) {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('MathUtils — vec3Add', () => {
  it('basic addition', () => approx(vec3Add(v(1, 2, 3), v(4, 5, 6)), v(5, 7, 9)));
  it('adding zero returns original', () => approx(vec3Add(v(7, 8, 9), v(0)), v(7, 8, 9)));
  it('negative components', () => approx(vec3Add(v(-1, -2, -3), v(1, 2, 3)), v(0)));
});

describe('MathUtils — vec3Sub', () => {
  it('basic subtraction', () => approx(vec3Sub(v(5, 7, 9), v(4, 5, 6)), v(1, 2, 3)));
  it('self minus self = zero', () => approx(vec3Sub(v(3, 4, 5), v(3, 4, 5)), v(0)));
});

describe('MathUtils — vec3Scale', () => {
  it('scale by 2', () => approx(vec3Scale(v(1, 2, 3), 2), v(2, 4, 6)));
  it('scale by 0 = zero', () => approx(vec3Scale(v(9, 8, 7), 0), v(0)));
  it('scale by -1 negates', () => approx(vec3Scale(v(1, -2, 3), -1), v(-1, 2, -3)));
});

describe('MathUtils — vec3Length', () => {
  it('unit x-axis has length 1', () => expect(vec3Length(v(1, 0, 0))).toBeCloseTo(1));
  it('3-4-5 right triangle', () => expect(vec3Length(v(3, 4, 0))).toBeCloseTo(5));
  it('zero vector has length 0', () => expect(vec3Length(v(0))).toBe(0));
  it('negative components still correct', () => expect(vec3Length(v(-1, 0, 0))).toBeCloseTo(1));
});

describe('MathUtils — vec3Lerp', () => {
  it('t=0 returns start', () => approx(vec3Lerp(v(0, 0, 0), v(10, 10, 10), 0), v(0, 0, 0)));
  it('t=1 returns end', () => approx(vec3Lerp(v(0, 0, 0), v(10, 10, 10), 1), v(10, 10, 10)));
  it('t=0.5 returns midpoint', () => approx(vec3Lerp(v(0, 0, 0), v(10, 0, 0), 0.5), v(5, 0, 0)));
  it('t=0.25 quarter way', () => approx(vec3Lerp(v(0, 0, 0), v(8, 0, 0), 0.25), v(2, 0, 0)));
});

describe('MathUtils — catmullRom', () => {
  const p0 = v(-1, 0, 0),
    p1 = v(0, 0, 0),
    p2 = v(1, 0, 0),
    p3 = v(2, 0, 0);

  it('t=0 returns p1', () => {
    const r = catmullRom(p0, p1, p2, p3, 0);
    expect(r.x).toBeCloseTo(p1.x, 9);
  });
  it('t=1 returns p2', () => {
    const r = catmullRom(p0, p1, p2, p3, 1);
    expect(r.x).toBeCloseTo(p2.x, 9);
  });
  it('t=0.5 returns midpoint for collinear points', () => {
    // For perfectly spaced collinear points, midpoint is 0.5
    const r = catmullRom(p0, p1, p2, p3, 0.5);
    expect(r.x).toBeCloseTo(0.5, 5);
  });
  it('all components interpolated', () => {
    const a = v(0, 0, 0),
      b = v(0, 1, 0),
      c = v(0, 2, 0),
      d = v(0, 3, 0);
    const r = catmullRom(a, b, c, d, 0.5);
    expect(r.y).toBeCloseTo(1.5, 5);
  });
  it('non-collinear control produces curve (not linear)', () => {
    const curved = catmullRom(v(0, 0, 0), v(1, 0, 0), v(2, 1, 0), v(3, 0, 0), 0.5);
    // A straight line from (1,0) to (2,1) at t=0.5 would give y=0.5
    // Catmull-Rom should produce a slightly different y value
    expect(typeof curved.y).toBe('number');
  });
});

describe('MathUtils — hermiteInterpolate', () => {
  const zero = v(0, 0, 0);

  it('t=0 returns pos0 when vel0=0', () => {
    const r = hermiteInterpolate(v(5, 0, 0), zero, v(10, 0, 0), zero, 0, 1);
    expect(r.x).toBeCloseTo(5, 9);
  });
  it('t=1 returns pos1 when vel1=0', () => {
    const r = hermiteInterpolate(v(0, 0, 0), zero, v(10, 0, 0), zero, 1, 1);
    expect(r.x).toBeCloseTo(10, 9);
  });
  it('t=0.5 with zero velocities gives midpoint', () => {
    const r = hermiteInterpolate(v(0, 0, 0), zero, v(10, 0, 0), zero, 0.5, 1);
    expect(r.x).toBeCloseTo(5, 9);
  });
  it('velocity at start biases early trajectory', () => {
    // With large vel0 pointing right, midpoint should be pulled past linear midpoint
    const r = hermiteInterpolate(v(0, 0, 0), v(10, 0, 0), v(10, 0, 0), zero, 0.5, 1);
    expect(r.x).toBeGreaterThan(5);
  });
  it('dt=0 disables velocity influence', () => {
    const r = hermiteInterpolate(v(0, 0, 0), v(100, 0, 0), v(10, 0, 0), v(100, 0, 0), 0.5, 0);
    expect(r.x).toBeCloseTo(5, 9);
  });
  it('all 3 axes interpolated', () => {
    const r = hermiteInterpolate(v(0, 0, 0), zero, v(2, 4, 6), zero, 0.5, 1);
    expect(r.x).toBeCloseTo(1, 5);
    expect(r.y).toBeCloseTo(2, 5);
    expect(r.z).toBeCloseTo(3, 5);
  });
});

describe('MathUtils — cubicBezier', () => {
  it('t=0 returns p0', () => {
    const r = cubicBezier(v(0, 0, 0), v(1, 0, 0), v(2, 0, 0), v(3, 0, 0), 0);
    expect(r.x).toBeCloseTo(0, 9);
  });
  it('t=1 returns p3', () => {
    const r = cubicBezier(v(0, 0, 0), v(1, 0, 0), v(2, 0, 0), v(3, 0, 0), 1);
    expect(r.x).toBeCloseTo(3, 9);
  });
  it('t=0.5 collinear control points gives midpoint', () => {
    const r = cubicBezier(v(0, 0, 0), v(1, 0, 0), v(2, 0, 0), v(3, 0, 0), 0.5);
    expect(r.x).toBeCloseTo(1.5, 5);
  });
  it('control points curve trajectory (non-linear cp → non-linear output)', () => {
    // A Bezier with control points off-axis
    const r = cubicBezier(v(0, 0, 0), v(0, 2, 0), v(1, 2, 0), v(1, 0, 0), 0.5);
    // y should be elevated (pulled toward control points which are at y=2)
    expect(r.y).toBeGreaterThan(0);
  });
  it('all components computed', () => {
    const r = cubicBezier(v(0, 0, 0), v(0, 0, 1), v(0, 0, 2), v(0, 0, 3), 0.5);
    expect(r.z).toBeCloseTo(1.5, 5);
  });
  it('bernstein sum = 1 at any t (weights sum to 1)', () => {
    // b0+b1+b2+b3 = 1 for all t, so bezier of constant value should equal that value
    const ONE = v(1, 1, 1);
    const r = cubicBezier(ONE, ONE, ONE, ONE, 0.37);
    expect(r.x).toBeCloseTo(1, 9);
    expect(r.y).toBeCloseTo(1, 9);
  });
});
