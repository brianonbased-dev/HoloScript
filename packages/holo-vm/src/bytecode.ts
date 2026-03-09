/**
 * HOLO VM Bytecode Format (.holob)
 *
 * Binary format for compiled HoloScript programs.
 * Magic: "HOLB" | Version: u16 | Flags: u16
 *
 * Sections:
 *   - String Table: interned strings
 *   - Asset Table: referenced assets (glTF, textures, audio)
 *   - Trait Table: trait definitions and dependencies
 *   - Code Section: function bytecode
 *   - Init Section: entity spawn instructions
 *   - Event Table: event→handler mappings
 */

import { HoloOpCode, ValueType } from './opcodes';

// =============================================================================
// MAGIC & VERSION
// =============================================================================

/** File magic bytes: "HOLB" */
export const HOLOB_MAGIC = 0x484f4c42; // ASCII: H O L B
export const HOLOB_VERSION = 1;

// =============================================================================
// FLAGS
// =============================================================================

export enum HolobFlags {
  None = 0x0000,
  Debug = 0x0001,
  SIMD = 0x0002,
  Threads = 0x0004,
  Networking = 0x0008,
  Physics = 0x0010,
}

// =============================================================================
// INSTRUCTION
// =============================================================================

export type HoloOperand = number | string | boolean | number[] | null;

export interface HoloInstruction {
  /** The opcode to execute */
  opcode: HoloOpCode;
  /** Variable-length operands */
  operands: HoloOperand[];
}

// =============================================================================
// FUNCTION DEFINITION
// =============================================================================

export interface HoloFunction {
  /** Index into string table */
  nameIndex: number;
  /** Bytecode instructions */
  instructions: HoloInstruction[];
  /** Number of local registers used */
  registerCount: number;
  /** Number of parameters */
  paramCount: number;
}

// =============================================================================
// ENTITY DEFINITION (Init Section)
// =============================================================================

export interface HoloEntityDef {
  /** Index into string table for entity name */
  nameIndex: number;
  /** Archetype identifier */
  archetype: number;
  /** Initial component data as key-value pairs */
  components: HoloComponentData[];
  /** Parent entity index (-1 for root) */
  parentIndex: number;
}

export interface HoloComponentData {
  /** Component type ID */
  componentType: number;
  /** Serialized initial values */
  values: Record<string, HoloOperand>;
}

// =============================================================================
// TRAIT DEFINITION
// =============================================================================

export interface HoloTraitDef {
  /** Index into string table for trait name */
  nameIndex: number;
  /** Indices of trait dependencies */
  dependencies: number[];
  /** Init function index (-1 if none) */
  initFunctionIndex: number;
  /** Event handlers: event_type → function index */
  eventHandlers: Map<number, number>;
}

// =============================================================================
// ASSET REFERENCE
// =============================================================================

export enum AssetType {
  Mesh = 0x01,
  Texture = 0x02,
  Audio = 0x03,
  Animation = 0x04,
  GaussianSplat = 0x05,
  Font = 0x06,
  Script = 0x07,
}

export interface HoloAssetRef {
  /** Index into string table for asset URI */
  uriIndex: number;
  /** Asset type */
  type: AssetType;
}

// =============================================================================
// EVENT BINDING
// =============================================================================

export interface HoloEventBinding {
  /** Event type identifier */
  eventType: number;
  /** Function index to call when event fires */
  handlerFunctionIndex: number;
  /** Optional entity filter (-1 for global) */
  entityFilter: number;
}

// =============================================================================
// TOP-LEVEL BYTECODE MODULE
// =============================================================================

export interface HoloBytecode {
  /** File magic — must be HOLOB_MAGIC */
  magic: number;
  /** Format version */
  version: number;
  /** Feature flags */
  flags: HolobFlags;

  /** Interned string table */
  strings: string[];
  /** Asset references */
  assets: HoloAssetRef[];
  /** Trait definitions */
  traits: HoloTraitDef[];
  /** Function bytecode */
  functions: HoloFunction[];
  /** Entity definitions (init section) */
  entities: HoloEntityDef[];
  /** Event→handler bindings */
  events: HoloEventBinding[];

  /** Optional: source map for debugging */
  sourceMap?: HoloSourceMap;
}

// =============================================================================
// SOURCE MAP (debug builds only)
// =============================================================================

export interface HoloSourceMapping {
  /** Function index */
  functionIndex: number;
  /** Instruction index within function */
  instructionIndex: number;
  /** Original source file (string table index) */
  sourceFileIndex: number;
  /** Line number in source */
  line: number;
  /** Column number in source */
  column: number;
}

export interface HoloSourceMap {
  mappings: HoloSourceMapping[];
}

// =============================================================================
// BUILDER (Fluent API for assembling bytecode)
// =============================================================================

export class HoloBytecodeBuilder {
  private strings: Map<string, number> = new Map();
  private stringList: string[] = [];
  private assets: HoloAssetRef[] = [];
  private traits: HoloTraitDef[] = [];
  private functions: HoloFunction[] = [];
  private entities: HoloEntityDef[] = [];
  private events: HoloEventBinding[] = [];
  private flags: HolobFlags = HolobFlags.None;

  /**
   * Intern a string and return its index
   */
  internString(str: string): number {
    const existing = this.strings.get(str);
    if (existing !== undefined) return existing;
    const idx = this.stringList.length;
    this.stringList.push(str);
    this.strings.set(str, idx);
    return idx;
  }

  /**
   * Add a feature flag
   */
  addFlag(flag: HolobFlags): this {
    this.flags |= flag;
    return this;
  }

  /**
   * Add an asset reference
   */
  addAsset(uri: string, type: AssetType): number {
    const idx = this.assets.length;
    this.assets.push({ uriIndex: this.internString(uri), type });
    return idx;
  }

  /**
   * Add a trait definition
   */
  addTrait(name: string, deps: number[] = [], initFunc: number = -1): number {
    const idx = this.traits.length;
    this.traits.push({
      nameIndex: this.internString(name),
      dependencies: deps,
      initFunctionIndex: initFunc,
      eventHandlers: new Map(),
    });
    return idx;
  }

  /**
   * Begin building a function
   */
  addFunction(name: string, paramCount: number = 0): HoloFunctionBuilder {
    const idx = this.functions.length;
    const fn: HoloFunction = {
      nameIndex: this.internString(name),
      instructions: [],
      registerCount: 0,
      paramCount,
    };
    this.functions.push(fn);
    return new HoloFunctionBuilder(fn, this, idx);
  }

  /**
   * Add an entity definition
   */
  addEntity(name: string, archetype: number = 0, parentIndex: number = -1): number {
    const idx = this.entities.length;
    this.entities.push({
      nameIndex: this.internString(name),
      archetype,
      components: [],
      parentIndex,
    });
    return idx;
  }

  /**
   * Add component data to an entity
   */
  addComponentToEntity(
    entityIdx: number,
    componentType: number,
    values: Record<string, HoloOperand>
  ): this {
    this.entities[entityIdx].components.push({ componentType, values });
    return this;
  }

  /**
   * Add an event binding
   */
  addEvent(eventType: number, handlerFunctionIndex: number, entityFilter: number = -1): this {
    this.events.push({ eventType, handlerFunctionIndex, entityFilter });
    return this;
  }

  /**
   * Build the final bytecode module
   */
  build(): HoloBytecode {
    return {
      magic: HOLOB_MAGIC,
      version: HOLOB_VERSION,
      flags: this.flags,
      strings: [...this.stringList],
      assets: [...this.assets],
      traits: [...this.traits],
      functions: [...this.functions],
      entities: [...this.entities],
      events: [...this.events],
    };
  }
}

// =============================================================================
// FUNCTION BUILDER (instruction-level assembly)
// =============================================================================

export class HoloFunctionBuilder {
  constructor(
    private func: HoloFunction,
    private parent: HoloBytecodeBuilder,
    public readonly index: number
  ) {}

  private emit(opcode: HoloOpCode, ...operands: HoloOperand[]): this {
    this.func.instructions.push({ opcode, operands });
    return this;
  }

  // ── Entity ────────────────────────────────────────────────────────────────
  spawn(entityType: number, name: string): this {
    return this.emit(HoloOpCode.SPAWN, entityType, this.parent.internString(name));
  }
  despawn(entityId: number): this {
    return this.emit(HoloOpCode.DESPAWN, entityId);
  }
  setComponent(entityId: number, compType: number, ...data: HoloOperand[]): this {
    return this.emit(HoloOpCode.SET_COMPONENT, entityId, compType, ...data);
  }
  getComponent(entityId: number, compType: number): this {
    return this.emit(HoloOpCode.GET_COMPONENT, entityId, compType);
  }
  setParent(childId: number, parentId: number): this {
    return this.emit(HoloOpCode.SET_PARENT, childId, parentId);
  }
  query(archetypeMask: number): this {
    return this.emit(HoloOpCode.QUERY, archetypeMask);
  }

  // ── Spatial ───────────────────────────────────────────────────────────────
  transform(entityId: number, x: number, y: number, z: number): this {
    return this.emit(HoloOpCode.TRANSFORM, entityId, x, y, z, 0, 0, 0, 1, 1, 1, 1);
  }
  translate(entityId: number, dx: number, dy: number, dz: number): this {
    return this.emit(HoloOpCode.TRANSLATE, entityId, dx, dy, dz);
  }
  rotate(entityId: number, qx: number, qy: number, qz: number, qw: number): this {
    return this.emit(HoloOpCode.ROTATE, entityId, qx, qy, qz, qw);
  }
  lookAt(entityId: number, tx: number, ty: number, tz: number): this {
    return this.emit(HoloOpCode.LOOK_AT, entityId, tx, ty, tz);
  }
  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number
  ): this {
    return this.emit(HoloOpCode.RAYCAST, ox, oy, oz, dx, dy, dz, maxDist);
  }

  // ── Physics ───────────────────────────────────────────────────────────────
  addRigidbody(entityId: number, mass: number, bodyType: number): this {
    return this.emit(HoloOpCode.ADD_RIGIDBODY, entityId, mass, bodyType);
  }
  applyForce(entityId: number, fx: number, fy: number, fz: number): this {
    return this.emit(HoloOpCode.APPLY_FORCE, entityId, fx, fy, fz);
  }
  applyImpulse(entityId: number, ix: number, iy: number, iz: number): this {
    return this.emit(HoloOpCode.APPLY_IMPULSE, entityId, ix, iy, iz);
  }
  setGravity(gx: number, gy: number, gz: number): this {
    return this.emit(HoloOpCode.SET_GRAVITY, gx, gy, gz);
  }
  physicsStep(dt: number): this {
    return this.emit(HoloOpCode.PHYSICS_STEP, dt);
  }

  // ── Rendering Hints ───────────────────────────────────────────────────────
  setGeometry(entityId: number, geoType: number): this {
    return this.emit(HoloOpCode.SET_GEOMETRY, entityId, geoType);
  }
  setMaterial(entityId: number, ...desc: HoloOperand[]): this {
    return this.emit(HoloOpCode.SET_MATERIAL, entityId, ...desc);
  }
  setVisible(entityId: number, visible: boolean): this {
    return this.emit(HoloOpCode.SET_VISIBLE, entityId, visible ? 1 : 0);
  }
  setLight(entityId: number, lightType: number, ...params: HoloOperand[]): this {
    return this.emit(HoloOpCode.SET_LIGHT, entityId, lightType, ...params);
  }
  setAnimation(entityId: number, animId: number): this {
    return this.emit(HoloOpCode.SET_ANIMATION, entityId, animId);
  }

  // ── Trait ─────────────────────────────────────────────────────────────────
  applyTrait(entityId: number, traitId: number): this {
    return this.emit(HoloOpCode.APPLY_TRAIT, entityId, traitId);
  }
  removeTrait(entityId: number, traitId: number): this {
    return this.emit(HoloOpCode.REMOVE_TRAIT, entityId, traitId);
  }
  emitEvent(eventType: number, ...payload: HoloOperand[]): this {
    return this.emit(HoloOpCode.EMIT_EVENT, eventType, ...payload);
  }
  onEvent(eventType: number, handlerOffset: number): this {
    return this.emit(HoloOpCode.ON_EVENT, eventType, handlerOffset);
  }

  // ── I/O ───────────────────────────────────────────────────────────────────
  loadAsset(uri: string, assetType: number): this {
    return this.emit(HoloOpCode.LOAD_ASSET, this.parent.internString(uri), assetType);
  }
  playAudio(soundId: number, x: number, y: number, z: number): this {
    return this.emit(HoloOpCode.PLAY_AUDIO, soundId, x, y, z);
  }
  netSync(entityId: number, syncTier: number): this {
    return this.emit(HoloOpCode.NET_SYNC, entityId, syncTier);
  }

  // ── Control Flow ──────────────────────────────────────────────────────────
  nop(): this {
    return this.emit(HoloOpCode.NOP);
  }
  jump(offset: number): this {
    return this.emit(HoloOpCode.JUMP, offset);
  }
  jumpIf(offset: number): this {
    return this.emit(HoloOpCode.JUMP_IF, offset);
  }
  call(funcIdx: number): this {
    return this.emit(HoloOpCode.CALL, funcIdx);
  }
  ret(): this {
    return this.emit(HoloOpCode.RETURN);
  }
  push(value: HoloOperand): this {
    return this.emit(HoloOpCode.PUSH, value);
  }
  pop(): this {
    return this.emit(HoloOpCode.POP);
  }
  store(registerIdx: number): this {
    this.func.registerCount = Math.max(this.func.registerCount, registerIdx + 1);
    return this.emit(HoloOpCode.STORE, registerIdx);
  }
  load(registerIdx: number): this {
    return this.emit(HoloOpCode.LOAD, registerIdx);
  }
  halt(): this {
    return this.emit(HoloOpCode.HALT);
  }
  yieldTick(): this {
    return this.emit(HoloOpCode.YIELD);
  }
  timer(delayMs: number, handlerOffset: number): this {
    return this.emit(HoloOpCode.TIMER, delayMs, handlerOffset);
  }

  // ── Arithmetic ────────────────────────────────────────────────────────────
  add(): this {
    return this.emit(HoloOpCode.ADD);
  }
  sub(): this {
    return this.emit(HoloOpCode.SUB);
  }
  mul(): this {
    return this.emit(HoloOpCode.MUL);
  }
  div(): this {
    return this.emit(HoloOpCode.DIV);
  }

  // ── Comparison ────────────────────────────────────────────────────────────
  cmpEq(): this {
    return this.emit(HoloOpCode.CMP_EQ);
  }
  cmpLt(): this {
    return this.emit(HoloOpCode.CMP_LT);
  }
  cmpGt(): this {
    return this.emit(HoloOpCode.CMP_GT);
  }
  not(): this {
    return this.emit(HoloOpCode.NOT);
  }

  // ── Agent Bridge ──────────────────────────────────────────────────────────
  agentInvoke(agentId: number, actionIdx: number): this {
    return this.emit(HoloOpCode.AGENT_INVOKE, agentId, actionIdx);
  }
  agentRead(agentId: number, fieldIdx: number): this {
    return this.emit(HoloOpCode.AGENT_READ, agentId, fieldIdx);
  }
  dialogShow(npcId: number, dialogTreeId: number): this {
    return this.emit(HoloOpCode.DIALOG_SHOW, npcId, dialogTreeId);
  }
  questUpdate(questId: number, state: number): this {
    return this.emit(HoloOpCode.QUEST_UPDATE, questId, state);
  }

  /** Get the current instruction count (useful for jump targets) */
  get instructionCount(): number {
    return this.func.instructions.length;
  }
}
