/**
 * SoftBodySolver — Production Test Suite
 *
 * Integration: attach the REAL SoftBodyProTrait, seed a body, apply a stretch
 * exceeding tear_threshold, tick, and assert a constraint TORE (topology change).
 * Fails against the emit-only stub (no solver → no constraint ever tears).
 */
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events';
import {
  SoftBodySolver,
  createSoftBodySolver,
  type SoftBodyParticle,
  type DistanceConstraint,
} from '../SoftBodySolver';
import { softBodyProHandler } from '../../../core/src/traits/SoftBodyProTrait';

function makeTraitContext(bus: EventBus) {
  const spy = vi.fn((event: string, payload?: unknown) => bus.emit(event, payload));
  return { emit: spy };
}

/** Attach real trait (emits soft_body_pro_create), return tick + node. */
function mountSoftBody(bus: EventBus, nodeId = 'sb_1', config: any = {}) {
  const node: any = { id: nodeId };
  const ctx = makeTraitContext(bus);
  const cfg = { ...softBodyProHandler.defaultConfig!, ...config };
  softBodyProHandler.onAttach!(node, cfg, ctx as any);
  return {
    node,
    ctx,
    cfg,
    tick: (dt = 0.016) => softBodyProHandler.onUpdate!(node, cfg, ctx as any, dt),
  };
}

/** Two particles + one distance constraint (rest length 1), particle 0 pinned. */
function twoParticleBody(): { particles: SoftBodyParticle[]; constraints: DistanceConstraint[] } {
  return {
    particles: [
      { position: [0, 0, 0], prevPosition: [0, 0, 0], invMass: 0 }, // pinned anchor
      { position: [1, 0, 0], prevPosition: [1, 0, 0], invMass: 1 },
    ],
    constraints: [{ a: 0, b: 1, restLength: 1 }],
  };
}

describe('SoftBodySolver — Pattern E wiring', () => {
  it('registers a listener for soft_body_pro_step (0 before this code)', () => {
    const bus = new EventBus();
    expect(bus.listenerCount('soft_body_pro_step')).toBe(0);
    const solver = new SoftBodySolver({ bus });
    solver.start();
    expect(bus.listenerCount('soft_body_pro_step')).toBeGreaterThan(0);
  });

  it('a stretch beyond tear_threshold tears a constraint on tick (the done-when)', () => {
    const bus = new EventBus();
    const solver = createSoftBodySolver({ bus });
    const { tick } = mountSoftBody(bus, 'sb_1', { tear_threshold: 0.8 });

    const { particles, constraints } = twoParticleBody();
    solver.setBody('sb_1', particles, constraints);
    expect(solver.constraintCount('sb_1')).toBe(1);
    expect(solver.tornCount('sb_1')).toBe(0);

    // Impose a 300% stretch (strain 2.0 >> 0.8 threshold).
    solver.setParticlePosition('sb_1', 1, [4, 0, 0]);
    tick();

    // Topology changed: the over-stretched constraint tore.
    expect(solver.tornCount('sb_1')).toBe(1);
    expect(solver.constraintCount('sb_1')).toBe(0);
  });

  it('a stretch BELOW threshold does NOT tear — it relaxes toward rest', () => {
    const bus = new EventBus();
    const solver = createSoftBodySolver({ bus });
    const { tick } = mountSoftBody(bus, 'sb_1', { tear_threshold: 0.8 });
    const { particles, constraints } = twoParticleBody();
    solver.setBody('sb_1', particles, constraints);

    // 50% stretch (strain 0.5 < 0.8): should survive and be pulled back.
    solver.setParticlePosition('sb_1', 1, [1.5, 0, 0]);
    tick();

    expect(solver.tornCount('sb_1')).toBe(0);
    expect(solver.constraintCount('sb_1')).toBe(1);
    const p1 = solver.getParticles('sb_1')[1];
    const len = Math.hypot(p1.position[0], p1.position[1], p1.position[2]);
    expect(len).toBeLessThan(1.5); // relaxed back toward rest length 1
  });

  it('pinned particle (invMass 0) never moves', () => {
    const bus = new EventBus();
    const solver = createSoftBodySolver({ bus });
    const { tick } = mountSoftBody(bus, 'sb_1');
    const { particles, constraints } = twoParticleBody();
    solver.setBody('sb_1', particles, constraints);
    for (let i = 0; i < 10; i++) tick();
    expect(solver.getParticles('sb_1')[0].position).toEqual([0, 0, 0]);
  });

  it('no body seeded → step is a no-op', () => {
    const bus = new EventBus();
    const solver = createSoftBodySolver({ bus });
    const { tick } = mountSoftBody(bus, 'sb_1');
    tick();
    expect(solver.stepCount('sb_1')).toBe(0);
  });

  it('higher tear_threshold tolerates more stretch (config honored)', () => {
    const bus = new EventBus();
    const solver = createSoftBodySolver({ bus });
    // threshold 3.0 → a 200% stretch (strain 2.0) should NOT tear.
    const { tick } = mountSoftBody(bus, 'sb_1', { tear_threshold: 3.0 });
    const { particles, constraints } = twoParticleBody();
    solver.setBody('sb_1', particles, constraints);
    solver.setParticlePosition('sb_1', 1, [3, 0, 0]);
    tick();
    expect(solver.tornCount('sb_1')).toBe(0);
    expect(solver.constraintCount('sb_1')).toBe(1);
  });
});
