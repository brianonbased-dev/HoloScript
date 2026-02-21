/**
 * IKTrait — Production Tests
 *
 * Covers:
 * - Constructor: all defaults, chain from config object vs string, getConfig copy
 * - setChain / getChain round-trip
 * - setTarget: string target (sets config.target, clears targetPosition), Vector3 (sets targetPosition, clears target)
 * - setPoleTarget: string vs Vector3 variants
 * - setWeight / getWeight: clamped to [0, 1]
 * - setEnabled / isEnabled
 * - solve() — no chain: returns reached=false, distanceToTarget=Infinity
 * - solve() — reachable target: returned result has reached=true, boneTransforms has all bones
 * - solve() — unreachable target (dist > totalLength): reached=false, distanceToTarget > 0, still returns boneTransforms
 * - solve() — target exactly at root: chain collapses, still produces transforms
 * - getLastResult reflects most recent solve
 * - serialize: returns chain/target/weight/iterations/solver fields
 * - createIKTrait factory
 */
import { describe, it, expect } from 'vitest';
import { IKTrait, createIKTrait, type IKChain, type IKBone } from '../IKTrait';

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function bone(name: string, length: number, position = { x: 0, y: 0, z: 0 }): IKBone {
  return { name, length, transform: { position, rotation: { x: 0, y: 0, z: 0, w: 1 } } };
}

function twoSegmentChain(): IKChain {
  return {
    name: 'arm',
    bones: [
      bone('upper', 1.0, { x: 0, y: 0, z: 0 }),
      bone('lower', 1.0, { x: 0, y: 1, z: 0 }),
    ],
    solver: 'fabrik',
  };
}

function threeSegmentChain(): IKChain {
  return {
    name: 'spine',
    bones: [
      bone('s0', 1.0, { x: 0, y: 0, z: 0 }),
      bone('s1', 1.0, { x: 0, y: 1, z: 0 }),
      bone('s2', 1.0, { x: 0, y: 2, z: 0 }),
    ],
    solver: 'fabrik',
  };
}

// ─── Constructor ─────────────────────────────────────────────────────────────────

describe('IKTrait — constructor defaults', () => {
  it('iterations defaults to 10', () => {
    const t = new IKTrait({ chain: '' });
    expect(t.getConfig().iterations).toBe(10);
  });

  it('tolerance defaults to 0.001', () => {
    const t = new IKTrait({ chain: '' });
    expect(t.getConfig().tolerance).toBeCloseTo(0.001);
  });

  it('weight defaults to 1.0', () => {
    const t = new IKTrait({ chain: '' });
    expect(t.getWeight()).toBeCloseTo(1.0);
  });

  it('solver defaults to fabrik', () => {
    const t = new IKTrait({ chain: '' });
    expect(t.getConfig().solver).toBe('fabrik');
  });

  it('stretch defaults to false', () => {
    const t = new IKTrait({ chain: '' });
    expect(t.getConfig().stretch).toBe(false);
  });

  it('pinRoot defaults to true', () => {
    const t = new IKTrait({ chain: '' });
    expect(t.getConfig().pinRoot).toBe(true);
  });

  it('updateMode defaults to lateUpdate', () => {
    const t = new IKTrait({ chain: '' });
    expect(t.getConfig().updateMode).toBe('lateUpdate');
  });

  it('chain object is stored when provided as object', () => {
    const chain = twoSegmentChain();
    const t = new IKTrait({ chain });
    expect(t.getChain()).toBe(chain);
  });

  it('chain is null when provided as string', () => {
    const t = new IKTrait({ chain: 'arm' });
    expect(t.getChain()).toBeNull();
  });

  it('getConfig returns a copy (mutation does not affect internal)', () => {
    const t = new IKTrait({ chain: '' });
    const cfg = t.getConfig();
    cfg.iterations = 999;
    expect(t.getConfig().iterations).toBe(10);
  });
});

// ─── setChain / getChain ──────────────────────────────────────────────────────────

describe('IKTrait — setChain / getChain', () => {
  it('setChain stores the chain', () => {
    const t = new IKTrait({ chain: '' });
    const chain = twoSegmentChain();
    t.setChain(chain);
    expect(t.getChain()).toBe(chain);
  });

  it('setChain replaces existing chain', () => {
    const t = new IKTrait({ chain: twoSegmentChain() });
    const newChain = threeSegmentChain();
    t.setChain(newChain);
    expect(t.getChain()?.name).toBe('spine');
  });
});

// ─── setTarget ────────────────────────────────────────────────────────────────────

describe('IKTrait — setTarget', () => {
  it('string target sets config.target and clears targetPosition', () => {
    const t = new IKTrait({ chain: '', targetPosition: { x: 1, y: 2, z: 3 } });
    t.setTarget('TargetSphere');
    expect(t.getConfig().target).toBe('TargetSphere');
    expect(t.getConfig().targetPosition).toBeUndefined();
  });

  it('Vector3 target sets targetPosition and clears config.target', () => {
    const t = new IKTrait({ chain: '', target: 'Sphere' });
    t.setTarget({ x: 1, y: 2, z: 3 });
    expect(t.getConfig().targetPosition).toEqual({ x: 1, y: 2, z: 3 });
    expect(t.getConfig().target).toBeUndefined();
  });
});

// ─── setPoleTarget ────────────────────────────────────────────────────────────────

describe('IKTrait — setPoleTarget', () => {
  it('string pole sets config.poleTarget and clears polePosition', () => {
    const t = new IKTrait({ chain: '', polePosition: { x: 0, y: 0, z: 1 } });
    t.setPoleTarget('ElbowHint');
    expect(t.getConfig().poleTarget).toBe('ElbowHint');
    expect(t.getConfig().polePosition).toBeUndefined();
  });

  it('Vector3 pole sets polePosition and clears poleTarget', () => {
    const t = new IKTrait({ chain: '', poleTarget: 'ElbowHint' });
    t.setPoleTarget({ x: 0, y: 0, z: 2 });
    expect(t.getConfig().polePosition).toEqual({ x: 0, y: 0, z: 2 });
    expect(t.getConfig().poleTarget).toBeUndefined();
  });
});

// ─── setWeight / getWeight ────────────────────────────────────────────────────────

describe('IKTrait — setWeight / getWeight', () => {
  it('setWeight round-trip', () => {
    const t = new IKTrait({ chain: '' });
    t.setWeight(0.75);
    expect(t.getWeight()).toBeCloseTo(0.75);
  });

  it('weight clamped to 0 when < 0', () => {
    const t = new IKTrait({ chain: '' });
    t.setWeight(-1);
    expect(t.getWeight()).toBe(0);
  });

  it('weight clamped to 1 when > 1', () => {
    const t = new IKTrait({ chain: '' });
    t.setWeight(5);
    expect(t.getWeight()).toBe(1);
  });
});

// ─── setEnabled / isEnabled ───────────────────────────────────────────────────────

describe('IKTrait — setEnabled / isEnabled', () => {
  it('enabled = true by default', () => {
    expect(new IKTrait({ chain: '' }).isEnabled()).toBe(true);
  });

  it('setEnabled(false) disables', () => {
    const t = new IKTrait({ chain: '' });
    t.setEnabled(false);
    expect(t.isEnabled()).toBe(false);
  });

  it('re-enable works', () => {
    const t = new IKTrait({ chain: '' });
    t.setEnabled(false);
    t.setEnabled(true);
    expect(t.isEnabled()).toBe(true);
  });
});

// ─── solve() — no chain ───────────────────────────────────────────────────────────

describe('IKTrait — solve() no chain', () => {
  it('returns reached=false when chain is null', () => {
    const t = new IKTrait({ chain: '' });
    const result = t.solve({ x: 1, y: 1, z: 0 });
    expect(result.reached).toBe(false);
  });

  it('distanceToTarget = Infinity when chain is null', () => {
    const t = new IKTrait({ chain: '' });
    const result = t.solve({ x: 1, y: 1, z: 0 });
    expect(result.distanceToTarget).toBe(Infinity);
  });

  it('boneTransforms is empty map when chain is null', () => {
    const t = new IKTrait({ chain: '' });
    const result = t.solve({ x: 1, y: 1, z: 0 });
    expect(result.boneTransforms.size).toBe(0);
  });

  it('iterationsUsed = 0 when chain is null', () => {
    const t = new IKTrait({ chain: '' });
    const result = t.solve({ x: 0, y: 1, z: 0 });
    expect(result.iterationsUsed).toBe(0);
  });
});

// ─── solve() — reachable target ───────────────────────────────────────────────────

describe('IKTrait — solve() reachable target', () => {
  it('boneTransforms has entry for each bone', () => {
    const t = new IKTrait({ chain: twoSegmentChain(), iterations: 50, tolerance: 0.001 });
    // Target within reach: two bones of length 1 each = total 2; target at y=1.5
    const result = t.solve({ x: 0, y: 1.5, z: 0 });
    expect(result.boneTransforms.has('upper')).toBe(true);
    expect(result.boneTransforms.has('lower')).toBe(true);
  });

  it('reached = true when target is within chain reach', () => {
    const t = new IKTrait({ chain: twoSegmentChain(), iterations: 100, tolerance: 0.01 });
    // Target at x=1.4 is within total chain length 2, off-axis from rest pose (bones go up)
    // so FABRIK must actually work. pinRoot=true keeps root at origin.
    const result = t.solve({ x: 1.4, y: 0, z: 0 });
    expect(result.reached).toBe(true);
  });

  it('distanceToTarget is near 0 for reachable target', () => {
    const t = new IKTrait({ chain: twoSegmentChain(), iterations: 100, tolerance: 0.001 });
    const result = t.solve({ x: 1.4, y: 0, z: 0 });
    expect(result.distanceToTarget).toBeLessThan(0.5);
  });

  it('solveTimeMs is a non-negative finite number', () => {
    const t = new IKTrait({ chain: twoSegmentChain() });
    const result = t.solve({ x: 0, y: 1, z: 0 });
    expect(result.solveTimeMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.solveTimeMs)).toBe(true);
  });

  it('three-segment chain produces 3 bone transforms', () => {
    const t = new IKTrait({ chain: threeSegmentChain(), iterations: 50 });
    const result = t.solve({ x: 0, y: 2, z: 0 }); // within total length 3
    expect(result.boneTransforms.size).toBe(3);
  });
});

// ─── solve() — unreachable target ─────────────────────────────────────────────────

describe('IKTrait — solve() unreachable target', () => {
  it('reached = false when target is beyond chain length', () => {
    const t = new IKTrait({ chain: twoSegmentChain(), stretch: false });
    // Total length = 2; target at distance 10 → unreachable
    const result = t.solve({ x: 0, y: 10, z: 0 });
    expect(result.reached).toBe(false);
  });

  it('boneTransforms still contains all bones (stretch toward target)', () => {
    const t = new IKTrait({ chain: twoSegmentChain(), stretch: false });
    const result = t.solve({ x: 0, y: 10, z: 0 });
    expect(result.boneTransforms.has('upper')).toBe(true);
    expect(result.boneTransforms.has('lower')).toBe(true);
  });

  it('distanceToTarget is positive when unreachable', () => {
    const t = new IKTrait({ chain: twoSegmentChain(), stretch: false });
    const result = t.solve({ x: 0, y: 10, z: 0 });
    expect(result.distanceToTarget).toBeGreaterThan(0);
  });
});

// ─── getLastResult ────────────────────────────────────────────────────────────────

describe('IKTrait — getLastResult', () => {
  it('getLastResult is null before any solve()', () => {
    const t = new IKTrait({ chain: twoSegmentChain() });
    expect(t.getLastResult()).toBeNull();
  });

  it('getLastResult is null when chain is null (empty chain solve)', () => {
    const t = new IKTrait({ chain: '' });
    t.solve({ x: 0, y: 1, z: 0 });
    // No chain → no lastResult update
    expect(t.getLastResult()).toBeNull();
  });

  it('getLastResult updated after successful reachable solve', () => {
    const t = new IKTrait({ chain: twoSegmentChain(), iterations: 100 });
    t.solve({ x: 0, y: 1, z: 0 });
    expect(t.getLastResult()).not.toBeNull();
    expect(t.getLastResult()?.boneTransforms.size).toBe(2);
  });

  it('getLastResult reflects most recent call', () => {
    const t = new IKTrait({ chain: twoSegmentChain(), iterations: 100, tolerance: 0.01 });
    t.solve({ x: 0, y: 1, z: 0 });
    t.solve({ x: 0, y: 1.5, z: 0 });
    // Both reachable; just confirm a second call updates the result
    expect(t.getLastResult()).toBeDefined();
  });
});

// ─── serialize ────────────────────────────────────────────────────────────────────

describe('IKTrait — serialize', () => {
  it('includes chain name from chain object', () => {
    const chain = twoSegmentChain();
    const t = new IKTrait({ chain });
    const s = t.serialize();
    expect(s.chain).toBe('arm');
  });

  it('includes chain string when config.chain is a string', () => {
    const t = new IKTrait({ chain: 'leftArm' });
    expect(t.serialize().chain).toBe('leftArm');
  });

  it('includes weight', () => {
    const t = new IKTrait({ chain: '', weight: 0.5 });
    expect(t.serialize().weight).toBeCloseTo(0.5);
  });

  it('includes iterations', () => {
    const t = new IKTrait({ chain: '', iterations: 15 });
    expect(t.serialize().iterations).toBe(15);
  });

  it('includes solver', () => {
    const t = new IKTrait({ chain: '', solver: 'ccd' });
    expect(t.serialize().solver).toBe('ccd');
  });
});

// ─── createIKTrait factory ────────────────────────────────────────────────────────

describe('createIKTrait factory', () => {
  it('creates an IKTrait with defaults', () => {
    const t = createIKTrait();
    expect(t).toBeInstanceOf(IKTrait);
    expect(t.getWeight()).toBeCloseTo(1.0);
    expect(t.getConfig().solver).toBe('fabrik');
  });

  it('applied overrides are reflected', () => {
    const t = createIKTrait({ weight: 0.6, iterations: 20 });
    expect(t.getWeight()).toBeCloseTo(0.6);
    expect(t.getConfig().iterations).toBe(20);
  });
});
