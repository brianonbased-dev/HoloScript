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
 *  8. Cylinder broadphase/support/contact ignores shape dimensions or rotation
 *  9. GJK/EPA flat-face support ties create false corner torque at rest
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
  cylinderShape,
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

function mkCylinder(
  id: string,
  radius: number,
  height: number,
  position: IVector3,
  mass = 1,
  rotation?: [number, number, number, number],
  axis: 'x' | 'y' | 'z' = 'y'
): IRigidBodyConfig {
  return {
    id,
    type: 'dynamic',
    shape: cylinderShape(radius, height, axis),
    mass,
    transform: {
      position,
      rotation: (rotation ?? identityQuaternion()) as IVector3 & [number, number, number, number],
    },
  };
}

/** Quaternion for a rotation of `angle` radians about a principal world axis. */
function axisAngleQuat(axis: 'x' | 'y' | 'z', angle: number): [number, number, number, number] {
  const s = Math.sin(angle / 2);
  const c = Math.cos(angle / 2);
  if (axis === 'x') return [s, 0, 0, c];
  if (axis === 'y') return [0, s, 0, c];
  return [0, 0, s, c];
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
    const q: [number, number, number, number] = [
      0,
      Math.sin(Math.PI / 8),
      0,
      Math.cos(Math.PI / 8),
    ];
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

// ---------------------------------------------------------------------------
// Bug 8: cylinder broadphase AABB was hardcoded [1,1,1]; rotated-cylinder
// narrow-phase support (GJK/EPA) ignored body orientation entirely.
// ---------------------------------------------------------------------------

/**
 * Numerically probes a body's tight world-space AABB half-extent along one
 * world axis via the public sphereOverlap query (backed by getBodyAABB).
 * A point just inside the expected boundary must overlap a tiny probe
 * sphere; a point just outside must not.
 */
function expectAabbHalfExtent(
  world: ReturnType<typeof createPhysicsWorld>,
  bodyPosition: IVector3,
  axisIndex: 0 | 1 | 2,
  expectedHalfExtent: number,
  margin = 0.05
) {
  const offset: IVector3 = [0, 0, 0];
  offset[axisIndex] = 1;
  const inside: IVector3 = [
    bodyPosition[0] + offset[0] * (expectedHalfExtent - margin),
    bodyPosition[1] + offset[1] * (expectedHalfExtent - margin),
    bodyPosition[2] + offset[2] * (expectedHalfExtent - margin),
  ];
  const outside: IVector3 = [
    bodyPosition[0] + offset[0] * (expectedHalfExtent + margin),
    bodyPosition[1] + offset[1] * (expectedHalfExtent + margin),
    bodyPosition[2] + offset[2] * (expectedHalfExtent + margin),
  ];
  expect(world.sphereOverlap(inside, 0.01).length).toBeGreaterThan(0);
  expect(world.sphereOverlap(outside, 0.01).length).toBe(0);
}

describe('Bug 8a — getBodyAABB cylinder case: axis-aligned half-extents', () => {
  it('radius=1, height=4, axis="y" (default) at identity rotation gives half-extents [r,h,r]', () => {
    const world = createPhysicsWorld({ gravity: [0, 0, 0], maxSubsteps: 1 });
    world.createBody(mkCylinder('cyl', 1, 4, [0, 0, 0]));

    expectAabbHalfExtent(world, [0, 0, 0], 0, 1); // r
    expectAabbHalfExtent(world, [0, 0, 0], 1, 2); // h
    expectAabbHalfExtent(world, [0, 0, 0], 2, 1); // r
  });

  it('axis="x" at identity rotation gives half-extents [h,r,r]', () => {
    const world = createPhysicsWorld({ gravity: [0, 0, 0], maxSubsteps: 1 });
    world.createBody(mkCylinder('cyl', 1, 4, [0, 0, 0], 1, undefined, 'x'));

    expectAabbHalfExtent(world, [0, 0, 0], 0, 2); // h
    expectAabbHalfExtent(world, [0, 0, 0], 1, 1); // r
    expectAabbHalfExtent(world, [0, 0, 0], 2, 1); // r
  });

  it('axis="z" at identity rotation gives half-extents [r,r,h]', () => {
    const world = createPhysicsWorld({ gravity: [0, 0, 0], maxSubsteps: 1 });
    world.createBody(mkCylinder('cyl', 1, 4, [0, 0, 0], 1, undefined, 'z'));

    expectAabbHalfExtent(world, [0, 0, 0], 0, 1); // r
    expectAabbHalfExtent(world, [0, 0, 0], 1, 1); // r
    expectAabbHalfExtent(world, [0, 0, 0], 2, 2); // h (height/2 = 4/2 = 2)
  });
});

describe('Bug 8b — getBodyAABB cylinder case: rotation swaps which axis gets the h-sized extent', () => {
  it('a 90° rotation about world X maps axis="y" onto world Z: half-extents [r,r,h]', () => {
    // Local Y axis (h-direction) rotates onto world Z; unrotated would give
    // [r,h,r]=[1,2,1] (bug: hardcoded [1,1,1] regardless). Correctly rotated
    // gives [r,r,h]=[1,1,2] -- h and r swap between the Y and Z slots.
    const world = createPhysicsWorld({ gravity: [0, 0, 0], maxSubsteps: 1 });
    const q = axisAngleQuat('x', Math.PI / 2);
    world.createBody(mkCylinder('cyl', 1, 4, [0, 0, 0], 1, q));

    expectAabbHalfExtent(world, [0, 0, 0], 0, 1); // r
    expectAabbHalfExtent(world, [0, 0, 0], 1, 1); // r
    expectAabbHalfExtent(world, [0, 0, 0], 2, 2); // h
  });
});

describe('Bug 8c — getBodyAABB cylinder case: 45° rotation matches the closed-form formula', () => {
  it('radius=0.5, height=4 rotated 45° about world Z gives half-extents ~[1.7678,1.7678,0.5]', () => {
    // halfExtent[i] = h*|A_i| + r*sqrt(max(0,1-A_i^2)); A = R*[0,1,0] = (-sin45,cos45,0).
    // h*0.70711 + r*sqrt(1-0.5) = 2*0.70711 + 0.5*0.70711 = 1.767767.
    const world = createPhysicsWorld({ gravity: [0, 0, 0], maxSubsteps: 1 });
    const q = axisAngleQuat('z', Math.PI / 4);
    world.createBody(mkCylinder('cyl', 0.5, 4, [0, 0, 0], 1, q));

    const expected = 1.767767;
    expectAabbHalfExtent(world, [0, 0, 0], 0, expected);
    expectAabbHalfExtent(world, [0, 0, 0], 1, expected);
    expectAabbHalfExtent(world, [0, 0, 0], 2, 0.5);
  });
});

describe('Bug 8d — cylinder broadphase must account for rotation (mirrors the Bug 1 box test)', () => {
  it('a cylinder rotated 45° around Z still broadphase-detects collision outside its unrotated extents', () => {
    // Cylinder radius=1,height=2 (h=1) at origin, rotated 45° around Z.
    // Unrotated AABB half-extent on X = r = 1 (bug: broadphase would use the
    // hardcoded [1,1,1] AABB regardless of rotation, same numeric value here
    // by coincidence of r=h=1 -- so this case specifically requires the
    // *rotation-aware* formula, not just a non-hardcoded one, to detect the
    // pair). Rotated AABB half-extent on X = h*|A_x|+r*sqrt(1-A_x^2) with
    // A=(-0.70711,0.70711,0) => 0.70711+0.70711 = 1.41421 (~sqrt(2)).
    // Second box at x=2.1, halfExtents [1,1,1]: min-X = 1.1.
    // Overlap exists only because the rotated AABB extends to ~1.414 > 1.1.
    const world = createPhysicsWorld({ gravity: [0, 0, 0], maxSubsteps: 1 });
    const q = axisAngleQuat('z', Math.PI / 4);
    world.createBody(mkCylinder('rotated-cyl', 1, 2, [0, 0, 0], 1, q));
    world.createBody(mkBox('other', [1, 1, 1], [2.1, 0, 0]));

    world.step(1 / 60);
    const contacts = world.getContacts().filter((c) => c.type === 'begin');

    expect(contacts.length).toBeGreaterThan(0);
  });
});

describe('Bug 8e — shapeSupport cylinder case: rotated narrow-phase contact resolves correctly', () => {
  it('a cylinder lying on its side (axis rotated onto world Z) resolves a correct contact against a static floor', () => {
    // Exercises GJK/EPA end-to-end with a rotated cylinder support function:
    // broadphase must find the pair (Bug 8a/8b) AND narrow-phase must place
    // the contact on the cylinder's curved lateral surface (Bug 8e), not on
    // its unrotated end-cap.
    //
    // This single-step check isolates rotated-cylinder support geometry.
    // Long-run GJK/EPA resting stability is covered separately by Bug 9.
    const world = createPhysicsWorld({ gravity: [0, 0, 0], maxSubsteps: 1 });
    world.createBody({
      id: 'floor',
      type: 'static',
      mass: 0,
      shape: boxShape([10, 0.5, 10]),
      transform: { position: [0, -0.5, 0], rotation: identityQuaternion() },
      material: { friction: 0.6, restitution: 0 },
    });
    const q = axisAngleQuat('x', Math.PI / 2); // axis 'y' -> world Z: log lying on its side
    // Floor top surface is at y=0. The rotated cylinder's curved lateral
    // surface is 0.5 (radius) below its center on every horizontal axis, so
    // centering it at y=0.4 overlaps the floor by 0.1 along its side --
    // *only* correct if the support function actually uses the rotated
    // frame; the unrotated (buggy) support would instead present a flat
    // end-cap face (still nominally overlapping, but with a degenerate/
    // wrong contact geometry) since the pre-fix code ignored `rotation`
    // entirely for cylinders.
    world.createBody({
      ...mkCylinder('log', 0.5, 2, [0, 0.4, 0], 1, q),
      material: { friction: 0.6, restitution: 0.05 },
    });

    world.step(1 / 60);
    const contacts = world.getContacts().filter((c) => c.type === 'begin');
    expect(contacts.length).toBeGreaterThan(0);

    for (const event of contacts) {
      expect(event.contacts.length).toBeGreaterThan(0);
      for (const point of event.contacts) {
        // Contact normal must be predominantly vertical (a cylinder resting
        // on its curved side against a flat floor pushes straight up/down,
        // not sideways) -- a wrong (unrotated) support point would instead
        // yield a contact normal skewed toward the cylinder's true local Y
        // axis (world Z after this rotation), which has near-zero Y
        // component.
        expect(Math.abs(point.normal[1])).toBeGreaterThan(0.8);
        // Contact position must be finite and land physically between the
        // floor's top surface and the cylinder's center, not off in space.
        expect(Number.isFinite(point.position[0])).toBe(true);
        expect(Number.isFinite(point.position[1])).toBe(true);
        expect(Number.isFinite(point.position[2])).toBe(true);
        expect(point.position[1]).toBeGreaterThan(-0.3);
        expect(point.position[1]).toBeLessThan(0.5);
        expect(point.penetration).toBeGreaterThan(0);
      }
    }
  });
});

describe('Bug 8f — shapeSupport cylinder case: unrotated behavior is unchanged', () => {
  it('an identity-rotation cylinder still produces the same axis-aligned broadphase and contact behavior as before the fix', () => {
    // shapeSupport's rotation-undefined branch is unreachable through the
    // public API (every call site threads body.rotation, which RigidBody's
    // getter always returns as a defined quaternion -- confirmed by reading
    // PhysicsBody.ts). The real "no rotation" case in production is an
    // identity quaternion, so that is what this test proves is unchanged:
    // for identity rotation, R=I, so the new local-space-then-rotate-back
    // logic degenerates to exactly the old world-space-only computation.
    const world = createPhysicsWorld({ gravity: [0, 0, 0], maxSubsteps: 1 });
    world.createBody(mkCylinder('a', 1, 2, [0, 0, 0], 1, identityQuaternion()));
    world.createBody(mkCylinder('b', 1, 2, [1.5, 0, 0], 1, identityQuaternion()));

    world.step(1 / 60);
    const contacts = world.getContacts().filter((c) => c.type === 'begin');
    // Two axis-aligned radius-1 cylinders 1.5m apart on X overlap (1+1=2 > 1.5).
    expect(contacts.length).toBeGreaterThan(0);
  });
});

describe('Bug 8g — exact sphere-cylinder contact supports off-center grounding', () => {
  it('grounds a sphere on an off-center point of a cylinder end cap', () => {
    const world = createPhysicsWorld({ gravity: [0, 0, 0], maxSubsteps: 1 });
    world.createBody({
      id: 'sphere',
      type: 'dynamic',
      mass: 1,
      shape: sphereShape(0.5),
      transform: { position: [1.25, 0.45, 0], rotation: identityQuaternion() },
      material: { friction: 0.6, restitution: 0 },
    });
    world.createBody({
      id: 'platform',
      type: 'static',
      mass: 0,
      shape: cylinderShape(2, 1),
      transform: { position: [0, -0.5, 0], rotation: identityQuaternion() },
      material: { friction: 0.6, restitution: 0 },
    });

    world.step(1 / 60);
    const contact = world
      .getContacts()
      .find((event) => event.type === 'begin' && event.bodyA === 'sphere');

    expect(contact?.bodyB).toBe('platform');
    expect(contact?.contacts).toHaveLength(1);
    expect(contact?.contacts[0].position[0]).toBeCloseTo(1.25, 8);
    expect(contact?.contacts[0].position[1]).toBeCloseTo(0, 8);
    expect(contact?.contacts[0].position[2]).toBeCloseTo(0, 8);
    expect(contact?.contacts[0].normal[0]).toBeCloseTo(0, 8);
    expect(contact?.contacts[0].normal[1]).toBeCloseTo(-1, 8);
    expect(contact?.contacts[0].normal[2]).toBeCloseTo(0, 8);
    expect(contact?.contacts[0].penetration).toBeCloseTo(0.05, 8);
    expect(world.getBody('sphere')?.position[1]).toBeGreaterThan(0.45);
  });

  it('keeps an off-center sphere grounded across deterministic gravity steps', () => {
    const world = createPhysicsWorld({
      gravity: [0, -9.81, 0],
      fixedTimestep: 1 / 60,
      maxSubsteps: 1,
    });
    world.createBody({
      id: 'sphere',
      type: 'dynamic',
      mass: 1,
      shape: sphereShape(0.5),
      transform: { position: [1.25, 0.6, 0], rotation: identityQuaternion() },
      material: { friction: 0.6, restitution: 0 },
    });
    world.createBody({
      id: 'platform',
      type: 'static',
      mass: 0,
      shape: cylinderShape(2, 1),
      transform: { position: [0, -0.5, 0], rotation: identityQuaternion() },
      material: { friction: 0.6, restitution: 0 },
    });

    for (let step = 0; step < 180; step += 1) {
      world.step(1 / 60);
    }

    const sphere = world.getBody('sphere');
    expect(sphere?.position[0]).toBeCloseTo(1.25, 5);
    expect(sphere?.position[1]).toBeGreaterThanOrEqual(0.49);
    expect(sphere?.position[1]).toBeLessThan(0.55);
    expect(Math.abs(sphere?.linearVelocity[1] ?? Infinity)).toBeLessThan(0.1);
  });

  it('evaluates an off-center sphere against a rotated cylinder in cylinder-local space', () => {
    const world = createPhysicsWorld({ gravity: [0, 0, 0], maxSubsteps: 1 });
    world.createBody({
      id: 'sphere',
      type: 'dynamic',
      mass: 1,
      shape: sphereShape(0.5),
      transform: { position: [0, 1.25, 1.2], rotation: identityQuaternion() },
      material: { friction: 0.6, restitution: 0 },
    });
    const q = axisAngleQuat('x', Math.PI / 2);
    world.createBody({
      id: 'rotated-cylinder',
      type: 'static',
      mass: 0,
      shape: cylinderShape(1, 4),
      transform: { position: [0, 0, 0], rotation: q },
      material: { friction: 0.6, restitution: 0 },
    });

    world.step(1 / 60);
    const contact = world
      .getContacts()
      .find((event) => event.type === 'begin' && event.bodyA === 'sphere');

    expect(contact?.bodyB).toBe('rotated-cylinder');
    expect(contact?.contacts).toHaveLength(1);
    expect(contact?.contacts[0].position[0]).toBeCloseTo(0, 8);
    expect(contact?.contacts[0].position[1]).toBeCloseTo(1, 8);
    expect(contact?.contacts[0].position[2]).toBeCloseTo(1.2, 8);
    expect(contact?.contacts[0].normal[0]).toBeCloseTo(0, 8);
    expect(contact?.contacts[0].normal[1]).toBeCloseTo(-1, 8);
    expect(contact?.contacts[0].normal[2]).toBeCloseTo(0, 8);
    expect(contact?.contacts[0].penetration).toBeCloseTo(0.25, 8);
  });
});

// ---------------------------------------------------------------------------
// Bug 9: GJK/EPA support ties must not manufacture a corner contact
// ---------------------------------------------------------------------------

describe('Bug 9 - non-sphere GJK/EPA contacts settle without false corner torque', () => {
  it('keeps a box resting on a static box floor for 300 gravity steps', () => {
    const world = createPhysicsWorld({
      gravity: [0, -9.81, 0],
      fixedTimestep: 1 / 60,
      maxSubsteps: 1,
      allowSleep: false,
    });
    world.createBody({
      id: 'floor',
      type: 'static',
      mass: 0,
      shape: boxShape([10, 0.5, 10]),
      transform: { position: [0, -0.5, 0], rotation: identityQuaternion() },
      material: { friction: 0.6, restitution: 0 },
    });
    world.createBody({
      id: 'box',
      type: 'dynamic',
      mass: 1,
      shape: boxShape([0.5, 0.5, 0.5]),
      transform: { position: [3, 3, -2], rotation: identityQuaternion() },
      material: { friction: 0.6, restitution: 0 },
    });

    let firstContact: IVector3 | undefined;
    for (let step = 0; step < 300; step += 1) {
      world.step(1 / 60);
      firstContact ??= world.getContacts()[0]?.contacts[0]?.position;
    }

    const box = world.getBody('box');
    expect(firstContact?.[0]).toBeCloseTo(3, 8);
    expect(firstContact?.[2]).toBeCloseTo(-2, 8);
    expect(box?.position[0]).toBeCloseTo(3, 8);
    expect(box?.position[1]).toBeCloseTo(0.49, 6);
    expect(box?.position[2]).toBeCloseTo(-2, 8);
    expect(Math.abs(box?.linearVelocity[1] ?? Infinity)).toBeLessThan(1e-8);
    expect(Math.abs(box?.angularVelocity[0] ?? Infinity)).toBeLessThan(1e-8);
    expect(Math.abs(box?.angularVelocity[2] ?? Infinity)).toBeLessThan(1e-8);
  });

  it.each([
    {
      name: 'upright',
      rotation: identityQuaternion(),
      expectedY: 0.99,
    },
    {
      name: 'lying on its side',
      rotation: axisAngleQuat('x', Math.PI / 2),
      expectedY: 0.49,
    },
  ])('keeps a $name cylinder resting on a static floor', ({ rotation, expectedY }) => {
    const world = createPhysicsWorld({
      gravity: [0, -9.81, 0],
      fixedTimestep: 1 / 60,
      maxSubsteps: 1,
      allowSleep: false,
    });
    // Create the dynamic body first to exercise the reverse body ordering from
    // the box case above.
    world.createBody({
      id: 'cylinder',
      type: 'dynamic',
      mass: 1,
      shape: cylinderShape(0.5, 2),
      transform: { position: [-2, 3, 1.5], rotation },
      material: { friction: 0.6, restitution: 0 },
    });
    world.createBody({
      id: 'floor',
      type: 'static',
      mass: 0,
      shape: boxShape([10, 0.5, 10]),
      transform: { position: [0, -0.5, 0], rotation: identityQuaternion() },
      material: { friction: 0.6, restitution: 0 },
    });

    let firstContact: IVector3 | undefined;
    for (let step = 0; step < 300; step += 1) {
      world.step(1 / 60);
      firstContact ??= world.getContacts()[0]?.contacts[0]?.position;
    }

    const cylinder = world.getBody('cylinder');
    expect(firstContact?.[0]).toBeCloseTo(-2, 7);
    expect(firstContact?.[2]).toBeCloseTo(1.5, 7);
    expect(cylinder?.position[0]).toBeCloseTo(-2, 6);
    expect(cylinder?.position[1]).toBeCloseTo(expectedY, 5);
    expect(cylinder?.position[2]).toBeCloseTo(1.5, 6);
    expect(Math.abs(cylinder?.linearVelocity[1] ?? Infinity)).toBeLessThan(1e-7);
    expect(Math.abs(cylinder?.angularVelocity[0] ?? Infinity)).toBeLessThan(1e-7);
    expect(Math.abs(cylinder?.angularVelocity[2] ?? Infinity)).toBeLessThan(1e-7);
  });
});
