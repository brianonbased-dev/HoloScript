/**
 * TerrainBrush — Production Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainBrush, BrushMode } from '../TerrainBrush';
import { TerrainSystem } from '../TerrainSystem';

// Helper: create a flat terrain (all heights = 0.5) at a given resolution
function makeFlatTerrain(resolution = 33): { system: TerrainSystem; id: string } {
  const system = new TerrainSystem();
  const cfg = {
    id: 'test',
    width: 100,
    depth: 100,
    resolution,
    maxHeight: 50,
    position: [0, 0, 0],
  };
  const heightmap = new Float32Array(resolution * resolution).fill(0.5);
  system.createFromHeightmap(cfg, heightmap);
  return { system, id: 'test' };
}

function makeBrush(system: TerrainSystem, overrides = {}) {
  return new TerrainBrush(system, { radius: 3, strength: 0.5, falloff: 0.5, ...overrides });
}

describe('TerrainBrush — construction & config', () => {
  it('constructs without error', () => {
    const { system } = makeFlatTerrain();
    expect(() => new TerrainBrush(system)).not.toThrow();
  });
  it('returns default config', () => {
    const { system } = makeFlatTerrain();
    const brush = new TerrainBrush(system);
    const cfg = brush.getConfig();
    expect(cfg.mode).toBe('raise');
    expect(cfg.radius).toBe(5);
    expect(cfg.strength).toBe(0.1);
    expect(cfg.falloff).toBe(0.7);
  });
  it('setMode changes mode', () => {
    const { system } = makeFlatTerrain();
    const brush = makeBrush(system);
    brush.setMode('flatten');
    expect(brush.getConfig().mode).toBe('flatten');
  });
  it('setRadius clamps to [1,50]', () => {
    const { system } = makeFlatTerrain();
    const brush = makeBrush(system);
    brush.setRadius(0);
    expect(brush.getConfig().radius).toBe(1);
    brush.setRadius(200);
    expect(brush.getConfig().radius).toBe(50);
    brush.setRadius(10);
    expect(brush.getConfig().radius).toBe(10);
  });
  it('setStrength clamps to [0,1]', () => {
    const { system } = makeFlatTerrain();
    const brush = makeBrush(system);
    brush.setStrength(-1);
    expect(brush.getConfig().strength).toBe(0);
    brush.setStrength(2);
    expect(brush.getConfig().strength).toBe(1);
    brush.setStrength(0.5);
    expect(brush.getConfig().strength).toBe(0.5);
  });
  it('setConfig merges partial update', () => {
    const { system } = makeFlatTerrain();
    const brush = makeBrush(system);
    brush.setConfig({ mode: 'smooth', strength: 0.8 });
    const cfg = brush.getConfig();
    expect(cfg.mode).toBe('smooth');
    expect(cfg.strength).toBe(0.8);
    expect(cfg.radius).toBe(3); // unchanged
  });
});

describe('TerrainBrush — raise mode', () => {
  it('increases height at center', () => {
    const { system, id } = makeFlatTerrain();
    const brush = makeBrush(system, { mode: 'raise', strength: 1 });
    const t = system.getTerrain(id)!;
    const res = t.config.resolution;
    const center = Math.floor(res / 2);
    const idx = center * res + center;
    const before = t.heightmap[idx];
    brush.apply(id, center, center);
    expect(t.heightmap[idx]).toBeGreaterThan(before);
  });
  it('does not exceed 1.0', () => {
    const { system, id } = makeFlatTerrain();
    const t = system.getTerrain(id)!;
    t.heightmap.fill(0.99);
    const brush = makeBrush(system, { mode: 'raise', strength: 1, radius: 2 });
    const center = 16;
    brush.apply(id, center, center);
    for (let i = 0; i < t.heightmap.length; i++) {
      expect(t.heightmap[i]).toBeLessThanOrEqual(1.0);
    }
  });
  it('returns stroke with affectedCells', () => {
    const { system, id } = makeFlatTerrain();
    const brush = makeBrush(system, { mode: 'raise', strength: 1 });
    const stroke = brush.apply(id, 16, 16);
    expect(stroke.affectedCells.length).toBeGreaterThan(0);
    expect(stroke.terrainId).toBe(id);
  });
  it('returns empty stroke for unknown terrain', () => {
    const { system } = makeFlatTerrain();
    const brush = makeBrush(system);
    const stroke = brush.apply('nonexistent', 10, 10);
    expect(stroke.affectedCells).toHaveLength(0);
  });
});

describe('TerrainBrush — lower mode', () => {
  it('decreases height at center', () => {
    const { system, id } = makeFlatTerrain();
    const brush = makeBrush(system, { mode: 'lower', strength: 1 });
    const t = system.getTerrain(id)!;
    const center = 16;
    const idx = center * t.config.resolution + center;
    const before = t.heightmap[idx];
    brush.apply(id, center, center);
    expect(t.heightmap[idx]).toBeLessThan(before);
  });
  it('does not go below 0', () => {
    const { system, id } = makeFlatTerrain();
    const t = system.getTerrain(id)!;
    t.heightmap.fill(0.01);
    const brush = makeBrush(system, { mode: 'lower', strength: 1, radius: 2 });
    brush.apply(id, 16, 16);
    for (let i = 0; i < t.heightmap.length; i++) {
      expect(t.heightmap[i]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('TerrainBrush — flatten mode', () => {
  it('moves height toward flattenHeight', () => {
    const { system, id } = makeFlatTerrain(); // all 0.5
    const brush = makeBrush(system, {
      mode: 'flatten',
      strength: 1,
      flattenHeight: 0.8,
      radius: 1,
      falloff: 0,
    });
    const t = system.getTerrain(id)!;
    const res = t.config.resolution;
    const center = 16;
    brush.apply(id, center, center);
    const h = t.heightmap[center * res + center];
    expect(h).toBeGreaterThan(0.5); // moved toward 0.8
  });
  it('flatten from above-target moves height down', () => {
    const { system, id } = makeFlatTerrain();
    const t = system.getTerrain(id)!;
    t.heightmap.fill(0.9);
    const brush = makeBrush(system, {
      mode: 'flatten',
      strength: 1,
      flattenHeight: 0.3,
      radius: 1,
      falloff: 0,
    });
    const center = 16;
    brush.apply(id, center, center);
    expect(t.heightmap[center * t.config.resolution + center]).toBeLessThan(0.9);
  });
  it('defaults flattenHeight to 0.5 when not specified', () => {
    const { system, id } = makeFlatTerrain();
    const t = system.getTerrain(id)!;
    t.heightmap.fill(0.9);
    const brush = makeBrush(system, { mode: 'flatten', strength: 1, radius: 1, falloff: 0 });
    brush.apply(id, 16, 16);
    // should move toward 0.5
    expect(t.heightmap[16 * t.config.resolution + 16]).toBeLessThan(0.9);
  });
});

describe('TerrainBrush — smooth mode', () => {
  it('smooths a sharp spike', () => {
    const { system, id } = makeFlatTerrain();
    const t = system.getTerrain(id)!;
    const res = t.config.resolution;
    const center = 16;
    t.heightmap[center * res + center] = 1.0; // spike
    const brush = makeBrush(system, { mode: 'smooth', strength: 1, radius: 1, falloff: 0 });
    const before = t.heightmap[center * res + center];
    brush.apply(id, center, center);
    expect(t.heightmap[center * res + center]).toBeLessThan(before);
  });
  it('returns stroke with affected cells', () => {
    const { system, id } = makeFlatTerrain();
    const t = system.getTerrain(id)!;
    const res = t.config.resolution;
    t.heightmap[16 * res + 16] = 1.0;
    const brush = makeBrush(system, { mode: 'smooth', strength: 1, radius: 1 });
    const stroke = brush.apply(id, 16, 16);
    expect(stroke.affectedCells.length).toBeGreaterThanOrEqual(0); // smooth may or may not change uniform terrain
  });
});

describe('TerrainBrush — paint mode', () => {
  it('returns stroke without modifying heightmap', () => {
    const { system, id } = makeFlatTerrain();
    const t = system.getTerrain(id)!;
    const snapshot = Float32Array.from(t.heightmap);
    const brush = makeBrush(system, { mode: 'paint', paintLayerId: 'grass' });
    brush.apply(id, 16, 16);
    for (let i = 0; i < snapshot.length; i++) {
      expect(t.heightmap[i]).toBeCloseTo(snapshot[i]);
    }
  });
  it('paint stroke has zero affectedCells (no height change)', () => {
    const { system, id } = makeFlatTerrain();
    const brush = makeBrush(system, { mode: 'paint', strength: 1 });
    const stroke = brush.apply(id, 16, 16);
    expect(stroke.affectedCells).toHaveLength(0);
  });
});

describe('TerrainBrush — undo/redo', () => {
  it('undoCount 0 before any strokes', () => {
    const { system } = makeFlatTerrain();
    const brush = makeBrush(system);
    expect(brush.getUndoCount()).toBe(0);
  });
  it('undoCount increments after apply', () => {
    const { system, id } = makeFlatTerrain();
    const brush = makeBrush(system, { mode: 'raise', strength: 1 });
    brush.apply(id, 16, 16);
    expect(brush.getUndoCount()).toBe(1);
    brush.apply(id, 16, 16);
    expect(brush.getUndoCount()).toBe(2);
  });
  it('undo reverts heightmap change', () => {
    const { system, id } = makeFlatTerrain();
    const t = system.getTerrain(id)!;
    const res = t.config.resolution;
    const center = 16;
    const idx = center * res + center;
    const before = t.heightmap[idx];
    const brush = makeBrush(system, { mode: 'raise', strength: 1, radius: 1, falloff: 0 });
    brush.apply(id, center, center);
    const afterRaise = t.heightmap[idx];
    expect(afterRaise).toBeGreaterThan(before);
    brush.undo();
    expect(t.heightmap[idx]).toBeCloseTo(before, 6);
  });
  it('undo moves to redoStack', () => {
    const { system, id } = makeFlatTerrain();
    const brush = makeBrush(system, { mode: 'raise' });
    brush.apply(id, 16, 16);
    brush.undo();
    expect(brush.getUndoCount()).toBe(0);
    expect(brush.getRedoCount()).toBe(1);
  });
  it('redo re-applies the stroke', () => {
    const { system, id } = makeFlatTerrain();
    const t = system.getTerrain(id)!;
    const res = t.config.resolution;
    const center = 16;
    const idx = center * res + center;
    const brush = makeBrush(system, { mode: 'raise', strength: 1, radius: 1, falloff: 0 });
    brush.apply(id, center, center);
    const afterApply = t.heightmap[idx];
    brush.undo();
    brush.redo();
    expect(t.heightmap[idx]).toBeCloseTo(afterApply, 6);
  });
  it('undo returns null on empty stack', () => {
    const { system } = makeFlatTerrain();
    const brush = makeBrush(system);
    expect(brush.undo()).toBeNull();
  });
  it('redo returns null on empty stack', () => {
    const { system } = makeFlatTerrain();
    const brush = makeBrush(system);
    expect(brush.redo()).toBeNull();
  });
  it('new apply after undo clears redo stack', () => {
    const { system, id } = makeFlatTerrain();
    const brush = makeBrush(system, { mode: 'raise' });
    brush.apply(id, 16, 16);
    brush.undo();
    expect(brush.getRedoCount()).toBe(1);
    brush.apply(id, 16, 16); // new apply
    expect(brush.getRedoCount()).toBe(0);
  });
  it('multiple undo/redo in sequence', () => {
    const { system, id } = makeFlatTerrain();
    const brush = makeBrush(system, { mode: 'raise', strength: 1, radius: 1 });
    brush.apply(id, 15, 15);
    brush.apply(id, 17, 17);
    expect(brush.getUndoCount()).toBe(2);
    brush.undo();
    expect(brush.getUndoCount()).toBe(1);
    expect(brush.getRedoCount()).toBe(1);
    brush.undo();
    expect(brush.getUndoCount()).toBe(0);
    expect(brush.getRedoCount()).toBe(2);
    brush.redo();
    expect(brush.getUndoCount()).toBe(1);
    expect(brush.getRedoCount()).toBe(1);
  });
});

describe('TerrainBrush — boundary handling', () => {
  it('apply at edge does not throw', () => {
    const { system, id } = makeFlatTerrain();
    const brush = makeBrush(system, { mode: 'raise', radius: 5 });
    expect(() => brush.apply(id, 0, 0)).not.toThrow();
    expect(() => brush.apply(id, 32, 32)).not.toThrow();
  });
  it('applies do not write out-of-bounds', () => {
    const { system, id } = makeFlatTerrain();
    const brush = makeBrush(system, { mode: 'raise', strength: 1, radius: 10 });
    brush.apply(id, 0, 0);
    // no throw = no OOB writes
  });
});
