import { describe, it, expect, beforeEach } from 'vitest';
import { GrassRenderer } from '../GrassRenderer';

describe('GrassRenderer', () => {
  let gr: GrassRenderer;

  beforeEach(() => {
    gr = new GrassRenderer();
  });

  it('starts with zero blades', () => {
    expect(gr.getBladeCount()).toBe(0);
  });

  it('generate creates blades based on density', () => {
    gr.generate({ x: 0, z: 0, w: 2, h: 2 });
    // 2*2=4 area * 10 bladesPerUnit = 40
    expect(gr.getBladeCount()).toBe(40);
  });

  it('all blades start visible', () => {
    gr.generate({ x: 0, z: 0, w: 1, h: 1 });
    expect(gr.getVisibleBlades().length).toBe(gr.getBladeCount());
  });

  it('updateLOD culls distant blades', () => {
    gr.generate({ x: 0, z: 0, w: 1, h: 1 });
    gr.updateLOD({ x: 1000, z: 1000 });
    expect(gr.getVisibleBlades().length).toBe(0);
  });

  it('updateLOD sets billboard for mid-distance', () => {
    gr.generate({ x: 30, z: 0, w: 1, h: 1 });
    gr.updateLOD({ x: 0, z: 0 });
    expect(gr.getBillboardCount()).toBeGreaterThan(0);
  });

  it('nearby blades are LOD 0', () => {
    gr.generate({ x: 0, z: 0, w: 1, h: 1 });
    gr.updateLOD({ x: 0, z: 0 });
    const visible = gr.getVisibleBlades();
    expect(visible.every(b => b.lodLevel === 0)).toBe(true);
  });

  it('setConfig updates configuration', () => {
    gr.setConfig({ bladesPerUnit: 5 });
    expect(gr.getConfig().bladesPerUnit).toBe(5);
  });

  it('custom config via constructor', () => {
    const custom = new GrassRenderer({ bladesPerUnit: 1, cullDistance: 10 });
    expect(custom.getConfig().bladesPerUnit).toBe(1);
    expect(custom.getConfig().cullDistance).toBe(10);
  });

  it('generate is deterministic with same seed', () => {
    gr.generate({ x: 0, z: 0, w: 2, h: 2 }, 42);
    const blades1 = gr.getVisibleBlades().map(b => b.position);
    gr.generate({ x: 0, z: 0, w: 2, h: 2 }, 42);
    const blades2 = gr.getVisibleBlades().map(b => b.position);
    expect(blades1).toEqual(blades2);
  });
});
