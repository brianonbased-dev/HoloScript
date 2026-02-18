import { describe, it, expect, beforeEach } from 'vitest';
import { CameraEffects } from '../CameraEffects';

describe('CameraEffects', () => {
  let fx: CameraEffects;

  beforeEach(() => {
    fx = new CameraEffects();
  });

  // ---- Shake ----

  it('shake creates an active effect', () => {
    fx.shake(1, 5);
    expect(fx.getActiveEffectCount()).toBe(1);
  });

  it('shake produces offset after update', () => {
    fx.shake(1, 10);
    fx.update(0.1);
    const offset = fx.getShakeOffset();
    // Offset should be non-zero (random)
    expect(offset.x !== 0 || offset.y !== 0).toBe(true);
  });

  it('shake decays and expires', () => {
    fx.shake(0.5, 5, 20, 1);
    // Run past duration
    fx.update(1);
    expect(fx.getActiveEffectCount()).toBe(0);
  });

  // ---- Zoom Pulse ----

  it('zoomPulse modifies zoom multiplier', () => {
    fx.zoomPulse(1, 2);
    fx.update(0.25); // quarter through
    expect(fx.getZoomMultiplier()).toBeGreaterThan(1);
  });

  it('zoomPulse easeBack returns to 1', () => {
    fx.zoomPulse(1, 1.5, true);
    fx.update(0.99);
    // Near end of ease-back, zoom should be close to 1
    expect(fx.getZoomMultiplier()).toBeCloseTo(1, 0);
  });

  // ---- Flash ----

  it('flash sets alpha and color', () => {
    fx.flash(0.5, { r: 1, g: 0, b: 0 }, 1);
    fx.update(0.1);
    expect(fx.getFlashAlpha()).toBeGreaterThan(0);
    expect(fx.getFlashColor().r).toBe(1);
  });

  // ---- Letterbox ----

  it('letterbox increases amount', () => {
    fx.letterbox(2, 2.35);
    fx.update(0.5);
    expect(fx.getLetterboxAmount()).toBeGreaterThan(0);
  });

  // ---- Vignette ----

  it('vignette sets intensity', () => {
    fx.vignette(1, 0.8);
    fx.update(0.5);
    expect(fx.getVignetteIntensity()).toBeGreaterThan(0);
  });

  // ---- Fade ----

  it('fade out increases alpha', () => {
    fx.fade(1, false);
    fx.update(0.5);
    expect(fx.getFadeAlpha()).toBeGreaterThan(0);
  });

  it('fade in decreases alpha', () => {
    fx.fade(1, true);
    fx.update(0.5);
    expect(fx.getFadeAlpha()).toBeLessThan(1);
  });

  // ---- Cancel ----

  it('cancelEffect removes specific effect', () => {
    const id = fx.shake(5, 10);
    expect(fx.cancelEffect(id)).toBe(true);
    expect(fx.getActiveEffectCount()).toBe(0);
  });

  it('cancelEffect returns false for unknown ID', () => {
    expect(fx.cancelEffect('nope')).toBe(false);
  });

  it('cancelAll removes everything', () => {
    fx.shake(1, 5);
    fx.flash(1);
    fx.vignette(1);
    fx.cancelAll();
    expect(fx.getActiveEffectCount()).toBe(0);
  });

  // ---- Multiple Effects ----

  it('multiple effects stack', () => {
    fx.shake(1, 5);
    fx.zoomPulse(1, 1.5);
    fx.vignette(1, 0.6);
    expect(fx.getActiveEffectCount()).toBe(3);
    fx.update(0.1);
    expect(fx.getVignetteIntensity()).toBeGreaterThan(0);
    expect(fx.getZoomMultiplier()).toBeGreaterThan(1);
  });
});
