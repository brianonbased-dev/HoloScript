import { describe, it, expect, beforeEach } from 'vitest';
import { FogSystem } from '../FogSystem';

describe('FogSystem', () => {
  let fog: FogSystem;

  beforeEach(() => {
    fog = new FogSystem();
  });

  it('default config is exponential', () => {
    expect(fog.getConfig().mode).toBe('exponential');
    expect(fog.isEnabled()).toBe(true);
  });

  it('setEnabled toggles fog', () => {
    fog.setEnabled(false);
    expect(fog.isEnabled()).toBe(false);
  });

  it('computeFogFactor returns 0 when disabled', () => {
    fog.setEnabled(false);
    expect(fog.computeFogFactor(100)).toBe(0);
  });

  // Exponential mode
  it('exponential: more fog at greater distance', () => {
    const near = fog.computeFogFactor(10);
    const far = fog.computeFogFactor(100);
    expect(far).toBeGreaterThan(near);
  });

  it('exponential: factor is clamped [0,1]', () => {
    const f = fog.computeFogFactor(10000);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  });

  // Linear mode
  it('linear: 0 at nearDistance, 1 at farDistance', () => {
    fog.setConfig({ mode: 'linear', nearDistance: 10, farDistance: 100 });
    const atNear = fog.computeFogFactor(10);
    const atFar = fog.computeFogFactor(100);
    expect(atNear).toBeCloseTo(0, 1);
    expect(atFar).toBeCloseTo(1, 1);
  });

  // Exponential2 mode
  it('exponential2: factor increases with distance', () => {
    fog.setConfig({ mode: 'exponential2' });
    const near = fog.computeFogFactor(5);
    const far = fog.computeFogFactor(50);
    expect(far).toBeGreaterThan(near);
  });

  // Height fog
  it('height fog reduces factor at height', () => {
    fog.setConfig({ heightFog: true, heightStart: 0, heightEnd: 50 });
    const ground = fog.computeFogFactor(50, 0);
    const sky = fog.computeFogFactor(50, 50);
    expect(ground).toBeGreaterThan(sky);
  });

  // BlendWithFog
  it('blendWithFog interpolates scene and fog color', () => {
    fog.setConfig({ mode: 'linear', nearDistance: 0, farDistance: 100, color: [1, 1, 1] });
    const result = fog.blendWithFog([0, 0, 0], 50);
    // Somewhere between [0,0,0] and [1,1,1]
    expect(result[0]).toBeGreaterThan(0);
    expect(result[0]).toBeLessThan(1);
  });

  it('blendWithFog returns scene color when no fog', () => {
    fog.setEnabled(false);
    const result = fog.blendWithFog([0.5, 0.3, 0.1], 100);
    expect(result).toEqual([0.5, 0.3, 0.1]);
  });

  // Animation
  it('setAnimation and update change density', () => {
    const before = fog.getConfig().density;
    fog.setAnimation(5);
    fog.update(1);
    // density should have changed (animated)
    const after = fog.getConfig().density;
    expect(after).not.toBe(before);
  });

  // setConfig merges
  it('setConfig merges partial', () => {
    fog.setConfig({ density: 0.1 });
    expect(fog.getConfig().density).toBe(0.1);
    expect(fog.getConfig().mode).toBe('exponential'); // unchanged
  });
});
