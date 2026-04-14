import { describe, it, expect } from 'vitest';
import { AnimClip } from '@holoscript/engine/animation/AnimationClip';
import { IKSolver, IKBone, IKChain } from '@holoscript/engine/animation/IKSolver';

describe('Cycle 137: AnimationClip & IKSolver', () => {
  // -------------------------------------------------------------------------
  // AnimClip
  // -------------------------------------------------------------------------

  it('should sample linear keyframes', () => {
    const clip = new AnimClip('walk', 'Walk', 2);
    clip.addTrack({
      id: 't1',
      targetPath: 'root',
      property: 'position',
      component: 'y',
      interpolation: 'linear',
      keyframes: [
        { time: 0, value: 0 },
        { time: 2, value: 10 },
      ],
    });

    const mid = clip.sample(1);
    expect(mid.get('root.position[1]')).toBeCloseTo(5, 0);

    const end = clip.sample(2);
    expect(end.get('root.position[1]')).toBeCloseTo(10, 0);
  });

  it('should fire events in time range', () => {
    const clip = new AnimClip('run', 'Run', 3);
    clip.addEvent(1, 'footstep', { foot: 'left' });
    clip.addEvent(2, 'footstep', { foot: 'right' });

    const events = clip.getEventsInRange(0.5, 1.5);
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('footstep');
  });

  it('should blend two clips', () => {
    const a = new Map([['pos.y', 0]]);
    const b = new Map([['pos.y', 10]]);

    const blended = AnimClip.blend(a, b, 0.5);
    expect(blended.get('pos.y')).toBeCloseTo(5, 0);
  });

  it('should support step interpolation', () => {
    const clip = new AnimClip('step', 'Step', 2);
    clip.addTrack({
      id: 't1',
      targetPath: 'root',
      property: 'frame',
      component: undefined,
      interpolation: 'step',
      keyframes: [
        { time: 0, value: 0 },
        { time: 1, value: 5 },
        { time: 2, value: 10 },
      ],
    });

    expect(clip.sample(0.5).get('root.frame')).toBe(0); // Step holds value
    expect(clip.sample(1.5).get('root.frame')).toBe(5);
  });

  // -------------------------------------------------------------------------
  // IKSolver
  // -------------------------------------------------------------------------

  it('should solve two-bone IK toward target', () => {
    const solver = new IKSolver();
    const bones: IKBone[] = [
      {
        id: 'upper',
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1 ],
        length: 5,
      },
      {
        id: 'lower',
        position: [5, 0, 0],
        rotation: [0, 0, 0, 1 ],
        length: 5,
      },
      {
        id: 'end',
        position: [10, 0, 0],
        rotation: [0, 0, 0, 1 ],
        length: 0,
      },
    ];

    solver.addChain({ id: 'arm', bones, target: { x: 7, y: 3, z: 0 }, weight: 1, iterations: 10 });
    const result = solver.solveTwoBone('arm');
    expect(result).toBe(true);

    const chain = solver.getChain('arm')!;
    // End effector should have moved toward target
    expect(chain.bones[2].position[0]).not.toBe(10);
  });

  it('should solve CCD chain solver', () => {
    const solver = new IKSolver();
    const bones: IKBone[] = [];
    for (let i = 0; i < 5; i++) {
      bones.push({
        id: `bone${i}`,
        length: 2,
        position: [i * 2, 0, 0],
        rotation: [0, 0, 0, 1 ],
      });
    }

    solver.addChain({ id: 'tail', bones, target: { x: 4, y: 4, z: 0 }, weight: 1, iterations: 20 });
    solver.solveCCD('tail');

    const chain = solver.getChain('tail')!;
    const end = chain.bones[chain.bones.length - 1].position;
    const dx = end[0] - 4,
      dy = end[1] - 4;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeLessThan(3); // Should be reasonably close
  });

  it('should handle foot placement blending', () => {
    const solver = new IKSolver();
    solver.setFootPlacement({ enabled: true, blendSpeed: 10, footOffset: 0.1 });

    const pos1 = solver.updateFootPlacement('left_foot', 0, 0.1);
    expect(pos1.y).toBeGreaterThan(0);

    const pos2 = solver.updateFootPlacement('left_foot', 0, 0.1);
    expect(pos2.y).toBeCloseTo(0.1, 0); // Settling toward footOffset
  });

  it('should solve all chains at once', () => {
    const solver = new IKSolver();
    const makeBones = (): IKBone[] => [
      { id: 'a', position: [0, 0, 0], rotation: [0, 0, 0, 1 ], length: 3 },
      { id: 'b', position: [3, 0, 0], rotation: [0, 0, 0, 1 ], length: 3 },
      { id: 'c', position: [6, 0, 0], rotation: [0, 0, 0, 1 ], length: 0 },
    ];

    solver.addChain({
      id: 'left',
      bones: makeBones(),
      target: { x: 4, y: 2, z: 0 },
      weight: 1,
      iterations: 10,
    });
    solver.addChain({
      id: 'right',
      bones: makeBones(),
      target: { x: 4, y: -2, z: 0 },
      weight: 1,
      iterations: 10,
    });

    solver.solveAll();
    expect(solver.getChainCount()).toBe(2);
  });
});
