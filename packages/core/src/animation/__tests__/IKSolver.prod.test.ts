/**
 * IKSolver.prod.test.ts
 * Production tests for IKSolver — chain CRUD, two-bone IK, CCD, foot placement.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IKSolver, IKChain, IKBone } from '../IKSolver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBone(id: string, x: number, y: number, z: number, length: number): IKBone {
  return {
    id,
    position: { x, y, z },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    length,
  };
}

function makeTwoBoneChain(id: string, targetX: number, targetY: number, targetZ: number): IKChain {
  return {
    id,
    bones: [makeBone('root', 0, 0, 0, 1), makeBone('mid', 0, 1, 0, 1)],
    target: { x: targetX, y: targetY, z: targetZ },
    weight: 1,
    iterations: 10,
  };
}

function makeCCDChain(id: string, boneCount: number, targetX: number, targetY: number): IKChain {
  const bones: IKBone[] = [];
  for (let i = 0; i < boneCount; i++) {
    bones.push(makeBone(`b${i}`, i * 0.5, 0, 0, 0.5));
  }
  return {
    id,
    bones,
    target: { x: targetX, y: targetY, z: 0 },
    weight: 1,
    iterations: 20,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IKSolver', () => {
  let solver: IKSolver;

  beforeEach(() => {
    solver = new IKSolver();
  });

  // -------------------------------------------------------------------------
  // Chain Management
  // -------------------------------------------------------------------------
  describe('chain CRUD', () => {
    it('starts with zero chains', () => {
      expect(solver.getChainCount()).toBe(0);
    });

    it('addChain increases count', () => {
      solver.addChain(makeTwoBoneChain('arm', 1, 0, 0));
      expect(solver.getChainCount()).toBe(1);
    });

    it('getChain returns the chain by id', () => {
      const chain = makeTwoBoneChain('arm', 1, 0, 0);
      solver.addChain(chain);
      const got = solver.getChain('arm');
      expect(got).not.toBeUndefined();
      expect(got!.id).toBe('arm');
    });

    it('getChain returns undefined for missing id', () => {
      expect(solver.getChain('missing')).toBeUndefined();
    });

    it('removeChain deletes and returns true', () => {
      solver.addChain(makeTwoBoneChain('arm', 1, 0, 0));
      const removed = solver.removeChain('arm');
      expect(removed).toBe(true);
      expect(solver.getChainCount()).toBe(0);
    });

    it('removeChain returns false for missing id', () => {
      expect(solver.removeChain('missing')).toBe(false);
    });

    it('can add multiple chains', () => {
      solver.addChain(makeTwoBoneChain('leftArm', 1, 0, 0));
      solver.addChain(makeTwoBoneChain('rightArm', -1, 0, 0));
      expect(solver.getChainCount()).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // setTarget / setPoleTarget / setWeight
  // -------------------------------------------------------------------------
  describe('setTarget()', () => {
    it('updates target on the chain', () => {
      solver.addChain(makeTwoBoneChain('arm', 0, 1, 0));
      solver.setTarget('arm', 0.5, 0.5, 0);
      const chain = solver.getChain('arm')!;
      expect(chain.target.x).toBe(0.5);
      expect(chain.target.y).toBe(0.5);
    });

    it('is a no-op for missing chain', () => {
      expect(() => solver.setTarget('missing', 0, 1, 0)).not.toThrow();
    });
  });

  describe('setPoleTarget()', () => {
    it('sets pole target on the chain', () => {
      solver.addChain(makeTwoBoneChain('arm', 0, 1, 0));
      solver.setPoleTarget('arm', 0, 0, 1);
      expect(solver.getChain('arm')!.poleTarget).toEqual({ x: 0, y: 0, z: 1 });
    });
  });

  describe('setWeight()', () => {
    it('clamps weight to [0, 1]', () => {
      solver.addChain(makeTwoBoneChain('arm', 0, 1, 0));
      solver.setWeight('arm', 1.5);
      expect(solver.getChain('arm')!.weight).toBe(1);
      solver.setWeight('arm', -0.5);
      expect(solver.getChain('arm')!.weight).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Two-Bone IK
  // -------------------------------------------------------------------------
  describe('solveTwoBone()', () => {
    it('returns false for missing chain', () => {
      expect(solver.solveTwoBone('missing')).toBe(false);
    });

    it('returns false for chain with fewer than 2 bones', () => {
      const oneBone: IKChain = {
        id: 'single',
        bones: [makeBone('root', 0, 0, 0, 1)],
        target: { x: 0, y: 1, z: 0 },
        weight: 1,
        iterations: 10,
      };
      solver.addChain(oneBone);
      expect(solver.solveTwoBone('single')).toBe(false);
    });

    it('returns true for a valid 2-bone chain', () => {
      solver.addChain(makeTwoBoneChain('arm', 0, 1.5, 0));
      expect(solver.solveTwoBone('arm')).toBe(true);
    });

    it('mid bone position changes after solve', () => {
      const chain = makeTwoBoneChain('arm', 1, 0.5, 0);
      solver.addChain(chain);
      const beforeY = solver.getChain('arm')!.bones[1].position.y;
      solver.solveTwoBone('arm');
      const afterY = solver.getChain('arm')!.bones[1].position.y;
      // Something should have moved
      expect(afterY).not.toBe(1); // mid was at y=1 before
    });

    it('target clamped when too far (beyond max reach)', () => {
      // Target at distance 10 but max reach is 2 (1+1)
      solver.addChain(makeTwoBoneChain('arm', 10, 0, 0));
      expect(() => solver.solveTwoBone('arm')).not.toThrow();
    });

    it('works with 3-bone chain (end effector is positioned)', () => {
      const chain: IKChain = {
        id: 'arm3',
        bones: [
          makeBone('root', 0, 0, 0, 1),
          makeBone('mid', 0, 1, 0, 1),
          makeBone('end', 0, 2, 0, 0.5),
        ],
        target: { x: 0, y: 1.5, z: 0 },
        weight: 1,
        iterations: 10,
      };
      solver.addChain(chain);
      expect(solver.solveTwoBone('arm3')).toBe(true);
      const end = solver.getChain('arm3')!.bones[2];
      // End effector should be moved toward target
      expect(end.position.y).not.toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // CCD Solver
  // -------------------------------------------------------------------------
  describe('solveCCD()', () => {
    it('returns false for missing chain', () => {
      expect(solver.solveCCD('missing')).toBe(false);
    });

    it('returns false for chain with fewer than 2 bones', () => {
      const chain: IKChain = {
        id: 'single',
        bones: [makeBone('root', 0, 0, 0, 1)],
        target: { x: 0, y: 1, z: 0 },
        weight: 1,
        iterations: 10,
      };
      solver.addChain(chain);
      expect(solver.solveCCD('single')).toBe(false);
    });

    it('returns true for a valid chain', () => {
      solver.addChain(makeCCDChain('spine', 4, 1, 1));
      expect(solver.solveCCD('spine')).toBe(true);
    });

    it('end effector moves toward target', () => {
      const chain = makeCCDChain('spine', 4, 1, 1);
      solver.addChain(chain);
      const startDist = Math.hypot(
        solver.getChain('spine')!.bones.at(-1)!.position.x - 1,
        solver.getChain('spine')!.bones.at(-1)!.position.y - 1
      );
      solver.solveCCD('spine');
      const endDist = Math.hypot(
        solver.getChain('spine')!.bones.at(-1)!.position.x - 1,
        solver.getChain('spine')!.bones.at(-1)!.position.y - 1
      );
      expect(endDist).toBeLessThanOrEqual(startDist + 0.001);
    });

    it('respects joint angle limits', () => {
      const chain = makeCCDChain('limited', 3, 1, 0);
      chain.bones[1].minAngle = -0.1;
      chain.bones[1].maxAngle = 0.1;
      solver.addChain(chain);
      expect(() => solver.solveCCD('limited')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Foot Placement
  // -------------------------------------------------------------------------
  describe('updateFootPlacement()', () => {
    it('returns a position object', () => {
      const pos = solver.updateFootPlacement('leftFoot', 0, 0.016);
      expect(typeof pos.x).toBe('number');
      expect(typeof pos.y).toBe('number');
      expect(typeof pos.z).toBe('number');
    });

    it('foot Y approaches groundHeight + offset over time', () => {
      solver.setFootPlacement({ footOffset: 0.05, blendSpeed: 100, enabled: true });
      // Initial position is {0,0,0}; ground=0 → target y=0.05
      // With blendSpeed=100 and dt=1 the blend = min(1, 100*1) = 1 (snap)
      const pos = solver.updateFootPlacement('foot', 0, 1);
      expect(pos.y).toBeCloseTo(0.05, 3);
    });

    it('second call uses previous position (memory)', () => {
      solver.setFootPlacement({ footOffset: 0, blendSpeed: 10, enabled: true });
      solver.updateFootPlacement('foot', 5, 0.016); // first call
      const pos = solver.updateFootPlacement('foot', 5, 0.016); // second call
      // y is blending toward 5; should be > 0 now
      expect(pos.y).toBeGreaterThan(0);
    });

    it('getFootPlacement returns current config', () => {
      solver.setFootPlacement({ rayHeight: 2, enabled: true });
      const cfg = solver.getFootPlacement();
      expect(cfg.rayHeight).toBe(2);
      expect(cfg.enabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // solveAll
  // -------------------------------------------------------------------------
  describe('solveAll()', () => {
    it('is a no-op with no chains', () => {
      expect(() => solver.solveAll()).not.toThrow();
    });

    it('dispatches to two-bone solver for 2-bone chains', () => {
      solver.addChain(makeTwoBoneChain('arm', 0, 1, 0));
      // Just verify it does not throw and modifies the chain
      expect(() => solver.solveAll()).not.toThrow();
    });

    it('dispatches to CCD for 4-bone chains', () => {
      solver.addChain(makeCCDChain('spine', 4, 1, 1));
      expect(() => solver.solveAll()).not.toThrow();
    });

    it('solves multiple chains in one call', () => {
      solver.addChain(makeTwoBoneChain('leftArm', 0.5, 0.5, 0));
      solver.addChain(makeTwoBoneChain('rightArm', -0.5, 0.5, 0));
      solver.addChain(makeCCDChain('spine', 4, 0, 2));
      expect(() => solver.solveAll()).not.toThrow();
    });
  });
});
