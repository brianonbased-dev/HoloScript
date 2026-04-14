/**
 * HOLO VM Executor
 *
 * Stack-based bytecode execution engine for spatial scene execution.
 * Runs compiled .holob bytecode at 90fps tick rate.
 *
 * Architecture:
 *   - ECS World: entity/component storage
 *   - Stack: operand stack per call frame
 *   - Registers: local variable storage per function
 *   - Call Stack: function call frames
 *   - Event Queue: deferred event dispatch
 *   - Timer Queue: scheduled delayed actions
 */

import { HoloOpCode, ComponentType, GeometryType, getOpcodeName, isControlFlow } from './opcodes';
import type {
  HoloBytecode,
  HoloInstruction,
  HoloOperand,
  HoloFunction,
  HoloEntityDef,
} from './bytecode';

// =============================================================================
// ECS WORLD
// =============================================================================

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export interface TransformComponent {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export interface GeometryComponent {
  type: GeometryType;
  params: Record<string, number>;
}

export interface MaterialComponent {
  color: number;
  metalness: number;
  roughness: number;
  emissive: number;
  opacity: number;
}

export interface RigidBodyComponent {
  mass: number;
  bodyType: number;
  velocity: Vec3;
  angularVelocity: Vec3;
}

export interface Entity {
  id: number;
  name: string;
  parentId: number;
  childIds: number[];
  components: Map<number, unknown>;
  traits: Set<number>;
  alive: boolean;
  dirty: boolean;
}

export class ECSWorld {
  private entities: Map<number, Entity> = new Map();
  private nextEntityId: number = 1;
  private archetypeIndex: Map<number, Set<number>> = new Map();

  /**
   * Spawn a new entity
   */
  spawn(name: string, archetype: number = 0): number {
    const id = this.nextEntityId++;
    const entity: Entity = {
      id,
      name,
      parentId: -1,
      childIds: [],
      components: new Map(),
      traits: new Set(),
      alive: true,
      dirty: true,
    };
    this.entities.set(id, entity);

    // Track archetype
    if (!this.archetypeIndex.has(archetype)) {
      this.archetypeIndex.set(archetype, new Set());
    }
    this.archetypeIndex.get(archetype)!.add(id);

    return id;
  }

  /**
   * Despawn an entity and its children
   */
  despawn(entityId: number): boolean {
    const entity = this.entities.get(entityId);
    if (!entity) return false;

    // Recursively despawn children
    for (const childId of [...entity.childIds]) {
      this.despawn(childId);
    }

    // Remove from parent
    if (entity.parentId !== -1) {
      const parent = this.entities.get(entity.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter((id) => id !== entityId);
      }
    }

    entity.alive = false;
    this.entities.delete(entityId);
    return true;
  }

  /**
   * Set a component on an entity
   */
  setComponent(entityId: number, componentType: number, data: unknown): boolean {
    const entity = this.entities.get(entityId);
    if (!entity) return false;
    entity.components.set(componentType, data);
    entity.dirty = true;
    return true;
  }

  /**
   * Get a component from an entity
   */
  getComponent<T = unknown>(entityId: number, componentType: number): T | undefined {
    const entity = this.entities.get(entityId);
    if (!entity) return undefined;
    return entity.components.get(componentType) as T | undefined;
  }

  /**
   * Remove a component from an entity
   */
  removeComponent(entityId: number, componentType: number): boolean {
    const entity = this.entities.get(entityId);
    if (!entity) return false;
    entity.dirty = true;
    return entity.components.delete(componentType);
  }

  /**
   * Set parent-child relationship
   */
  setParent(childId: number, parentId: number): boolean {
    const child = this.entities.get(childId);
    const parent = this.entities.get(parentId);
    if (!child || !parent) return false;

    // Remove from current parent
    if (child.parentId !== -1) {
      const oldParent = this.entities.get(child.parentId);
      if (oldParent) {
        oldParent.childIds = oldParent.childIds.filter((id) => id !== childId);
      }
    }

    child.parentId = parentId;
    parent.childIds.push(childId);
    child.dirty = true;
    return true;
  }

  /**
   * Query entities by archetype mask
   */
  queryArchetype(mask: number): number[] {
    const set = this.archetypeIndex.get(mask);
    return set ? [...set] : [];
  }

  /**
   * Get entity by ID
   */
  getEntity(entityId: number): Entity | undefined {
    return this.entities.get(entityId);
  }

  /**
   * Get all dirty entities and clear dirty flags
   */
  flushDirty(): Entity[] {
    const dirty: Entity[] = [];
    for (const entity of this.entities.values()) {
      if (entity.dirty) {
        dirty.push(entity);
        entity.dirty = false;
      }
    }
    return dirty;
  }

  /**
   * Get all living entities
   */
  getAllEntities(): Entity[] {
    return [...this.entities.values()];
  }

  /**
   * Get entity count
   */
  get entityCount(): number {
    return this.entities.size;
  }
}

// =============================================================================
// CALL FRAME
// =============================================================================

interface CallFrame {
  functionIndex: number;
  pc: number;
  registers: HoloOperand[];
  stackBase: number;
}

// =============================================================================
// TIMER ENTRY
// =============================================================================

interface TimerEntry {
  triggerTimeMs: number;
  handlerFunctionIndex: number;
}

// =============================================================================
// VM EXECUTION STATUS
// =============================================================================

export enum VMStatus {
  Idle = 'IDLE',
  Running = 'RUNNING',
  Yielded = 'YIELDED',
  Halted = 'HALTED',
  Error = 'ERROR',
}

// =============================================================================
// VM EXECUTION RESULT
// =============================================================================

export interface VMResult {
  status: VMStatus;
  stackTop: HoloOperand;
  tickCount: number;
  entityCount: number;
  error?: string;
}

// =============================================================================
// HOLO VM EXECUTOR
// =============================================================================

export class HoloVM {
  // Core state
  private bytecode: HoloBytecode | null = null;
  public readonly world: ECSWorld = new ECSWorld();

  // Execution state
  private stack: HoloOperand[] = [];
  private callStack: CallFrame[] = [];
  private status: VMStatus = VMStatus.Idle;
  private tickCount: number = 0;

  // Timer system
  private timers: TimerEntry[] = [];
  private currentTimeMs: number = 0;

  // Event queue
  private eventQueue: Array<{ eventType: number; payload: HoloOperand[] }> = [];

  // Limits
  private maxStackSize: number = 4096;
  private maxCallDepth: number = 256;
  private maxInstructionsPerTick: number = 10_000;

  /**
   * Load a bytecode module into the VM
   */
  load(bytecode: HoloBytecode): void {
    this.bytecode = bytecode;
    this.reset();
    this.initializeEntities();
  }

  /**
   * Reset VM state without unloading bytecode
   */
  reset(): void {
    this.stack = [];
    this.callStack = [];
    this.status = VMStatus.Idle;
    this.tickCount = 0;
    this.timers = [];
    this.currentTimeMs = 0;
    this.eventQueue = [];
  }

  /**
   * Initialize entities from the bytecode's init section
   */
  private initializeEntities(): void {
    if (!this.bytecode) return;

    for (const entityDef of this.bytecode.entities) {
      const name = this.bytecode.strings[entityDef.nameIndex] ?? `entity_${entityDef.nameIndex}`;
      const entityId = this.world.spawn(name, entityDef.archetype);

      // Set initial components
      for (const comp of entityDef.components) {
        this.world.setComponent(entityId, comp.componentType, comp.values);
      }

      // Set parent if specified
      if (entityDef.parentIndex >= 0) {
        // Entity indices are 1-based in the world
        this.world.setParent(entityId, entityDef.parentIndex + 1);
      }
    }
  }

  /**
   * Execute one tick of the VM (called at ~90fps)
   *
   * Each tick:
   * 1. Process expired timers
   * 2. Dispatch queued events
   * 3. Resume execution from yield point (or run init)
   * 4. Return dirty entities for rendering
   */
  tick(deltaMs: number): VMResult {
    if (!this.bytecode) {
      return {
        status: VMStatus.Error,
        stackTop: null,
        tickCount: this.tickCount,
        entityCount: 0,
        error: 'No bytecode loaded',
      };
    }

    this.tickCount++;
    this.currentTimeMs += deltaMs;

    // 1. Process timers
    this.processTimers();

    // 2. Dispatch events
    this.dispatchEvents();

    // 3. Resume or start execution
    if (this.status === VMStatus.Yielded) {
      this.status = VMStatus.Running;
      this.executeInstructions();
    } else if (this.status === VMStatus.Idle && this.bytecode.functions.length > 0) {
      // Start at function 0 (main/init)
      this.callFunction(0);
      this.executeInstructions();
    }

    return {
      status: this.status,
      stackTop: this.stack.length > 0 ? this.stack[this.stack.length - 1] : null,
      tickCount: this.tickCount,
      entityCount: this.world.entityCount,
    };
  }

  /**
   * Main execution loop — runs until YIELD, HALT, or instruction limit
   */
  private executeInstructions(): void {
    if (!this.bytecode) return;

    let instructionsExecuted = 0;

    while (this.status === VMStatus.Running && instructionsExecuted < this.maxInstructionsPerTick) {
      const frame = this.currentFrame;
      if (!frame) {
        this.status = VMStatus.Halted;
        break;
      }

      const func = this.bytecode.functions[frame.functionIndex];
      if (!func || frame.pc >= func.instructions.length) {
        // End of function — return
        this.callStack.pop();
        if (this.callStack.length === 0) {
          this.status = VMStatus.Halted;
        }
        break;
      }

      const instr = func.instructions[frame.pc];
      frame.pc++;
      instructionsExecuted++;

      try {
        this.executeInstruction(instr, frame);
      } catch (_err) {
        this.status = VMStatus.Error;
        break;
      }

      if (this.status !== VMStatus.Running) break;
    }
  }

  /**
   * Execute a single instruction
   */
  private executeInstruction(instr: HoloInstruction, frame: CallFrame): void {
    const op = instr.opcode;
    const operands = instr.operands;

    switch (op) {
      // ── Entity Operations ───────────────────────────────────────────────
      case HoloOpCode.SPAWN: {
        const entityType = operands[0] as number;
        const nameIdx = operands[1] as number;
        const name = this.getString(nameIdx);
        const id = this.world.spawn(name, entityType);
        this.push(id);
        break;
      }
      case HoloOpCode.DESPAWN: {
        const entityId = operands[0] as number;
        this.world.despawn(entityId);
        break;
      }
      case HoloOpCode.SET_COMPONENT: {
        const entityId = operands[0] as number;
        const compType = operands[1] as number;
        const data = operands.slice(2);
        this.world.setComponent(entityId, compType, data);
        break;
      }
      case HoloOpCode.GET_COMPONENT: {
        const entityId = operands[0] as number;
        const compType = operands[1] as number;
        const data = this.world.getComponent(entityId, compType);
        this.push((data as HoloOperand) ?? null);
        break;
      }
      case HoloOpCode.REMOVE_COMPONENT: {
        const entityId = operands[0] as number;
        const compType = operands[1] as number;
        this.world.removeComponent(entityId, compType);
        break;
      }
      case HoloOpCode.SET_PARENT: {
        const childId = operands[0] as number;
        const parentId = operands[1] as number;
        this.world.setParent(childId, parentId);
        break;
      }
      case HoloOpCode.QUERY: {
        const mask = operands[0] as number;
        const entities = this.world.queryArchetype(mask);
        this.push(entities);
        break;
      }

      // ── Spatial Operations ──────────────────────────────────────────────
    case HoloOpCode.TRANSFORM: {
        const entityId = operands[0] as number;
        const transform: TransformComponent = {
          position: [operands[1] as number, operands[2] as number, operands[3] as number],
          rotation: [
            operands[4] as number,
            operands[5] as number,
            operands[6] as number,
            operands[7] as number,
          ],
          scale: [operands[8] as number, operands[9] as number, operands[10] as number],
        };
        this.world.setComponent(entityId, ComponentType.Transform, transform);
        break;
      }
      case HoloOpCode.TRANSLATE: {
        const entityId = operands[0] as number;
        const existing = this.world.getComponent<TransformComponent>(
          entityId,
          ComponentType.Transform
        );
        if (existing) {
          existing.position[0] += operands[1] as number;
          existing.position[1] += operands[2] as number;
          existing.position[2] += operands[3] as number;
          this.world.setComponent(entityId, ComponentType.Transform, existing);
        }
        break;
      }
      case HoloOpCode.ROTATE: {
        const entityId = operands[0] as number;
        this.world.setComponent(entityId, ComponentType.Transform, {
          position: [0, 0, 0],
          rotation: [
            operands[1] as number,
            operands[2] as number,
            operands[3] as number,
            operands[4] as number,
          ],
          scale: [1, 1, 1],
        });
        break;
      }
      case HoloOpCode.SET_GEOMETRY: {
        const entityId = operands[0] as number;
        const geoType = operands[1] as number;
        this.world.setComponent(entityId, ComponentType.Geometry, { type: geoType, params: {} });
        break;
      }
      case HoloOpCode.SET_MATERIAL: {
        const entityId = operands[0] as number;
        const material: MaterialComponent = {
          color: (operands[1] as number) ?? 0xffffff,
          metalness: (operands[2] as number) ?? 0.0,
          roughness: (operands[3] as number) ?? 0.5,
          emissive: (operands[4] as number) ?? 0x000000,
          opacity: (operands[5] as number) ?? 1.0,
        };
        this.world.setComponent(entityId, ComponentType.Material, material);
        break;
      }
      case HoloOpCode.SET_VISIBLE: {
        const entityId = operands[0] as number;
        const _visible = operands[1] !== 0;
        const entity = this.world.getEntity(entityId);
        if (entity) entity.dirty = true;
        break;
      }
      case HoloOpCode.SET_LIGHT: {
        const entityId = operands[0] as number;
        const lightType = operands[1] as number;
        this.world.setComponent(entityId, ComponentType.Light, {
          type: lightType,
          params: operands.slice(2),
        });
        break;
      }

      // ── Physics Operations ──────────────────────────────────────────────
      case HoloOpCode.ADD_RIGIDBODY: {
        const entityId = operands[0] as number;
        const rb: RigidBodyComponent = {
          mass: operands[1] as number,
          bodyType: operands[2] as number,
          velocity: [0, 0, 0],
          angularVelocity: [0, 0, 0],
        };
        this.world.setComponent(entityId, ComponentType.RigidBody, rb);
        break;
      }
      case HoloOpCode.APPLY_FORCE: {
        const entityId = operands[0] as number;
        const rb = this.world.getComponent<RigidBodyComponent>(entityId, ComponentType.RigidBody);
        if (rb && rb.mass > 0) {
          const dt = 1 / 90; // Assume 90fps
          rb.velocity[0] += ((operands[1] as number) / rb.mass) * dt;
          rb.velocity[1] += ((operands[2] as number) / rb.mass) * dt;
          rb.velocity[2] += ((operands[3] as number) / rb.mass) * dt;
          this.world.setComponent(entityId, ComponentType.RigidBody, rb);
        }
        break;
      }
      case HoloOpCode.APPLY_IMPULSE: {
        const entityId = operands[0] as number;
        const rb = this.world.getComponent<RigidBodyComponent>(entityId, ComponentType.RigidBody);
        if (rb && rb.mass > 0) {
          rb.velocity[0] += (operands[1] as number) / rb.mass;
          rb.velocity[1] += (operands[2] as number) / rb.mass;
          rb.velocity[2] += (operands[3] as number) / rb.mass;
          this.world.setComponent(entityId, ComponentType.RigidBody, rb);
        }
        break;
      }
      case HoloOpCode.SET_VELOCITY: {
        const entityId = operands[0] as number;
        const rb = this.world.getComponent<RigidBodyComponent>(entityId, ComponentType.RigidBody);
        if (rb) {
          rb.velocity = [
            operands[1] as number,
            operands[2] as number,
            operands[3] as number,
          ];
          this.world.setComponent(entityId, ComponentType.RigidBody, rb);
        }
        break;
      }
      case HoloOpCode.SET_GRAVITY: {
        // Store as world-level metadata
        this.world.setComponent(0, 0xff, [operands[0], operands[1], operands[2] ]);
        break;
      }

      // ── Trait Operations ────────────────────────────────────────────────
      case HoloOpCode.APPLY_TRAIT: {
        const entityId = operands[0] as number;
        const traitId = operands[1] as number;
        const entity = this.world.getEntity(entityId);
        if (entity) {
          entity.traits.add(traitId);
          entity.dirty = true;
        }
        break;
      }
      case HoloOpCode.REMOVE_TRAIT: {
        const entityId = operands[0] as number;
        const traitId = operands[1] as number;
        const entity = this.world.getEntity(entityId);
        if (entity) {
          entity.traits.delete(traitId);
          entity.dirty = true;
        }
        break;
      }
      case HoloOpCode.EMIT_EVENT: {
        const eventType = operands[0] as number;
        const payload = operands.slice(1);
        this.eventQueue.push({ eventType, payload });
        break;
      }

      // ── Control Flow ────────────────────────────────────────────────────
      case HoloOpCode.NOP:
        break;
      case HoloOpCode.JUMP: {
        frame.pc = operands[0] as number;
        break;
      }
      case HoloOpCode.JUMP_IF: {
        const condition = this.pop();
        if (condition) {
          frame.pc = operands[0] as number;
        }
        break;
      }
      case HoloOpCode.CALL: {
        const funcIdx = operands[0] as number;
        this.callFunction(funcIdx);
        break;
      }
      case HoloOpCode.RETURN: {
        this.callStack.pop();
        if (this.callStack.length === 0) {
          this.status = VMStatus.Halted;
        }
        break;
      }
      case HoloOpCode.PUSH: {
        this.push(operands[0]);
        break;
      }
      case HoloOpCode.POP: {
        this.pop();
        break;
      }
      case HoloOpCode.STORE: {
        const regIdx = operands[0] as number;
        const value = this.pop();
        if (regIdx < frame.registers.length) {
          frame.registers[regIdx] = value;
        }
        break;
      }
      case HoloOpCode.LOAD: {
        const regIdx = operands[0] as number;
        if (regIdx < frame.registers.length) {
          this.push(frame.registers[regIdx]);
        } else {
          this.push(null);
        }
        break;
      }
      case HoloOpCode.HALT: {
        this.status = VMStatus.Halted;
        break;
      }
      case HoloOpCode.YIELD: {
        this.status = VMStatus.Yielded;
        break;
      }
      case HoloOpCode.TIMER: {
        const delayMs = operands[0] as number;
        const handlerFunc = operands[1] as number;
        this.timers.push({
          triggerTimeMs: this.currentTimeMs + delayMs,
          handlerFunctionIndex: handlerFunc,
        });
        break;
      }

      // ── Arithmetic ──────────────────────────────────────────────────────
      case HoloOpCode.ADD: {
        const b = this.pop() as number;
        const a = this.pop() as number;
        this.push((a ?? 0) + (b ?? 0));
        break;
      }
      case HoloOpCode.SUB: {
        const b = this.pop() as number;
        const a = this.pop() as number;
        this.push((a ?? 0) - (b ?? 0));
        break;
      }
      case HoloOpCode.MUL: {
        const b = this.pop() as number;
        const a = this.pop() as number;
        this.push((a ?? 0) * (b ?? 0));
        break;
      }
      case HoloOpCode.DIV: {
        const b = this.pop() as number;
        const a = this.pop() as number;
        this.push(b !== 0 ? (a ?? 0) / b : 0);
        break;
      }

      // ── Comparison ──────────────────────────────────────────────────────
      case HoloOpCode.CMP_EQ: {
        const b = this.pop();
        const a = this.pop();
        this.push(a === b ? 1 : 0);
        break;
      }
      case HoloOpCode.CMP_LT: {
        const b = this.pop() as number;
        const a = this.pop() as number;
        this.push(a < b ? 1 : 0);
        break;
      }
      case HoloOpCode.CMP_GT: {
        const b = this.pop() as number;
        const a = this.pop() as number;
        this.push(a > b ? 1 : 0);
        break;
      }
      case HoloOpCode.NOT: {
        const val = this.pop();
        this.push(val ? 0 : 1);
        break;
      }

      // ── Agent Bridge (stubs — filled in by host integration) ────────────
      case HoloOpCode.AGENT_INVOKE:
      case HoloOpCode.AGENT_READ:
      case HoloOpCode.AGENT_SUBSCRIBE:
      case HoloOpCode.DIALOG_SHOW:
      case HoloOpCode.QUEST_UPDATE:
        // These are handled by the host layer via registered callbacks
        this.push(null);
        break;

      // ── I/O (stubs — filled in by host integration) ─────────────────────
      case HoloOpCode.LOAD_ASSET:
      case HoloOpCode.PLAY_AUDIO:
      case HoloOpCode.NET_SYNC:
      case HoloOpCode.NET_SEND:
      case HoloOpCode.NET_RECV:
      case HoloOpCode.XR_INPUT:
      case HoloOpCode.HAPTIC:
        this.push(null);
        break;

      // ── Spatial queries (stubs — need spatial index) ─────────────────────
      case HoloOpCode.RAYCAST:
      case HoloOpCode.QUERY_BOX:
      case HoloOpCode.QUERY_SPHERE:
      case HoloOpCode.FIND_PATH:
      case HoloOpCode.GET_ZONE:
        this.push(null);
        break;

      default:
        // Unknown opcode — skip
        break;
    }
  }

  // ── Stack operations ──────────────────────────────────────────────────────

  private push(value: HoloOperand): void {
    if (this.stack.length >= this.maxStackSize) {
      this.status = VMStatus.Error;
      return;
    }
    this.stack.push(value);
  }

  private pop(): HoloOperand {
    return this.stack.pop() ?? null;
  }

  // ── Call frame management ─────────────────────────────────────────────────

  private get currentFrame(): CallFrame | undefined {
    return this.callStack[this.callStack.length - 1];
  }

  private callFunction(funcIdx: number): void {
    if (!this.bytecode) return;
    if (this.callStack.length >= this.maxCallDepth) {
      this.status = VMStatus.Error;
      return;
    }

    const func = this.bytecode.functions[funcIdx];
    if (!func) {
      this.status = VMStatus.Error;
      return;
    }

    const frame: CallFrame = {
      functionIndex: funcIdx,
      pc: 0,
      registers: new Array(func.registerCount).fill(null),
      stackBase: this.stack.length,
    };

    this.callStack.push(frame);
    this.status = VMStatus.Running;
  }

  // ── Timer processing ──────────────────────────────────────────────────────

  private processTimers(): void {
    const expired: TimerEntry[] = [];
    this.timers = this.timers.filter((t) => {
      if (t.triggerTimeMs <= this.currentTimeMs) {
        expired.push(t);
        return false;
      }
      return true;
    });

    for (const timer of expired) {
      this.callFunction(timer.handlerFunctionIndex);
      this.executeInstructions();
    }
  }

  // ── Event dispatch ────────────────────────────────────────────────────────

  private dispatchEvents(): void {
    if (!this.bytecode) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    for (const event of events) {
      for (const binding of this.bytecode.events) {
        if (binding.eventType === event.eventType) {
          // Push payload onto stack before calling handler
          for (const p of event.payload) {
            this.push(p);
          }
          this.callFunction(binding.handlerFunctionIndex);
          this.executeInstructions();
        }
      }
    }
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  private getString(index: number): string {
    if (!this.bytecode) return '';
    return this.bytecode.strings[index] ?? `str_${index}`;
  }

  /**
   * Get current VM status
   */
  getStatus(): VMStatus {
    return this.status;
  }

  /**
   * Get current stack snapshot (for debugging)
   */
  getStack(): readonly HoloOperand[] {
    return [...this.stack];
  }

  /**
   * Get the tick count
   */
  getTickCount(): number {
    return this.tickCount;
  }

  /**
   * Queue an external event (e.g., from user input or network)
   */
  queueEvent(eventType: number, ...payload: HoloOperand[]): void {
    this.eventQueue.push({ eventType, payload });
  }
}
