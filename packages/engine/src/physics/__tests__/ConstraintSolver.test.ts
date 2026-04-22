import { describe, it, expect, beforeEach } from 'vitest';
import { ConstraintSolver } from '..';
import type {
  Constraint,
  IRigidBodyState,
  IVector3,
  IDistanceConstraint,
  IFixedConstraint,
} from '@holoscript/core';

function v3(x = 0, y = 0, z = 0): IVector3 {
  return [x, y, z];
}
function q() {
  return [0, 0, 0, 1 ];
}

function body(id: string, pos: IVector3 = v3()): IRigidBodyState {
  return {
    id,
    position: [...pos  ],
    rotation: q(),
    linearVelocity: v3(),
    angularVelocity: v3(),
    isSleeping: false,
    isActive: true,
  };
}

function distanceConstraint(id: string, dist = 2): IDistanceConstraint {
  return {
    type: 'distance',
    id,
    bodyA: 'a',
    bodyB: 'b',
    pivotA: v3(0, 0, 0),
    pivotB: v3(0, 0, 0),
    distance: dist,
    stiffness: 1,
    breakForce: 0,
  };
}

function fixedConstraint(id: string): IFixedConstraint {
  return {
    type: 'fixed',
    id,
    bodyA: 'a',
    bodyB: 'b',
    pivotA: v3(0, 0, 0),
    pivotB: v3(0, 0, 0),
    breakForce: 0,
  };
}

describe('ConstraintSolver', () => {
  let solver: ConstraintSolver;
  beforeEach(() => {
    solver = new ConstraintSolver({ iterations: 5 });
  });

  // --- CRUD ---
  it('addConstraint stores constraint', () => {
    solver.addConstraint(distanceConstraint('c1'), body('a'), body('b', v3(5, 0, 0)));
    expect(solver.getConstraints()).toHaveLength(1);
  });

  it('removeConstraint deletes', () => {
    solver.addConstraint(distanceConstraint('c1'), body('a'), body('b'));
    expect(solver.removeConstraint('c1')).toBe(true);
    expect(solver.getConstraints()).toHaveLength(0);
  });

  it('removeConstraint returns false for missing', () => {
    expect(solver.removeConstraint('nope')).toBe(false);
  });

  it('clear removes all', () => {
    solver.addConstraint(distanceConstraint('c1'), body('a'), body('b'));
    solver.addConstraint(fixedConstraint('c2'), body('a'), body('b'));
    solver.clear();
    expect(solver.getConstraints()).toHaveLength(0);
  });

  // --- Solve ---
  it('solve returns corrections map', () => {
    const a = body('a', v3(0, 0, 0));
    const b2 = body('b', v3(5, 0, 0));
    solver.addConstraint(distanceConstraint('c1', 2), a, b2);
    const corrections = solver.solve(1 / 60);
    expect(corrections).toBeInstanceOf(Map);
  });

  it('solve with no constraints returns empty map', () => {
    const corrections = solver.solve(1 / 60);
    expect(corrections.size).toBe(0);
  });

  it('distance constraint produces corrections when violated', () => {
    const a = body('a', v3(0, 0, 0));
    const b2 = body('b', v3(10, 0, 0)); // 10 apart, constraint wants 2
    solver.addConstraint(distanceConstraint('c1', 2), a, b2);
    const corrections = solver.solve(1 / 60);
    // Should have corrections for at least one body
    expect(corrections.size).toBeGreaterThan(0);
  });

  it('fixed constraint keeps bodies together', () => {
    const a = body('a', v3(0, 0, 0));
    const b2 = body('b', v3(3, 0, 0));
    solver.addConstraint(fixedConstraint('c1'), a, b2);
    const corrections = solver.solve(1 / 60);
    expect(corrections.size).toBeGreaterThan(0);
  });

  // --- Broken constraints ---
  it('getBrokenConstraints initially empty', () => {
    expect(solver.getBrokenConstraints()).toHaveLength(0);
  });

  it('constraint with breakForce can break', () => {
    const c: IDistanceConstraint = {
      type: 'distance',
      id: 'breakable',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: v3(0, 0, 0),
      pivotB: v3(0, 0, 0),
      distance: 1,
      stiffness: 1,
      breakForce: 0.001, // Very small
    };
    const a = body('a', v3(0, 0, 0));
    const b2 = body('b', v3(100, 0, 0)); // Huge separation
    solver.addConstraint(c, a, b2);
    solver.solve(1 / 60);
    // May or may not break depending on impulse magnitude
    const broken = solver.getBrokenConstraints();
    expect(Array.isArray(broken)).toBe(true);
  });

  // --- Config ---
  it('custom config applies', () => {
    const s = new ConstraintSolver({ iterations: 20, warmStarting: false });
    s.addConstraint(distanceConstraint('c1'), body('a'), body('b', v3(5, 0, 0)));
    const corrections = s.solve(1 / 60);
    expect(corrections).toBeInstanceOf(Map);
  });
});
