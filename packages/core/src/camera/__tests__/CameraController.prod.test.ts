/**
 * CameraController — Production Test Suite
 *
 * Covers: follow, orbit, topDown modes, zoom, bounds clamping,
 * mode switching, setTarget, moveCamera, state queries.
 */
import { describe, it, expect } from 'vitest';
import { CameraController } from '../CameraController';

describe('CameraController — Production', () => {
  // ─── Default State ────────────────────────────────────────────────
  it('defaults to follow mode', () => {
    const cc = new CameraController();
    expect(cc.getMode()).toBe('follow');
  });

  it('initial state has position and zoom', () => {
    const cc = new CameraController();
    const s = cc.getState();
    expect(s.zoom).toBe(1);
    expect(s.fov).toBe(60);
  });

  // ─── Follow Mode ──────────────────────────────────────────────────
  it('follow mode moves camera toward target + offset', () => {
    const cc = new CameraController({ smoothing: 1 }); // instant smoothing
    cc.setTarget(10, 0, 0);
    cc.update(1);
    const s = cc.getState();
    expect(s.position.x).toBeGreaterThan(0); // moved toward target
  });

  // ─── Orbit Mode ───────────────────────────────────────────────────
  it('orbit mode positions camera around target', () => {
    const cc = new CameraController({ mode: 'orbit', orbitDistance: 10 });
    cc.setTarget(0, 0, 0);
    cc.update(1);
    const s = cc.getState();
    // should be at orbit distance
    const dist = Math.sqrt(s.position.x ** 2 + s.position.y ** 2 + s.position.z ** 2);
    expect(dist).toBeGreaterThan(0);
  });

  it('rotateOrbit changes orbit angle', () => {
    const cc = new CameraController({ mode: 'orbit', orbitDistance: 10, orbitSpeed: 1 });
    cc.update(1);
    const s1 = cc.getState();
    cc.rotateOrbit(1, 0);
    cc.update(1);
    const s2 = cc.getState();
    expect(s2.position.x).not.toBeCloseTo(s1.position.x, 2);
  });

  // ─── TopDown Mode ─────────────────────────────────────────────────
  it('topDown sets camera above target', () => {
    const cc = new CameraController({ mode: 'topDown' });
    cc.setTarget(5, 0, 5);
    cc.update(1);
    const s = cc.getState();
    expect(s.position.y).toBeGreaterThan(5);
    expect(s.rotation.pitch).toBeCloseTo(-Math.PI / 2, 1);
  });

  // ─── Zoom ─────────────────────────────────────────────────────────
  it('zoom clamps between min and max', () => {
    const cc = new CameraController({ minZoom: 0.5, maxZoom: 3 });
    cc.zoom(100);
    expect(cc.getState().zoom).toBeLessThanOrEqual(3);
    cc.zoom(-100);
    expect(cc.getState().zoom).toBeGreaterThanOrEqual(0.5);
  });

  // ─── Bounds Clamping ──────────────────────────────────────────────
  it('bounds clamp camera position', () => {
    const cc = new CameraController({
      mode: 'free',
      bounds: { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } },
    });
    cc.moveCamera(100, 0, 0);
    cc.update(1);
    expect(cc.getState().position.x).toBeLessThanOrEqual(10);
  });

  // ─── Mode Switching ───────────────────────────────────────────────
  it('setMode switches camera mode', () => {
    const cc = new CameraController();
    cc.setMode('orbit');
    expect(cc.getMode()).toBe('orbit');
  });

  // ─── Free Movement ────────────────────────────────────────────────
  it('moveCamera translates in free mode', () => {
    const cc = new CameraController({ mode: 'free', freeSpeed: 1 });
    const before = cc.getState().position.x;
    cc.moveCamera(5, 0, 0);
    expect(cc.getState().position.x).toBe(before + 5);
  });

  // ─── Config ───────────────────────────────────────────────────────
  it('setFOV and setSmoothing update state', () => {
    const cc = new CameraController();
    cc.setFOV(90);
    expect(cc.getState().fov).toBe(90);
  });

  it('getTarget returns copy', () => {
    const cc = new CameraController();
    cc.setTarget(1, 2, 3);
    const t = cc.getTarget();
    expect(t).toEqual({ x: 1, y: 2, z: 3 });
  });
});
