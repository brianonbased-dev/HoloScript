import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectorLight } from '@holoscript/engine/rendering';

// =============================================================================
// C286 — Projector Light
// =============================================================================

function defaultConfig() {
  return {
    position: [0, 10, 0],
    direction: [0, -1, 0],
    cookieTextureId: 'cookie_01',
    fov: 60,
    aspectRatio: 1.0,
    nearClip: 1,
    farClip: 50,
    intensity: 2,
    color: { r: 1, g: 1, b: 1 },
    falloff: 'linear' as const,
    enabled: true,
  };
}

describe('ProjectorLight', () => {
  let pl: ProjectorLight;
  beforeEach(() => {
    pl = new ProjectorLight();
  });

  it('create and get projector', () => {
    const p = pl.create(defaultConfig());
    expect(p.id).toBeDefined();
    expect(pl.get(p.id)).toBeDefined();
    expect(pl.getCount()).toBe(1);
  });

  it('remove projector', () => {
    const p = pl.create(defaultConfig());
    expect(pl.remove(p.id)).toBe(true);
    expect(pl.getCount()).toBe(0);
  });

  it('setPosition updates position', () => {
    const p = pl.create(defaultConfig());
    pl.setPosition(p.id, 5, 20, 3);
    expect(pl.get(p.id)!.position).toEqual([5, 20, 3]);
  });

  it('setIntensity clamps to non-negative', () => {
    const p = pl.create(defaultConfig());
    pl.setIntensity(p.id, -5);
    expect(pl.get(p.id)!.intensity).toBe(0);
  });

  it('setEnabled toggles enabled state', () => {
    const p = pl.create(defaultConfig());
    pl.setEnabled(p.id, false);
    expect(pl.get(p.id)!.enabled).toBe(false);
  });

  it('getFrustumPlanes returns clip and fov info', () => {
    const p = pl.create(defaultConfig());
    const frustum = pl.getFrustumPlanes(p.id);
    expect(frustum).toEqual({ near: 1, far: 50, fov: 60, aspect: 1 });
  });

  it('isPointInFrustum returns true for point in front within range', () => {
    const p = pl.create(defaultConfig());
    // Direction is (0,-1,0), point directly below at y=-5 → depth=15, within [1,50]
    expect(pl.isPointInFrustum(p.id, [0, -5, 0])).toBe(true);
  });

  it('isPointInFrustum returns false for point behind projector', () => {
    const p = pl.create(defaultConfig());
    // Point above at y=20 → depth would be negative
    expect(pl.isPointInFrustum(p.id, [0, 20, 0])).toBe(false);
  });

  it('isPointInFrustum returns false when disabled', () => {
    const p = pl.create(defaultConfig());
    pl.setEnabled(p.id, false);
    expect(pl.isPointInFrustum(p.id, [0, -5, 0])).toBe(false);
  });

  it('computeAttenuation with linear falloff', () => {
    const p = pl.create(defaultConfig());
    const atNear = pl.computeAttenuation(p.id, 1); // distance = nearClip
    const atMid = pl.computeAttenuation(p.id, 25);
    expect(atNear).toBeCloseTo(2); // intensity * (1 - 0/range) = 2
    expect(atMid).toBeLessThan(atNear);
    expect(atMid).toBeGreaterThan(0);
  });

  it('computeAttenuation with none falloff is constant', () => {
    const cfg = { ...defaultConfig(), falloff: 'none' as const };
    const p = pl.create(cfg);
    expect(pl.computeAttenuation(p.id, 10)).toBe(2);
    expect(pl.computeAttenuation(p.id, 40)).toBe(2);
  });

  it('getActive returns only enabled projectors', () => {
    pl.create(defaultConfig());
    pl.create({ ...defaultConfig(), enabled: false });
    expect(pl.getActive()).toHaveLength(1);
  });
});
