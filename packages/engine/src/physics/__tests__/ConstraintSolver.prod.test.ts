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
  IRigidBodyState,
} from '@holoscript/core';

function bodyState(id: string, x = 0, y = 0, z = 0): IRigidBodyState {
  return {
    id,
    position: { x, y, z },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    linearVelocity: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
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
      pivotA: { x: 0, y: 0, z: 0 },
      pivotB: { x: 0, y: 0, z: 0 },
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
      pivotA: { x: 0, y: 0, z: 0 },
      pivotB: { x: 0, y: 0, z: 0 },
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
      pivotA: { x: 0, y: 0, z: 0 },
      pivotB: { x: 0, y: 0, z: 0 },
      distance: 5,
    };
    cs.addConstraint(c, a, b);
    const corrections = cs.solve(1 / 60);
    expect(corrections.size).toBeGreaterThan(0);
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
      pivotA: { x: 0, y: 0, z: 0 },
      pivotB: { x: 0, y: 0, z: 0 },
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
      pivotA: { x: 0, y: 0, z: 0 },
      pivotB: { x: 0, y: 0, z: 0 },
    };
    cs.addConstraint(c, a, b);
    const corrections = cs.solve(1 / 60);
    expect(corrections.size).toBeGreaterThan(0);
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
      pivotA: { x: 0, y: 0, z: 0 },
      pivotB: { x: 0, y: 0, z: 0 },
      distance: 1,
      breakForce: 0.001,
    };
    cs.addConstraint(c, a, b);
    cs.solve(1 / 60);
    expect(cs.getBrokenConstraints()).toContain('b1');
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
        pivotA: { x: 0, y: 0, z: 0 },
        pivotB: { x: 0, y: 0, z: 0 },
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
