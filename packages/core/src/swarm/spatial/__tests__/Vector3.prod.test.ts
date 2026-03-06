/**
 * Vector3 — Production Tests
 */
import { describe, it, expect } from 'vitest';
import { Vector3 } from '../Vector3';

const v = (x: number, y = 0, z = 0) => new Vector3(x, y, z);

describe('Vector3 — construction', () => {
  it('default zero', () => { const u = new Vector3(); expect(u.x).toBe(0); expect(u.y).toBe(0); expect(u.z).toBe(0); });
  it('explicit values', () => { const u = v(1, 2, 3); expect(u.x).toBe(1); expect(u.y).toBe(2); expect(u.z).toBe(3); });
  it('static zero()', () => { const u = Vector3.zero(); expect(u.x).toBe(0); expect(u.y).toBe(0); expect(u.z).toBe(0); });
  it('static one()', () => { const u = Vector3.one(); expect(u.x).toBe(1); expect(u.y).toBe(1); expect(u.z).toBe(1); });
  it('fromArray 3 elements', () => { const u = Vector3.fromArray([3, 4, 5]); expect(u.x).toBe(3); expect(u.y).toBe(4); expect(u.z).toBe(5); });
  it('fromArray pads to 0', () => { const u = Vector3.fromArray([7]); expect(u.y).toBe(0); expect(u.z).toBe(0); });
});

describe('Vector3 — add / subtract', () => {
  it('add components', () => { const r = v(1, 2, 3).add(v(4, 5, 6)); expect(r.x).toBe(5); expect(r.y).toBe(7); expect(r.z).toBe(9); });
  it('add returns new instance', () => { const a = v(1); const r = a.add(v(1)); expect(r).not.toBe(a); });
  it('subtract components', () => { const r = v(5, 7, 9).subtract(v(4, 5, 6)); expect(r.x).toBe(1); expect(r.y).toBe(2); expect(r.z).toBe(3); });
  it('subtract returns new instance', () => { const a = v(3); const r = a.subtract(v(1)); expect(r).not.toBe(a); });
  it('a+0=a', () => { expect(v(3, -2, 7).add(Vector3.zero()).equals(v(3, -2, 7))).toBe(true); });
  it('a-a=0', () => { expect(v(3, -2, 7).subtract(v(3, -2, 7)).equals(Vector3.zero())).toBe(true); });
});

describe('Vector3 — multiply / divide', () => {
  it('multiply scalar', () => { expect(v(2, 3, 4).multiply(2).equals(v(4, 6, 8))).toBe(true); });
  it('multiply 0 → zero', () => { expect(v(5, 6, 7).multiply(0).equals(Vector3.zero())).toBe(true); });
  it('divide scalar', () => { expect(v(4, 6, 8).divide(2).equals(v(2, 3, 4))).toBe(true); });
  it('divide by 0 → zero', () => { expect(v(5, 6, 7).divide(0).equals(Vector3.zero())).toBe(true); });
  it('multiply then divide identity', () => { const orig = v(3, 5, 7); expect(orig.multiply(4).divide(4).equals(orig)).toBe(true); });
});

describe('Vector3 — magnitude', () => {
  it('zero vector magnitude=0', () => { expect(Vector3.zero().magnitude()).toBe(0); });
  it('(3,4,0) magnitude=5 (3-4-5 pythagorean)', () => { expect(v(3, 4, 0).magnitude()).toBeCloseTo(5, 10); });
  it('magnitudeSquared=(3²+4²)', () => { expect(v(3, 4, 0).magnitudeSquared()).toBe(25); });
  it('magnitude consistency', () => {
    const u = v(1, 2, 3);
    expect(u.magnitudeSquared()).toBeCloseTo(u.magnitude() * u.magnitude(), 10);
  });
});

describe('Vector3 — normalize', () => {
  it('normalized unit vector has magnitude=1', () => { expect(v(3, 4, 5).normalize().magnitude()).toBeCloseTo(1, 10); });
  it('zero vector normalize → zero', () => { expect(Vector3.zero().normalize().magnitude()).toBe(0); });
  it('already unit stays unit', () => { expect(v(1, 0, 0).normalize().equals(v(1, 0, 0))).toBe(true); });
  it('normalized direction preserved', () => {
    const u = v(2, 0, 0).normalize();
    expect(u.x).toBeCloseTo(1, 10); expect(u.y).toBeCloseTo(0, 10);
  });
});

describe('Vector3 — dot product', () => {
  it('parallel vectors: max dot product', () => { expect(v(1, 0, 0).dot(v(1, 0, 0))).toBe(1); });
  it('orthogonal vectors: dot=0', () => { expect(v(1, 0, 0).dot(v(0, 1, 0))).toBe(0); });
  it('general dot product', () => { expect(v(2, 3, 4).dot(v(5, 6, 7))).toBe(56); }); // 10+18+28
  it('anti-parallel dot=-1 (unit)', () => { expect(v(1, 0, 0).dot(v(-1, 0, 0))).toBe(-1); });
});

describe('Vector3 — cross product', () => {
  it('x × y = z', () => { expect(v(1, 0, 0).cross(v(0, 1, 0)).equals(v(0, 0, 1))).toBe(true); });
  it('y × x = -z', () => { expect(v(0, 1, 0).cross(v(1, 0, 0)).equals(v(0, 0, -1))).toBe(true); });
  it('parallel vectors cross = zero', () => { expect(v(1, 0, 0).cross(v(2, 0, 0)).equals(Vector3.zero())).toBe(true); });
  it('cross product perpendicular to both operands', () => {
    const a = v(1, 2, 3); const b = v(4, 5, 6);
    const c = a.cross(b);
    expect(c.dot(a)).toBeCloseTo(0, 10);
    expect(c.dot(b)).toBeCloseTo(0, 10);
  });
});

describe('Vector3 — distance', () => {
  it('distanceTo same point=0', () => { expect(v(3, 4, 5).distanceTo(v(3, 4, 5))).toBe(0); });
  it('distanceTo (3,4,5) → (0,0,0) = sqrt(50)', () => { expect(v(3, 4, 5).distanceTo(Vector3.zero())).toBeCloseTo(Math.sqrt(50), 10); });
  it('distanceToSquared avoids sqrt', () => { expect(v(3, 0, 4).distanceToSquared(Vector3.zero())).toBe(25); });
  it('distanceTo symmetric', () => {
    const a = v(1, 2, 3); const b = v(4, 5, 6);
    expect(a.distanceTo(b)).toBeCloseTo(b.distanceTo(a), 10);
  });
});

describe('Vector3 — lerp', () => {
  it('t=0 returns self', () => { expect(v(0).lerp(v(10), 0).equals(v(0))).toBe(true); });
  it('t=1 returns target', () => { expect(v(0).lerp(v(10), 1).equals(v(10))).toBe(true); });
  it('t=0.5 returns midpoint', () => { expect(v(0).lerp(v(10), 0.5).equals(v(5))).toBe(true); });
  it('lerp component-wise', () => {
    const r = v(0, 0, 0).lerp(v(10, 20, 30), 0.1);
    expect(r.x).toBeCloseTo(1, 10); expect(r.y).toBeCloseTo(2, 10); expect(r.z).toBeCloseTo(3, 10);
  });
});

describe('Vector3 — clampMagnitude', () => {
  it('below max → unchanged', () => { expect(v(1, 0, 0).clampMagnitude(5).equals(v(1, 0, 0))).toBe(true); });
  it('above max → clamped to max', () => {
    const c = v(10, 0, 0).clampMagnitude(3);
    expect(c.magnitude()).toBeCloseTo(3, 10);
    expect(c.x).toBeCloseTo(3, 10);
  });
  it('zero vector clampMagnitude stays zero', () => { expect(Vector3.zero().clampMagnitude(5).magnitude()).toBe(0); });
});

describe('Vector3 — equals', () => {
  it('same coordinates equal', () => { expect(v(1, 2, 3).equals(v(1, 2, 3))).toBe(true); });
  it('different x not equal', () => { expect(v(1, 2, 3).equals(v(2, 2, 3))).toBe(false); });
  it('within epsilon equal', () => { expect(v(1, 2, 3).equals(v(1.00005, 2, 3))).toBe(true); });
  it('outside epsilon not equal', () => { expect(v(1, 2, 3).equals(v(1.01, 2, 3))).toBe(false); });
  it('custom epsilon', () => { expect(v(1, 2, 3).equals(v(1.05, 2, 3), 0.1)).toBe(true); });
});

describe('Vector3 — clone / toArray / toString', () => {
  it('clone is equal but different object', () => {
    const a = v(1, 2, 3); const b = a.clone();
    expect(b.equals(a)).toBe(true); expect(b).not.toBe(a);
  });
  it('toArray has 3 elements', () => { expect(v(1, 2, 3).toArray()).toEqual([1, 2, 3]); });
  it('toString includes Vector3 prefix', () => { expect(v(1, 2, 3).toString()).toContain('Vector3'); });
  it('toString shows rounded coordinates', () => { expect(v(1.123456, 0, 0).toString()).toContain('1.123'); });
});
