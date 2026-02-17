import { describe, it, expect, beforeEach } from 'vitest';
import { IKSolver } from '../IKSolver';
import type { IKChain, IKBone } from '../IKSolver';

function makeBone(id: string, x = 0, y = 0, z = 0, length = 1): IKBone {
  return {
    id,
    position: { x, y, z },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    length,
  };
}

function makeChain(id: string, boneCount = 2): IKChain {
  const bones: IKBone[] = [];
  for (let i = 0; i < boneCount; i++) {
    bones.push(makeBone(`${id}_bone${i}`, 0, i, 0, 1));
  }
  return {
    id,
    bones,
    target: { x: 0, y: boneCount, z: 0 },
    weight: 1,
    iterations: 10,
  };
}

describe('IKSolver', () => {
  let solver: IKSolver;

  beforeEach(() => { solver = new IKSolver(); });

  // ---------------------------------------------------------------------------
  // Chain Management
  // ---------------------------------------------------------------------------

  it('addChain registers a chain', () => {
    solver.addChain(makeChain('arm'));
    expect(solver.getChainCount()).toBe(1);
  });

  it('getChain retrieves chain by id', () => {
    solver.addChain(makeChain('arm'));
    expect(solver.getChain('arm')).toBeDefined();
    expect(solver.getChain('nope')).toBeUndefined();
  });

  it('removeChain removes chain', () => {
    solver.addChain(makeChain('arm'));
    expect(solver.removeChain('arm')).toBe(true);
    expect(solver.getChainCount()).toBe(0);
  });

  it('removeChain returns false for unknown', () => {
    expect(solver.removeChain('nope')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Target Setting
  // ---------------------------------------------------------------------------

  it('setTarget updates chain target position', () => {
    solver.addChain(makeChain('arm'));
    solver.setTarget('arm', 1, 2, 3);
    const chain = solver.getChain('arm')!;
    expect(chain.target).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('setPoleTarget updates pole target', () => {
    solver.addChain(makeChain('arm'));
    solver.setPoleTarget('arm', 0, 1, -1);
    const chain = solver.getChain('arm')!;
    expect(chain.poleTarget).toEqual({ x: 0, y: 1, z: -1 });
  });

  it('setWeight updates chain weight', () => {
    solver.addChain(makeChain('arm'));
    solver.setWeight('arm', 0.5);
    const chain = solver.getChain('arm')!;
    expect(chain.weight).toBe(0.5);
  });

  // ---------------------------------------------------------------------------
  // Solving
  // ---------------------------------------------------------------------------

  it('solveTwoBone returns true for valid chain', () => {
    solver.addChain(makeChain('arm', 2));
    solver.setTarget('arm', 1, 1, 0);
    expect(solver.solveTwoBone('arm')).toBe(true);
  });

  it('solveTwoBone returns false for unknown chain', () => {
    expect(solver.solveTwoBone('nope')).toBe(false);
  });

  it('solveCCD returns true for valid chain', () => {
    solver.addChain(makeChain('arm', 3));
    solver.setTarget('arm', 1, 1, 0);
    expect(solver.solveCCD('arm')).toBe(true);
  });

  it('solveCCD returns false for unknown chain', () => {
    expect(solver.solveCCD('nope')).toBe(false);
  });

  it('solveAll processes all chains', () => {
    solver.addChain(makeChain('left', 2));
    solver.addChain(makeChain('right', 2));
    // Should not throw
    solver.solveAll();
  });

  // ---------------------------------------------------------------------------
  // Foot Placement
  // ---------------------------------------------------------------------------

  it('setFootPlacement updates config', () => {
    solver.setFootPlacement({ enabled: true, footOffset: 0.1 });
    const config = solver.getFootPlacement();
    expect(config.enabled).toBe(true);
    expect(config.footOffset).toBe(0.1);
  });

  it('getFootPlacement returns default config', () => {
    const config = solver.getFootPlacement();
    expect(config.enabled).toBe(false);
    expect(config.rayHeight).toBeGreaterThan(0);
  });

  it('updateFootPlacement returns position', () => {
    solver.setFootPlacement({ enabled: true });
    const pos = solver.updateFootPlacement('leftFoot', 0, 0.016);
    expect(pos).toHaveProperty('x');
    expect(pos).toHaveProperty('y');
    expect(pos).toHaveProperty('z');
  });
});
