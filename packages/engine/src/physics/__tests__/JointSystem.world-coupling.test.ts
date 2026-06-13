/**
 * JointSystem ↔ rigid-body world coupling regression (zgcn).
 *
 * Before the fix, JointSystem.solve() computed a scalar currentForce but applied
 * it to no body — joints moved nothing. applyForcesToWorld() couples the linear
 * spring/distance law into the world. This test pins that:
 *   - CONTROL: stepping the world WITHOUT applyForcesToWorld leaves the bodies
 *     where they are (zero gravity, no other force) — the structural gap.
 *   - TREATMENT: applying joint forces each substep pulls a stretched pair
 *     measurably together, symmetrically.
 */

import { describe, it, expect } from 'vitest';
import { PhysicsWorldImpl } from '..';
import { JointSystem } from '../JointSystem';
import type { IRigidBodyConfig } from '@holoscript/core';

function body(id: string, pos: [number, number, number]): IRigidBodyConfig {
  return {
    id,
    type: 'dynamic',
    mass: 1,
    shape: { type: 'sphere', radius: 0.25 },
    transform: { position: pos, rotation: [0, 0, 0, 1] },
    material: { friction: 0, restitution: 0 },
  };
}

function separation(world: PhysicsWorldImpl): number {
  const a = world.getBody('A')!;
  const b = world.getBody('B')!;
  const dx = b.position[0] - a.position[0];
  const dy = b.position[1] - a.position[1];
  const dz = b.position[2] - a.position[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// A spring joint whose rest length (2) is shorter than the initial body
// separation (3) — so it is stretched and should pull the bodies together.
function makeJointSystem(): { js: JointSystem; jointId: string } {
  const js = new JointSystem();
  const joint = js.createJoint('spring', 'A', 'B', {
    anchorA: [0, 0, 0],
    anchorB: [2, 0, 0], // initial anchor separation → restLength = 2
    stiffness: 10,
    damping: 1,
  });
  return { js, jointId: joint.id };
}

describe('JointSystem world coupling (zgcn)', () => {
  const dt = 1 / 60;
  const STEPS = 120;

  it('CONTROL: without applyForcesToWorld the joint moves no body', () => {
    const world = new PhysicsWorldImpl({ gravity: [0, 0, 0] });
    world.createBody(body('A', [0, 0, 0]));
    world.createBody(body('B', [3, 0, 0]));
    makeJointSystem(); // joints exist but are never coupled to the world (control)

    for (let i = 0; i < STEPS; i++) world.step(dt);

    // No force was ever applied → bodies are exactly where they started.
    expect(separation(world)).toBeCloseTo(3, 5);
    expect(world.getBody('A')!.position[0]).toBeCloseTo(0, 5);
    expect(world.getBody('B')!.position[0]).toBeCloseTo(3, 5);
  });

  it('TREATMENT: applyForcesToWorld pulls a stretched pair measurably together', () => {
    const world = new PhysicsWorldImpl({ gravity: [0, 0, 0] });
    world.createBody(body('A', [0, 0, 0]));
    world.createBody(body('B', [3, 0, 0]));
    const { js, jointId } = makeJointSystem();

    const initial = separation(world); // 3
    for (let i = 0; i < STEPS; i++) {
      js.applyForcesToWorld(world, dt);
      world.step(dt);
    }
    const final = separation(world);

    // The stretched spring (rest 2 < initial 3) pulled the bodies together.
    expect(final).toBeLessThan(initial - 0.2);
    // Symmetric: A moved toward +x, B toward −x (equal & opposite forces).
    expect(world.getBody('A')!.position[0]).toBeGreaterThan(0);
    expect(world.getBody('B')!.position[0]).toBeLessThan(3);
    // It relaxes toward — not past — rest length (damping prevents runaway).
    expect(final).toBeGreaterThan(1.5);
    // The joint recorded the real measured body separation (tracks the world,
    // within one substep of drift) — NOT the static anchor distance (2), which
    // never changes. This is what was structurally missing before the fix.
    const recorded = js.getState(jointId)!.currentDistance;
    expect(recorded).toBeCloseTo(final, 1);
    expect(Math.abs(recorded - 2)).toBeGreaterThan(0.05);
  });
});
