import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainSystem } from '../TerrainSystem';
import { TerrainBrush } from '../TerrainBrush';

describe('TerrainBrush', () => {
  let ts: TerrainSystem;
  let brush: TerrainBrush;
  const cfg = { id: 't1', width: 100, depth: 100, resolution: 32, maxHeight: 50, position: { x: 0, y: 0, z: 0 } };

  beforeEach(() => {
    ts = new TerrainSystem();
    const hm = new Float32Array(32 * 32).fill(0.5);
    ts.createFromHeightmap(cfg, hm);
    brush = new TerrainBrush(ts);
  });

  it('has default config', () => {
    const c = brush.getConfig();
    expect(c.mode).toBe('raise');
    expect(c.radius).toBe(5);
  });

  it('setMode changes brush mode', () => {
    brush.setMode('lower');
    expect(brush.getConfig().mode).toBe('lower');
  });

  it('setRadius clamps to 1-50', () => {
    brush.setRadius(0);
    expect(brush.getConfig().radius).toBe(1);
    brush.setRadius(100);
    expect(brush.getConfig().radius).toBe(50);
  });

  it('setStrength clamps to 0-1', () => {
    brush.setStrength(2);
    expect(brush.getConfig().strength).toBe(1);
  });

  it('apply raise increases heights', () => {
    brush.setMode('raise');
    brush.setStrength(1);
    const stroke = brush.apply('t1', 16, 16);
    expect(stroke.affectedCells.length).toBeGreaterThan(0);
    const raised = stroke.affectedCells.some(c => c.newHeight > c.oldHeight);
    expect(raised).toBe(true);
  });

  it('apply lower decreases heights', () => {
    brush.setMode('lower');
    brush.setStrength(1);
    const stroke = brush.apply('t1', 16, 16);
    const lowered = stroke.affectedCells.some(c => c.newHeight < c.oldHeight);
    expect(lowered).toBe(true);
  });

  it('apply returns empty stroke for invalid terrain', () => {
    const stroke = brush.apply('nonexistent', 16, 16);
    expect(stroke.affectedCells).toHaveLength(0);
  });

  it('undo reverses the stroke', () => {
    brush.setStrength(1);
    brush.apply('t1', 16, 16);
    const undone = brush.undo();
    expect(undone).not.toBeNull();
    // Heights should be restored to 0.5
    const data = ts.getTerrain('t1')!;
    expect(data.heightmap[16 * 32 + 16]).toBeCloseTo(0.5, 5);
  });

  it('redo re-applies the stroke', () => {
    brush.setStrength(1);
    brush.apply('t1', 16, 16);
    brush.undo();
    const redone = brush.redo();
    expect(redone).not.toBeNull();
    expect(brush.getUndoCount()).toBe(1);
  });

  it('undo returns null when empty', () => {
    expect(brush.undo()).toBeNull();
  });

  it('redo returns null when empty', () => {
    expect(brush.redo()).toBeNull();
  });

  it('apply clears redo stack', () => {
    brush.apply('t1', 16, 16);
    brush.undo();
    expect(brush.getRedoCount()).toBe(1);
    brush.apply('t1', 10, 10);
    expect(brush.getRedoCount()).toBe(0);
  });
});
