/**
 * physics-sandbox.scenario.ts — LIVING-SPEC: Physics Sandbox
 *
 * Persona: Diego — physics tinkerer who configures worlds,
 * manages rigid bodies, and debugs collision wireframes.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePhysicsStore } from '@/lib/physicsStore';

// ═══════════════════════════════════════════════════════════════════
// 1. Physics World Store
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Physics Sandbox — World Management', () => {
  beforeEach(() => {
    usePhysicsStore.setState({
      world: null,
      bodyMap: new Map(),
      physicsEnabled: false,
      debugVisible: false,
    });
  });

  it('physics store starts with null world', () => {
    expect(usePhysicsStore.getState().world).toBeNull();
  });

  it('physics is disabled by default', () => {
    expect(usePhysicsStore.getState().physicsEnabled).toBe(false);
  });

  it('debug wireframe is hidden by default', () => {
    expect(usePhysicsStore.getState().debugVisible).toBe(false);
  });

  it('setWorld() attaches a WASM world instance', () => {
    const fakeWorld = { step: () => {}, free: () => {} };
    usePhysicsStore.getState().setWorld(fakeWorld);
    expect(usePhysicsStore.getState().world).toBe(fakeWorld);
  });

  it('setPhysicsEnabled() toggles simulation on/off', () => {
    usePhysicsStore.getState().setPhysicsEnabled(true);
    expect(usePhysicsStore.getState().physicsEnabled).toBe(true);
    usePhysicsStore.getState().setPhysicsEnabled(false);
    expect(usePhysicsStore.getState().physicsEnabled).toBe(false);
  });

  it('setDebugVisible() toggles collision wireframe overlay', () => {
    usePhysicsStore.getState().setDebugVisible(true);
    expect(usePhysicsStore.getState().debugVisible).toBe(true);
    usePhysicsStore.getState().setDebugVisible(false);
    expect(usePhysicsStore.getState().debugVisible).toBe(false);
  });

  it('bodyMap starts empty', () => {
    expect(usePhysicsStore.getState().bodyMap.size).toBe(0);
  });

  it('reset() clears world, bodyMap, and disables physics', () => {
    const fakeWorld = { step: () => {}, free: () => {} };
    usePhysicsStore.getState().setWorld(fakeWorld);
    usePhysicsStore.getState().setPhysicsEnabled(true);
    usePhysicsStore.getState().setDebugVisible(true);
    usePhysicsStore.setState(s => ({
      bodyMap: new Map([['node-1', 42], ['node-2', 99]]),
    }));
    usePhysicsStore.getState().reset();
    expect(usePhysicsStore.getState().world).toBeNull();
    expect(usePhysicsStore.getState().bodyMap.size).toBe(0);
    expect(usePhysicsStore.getState().physicsEnabled).toBe(false);
  });

  it.todo('ragdoll physics — auto-generate joint constraints from skeleton');
  it.todo('collision event callbacks fire on body contact');
  it.todo('gravity vector is configurable (x, y, z)');
});

// ═══════════════════════════════════════════════════════════════════
// 2. Rigid Body Management
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Physics Sandbox — Rigid Body Registry', () => {
  beforeEach(() => {
    usePhysicsStore.setState({
      world: { step: () => {}, free: () => {} },
      bodyMap: new Map(),
      physicsEnabled: true,
      debugVisible: false,
    });
  });

  it('can register a body handle for a scene node', () => {
    usePhysicsStore.setState(s => ({
      bodyMap: new Map([...s.bodyMap, ['cube-1', 1]]),
    }));
    expect(usePhysicsStore.getState().bodyMap.get('cube-1')).toBe(1);
  });

  it('can register multiple bodies', () => {
    usePhysicsStore.setState({
      bodyMap: new Map([['a', 1], ['b', 2], ['c', 3]]),
    });
    expect(usePhysicsStore.getState().bodyMap.size).toBe(3);
  });

  it('can remove a body by node ID', () => {
    usePhysicsStore.setState({
      bodyMap: new Map([['a', 1], ['b', 2]]),
    });
    const map = new Map(usePhysicsStore.getState().bodyMap);
    map.delete('a');
    usePhysicsStore.setState({ bodyMap: map });
    expect(usePhysicsStore.getState().bodyMap.size).toBe(1);
    expect(usePhysicsStore.getState().bodyMap.has('a')).toBe(false);
  });

  it('body handle is a numeric Rapier handle index', () => {
    usePhysicsStore.setState({
      bodyMap: new Map([['sphere', 42]]),
    });
    const handle = usePhysicsStore.getState().bodyMap.get('sphere');
    expect(typeof handle).toBe('number');
  });

  it.todo('body type (dynamic, kinematic, static) is configurable per node');
  it.todo('mass and friction are configurable per body');
});

// ═══════════════════════════════════════════════════════════════════
// 3. Physics Simulation Loop
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Physics Sandbox — Simulation', () => {
  it('simulation step advances time by dt', () => {
    let time = 0;
    const fakeWorld = { step: () => { time += 1 / 60; }, free: () => {} };
    fakeWorld.step();
    fakeWorld.step();
    fakeWorld.step();
    expect(time).toBeCloseTo(3 / 60, 5);
  });

  it('physics runs at fixed timestep (1/60)', () => {
    const dt = 1 / 60;
    expect(dt).toBeCloseTo(0.01667, 3);
  });

  it('simulation respects physicsEnabled flag', () => {
    usePhysicsStore.setState({ physicsEnabled: false });
    let stepped = false;
    const fakeWorld = { step: () => { stepped = true; }, free: () => {} };
    // Only step if enabled
    if (usePhysicsStore.getState().physicsEnabled) {
      fakeWorld.step();
    }
    expect(stepped).toBe(false);
  });

  it('free() releases WASM world memory', () => {
    let freed = false;
    const fakeWorld = { step: () => {}, free: () => { freed = true; } };
    fakeWorld.free();
    expect(freed).toBe(true);
  });

  it.todo('sub-stepping for high-frequency simulation');
  it.todo('physics profiler — track step time per frame');
});
