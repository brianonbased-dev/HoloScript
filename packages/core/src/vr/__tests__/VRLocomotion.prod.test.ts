/**
 * VRLocomotion Production Tests
 * Sprint CLXVI — teleport, smooth move, snap-turn, boundary fade, vignette
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { VRLocomotion, type TeleportTarget } from '../VRLocomotion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTarget(x: number, y: number, z: number, valid = true): TeleportTarget {
  return { x, y, z, valid, normal: { x: 0, y: 1, z: 0 } };
}

// ---------------------------------------------------------------------------
// Constructor / config
// ---------------------------------------------------------------------------

describe('VRLocomotion', () => {
  let loco: VRLocomotion;

  beforeEach(() => {
    loco = new VRLocomotion();
  });

  describe('constructor', () => {
    it('starts at origin', () => {
      expect(loco.getPosition()).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('starts with rotation 0', () => {
      expect(loco.getRotation()).toBe(0);
    });

    it('default mode is teleport', () => {
      expect(loco.getConfig().mode).toBe('teleport');
    });

    it('accepts partial config', () => {
      const l = new VRLocomotion({ moveSpeed: 5, snapAngle: 30 });
      expect(l.getConfig().moveSpeed).toBe(5);
      expect(l.getConfig().snapAngle).toBe(30);
    });

    it('starts with empty teleport history', () => {
      expect(loco.getTeleportHistory()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // teleport
  // -------------------------------------------------------------------------

  describe('teleport', () => {
    it('teleports to valid target within range', () => {
      const r = loco.teleport(makeTarget(3, 0, 0));
      expect(r).toBe(true);
      expect(loco.getPosition()).toMatchObject({ x: 3, y: 0, z: 0 });
    });

    it('returns false for invalid target', () => {
      const r = loco.teleport(makeTarget(3, 0, 0, false));
      expect(r).toBe(false);
      expect(loco.getPosition()).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('returns false for target outside teleportRange (default 10)', () => {
      const r = loco.teleport(makeTarget(15, 0, 0));
      expect(r).toBe(false);
    });

    it('returns true at exactly teleportRange', () => {
      const r = loco.teleport(makeTarget(10, 0, 0));
      expect(r).toBe(true);
    });

    it('adds successful teleport to history', () => {
      loco.teleport(makeTarget(3, 0, 4));
      const h = loco.getTeleportHistory();
      expect(h).toHaveLength(1);
      expect(h[0]).toMatchObject({ x: 3, y: 0, z: 4 });
    });

    it('history accumulates multiple teleports', () => {
      loco.teleport(makeTarget(1, 0, 0));
      loco.teleport(makeTarget(3, 0, 0));
      expect(loco.getTeleportHistory()).toHaveLength(2);
    });

    it('does not add failed teleport to history', () => {
      loco.teleport(makeTarget(1, 0, 0, false));
      expect(loco.getTeleportHistory()).toHaveLength(0);
    });

    it('uses custom teleportRange from config', () => {
      const l = new VRLocomotion({ teleportRange: 5 });
      expect(l.teleport(makeTarget(6, 0, 0))).toBe(false);
      expect(l.teleport(makeTarget(5, 0, 0))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // move (smooth locomotion)
  // -------------------------------------------------------------------------

  describe('move', () => {
    it('moves position by (dx, dz) scaled by speed and deltaTime at rotation=0', () => {
      // At rotation=0: cos(0)=1, sin(0)=0, so (dx, dz) maps to (dx, dz) * speed * dt
      const l = new VRLocomotion({ moveSpeed: 2 });
      l.move(1, 0, 1); // dx=1, dz=0, dt=1
      const pos = l.getPosition();
      expect(pos.x).toBeCloseTo(2, 5);
      expect(pos.z).toBeCloseTo(0, 5);
    });

    it('applies rotation to movement direction', () => {
      // At 90° rotation: sin(90°)=1, cos(90°)=0
      // moving forward (dx=0, dz=1) with 90° yaw rotates x+
      const l = new VRLocomotion({ moveSpeed: 1 });
      l.snapTurn('right'); // +45°
      l.snapTurn('right'); // +90°
      l.move(0, 1, 1); // move "forward" which maps to sideways
      const pos = l.getPosition();
      // At 90°: dx maps to (0*cos90 - 1*sin90) = -1, dz maps to (0*sin90 + 1*cos90) = 0
      expect(pos.x).toBeCloseTo(-1, 1);
    });

    it('accumulates multiple moves', () => {
      const l = new VRLocomotion({ moveSpeed: 1 });
      l.move(1, 0, 1);
      l.move(1, 0, 1);
      expect(l.getPosition().x).toBeCloseTo(2, 5);
    });

    it('does not change y position', () => {
      loco.move(1, 1, 1);
      expect(loco.getPosition().y).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // snapTurn
  // -------------------------------------------------------------------------

  describe('snapTurn', () => {
    it('right snap adds default 45°', () => {
      loco.snapTurn('right');
      expect(loco.getRotation()).toBe(45);
    });

    it('left snap subtracts 45°', () => {
      loco.snapTurn('left');
      expect(loco.getRotation()).toBe(315); // 360 - 45
    });

    it('rotation wraps around 360°', () => {
      for (let i = 0; i < 8; i++) loco.snapTurn('right');
      expect(loco.getRotation()).toBe(0);
    });

    it('double left stays positive', () => {
      loco.snapTurn('left');
      loco.snapTurn('left');
      expect(loco.getRotation()).toBe(270);
    });

    it('custom snapAngle', () => {
      const l = new VRLocomotion({ snapAngle: 90 });
      l.snapTurn('right');
      expect(l.getRotation()).toBe(90);
    });
  });

  // -------------------------------------------------------------------------
  // Boundary fade
  // -------------------------------------------------------------------------

  describe('boundary fade', () => {
    it('returns 1 when far from boundary', () => {
      loco.updateBoundary(5);
      expect(loco.getBoundaryFade()).toBe(1);
    });

    it('returns 0 at boundary distance = 0', () => {
      loco.updateBoundary(0);
      expect(loco.getBoundaryFade()).toBe(0);
    });

    it('interpolates fade at half the threshold', () => {
      // Default boundaryFadeDistance = 0.5
      loco.updateBoundary(0.25); // half of 0.5
      expect(loco.getBoundaryFade()).toBeCloseTo(0.5, 5);
    });

    it('clamped to 0 when distance is negative', () => {
      loco.updateBoundary(-1);
      expect(loco.getBoundaryFade()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Vignette
  // -------------------------------------------------------------------------

  describe('shouldShowVignette', () => {
    it('returns false in teleport mode even with comfortVignette=true', () => {
      const l = new VRLocomotion({ mode: 'teleport', comfortVignette: true });
      expect(l.shouldShowVignette()).toBe(false);
    });

    it('returns true in smooth mode with comfortVignette=true', () => {
      const l = new VRLocomotion({ mode: 'smooth', comfortVignette: true });
      expect(l.shouldShowVignette()).toBe(true);
    });

    it('returns false in smooth mode with comfortVignette=false', () => {
      const l = new VRLocomotion({ mode: 'smooth', comfortVignette: false });
      expect(l.shouldShowVignette()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // setMode
  // -------------------------------------------------------------------------

  describe('setMode', () => {
    it('changes the locomotion mode', () => {
      loco.setMode('smooth');
      expect(loco.getConfig().mode).toBe('smooth');
    });
  });
});
