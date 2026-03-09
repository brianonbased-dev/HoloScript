import { describe, it, expect, beforeEach } from 'vitest';
import { IKSolver, type IKChain, type IKBone } from '../IKSolver';

function bone(id: string, x: number, y: number, z: number, length: number): IKBone {
  return { id, position: { x, y, z }, rotation: { x: 0, y: 0, z: 0, w: 1 }, length };
}

function chain(id: string, bones: IKBone[], tx: number, ty: number, tz: number): IKChain {
  return { id, bones, target: { x: tx, y: ty, z: tz }, weight: 1, iterations: 10 };
}

describe('IKSolver', () => {
  let solver: IKSolver;

  beforeEach(() => {
    solver = new IKSolver();
  });

  // ---------------------------------------------------------------------------
  // Chain Management
  // ---------------------------------------------------------------------------

  it('addChain registers a chain', () => {
    solver.addChain(chain('arm', [bone('upper', 0, 0, 0, 3), bone('lower', 0, 3, 0, 3)], 0, 6, 0));
    expect(solver.getChainCount()).toBe(1);
  });

  it('removeChain unregisters a chain', () => {
    solver.addChain(chain('arm', [bone('a', 0, 0, 0, 1)], 0, 1, 0));
    expect(solver.removeChain('arm')).toBe(true);
    expect(solver.getChainCount()).toBe(0);
  });

  it('getChain retrieves by id', () => {
    solver.addChain(chain('leg', [bone('a', 0, 0, 0, 2)], 0, 2, 0));
    expect(solver.getChain('leg')).toBeDefined();
    expect(solver.getChain('nonexistent')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Target & Weight
  // ---------------------------------------------------------------------------

  it('setTarget updates chain target', () => {
    solver.addChain(chain('arm', [bone('a', 0, 0, 0, 3), bone('b', 0, 3, 0, 3)], 0, 6, 0));
    solver.setTarget('arm', 5, 5, 0);
    expect(solver.getChain('arm')!.target).toEqual({ x: 5, y: 5, z: 0 });
  });

  it('setWeight updates chain weight', () => {
    solver.addChain(chain('arm', [bone('a', 0, 0, 0, 3)], 0, 3, 0));
    solver.setWeight('arm', 0.5);
    expect(solver.getChain('arm')!.weight).toBe(0.5);
  });

  it('setPoleTarget updates pole target', () => {
    solver.addChain(chain('arm', [bone('a', 0, 0, 0, 3), bone('b', 0, 3, 0, 3)], 0, 6, 0));
    solver.setPoleTarget('arm', 1, 3, 0);
    expect(solver.getChain('arm')!.poleTarget).toEqual({ x: 1, y: 3, z: 0 });
  });

  // ---------------------------------------------------------------------------
  // Two-bone IK
  // ---------------------------------------------------------------------------

  it('solveTwoBone returns true for reachable target', () => {
    solver.addChain(chain('arm', [bone('upper', 0, 0, 0, 3), bone('lower', 0, 3, 0, 3)], 0, 5, 0));
    expect(solver.solveTwoBone('arm')).toBe(true);
  });

  it('solveTwoBone returns false for nonexistent chain', () => {
    expect(solver.solveTwoBone('ghost')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // CCD
  // ---------------------------------------------------------------------------

  it('solveCCD works with multi-bone chain', () => {
    const bones = [bone('b0', 0, 0, 0, 2), bone('b1', 0, 2, 0, 2), bone('b2', 0, 4, 0, 2)];
    solver.addChain(chain('tentacle', bones, 0, 5, 0));
    expect(solver.solveCCD('tentacle')).toBe(true);
  });

  it('solveCCD returns false for nonexistent chain', () => {
    expect(solver.solveCCD('ghost')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Foot Placement
  // ---------------------------------------------------------------------------

  it('setFootPlacement / getFootPlacement', () => {
    solver.setFootPlacement({ enabled: true, footOffset: 0.1 });
    const fp = solver.getFootPlacement();
    expect(fp.enabled).toBe(true);
    expect(fp.footOffset).toBe(0.1);
  });

  it('updateFootPlacement returns position', () => {
    solver.addChain(chain('foot', [bone('ankle', 0, 1, 0, 1)], 0, 0, 0));
    solver.setFootPlacement({ enabled: true });
    const pos = solver.updateFootPlacement('foot', 0, 0.016);
    expect(pos).toBeDefined();
    expect(typeof pos.y).toBe('number');
  });

  // ---------------------------------------------------------------------------
  // Solve All
  // ---------------------------------------------------------------------------

  it('solveAll processes all chains', () => {
    solver.addChain(chain('a', [bone('a1', 0, 0, 0, 2), bone('a2', 0, 2, 0, 2)], 0, 3, 0));
    solver.addChain(chain('b', [bone('b1', 5, 0, 0, 2), bone('b2', 5, 2, 0, 2)], 5, 3, 0));
    // Should not throw
    solver.solveAll();
    expect(solver.getChainCount()).toBe(2);
  });
});
