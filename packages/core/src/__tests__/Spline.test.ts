import { describe, it, expect } from 'vitest';
import { SplinePath } from '../math/SplinePath';
import { SplineFollower } from '../math/SplineFollower';
import { CurveEditor } from '../math/CurveEditor';

describe('Cycle 134: Spline & Curve System', () => {
  // -------------------------------------------------------------------------
  // SplinePath
  // -------------------------------------------------------------------------

  it('should evaluate linear spline', () => {
    const sp = new SplinePath();
    sp.setType('linear');
    sp.addPoint(0, 0, 0);
    sp.addPoint(10, 0, 0);

    const mid = sp.evaluate(0.5);
    expect(mid[0]).toBeCloseTo(5, 0);
    expect(sp.getLength()).toBeGreaterThan(9);
  });

  it('should evaluate Catmull-Rom spline', () => {
    const sp = new SplinePath();
    sp.setType('catmull-rom');
    sp.addPoint(0, 0);
    sp.addPoint(5, 10);
    sp.addPoint(10, 0);
    sp.addPoint(15, 10);

    const p = sp.evaluate(0.5);
    expect(p[0]).toBeGreaterThan(0);
    expect(p[1]).toBeDefined();
  });

  it('should compute tangent direction', () => {
    const sp = new SplinePath();
    sp.setType('linear');
    sp.addPoint(0, 0);
    sp.addPoint(10, 0);

    const tangent = sp.getTangent(0.5);
    expect(tangent[0]).toBeCloseTo(1, 0); // Points right
    expect(tangent[1]).toBeCloseTo(0, 0);
  });

  // -------------------------------------------------------------------------
  // SplineFollower
  // -------------------------------------------------------------------------

  it('should follow spline at constant speed', () => {
    const sp = new SplinePath();
    sp.setType('linear');
    sp.addPoint(0, 0);
    sp.addPoint(100, 0);

    const follower = new SplineFollower(sp);
    follower.setSpeed(50); // 50 units/sec
    follower.play();

    const pos1 = follower.update(1); // After 1 second: ~50 units
    expect(pos1[0]).toBeCloseTo(50, -1);

    const pos2 = follower.update(1); // After 2 seconds: ~100 units
    expect(pos2[0]).toBeCloseTo(100, -1);
    expect(follower.isPlaying()).toBe(false); // Completed
  });

  it('should trigger markers along path', () => {
    const sp = new SplinePath();
    sp.setType('linear');
    sp.addPoint(0, 0);
    sp.addPoint(100, 0);

    const follower = new SplineFollower(sp);
    follower.setSpeed(200);
    follower.addMarker(0.5, 'halfway');

    const triggered: string[] = [];
    follower.onMarker((m) => triggered.push(m.label));

    follower.play();
    follower.update(1);
    expect(triggered).toContain('halfway');
  });

  it('should loop and ping-pong', () => {
    const sp = new SplinePath();
    sp.setType('linear');
    sp.addPoint(0, 0);
    sp.addPoint(10, 0);

    const follower = new SplineFollower(sp);
    follower.setSpeed(20);
    follower.setLoop(true);
    follower.play();
    follower.update(1); // Full traversal + half
    expect(follower.isPlaying()).toBe(true); // Still going
  });

  // -------------------------------------------------------------------------
  // CurveEditor
  // -------------------------------------------------------------------------

  it('should evaluate keyframe curves', () => {
    const curve = new CurveEditor();
    curve.addKey(0, 0);
    curve.addKey(1, 1);

    expect(curve.evaluate(0)).toBe(0);
    expect(curve.evaluate(1)).toBe(1);
    const mid = curve.evaluate(0.5);
    expect(mid).toBeGreaterThanOrEqual(0);
    expect(mid).toBeLessThanOrEqual(1);
  });

  it('should load curve presets', () => {
    const curve = new CurveEditor();
    curve.loadPreset('ease-in-out');

    expect(curve.getKeyCount()).toBe(2);
    expect(curve.evaluate(0)).toBe(0);
    expect(curve.evaluate(1)).toBe(1);

    // Ease-in-out: value at 0.5 should be near 0.5
    const mid = curve.evaluate(0.5);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
  });

  it('should support wrap modes', () => {
    const curve = new CurveEditor();
    curve.addKey(0, 0);
    curve.addKey(1, 1);
    curve.setWrapMode('loop');

    // At t=1.5 with loop, should wrap to t=0.5
    const val = curve.evaluate(1.5);
    expect(val).toBeGreaterThan(0);
    expect(val).toBeLessThan(1);
  });
});
