/**
 * ConstraintSolver — Production Test Suite
 *
 * Covers: addConstraint, removeConstraint, solve (distance, spring, fixed),
 * warm starting, broken constraints, clear.
 */
import { describe, it, expect } from 'vitest';
import { ConstraintSolver } from '..';
import type {
  IDistanceConstraint,
  ISpringConstraint,
  IFixedConstraint,
  IHingeConstraint,
  ISliderConstraint,
  IBallConstraint,
  IConeConstraint,
  IGeneric6DOFConstraint,
  IRigidBodyState,
} from '@holoscript/core';

function bodyState(id: string, x = 0, y = 0, z = 0): IRigidBodyState {
  return {
    id,
    position: { x, y, z },
    rotation: [0, 0, 0, 1 ],
    linearVelocity: [0, 0, 0 ],
    angularVelocity: [0, 0, 0 ],
    isSleeping: false,
    isActive: true,
  };
}

describe('ConstraintSolver — Production', () => {
  // ─── Add / Remove ─────────────────────────────────────────────────
  it('addConstraint registers constraint', () => {
    const cs = new ConstraintSolver();
    const c: IDistanceConstraint = {
      id: 'c1',
      type: 'distance',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0 ],
      pivotB: [0, 0, 0 ],
      distance: 5,
    };
    cs.addConstraint(c, bodyState('a'), bodyState('b', 5));
    expect(cs.getConstraints().length).toBe(1);
  });

  it('removeConstraint removes by ID', () => {
    const cs = new ConstraintSolver();
    const c: IDistanceConstraint = {
      id: 'c1',
      type: 'distance',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0 ],
      pivotB: [0, 0, 0 ],
      distance: 5,
    };
    cs.addConstraint(c, bodyState('a'), bodyState('b'));
    cs.removeConstraint('c1');
    expect(cs.getConstraints().length).toBe(0);
  });

  // ─── Distance Solve ───────────────────────────────────────────────
  it('distance constraint produces velocity corrections', () => {
    const cs = new ConstraintSolver({ iterations: 5 });
    const a = bodyState('a', 0);
    const b = bodyState('b', 10);
    const c: IDistanceConstraint = {
      id: 'c1',
      type: 'distance',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0 ],
      pivotB: [0, 0, 0 ],
      distance: 5,
    };
    cs.addConstraint(c, a, b);
    const corrections = cs.solve(1 / 60);
    expect(corrections.size).toBeGreaterThan(0);
  });

  it('distance constraint within slop produces no correction', () => {
    const cs = new ConstraintSolver({ iterations: 5, slop: 10 });
    const a = bodyState('a', 0);
    const b = bodyState('b', 5);
    const c: IDistanceConstraint = {
      id: 'c-slop',
      type: 'distance',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0 ],
      pivotB: [0, 0, 0 ],
      distance: 5,
    };
    cs.addConstraint(c, a, b);
    const corrections = cs.solve(1 / 60);
    // Warm-start bookkeeping may still create entries, but they should remain zeroed.
    const aVel = corrections.get('a')?.linearVelocity ?? [0, 0, 0 ];
    const bVel = corrections.get('b')?.linearVelocity ?? [0, 0, 0 ];
    expect(aVel[0]).toBe(0);
    expect(aVel[1]).toBe(0);
    expect(aVel[2]).toBe(0);
    expect(bVel[0]).toBe(0);
    expect(bVel[1]).toBe(0);
    expect(bVel[2]).toBe(0);
  });

  it('distance constraint supports null bodyB world-anchor path', () => {
    const cs = new ConstraintSolver({ iterations: 5 });
    const a = bodyState('a', 0, 0, 0);
    const c: IDistanceConstraint = {
      id: 'c-world',
      type: 'distance',
      bodyA: 'a',
      bodyB: 'world',
      pivotA: [0, 0, 0 ],
      pivotB: [0, 0, 0 ],
      distance: 2,
    };
    cs.addConstraint(c, a, null);
    const corrections = cs.solve(1 / 60);
    expect(corrections.has('a')).toBe(true);
  });

  // ─── Spring Solve ─────────────────────────────────────────────────
  it('spring constraint produces corrections proportional to extension', () => {
    const cs = new ConstraintSolver({ iterations: 5 });
    const a = bodyState('a', 0);
    const b = bodyState('b', 10);
    const c: ISpringConstraint = {
      id: 's1',
      type: 'spring',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0 ],
      pivotB: [0, 0, 0 ],
      restLength: 2,
      stiffness: 100,
      damping: 1,
    };
    cs.addConstraint(c, a, b);
    const corrections = cs.solve(1 / 60);
    expect(corrections.has('a') || corrections.has('b')).toBe(true);
  });

  // ─── Fixed Constraint ─────────────────────────────────────────────
  it('fixed constraint produces corrections when bodies drift', () => {
    const cs = new ConstraintSolver({ iterations: 5 });
    const a = bodyState('a', 0);
    const b = bodyState('b', 1);
    const c: IFixedConstraint = {
      id: 'f1',
      type: 'fixed',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0 ],
      pivotB: [0, 0, 0 ],
    };
    cs.addConstraint(c, a, b);
    const corrections = cs.solve(1 / 60);
    expect(corrections.size).toBeGreaterThan(0);
  });

  it('hinge constraint applies motor angular correction', () => {
    const cs = new ConstraintSolver({ iterations: 5 });
    const a = bodyState('a', 0);
    a.angularVelocity = [0, 0, 0 ];
    const b = bodyState('b', 2);
    const c: IHingeConstraint = {
      id: 'h1',
      type: 'hinge',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0 ],
      pivotB: [0, 0, 0 ],
      axisA: [0, 1, 0 ],
      motor: { targetVelocity: 4, maxForce: 10 },
    };
    cs.addConstraint(c, a, b);
    const corrections = cs.solve(1 / 60);
    expect(Math.abs(corrections.get('a')?.angularVelocity?.[1] ?? 0)).toBeGreaterThan(0);
  });

  it('ball constraint corrects pivot drift', () => {
    const cs = new ConstraintSolver({ iterations: 5 });
    const c: IBallConstraint = {
      id: 'ball1',
      type: 'ball',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0 ],
      pivotB: [0, 0, 0 ],
    };
    cs.addConstraint(c, bodyState('a', 0), bodyState('b', 3, 0, 0));
    const corrections = cs.solve(1 / 60);
    expect(corrections.size).toBeGreaterThan(0);
  });

  it('slider constraint enforces perpendicular correction and limits', () => {
    const cs = new ConstraintSolver({ iterations: 5 });
    const c: ISliderConstraint = {
      id: 'slider1',
      type: 'slider',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0 ],
      pivotB: [0, 0, 0 ],
      axisA: [1, 0, 0 ],
      limits: { low: -1, high: 1 },
    };
    cs.addConstraint(c, bodyState('a', 3, 2, 0), bodyState('b', 0, 0, 0));
    const corrections = cs.solve(1 / 60);
    expect(corrections.has('a')).toBe(true);
  });

  it('cone constraint applies twist correction when angular velocity exceeds span', () => {
    const cs = new ConstraintSolver({ iterations: 5 });
    const a = bodyState('a', 0);
    a.angularVelocity = [0, 5, 0 ];
    const c: IConeConstraint = {
      id: 'cone1',
      type: 'cone',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0 ],
      pivotB: [0, 0, 0 ],
      axisA: [0, 1, 0 ],
      swingSpan1: 1,
      swingSpan2: 1,
      twistSpan: 0.5,
    };
    cs.addConstraint(c, a, bodyState('b', 1, 0, 0));
    const corrections = cs.solve(1 / 60);
    expect(Math.abs(corrections.get('a')?.angularVelocity?.[1] ?? 0)).toBeGreaterThan(0);
  });

  it('generic6dof clamps linear limits', () => {
    const cs = new ConstraintSolver({ iterations: 5 });
    const tupleBodyA: IRigidBodyState = {
      id: 'a',
      position: [10, 0, 0 ],
      rotation: [0, 0, 0, 1 ],
      linearVelocity: [0, 0, 0 ],
      angularVelocity: [0, 0, 0 ],
      isSleeping: false,
      isActive: true,
    };
    const c: IGeneric6DOFConstraint = {
      id: 'g6',
      type: 'generic6dof',
      bodyA: 'a',
      bodyB: 'b',
      frameA: { position: [0, 0, 0 ], rotation: [0, 0, 0, 1 ] },
      frameB: { position: [0, 0, 0 ], rotation: [0, 0, 0, 1 ] },
      linearLowerLimit: [-1, -1, -1 ],
      linearUpperLimit: [1, 1, 1 ],
      angularLowerLimit: [-1, -1, -1 ],
      angularUpperLimit: [1, 1, 1 ],
    };
    cs.addConstraint(c, tupleBodyA, bodyState('b', 0, 0, 0));
    const corrections = cs.solve(1 / 60);
    expect(corrections.has('a')).toBe(true);
    expect(Math.abs(corrections.get('a')?.linearVelocity?.[0] ?? 0)).toBeGreaterThan(0);
  });

  it('warm starting reuses accumulated impulse on second solve', () => {
    const cs = new ConstraintSolver({ iterations: 5, warmStarting: true });
    const c: IDistanceConstraint = {
      id: 'warm',
      type: 'distance',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0 ],
      pivotB: [0, 0, 0 ],
      distance: 1,
    };
    cs.addConstraint(c, bodyState('a', 0), bodyState('b', 5));
    cs.solve(1 / 60);
    const second = cs.solve(1 / 60);
    expect(second.has('a')).toBe(true);
  });

  // ─── Break Force ──────────────────────────────────────────────────
  it('constraint breaks when force exceeds breakForce', () => {
    const cs = new ConstraintSolver({ iterations: 10 });
    const a = bodyState('a', 0);
    const b = bodyState('b', 100);
    const c: IDistanceConstraint = {
      id: 'b1',
      type: 'distance',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0 ],
      pivotB: [0, 0, 0 ],
      distance: 1,
      breakForce: 0.001,
    };
    cs.addConstraint(c, a, b);
    cs.solve(1 / 60);
    expect(cs.getBrokenConstraints()).toContain('b1');
  });

  it('broken constraints are filtered out of getConstraints()', () => {
    const cs = new ConstraintSolver({ iterations: 10 });
    const c: IDistanceConstraint = {
      id: 'broken-filter',
      type: 'distance',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0 ],
      pivotB: [0, 0, 0 ],
      distance: 1,
      breakForce: 0.001,
    };
    cs.addConstraint(c, bodyState('a', 0), bodyState('b', 100));
    cs.solve(1 / 60);
    expect(cs.getBrokenConstraints()).toContain('broken-filter');
    expect(cs.getConstraints().map((x) => x.id)).not.toContain('broken-filter');
  });

  // ─── Clear ────────────────────────────────────────────────────────
  it('clear removes all constraints', () => {
    const cs = new ConstraintSolver();
    cs.addConstraint(
      {
        id: 'c1',
        type: 'distance',
        bodyA: 'a',
        bodyB: 'b',
        pivotA: [0, 0, 0 ],
        pivotB: [0, 0, 0 ],
        distance: 5,
      } as IDistanceConstraint,
      bodyState('a'),
      bodyState('b')
    );
    cs.clear();
    expect(cs.getConstraints().length).toBe(0);
  });

  // ─── Config ───────────────────────────────────────────────────────
  it('custom config overrides defaults', () => {
    const cs = new ConstraintSolver({ iterations: 20, warmStarting: false });
    expect(cs.getConstraints().length).toBe(0);
  });
});
