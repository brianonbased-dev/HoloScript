import { describe, it, expect, beforeEach } from 'vitest';
import { CurveEditor } from '../CurveEditor';

describe('CurveEditor', () => {
  let curve: CurveEditor;

  beforeEach(() => {
    curve = new CurveEditor();
  });

  // ---------------------------------------------------------------------------
  // Keyframe Management
  // ---------------------------------------------------------------------------

  it('starts empty', () => {
    expect(curve.getKeyCount()).toBe(0);
  });

  it('addKey inserts a keyframe sorted by time', () => {
    curve.addKey(1, 10);
    curve.addKey(0, 0);
    const keys = curve.getKeyframes();
    expect(keys).toHaveLength(2);
    expect(keys[0].time).toBe(0);
    expect(keys[1].time).toBe(1);
  });

  it('addKey returns the created keyframe', () => {
    const key = curve.addKey(0.5, 0.7, 'flat');
    expect(key.time).toBe(0.5);
    expect(key.value).toBe(0.7);
    expect(key.tangentMode).toBe('flat');
  });

  it('removeKey deletes a keyframe', () => {
    curve.addKey(0, 0);
    curve.addKey(1, 1);
    curve.removeKey(0);
    expect(curve.getKeyCount()).toBe(1);
  });

  it('setKey updates time and value', () => {
    curve.addKey(0, 0);
    curve.addKey(1, 1);
    curve.setKey(1, 0.5, 0.5);
    const keys = curve.getKeyframes();
    expect(keys.some((k) => k.time === 0.5 && k.value === 0.5)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Tangents
  // ---------------------------------------------------------------------------

  it('setTangents overrides tangent values and sets mode to free', () => {
    curve.addKey(0, 0);
    curve.addKey(1, 1);
    curve.setTangents(0, 0, 2);
    const keys = curve.getKeyframes();
    expect(keys[0].outTangent).toBe(2);
    expect(keys[0].tangentMode).toBe('free');
  });

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  it('evaluate empty curve returns 0', () => {
    expect(curve.evaluate(0.5)).toBe(0);
  });

  it('evaluate single key returns its value', () => {
    curve.addKey(0, 42);
    expect(curve.evaluate(0)).toBe(42);
    expect(curve.evaluate(0.5)).toBe(42);
  });

  it('evaluate clamps before first key', () => {
    curve.addKey(0, 0);
    curve.addKey(1, 1);
    expect(curve.evaluate(-1)).toBe(0);
  });

  it('evaluate clamps after last key', () => {
    curve.addKey(0, 0);
    curve.addKey(1, 1);
    expect(curve.evaluate(2)).toBe(1);
  });

  it('evaluate linear preset at midpoint ≈ 0.5', () => {
    curve.loadPreset('linear');
    const mid = curve.evaluate(0.5);
    expect(mid).toBeCloseTo(0.5, 1);
  });

  it('evaluate ease-in starts slow', () => {
    curve.loadPreset('ease-in');
    const early = curve.evaluate(0.25);
    expect(early).toBeLessThan(0.25); // Slower than linear
  });

  it('evaluate ease-out ends slow', () => {
    curve.loadPreset('ease-out');
    const late = curve.evaluate(0.75);
    expect(late).toBeGreaterThan(0.75); // Faster early
  });

  it('evaluate constant preset returns 1', () => {
    curve.loadPreset('constant');
    expect(curve.evaluate(0)).toBe(1);
    expect(curve.evaluate(0.5)).toBe(1);
    expect(curve.evaluate(1)).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Wrap Modes
  // ---------------------------------------------------------------------------

  it('setWrapMode and getWrapMode', () => {
    curve.setWrapMode('loop');
    expect(curve.getWrapMode()).toBe('loop');
  });

  it('loop wrap mode repeats curve', () => {
    curve.loadPreset('linear');
    curve.setWrapMode('loop');
    const v = curve.evaluate(1.5); // Should be like 0.5
    expect(v).toBeCloseTo(0.5, 1);
  });

  // ---------------------------------------------------------------------------
  // Presets
  // ---------------------------------------------------------------------------

  it('loadPreset bounce has 4 keys', () => {
    curve.loadPreset('bounce');
    expect(curve.getKeyCount()).toBe(4);
  });

  it('loadPreset spring has 4 keys', () => {
    curve.loadPreset('spring');
    expect(curve.getKeyCount()).toBe(4);
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  it('getValueRange returns min/max values', () => {
    curve.addKey(0, -5);
    curve.addKey(1, 10);
    const range = curve.getValueRange();
    expect(range.min).toBe(-5);
    expect(range.max).toBe(10);
  });

  it('getTimeRange returns start/end times', () => {
    curve.addKey(0.2, 0);
    curve.addKey(0.8, 1);
    const range = curve.getTimeRange();
    expect(range.start).toBe(0.2);
    expect(range.end).toBe(0.8);
  });

  it('empty ranges return zero', () => {
    expect(curve.getValueRange()).toEqual({ min: 0, max: 0 });
    expect(curve.getTimeRange()).toEqual({ start: 0, end: 0 });
  });
});
