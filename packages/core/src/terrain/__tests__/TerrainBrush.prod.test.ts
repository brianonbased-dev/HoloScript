/**
 * TerrainBrush — Production Test Suite
 *
 * Covers: construction (defaults/partial), apply (raise/lower/flatten/smooth/erode),
 * paint (layer assignment), undo, getHeight, getCell, setLocked (blocks apply),
 * getConfig/setConfig, getStrokeCount, getGridSize, getUndoCount, getHeightRange.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainBrush } from '../TerrainBrush';

describe('TerrainBrush — Production', () => {
  let brush: TerrainBrush;

  beforeEach(() => {
    brush = new TerrainBrush(16, { mode: 'raise', radius: 2, strength: 1, falloff: 'flat', opacity: 1 });
  });

  // ─── Construction ──────────────────────────────────────────────────
  it('defaults to 64x64 grid', () => {
    const b = new TerrainBrush();
    expect(b.getGridSize()).toBe(64);
  });

  it('accepts custom gridSize', () => {
    expect(brush.getGridSize()).toBe(16);
  });

  it('starts with zero strokes and undo entries', () => {
    expect(brush.getStrokeCount()).toBe(0);
    expect(brush.getUndoCount()).toBe(0);
  });

  it('initial height is 0 everywhere', () => {
    expect(brush.getHeight(8, 8)).toBe(0);
    expect(brush.getHeight(0, 0)).toBe(0);
  });

  // ─── apply: raise ──────────────────────────────────────────────────
  it('raise mode increases height at center', () => {
    brush.apply(8, 8);
    expect(brush.getHeight(8, 8)).toBeGreaterThan(0);
  });

  it('raise returns affected cell count > 0', () => {
    const count = brush.apply(8, 8);
    expect(count).toBeGreaterThan(0);
  });

  it('raise records a stroke', () => {
    brush.apply(8, 8);
    expect(brush.getStrokeCount()).toBe(1);
  });

  it('raise records undo entry', () => {
    brush.apply(8, 8);
    expect(brush.getUndoCount()).toBe(1);
  });

  // ─── apply: lower ─────────────────────────────────────────────────
  it('lower mode decreases height at center', () => {
    brush.apply(8, 8, { mode: 'lower' });
    expect(brush.getHeight(8, 8)).toBeLessThan(0);
  });

  // ─── apply: flatten ────────────────────────────────────────────────
  it('flatten mode converges heights toward average', () => {
    // Raise one corner first
    brush.apply(0, 0, { mode: 'raise', radius: 1, strength: 5 });
    const h0 = brush.getHeight(0, 0);
    brush.apply(0, 0, { mode: 'flatten', radius: 2, strength: 1, falloff: 'flat' });
    // Height should have moved toward the local average
    expect(brush.getHeight(0, 0)).not.toBe(h0); // some change occurred
  });

  // ─── apply: smooth ─────────────────────────────────────────────────
  it('smooth mode does not blow up heights', () => {
    brush.apply(8, 8, { mode: 'smooth', radius: 3, strength: 0.5, falloff: 'linear', opacity: 1 });
    const { min, max } = brush.getHeightRange();
    expect(max - min).toBeLessThan(10); // should be small changes on flat terrain
  });

  // ─── apply: erode ─────────────────────────────────────────────────
  it('erode mode modifies terrain', () => {
    // Raise a spike first
    brush.apply(8, 8, { mode: 'raise', radius: 1, strength: 5 });
    brush.apply(8, 8, { mode: 'erode', radius: 2, strength: 1, falloff: 'flat', opacity: 1 });
    expect(brush.getHeight(8, 8)).toBeGreaterThan(0); // still raised but reduced
  });

  // ─── apply: overrides ──────────────────────────────────────────────
  it('apply overrides do not mutate stored config', () => {
    brush.apply(8, 8, { mode: 'lower' });
    expect(brush.getConfig().mode).toBe('raise'); // original preserved
  });

  // ─── paint ────────────────────────────────────────────────────────
  it('paint assigns paintLayer to cells', () => {
    brush.apply(8, 8); // creates cells in range
    brush.paint(8, 8, 3);
    expect(brush.getCell(8, 8)?.paintLayer).toBe(3);
  });

  it('paint returns painted cell count', () => {
    const n = brush.paint(8, 8, 2);
    expect(n).toBeGreaterThan(0);
  });

  // ─── undo ─────────────────────────────────────────────────────────
  it('undo reverts height changes', () => {
    brush.apply(8, 8);
    const raised = brush.getHeight(8, 8);
    brush.undo();
    expect(brush.getHeight(8, 8)).toBeLessThan(raised);
  });

  it('undo returns true when entry exists', () => {
    brush.apply(8, 8);
    expect(brush.undo()).toBe(true);
  });

  it('undo returns false when stack is empty', () => {
    expect(brush.undo()).toBe(false);
  });

  it('undo decrements stroke count', () => {
    brush.apply(8, 8);
    brush.undo();
    expect(brush.getStrokeCount()).toBe(0);
  });

  // ─── setLocked ────────────────────────────────────────────────────
  it('locked cells are unaffected by raise', () => {
    brush.setLocked(8, 8, true);
    brush.apply(8, 8);
    expect(brush.getHeight(8, 8)).toBe(0);
  });

  it('setLocked false re-enables modification', () => {
    brush.setLocked(8, 8, true);
    brush.setLocked(8, 8, false);
    brush.apply(8, 8, { radius: 0.5 });
    expect(brush.getHeight(8, 8)).toBeGreaterThan(0);
  });

  // ─── getConfig / setConfig ────────────────────────────────────────
  it('getConfig returns a copy', () => {
    const cfg = brush.getConfig();
    cfg.strength = 999;
    expect(brush.getConfig().strength).toBe(1);
  });

  it('setConfig updates config fields', () => {
    brush.setConfig({ strength: 2.5 });
    expect(brush.getConfig().strength).toBe(2.5);
  });

  // ─── getHeightRange ───────────────────────────────────────────────
  it('getHeightRange min/max on flat terrain', () => {
    const { min, max } = brush.getHeightRange();
    expect(min).toBe(0);
    expect(max).toBe(0);
  });

  it('getHeightRange max increases after raise', () => {
    brush.apply(8, 8);
    const { max } = brush.getHeightRange();
    expect(max).toBeGreaterThan(0);
  });

  // ─── getCell ──────────────────────────────────────────────────────
  it('getCell returns cell within grid', () => {
    const cell = brush.getCell(0, 0);
    expect(cell).toBeDefined();
    expect(cell!.height).toBe(0);
    expect(cell!.locked).toBe(false);
  });

  it('getCell returns undefined outside grid', () => {
    expect(brush.getCell(999, 999)).toBeUndefined();
  });
});
