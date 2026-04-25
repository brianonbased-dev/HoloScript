import { describe, it, expect, beforeEach } from 'vitest';
import { ConstraintSolver } from '@holoscript/engine/physics/ConstraintSolver';
import type {
  IDistanceConstraint,
  ISpringConstraint,
  IRigidBodyState,
} from '@holoscript/engine/physics/PhysicsTypes';

// =============================================================================
// C257 — Constraint Solver
// =============================================================================

function body(id: string, x = 0, y = 0, z = 0): IRigidBodyState {
  return {
    id,
    position: [x, y, z],
    rotation: [0, 0, 0, 1 ],
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    mass: 1,
    inverseMass: 1,
    inertia: [1, 1, 1],
    inverseInertia: [1, 1, 1],
    friction: 0.5,
    restitution: 0.3,
    sleeping: false,
  };
}

describe('ConstraintSolver', () => {
  let solver: ConstraintSolver;
  beforeEach(() => {
    solver = new ConstraintSolver();
  });

  it('constructor creates with default config', () => {
    expect(solver.getConstraints()).toHaveLength(0);
  });

  it('addConstraint and getConstraints', () => {
    const c: IDistanceConstraint = {
      id: 'c1',
      type: 'distance',
      bodyAId: 'a',
      bodyBId: 'b',
      pivotA: [0, 0, 0],
      distance: 5,
      stiffness: 1,
    };
    solver.addConstraint(c, body('a'), body('b', 5, 0, 0));
    expect(solver.getConstraints()).toHaveLength(1);
    expect(solver.getConstraints()[0].id).toBe('c1');
  });

  it('removeConstraint deletes by id', () => {
    const c: IDistanceConstraint = {
      id: 'c1',
      type: 'distance',
      bodyAId: 'a',
      pivotA: [0, 0, 0],
      distance: 5,
      stiffness: 1,
    };
    solver.addConstraint(c, body('a'));
    expect(solver.removeConstraint('c1')).toBe(true);
    expect(solver.getConstraints()).toHaveLength(0);
  });

  it('removeConstraint returns false for unknown', () => {
    expect(solver.removeConstraint('nope')).toBe(false);
  });

  it('solve returns velocity corrections map', () => {
    const c: IDistanceConstraint = {
      id: 'c1',
      type: 'distance',
      bodyAId: 'a',
      bodyBId: 'b',
      pivotA: [0, 0, 0],
      distance: 2,
      stiffness: 1,
    };
    solver.addConstraint(c, body('a'), body('b', 5, 0, 0));
    const corrections = solver.solve(1 / 60);
    expect(corrections.size).toBeGreaterThan(0);
  });

  it('distance constraint pushes bodies toward target distance', () => {
    const a = body('a', 0, 0, 0);
    const b = body('b', 10, 0, 0);
    const c: IDistanceConstraint = {
      id: 'd1',
      type: 'distance',
      bodyAId: 'a',
      bodyBId: 'b',
      pivotA: [0, 0, 0],
      distance: 5,
      stiffness: 1,
    };
    solver.addConstraint(c, a, b);
    const corrections = solver.solve(1 / 60);
    // A should get pushed toward B (+x) and B away (-x)
    const corrA = corrections.get('a');
    const corrB = corrections.get('b');
    expect(corrA!.linearVelocity[0]).toBeGreaterThan(0);
    expect(corrB!.linearVelocity[0]).toBeLessThan(0);
  });

  it('spring constraint produces forces', () => {
    const a = body('a', 0, 0, 0);
    const b = body('b', 3, 0, 0);
    const c: ISpringConstraint = {
      id: 's1',
      type: 'spring',
      bodyAId: 'a',
      bodyBId: 'b',
      pivotA: [0, 0, 0],
      restLength: 1,
      stiffness: 100,
      damping: 5,
    };
    solver.addConstraint(c, a, b);
    const corrections = solver.solve(1 / 60);
    expect(corrections.has('a')).toBe(true);
  });

  it('breakForce breaks constraint when exceeded', () => {
    const a = body('a', 0, 0, 0);
    const b = body('b', 100, 0, 0); // huge distance = huge force
    const c: IDistanceConstraint = {
      id: 'br1',
      type: 'distance',
      bodyAId: 'a',
      bodyBId: 'b',
      pivotA: [0, 0, 0],
      distance: 1,
      stiffness: 1,
      breakForce: 0.001, // very low threshold
    };
    solver.addConstraint(c, a, b);
    solver.solve(1 / 60);
    expect(solver.getBrokenConstraints()).toContain('br1');
  });

  it('getBrokenConstraints empty initially', () => {
    expect(solver.getBrokenConstraints()).toHaveLength(0);
  });

  it('clear removes all constraints', () => {
    const c: IDistanceConstraint = {
      id: 'c1',
      type: 'distance',
      bodyAId: 'a',
      pivotA: [0, 0, 0],
      distance: 5,
      stiffness: 1,
    };
    solver.addConstraint(c, body('a'));
    solver.clear();
    expect(solver.getConstraints()).toHaveLength(0);
  });

  it('warm starting reuses accumulated impulses', () => {
    const a = body('a');
    const b = body('b', 5, 0, 0);
    const c: IDistanceConstraint = {
      id: 'w1',
      type: 'distance',
      bodyAId: 'a',
      bodyBId: 'b',
      pivotA: [0, 0, 0],
      distance: 2,
      stiffness: 1,
    };
    solver.addConstraint(c, a, b);
    solver.solve(1 / 60);
    // 2nd solve should also produce corrections (warm start builds on previous)
    const corrections2 = solver.solve(1 / 60);
    expect(corrections2.size).toBeGreaterThan(0);
  });
});
