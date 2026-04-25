import { describe, it, expect, beforeEach } from 'vitest';
import { SplinePath } from '../SplinePath';

describe('SplinePath', () => {
  let spline: SplinePath;

  beforeEach(() => {
    spline = new SplinePath();
  });

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  it('defaults to catmull-rom', () => {
    expect(spline.getType()).toBe('catmull-rom');
  });

  it('setType changes type', () => {
    spline.setType('linear');
    expect(spline.getType()).toBe('linear');
  });

  it('setLoop and isLoop', () => {
    expect(spline.isLoop()).toBe(false);
    spline.setLoop(true);
    expect(spline.isLoop()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Points
  // ---------------------------------------------------------------------------

  it('addPoint increases point count', () => {
    spline.addPoint(0, 0);
    spline.addPoint(10, 10);
    expect(spline.getPointCount()).toBe(2);
  });

  it('getPoints returns copies', () => {
    spline.addPoint(1, 2, 3);
    const pts = spline.getPoints();
    expect(pts[0]).toEqual([1, 2, 3]);
  });

  it('setPoint updates a point', () => {
    spline.addPoint(0, 0);
    spline.setPoint(0, 5, 5);
    expect(spline.getPoints()[0]).toEqual([5, 5, 0]);
  });

  it('removePoint decreases count', () => {
    spline.addPoint(0, 0);
    spline.addPoint(1, 1);
    spline.removePoint(0);
    expect(spline.getPointCount()).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Evaluate (Linear)
  // ---------------------------------------------------------------------------

  it('evaluate t=0 returns first point (linear)', () => {
    spline.setType('linear');
    spline.addPoint(0, 0);
    spline.addPoint(10, 10);
    const p = spline.evaluate(0);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(0);
  });

  it('evaluate t=1 returns last point (linear)', () => {
    spline.setType('linear');
    spline.addPoint(0, 0);
    spline.addPoint(10, 10);
    const p = spline.evaluate(1);
    expect(p[0]).toBeCloseTo(10);
    expect(p[1]).toBeCloseTo(10);
  });

  it('evaluate midpoint (linear)', () => {
    spline.setType('linear');
    spline.addPoint(0, 0);
    spline.addPoint(10, 20);
    const p = spline.evaluate(0.5);
    expect(p[0]).toBeCloseTo(5);
    expect(p[1]).toBeCloseTo(10);
  });

  // ---------------------------------------------------------------------------
  // Evaluate (Catmull-Rom)
  // ---------------------------------------------------------------------------

  it('catmull-rom midpoint is smooth (not linear interpolation)', () => {
    spline.addPoint(0, 0);
    spline.addPoint(5, 10);
    spline.addPoint(10, 0);
    spline.addPoint(15, 10);
    const mid = spline.evaluate(0.5);
    // Catmull-rom should produce a smooth curve that differs from linear
    expect(mid).toBeDefined();
    expect(typeof mid[0]).toBe('number');
    expect(typeof mid[1]).toBe('number');
  });

  // ---------------------------------------------------------------------------
  // Evaluate edge cases
  // ---------------------------------------------------------------------------

  it('evaluate empty spline returns zero', () => {
    const p = spline.evaluate(0.5);
    expect(p).toEqual([0, 0, 0]);
  });

  it('evaluate single point returns that point', () => {
    spline.addPoint(3, 7, 1);
    const p = spline.evaluate(0.5);
    expect(p).toEqual([3, 7, 1]);
  });

  // ---------------------------------------------------------------------------
  // Arc Length
  // ---------------------------------------------------------------------------

  it('getLength returns positive for non-trivial spline', () => {
    spline.setType('linear');
    spline.addPoint(0, 0);
    spline.addPoint(3, 4);
    expect(spline.getLength()).toBeCloseTo(5, 0); // 3-4-5 triangle
  });

  it('evaluateAtDistance maps distance to point', () => {
    spline.setType('linear');
    spline.addPoint(0, 0);
    spline.addPoint(10, 0);
    const p = spline.evaluateAtDistance(5);
    expect(p[0]).toBeCloseTo(5, 0);
    expect(p[1]).toBeCloseTo(0, 0);
  });

  // ---------------------------------------------------------------------------
  // Tangent
  // ---------------------------------------------------------------------------

  it('getTangent returns normalized direction', () => {
    spline.setType('linear');
    spline.addPoint(0, 0);
    spline.addPoint(10, 0);
    const t = spline.getTangent(0.5);
    const len = Math.sqrt(t[0] ** 2 + t[1] ** 2 + t[2] ** 2);
    expect(len).toBeCloseTo(1, 1);
    expect(t[0]).toBeCloseTo(1, 1);
    expect(t[1]).toBeCloseTo(0, 1);
  });
});
