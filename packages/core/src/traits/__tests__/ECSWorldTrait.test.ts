/**
 * ECSWorldTrait.test.ts — v4.0
 *
 * Tests for the HoloScript ECS runtime and WASM bridge trait.
 * Validates the "1K entities @ 60fps" claim from the HoloLand research protocol.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ECSWorld,
  ComponentType,
  physicsSystem,
  agentMovementSystem,
  lodSystem,
  runECSBenchmark,
  wasmBridgeHandler,
} from '../ECSWorldTrait';

// ─── ECS World Core ───────────────────────────────────────────────────────────

describe('ECSWorld — entity lifecycle', () => {
  let world: ECSWorld;
  beforeEach(() => { world = new ECSWorld(); });

  it('creates entities with incrementing IDs', () => {
    const a = world.createEntity();
    const b = world.createEntity();
    expect(b).toBeGreaterThan(a);
    expect(world.entityCount()).toBe(2);
  });

  it('destroys entities and decrements count', () => {
    const id = world.createEntity();
    expect(world.destroyEntity(id)).toBe(true);
    expect(world.entityCount()).toBe(0);
  });

  it('returns false when destroying non-existent entity', () => {
    expect(world.destroyEntity(9999)).toBe(false);
  });

  it('resets world to zero entities', () => {
    world.createEntity(); world.createEntity();
    world.reset();
    expect(world.entityCount()).toBe(0);
  });
});

describe('ECSWorld — component add/get/query', () => {
  let world: ECSWorld;
  beforeEach(() => { world = new ECSWorld(); });

  it('adds and retrieves Transform component', () => {
    const id = world.createEntity();
    world.addTransform(id, { x: 1, y: 2, z: 3, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });
    expect(world.getTransform(id)?.x).toBe(1);
    expect(world.hasComponent(id, ComponentType.Transform)).toBe(true);
  });

  it('adds and retrieves Velocity component', () => {
    const id = world.createEntity();
    world.addVelocity(id, { vx: 5, vy: 0, vz: 0, angularX: 0, angularY: 1, angularZ: 0 });
    expect(world.getVelocity(id)?.vx).toBe(5);
  });

  it('adds Renderable component with LOD level', () => {
    const id = world.createEntity();
    world.addRenderable(id, { meshId: 'cube', materialId: 'metal', visible: true, lodLevel: 0 });
    expect(world.getRenderable(id)?.meshId).toBe('cube');
  });

  it('adds Agent component', () => {
    const id = world.createEntity();
    world.addAgent(id, { state: 'idle', targetX: 10, targetY: 0, targetZ: 10, speed: 5, traitMask: 0 });
    expect(world.getAgent(id)?.state).toBe('idle');
  });

  it('returns undefined for missing component', () => {
    const id = world.createEntity();
    expect(world.getVelocity(id)).toBeUndefined();
  });

  it('removes a component by type', () => {
    const id = world.createEntity();
    world.addTransform(id, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });
    world.removeComponent(id, ComponentType.Transform);
    expect(world.hasComponent(id, ComponentType.Transform)).toBe(false);
  });

  it('queries entities by component mask', () => {
    const withBoth = world.createEntity();
    const withOne = world.createEntity();
    world.addTransform(withBoth, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });
    world.addVelocity(withBoth, { vx: 1, vy: 0, vz: 0, angularX: 0, angularY: 0, angularZ: 0 });
    world.addTransform(withOne, { x: 5, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });

    const results = world.query(ComponentType.Transform | ComponentType.Velocity);
    expect(results).toContain(withBoth);
    expect(results).not.toContain(withOne);
  });
});

// ─── Built-in Systems ─────────────────────────────────────────────────────────

describe('ECSWorld — physicsSystem', () => {
  it('integrates velocity into position', () => {
    const world = new ECSWorld();
    const id = world.createEntity();
    world.addTransform(id, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });
    world.addVelocity(id, { vx: 10, vy: 0, vz: 0, angularX: 0, angularY: 0, angularZ: 0 });
    physicsSystem(world, 0.016); // ~60fps dt
    expect(world.getTransform(id)!.x).toBeCloseTo(0.16, 3);
  });

  it('applies angular velocity to rotation', () => {
    const world = new ECSWorld();
    const id = world.createEntity();
    world.addTransform(id, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });
    world.addVelocity(id, { vx: 0, vy: 0, vz: 0, angularX: 0, angularY: 90, angularZ: 0 });
    physicsSystem(world, 0.016);
    expect(world.getTransform(id)!.ry).toBeCloseTo(1.44, 2);
  });
});

describe('ECSWorld — agentMovementSystem', () => {
  it('moves agent toward target', () => {
    const world = new ECSWorld();
    const id = world.createEntity();
    world.addTransform(id, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });
    world.addAgent(id, { state: 'moving', targetX: 10, targetY: 0, targetZ: 0, speed: 5, traitMask: 0 });
    agentMovementSystem(world, 0.1);
    expect(world.getTransform(id)!.x).toBeGreaterThan(0);
  });

  it('transitions agent to idle when reaching target', () => {
    const world = new ECSWorld();
    const id = world.createEntity();
    world.addTransform(id, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });
    world.addAgent(id, { state: 'moving', targetX: 0.001, targetY: 0, targetZ: 0, speed: 5, traitMask: 0 });
    agentMovementSystem(world, 1.0);
    expect(world.getAgent(id)!.state).toBe('idle');
  });

  it('does not move idle agents', () => {
    const world = new ECSWorld();
    const id = world.createEntity();
    world.addTransform(id, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });
    world.addAgent(id, { state: 'idle', targetX: 100, targetY: 0, targetZ: 100, speed: 5, traitMask: 0 });
    agentMovementSystem(world, 0.016);
    expect(world.getTransform(id)!.x).toBe(0);
  });
});

describe('ECSWorld — lodSystem', () => {
  it('sets LOD 0 for nearby entities', () => {
    const world = new ECSWorld();
    const id = world.createEntity();
    world.addTransform(id, { x: 1, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });
    world.addRenderable(id, { meshId: 'cube', materialId: 'mat', visible: true, lodLevel: 3 });
    lodSystem(world, 0, 0, 0, 0);
    expect(world.getRenderable(id)!.lodLevel).toBe(0);
  });

  it('sets LOD 3 for far entities', () => {
    const world = new ECSWorld();
    const id = world.createEntity();
    world.addTransform(id, { x: 200, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });
    world.addRenderable(id, { meshId: 'cube', materialId: 'mat', visible: true, lodLevel: 0 });
    lodSystem(world, 0, 0, 0, 0);
    expect(world.getRenderable(id)!.lodLevel).toBe(3);
  });
});

// ─── Benchmark ────────────────────────────────────────────────────────────────

describe('ECS Benchmark — 1K entities @ 60fps', () => {
  it('reports entity count correctly', () => {
    const result = runECSBenchmark(100, 10, 60);
    expect(result.entityCount).toBe(100);
    expect(result.framesRun).toBe(10);
  });

  it('100 entities meets 60fps target', () => {
    const result = runECSBenchmark(100, 60, 60);
    expect(result.meetsTarget).toBe(true);
  });

  it('1000 entities meets 60fps target (core claim)', () => {
    const result = runECSBenchmark(1000, 60, 60);
    // Core research claim: 1K entities @ 60fps
    expect(result.meetsTarget).toBe(true);
    expect(result.avgFrameMs).toBeLessThan(16.67); // 1000ms / 60fps
  });

  it('reports entitiesPerSecond > 0', () => {
    const result = runECSBenchmark(1000, 10, 60);
    expect(result.entitiesPerSecond).toBeGreaterThan(0);
  });
});

// ─── WASMBridgeTrait ─────────────────────────────────────────────────────────

describe('ECSWorldTrait — wasmBridgeHandler', () => {
  it('emits ecs_ready on attach', () => {
    const node = {} as any;
    const ctx = { emit: (t: string, p: unknown) => { ctx.events.push({ type: t, payload: p }); }, events: [] as any[], of: (t: string) => ctx.events.filter((e: any) => e.type === t) };
    wasmBridgeHandler.onAttach(node, wasmBridgeHandler.defaultConfig, ctx);
    expect(ctx.of('ecs_ready').length).toBe(1);
  });

  it('emits ecs_entity_spawned on ecs_spawn_entity', () => {
    const node = {} as any;
    const ctx = { emit: (t: string, p: unknown) => { ctx.events.push({ type: t, payload: p }); }, events: [] as any[], of: (t: string) => ctx.events.filter((e: any) => e.type === t) };
    wasmBridgeHandler.onAttach(node, wasmBridgeHandler.defaultConfig, ctx);
    wasmBridgeHandler.onEvent(node, wasmBridgeHandler.defaultConfig, ctx, {
      type: 'ecs_spawn_entity',
      payload: { transform: { x: 1, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 } },
    });
    expect(ctx.of('ecs_entity_spawned').length).toBe(1);
  });

  it('runs benchmark via ecs_benchmark event', () => {
    const node = {} as any;
    const ctx = { emit: (t: string, p: unknown) => { ctx.events.push({ type: t, payload: p }); }, events: [] as any[], of: (t: string) => ctx.events.filter((e: any) => e.type === t) };
    wasmBridgeHandler.onAttach(node, wasmBridgeHandler.defaultConfig, ctx);
    wasmBridgeHandler.onEvent(node, wasmBridgeHandler.defaultConfig, ctx, {
      type: 'ecs_benchmark',
      payload: { entityCount: 100, frames: 10 },
    });
    const bench = ctx.of('ecs_benchmark_complete');
    expect(bench.length).toBe(1);
    expect((bench[0].payload as any).result.entityCount).toBe(100);
  });

  it('emits ecs_stopped and cleans state on detach', () => {
    const node = {} as any;
    const ctx = { emit: (t: string, p: unknown) => { ctx.events.push({ type: t, payload: p }); }, events: [] as any[], of: (t: string) => ctx.events.filter((e: any) => e.type === t) };
    wasmBridgeHandler.onAttach(node, wasmBridgeHandler.defaultConfig, ctx);
    wasmBridgeHandler.onDetach(node, wasmBridgeHandler.defaultConfig, ctx);
    expect(ctx.of('ecs_stopped').length).toBe(1);
    expect(node.__ecsWorld).toBeUndefined();
  });

  it('ticks world via ecs_tick event', () => {
    const node = {} as any;
    const ctx = { emit: (t: string, p: unknown) => { ctx.events.push({ type: t, payload: p }); }, events: [] as any[], of: (t: string) => ctx.events.filter((e: any) => e.type === t) };
    wasmBridgeHandler.onAttach(node, wasmBridgeHandler.defaultConfig, ctx);
    wasmBridgeHandler.onEvent(node, wasmBridgeHandler.defaultConfig, ctx, { type: 'ecs_tick', payload: { dt: 0.016 } });
    expect(ctx.of('ecs_ticked').length).toBe(1);
    expect((ctx.of('ecs_ticked')[0].payload as any).stats.totalFrames).toBe(1);
  });
});
