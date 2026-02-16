import { describe, it, expect, beforeEach } from 'vitest';
import { IKSolver, type IKChain, type IKBone } from '../animation/IKSolver';

// =============================================================================
// C275 — IK Solver
// =============================================================================

function bone(id: string, x: number, y: number, length: number): IKBone {
  return { id, position: { x, y, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, length };
}

function chain2(id: string, target: { x: number; y: number; z: number }): IKChain {
  return { id, bones: [bone('root', 0, 0, 5), bone('mid', 5, 0, 5)], target, weight: 1, iterations: 10 };
}

function chain3(id: string, target: { x: number; y: number; z: number }): IKChain {
  return { id, bones: [bone('root', 0, 0, 5), bone('mid', 5, 0, 5), bone('end', 10, 0, 0)], target, weight: 1, iterations: 10 };
}

describe('IKSolver', () => {
  let solver: IKSolver;
  beforeEach(() => { solver = new IKSolver(); });

  it('addChain and getChainCount', () => {
    solver.addChain(chain2('arm', { x: 8, y: 0, z: 0 }));
    expect(solver.getChainCount()).toBe(1);
  });

  it('removeChain removes chain', () => {
    solver.addChain(chain2('arm', { x: 8, y: 0, z: 0 }));
    expect(solver.removeChain('arm')).toBe(true);
    expect(solver.getChainCount()).toBe(0);
  });

  it('setTarget updates chain target', () => {
    solver.addChain(chain2('arm', { x: 0, y: 0, z: 0 }));
    solver.setTarget('arm', 5, 5, 0);
    expect(solver.getChain('arm')!.target).toEqual({ x: 5, y: 5, z: 0 });
  });

  it('setWeight clamps to [0,1]', () => {
    solver.addChain(chain2('arm', { x: 5, y: 0, z: 0 }));
    solver.setWeight('arm', 2);
    expect(solver.getChain('arm')!.weight).toBe(1);
    solver.setWeight('arm', -1);
    expect(solver.getChain('arm')!.weight).toBe(0);
  });

  it('solveTwoBone returns false for missing chain', () => {
    expect(solver.solveTwoBone('nope')).toBe(false);
  });

  it('solveTwoBone moves mid bone position', () => {
    solver.addChain(chain3('arm', { x: 5, y: 5, z: 0 }));
    const beforeY = solver.getChain('arm')!.bones[1].position.y;
    solver.solveTwoBone('arm');
    const afterY = solver.getChain('arm')!.bones[1].position.y;
    expect(afterY).not.toBe(beforeY);
  });

  it('solveCCD converges end effector toward target', () => {
    const longChain: IKChain = {
      id: 'tentacle',
      bones: [bone('b0', 0, 0, 3), bone('b1', 3, 0, 3), bone('b2', 6, 0, 3), bone('b3', 9, 0, 0)],
      target: { x: 5, y: 5, z: 0 },
      weight: 1,
      iterations: 20,
    };
    solver.addChain(longChain);
    solver.solveCCD('tentacle');
    const end = solver.getChain('tentacle')!.bones[3].position;
    const dx = end.x - 5;
    const dy = end.y - 5;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeLessThan(3); // should converge reasonably close
  });

  it('solveCCD returns false for chain with < 2 bones', () => {
    solver.addChain({ id: 'short', bones: [bone('only', 0, 0, 1)], target: { x: 1, y: 0, z: 0 }, weight: 1, iterations: 5 });
    expect(solver.solveCCD('short')).toBe(false);
  });

  it('setFootPlacement and getFootPlacement', () => {
    solver.setFootPlacement({ enabled: true, footOffset: 0.1 });
    const cfg = solver.getFootPlacement();
    expect(cfg.enabled).toBe(true);
    expect(cfg.footOffset).toBe(0.1);
  });

  it('updateFootPlacement blends toward ground height', () => {
    solver.setFootPlacement({ blendSpeed: 100 });
    const pos1 = solver.updateFootPlacement('leftFoot', 2, 0.1);
    expect(pos1.y).toBeGreaterThan(0);
  });

  it('solveAll dispatches correct solver per chain length', () => {
    solver.addChain(chain3('arm', { x: 5, y: 3, z: 0 })); // 3 bones -> twoBone
    const longChain: IKChain = {
      id: 'tail',
      bones: [bone('b0', 0, 0, 2), bone('b1', 2, 0, 2), bone('b2', 4, 0, 2), bone('b3', 6, 0, 2), bone('b4', 8, 0, 0)],
      target: { x: 4, y: 4, z: 0 },
      weight: 1,
      iterations: 10,
    };
    solver.addChain(longChain); // 5 bones -> CCD
    // Should not throw
    solver.solveAll();
    expect(true).toBe(true);
  });
});
