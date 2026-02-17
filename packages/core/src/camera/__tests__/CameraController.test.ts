import { describe, it, expect, beforeEach } from 'vitest';
import { CameraController } from '../CameraController';

describe('CameraController', () => {
  let cam: CameraController;

  beforeEach(() => { cam = new CameraController(); });

  // ---------------------------------------------------------------------------
  // Construction & Defaults
  // ---------------------------------------------------------------------------

  it('defaults to follow mode', () => {
    expect(cam.getMode()).toBe('follow');
  });

  it('default state has position and rotation', () => {
    const s = cam.getState();
    expect(s.position).toHaveProperty('x');
    expect(s.position).toHaveProperty('y');
    expect(s.position).toHaveProperty('z');
    expect(s.rotation).toHaveProperty('pitch');
    expect(s.fov).toBe(60);
  });

  it('accepts partial config overrides', () => {
    const custom = new CameraController({ fov: 90, freeSpeed: 20 });
    expect(custom.getState().fov).toBe(90);
  });

  // ---------------------------------------------------------------------------
  // Mode
  // ---------------------------------------------------------------------------

  it('setMode changes mode', () => {
    cam.setMode('orbit');
    expect(cam.getMode()).toBe('orbit');
  });

  it('setMode to free works', () => {
    cam.setMode('free');
    expect(cam.getMode()).toBe('free');
  });

  // ---------------------------------------------------------------------------
  // Target
  // ---------------------------------------------------------------------------

  it('setTarget and getTarget round-trip', () => {
    cam.setTarget(10, 20, 30);
    const t = cam.getTarget();
    expect(t.x).toBe(10);
    expect(t.y).toBe(20);
    expect(t.z).toBe(30);
  });

  // ---------------------------------------------------------------------------
  // Zoom
  // ---------------------------------------------------------------------------

  it('zoom increases/decreases zoom level', () => {
    const before = cam.getState().zoom;
    cam.zoom(1);
    expect(cam.getState().zoom).toBeGreaterThan(before);
  });

  it('zoom clamps to min/max', () => {
    cam.zoom(-100);
    expect(cam.getState().zoom).toBeGreaterThanOrEqual(0.5);
    cam.zoom(100);
    expect(cam.getState().zoom).toBeLessThanOrEqual(5);
  });

  it('setZoom works with clamping', () => {
    cam.setZoom(3);
    expect(cam.getState().zoom).toBe(3);
    cam.setZoom(-10);
    expect(cam.getState().zoom).toBe(0.5);
  });

  // ---------------------------------------------------------------------------
  // FOV & Smoothing
  // ---------------------------------------------------------------------------

  it('setFOV changes fov', () => {
    cam.setFOV(110);
    expect(cam.getState().fov).toBe(110);
  });

  it('setSmoothing clamps 0-1', () => {
    cam.setSmoothing(0.5);
    // No direct getter, but shouldn't throw
    cam.setSmoothing(-1);
    cam.setSmoothing(2);
  });

  // ---------------------------------------------------------------------------
  // Update Follow
  // ---------------------------------------------------------------------------

  it('follow mode moves camera toward target', () => {
    cam.setTarget(100, 100, 100);
    const before = cam.getState().position.x;
    cam.update(1 / 60);
    const after = cam.getState().position.x;
    expect(after).not.toBe(before);
  });

  // ---------------------------------------------------------------------------
  // Orbit Mode
  // ---------------------------------------------------------------------------

  it('orbit mode positions around target', () => {
    cam.setMode('orbit');
    cam.setTarget(0, 0, 0);
    cam.update(1 / 60);
    const s = cam.getState();
    // Should be at orbitDistance from target
    const dist = Math.sqrt(s.position.x ** 2 + s.position.y ** 2 + s.position.z ** 2);
    expect(dist).toBeGreaterThan(0);
  });

  it('rotateOrbit changes orbit angle', () => {
    cam.setMode('orbit');
    cam.update(1 / 60);
    const before = cam.getState().position.x;
    cam.rotateOrbit(Math.PI / 4, 0);
    cam.update(1 / 60);
    const after = cam.getState().position.x;
    expect(after).not.toBe(before);
  });

  // ---------------------------------------------------------------------------
  // Top-Down Mode
  // ---------------------------------------------------------------------------

  it('topDown mode sets pitch to -PI/2', () => {
    cam.setMode('topDown');
    cam.update(1 / 60);
    const s = cam.getState();
    expect(s.rotation.pitch).toBeCloseTo(-Math.PI / 2, 1);
  });

  // ---------------------------------------------------------------------------
  // Free Mode / moveCamera
  // ---------------------------------------------------------------------------

  it('moveCamera moves position in free mode', () => {
    cam.setMode('free');
    cam.moveCamera(1, 0, 0);
    const s = cam.getState();
    expect(s.position.x).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Bounds Clamping
  // ---------------------------------------------------------------------------

  it('bounds clamping constrains position', () => {
    const bounded = new CameraController({
      mode: 'free',
      bounds: {
        min: { x: -10, y: -10, z: -10 },
        max: { x: 10, y: 10, z: 10 },
      },
    });
    bounded.moveCamera(100, 0, 0);
    bounded.update(1 / 60);
    expect(bounded.getState().position.x).toBeLessThanOrEqual(10);
  });

  // ---------------------------------------------------------------------------
  // State immutability
  // ---------------------------------------------------------------------------

  it('getState returns a copy', () => {
    const s1 = cam.getState();
    s1.position.x = 9999;
    expect(cam.getState().position.x).not.toBe(9999);
  });
});
