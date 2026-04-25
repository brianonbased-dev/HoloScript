import { describe, it, expect, beforeEach } from 'vitest';
import { SplinePath } from '../math/SplinePath';

// =============================================================================
// C303 — SplinePath
// =============================================================================

describe('SplinePath', () => {
  let sp: SplinePath;
  beforeEach(() => {
    sp = new SplinePath();
  });

  it('empty path evaluates to origin', () => {
    expect(sp.evaluate(0.5)).toEqual([0, 0, 0]);
  });

  it('single point returns that point', () => {
    sp.addPoint(3, 4, 5);
    expect(sp.evaluate(0.5)).toEqual([3, 4, 5]);
  });

  it('linear interpolation between two points', () => {
    sp.setType('linear');
    sp.addPoint(0, 0, 0);
    sp.addPoint(10, 0, 0);
    const mid = sp.evaluate(0.5);
    expect(mid[0]).toBeCloseTo(5);
    expect(mid[1]).toBeCloseTo(0);
  });

  it('linear endpoints match exactly', () => {
    sp.setType('linear');
    sp.addPoint(0, 0, 0);
    sp.addPoint(10, 20, 0);
    const start = sp.evaluate(0);
    const end = sp.evaluate(1);
    expect(start[0]).toBeCloseTo(0);
    expect(end[0]).toBeCloseTo(10);
    expect(end[1]).toBeCloseTo(20);
  });

  it('catmull-rom produces smooth curve', () => {
    sp.setType('catmull-rom');
    sp.addPoint(0, 0);
    sp.addPoint(1, 1);
    sp.addPoint(2, 0);
    sp.addPoint(3, 1);
    const mid = sp.evaluate(0.5);
    // Should be smooth, not exactly at control points
    expect(mid[0]).toBeGreaterThan(0);
    expect(mid[0]).toBeLessThan(3);
  });

  it('arc length is positive for non-degenerate path', () => {
    sp.setType('linear');
    sp.addPoint(0, 0);
    sp.addPoint(3, 4); // length = 5
    const len = sp.getLength();
    expect(len).toBeCloseTo(5, 0);
  });

  it('evaluateAtDistance returns correct point on linear path', () => {
    sp.setType('linear');
    sp.addPoint(0, 0);
    sp.addPoint(10, 0);
    const p = sp.evaluateAtDistance(5);
    expect(p[0]).toBeCloseTo(5, 0);
  });

  it('getTangent returns direction vector', () => {
    sp.setType('linear');
    sp.addPoint(0, 0);
    sp.addPoint(10, 0);
    const t = sp.getTangent(0.5);
    expect(t[0]).toBeCloseTo(1);
    expect(t[1]).toBeCloseTo(0);
  });

  it('setPoint modifies existing point', () => {
    sp.setType('linear');
    sp.addPoint(0, 0);
    sp.addPoint(10, 0);
    sp.setPoint(1, 0, 10);
    const end = sp.evaluate(1);
    expect(end[1]).toBeCloseTo(10);
  });

  it('removePoint reduces count', () => {
    sp.addPoint(0, 0);
    sp.addPoint(1, 1);
    sp.addPoint(2, 2);
    sp.removePoint(1);
    expect(sp.getPointCount()).toBe(2);
  });

  it('loop option wraps evaluation', () => {
    sp.setType('linear');
    sp.setLoop(true);
    sp.addPoint(0, 0);
    sp.addPoint(10, 0);
    sp.addPoint(10, 10);
    // With loop, there are 3 segments (including wrap-around)
    expect(sp.getPointCount()).toBe(3);
    expect(sp.isLoop()).toBe(true);
  });
});
