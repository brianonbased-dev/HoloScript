/**
 * RagdollController.prod.test.ts
 *
 * Production tests for RagdollController — bone setup, state transitions,
 * blend factor, gravity integration, constraint solving, impulse, and queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RagdollController } from '..';

function makeController() {
  return new RagdollController({ gravity: -9.81, damping: 0.99, iterations: 4 });
}

describe('RagdollController', () => {
  let rc: RagdollController;

  beforeEach(() => {
    rc = makeController();
    // Build a simple 3-bone chain: spine → chest → head
    rc.addBone('spine', null, 5, 0.4);
    rc.addBone('chest', 'spine', 3, 0.3);
    rc.addBone('head', 'chest', 1, 0.2);
  });

  // -------------------------------------------------------------------------
  // Bone management
  // -------------------------------------------------------------------------
  describe('addBone / getBone / getBoneCount / getRootBone', () => {
    it('getBoneCount returns 3', () => {
      expect(rc.getBoneCount()).toBe(3);
    });

    it('getBone retrieves by id', () => {
      const b = rc.getBone('spine');
      expect(b).toBeDefined();
      expect(b!.mass).toBe(5);
    });

    it('getRootBone returns root (no parent)', () => {
      expect(rc.getRootBone()?.name).toBe('spine');
    });

    it('bone default limits set when not provided', () => {
      const b = rc.getBone('spine')!;
      expect(b.jointLimits.min.x).toBe(-1);
    });

    it('custom limits are respected', () => {
      rc.addBone('lhand', 'spine', 1, 0.2, {
        min: { x: -0.5, y: -0.3, z: -0.1 },
        max: { x: 0.5, y: 0.3, z: 0.1 },
      });
      expect(rc.getBone('lhand')!.jointLimits.min.x).toBe(-0.5);
    });

    it('removeBone returns true', () => {
      expect(rc.removeBone('head')).toBe(true);
      expect(rc.getBoneCount()).toBe(2);
    });

    it('getChildren returns child bones', () => {
      const children = rc.getChildren('spine');
      expect(children.map((c) => c.name)).toContain('chest');
    });
  });

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------
  describe('state transitions', () => {
    it('default state is "active"', () => {
      expect(rc.getState()).toBe('active');
    });

    it('goRagdoll() sets state to "ragdoll" and blendFactor to 1', () => {
      rc.goRagdoll();
      expect(rc.getState()).toBe('ragdoll');
      expect(rc.getBlendFactor()).toBe(1);
    });

    it('activate() resets to "active" and blendFactor to 0', () => {
      rc.goRagdoll();
      rc.activate();
      expect(rc.getState()).toBe('active');
      expect(rc.getBlendFactor()).toBe(0);
    });

    it('startBlend(true) enters "blending" at factor 0', () => {
      rc.startBlend(true);
      expect(rc.getState()).toBe('blending');
      expect(rc.getBlendFactor()).toBe(0);
    });

    it('startBlend(false) enters "blending" at factor 1', () => {
      rc.startBlend(false);
      expect(rc.getBlendFactor()).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Update — blending
  // -------------------------------------------------------------------------
  describe('update() — blend transition', () => {
    it('blend factor increases toward 1 while blending', () => {
      rc.startBlend(true);
      rc.update(0.1);
      expect(rc.getBlendFactor()).toBeGreaterThan(0);
      expect(rc.getBlendFactor()).toBeLessThanOrEqual(1);
    });

    it('transitions to ragdoll when blendFactor reaches 1', () => {
      rc.startBlend(true);
      rc.update(10); // large dt → blendFactor ≥ 1
      expect(rc.getState()).toBe('ragdoll');
    });

    it('active state: update does not move bones', () => {
      // state is 'active', so bones should not change
      const spine = rc.getBone('spine')!;
      const origY = spine.position.y;
      rc.update(0.1);
      expect(spine.position.y).toBe(origY);
    });
  });

  // -------------------------------------------------------------------------
  // Gravity integration
  // -------------------------------------------------------------------------
  describe('gravity integration in ragdoll mode', () => {
    it('bones fall downward under gravity', () => {
      rc.goRagdoll();
      const spine = rc.getBone('spine')!;
      rc.update(0.1);
      // Gravity is negative, so velocity.y becomes negative
      expect(rc.getBone('spine')!.velocity.y).toBeLessThan(0);
    });

    it('positions change over time in ragdoll mode', () => {
      rc.goRagdoll();
      const origY = rc.getBone('spine')!.position.y;
      rc.update(0.5);
      expect(rc.getBone('spine')!.position.y).toBeLessThan(origY);
    });
  });

  // -------------------------------------------------------------------------
  // Impulse
  // -------------------------------------------------------------------------
  describe('applyImpulse()', () => {
    it('adds velocity to a bone proportional to impulse/mass', () => {
      rc.goRagdoll();
      const spine = rc.getBone('spine')!;
      rc.applyImpulse('spine', { x: 10, y: 0, z: 0 });
      // velocity.x += 10 / mass(5) = 2
      expect(spine.velocity.x).toBeCloseTo(2);
    });

    it('no-op for unknown bone id', () => {
      expect(() => rc.applyImpulse('ghost', { x: 1, y: 0, z: 0 })).not.toThrow();
    });
  });
});
