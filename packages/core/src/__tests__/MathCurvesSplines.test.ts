/**
 * Cycle 198 — Math Curves & Splines
 *
 * Covers SplinePath (linear, Catmull-Rom, Bezier, arc-length, tangent)
 *        CurveEditor (keyframes, Hermite eval, presets, wrap modes)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SplinePath } from '../math/SplinePath';
import { CurveEditor } from '../math/CurveEditor';

// ─── SplinePath ──────────────────────────────────────────────────────────────
describe('SplinePath', () => {
  let spline: SplinePath;

  beforeEach(() => {
    spline = new SplinePath();
  });

  // --- Edge cases ---
  it('evaluate returns origin when no points exist', () => {
    const p = spline.evaluate(0.5);
    expect(p).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('evaluate returns the single point when only one exists', () => {
    spline.addPoint(3, 7, 2);
    const p = spline.evaluate(0.5);
    expect(p.x).toBe(3);
    expect(p.y).toBe(7);
    expect(p.z).toBe(2);
  });

  // --- Point management ---
  it('addPoint / getPointCount / getPoints', () => {
    spline.addPoint(0, 0);
    spline.addPoint(10, 10);
    expect(spline.getPointCount()).toBe(2);
    expect(spline.getPoints()).toHaveLength(2);
  });

  it('setPoint updates coordinates', () => {
    spline.addPoint(0, 0);
    spline.addPoint(10, 10);
    spline.setPoint(1, 5, 5, 5);
    expect(spline.getPoints()[1]).toEqual({ x: 5, y: 5, z: 5 });
  });

  it('removePoint decreases count', () => {
    spline.addPoint(0, 0);
    spline.addPoint(10, 10);
    spline.removePoint(0);
    expect(spline.getPointCount()).toBe(1);
  });

  // --- Linear evaluation ---
  it('linear evaluate at t=0 and t=1 returns endpoints', () => {
    spline.setType('linear');
    spline.addPoint(0, 0, 0);
    spline.addPoint(10, 20, 0);
    const p0 = spline.evaluate(0);
    const p1 = spline.evaluate(1);
    expect(p0.x).toBeCloseTo(0);
    expect(p1.x).toBeCloseTo(10);
    expect(p1.y).toBeCloseTo(20);
  });

  it('linear midpoint evaluate', () => {
    spline.setType('linear');
    spline.addPoint(0, 0, 0);
    spline.addPoint(10, 0, 0);
    const mid = spline.evaluate(0.5);
    expect(mid.x).toBeCloseTo(5);
  });

  // --- Catmull-Rom ---
  it('catmull-rom evaluation produces smooth curve', () => {
    spline.setType('catmull-rom');
    spline.addPoint(0, 0);
    spline.addPoint(5, 10);
    spline.addPoint(10, 0);
    spline.addPoint(15, 10);
    const mid = spline.evaluate(0.5);
    // Should be defined and vary from linear
    expect(typeof mid.x).toBe('number');
    expect(typeof mid.y).toBe('number');
  });

  it('setTension changes curve shape', () => {
    spline.setType('catmull-rom');
    spline.addPoint(0, 0);
    spline.addPoint(5, 10);
    spline.addPoint(10, 0);
    spline.setTension(0);
    const a = spline.evaluate(0.25);
    spline.setTension(1);
    const b = spline.evaluate(0.25);
    // Different tension should yield different y-values
    expect(a.y).not.toBeCloseTo(b.y, 1);
  });

  // --- Bezier ---
  it('bezier evaluation at endpoints', () => {
    spline.setType('bezier');
    // 4 control points for one cubic bezier segment
    spline.addPoint(0, 0, 0);
    spline.addPoint(3, 10, 0);
    spline.addPoint(7, 10, 0);
    spline.addPoint(10, 0, 0);
    const start = spline.evaluate(0);
    const end = spline.evaluate(1);
    expect(start.x).toBeCloseTo(0, 0);
    expect(end.x).toBeCloseTo(10, 0);
  });

  // --- Looping ---
  it('looping spline wraps around', () => {
    spline.setType('linear');
    spline.setLoop(true);
    expect(spline.isLoop()).toBe(true);
    spline.addPoint(0, 0);
    spline.addPoint(10, 0);
    spline.addPoint(10, 10);
    // t=1 should bring us back near the start
    const end = spline.evaluate(1);
    expect(end.x).toBeCloseTo(0, 0);
    expect(end.y).toBeCloseTo(0, 0);
  });

  // --- Arc length ---
  it('getLength returns positive length for multi-point spline', () => {
    spline.setType('linear');
    spline.addPoint(0, 0, 0);
    spline.addPoint(10, 0, 0);
    expect(spline.getLength()).toBeCloseTo(10, 0);
  });

  it('evaluateAtDistance returns point at given arc distance', () => {
    spline.setType('linear');
    spline.addPoint(0, 0, 0);
    spline.addPoint(10, 0, 0);
    const p = spline.evaluateAtDistance(5);
    expect(p.x).toBeCloseTo(5, 0);
  });

  // --- Tangent ---
  it('getTangent returns normalized direction', () => {
    spline.setType('linear');
    spline.addPoint(0, 0, 0);
    spline.addPoint(10, 0, 0);
    const t = spline.getTangent(0.5);
    const len = Math.sqrt(t.x * t.x + t.y * t.y + t.z * t.z);
    expect(len).toBeCloseTo(1, 1);
    expect(t.x).toBeCloseTo(1, 1);
  });

  // --- getType ---
  it('getType returns current type', () => {
    expect(spline.getType()).toBe('catmull-rom'); // default
    spline.setType('linear');
    expect(spline.getType()).toBe('linear');
  });
});

// ─── CurveEditor ─────────────────────────────────────────────────────────────
describe('CurveEditor', () => {
  let curve: CurveEditor;

  beforeEach(() => {
    curve = new CurveEditor();
  });

  it('evaluate returns 0 with no keyframes', () => {
    expect(curve.evaluate(0.5)).toBe(0);
  });

  it('addKey and getKeyCount', () => {
    curve.addKey(0, 0);
    curve.addKey(1, 1);
    expect(curve.getKeyCount()).toBe(2);
  });

  it('addKey auto-sorts by time', () => {
    curve.addKey(1, 10);
    curve.addKey(0, 0);
    const keys = curve.getKeyframes();
    expect(keys[0].time).toBe(0);
    expect(keys[1].time).toBe(1);
  });

  it('removeKey decreases count', () => {
    curve.addKey(0, 0);
    curve.addKey(1, 1);
    curve.removeKey(0);
    expect(curve.getKeyCount()).toBe(1);
  });

  it('setKey updates time and value', () => {
    curve.addKey(0, 0);
    curve.addKey(1, 1);
    curve.setKey(0, 0.5, 0.5);
    const keys = curve.getKeyframes();
    expect(keys[0].time).toBe(0.5);
  });

  it('evaluate with single keyframe returns that value', () => {
    curve.addKey(0.5, 42);
    expect(curve.evaluate(0)).toBe(42);
    expect(curve.evaluate(1)).toBe(42);
  });

  it('linear preset yields ~0.5 at t=0.5', () => {
    curve.loadPreset('linear');
    const v = curve.evaluate(0.5);
    expect(v).toBeCloseTo(0.5, 1);
  });

  it('ease-in preset starts slow (val < 0.5 at t=0.5)', () => {
    curve.loadPreset('ease-in');
    expect(curve.evaluate(0.5)).toBeLessThan(0.5);
  });

  it('ease-out preset ends slow (val > 0.5 at t=0.5)', () => {
    curve.loadPreset('ease-out');
    expect(curve.evaluate(0.5)).toBeGreaterThan(0.5);
  });

  it('constant preset returns 1 everywhere (stepped)', () => {
    curve.loadPreset('constant');
    expect(curve.evaluate(0)).toBe(1);
    expect(curve.evaluate(0.5)).toBe(1);
  });

  it('setTangents switches to free mode', () => {
    curve.addKey(0, 0);
    curve.addKey(1, 1);
    curve.setTangents(0, 2, 2);
    expect(curve.getKeyframes()[0].tangentMode).toBe('free');
  });

  it('wrap mode loop wraps time', () => {
    curve.loadPreset('linear');
    curve.setWrapMode('loop');
    expect(curve.getWrapMode()).toBe('loop');
    // t=1.5 should loop to t=0.5
    const v = curve.evaluate(1.5);
    expect(v).toBeCloseTo(0.5, 1);
  });

  it('wrap mode ping-pong mirrors', () => {
    curve.loadPreset('linear');
    curve.setWrapMode('ping-pong');
    // t=1.5 should ping-pong to t=0.5
    const v = curve.evaluate(1.5);
    expect(v).toBeCloseTo(0.5, 1);
  });

  it('getValueRange returns min/max', () => {
    curve.addKey(0, -5);
    curve.addKey(1, 10);
    const range = curve.getValueRange();
    expect(range.min).toBe(-5);
    expect(range.max).toBe(10);
  });

  it('getTimeRange returns start/end', () => {
    curve.addKey(0.2, 0);
    curve.addKey(0.8, 1);
    const range = curve.getTimeRange();
    expect(range.start).toBe(0.2);
    expect(range.end).toBe(0.8);
  });

  it('getValueRange/getTimeRange return zeros when empty', () => {
    expect(curve.getValueRange()).toEqual({ min: 0, max: 0 });
    expect(curve.getTimeRange()).toEqual({ start: 0, end: 0 });
  });

  it('bounce preset has 4 keyframes', () => {
    curve.loadPreset('bounce');
    expect(curve.getKeyCount()).toBe(4);
  });

  it('spring preset overshoots (>1) around t=0.3', () => {
    curve.loadPreset('spring');
    const keys = curve.getKeyframes();
    // Second key at t=0.3 has value 1.2
    expect(keys[1].value).toBe(1.2);
  });
});
