/**
 * CameraShake — Production Test Suite
 *
 * Covers: addLayer, removeLayer, addTrauma, setTrauma, update decay,
 * multi-layer compositing, isShaking, trauma clamping.
 */
import { describe, it, expect } from 'vitest';
import { CameraShake } from '../CameraShake';

describe('CameraShake — Production', () => {
  // ─── Layer Management ─────────────────────────────────────────────
  it('addLayer creates layer with defaults', () => {
    const cs = new CameraShake();
    cs.addLayer('main');
    expect(cs.getTrauma('main')).toBe(0);
    expect(cs.isShaking()).toBe(false);
  });

  it('removeLayer removes layer', () => {
    const cs = new CameraShake();
    cs.addLayer('main');
    cs.removeLayer('main');
    expect(cs.getTrauma('main')).toBe(0); // returns 0 for missing
  });

  // ─── Trauma ───────────────────────────────────────────────────────
  it('addTrauma increases trauma clamped to 1', () => {
    const cs = new CameraShake();
    cs.addLayer('main');
    cs.addTrauma('main', 0.5);
    expect(cs.getTrauma('main')).toBe(0.5);
    cs.addTrauma('main', 0.8);
    expect(cs.getTrauma('main')).toBe(1); // clamped
  });

  it('setTrauma sets exact value', () => {
    const cs = new CameraShake();
    cs.addLayer('main');
    cs.setTrauma('main', 0.7);
    expect(cs.getTrauma('main')).toBe(0.7);
  });

  // ─── Shake Output ─────────────────────────────────────────────────
  it('update produces offsets when trauma > 0', () => {
    const cs = new CameraShake();
    cs.addLayer('main', { amplitude: 10 });
    cs.setTrauma('main', 1);
    const out = cs.update(0.016);
    expect(out.offsetX).not.toBe(0);
    expect(out.offsetY).not.toBe(0);
  });

  it('zero trauma produces zero output', () => {
    const cs = new CameraShake();
    cs.addLayer('main');
    const out = cs.update(0.016);
    expect(out.offsetX).toBe(0);
    expect(out.offsetY).toBe(0);
    expect(out.rotation).toBe(0);
  });

  // ─── Decay ────────────────────────────────────────────────────────
  it('trauma decays over time', () => {
    const cs = new CameraShake();
    cs.addLayer('main', { decay: 2 }); // 2 per second
    cs.setTrauma('main', 1);
    cs.update(0.5); // 1 - 2*0.5 = 0
    expect(cs.getTrauma('main')).toBe(0);
  });

  it('decay clamps to zero', () => {
    const cs = new CameraShake();
    cs.addLayer('main', { decay: 100 });
    cs.setTrauma('main', 0.1);
    cs.update(1);
    expect(cs.getTrauma('main')).toBe(0);
  });

  // ─── Multi-Layer ──────────────────────────────────────────────────
  it('multiple layers composite offsets', () => {
    const cs = new CameraShake();
    cs.addLayer('impact', { amplitude: 5 });
    cs.addLayer('ambient', { amplitude: 2 });
    cs.setTrauma('impact', 1);
    cs.setTrauma('ambient', 0.5);
    const out = cs.update(0.016);
    // Both contribute — total should be nonzero
    expect(Math.abs(out.offsetX) + Math.abs(out.offsetY)).toBeGreaterThan(0);
  });

  // ─── isShaking ────────────────────────────────────────────────────
  it('isShaking returns true when any layer has trauma', () => {
    const cs = new CameraShake();
    cs.addLayer('a');
    cs.addLayer('b');
    cs.setTrauma('b', 0.1);
    expect(cs.isShaking()).toBe(true);
  });
});
