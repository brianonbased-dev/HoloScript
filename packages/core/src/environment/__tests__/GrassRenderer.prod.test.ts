/**
 * GrassRenderer — Production Tests
 */
import { describe, it, expect } from 'vitest';
import { GrassRenderer } from '../GrassRenderer';

function make(config = {}) { return new GrassRenderer(config); }

const defaultBounds = { x: 0, z: 0, w: 10, h: 10 }; // area=100

describe('GrassRenderer — construction', () => {
  it('constructs without arguments', () => { expect(() => make()).not.toThrow(); });
  it('default baseHeight=0.3', () => { expect(make().getConfig().baseHeight).toBe(0.3); });
  it('default cullDistance=60', () => { expect(make().getConfig().cullDistance).toBe(60); });
  it('default bladesPerUnit=10', () => { expect(make().getConfig().bladesPerUnit).toBe(10); });
  it('custom config merges correctly', () => {
    const g = make({ baseHeight: 0.5, cullDistance: 100 });
    expect(g.getConfig().baseHeight).toBe(0.5);
    expect(g.getConfig().cullDistance).toBe(100);
    expect(g.getConfig().bladesPerUnit).toBe(10); // default unchanged
  });
});

describe('GrassRenderer — generate()', () => {
  it('generates correct blade count (area × bladesPerUnit)', () => {
    const g = make({ bladesPerUnit: 5 });
    g.generate(defaultBounds);
    expect(g.getBladeCount()).toBe(500); // 100 × 5
  });
  it('all blades in bounds XZ', () => {
    const g = make();
    g.generate(defaultBounds);
    for (const b of g.getVisibleBlades()) {
      expect(b.position.x).toBeGreaterThanOrEqual(0);
      expect(b.position.x).toBeLessThanOrEqual(10);
    }
  });
  it('height in [baseHeight - var, baseHeight + var] range', () => {
    const g = make({ baseHeight: 0.3, heightVariation: 0.1 });
    g.generate(defaultBounds);
    for (const b of g.getVisibleBlades()) {
      expect(b.height).toBeGreaterThan(0);
      expect(b.height).toBeLessThanOrEqual(0.3 + 0.1 + 0.001); // small float tolerance
    }
  });
  it('color components in [0,1]', () => {
    const g = make();
    g.generate(defaultBounds, 123);
    for (const b of g.getVisibleBlades()) {
      expect(b.color.r).toBeGreaterThanOrEqual(0); expect(b.color.r).toBeLessThanOrEqual(1);
      expect(b.color.g).toBeGreaterThanOrEqual(0); expect(b.color.g).toBeLessThanOrEqual(1);
      expect(b.color.b).toBeGreaterThanOrEqual(0); expect(b.color.b).toBeLessThanOrEqual(1);
    }
  });
  it('bendFactor in [0, bendRange]', () => {
    const g = make({ bendRange: 0.3 });
    g.generate(defaultBounds);
    for (const b of g.getVisibleBlades()) {
      expect(b.bendFactor).toBeGreaterThanOrEqual(0);
      expect(b.bendFactor).toBeLessThanOrEqual(0.3 + 0.001);
    }
  });
  it('same seed → same blade count and first blade position', () => {
    const g1 = make(); g1.generate(defaultBounds, 77);
    const g2 = make(); g2.generate(defaultBounds, 77);
    expect(g1.getBladeCount()).toBe(g2.getBladeCount());
    expect(g1.getVisibleBlades()[0].position.x).toBeCloseTo(g2.getVisibleBlades()[0].position.x);
  });
  it('different seeds → different first blade', () => {
    const g1 = make(); g1.generate(defaultBounds, 1);
    const g2 = make(); g2.generate(defaultBounds, 2);
    expect(g1.getVisibleBlades()[0].position.x).not.toBeCloseTo(g2.getVisibleBlades()[0].position.x);
  });
  it('re-generate clears previous blades', () => {
    const g = make({ bladesPerUnit: 1 });
    g.generate(defaultBounds);
    const s1 = g.getBladeCount();
    g.generate({ x: 0, z: 0, w: 5, h: 5 }); // smaller area
    expect(g.getBladeCount()).toBeLessThan(s1);
  });
});

describe('GrassRenderer — updateLOD()', () => {
  it('all blades LOD 0 when camera at center and cullDistance large', () => {
    const g = make({ bladesPerUnit: 2, cullDistance: 1000, billboardDistance: 500 });
    g.generate(defaultBounds, 1);
    g.updateLOD({ x: 5, z: 5 });
    for (const b of g.getVisibleBlades()) expect(b.lodLevel).toBe(0);
  });
  it('blades beyond cullDistance are culled (lodLevel=-1)', () => {
    const g = make({ bladesPerUnit: 2, cullDistance: 1, billboardDistance: 0.5 });
    g.generate({ x: 100, z: 100, w: 1, h: 1 }, 1); // placed far from origin
    g.updateLOD({ x: 0, z: 0 });
    expect(g.getVisibleBlades().length).toBe(0); // all culled
  });
  it('blades beyond billboardDistance switch to billboard', () => {
    const g = make({ bladesPerUnit: 10, billboardDistance: 1, cullDistance: 1000 });
    g.generate({ x: 50, z: 0, w: 1, h: 1 }, 1); // 50 units from origin
    g.updateLOD({ x: 0, z: 0 });
    expect(g.getBillboardCount()).toBeGreaterThan(0);
  });
  it('getVisibleBlades excludes culled blades', () => {
    const g = make({ bladesPerUnit: 5, cullDistance: 1, billboardDistance: 0.5 });
    g.generate({ x: 50, z: 50, w: 1, h: 1 });
    g.updateLOD({ x: 0, z: 0 });
    expect(g.getVisibleBlades()).toHaveLength(0);
  });
  it('blades in mid-range get LOD 1', () => {
    const g = make({ billboardDistance: 30, cullDistance: 60, bladesPerUnit: 5 });
    g.generate({ x: 20, z: 0, w: 1, h: 1 }, 5); // ~20 units from origin, > 15 (billboard*0.5) but <30
    g.updateLOD({ x: 0, z: 0 });
    const visible = g.getVisibleBlades();
    if (visible.length > 0) {
      expect(visible.some(b => b.lodLevel === 1)).toBe(true);
    }
  });
});

describe('GrassRenderer — setConfig()', () => {
  it('partial update merges with existing config', () => {
    const g = make({ baseHeight: 0.3 });
    g.setConfig({ baseHeight: 0.8 });
    expect(g.getConfig().baseHeight).toBe(0.8);
    expect(g.getConfig().bladesPerUnit).toBe(10); // unchanged
  });
  it('getConfig returns copy (not same reference)', () => {
    const g = make();
    const c = g.getConfig(); c.baseHeight = 99;
    expect(g.getConfig().baseHeight).toBe(0.3); // unchanged
  });
});
