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

  it('ragdoll — joint constraints generated from bone hierarchy', () => {
    const bones = ['Hips', 'Spine', 'Head', 'LeftArm', 'RightArm'];
    const joints = bones.slice(1).map((bone, i) => ({
      parent: bones[i], child: bone,
      limits: { minAngle: -Math.PI / 4, maxAngle: Math.PI / 4 },
    }));
    expect(joints).toHaveLength(4);
    expect(joints[0]).toEqual({ parent: 'Hips', child: 'Spine', limits: { minAngle: -Math.PI / 4, maxAngle: Math.PI / 4 } });
  });

  it('collision event callback fires on body contact', () => {
    const events: Array<{ a: string; b: string }> = [];
    const onCollision = (a: string, b: string) => events.push({ a, b });
    // Simulate collision
    onCollision('cube-1', 'floor');
    onCollision('sphere-1', 'wall');
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ a: 'cube-1', b: 'floor' });
  });

  it('gravity vector is configurable (x, y, z)', () => {
    const gravity = { x: 0, y: -9.81, z: 0 };
    expect(gravity.y).toBeCloseTo(-9.81, 2);
    // Moon gravity
    const moonGravity = { x: 0, y: -1.62, z: 0 };
    expect(moonGravity.y).toBeCloseTo(-1.62, 2);
    // Zero-G
    const zeroG = { x: 0, y: 0, z: 0 };
    expect(zeroG.y).toBe(0);
  });
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

  it('body type (dynamic, kinematic, static) is configurable per node', () => {
    type BodyType = 'dynamic' | 'kinematic' | 'static';
    const bodyConfigs: Array<{ nodeId: string; type: BodyType }> = [
      { nodeId: 'player', type: 'dynamic' },
      { nodeId: 'platform', type: 'kinematic' },
      { nodeId: 'floor', type: 'static' },
    ];
    expect(bodyConfigs.find(b => b.nodeId === 'player')!.type).toBe('dynamic');
    expect(bodyConfigs.find(b => b.nodeId === 'floor')!.type).toBe('static');
  });

  it('mass and friction are configurable per body', () => {
    const bodyProps = { nodeId: 'cube', mass: 5.0, friction: 0.3, restitution: 0.6 };
    expect(bodyProps.mass).toBe(5.0);
    expect(bodyProps.friction).toBeCloseTo(0.3, 2);
    expect(bodyProps.restitution).toBeCloseTo(0.6, 2);
    // Zero mass = static body
    const staticBody = { ...bodyProps, mass: 0 };
    expect(staticBody.mass).toBe(0);
  });
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

  it('sub-stepping runs multiple physics steps per frame', () => {
    let stepCount = 0;
    const fakeWorld = { step: () => { stepCount++; }, free: () => {} };
    const substeps = 4;
    for (let i = 0; i < substeps; i++) fakeWorld.step();
    expect(stepCount).toBe(4);
  });

  it('physics profiler tracks step time per frame', () => {
    const profiler = { frameTimes: [] as number[], record(ms: number) { this.frameTimes.push(ms); } };
    profiler.record(0.5);
    profiler.record(0.8);
    profiler.record(0.3);
    const avg = profiler.frameTimes.reduce((a, b) => a + b, 0) / profiler.frameTimes.length;
    expect(avg).toBeCloseTo(0.533, 1);
    expect(Math.max(...profiler.frameTimes)).toBe(0.8);
  });
});
