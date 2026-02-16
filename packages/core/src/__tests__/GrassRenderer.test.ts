import { describe, it, expect, beforeEach } from 'vitest';
import { GrassRenderer } from '../environment/GrassRenderer';

// =============================================================================
// C311 — GrassRenderer
// =============================================================================

describe('GrassRenderer', () => {
  let gr: GrassRenderer;
  beforeEach(() => {
    gr = new GrassRenderer({ bladesPerUnit: 10, billboardDistance: 30, cullDistance: 60 });
  });

  it('generate creates blades based on area and density', () => {
    gr.generate({ x: 0, z: 0, w: 5, h: 5 });
    // area = 25, bladesPerUnit = 10 → 250 blades
    expect(gr.getBladeCount()).toBe(250);
  });

  it('blades have positive dimensions', () => {
    gr.generate({ x: 0, z: 0, w: 2, h: 2 });
    const all = gr.getVisibleBlades();
    for (const blade of all) {
      expect(blade.height).toBeGreaterThan(0);
      expect(blade.width).toBeGreaterThan(0);
    }
  });

  it('blade positions are within bounds', () => {
    gr.generate({ x: 10, z: 20, w: 5, h: 5 });
    const blades = gr.getVisibleBlades();
    for (const b of blades) {
      expect(b.position.x).toBeGreaterThanOrEqual(10);
      expect(b.position.x).toBeLessThanOrEqual(15);
      expect(b.position.z).toBeGreaterThanOrEqual(20);
      expect(b.position.z).toBeLessThanOrEqual(25);
    }
  });

  it('updateLOD culls far blades', () => {
    gr.generate({ x: 0, z: 0, w: 200, h: 1 }, 42);
    gr.updateLOD({ x: 0, z: 0 });
    const visible = gr.getVisibleBlades();
    // Blades beyond cullDistance (60) should be culled
    expect(visible.length).toBeLessThan(gr.getBladeCount());
  });

  it('updateLOD marks distant blades as billboards', () => {
    gr.generate({ x: 0, z: 0, w: 100, h: 1 }, 42);
    gr.updateLOD({ x: 0, z: 0 });
    const bbCount = gr.getBillboardCount();
    expect(bbCount).toBeGreaterThan(0);
  });

  it('close blades have lod level 0', () => {
    gr.generate({ x: 0, z: 0, w: 1, h: 1 }, 42);
    gr.updateLOD({ x: 0.5, z: 0.5 });
    const blades = gr.getVisibleBlades();
    for (const b of blades) {
      expect(b.lodLevel).toBe(0);
    }
  });

  it('color variation stays within [0,1]', () => {
    gr = new GrassRenderer({ colorVariation: 0.5 });
    gr.generate({ x: 0, z: 0, w: 5, h: 5 });
    const blades = gr.getVisibleBlades();
    for (const b of blades) {
      expect(b.color.r).toBeGreaterThanOrEqual(0);
      expect(b.color.r).toBeLessThanOrEqual(1);
      expect(b.color.g).toBeGreaterThanOrEqual(0);
      expect(b.color.g).toBeLessThanOrEqual(1);
    }
  });

  it('deterministic with same seed', () => {
    gr.generate({ x: 0, z: 0, w: 3, h: 3 }, 999);
    const count1 = gr.getBladeCount();
    const blade1 = gr.getVisibleBlades()[0];
    gr.generate({ x: 0, z: 0, w: 3, h: 3 }, 999);
    const blade2 = gr.getVisibleBlades()[0];
    expect(gr.getBladeCount()).toBe(count1);
    expect(blade2.position.x).toBeCloseTo(blade1.position.x);
  });

  it('setConfig updates parameters', () => {
    gr.setConfig({ baseHeight: 1.0 });
    expect(gr.getConfig().baseHeight).toBe(1.0);
  });

  it('generate with zero area yields zero blades', () => {
    gr.generate({ x: 0, z: 0, w: 0, h: 0 });
    expect(gr.getBladeCount()).toBe(0);
  });
});
