import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectorLight } from '../ProjectorLight';

const baseConfig = {
  position: { x: 0, y: 5, z: 0 },
  direction: { x: 0, y: -1, z: 0 },
  cookieTextureId: 'cookie_grid',
  fov: 60,
  aspectRatio: 1,
  nearClip: 0.1,
  farClip: 50,
  intensity: 2,
  color: { r: 1, g: 1, b: 1 },
  falloff: 'linear' as const,
  enabled: true,
};

describe('ProjectorLight', () => {
  let pl: ProjectorLight;

  beforeEach(() => {
    pl = new ProjectorLight();
  });

  // CRUD
  it('create adds projector', () => {
    const p = pl.create(baseConfig);
    expect(p.id).toBeTruthy();
    expect(pl.getCount()).toBe(1);
  });

  it('create uses provided id', () => {
    const p = pl.create({ ...baseConfig, id: 'proj_a' });
    expect(p.id).toBe('proj_a');
  });

  it('remove deletes projector', () => {
    const p = pl.create(baseConfig);
    expect(pl.remove(p.id)).toBe(true);
    expect(pl.getCount()).toBe(0);
  });

  it('get retrieves projector', () => {
    const p = pl.create(baseConfig);
    expect(pl.get(p.id)).toBeDefined();
    expect(pl.get('nope')).toBeUndefined();
  });

  // Property setters
  it('setPosition updates position', () => {
    const p = pl.create(baseConfig);
    pl.setPosition(p.id, 5, 10, 15);
    expect(pl.get(p.id)!.position).toEqual({ x: 5, y: 10, z: 15 });
  });

  it('setDirection updates direction', () => {
    const p = pl.create(baseConfig);
    pl.setDirection(p.id, 1, 0, 0);
    expect(pl.get(p.id)!.direction).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('setIntensity clamps to >= 0', () => {
    const p = pl.create(baseConfig);
    pl.setIntensity(p.id, -5);
    expect(pl.get(p.id)!.intensity).toBe(0);
  });

  it('setColor and setEnabled', () => {
    const p = pl.create(baseConfig);
    pl.setColor(p.id, 1, 0, 0);
    pl.setEnabled(p.id, false);
    expect(pl.get(p.id)!.color).toEqual({ r: 1, g: 0, b: 0 });
    expect(pl.get(p.id)!.enabled).toBe(false);
  });

  // Frustum
  it('getFrustumPlanes returns planes', () => {
    const p = pl.create(baseConfig);
    const planes = pl.getFrustumPlanes(p.id);
    expect(planes).not.toBeNull();
    expect(planes!.near).toBe(0.1);
    expect(planes!.far).toBe(50);
  });

  it('getFrustumPlanes returns null for unknown', () => {
    expect(pl.getFrustumPlanes('nope')).toBeNull();
  });

  it('isPointInFrustum returns true for point in cone', () => {
    const p = pl.create(baseConfig);
    // Point directly below at short distance
    expect(pl.isPointInFrustum(p.id, { x: 0, y: 4, z: 0 })).toBe(true);
  });

  it('isPointInFrustum returns false for disabled', () => {
    const p = pl.create({ ...baseConfig, enabled: false });
    expect(pl.isPointInFrustum(p.id, { x: 0, y: 4, z: 0 })).toBe(false);
  });

  it('isPointInFrustum returns false behind projector', () => {
    const p = pl.create(baseConfig);
    expect(pl.isPointInFrustum(p.id, { x: 0, y: 10, z: 0 })).toBe(false);
  });

  // Attenuation
  it('computeAttenuation none returns intensity', () => {
    const p = pl.create({ ...baseConfig, falloff: 'none' });
    expect(pl.computeAttenuation(p.id, 25)).toBe(2);
  });

  it('computeAttenuation linear decreases with distance', () => {
    const p = pl.create(baseConfig);
    const near = pl.computeAttenuation(p.id, 1);
    const far = pl.computeAttenuation(p.id, 40);
    expect(near).toBeGreaterThan(far);
  });

  it('computeAttenuation quadratic decreases with distance', () => {
    const p = pl.create({ ...baseConfig, falloff: 'quadratic' });
    const near = pl.computeAttenuation(p.id, 1);
    const far = pl.computeAttenuation(p.id, 40);
    expect(near).toBeGreaterThan(far);
  });

  it('computeAttenuation returns 0 for unknown', () => {
    expect(pl.computeAttenuation('nope', 5)).toBe(0);
  });

  // Active
  it('getActive returns only enabled', () => {
    pl.create(baseConfig);
    pl.create({ ...baseConfig, enabled: false });
    expect(pl.getActive().length).toBe(1);
  });
});
