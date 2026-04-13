import { describe, it, expect } from 'vitest';
import { CameraController } from '@holoscript/engine/camera';
import { CameraEffects } from '@holoscript/engine/camera';
import { CinematicTrack } from '@holoscript/engine/camera';

describe('Cycle 123: Camera System', () => {
  // -------------------------------------------------------------------------
  // CameraController
  // -------------------------------------------------------------------------

  it('should follow target with smoothing', () => {
    const cam = new CameraController({
      mode: 'follow',
      smoothing: 1,
      followOffset: { x: 0, y: 0, z: 0 },
    });
    cam.setTarget(10, 0, 0);
    cam.update(1 / 60);

    const state = cam.getState();
    // With smoothing=1, should snap to target
    expect(state.position.x).toBeCloseTo(10, 0);
  });

  it('should orbit around target', () => {
    const cam = new CameraController({ mode: 'orbit', orbitDistance: 10 });
    cam.setTarget(0, 0, 0);
    cam.rotateOrbit(Math.PI / 4, 0); // × orbitSpeed 2 → π/2 actual
    cam.update(1 / 60);

    const state = cam.getState();
    // After 90° orbit, x should be ~10 (sin(π/2)*cos(pitch)*10)
    expect(Math.abs(state.position.x)).toBeGreaterThan(5);
  });

  it('should clamp to bounds', () => {
    const cam = new CameraController({
      mode: 'free',
      bounds: { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } },
    });
    cam.moveCamera(100, 100, 100);
    cam.update(1 / 60);

    const state = cam.getState();
    expect(state.position.x).toBeLessThanOrEqual(10);
    expect(state.position.y).toBeLessThanOrEqual(10);
  });

  // -------------------------------------------------------------------------
  // CameraEffects
  // -------------------------------------------------------------------------

  it('should apply screen shake', () => {
    const effects = new CameraEffects();
    effects.shake(1, 10, 20, 0.5);
    effects.update(0.1);

    const offset = effects.getShakeOffset();
    expect(Math.abs(offset.x) + Math.abs(offset.y)).toBeGreaterThan(0);
    expect(effects.getActiveEffectCount()).toBe(1);
  });

  it('should fade effects over time', () => {
    const effects = new CameraEffects();
    effects.flash(0.5, { r: 1, g: 0, b: 0 }, 1);
    effects.update(0.25);
    const midAlpha = effects.getFlashAlpha();

    effects.update(0.3);
    // After duration, effect should be gone
    expect(effects.getActiveEffectCount()).toBe(0);
    expect(midAlpha).toBeGreaterThan(0);
  });

  it('should support zoom pulse', () => {
    const effects = new CameraEffects();
    effects.zoomPulse(1, 1.5, true);
    effects.update(0.5); // At peak
    expect(effects.getZoomMultiplier()).toBeGreaterThan(1);
  });

  // -------------------------------------------------------------------------
  // CinematicTrack
  // -------------------------------------------------------------------------

  it('should interpolate between keyframes', () => {
    const track = new CinematicTrack();
    track.addKeyframe({ time: 0, position: [0, 0, 0], easing: 'linear' });
    track.addKeyframe({ time: 2, position: [10, 0, 0], easing: 'linear' });

    const state = track.evaluate(1);
    expect(state.position.x).toBeCloseTo(5);
  });

  it('should fire cues during playback', () => {
    const track = new CinematicTrack();
    track.addKeyframe({ time: 0, position: [0, 0, 0], easing: 'linear' });
    track.addKeyframe({ time: 3, position: [10, 0, 0], easing: 'linear' });
    track.addCue(1, 'explosion', { size: 'big' });

    const fired: string[] = [];
    track.onCue((event) => fired.push(event));

    track.play();
    track.update(1.5);
    expect(fired).toContain('explosion');
  });

  it('should apply easing curves', () => {
    const track = new CinematicTrack();
    track.addKeyframe({ time: 0, position: [0, 0, 0], easing: 'linear' });
    track.addKeyframe({ time: 1, position: [10, 0, 0], easing: 'easeIn' });

    const state = track.evaluate(0.5);
    // easeIn at t=0.5 → t²=0.25 → x≈2.5
    expect(state.position.x).toBeCloseTo(2.5, 0);
  });
});
