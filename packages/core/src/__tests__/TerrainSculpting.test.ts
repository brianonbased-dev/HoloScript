/**
 * TerrainSculpting.test.ts — Cycle 194
 *
 * Tests for TerrainBrush and ErosionSim.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainBrush } from '@holoscript/engine/terrain/TerrainBrush';
import { ErosionSim } from '@holoscript/engine/terrain/ErosionSim';

// =============================================================================
// TERRAIN BRUSH
// =============================================================================

describe('TerrainBrush', () => {
  let brush: TerrainBrush;
  beforeEach(() => {
    brush = new TerrainBrush(32, { radius: 3, strength: 1, falloff: 'smooth' });
  });

  it('initializes with flat grid', () => {
    expect(brush.getGridSize()).toBe(32);
    expect(brush.getHeight(16, 16)).toBe(0);
  });

  it('raise mode increases height', () => {
    brush.apply(16, 16, { mode: 'raise' });
    expect(brush.getHeight(16, 16)).toBeGreaterThan(0);
  });

  it('lower mode decreases height', () => {
    brush.apply(16, 16, { mode: 'raise' });
    const raised = brush.getHeight(16, 16);
    brush.apply(16, 16, { mode: 'lower' });
    expect(brush.getHeight(16, 16)).toBeLessThan(raised);
  });

  it('flatten mode converges to average', () => {
    brush.apply(16, 16, { mode: 'raise', strength: 5 });
    const peak = brush.getHeight(16, 16);
    for (let i = 0; i < 10; i++) brush.apply(16, 16, { mode: 'flatten' });
    const after = brush.getHeight(16, 16);
    expect(Math.abs(after)).toBeLessThan(Math.abs(peak));
  });

  it('smooth mode reduces extremes', () => {
    brush.apply(16, 16, { mode: 'raise', strength: 10 });
    const before = brush.getHeight(16, 16);
    for (let i = 0; i < 5; i++) brush.apply(16, 16, { mode: 'smooth' });
    const range = brush.getHeightRange();
    expect(range.max - range.min).toBeLessThan(before);
  });

  it('undo restores previous state', () => {
    brush.apply(16, 16, { mode: 'raise' });
    const raised = brush.getHeight(16, 16);
    expect(raised).toBeGreaterThan(0);
    brush.undo();
    expect(brush.getHeight(16, 16)).toBe(0);
  });

  it('undo returns false on empty stack', () => {
    expect(brush.undo()).toBe(false);
  });

  it('locked cells are not modified', () => {
    brush.setLocked(16, 16, true);
    brush.apply(16, 16, { mode: 'raise' });
    expect(brush.getHeight(16, 16)).toBe(0);
  });

  it('paint sets layer index', () => {
    const painted = brush.paint(16, 16, 3);
    expect(painted).toBeGreaterThan(0);
    const cell = brush.getCell(16, 16);
    expect(cell!.paintLayer).toBe(3);
  });

  it('setConfig changes brush mode', () => {
    brush.setConfig({ mode: 'erode', strength: 0.5 });
    const cfg = brush.getConfig();
    expect(cfg.mode).toBe('erode');
    expect(cfg.strength).toBe(0.5);
  });

  it('getStrokeCount tracks applications', () => {
    brush.apply(10, 10);
    brush.apply(20, 20);
    expect(brush.getStrokeCount()).toBe(2);
  });

  it('getUndoCount matches undo stack', () => {
    brush.apply(10, 10);
    brush.apply(20, 20);
    expect(brush.getUndoCount()).toBe(2);
    brush.undo();
    expect(brush.getUndoCount()).toBe(1);
  });

  it('falloff affects strength with distance', () => {
    brush.apply(16, 16, { mode: 'raise', radius: 5, falloff: 'linear' });
    const center = brush.getHeight(16, 16);
    const edge = brush.getHeight(20, 16);
    expect(center).toBeGreaterThan(edge);
  });

  it('apply returns affected cell count', () => {
    const affected = brush.apply(16, 16);
    expect(affected).toBeGreaterThan(0);
  });

  it('getHeightRange reports min max', () => {
    brush.apply(16, 16, { mode: 'raise', strength: 5 });
    brush.apply(5, 5, { mode: 'lower', strength: 3 });
    const range = brush.getHeightRange();
    expect(range.max).toBeGreaterThan(0);
    expect(range.min).toBeLessThan(0);
  });
});

// =============================================================================
// EROSION SIM
// =============================================================================

describe('ErosionSim', () => {
  let erosion: ErosionSim;
  beforeEach(() => {
    erosion = new ErosionSim({ iterations: 100, seed: 42 });
  });

  it('initializes with config', () => {
    const cfg = erosion.getConfig();
    expect(cfg.iterations).toBe(100);
    expect(cfg.seed).toBe(42);
  });

  it('hydraulic erosion modifies heightmap', () => {
    const size = 16;
    const hm = new Float32Array(size * size);
    // Create a hill
    for (let z = 0; z < size; z++)
      for (let x = 0; x < size; x++) {
        const dx = x - size / 2,
          dz = z - size / 2;
        hm[z * size + x] = Math.max(0, 5 - Math.sqrt(dx * dx + dz * dz));
      }
    const before = new Float32Array(hm);
    const result = erosion.hydraulicErode(hm, size, size);
    expect(result.totalEroded).toBeGreaterThan(0);
    expect(result.iterations).toBe(100);
    // Heightmap should differ
    let differs = false;
    for (let i = 0; i < hm.length; i++)
      if (hm[i] !== before[i]) {
        differs = true;
        break;
      }
    expect(differs).toBe(true);
  });

  it('thermal erosion reduces steep slopes', () => {
    const size = 16;
    const hm = new Float32Array(size * size);
    // Create a spike
    hm[8 * 16 + 8] = 100;
    const result = erosion.thermalErode(hm, size, size, 50);
    expect(result.totalEroded).toBeGreaterThan(0);
    expect(hm[8 * 16 + 8]).toBeLessThan(100);
  });

  it('setConfig updates parameters', () => {
    erosion.setConfig({ iterations: 500, rainAmount: 2 });
    const cfg = erosion.getConfig();
    expect(cfg.iterations).toBe(500);
    expect(cfg.rainAmount).toBe(2);
  });

  it('deterministic with same seed', () => {
    const size = 8;
    const hm1 = new Float32Array(size * size);
    const hm2 = new Float32Array(size * size);
    for (let i = 0; i < hm1.length; i++) {
      hm1[i] = Math.sin(i) * 2;
      hm2[i] = hm1[i];
    }
    const e1 = new ErosionSim({ iterations: 50, seed: 123 });
    const e2 = new ErosionSim({ iterations: 50, seed: 123 });
    const r1 = e1.hydraulicErode(hm1, size, size);
    const r2 = e2.hydraulicErode(hm2, size, size);
    expect(r1.totalEroded).toBeCloseTo(r2.totalEroded, 5);
  });

  it('erosion result has maxDepthChange', () => {
    const size = 8;
    const hm = new Float32Array(size * size);
    hm[4 * 8 + 4] = 10;
    const result = erosion.hydraulicErode(hm, size, size);
    expect(result.maxDepthChange).toBeGreaterThanOrEqual(0);
  });
});
