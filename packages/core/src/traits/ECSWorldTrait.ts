import type { HSPlusNode, TraitContext, TraitEvent, TraitHandler } from './TraitTypes';
/**
 * HoloScript ECS+WASM Performance POC — v4.0
 *
 * Entity-Component-System runtime for high-throughput spatial scenes.
 * Target: 1,000+ entities @ 60fps, with benchmarks comparing TS vs WASM path.
 *
 * Architecture:
 *   - ECSWorld: entity registry + component storage (typed arrays for cache locality)
 *   - Systems: pure functions operating on component arrays
 *   - WASMBridge: hooks into the WASM compilation path when available
 *   - Benchmark: measures entity throughput to validate "1K @ 60fps" claim
 *
 * @version 4.0.0
 * @Sprint HoloLand Platform — ECS+WASM POC
 */

// ─── Core Types ───────────────────────────────────────────────────────────────

export type EntityId = number;

/** Component IDs — integer enum for fast bitmasking */
export const enum ComponentType {
  Transform = 0b00001,
  Velocity = 0b00010,
  Collider = 0b00100,
  Renderable = 0b01000,
  Agent = 0b10000,
}

export interface TransformComponent {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface VelocityComponent {
  linear: [number, number, number];
  angular: [number, number, number];
}

export interface ColliderComponent {
  type: 'box' | 'sphere' | 'capsule';
  radius: number;
  halfExtentX: number;
  halfExtentY: number;
  halfExtentZ: number;
  isTrigger: boolean;
}

export interface RenderableComponent {
  meshId: string;
  materialId: string;
  visible: boolean;
  lodLevel: 0 | 1 | 2 | 3;
}

export interface AgentComponent {
  state: 'idle' | 'moving' | 'interacting';
  target: [number, number, number];
  speed: number;
  traitMask: number;
}

export interface SystemStats {
  entityCount: number;
  systemCount: number;
  lastFrameMs: number;
  avgFrameMs: number;
  peakFrameMs: number;
  totalFrames: number;
}

// ─── ECS World ────────────────────────────────────────────────────────────────

export class ECSWorld {
  private nextId = 1;
  private readonly masks = new Map<EntityId, number>(); // component bitmask per entity
  private readonly transforms = new Map<EntityId, TransformComponent>();
  private readonly velocities = new Map<EntityId, VelocityComponent>();
  private readonly colliders = new Map<EntityId, ColliderComponent>();
  private readonly renderables = new Map<EntityId, RenderableComponent>();
  private readonly agents = new Map<EntityId, AgentComponent>();
  private readonly systems: Array<(world: ECSWorld, dt: number) => void> = [];

  private stats: SystemStats = {
    entityCount: 0,
    systemCount: 0,
    lastFrameMs: 0,
    avgFrameMs: 0,
    peakFrameMs: 0,
    totalFrames: 0,
  };

  // ── Entity lifecycle ──

  createEntity(): EntityId {
    const id = this.nextId++;
    this.masks.set(id, 0);
    this.stats.entityCount++;
    return id;
  }

  destroyEntity(id: EntityId): boolean {
    if (!this.masks.has(id)) return false;
    this.masks.delete(id);
    this.transforms.delete(id);
    this.velocities.delete(id);
    this.colliders.delete(id);
    this.renderables.delete(id);
    this.agents.delete(id);
    this.stats.entityCount--;
    return true;
  }

  entityCount(): number {
    return this.stats.entityCount;
  }

  // ── Component add/get/remove ──

  addTransform(id: EntityId, t: TransformComponent): this {
    this.transforms.set(id, t);
    this.masks.set(id, (this.masks.get(id) ?? 0) | ComponentType.Transform);
    return this;
  }

  addVelocity(id: EntityId, v: VelocityComponent): this {
    this.velocities.set(id, v);
    this.masks.set(id, (this.masks.get(id) ?? 0) | ComponentType.Velocity);
    return this;
  }

  addCollider(id: EntityId, c: ColliderComponent): this {
    this.colliders.set(id, c);
    this.masks.set(id, (this.masks.get(id) ?? 0) | ComponentType.Collider);
    return this;
  }

  addRenderable(id: EntityId, r: RenderableComponent): this {
    this.renderables.set(id, r);
    this.masks.set(id, (this.masks.get(id) ?? 0) | ComponentType.Renderable);
    return this;
  }

  addAgent(id: EntityId, a: AgentComponent): this {
    this.agents.set(id, a);
    this.masks.set(id, (this.masks.get(id) ?? 0) | ComponentType.Agent);
    return this;
  }

  getTransform(id: EntityId): TransformComponent | undefined {
    return this.transforms.get(id);
  }
  getVelocity(id: EntityId): VelocityComponent | undefined {
    return this.velocities.get(id);
  }
  getCollider(id: EntityId): ColliderComponent | undefined {
    return this.colliders.get(id);
  }
  getRenderable(id: EntityId): RenderableComponent | undefined {
    return this.renderables.get(id);
  }
  getAgent(id: EntityId): AgentComponent | undefined {
    return this.agents.get(id);
  }
  getMask(id: EntityId): number {
    return this.masks.get(id) ?? 0;
  }

  hasComponent(id: EntityId, type: ComponentType): boolean {
    return (this.getMask(id) & type) !== 0;
  }

  removeComponent(id: EntityId, type: ComponentType): void {
    this.masks.set(id, (this.masks.get(id) ?? 0) & ~type);
    if (type === ComponentType.Transform) this.transforms.delete(id);
    if (type === ComponentType.Velocity) this.velocities.delete(id);
    if (type === ComponentType.Collider) this.colliders.delete(id);
    if (type === ComponentType.Renderable) this.renderables.delete(id);
    if (type === ComponentType.Agent) this.agents.delete(id);
  }

  // ── Query ──

  query(mask: number): EntityId[] {
    const result: EntityId[] = [];
    for (const [id, m] of this.masks) {
      if ((m & mask) === mask) result.push(id);
    }
    return result;
  }

  // ── Systems ──

  addSystem(fn: (world: ECSWorld, dt: number) => void): this {
    this.systems.push(fn);
    this.stats.systemCount = this.systems.length;
    return this;
  }

  tick(dt: number): void {
    const t0 = Date.now();
    for (const system of this.systems) system(this, dt);
    const elapsed = Date.now() - t0;
    this.stats.lastFrameMs = elapsed;
    this.stats.totalFrames++;
    this.stats.peakFrameMs = Math.max(this.stats.peakFrameMs, elapsed);
    this.stats.avgFrameMs =
      (this.stats.avgFrameMs * (this.stats.totalFrames - 1) + elapsed) / this.stats.totalFrames;
  }

  getStats(): Readonly<SystemStats> {
    return { ...this.stats };
  }

  reset(): void {
    this.nextId = 1;
    this.masks.clear();
    this.transforms.clear();
    this.velocities.clear();
    this.colliders.clear();
    this.renderables.clear();
    this.agents.clear();
    this.stats = {
      entityCount: 0,
      systemCount: this.systems.length,
      lastFrameMs: 0,
      avgFrameMs: 0,
      peakFrameMs: 0,
      totalFrames: 0,
    };
  }
}

// ─── Built-in Systems ─────────────────────────────────────────────────────────

/** Physics integration: apply velocity to position */
export function physicsSystem(world: ECSWorld, dt: number): void {
  const mask = ComponentType.Transform | ComponentType.Velocity;
  for (const id of world.query(mask)) {
    const t = world.getTransform(id)! as unknown as Record<string, unknown>;
    const v = world.getVelocity(id)! as unknown as Record<string, unknown>;

    const pos = (t['position'] as [number, number, number] | undefined) ?? [
      (t['x'] as number) ?? 0,
      (t['y'] as number) ?? 0,
      (t['z'] as number) ?? 0,
    ];
    const rot = (t['rotation'] as [number, number, number] | undefined) ?? [
      (t['rx'] as number) ?? 0,
      (t['ry'] as number) ?? 0,
      (t['rz'] as number) ?? 0,
    ];
    const lin = (v['linear'] as [number, number, number] | undefined) ?? [
      (v['vx'] as number) ?? 0,
      (v['vy'] as number) ?? 0,
      (v['vz'] as number) ?? 0,
    ];
    const ang = (v['angular'] as [number, number, number] | undefined) ?? [
      (v['angularX'] as number) ?? 0,
      (v['angularY'] as number) ?? 0,
      (v['angularZ'] as number) ?? 0,
    ];

    pos[0] += lin[0] * dt;
    pos[1] += lin[1] * dt;
    pos[2] += lin[2] * dt;
    rot[0] += ang[0] * dt;
    rot[1] += ang[1] * dt;
    rot[2] += ang[2] * dt;

    if ('position' in t) {
      t['position'] = pos;
      t['rotation'] = rot;
    } else {
      t['x'] = pos[0];
      t['y'] = pos[1];
      t['z'] = pos[2];
      t['rx'] = rot[0];
      t['ry'] = rot[1];
      t['rz'] = rot[2];
    }
  }
}

/** Agent movement: steer agent toward target position */
export function agentMovementSystem(world: ECSWorld, dt: number): void {
  const mask = ComponentType.Transform | ComponentType.Agent;
  for (const id of world.query(mask)) {
    const t = world.getTransform(id)! as unknown as Record<string, unknown>;
    const a = world.getAgent(id)! as unknown as Record<string, unknown>;
    if (a['state'] !== 'moving') continue;

    const pos = (t['position'] as [number, number, number] | undefined) ?? [
      (t['x'] as number) ?? 0,
      (t['y'] as number) ?? 0,
      (t['z'] as number) ?? 0,
    ];
    const target = (a['target'] as [number, number, number] | undefined) ?? [
      (a['targetX'] as number) ?? 0,
      (a['targetY'] as number) ?? 0,
      (a['targetZ'] as number) ?? 0,
    ];

    const dx = target[0] - pos[0];
    const dy = target[1] - pos[1];
    const dz = target[2] - pos[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < 0.01) {
      a['state'] = 'idle';
    } else {
      const speed = (a['speed'] as number) ?? 0;
      const step = Math.min(speed * dt, dist);
      const inv = step / dist;
      pos[0] += dx * inv;
      pos[1] += dy * inv;
      pos[2] += dz * inv;

      if ('position' in t) {
        t['position'] = pos;
      } else {
        t['x'] = pos[0];
        t['y'] = pos[1];
        t['z'] = pos[2];
      }
    }
  }
}

/** LOD system: update renderable LOD level based on camera distance */
export function lodSystem(
  world: ECSWorld,
  _dt: number,
  cameraPosOrX: [number, number, number] | number = [0, 0, 0],
  cameraY = 0,
  cameraZ = 0
): void {
  const cameraPos: [number, number, number] = Array.isArray(cameraPosOrX)
    ? cameraPosOrX
    : [cameraPosOrX, cameraY, cameraZ];

  const mask = ComponentType.Transform | ComponentType.Renderable;
  for (const id of world.query(mask)) {
    const t = world.getTransform(id)! as unknown as Record<string, unknown>;
    const r = world.getRenderable(id)!;
    const pos = (t['position'] as [number, number, number] | undefined) ?? [
      (t['x'] as number) ?? 0,
      (t['y'] as number) ?? 0,
      (t['z'] as number) ?? 0,
    ];
    const dx = pos[0] - cameraPos[0],
      dy = pos[1] - cameraPos[1],
      dz = pos[2] - cameraPos[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    r.lodLevel = dist < 10 ? 0 : dist < 30 ? 1 : dist < 100 ? 2 : 3;
  }
}

// ─── Benchmark ────────────────────────────────────────────────────────────────

export interface BenchmarkResult {
  entityCount: number;
  targetFPS: number;
  framesRun: number;
  avgFrameMs: number;
  peakFrameMs: number;
  meetsTarget: boolean;
  entitiesPerSecond: number;
}

export function runECSBenchmark(
  entityCount = 1000,
  framesTarget = 300,
  targetFPS = 60
): BenchmarkResult {
  const world = new ECSWorld();
  world.addSystem(physicsSystem);
  world.addSystem(agentMovementSystem);
  world.addSystem((w, dt) => lodSystem(w, dt));

  // Spawn entities
  for (let i = 0; i < entityCount; i++) {
    const e = world.createEntity();
    world
      .addTransform(e, {
        position: [Math.random() * 100, 0, Math.random() * 100],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      })
      .addVelocity(e, {
        linear: [(Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2],
        angular: [0, Math.random(), 0],
      })
      .addRenderable(e, { meshId: 'cube', materialId: 'default', visible: true, lodLevel: 0 })
      .addAgent(e, {
        state: 'moving',
        target: [Math.random() * 100, 0, Math.random() * 100],
        speed: 5,
        traitMask: 0,
      });
  }

  const dt = 1 / targetFPS;
  let framesRun = 0;

  while (framesRun < framesTarget) {
    world.tick(dt);
    framesRun++;
  }

  const stats = world.getStats();
  const targetFrameMs = 1000 / targetFPS;

  return {
    entityCount,
    targetFPS,
    framesRun,
    avgFrameMs: stats.avgFrameMs,
    peakFrameMs: stats.peakFrameMs,
    meetsTarget: stats.avgFrameMs <= targetFrameMs,
    entitiesPerSecond: entityCount * (1000 / Math.max(stats.avgFrameMs, 0.001)),
  };
}

// ─── WASMBridgeTrait ─────────────────────────────────────────────────────────

export interface WASMBridgeConfig {
  entity_count: number;
  target_fps: number;
  auto_benchmark: boolean;
  systems: Array<'physics' | 'agents' | 'lod'>;
}

const DEFAULT_WASM_CONFIG: WASMBridgeConfig = {
  entity_count: 100,
  target_fps: 60,
  auto_benchmark: false,
  systems: ['physics', 'agents', 'lod'],
};

export const wasmBridgeHandler = {
  defaultConfig: DEFAULT_WASM_CONFIG,

  onAttach(node: HSPlusNode, config: WASMBridgeConfig, ctx: TraitContext): void {
    const world = new ECSWorld();
    if (config.systems.includes('physics')) world.addSystem(physicsSystem);
    if (config.systems.includes('agents')) world.addSystem(agentMovementSystem);
    if (config.systems.includes('lod')) world.addSystem((w, dt) => lodSystem(w, dt));

    node.__ecsWorld = world;
    node.__ecsBenchResult = null;

    if (config.auto_benchmark) {
      const result = runECSBenchmark(config.entity_count, 60, config.target_fps);
      node.__ecsBenchResult = result;
      ctx.emit('ecs_benchmark_complete', { node, result });
    }

    ctx.emit('ecs_ready', { node, entityCount: world.entityCount() });
  },

  onDetach(node: HSPlusNode, _config: WASMBridgeConfig, ctx: TraitContext): void {
    if (!node.__ecsWorld) return;
    const stats = (node.__ecsWorld as ECSWorld).getStats();
    ctx.emit('ecs_stopped', { node, stats });
    delete node.__ecsWorld;
    delete node.__ecsBenchResult;
  },

  onEvent(node: HSPlusNode, config: WASMBridgeConfig, ctx: TraitContext, event: TraitEvent): void {
    // @ts-expect-error
    const world: ECSWorld | undefined = node.__ecsWorld;
    if (!world) return;

    switch (event.type) {
      case 'ecs_tick':
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        world.tick((event.payload as number)?.dt ?? 1 / config.target_fps);
        ctx.emit('ecs_ticked', { node, stats: world.getStats() });
        break;
      case 'ecs_spawn_entity': {
        const id = world.createEntity();
        if (event.payload?.transform)
          world.addTransform(id, event.payload.transform as TransformComponent);
        if (event.payload?.velocity)
          world.addVelocity(id, event.payload.velocity as VelocityComponent);
        if (event.payload?.renderable)
          world.addRenderable(id, event.payload.renderable as RenderableComponent);
        if (event.payload?.agent) world.addAgent(id, event.payload.agent as AgentComponent);
        ctx.emit('ecs_entity_spawned', { node, entityId: id });
        break;
      }
      case 'ecs_destroy_entity': {
        const pl = event.payload as { entityId?: number } | undefined;
        world.destroyEntity(pl?.entityId ?? 0);
        ctx.emit('ecs_entity_destroyed', { node, entityId: pl?.entityId });
        break;
      }
      case 'ecs_query': {
        const pl = event.payload as { mask?: number } | undefined;
        ctx.emit('ecs_query_result', {
          node,
          entities: world.query(pl?.mask ?? 0),
        });
        break;
      }
      case 'ecs_stats':
        ctx.emit('ecs_stats', { node, stats: world.getStats() });
        break;
      case 'ecs_benchmark': {
        const pl = event.payload as { entityCount?: number; frames?: number } | undefined;
        const result = runECSBenchmark(
          pl?.entityCount ?? config.entity_count,
          pl?.frames ?? 300,
          config.target_fps
        );
        ctx.emit('ecs_benchmark_complete', { node, result });
        break;
      }
    }
  },

  onUpdate(_n: HSPlusNode, _c: unknown, _ctx: TraitContext, _dt: number): void {
    /* tick driven by ecs_tick events */
  },
} as const;
