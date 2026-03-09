import { describe, it, expect, beforeEach } from 'vitest';
import { CameraShake } from '../CameraShake';

describe('CameraShake', () => {
  let shake: CameraShake;

  beforeEach(() => {
    shake = new CameraShake();
  });

  // ---------------------------------------------------------------------------
  // Layer Management
  // ---------------------------------------------------------------------------

  it('addLayer creates a layer with defaults', () => {
    shake.addLayer('explosion');
    expect(shake.getTrauma('explosion')).toBe(0);
  });

  it('addLayer with config overrides', () => {
    shake.addLayer('hit', { amplitude: 20, decay: 2 });
    expect(shake.getTrauma('hit')).toBe(0);
  });

  it('removeLayer deletes the layer', () => {
    shake.addLayer('temp');
    shake.addTrauma('temp', 0.5);
    shake.removeLayer('temp');
    expect(shake.getTrauma('temp')).toBe(0); // Returns 0 for missing
  });

  // ---------------------------------------------------------------------------
  // Trauma
  // ---------------------------------------------------------------------------

  it('addTrauma increases trauma', () => {
    shake.addLayer('hit');
    shake.addTrauma('hit', 0.3);
    expect(shake.getTrauma('hit')).toBeCloseTo(0.3);
  });

  it('addTrauma clamps to 1', () => {
    shake.addLayer('hit');
    shake.addTrauma('hit', 0.8);
    shake.addTrauma('hit', 0.5);
    expect(shake.getTrauma('hit')).toBe(1);
  });

  it('setTrauma sets exact value', () => {
    shake.addLayer('hit');
    shake.setTrauma('hit', 0.7);
    expect(shake.getTrauma('hit')).toBeCloseTo(0.7);
  });

  it('setTrauma clamps 0-1', () => {
    shake.addLayer('hit');
    shake.setTrauma('hit', -0.5);
    expect(shake.getTrauma('hit')).toBe(0);
    shake.setTrauma('hit', 2);
    expect(shake.getTrauma('hit')).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // isShaking
  // ---------------------------------------------------------------------------

  it('isShaking returns false when no trauma', () => {
    shake.addLayer('idle');
    expect(shake.isShaking()).toBe(false);
  });

  it('isShaking returns true when trauma > 0', () => {
    shake.addLayer('hit');
    shake.addTrauma('hit', 0.5);
    expect(shake.isShaking()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  it('update returns ShakeOutput with offsets', () => {
    shake.addLayer('hit');
    shake.addTrauma('hit', 0.8);
    const output = shake.update(1 / 60);
    expect(output).toHaveProperty('offsetX');
    expect(output).toHaveProperty('offsetY');
    expect(output).toHaveProperty('rotation');
  });

  it('update with trauma produces non-zero offsets', () => {
    shake.addLayer('hit', { amplitude: 20 });
    shake.addTrauma('hit', 1);
    const output = shake.update(1 / 60);
    const magnitude = Math.abs(output.offsetX) + Math.abs(output.offsetY);
    expect(magnitude).toBeGreaterThan(0);
  });

  it('update decays trauma over time', () => {
    shake.addLayer('hit', { decay: 5 });
    shake.addTrauma('hit', 1);
    shake.update(0.5); // 0.5s with decay=5 → should reduce by 2.5
    expect(shake.getTrauma('hit')).toBeLessThan(1);
  });

  it('update with zero trauma returns zero offsets', () => {
    shake.addLayer('idle');
    const output = shake.update(1 / 60);
    expect(output.offsetX).toBe(0);
    expect(output.offsetY).toBe(0);
    expect(output.rotation).toBe(0);
  });

  it('multiple layers combine offsets', () => {
    shake.addLayer('a', { amplitude: 10 });
    shake.addLayer('b', { amplitude: 10 });
    shake.addTrauma('a', 1);
    shake.addTrauma('b', 1);
    const output = shake.update(1 / 60);
    const mag = Math.abs(output.offsetX) + Math.abs(output.offsetY);
    expect(mag).toBeGreaterThan(0);
  });
});
