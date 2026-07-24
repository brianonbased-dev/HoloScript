/**
 * VM Bridge
 *
 * Bridges the HoloVM (spatial scene execution at 60fps) with the uAAL VM
 * (cognitive agent cycles via the 7-phase protocol).
 *
 * Key concepts:
 *   - SceneSnapshot: serializable view of the ECS world
 *   - AgentAction: typed mutation the agent wants to apply to the scene
 *   - SpatialCognitiveAgent: the core bridge — perceive → decide → mutate
 *   - registerSpatialHandlers: wires uAAL spatial opcodes to HoloVM
 *
 * @packageDocumentation
 */

import type {
  HoloVM,
  ECSWorld,
  Entity,
  TransformComponent,
  GeometryComponent,
  MaterialComponent,
  RigidBodyComponent,
  Vec3,
} from '../vm/executor';

import type {
  UAALVirtualMachine,
  UAALOperand,
  VMProxy,
  UAALBytecode,
  UAALExecutionLog,
} from '@holoscript/uaal';
import type { N4TypedMoveAction, N4ResidualTarget } from '@holoscript/core/world-model';
import { createRequire } from 'node:module';

// ---------------------------------------------------------------------------
// Lazy optional-peer loader for @holoscript/uaal
//
// @holoscript/uaal is an OPTIONAL peerDependency. A top-level value import of
// it (the enum UAALOpCode and the class UAALCompiler) used to be evaluated at
// module load — which pulled uaal into the root barrel and made a bare
// `import '@holoscript/engine'` throw "Cannot find package '@holoscript/uaal'"
// for consumers who never installed the optional peer.
//
// The VMBridge is only usable when the consumer hands it a UAALVirtualMachine,
// which they can only obtain from uaal. So we load uaal lazily on first use and
// fail with a clear, actionable message if it is absent — failing-on-use, not
// on-load. This keeps the root barrel loadable without uaal installed.
// ---------------------------------------------------------------------------

interface UaalModule {
  UAALOpCode: typeof import('@holoscript/uaal').UAALOpCode;
  UAALCompiler: typeof import('@holoscript/uaal').UAALCompiler;
}

let _uaal: UaalModule | undefined;

/**
 * Resolve a CommonJS-style `require` that works in BOTH build outputs:
 *  - CJS output: esbuild defines `__filename` and rewrites `import.meta` to
 *    `{}`, so bind `createRequire` to the emitted filename.
 *  - ESM output: there is no native `require`, but `import.meta.url` is real,
 *    so derive one via `createRequire`.
 *
 * Do not branch on `typeof require`: esbuild replaces that identifier with an
 * always-present ESM shim which throws for dynamic package loads.
 */
function getRequire(): NodeRequire {
  return createRequire(
    typeof __filename !== 'undefined' ? __filename : import.meta.url
  );
}

function lazyUaal(): UaalModule {
  if (_uaal === undefined) {
    try {
      const req = getRequire();
      _uaal = req('@holoscript/uaal') as UaalModule;
    } catch {
      throw new Error(
        "VMBridge requires the optional peer dependency '@holoscript/uaal', which is not installed. " +
          'Install it (e.g. `npm install @holoscript/uaal`) to use SpatialCognitiveAgent and the VM bridge.'
      );
    }
  }
  return _uaal;
}

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
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
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
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
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
  /**
   * Pre-compiled uAAL program to run each cognitive cycle. When provided,
   * {@link SpatialCognitiveAgent.decide} executes this bytecode instead of
   * the default 7-phase `buildFullCycle(task)`. This is the channel a
   * marketplace-acquired agent template flows through: the acquired uAAL
   * program drives the agent's behavior instead of a generic observe-and-act
   * cycle.
   */
  program?: UAALBytecode;
}

export interface CognitiveTickResult {
  perceived: boolean;
  decided: boolean;
  actionsApplied: number;
  sceneSnapshot?: SceneSnapshot;
  cycleResult?: unknown;
}

export interface N4RoundTripCustody {
  readonly sourceDigest: string;
  readonly graphDigest: string;
  readonly modelDigest: string;
}

export interface N4OwnedRuntimeRoundTrip {
  readonly kind: 'N4OwnedRuntimeRoundTrip';
  readonly actionDigest: string;
  readonly entityId: number;
  readonly entityName: string;
  readonly before: Vec3;
  readonly after: Vec3;
  readonly uaalProgram: UAALBytecode;
  readonly uaalLog: UAALExecutionLog;
  readonly uaalTaskStatus: string;
  readonly mutationApplied: boolean;
}

export class SpatialCognitiveAgent {
  private world: ECSWorld;
  private cognitiveVM: UAALVirtualMachine;
  private compiler: import('@holoscript/uaal').UAALCompiler;
  private config: Required<Omit<BridgeConfig, 'program'>>;
  private program?: UAALBytecode;
  private lastCognitiveTickMs: number = -Infinity;
  private cognitiveIntervalMs: number;
  private pendingActions: AgentAction[] = [];
  private lastSnapshot: SceneSnapshot | null = null;
  private tickCount: number = 0;

  constructor(world: ECSWorld, cognitiveVM: UAALVirtualMachine, config: BridgeConfig = {}) {
    const { UAALOpCode, UAALCompiler } = lazyUaal();
    this.world = world;
    this.cognitiveVM = cognitiveVM;
    this.compiler = new UAALCompiler();
    this.config = {
      cognitiveHz: config.cognitiveHz ?? 2,
      enableLogging: config.enableLogging ?? false,
      maxActionsPerTick: config.maxActionsPerTick ?? 50,
    };
    this.program = config.program;
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
          position: [x, y, z],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
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
          position: [x, y, z],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        });
        proxy.push({ teleported: true, entityId, position: [x, y, z] });
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
   * Run a cognitive cycle with the current scene as context.
   *
   * If a pre-compiled {@link BridgeConfig.program} was supplied (e.g. a
   * marketplace-acquired uAAL template), that bytecode is executed; otherwise
   * the default 7-phase `buildFullCycle(task)` runs.
   */
  async decide(task: string): Promise<unknown> {
    const bytecode = this.program ?? this.compiler.buildFullCycle(task);
    const result = await this.cognitiveVM.execute(bytecode, {
      task,
      sceneEntityCount: this.world.entityCount,
      timestamp: Date.now(),
    });
    return result;
  }

  /**
   * Replace the agent's standing program at runtime. Pass `undefined` to fall
   * back to the default 7-phase cycle.
   */
  setProgram(program: UAALBytecode | undefined): void {
    this.program = program;
  }

  getProgram(): UAALBytecode | undefined {
    return this.program;
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

const N4_CLOSED_RESIDUAL_SCOPE: readonly N4ResidualTarget[] = Object.freeze([
  'object.drag',
  'event.gust',
  'event.contact',
]);

function sameN4ResidualScope(scope: readonly N4ResidualTarget[]): boolean {
  return (
    scope.length === N4_CLOSED_RESIDUAL_SCOPE.length &&
    scope.every((target, index) => target === N4_CLOSED_RESIDUAL_SCOPE[index])
  );
}

/**
 * Execute one compiler-bound N4 typed move through the real uAAL VM and the
 * existing HoloVM ECS mutation bridge.
 *
 * Security is lexical/structural: this adapter accepts only the closed `move`
 * action and the three compiler-declared residual targets. It exposes no
 * arbitrary opcode, component, host callback, filesystem, or process concept
 * to the learned processor.
 */
export async function executeN4TypedMoveRoundTrip(
  holoVM: HoloVM,
  cognitiveVM: UAALVirtualMachine,
  action: N4TypedMoveAction,
  expected: N4RoundTripCustody
): Promise<N4OwnedRuntimeRoundTrip> {
  if ((action as { type?: unknown }).type !== 'move') {
    throw new Error('N4 runtime admits only the typed move action');
  }
  if (
    action.sourceDigest !== expected.sourceDigest ||
    action.graphDigest !== expected.graphDigest ||
    action.modelDigest !== expected.modelDigest
  ) {
    throw new Error('N4 runtime custody digest mismatch');
  }
  if (!sameN4ResidualScope(action.residualScope)) {
    throw new Error('N4 runtime rejected undeclared or reordered residual scope');
  }
  if (!Number.isFinite(action.confidence) || action.confidence < 0.5 || action.confidence > 1) {
    throw new Error('N4 runtime rejected invalid or insufficient confidence');
  }
  if (!Number.isFinite(action.position.x) || !Number.isFinite(action.position.y)) {
    throw new Error('N4 runtime rejected non-finite position');
  }

  const matches = holoVM.world
    .getAllEntities()
    .filter((entity) => entity.alive && entity.name === action.entityId);
  if (matches.length !== 1) {
    throw new Error(
      `N4 runtime target "${action.entityId}" must resolve to exactly one living HoloVM entity`
    );
  }
  const entity = matches[0]!;
  const transform = holoVM.world.getComponent<TransformComponent>(entity.id, 0x01);
  if (!transform) throw new Error(`N4 runtime target "${action.entityId}" has no Transform component`);
  const before: Vec3 = [...transform.position];

  const { UAALOpCode } = lazyUaal();
  const program: UAALBytecode = {
    version: 1,
    instructions: [
      { opCode: UAALOpCode.PUSH, operands: [action as unknown as UAALOperand] },
      { opCode: UAALOpCode.EXECUTE },
      { opCode: UAALOpCode.HALT },
    ],
  };
  const agent = new SpatialCognitiveAgent(holoVM.world, cognitiveVM, {
    cognitiveHz: 1,
    maxActionsPerTick: 1,
    program,
  });
  agent.queueAction({
    type: 'move',
    entityId: entity.id,
    position: [action.position.x, action.position.y, before[2]],
  });
  const result = await agent.decide('execute compiler-bound N4 move');
  const afterTransform = holoVM.world.getComponent<TransformComponent>(entity.id, 0x01);
  if (!afterTransform) throw new Error('N4 runtime mutation removed the target Transform');
  const after: Vec3 = [...afterTransform.position];
  const mutationApplied =
    after[0] === action.position.x &&
    after[1] === action.position.y &&
    after[2] === before[2];
  if (!mutationApplied) throw new Error('N4 runtime action did not produce the declared HoloVM mutation');

  let uaalLog: UAALExecutionLog;
  try {
    uaalLog = cognitiveVM.exportLog();
  } catch {
    throw new Error('N4 runtime requires UAALVirtualMachine({ recordLog: true })');
  }
  const taskStatus =
    typeof result === 'object' && result !== null && 'taskStatus' in result
      ? String((result as { taskStatus: unknown }).taskStatus)
      : 'unknown';
  return {
    kind: 'N4OwnedRuntimeRoundTrip',
    actionDigest: action.deterministicDigest,
    entityId: entity.id,
    entityName: entity.name,
    before,
    after,
    uaalProgram: program,
    uaalLog,
    uaalTaskStatus: taskStatus,
    mutationApplied,
  };
}
