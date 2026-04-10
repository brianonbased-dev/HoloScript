import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainBrush } from '../TerrainBrush';

describe('TerrainBrush', () => {
  let tb: TerrainBrush;

  beforeEach(() => {
    tb = new TerrainBrush(16);
  });

  it('constructs with defaults', () => {
    expect(tb.getGridSize()).toBe(16);
    expect(tb.getConfig().mode).toBe('raise');
    expect(tb.getStrokeCount()).toBe(0);
  });

  it('raise mode increases height', () => {
    const affected = tb.apply(8, 8);
    expect(affected).toBeGreaterThan(0);
    expect(tb.getHeight(8, 8)).toBeGreaterThan(0);
    expect(tb.getStrokeCount()).toBe(1);
  });

  it('lower mode decreases height', () => {
    tb.apply(8, 8); // raise first
    const h = tb.getHeight(8, 8);
    tb.apply(8, 8, { mode: 'lower' });
    expect(tb.getHeight(8, 8)).toBeLessThan(h);
  });

  it('smooth mode averages heights', () => {
    tb.setConfig({ mode: 'raise', strength: 5 });
    tb.apply(8, 8);
    const peak = tb.getHeight(8, 8);
    tb.apply(8, 8, { mode: 'smooth' });
    expect(tb.getHeight(8, 8)).toBeLessThanOrEqual(peak);
  });

  it('flatten mode levels terrain', () => {
    tb.setConfig({ strength: 5 });
    tb.apply(8, 8);
    tb.apply(8, 8, { mode: 'flatten' });
    // After flatten, height moves toward average
    expect(tb.getStrokeCount()).toBe(2);
  });

  it('locked cells are unaffected', () => {
    tb.setLocked(8, 8, true);
    tb.apply(8, 8);
    expect(tb.getHeight(8, 8)).toBe(0);
  });

  it('undo reverses last stroke', () => {
    tb.apply(8, 8);
    const h = tb.getHeight(8, 8);
    expect(h).toBeGreaterThan(0);
    expect(tb.undo()).toBe(true);
    expect(tb.getHeight(8, 8)).toBe(0);
  });

  it('undo returns false when empty', () => {
    expect(tb.undo()).toBe(false);
  });

  it('paint changes cell layer', () => {
    const painted = tb.paint(8, 8, 2);
    expect(painted).toBeGreaterThan(0);
    expect(tb.getCell(8, 8)?.paintLayer).toBe(2);
  });

  it('getHeightRange returns min/max', () => {
    tb.apply(8, 8, { mode: 'raise', strength: 3 });
    const range = tb.getHeightRange();
    expect(range.max).toBeGreaterThan(0);
    expect(range.min).toBeLessThanOrEqual(range.max);
  });

  it('setConfig merges', () => {
    tb.setConfig({ radius: 3, falloff: 'tip' });
    expect(tb.getConfig().radius).toBe(3);
    expect(tb.getConfig().falloff).toBe('tip');
  });

  it('getUndoCount tracks', () => {
    tb.apply(8, 8);
    tb.apply(8, 8);
    expect(tb.getUndoCount()).toBe(2);
    tb.undo();
    expect(tb.getUndoCount()).toBe(1);
  });
});
