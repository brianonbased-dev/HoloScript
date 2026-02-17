import { describe, it, expect, beforeEach } from 'vitest';
import { VRLocomotion, TeleportTarget } from '../../vr/VRLocomotion';

function validTarget(x = 0, y = 0, z = 0): TeleportTarget {
  return { x, y, z, valid: true, normal: { x: 0, y: 1, z: 0 } };
}

describe('VRLocomotion', () => {
  let loco: VRLocomotion;

  beforeEach(() => {
    loco = new VRLocomotion();
  });

  // ---------- Defaults ----------
  it('initializes with default config', () => {
    const cfg = loco.getConfig();
    expect(cfg.mode).toBe('teleport');
    expect(cfg.moveSpeed).toBe(2);
    expect(cfg.snapAngle).toBe(45);
    expect(cfg.teleportRange).toBe(10);
    expect(cfg.comfortVignette).toBe(true);
  });

  it('starts at origin', () => {
    expect(loco.getPosition()).toEqual({ x: 0, y: 0, z: 0 });
    expect(loco.getRotation()).toBe(0);
  });

  // ---------- Teleport ----------
  it('teleports to a valid target', () => {
    const success = loco.teleport(validTarget(5, 0, 3));
    expect(success).toBe(true);
    expect(loco.getPosition()).toEqual({ x: 5, y: 0, z: 3 });
  });

  it('rejects invalid teleport target', () => {
    const result = loco.teleport({ x: 1, y: 0, z: 0, valid: false, normal: { x: 0, y: 1, z: 0 } });
    expect(result).toBe(false);
    expect(loco.getPosition()).toEqual({ x: 0, y: 0, z: 0 }); // unchanged
  });

  it('rejects teleport beyond range', () => {
    const result = loco.teleport(validTarget(100, 0, 100)); // way beyond 10m
    expect(result).toBe(false);
  });

  it('records teleport history', () => {
    loco.teleport(validTarget(1, 0, 0));
    loco.teleport(validTarget(2, 0, 0));
    expect(loco.getTeleportHistory().length).toBe(2);
    expect(loco.getTeleportHistory()[0].x).toBe(1);
  });

  // ---------- Smooth Move ----------
  it('moves with smooth locomotion', () => {
    loco.move(1, 0, 1.0); // dx=1, dz=0, 1 second at speed 2
    const pos = loco.getPosition();
    expect(pos.x).toBeCloseTo(2, 1); // speed * dx * dt = 2 * 1 * 1 = 2
    expect(pos.z).toBeCloseTo(0, 1);
  });

  it('applies rotation to movement direction', () => {
    loco.snapTurn('right'); // +45 degrees
    loco.move(1, 0, 1.0);
    const pos = loco.getPosition();
    // At 45°, forward movement should split between x and z
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.z).toBeGreaterThan(0);
  });

  // ---------- Snap Turn ----------
  it('snap turns right by configured angle', () => {
    loco.snapTurn('right');
    expect(loco.getRotation()).toBe(45);
  });

  it('snap turns left', () => {
    loco.snapTurn('left');
    expect(loco.getRotation()).toBe(315); // -45 → 315 (wrapped)
  });

  it('wraps rotation at 360', () => {
    for (let i = 0; i < 9; i++) loco.snapTurn('right'); // 9 * 45 = 405 → 45
    expect(loco.getRotation()).toBe(45);
  });

  // ---------- Boundary ----------
  it('returns full fade when far from boundary', () => {
    loco.updateBoundary(10);
    expect(loco.getBoundaryFade()).toBe(1);
  });

  it('returns partial fade near boundary', () => {
    loco.updateBoundary(0.25); // Half of default 0.5
    expect(loco.getBoundaryFade()).toBe(0.5);
  });

  it('returns zero fade at boundary', () => {
    loco.updateBoundary(0);
    expect(loco.getBoundaryFade()).toBe(0);
  });

  // ---------- Comfort Vignette ----------
  it('shows vignette only in smooth mode', () => {
    expect(loco.shouldShowVignette()).toBe(false); // default is teleport
    loco.setMode('smooth');
    expect(loco.shouldShowVignette()).toBe(true);
  });

  it('does not show vignette when disabled', () => {
    const l = new VRLocomotion({ mode: 'smooth', comfortVignette: false });
    expect(l.shouldShowVignette()).toBe(false);
  });

  // ---------- Mode ----------
  it('setMode changes locomotion mode', () => {
    loco.setMode('snap-turn');
    expect(loco.getConfig().mode).toBe('snap-turn');
  });
});
