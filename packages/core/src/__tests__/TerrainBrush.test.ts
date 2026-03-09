import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainBrush } from '../terrain/TerrainBrush';

// =============================================================================
// C293 — Terrain Brush
// =============================================================================

describe('TerrainBrush', () => {
  let brush: TerrainBrush;
  beforeEach(() => {
    brush = new TerrainBrush(16, {
      mode: 'raise',
      radius: 2,
      strength: 1,
      falloff: 'linear',
      opacity: 1,
    });
  });

  it('starts with flat terrain', () => {
    expect(brush.getHeight(8, 8)).toBe(0);
    expect(brush.getHeightRange()).toEqual({ min: 0, max: 0 });
  });

  it('raise mode increases height at center', () => {
    brush.apply(8, 8);
    expect(brush.getHeight(8, 8)).toBeGreaterThan(0);
  });

  it('lower mode decreases height', () => {
    brush.apply(8, 8, { mode: 'lower' });
    expect(brush.getHeight(8, 8)).toBeLessThan(0);
  });

  it('falloff reduces effect at edge', () => {
    brush.apply(8, 8);
    const center = brush.getHeight(8, 8);
    const edge = brush.getHeight(10, 8); // at radius boundary
    expect(center).toBeGreaterThan(edge);
  });

  it('locked cells are not modified', () => {
    brush.setLocked(8, 8, true);
    brush.apply(8, 8);
    expect(brush.getHeight(8, 8)).toBe(0);
  });

  it('undo reverts last stroke', () => {
    brush.apply(8, 8);
    expect(brush.getHeight(8, 8)).toBeGreaterThan(0);
    brush.undo();
    expect(brush.getHeight(8, 8)).toBe(0);
  });

  it('paint sets layer index', () => {
    const painted = brush.paint(8, 8, 3);
    expect(painted).toBeGreaterThan(0);
    expect(brush.getCell(8, 8)?.paintLayer).toBe(3);
  });

  it('smooth mode pushes heights toward average', () => {
    // Create a spike
    brush.apply(8, 8, { mode: 'raise', radius: 0.5, strength: 10 });
    const spike = brush.getHeight(8, 8);
    brush.apply(8, 8, { mode: 'smooth', radius: 3, strength: 1 });
    expect(brush.getHeight(8, 8)).toBeLessThan(spike);
  });

  it('flatten mode pushes heights toward area average', () => {
    brush.apply(8, 8, { mode: 'raise', radius: 1, strength: 5 });
    const before = brush.getHeight(8, 8);
    brush.apply(8, 8, { mode: 'flatten', radius: 3, strength: 1 });
    expect(Math.abs(brush.getHeight(8, 8))).toBeLessThan(Math.abs(before));
  });

  it('getConfig and setConfig work', () => {
    brush.setConfig({ strength: 5 });
    expect(brush.getConfig().strength).toBe(5);
  });

  it('getStrokeCount tracks strokes', () => {
    brush.apply(8, 8);
    brush.apply(9, 9);
    expect(brush.getStrokeCount()).toBe(2);
  });

  it('getGridSize returns constructor value', () => {
    expect(brush.getGridSize()).toBe(16);
  });
});
