/**
 * @holoscript/vm-bridge
 *
 * @deprecated This package has been merged into @holoscript/engine (A.011.01k).
 * Use `import { VMBridge } from '@holoscript/engine'` or `import { SpatialCognitiveAgent, ... } from '@holoscript/engine/vm-bridge'` instead.
 *
 * Bridges the HoloVM (spatial scene execution at 60fps) with the uAAL VM
 * (cognitive agent cycles via the 7-phase protocol).
 */

import type {
  ECSWorld,
  TransformComponent,
  GeometryComponent,
  MaterialComponent,
  RigidBodyComponent,
  Vec3,
} from '@holoscript/holo-vm';

import type { UAALVirtualMachine, UAALOperand, VMProxy } from '@holoscript/uaal';

import { UAALOpCode, UAALCompiler } from '@holoscript/uaal';

// =============================================================================
// SCENE SNAPSHOT
// =============================================================================

export interface EntitySnapshot {
  id: number;
  name: string;
  parentId: number;
  childIds: number[];
  traits: number[];
  transform?: TransformComponent;
  geometry?: { type: number; params: Record<string, number> };
  material?: { color: number; metalness: number; roughness: number; opacity: number };
  rigidBody?: { mass: number; bodyType: number; velocity: Vec3 };
}

export interface SceneSnapshot {
  entityCount: number;
  entities: EntitySnapshot[];
  timestamp: number;
}

/**
 * Capture a serializable snapshot of the ECS world
 */
export function captureSceneSnapshot(world: ECSWorld): SceneSnapshot {
  const entities: EntitySnapshot[] = [];

  for (const entity of world.getAllEntities()) {
    const snapshot: EntitySnapshot = {
      id: entity.id,
      name: entity.name,
      parentId: entity.parentId,
      childIds: [...entity.childIds],
      traits: [...entity.traits],
    };

    // Extract known component types (ComponentType enum: Transform=0x01, Geometry=0x02, Material=0x03, RigidBody=0x04)
    const transform = world.getComponent<TransformComponent>(entity.id, 0x01);
    if (transform) snapshot.transform = transform;

    const geometry = world.getComponent<GeometryComponent>(entity.id, 0x02);
    if (geometry) snapshot.geometry = geometry;

    const material = world.getComponent<MaterialComponent>(entity.id, 0x03);
    if (material) snapshot.material = material;

    const rigidBody = world.getComponent<RigidBodyComponent>(entity.id, 0x04);
    if (rigidBody) snapshot.rigidBody = rigidBody;

    entities.push(snapshot);
  }

  return {
    entityCount: entities.length,
    entities,
    timestamp: Date.now(),
  };
}

// =============================================================================
// AGENT ACTIONS
// =============================================================================

export type AgentAction =
  | { type: 'spawn'; name: string; position?: Vec3; geometryType?: number }
  | { type: 'despawn'; entityId: number }
  | { type: 'move'; entityId: number; position: Vec3 }
  | { type: 'setComponent'; entityId: number; componentType: number; data: unknown }
  | { type: 'applyTrait'; entityId: number; traitId: number }
  | { type: 'removeTrait'; entityId: number; traitId: number };

/**
 * Apply a batch of agent actions to the ECS world
 */
export function applyActions(world: ECSWorld, actions: AgentAction[]): number[] {
  const spawnedIds: number[] = [];

  for (const action of actions) {
    switch (action.type) {
      case 'spawn': {
        const id = world.spawn(action.name);
        if (action.position) {
          world.setComponent(id, 0x01, {
            // ComponentType.Transform
            position: action.position,
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          });
        }
        if (action.geometryType !== undefined) {
          world.setComponent(id, 0x02, { type: action.geometryType, params: {} }); // ComponentType.Geometry
        }
        spawnedIds.push(id);
        break;
      }
      case 'despawn':
        world.despawn(action.entityId);
        break;
      case 'move': {
        const existing = world.getComponent<TransformComponent>(action.entityId, 0x01);
        const transform = existing ?? {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        };
        transform.position = action.position;
        world.setComponent(action.entityId, 0x01, transform);
        break;
      }
      case 'setComponent':
        world.setComponent(action.entityId, action.componentType, action.data);
        break;
      case 'applyTrait': {
        const entity = world.getEntity(action.entityId);
        if (entity) {
          entity.traits.add(action.traitId);
          entity.dirty = true;
        }
        break;
      }
      case 'removeTrait': {
        const entity = world.getEntity(action.entityId);
        if (entity) {
          entity.traits.delete(action.traitId);
          entity.dirty = true;
        }
        break;
      }
    }
  }

  return spawnedIds;
}

// =============================================================================
// SPATIAL COGNITIVE AGENT
// =============================================================================

export interface BridgeConfig {
  /** Cognitive cycle frequency in Hz (default: 2 — runs every 500ms) */
  cognitiveHz?: number;
  /** Enable logging */
  enableLogging?: boolean;
  /** Max actions per cognitive tick */
  maxActionsPerTick?: number;
}

export interface CognitiveTickResult {
  perceived: boolean;
  decided: boolean;
  actionsApplied: number;
  sceneSnapshot?: SceneSnapshot;
  cycleResult?: unknown;
}

export class SpatialCognitiveAgent {
  private world: ECSWorld;
  private cognitiveVM: UAALVirtualMachine;
  private compiler: UAALCompiler;
  private config: Required<BridgeConfig>;
  private lastCognitiveTickMs: number = -Infinity;
  private cognitiveIntervalMs: number;
  private pendingActions: AgentAction[] = [];
  private lastSnapshot: SceneSnapshot | null = null;
  private tickCount: number = 0;

  constructor(world: ECSWorld, cognitiveVM: UAALVirtualMachine, config: BridgeConfig = {}) {
    this.world = world;
    this.cognitiveVM = cognitiveVM;
    this.compiler = new UAALCompiler();
    this.config = {
      cognitiveHz: config.cognitiveHz ?? 2,
      enableLogging: config.enableLogging ?? false,
      maxActionsPerTick: config.maxActionsPerTick ?? 50,
    };
    this.cognitiveIntervalMs = 1000 / this.config.cognitiveHz;

    // Register spatial perception handler on INTAKE
    this.cognitiveVM.registerHandler(UAALOpCode.INTAKE, async (proxy) => {
      const snapshot = this.perceive();
      proxy.push(snapshot as unknown as UAALOperand);
    });

    // Register spatial mutation handler on EXECUTE
    this.cognitiveVM.registerHandler(UAALOpCode.EXECUTE, async (proxy) => {
      const actions = this.pendingActions.splice(0, this.config.maxActionsPerTick);
      const spawned = this.mutate(actions);
      proxy.push({
        executed: true,
        actionsApplied: actions.length,
        spawnedIds: spawned,
      } as unknown as UAALOperand);
    });

    // Register HoloScript integration opcodes
    this.cognitiveVM.registerHandler(UAALOpCode.OP_EXECUTE_HOLOSCRIPT, async (proxy) => {
      proxy.push(this.perceive() as unknown as UAALOperand);
    });

    this.cognitiveVM.registerHandler(
      UAALOpCode.OP_SPATIAL_ANCHOR,
      async (proxy: VMProxy, operands?: UAALOperand[]) => {
        const name = (operands?.[0] as string) ?? 'anchor';
        const x = (operands?.[1] as number) ?? 0;
        const y = (operands?.[2] as number) ?? 0;
        const z = (operands?.[3] as number) ?? 0;
        const id = this.world.spawn(name);
        this.world.setComponent(id, 0x01, {
          // ComponentType.Transform
          position: { x, y, z },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        });
        proxy.push(id);
      }
    );

    this.cognitiveVM.registerHandler(
      UAALOpCode.OP_RENDER_HOLOGRAM,
      async (proxy: VMProxy, operands?: UAALOperand[]) => {
        const entityId = (operands?.[0] as number) ?? 0;
        const geoType = (operands?.[1] as number) ?? 0;
        const color = (operands?.[2] as number) ?? 0x00ffff;
        this.world.setComponent(entityId, 0x02, { type: geoType, params: {} }); // ComponentType.Geometry
        this.world.setComponent(entityId, 0x03, {
          color,
          metalness: 0.3,
          roughness: 0.4,
          emissive: 0,
          opacity: 0.8,
        }); // ComponentType.Material
        proxy.push({ rendered: true, entityId });
      }
    );

    this.cognitiveVM.registerHandler(
      UAALOpCode.OP_VR_TELEPORT,
      async (proxy: VMProxy, operands?: UAALOperand[]) => {
        const entityId = (operands?.[0] as number) ?? 0;
        const x = (operands?.[1] as number) ?? 0;
        const y = (operands?.[2] as number) ?? 0;
        const z = (operands?.[3] as number) ?? 0;
        this.world.setComponent(entityId, 0x01, {
          // ComponentType.Transform
          position: { x, y, z },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        });
        proxy.push({ teleported: true, entityId, position: { x, y, z } });
      }
    );

    if (this.config.enableLogging) {
      console.log(`[vm-bridge] Agent initialized (cognitive: ${this.config.cognitiveHz}Hz)`);
    }
  }

  // ── Core API ──────────────────────────────────────────────────────────────

  /**
   * Snapshot the ECS world for agent perception
   */
  perceive(): SceneSnapshot {
    this.lastSnapshot = captureSceneSnapshot(this.world);
    return this.lastSnapshot;
  }

  /**
   * Run a cognitive cycle (7-phase) with the current scene as context
   */
  async decide(task: string): Promise<unknown> {
    const bytecode = this.compiler.buildFullCycle(task);
    const result = await this.cognitiveVM.execute(bytecode, {
      task,
      sceneEntityCount: this.world.entityCount,
      timestamp: Date.now(),
    });
    return result;
  }

  /**
   * Apply agent actions to the ECS world
   */
  mutate(actions: AgentAction[]): number[] {
    return applyActions(this.world, actions);
  }

  /**
   * Queue actions for the next cognitive tick
   */
  queueAction(action: AgentAction): void {
    this.pendingActions.push(action);
  }

  /**
   * Queue multiple actions
   */
  queueActions(actions: AgentAction[]): void {
    this.pendingActions.push(...actions);
  }

  /**
   * Main tick — called each frame. Runs cognitive cycle at configured frequency.
   * Returns whether a cognitive tick was performed.
   */
  async tick(currentTimeMs: number): Promise<CognitiveTickResult> {
    this.tickCount++;
    const elapsed = currentTimeMs - this.lastCognitiveTickMs;

    if (elapsed < this.cognitiveIntervalMs) {
      return { perceived: false, decided: false, actionsApplied: 0 };
    }

    this.lastCognitiveTickMs = currentTimeMs;

    // 1. Perceive
    const snapshot = this.perceive();

    // 2. Decide (run 7-phase cycle)
    const cycleResult = await this.decide(`Tick ${this.tickCount}: observe and act`);

    // 3. Mutate (apply queued actions)
    const actions = this.pendingActions.splice(0, this.config.maxActionsPerTick);
    const _spawned = this.mutate(actions);

    return {
      perceived: true,
      decided: true,
      actionsApplied: actions.length,
      sceneSnapshot: snapshot,
      cycleResult,
    };
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getLastSnapshot(): SceneSnapshot | null {
    return this.lastSnapshot;
  }
  getPendingActionCount(): number {
    return this.pendingActions.length;
  }
  getTickCount(): number {
    return this.tickCount;
  }
}
