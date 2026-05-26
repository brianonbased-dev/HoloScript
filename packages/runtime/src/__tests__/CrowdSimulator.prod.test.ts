/**
 * CrowdSimulator — Production Test Suite
 *
 * Integration: drive the REAL CrowdSimTrait (attach → spawn → step×N) and assert
 * agents actually integrate — they start near-overlapping and DIVERGE under
 * separation (non-overlapping). This is the failing-if-broken assertion the
 * old emit-only stub cannot satisfy: with no integrator, positions never move.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events';
import { CrowdSimulator, createCrowdSimulator } from '../CrowdSimulator';
import { crowdSimHandler } from '../../../core/src/traits/CrowdSimTrait';

function makeTraitContext(bus: EventBus) {
  const spy = vi.fn((event: string, payload?: unknown) => bus.emit(event, payload));
  return { emit: spy };
}

/** Attach the real trait, spawn `count` agents, return a tick helper. */
function mountCrowd(bus: EventBus, count: number, nodeId = 'crowd_1') {
  const node: any = { id: nodeId };
  const ctx = makeTraitContext(bus);
  const cfg = { ...crowdSimHandler.defaultConfig! };
  crowdSimHandler.onAttach!(node, cfg, ctx as any);
  // Spawn agents at the origin (the trait forwards count → crowd_sim_spawn).
  crowdSimHandler.onEvent!(node, cfg, ctx as any, {
    type: 'crowd_spawn_agents',
    count,
    position: [0, 0, 0],
  });
  return {
    node,
    ctx,
    cfg,
    tick: (dt = 0.05) => crowdSimHandler.onUpdate!(node, cfg, ctx as any, dt),
  };
}

describe('CrowdSimulator — Pattern E wiring', () => {
  it('registers a listener for crowd_sim_step (0 before this code)', () => {
    const bus = new EventBus();
    expect(bus.listenerCount('crowd_sim_step')).toBe(0);
    const sim = new CrowdSimulator({ bus });
    sim.start();
    expect(bus.listenerCount('crowd_sim_step')).toBeGreaterThan(0);
  });

  it('spawning via the real trait creates agents in the simulator', () => {
    const bus = new EventBus();
    const sim = createCrowdSimulator({ bus });
    mountCrowd(bus, 5, 'crowd_1');
    expect(sim.agentCount('crowd_1')).toBe(5);
  });

  it('agents diverge under separation over several ticks (the done-when assertion)', () => {
    const bus = new EventBus();
    const sim = createCrowdSimulator({ bus });
    const { tick } = mountCrowd(bus, 6, 'crowd_1');

    // Start: tight cluster, near-overlapping.
    const initialMin = sim.minPairwiseDistance('crowd_1');
    expect(initialMin).toBeLessThan(0.1);

    for (let i = 0; i < 40; i++) tick(0.05);

    // After integration, separation has pushed them apart.
    const finalMin = sim.minPairwiseDistance('crowd_1');
    expect(sim.stepCount('crowd_1')).toBe(40);
    expect(finalMin).toBeGreaterThan(initialMin);
    expect(finalMin).toBeGreaterThan(0.3); // clearly non-overlapping
  });

  it('no integration without a step (positions only move when ticked)', () => {
    const bus = new EventBus();
    const sim = createCrowdSimulator({ bus });
    mountCrowd(bus, 4, 'crowd_1');
    const before = sim.getAgents('crowd_1').map((a) => [...a.position]);
    // No tick → positions unchanged.
    const after = sim.getAgents('crowd_1').map((a) => [...a.position]);
    expect(after).toEqual(before);
    expect(sim.stepCount('crowd_1')).toBe(0);
  });

  it('agents steer toward a set goal', () => {
    const bus = new EventBus();
    const sim = createCrowdSimulator({ bus });
    const { node, ctx, cfg, tick } = mountCrowd(bus, 3, 'crowd_1');
    crowdSimHandler.onEvent!(node, cfg, ctx as any, {
      type: 'crowd_set_goal',
      position: [50, 0, 0],
    });
    for (let i = 0; i < 30; i++) tick(0.05);
    // Centroid should have moved toward +x (the goal direction).
    const agents = sim.getAgents('crowd_1');
    const cx = agents.reduce((s, a) => s + a.position[0], 0) / agents.length;
    expect(cx).toBeGreaterThan(1);
  });

  it('velocity is clamped to configured speed', () => {
    const bus = new EventBus();
    const sim = createCrowdSimulator({ bus });
    const { node, ctx, cfg, tick } = mountCrowd(bus, 4, 'crowd_1');
    crowdSimHandler.onEvent!(node, cfg, ctx as any, {
      type: 'crowd_set_goal',
      position: [1000, 0, 0],
    });
    for (let i = 0; i < 20; i++) tick(0.05);
    const speed = crowdSimHandler.defaultConfig!.speed;
    for (const a of sim.getAgents('crowd_1')) {
      const v = Math.hypot(a.velocity[0], a.velocity[1], a.velocity[2]);
      expect(v).toBeLessThanOrEqual(speed + 1e-6);
    }
  });

  it('clear empties the crowd', () => {
    const bus = new EventBus();
    const sim = createCrowdSimulator({ bus });
    const { node, ctx, cfg } = mountCrowd(bus, 5, 'crowd_1');
    crowdSimHandler.onEvent!(node, cfg, ctx as any, { type: 'crowd_clear' });
    expect(sim.agentCount('crowd_1')).toBe(0);
  });
});
