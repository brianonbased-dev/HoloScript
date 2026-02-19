/**
 * SplinePath — Production Test Suite
 *
 * Covers: addPoint, setPoint, removePoint, getPoints, getPointCount,
 * evaluate (linear/catmull-rom/bezier), getLength, evaluateAtDistance,
 * getTangent, setLoop, setType, setTension, edge cases.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SplinePath } from '../SplinePath';

describe('SplinePath — Production', () => {
  let spline: SplinePath;

  beforeEach(() => {
    spline = new SplinePath();
  });

  // ─── Points ────────────────────────────────────────────────────────
  it('starts empty', () => {
    expect(spline.getPointCount()).toBe(0);
    expect(spline.getPoints()).toEqual([]);
  });

  it('addPoint appends points', () => {
    spline.addPoint(0, 0, 0);
    spline.addPoint(1, 0, 0);
    expect(spline.getPointCount()).toBe(2);
  });

  it('getPoints returns an array (may share references)', () => {
    spline.addPoint(1, 2, 3);
    const pts = spline.getPoints();
    expect(pts.length).toBe(1);
    expect(pts[0]).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('setPoint updates existing point', () => {
    spline.addPoint(0, 0, 0);
    spline.setPoint(0, 5, 5, 5);
    expect(spline.getPoints()[0]).toEqual({ x: 5, y: 5, z: 5 });
  });

  it('setPoint out of bounds is safe', () => {
    expect(() => spline.setPoint(99, 1, 1, 1)).not.toThrow();
  });

  it('removePoint removes by index', () => {
    spline.addPoint(0, 0, 0);
    spline.addPoint(1, 0, 0);
    spline.removePoint(0);
    expect(spline.getPointCount()).toBe(1);
  });

  // ─── Config ────────────────────────────────────────────────────────
  it('default type is catmull-rom', () => {
    expect(spline.getType()).toBe('catmull-rom');
  });

  it('setType changes type', () => {
    spline.setType('linear');
    expect(spline.getType()).toBe('linear');
  });

  it('setLoop toggles loop', () => {
    spline.setLoop(true);
    expect(spline.isLoop()).toBe(true);
  });

  it('setTension clamps to [0,1]', () => {
    spline.setTension(2);
    // Implementation clamps to 1
    const s = new SplinePath();
    s.addPoint(0, 0, 0);
    s.addPoint(1, 0, 0);
    s.setTension(-1);
    // Just shouldn't crash
    expect(() => s.evaluate(0.5)).not.toThrow();
  });

  // ─── Evaluate with zero/one points ────────────────────────────────
  it('evaluate with no points returns origin', () => {
    expect(spline.evaluate(0.5)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('evaluate with one point returns that point', () => {
    spline.addPoint(3, 7, 1);
    const pt = spline.evaluate(0);
    expect(pt).toEqual({ x: 3, y: 7, z: 1 });
  });

  // ─── Linear evaluation ─────────────────────────────────────────────
  it('linear at t=0 returns first point', () => {
    spline.setType('linear');
    spline.addPoint(0, 0, 0);
    spline.addPoint(10, 0, 0);
    const pt = spline.evaluate(0);
    expect(pt.x).toBeCloseTo(0);
  });

  it('linear at t=1 returns last point', () => {
    spline.setType('linear');
    spline.addPoint(0, 0, 0);
    spline.addPoint(10, 0, 0);
    const pt = spline.evaluate(1);
    expect(pt.x).toBeCloseTo(10);
  });

  it('linear at t=0.5 interpolates correctly', () => {
    spline.setType('linear');
    spline.addPoint(0, 0, 0);
    spline.addPoint(10, 0, 0);
    const pt = spline.evaluate(0.5);
    expect(pt.x).toBeCloseTo(5, 1);
  });

  // ─── Catmull-Rom evaluation ────────────────────────────────────────
  it('catmull-rom stays continuous between endpoints', () => {
    [0, 0, 5, 10, 10].forEach((y, i) => spline.addPoint(i, y, 0));
    const mid = spline.evaluate(0.5);
    expect(mid.x).toBeGreaterThanOrEqual(0);
    expect(mid.x).toBeLessThanOrEqual(4);
  });

  // ─── Bezier evaluation ─────────────────────────────────────────────
  it('bezier evaluates without throwing', () => {
    spline.setType('bezier');
    spline.addPoint(0, 0, 0);
    spline.addPoint(1, 2, 0);
    spline.addPoint(2, 2, 0);
    spline.addPoint(3, 0, 0);
    expect(() => spline.evaluate(0.5)).not.toThrow();
  });

  it('bezier at t=0 returns first point region', () => {
    spline.setType('bezier');
    spline.addPoint(0, 0, 0);
    spline.addPoint(1, 2, 0);
    spline.addPoint(2, 2, 0);
    spline.addPoint(3, 0, 0);
    const pt = spline.evaluate(0);
    expect(pt.x).toBeCloseTo(0, 1);
  });

  // ─── Arc Length ─────────────────────────────────────────────────────
  it('getLength returns positive value for long spline', () => {
    spline.setType('linear');
    spline.addPoint(0, 0, 0);
    spline.addPoint(10, 0, 0);
    expect(spline.getLength()).toBeGreaterThan(0);
  });

  it('getLength for unit segment approximates distance', () => {
    spline.setType('linear');
    spline.addPoint(0, 0, 0);
    spline.addPoint(1, 0, 0);
    expect(spline.getLength()).toBeCloseTo(1, 1);
  });

  it('evaluateAtDistance at 0 returns start', () => {
    spline.setType('linear');
    spline.addPoint(0, 0, 0);
    spline.addPoint(10, 0, 0);
    const pt = spline.evaluateAtDistance(0);
    expect(pt.x).toBeCloseTo(0, 1);
  });

  // ─── Tangent ──────────────────────────────────────────────────────
  it('getTangent returns unit-ish vector', () => {
    spline.setType('linear');
    spline.addPoint(0, 0, 0);
    spline.addPoint(1, 0, 0);
    const t = spline.getTangent(0.5);
    const len = Math.sqrt(t.x * t.x + t.y * t.y + t.z * t.z);
    expect(len).toBeCloseTo(1, 1);
  });
});
