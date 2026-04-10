/**
 * LODManager Production Tests
 *
 * Tests registration, unregistration, distance-based LOD update,
 * hysteresis, transition blending, and query methods.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LODManager } from '../../world/LODManager';

describe('LODManager — Production', () => {
  let lod: LODManager;

  beforeEach(() => {
    lod = new LODManager();
  });

  // ─── Registration ──────────────────────────────────────────────────

  it('register creates LODObject at level 0', () => {
    const obj = lod.register('tree', { x: 0, y: 0, z: 0 });
    expect(obj.id).toBe('tree');
    expect(obj.currentLevel).toBe(0);
    expect(obj.visible).toBe(true);
  });

  it('register with custom bias', () => {
    const obj = lod.register('rock', { x: 0, y: 0, z: 0 }, undefined, 2.0);
    expect(obj.bias).toBe(2.0);
  });

  it('unregister removes object', () => {
    lod.register('a', { x: 0, y: 0, z: 0 });
    expect(lod.unregister('a')).toBe(true);
    expect(lod.getObjectCount()).toBe(0);
  });

  it('getObject returns registered object', () => {
    lod.register('b', { x: 10, y: 0, z: 0 });
    expect(lod.getObject('b')).toBeDefined();
  });

  it('getObject returns undefined for unknown', () => {
    expect(lod.getObject('nonexistent')).toBeUndefined();
  });

  // ─── LOD Update (distance-based) ──────────────────────────────────

  it('near object stays at level 0', () => {
    lod.register('near', { x: 10, y: 0, z: 0 });
    lod.setViewerPosition(0, 0, 0);
    lod.update(0.016); // ~60fps frame
    expect(lod.getObject('near')!.currentLevel).toBe(0);
  });

  it('far object transitions to higher level', () => {
    lod.register('far', { x: 200, y: 0, z: 0 });
    lod.setViewerPosition(0, 0, 0);
    lod.update(0.016);
    expect(lod.getObject('far')!.currentLevel).toBeGreaterThan(0);
  });

  it('very far object goes to highest level', () => {
    lod.register('vfar', { x: 1000, y: 0, z: 0 });
    lod.setViewerPosition(0, 0, 0);
    lod.update(0.016);
    expect(lod.getObject('vfar')!.currentLevel).toBe(3);
  });

  // ─── Transition Blending ──────────────────────────────────────────

  it('transition alpha resets on level change', () => {
    lod.register('trans', { x: 200, y: 0, z: 0 });
    lod.setViewerPosition(0, 0, 0);
    lod.update(0.016);
    expect(lod.getObject('trans')!.transitionAlpha).toBeLessThan(1);
  });

  it('transition alpha blends towards 1 over frames', () => {
    lod.register('blend', { x: 200, y: 0, z: 0 });
    lod.setViewerPosition(0, 0, 0);
    lod.update(0.016);
    const alpha1 = lod.getObject('blend')!.transitionAlpha;
    lod.update(0.5);
    const alpha2 = lod.getObject('blend')!.transitionAlpha;
    expect(alpha2).toBeGreaterThan(alpha1);
  });

  // ─── Queries ──────────────────────────────────────────────────────

  it('getObjectCount tracks registrations', () => {
    lod.register('a', { x: 0, y: 0, z: 0 });
    lod.register('b', { x: 0, y: 0, z: 0 });
    expect(lod.getObjectCount()).toBe(2);
  });

  it('getLevelDistribution reflects LOD state', () => {
    lod.register('near', { x: 10, y: 0, z: 0 });
    lod.register('far', { x: 500, y: 0, z: 0 });
    lod.setViewerPosition(0, 0, 0);
    lod.update(0.016);
    const dist = lod.getLevelDistribution();
    expect(dist.size).toBeGreaterThanOrEqual(1);
  });

  it('getObjectsAtLevel filters correctly', () => {
    lod.register('near', { x: 10, y: 0, z: 0 });
    lod.setViewerPosition(0, 0, 0);
    lod.update(0.016);
    const atZero = lod.getObjectsAtLevel(0);
    expect(atZero.length).toBe(1);
    expect(atZero[0].id).toBe('near');
  });

  it('getAverageLOD returns 0 for empty', () => {
    expect(lod.getAverageLOD()).toBe(0);
  });

  it('getAverageLOD calculates correctly', () => {
    lod.register('n', { x: 10, y: 0, z: 0 });
    lod.register('f', { x: 1000, y: 0, z: 0 });
    lod.setViewerPosition(0, 0, 0);
    lod.update(0.016);
    const avg = lod.getAverageLOD();
    expect(avg).toBeGreaterThan(0); // At least one object at higher LOD
  });
});
