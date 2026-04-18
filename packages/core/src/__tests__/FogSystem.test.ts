import { describe, it, expect, beforeEach } from 'vitest';
import { FogSystem } from '@holoscript/engine/rendering';

// =============================================================================
// C243 — Fog System
// =============================================================================

describe('FogSystem', () => {
  it('default config is exponential + enabled', () => {
    const fog = new FogSystem();
    const c = fog.getConfig();
    expect(c.mode).toBe('exponential');
    expect(c.enabled).toBe(true);
  });

  it('setEnabled toggles fog', () => {
    const fog = new FogSystem();
    fog.setEnabled(false);
    expect(fog.isEnabled()).toBe(false);
    expect(fog.computeFogFactor(50)).toBe(0);
  });

  it('linear fog increases with distance', () => {
    const fog = new FogSystem({ mode: 'linear', nearDistance: 10, farDistance: 100 });
    const close = fog.computeFogFactor(20);
    const far = fog.computeFogFactor(80);
    expect(far).toBeGreaterThan(close);
  });

  it('linear fog is 0 at near, 1 at far', () => {
    const fog = new FogSystem({ mode: 'linear', nearDistance: 10, farDistance: 100 });
    expect(fog.computeFogFactor(10)).toBeCloseTo(0, 1);
    expect(fog.computeFogFactor(100)).toBeCloseTo(1, 1);
  });

  it('exponential fog increases with distance', () => {
    const fog = new FogSystem({ mode: 'exponential', density: 0.05 });
    const close = fog.computeFogFactor(5);
    const far = fog.computeFogFactor(50);
    expect(far).toBeGreaterThan(close);
  });

  it('exponential2 fog increases with distance', () => {
    const fog = new FogSystem({ mode: 'exponential2', density: 0.05 });
    const close = fog.computeFogFactor(5);
    const far = fog.computeFogFactor(50);
    expect(far).toBeGreaterThan(close);
  });

  it('fog factor is clamped 0-1', () => {
    const fog = new FogSystem({ mode: 'exponential', density: 10 });
    expect(fog.computeFogFactor(1000)).toBeLessThanOrEqual(1);
    expect(fog.computeFogFactor(0)).toBeGreaterThanOrEqual(0);
  });

  it('height fog reduces factor at high altitude', () => {
    const fog = new FogSystem({
      mode: 'exponential',
      density: 0.1,
      heightFog: true,
      heightStart: 0,
      heightEnd: 50,
    });
    const ground = fog.computeFogFactor(30, 0);
    const sky = fog.computeFogFactor(30, 50);
    expect(ground).toBeGreaterThan(sky);
  });

  it('blendWithFog mixes scene and fog color', () => {
    const fog = new FogSystem({ mode: 'exponential', density: 10, color: [1, 1, 1] });
    const result = fog.blendWithFog([0, 0, 0], 100);
    // Very dense fog at distance 100 → should be close to fog color [1,1,1]
    expect(result[0]).toBeGreaterThan(0.9);
    expect(result[1]).toBeGreaterThan(0.9);
    expect(result[2]).toBeGreaterThan(0.9);
  });

  it('blendWithFog preserves scene color when disabled', () => {
    const fog = new FogSystem({ enabled: false });
    const result = fog.blendWithFog([0.5, 0.3, 0.1], 100);
    expect(result[0]).toBeCloseTo(0.5);
    expect(result[1]).toBeCloseTo(0.3);
    expect(result[2]).toBeCloseTo(0.1);
  });

  it('setConfig updates mode', () => {
    const fog = new FogSystem();
    fog.setConfig({ mode: 'linear' });
    expect(fog.getConfig().mode).toBe('linear');
  });

  it('setAnimation and update modulate density', () => {
    const fog = new FogSystem({ density: 0.05 });
    fog.setAnimation(1.0);
    const before = fog.getConfig().density;
    fog.update(1.0);
    // After update with speed > 0 the density oscillates via sin
    const after = fog.getConfig().density;
    expect(after).not.toBe(before);
  });
});
