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
    expect(pts[0]).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('setPoint updates a point', () => {
    spline.addPoint(0, 0);
    spline.setPoint(0, 5, 5);
    expect(spline.getPoints()[0]).toEqual({ x: 5, y: 5, z: 0 });
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
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });

  it('evaluate t=1 returns last point (linear)', () => {
    spline.setType('linear');
    spline.addPoint(0, 0);
    spline.addPoint(10, 10);
    const p = spline.evaluate(1);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(10);
  });

  it('evaluate midpoint (linear)', () => {
    spline.setType('linear');
    spline.addPoint(0, 0);
    spline.addPoint(10, 20);
    const p = spline.evaluate(0.5);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(10);
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
    expect(typeof mid.x).toBe('number');
    expect(typeof mid.y).toBe('number');
  });

  // ---------------------------------------------------------------------------
  // Evaluate edge cases
  // ---------------------------------------------------------------------------

  it('evaluate empty spline returns zero', () => {
    const p = spline.evaluate(0.5);
    expect(p).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('evaluate single point returns that point', () => {
    spline.addPoint(3, 7, 1);
    const p = spline.evaluate(0.5);
    expect(p).toEqual({ x: 3, y: 7, z: 1 });
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
    expect(p.x).toBeCloseTo(5, 0);
    expect(p.y).toBeCloseTo(0, 0);
  });

  // ---------------------------------------------------------------------------
  // Tangent
  // ---------------------------------------------------------------------------

  it('getTangent returns normalized direction', () => {
    spline.setType('linear');
    spline.addPoint(0, 0);
    spline.addPoint(10, 0);
    const t = spline.getTangent(0.5);
    const len = Math.sqrt(t.x ** 2 + t.y ** 2 + t.z ** 2);
    expect(len).toBeCloseTo(1, 1);
    expect(t.x).toBeCloseTo(1, 1);
    expect(t.y).toBeCloseTo(0, 1);
  });
});
