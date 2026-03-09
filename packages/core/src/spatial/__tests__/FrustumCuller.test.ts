import { describe, it, expect, beforeEach } from 'vitest';
import { FrustumCuller } from '../FrustumCuller';

describe('FrustumCuller', () => {
  let culler: FrustumCuller;

  beforeEach(() => {
    culler = new FrustumCuller();
    // Set a simple box frustum: everything inside [-10,10]^3 is visible
    culler.setPlanes([
      { a: 1, b: 0, c: 0, d: 10 }, // right
      { a: -1, b: 0, c: 0, d: 10 }, // left
      { a: 0, b: 1, c: 0, d: 10 }, // top
      { a: 0, b: -1, c: 0, d: 10 }, // bottom
      { a: 0, b: 0, c: 1, d: 10 }, // far
      { a: 0, b: 0, c: -1, d: 10 }, // near
    ]);
  });

  it('setPlanes and getPlaneCount', () => {
    expect(culler.getPlaneCount()).toBe(6);
  });

  it('testSphere inside returns inside', () => {
    expect(culler.testSphere(0, 0, 0, 1)).toBe('inside');
  });

  it('testSphere outside returns outside', () => {
    expect(culler.testSphere(50, 0, 0, 1)).toBe('outside');
  });

  it('testAABB inside returns inside', () => {
    expect(culler.testAABB(0, 0, 0, 1, 1, 1)).toBe('inside');
  });

  it('testAABB outside returns outside', () => {
    expect(culler.testAABB(50, 50, 50, 1, 1, 1)).toBe('outside');
  });

  it('addVolume / removeVolume / getVolumeCount', () => {
    culler.addVolume({ id: 'a', type: 'sphere', centerX: 0, centerY: 0, centerZ: 0, radius: 1 });
    expect(culler.getVolumeCount()).toBe(1);
    culler.removeVolume('a');
    expect(culler.getVolumeCount()).toBe(0);
  });

  it('cullAll returns visible sphere volumes', () => {
    culler.addVolume({ id: 'in', type: 'sphere', centerX: 0, centerY: 0, centerZ: 0, radius: 1 });
    culler.addVolume({
      id: 'out',
      type: 'sphere',
      centerX: 50,
      centerY: 50,
      centerZ: 50,
      radius: 1,
    });
    const visible = culler.cullAll();
    expect(visible).toContain('in');
    expect(visible).not.toContain('out');
  });

  it('cullAll returns visible aabb volumes', () => {
    culler.addVolume({
      id: 'box',
      type: 'aabb',
      centerX: 0,
      centerY: 0,
      centerZ: 0,
      halfX: 2,
      halfY: 2,
      halfZ: 2,
    });
    const visible = culler.cullAll();
    expect(visible).toContain('box');
  });

  it('isVisible after cullAll', () => {
    culler.addVolume({ id: 'v1', type: 'sphere', centerX: 0, centerY: 0, centerZ: 0, radius: 1 });
    culler.cullAll();
    expect(culler.isVisible('v1')).toBe(true);
  });

  it('getVisibleCount tracks visible', () => {
    culler.addVolume({ id: 'a', type: 'sphere', centerX: 0, centerY: 0, centerZ: 0, radius: 1 });
    culler.addVolume({ id: 'b', type: 'sphere', centerX: 50, centerY: 0, centerZ: 0, radius: 1 });
    culler.cullAll();
    expect(culler.getVisibleCount()).toBe(1);
  });

  it('setFrustumFromPerspective sets planes', () => {
    culler.setFrustumFromPerspective(60, 1.77, 0.1, 100, 0, 0, 0, 0, 0, -1);
    expect(culler.getPlaneCount()).toBeGreaterThanOrEqual(2);
  });
});
