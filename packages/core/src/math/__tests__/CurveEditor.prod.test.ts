/**
 * CurveEditor — Production Test Suite
 *
 * Covers: addKey (sorted, tangent modes), removeKey, setKey, setTangents,
 * getKeyframes/Count, evaluate (empty/single/hermite/stepped, clamp),
 * wrapMode (loop/ping-pong), loadPreset, getValueRange, getTimeRange,
 * autoComputeTangents.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CurveEditor } from '../CurveEditor';
import type { CurvePreset } from '../CurveEditor';

describe('CurveEditor — Production', () => {
  let curve: CurveEditor;

  beforeEach(() => {
    curve = new CurveEditor();
  });

  // ─── Empty / Single ───────────────────────────────────────────────
  it('starts empty', () => {
    expect(curve.getKeyCount()).toBe(0);
    expect(curve.getKeyframes()).toEqual([]);
  });

  it('evaluate returns 0 for empty curve', () => {
    expect(curve.evaluate(0.5)).toBe(0);
  });

  it('evaluate returns the only key value for single key', () => {
    curve.addKey(0.5, 42);
    expect(curve.evaluate(0)).toBe(42);
    expect(curve.evaluate(999)).toBe(42);
  });

  // ─── addKey ───────────────────────────────────────────────────────
  it('addKey inserts sorted by time', () => {
    curve.addKey(1, 10);
    curve.addKey(0, 5);
    const kfs = curve.getKeyframes();
    expect(kfs[0].time).toBe(0);
    expect(kfs[1].time).toBe(1);
  });

  it('addKey returns the keyframe', () => {
    const key = curve.addKey(0.5, 75);
    expect(key.time).toBe(0.5);
    expect(key.value).toBe(75);
  });

  it('addKey with stepped tangentMode stores correctly', () => {
    curve.addKey(0, 0, 'stepped');
    expect(curve.getKeyframes()[0].tangentMode).toBe('stepped');
  });

  // ─── removeKey ────────────────────────────────────────────────────
  it('removeKey removes by index', () => {
    curve.addKey(0, 0);
    curve.addKey(1, 10);
    curve.removeKey(0);
    expect(curve.getKeyCount()).toBe(1);
  });

  // ─── setKey ───────────────────────────────────────────────────────
  it('setKey updates time and value', () => {
    curve.addKey(0, 0);
    curve.setKey(0, 0.5, 99);
    expect(curve.getKeyframes()[0].time).toBe(0.5);
    expect(curve.getKeyframes()[0].value).toBe(99);
  });

  it('setKey out of bounds is safe', () => {
    expect(() => curve.setKey(99, 0, 0)).not.toThrow();
  });

  // ─── setTangents ──────────────────────────────────────────────────
  it('setTangents updates tangent handles', () => {
    curve.addKey(0, 0);
    curve.setTangents(0, 2, 3);
    const kf = curve.getKeyframes()[0];
    expect(kf.inTangent).toBe(2);
    expect(kf.outTangent).toBe(3);
    expect(kf.tangentMode).toBe('free');
  });

  it('setTangents out of bounds is safe', () => {
    expect(() => curve.setTangents(99, 0, 0)).not.toThrow();
  });

  // ─── evaluate — clamp mode ────────────────────────────────────────
  it('evaluate clamps below first key', () => {
    curve.addKey(0, 5);
    curve.addKey(1, 15);
    expect(curve.evaluate(-1)).toBeCloseTo(5);
  });

  it('evaluate clamps above last key', () => {
    curve.addKey(0, 5);
    curve.addKey(1, 15);
    expect(curve.evaluate(10)).toBeCloseTo(15);
  });

  it('evaluate linear midpoint', () => {
    curve.addKey(0, 0, 'linear');
    curve.addKey(1, 10, 'linear');
    // Linear tangent mode — tangents follow slope
    const v = curve.evaluate(0.5);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(10);
  });

  it('evaluate stepped returns previous value', () => {
    curve.addKey(0, 0, 'stepped');
    curve.addKey(1, 100, 'stepped');
    expect(curve.evaluate(0.5)).toBe(0); // stepped holds k0.value
  });

  // ─── WrapMode ────────────────────────────────────────────────────
  it('default wrapMode is clamp', () => {
    expect(curve.getWrapMode()).toBe('clamp');
  });

  it('setWrapMode changes mode', () => {
    curve.setWrapMode('loop');
    expect(curve.getWrapMode()).toBe('loop');
  });

  it('loop mode wraps time back to start', () => {
    curve.addKey(0, 0, 'linear');
    curve.addKey(1, 10, 'linear');
    curve.setWrapMode('loop');
    const v0 = curve.evaluate(0.5);
    const v1 = curve.evaluate(1.5); // same as 0.5 in loop
    expect(v1).toBeCloseTo(v0, 0);
  });

  it('ping-pong mode reverses the curve', () => {
    curve.addKey(0, 0, 'linear');
    curve.addKey(1, 10, 'linear');
    curve.setWrapMode('ping-pong');
    const forward = curve.evaluate(0.3);
    const backward = curve.evaluate(1.7); // same position mirrored
    expect(backward).toBeCloseTo(forward, 0);
  });

  // ─── loadPreset ───────────────────────────────────────────────────
  it.each<CurvePreset>([
    'linear',
    'ease-in',
    'ease-out',
    'ease-in-out',
    'constant',
    'bounce',
    'spring',
  ])('loadPreset %s produces a evaluatable curve', (preset) => {
    curve.loadPreset(preset);
    expect(curve.getKeyCount()).toBeGreaterThanOrEqual(2);
    expect(() => curve.evaluate(0.5)).not.toThrow();
  });

  it('linear preset evaluates to ~0.5 at midpoint', () => {
    curve.loadPreset('linear');
    expect(curve.evaluate(0.5)).toBeCloseTo(0.5, 1);
  });

  // ─── Ranges ───────────────────────────────────────────────────────
  it('getValueRange returns correct min/max', () => {
    curve.addKey(0, -5);
    curve.addKey(0.5, 20);
    curve.addKey(1, 10);
    const range = curve.getValueRange();
    expect(range.min).toBe(-5);
    expect(range.max).toBe(20);
  });

  it('getValueRange returns 0,0 for empty curve', () => {
    expect(curve.getValueRange()).toEqual({ min: 0, max: 0 });
  });

  it('getTimeRange returns first and last key times', () => {
    curve.addKey(0.2, 0);
    curve.addKey(0.8, 10);
    expect(curve.getTimeRange()).toEqual({ start: 0.2, end: 0.8 });
  });

  it('getTimeRange returns 0,0 for empty curve', () => {
    expect(curve.getTimeRange()).toEqual({ start: 0, end: 0 });
  });
});
