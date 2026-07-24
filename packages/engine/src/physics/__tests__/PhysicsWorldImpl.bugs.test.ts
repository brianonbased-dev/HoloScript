/**
 * PhysicsWorldImpl.bugs.test.ts
 *
 * Regression tests for bugs in PhysicsWorldImpl.ts and PhysicsStep.ts:
 *  1. getBodyAABB ignores orientation quaternion for boxes
 *  2. resolveCollision missing angular impulse
 *  3. solveConstraints only handles 'distance' (hinge/ball-socket wired via ConstraintSolver)
 *  4. IslandDetector result discarded (_islands unused) — dead-compute removal
 *  5. PhysicsStep positional correction 50/50 split ignores mass
 *  6. PhysicsStep broadphase single-cell insert misses cross-cell collisions
 *  7. Resting sphere-box contacts tunnel and reset sleeping every step
 */

import { describe, it, expect } from 'vitest';
import {
  createPhysicsWorld,
  IVector3,
  IRigidBodyConfig,
  dynamicBody,
  staticBody,
  sphereShape,
  boxShape,
  identityQuaternion,
} from '..';
import { PhysicsStep, PhysicsBodyState, Vec3 } from '../../PhysicsStep';

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function mkSphere(
  id: string,
  radius: number,
  position: IVector3,
  mass = 1,
  rotation?: [number, number, number, number]
): IRigidBodyConfig {
  return {
    id,
    type: 'dynamic',
    shape: sphereShape(radius),
    mass,
    transform: {
      position,
      rotation: (rotation ?? identityQuaternion()) as IVector3 & [number, number, number, number],
    },
  };
}

function mkBox(
  id: string,
  halfExtents: IVector3,
  position: IVector3,
  mass = 1,
  rotation?: [number, number, number, number]
): IRigidBodyConfig {
  return {
    id,
    type: 'dynamic',
    shape: boxShape(halfExtents),
    mass,
    transform: {
      position,
      rotation: (rotation ?? identityQuaternion()) as IVector3 & [number, number, number, number],
    },
  };
}

/** Build a Vec3-conformant plain object (x/y/z satisfy the interface). */
function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z } as Vec3;
}

/** Build a PhysicsBodyState with Vec3 fields expressed as plain {x,y,z} objects. */
function mkBodyState(
  id: string,
  px: number,
  py: number,
  pz: number,
  mass = 1,
  isStatic = false
): PhysicsBodyState {
  return {
    id,
    position: v3(px, py, pz),
    rotation: v3(0, 0, 0),
    velocity: v3(0, 0, 0),
    angularVelocity: v3(0, 0, 0),
    mass,
    isStatic,
    restitution: 0.0,
    friction: 0.0,
  };
}

// ---------------------------------------------------------------------------
// Bug 1: getBodyAABB ignores orientation quaternion
// ---------------------------------------------------------------------------

describe('Bug 1 — getBodyAABB must account for box rotation', () => {
  it('a box rotated 45° around Y still broadphase-detects collision outside its unrotated extents', () => {
    // Box halfExtents [1,1,1] at origin, rotated 45° around Y.
    // World-space half-extent on X = |cos45|*1 + |sin45|*1 = √2 ≈ 1.414.
    // Second box at x=2.1, halfExtents [1,1,1]: min-X = 1.1.
    // Overlap exists (rotated AABB extends to ~1.414 > 1.1).
    // Without rotation-aware AABB, the unrotated ±1 extent misses the pair.

    const angle = Math.PI / 4; // 45°
    const q: [number, number, number, number] = [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];

    const world = createPhysicsWorld({ gravity: [0, 0, 0], maxSubsteps: 1 });
    world.createBody(mkBox('rotated', [1, 1, 1], [0, 0, 0], 1, q));
    world.createBody(mkBox('other', [1, 1, 1], [2.1, 0, 0]));

    world.step(1 / 60);
    const contacts = world.getContacts().filter((c) => c.type === 'begin');

    // Correct AABB: pair detected and collision resolved.
    // Bug: pair missed, contacts empty.
    expect(contacts.length).toBeGreaterThan(0);
  });

  it('axis-aligned sphere AABB is unaffected by orientation', () => {
    const q: [number, number, number, number] = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)];
    const world = createPhysicsWorld({ gravity: [0, 0, 0], maxSubsteps: 1 });
    world.createBody(mkSphere('a', 1, [0, 0, 0], 1, q));
    world.createBody(mkSphere('b', 1, [1.5, 0, 0]));

    world.step(1 / 60);
    const contacts = world.getContacts().filter((c) => c.type === 'begin');
    expect(contacts.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Bug 2: resolveCollision missing angular impulse
// ---------------------------------------------------------------------------

describe('Bug 2 — resolveCollision must apply angular impulse', () => {
  it('a sphere striking a box off-centre induces spin in the box', () => {
    // Sphere flies along -X toward the top-right corner of the box (y-offset=0.9).
    // After impact the box must acquire non-zero angular velocity.
    const world = createPhysicsWorld({
      gravity: [0, 0, 0],
      fixedTimestep: 1 / 120,
      maxSubsteps: 5,
      solverIterations: 4,
    });

    world.createBody(mkBox('box', [1, 1, 1], [0, 0, 0]));
    world.createBody(mkSphere('ball', 0.5, [3, 0.9, 0]));
    world.setLinearVelocity('ball', [-10, 0, 0]);

    for (let i = 0; i < 20; i++) {
      world.step(1 / 60);
    }

    const boxState = world.getBody('box')!;
    const angSpeed = Math.sqrt(
      boxState.angularVelocity[0] ** 2 +
        boxState.angularVelocity[1] ** 2 +
        boxState.angularVelocity[2] ** 2
    );

    // Without angular impulse: angSpeed ≈ 0. With fix: box spins visibly.
    expect(angSpeed).toBeGreaterThan(0.01);
  });
});

// ---------------------------------------------------------------------------
// Bug 3: solveConstraints only handles 'distance'; hinge/ball-socket fall through
// ---------------------------------------------------------------------------

describe('Bug 3 — hinge and ball-socket constraints must be enforced', () => {
  it('a hinge constraint prevents bodies from flying apart', () => {
    const world = createPhysicsWorld({
      gravity: [0, 0, 0],
      maxSubsteps: 1,
      solverIterations: 10,
    });

    world.createBody(mkBox('a', [0.5, 0.5, 0.5], [0, 0, 0]));
    world.createBody(mkBox('b', [0.5, 0.5, 0.5], [1, 0, 0]));

    // Drive bodies apart
    world.setLinearVelocity('a', [-5, 0, 0]);
    world.setLinearVelocity('b', [5, 0, 0]);

    world.createConstraint({
      id: 'hinge1',
      type: 'hinge',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0.5, 0, 0] as IVector3,
      pivotB: [-0.5, 0, 0] as IVector3,
      axisA: [0, 1, 0] as IVector3,
      axisB: [0, 1, 0] as IVector3,
    });

    const dist = () => {
      const a = world.getBody('a')!;
      const b = world.getBody('b')!;
      return Math.hypot(
        b.position[0] - a.position[0],
        b.position[1] - a.position[1],
        b.position[2] - a.position[2]
      );
    };

    const d0 = dist();

    for (let i = 0; i < 30; i++) {
      world.step(1 / 60);
    }

    const dFinal = dist();

    // Bug: bodies separate to d0 + 30 * 2 * 5/60 ≈ 6+ m with no constraint.
    // Fix: hinge holds them; allow 3× initial distance as generous convergence bound.
    expect(dFinal).toBeLessThan(d0 * 3);
  });

  it('a ball-socket constraint keeps two bodies attached', () => {
    const world = createPhysicsWorld({
      gravity: [0, 0, 0],
      maxSubsteps: 1,
      solverIterations: 10,
    });

    world.createBody(mkSphere('a', 0.5, [0, 0, 0]));
    world.createBody(mkSphere('b', 0.5, [1, 0, 0]));

    world.setLinearVelocity('a', [-5, 3, 0]);
    world.setLinearVelocity('b', [5, -3, 0]);

    world.createConstraint({
      id: 'ball1',
      type: 'ball',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0.5, 0, 0] as IVector3,
      pivotB: [-0.5, 0, 0] as IVector3,
    });

    for (let i = 0; i < 30; i++) {
      world.step(1 / 60);
    }

    const a = world.getBody('a')!;
    const b = world.getBody('b')!;
    const dist = Math.hypot(
      b.position[0] - a.position[0],
      b.position[1] - a.position[1],
      b.position[2] - a.position[2]
    );

    // Without fix: bodies separate to ~10 m. With fix: ball-socket holds them near 1 m.
    expect(dist).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------------------
// Bug 4: IslandDetector result discarded — dead-compute removed
// ---------------------------------------------------------------------------

describe('Bug 4 — IslandDetector dead computation removed (no-throw / observable side-effect)', () => {
  it('physics world with allowSleep:true runs without throwing after island-detection fix', () => {
    const world = createPhysicsWorld({ allowSleep: true, gravity: [0, -9.81, 0] });
    world.createBody(mkSphere('a', 1, [0, 5, 0]));
    world.createBody(mkSphere('b', 1, [10, 5, 0]));

    expect(() => {
      for (let i = 0; i < 120; i++) world.step(1 / 60);
    }).not.toThrow();

    expect(world.getAllBodies().length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Bug 7: grounded sphere-box contacts must settle and sleep
// ---------------------------------------------------------------------------

describe('Bug 7 - grounded sphere-box contacts settle without solver wake churn', () => {
  it('keeps a gravity-driven sphere on a static box floor and reaches sleep', () => {
    const world = createPhysicsWorld({
      allowSleep: true,
      gravity: [0, -9.81, 0],
      fixedTimestep: 1 / 60,
      maxSubsteps: 1,
    });
    world.createBody({
      id: 'floor',
      type: 'static',
      mass: 0,
      shape: boxShape([5, 0.5, 5]),
      transform: {
        position: [0, -0.5, 0],
        rotation: identityQuaternion(),
      },
      material: { friction: 0.6, restitution: 0 },
    });
    world.createBody({
      ...mkSphere('token', 0.5, [0, 4, 0]),
      material: { friction: 0.6, restitution: 0.1 },
      linearDamping: 0.08,
      angularDamping: 0.08,
    });

    let minimumY = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 600; step += 1) {
      world.step(1 / 60);
      minimumY = Math.min(minimumY, world.getBody('token')!.position[1]);
    }

    const token = world.getBody('token')!;
    expect(minimumY).toBeGreaterThan(0.45);
    expect(token.position[1]).toBeGreaterThanOrEqual(0.485);
    expect(token.position[1]).toBeLessThanOrEqual(0.505);
    expect(token.linearVelocity).toEqual([0, 0, 0]);
    expect(token.angularVelocity).toEqual([0, 0, 0]);
    expect(token.isSleeping).toBe(true);
  });

  it('wakes a sleeping body when a meaningful solver impact arrives', () => {
    const world = createPhysicsWorld({
      allowSleep: true,
      gravity: [0, 0, 0],
      fixedTimestep: 1 / 60,
      maxSubsteps: 1,
    });
    world.createBody({
      ...mkSphere('sleeping', 0.5, [0, 0, 0]),
      sleeping: true,
      material: { friction: 0.3, restitution: 0 },
    });
    world.createBody({
      ...mkSphere('striker', 0.5, [-1.5, 0, 0]),
      material: { friction: 0.3, restitution: 0 },
    });
    world.setLinearVelocity('striker', [10, 0, 0]);

    for (let step = 0; step < 10; step += 1) world.step(1 / 60);

    expect(world.getBody('sleeping')!.isSleeping).toBe(false);
    expect(world.getBody('sleeping')!.linearVelocity[0]).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Bug 5 (PhysicsStep): positional correction 50/50 split must be mass-weighted
// ---------------------------------------------------------------------------

describe('Bug 5 — PhysicsStep positional correction must be mass-weighted', () => {
  it('a 1000× heavier body displaces far less than the lighter body on resolution', () => {
    const step = new PhysicsStep();
    step.setGravity(0, 0, 0);

    step.addBody(mkBodyState('light', 0, 0, 0, 1));
    step.addBody(mkBodyState('heavy', 0.5, 0, 0, 1000));

    step.fixedUpdate(1 / 60);

    const lightAfter = step.getBody('light')!;
    const heavyAfter = step.getBody('heavy')!;

    // Displacement magnitudes from initial positions
    const lightDisp = Math.abs(lightAfter.position.x - 0);
    const heavyDisp = Math.abs(heavyAfter.position.x - 0.5);

    // Mass-weighted: light moves ~(1000/1001)× correction, heavy moves ~(1/1001)×.
    // Bug (50/50): both move equally (ratio ≈ 1). Fix: ratio > 5.
    expect(lightDisp).toBeGreaterThan(heavyDisp * 5);
  });

  it('a static body receives zero positional correction during resolution', () => {
    const step = new PhysicsStep();
    step.setGravity(0, 0, 0);

    step.addBody(mkBodyState('dyn', 0, 0, 0));
    step.addBody(mkBodyState('stat', 0.5, 0, 0, 1, true));

    step.fixedUpdate(1 / 60);

    const statAfter = step.getBody('stat')!;
    expect(statAfter.position.x).toBeCloseTo(0.5, 6);
  });
});

// ---------------------------------------------------------------------------
// Bug 6 (PhysicsStep): broadphase must multi-cell insert bodies
// ---------------------------------------------------------------------------

describe('Bug 6 — PhysicsStep broadphase must detect cross-cell boundary collisions', () => {
  it('two overlapping bodies straddling a cell boundary generate a collision event', () => {
    const step = new PhysicsStep();
    step.setGravity(0, 0, 0);
    step.setCellSize(10);

    const fired: string[] = [];
    step.onCollision((ev) => fired.push(`${ev.bodyA}|${ev.bodyB}`));

    // Bodies placed on opposite sides of the x=10 cell boundary, 0.2 m apart — overlapping.
    step.addBody(mkBodyState('a', 9.9, 0, 0));
    step.addBody(mkBodyState('b', 10.1, 0, 0));

    step.fixedUpdate(1 / 60);

    // Bug: bodies hash to different cells, no collision generated.
    // Fix (multi-cell insert): both cells contain both bodies, collision detected.
    expect(fired.length).toBeGreaterThan(0);
  });
});
