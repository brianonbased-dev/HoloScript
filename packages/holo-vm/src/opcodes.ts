/**
 * HOLO VM Opcode Definitions
 *
 * 8 opcode families (~60 opcodes) for spatial scene execution.
 * Each opcode is 1 byte. Operands are variable-length.
 *
 * Family ranges:
 *   0x01–0x0F  Entity Operations
 *   0x10–0x1F  Spatial Operations
 *   0x20–0x2F  Physics Operations
 *   0x30–0x3F  Rendering Hints
 *   0x40–0x4F  Trait Operations
 *   0x50–0x5F  I/O & Networking
 *   0x60–0x6F  Control Flow
 *   0x70–0x7F  Agent Bridge
 */

// =============================================================================
// OPCODE ENUM
// =============================================================================

export enum HoloOpCode {
  // ── Entity Operations (0x01–0x0F) ─────────────────────────────────────────
  /** Create entity with archetype. Operands: [entity_type: u16, name_idx: u32] */
  SPAWN = 0x01,
  /** Remove entity from world. Operands: [entity_id: u32] */
  DESPAWN = 0x02,
  /** Deep-copy entity. Operands: [entity_id: u32] → pushes new entity_id */
  CLONE = 0x03,
  /** Attach/update component. Operands: [entity_id: u32, comp_type: u16, ...data] */
  SET_COMPONENT = 0x04,
  /** Read component data. Operands: [entity_id: u32, comp_type: u16] → pushes data */
  GET_COMPONENT = 0x05,
  /** Detach component. Operands: [entity_id: u32, comp_type: u16] */
  REMOVE_COMPONENT = 0x06,
  /** Set parent in scene graph. Operands: [child_id: u32, parent_id: u32] */
  SET_PARENT = 0x07,
  /** ECS archetype query. Operands: [archetype_mask: u32] → pushes entity list */
  QUERY = 0x08,

  // ── Spatial Operations (0x10–0x1F) ────────────────────────────────────────
  /** Set world transform. Operands: [entity_id: u32, x,y,z: f32, qx,qy,qz,qw: f32, sx,sy,sz: f32] */
  TRANSFORM = 0x10,
  /** Relative move. Operands: [entity_id: u32, dx,dy,dz: f32] */
  TRANSLATE = 0x11,
  /** Set rotation (quaternion). Operands: [entity_id: u32, qx,qy,qz,qw: f32] */
  ROTATE = 0x12,
  /** Orient toward target. Operands: [entity_id: u32, tx,ty,tz: f32] */
  LOOK_AT = 0x13,
  /** Ray spatial query. Operands: [ox,oy,oz: f32, dx,dy,dz: f32, max: f32] → pushes hits */
  RAYCAST = 0x14,
  /** AABB spatial query. Operands: [minx,miny,minz: f32, maxx,maxy,maxz: f32] → pushes entities */
  QUERY_BOX = 0x15,
  /** Sphere spatial query. Operands: [cx,cy,cz: f32, radius: f32] → pushes entities */
  QUERY_SPHERE = 0x16,
  /** Navigation pathfinding. Operands: [fromx,y,z: f32, tox,y,z: f32, flags: u16] → pushes path */
  FIND_PATH = 0x17,
  /** Zone lookup. Operands: [x,y,z: f32] → pushes zone_id */
  GET_ZONE = 0x18,

  // ── Physics Operations (0x20–0x2F) ────────────────────────────────────────
  /** Attach physics body. Operands: [entity_id: u32, mass: f32, body_type: u8] */
  ADD_RIGIDBODY = 0x20,
  /** Apply force vector. Operands: [entity_id: u32, fx,fy,fz: f32] */
  APPLY_FORCE = 0x21,
  /** Apply instant impulse. Operands: [entity_id: u32, ix,iy,iz: f32] */
  APPLY_IMPULSE = 0x22,
  /** Set linear velocity. Operands: [entity_id: u32, vx,vy,vz: f32] */
  SET_VELOCITY = 0x23,
  /** Attach collision shape. Operands: [entity_id: u32, shape_type: u8, ...params] */
  ADD_COLLIDER = 0x24,
  /** Create physics joint. Operands: [entity_a: u32, entity_b: u32, joint_type: u8] */
  ADD_JOINT = 0x25,
  /** Set world gravity. Operands: [gx,gy,gz: f32] */
  SET_GRAVITY = 0x26,
  /** Advance physics simulation. Operands: [dt: f32] */
  PHYSICS_STEP = 0x27,

  // ── Rendering Hints (0x30–0x3F) ───────────────────────────────────────────
  /** Set geometry type. Operands: [entity_id: u32, geo_type: u8, ...params] */
  SET_GEOMETRY = 0x30,
  /** Set PBR material. Operands: [entity_id: u32, ...material_desc] */
  SET_MATERIAL = 0x31,
  /** Show/hide entity. Operands: [entity_id: u32, visible: u8] */
  SET_VISIBLE = 0x32,
  /** LOD thresholds. Operands: [entity_id: u32, ...lod_config] */
  SET_LOD = 0x33,
  /** Light component. Operands: [entity_id: u32, light_type: u8, ...params] */
  SET_LIGHT = 0x34,
  /** Animation playback. Operands: [entity_id: u32, anim_id: u32, ...params] */
  SET_ANIMATION = 0x35,
  /** Gaussian splat asset. Operands: [entity_id: u32, gs_ref: u32] */
  SET_GAUSSIAN_SPLAT = 0x36,
  /** GPU particle system. Operands: [entity_id: u32, ...ps_config] */
  SET_PARTICLE_SYSTEM = 0x37,

  // ── Trait Operations (0x40–0x4F) ──────────────────────────────────────────
  /** Attach trait. Operands: [entity_id: u32, trait_id: u32] */
  APPLY_TRAIT = 0x40,
  /** Detach trait. Operands: [entity_id: u32, trait_id: u32] */
  REMOVE_TRAIT = 0x41,
  /** Flatten composed traits. Operands: [entity_id: u32] → pushes resolved traits */
  RESOLVE_TRAITS = 0x42,
  /** Fire event. Operands: [event_type: u16, ...payload] */
  EMIT_EVENT = 0x43,
  /** Register handler. Operands: [event_type: u16, handler_offset: u32] */
  ON_EVENT = 0x44,
  /** Evaluate condition. Operands: [condition_idx: u32] → pushes boolean */
  EVAL_CONDITION = 0x45,

  // ── I/O & Networking (0x50–0x5F) ──────────────────────────────────────────
  /** Async asset load. Operands: [asset_uri_idx: u32, asset_type: u8] → pushes handle */
  LOAD_ASSET = 0x50,
  /** Spatial audio playback. Operands: [sound_id: u32, x,y,z: f32, ...params] */
  PLAY_AUDIO = 0x51,
  /** Mark for network sync. Operands: [entity_id: u32, sync_tier: u8] */
  NET_SYNC = 0x52,
  /** Send network message. Operands: [channel: u16, ...payload] */
  NET_SEND = 0x53,
  /** Read incoming messages. Operands: [channel: u16] → pushes messages */
  NET_RECV = 0x54,
  /** Read VR/XR input. Operands: [input_type: u8] → pushes input data */
  XR_INPUT = 0x55,
  /** VR haptic feedback. Operands: [hand: u8, amplitude: f32, duration: f32] */
  HAPTIC = 0x56,

  // ── Control Flow (0x60–0x6F) ──────────────────────────────────────────────
  /** No operation */
  NOP = 0x60,
  /** Unconditional jump. Operands: [offset: i32] */
  JUMP = 0x61,
  /** Conditional jump. Operands: [offset: i32] — pops stack, jumps if truthy */
  JUMP_IF = 0x62,
  /** Call subroutine. Operands: [func_idx: u32] */
  CALL = 0x63,
  /** Return from subroutine */
  RETURN = 0x64,
  /** Push literal to stack. Operands: [type: u8, ...value] */
  PUSH = 0x65,
  /** Discard stack top */
  POP = 0x66,
  /** Store stack top to register. Operands: [register_idx: u16] */
  STORE = 0x67,
  /** Push register value to stack. Operands: [register_idx: u16] */
  LOAD = 0x68,
  /** Halt execution */
  HALT = 0x69,
  /** Suspend until next tick */
  YIELD = 0x6A,
  /** Schedule delayed handler. Operands: [delay_ms: u32, handler_offset: u32] */
  TIMER = 0x6B,

  // ── Arithmetic & Comparison (0x6C–0x6F) ───────────────────────────────────
  /** Add top two stack values */
  ADD = 0x6C,
  /** Subtract: stack[-2] - stack[-1] */
  SUB = 0x6D,
  /** Multiply top two */
  MUL = 0x6E,
  /** Divide: stack[-2] / stack[-1] */
  DIV = 0x6F,

  // ── Agent Bridge (0x70–0x7F) ──────────────────────────────────────────────
  /** Request action from uAAL VM. Operands: [agent_id: u32, action_idx: u32] */
  AGENT_INVOKE = 0x70,
  /** Read agent state field. Operands: [agent_id: u32, field_idx: u32] → pushes value */
  AGENT_READ = 0x71,
  /** Listen for agent decisions. Operands: [agent_id: u32, event_type: u16] */
  AGENT_SUBSCRIBE = 0x72,
  /** Trigger NPC dialog. Operands: [npc_id: u32, dialog_tree_id: u32] */
  DIALOG_SHOW = 0x73,
  /** Update quest state. Operands: [quest_id: u32, state: u8] */
  QUEST_UPDATE = 0x74,

  // ── Comparison (0x80–0x83) ────────────────────────────────────────────────
  /** Equal: pushes stack[-2] == stack[-1] */
  CMP_EQ = 0x80,
  /** Less than: pushes stack[-2] < stack[-1] */
  CMP_LT = 0x81,
  /** Greater than: pushes stack[-2] > stack[-1] */
  CMP_GT = 0x82,
  /** Logical NOT: pushes !stack[-1] */
  NOT = 0x83,
}

// =============================================================================
// COMPONENT TYPES
// =============================================================================

export enum ComponentType {
  Transform = 0x01,
  Geometry = 0x02,
  Material = 0x03,
  RigidBody = 0x04,
  Collider = 0x05,
  Light = 0x06,
  Animation = 0x07,
  Audio = 0x08,
  Network = 0x09,
  Trait = 0x0A,
  ParticleSystem = 0x0B,
  GaussianSplat = 0x0C,
  LOD = 0x0D,
  Custom = 0xFF,
}

// =============================================================================
// GEOMETRY TYPES
// =============================================================================

export enum GeometryType {
  Cube = 0x01,
  Sphere = 0x02,
  Cylinder = 0x03,
  Plane = 0x04,
  Cone = 0x05,
  Torus = 0x06,
  Capsule = 0x07,
  Mesh = 0x08,
  Text3D = 0x09,
  Portal = 0x0A,
  Terrain = 0x0B,
  Skybox = 0x0C,
  Billboard = 0x0D,
  Line = 0x0E,
}

// =============================================================================
// PHYSICS BODY TYPES
// =============================================================================

export enum BodyType {
  Static = 0x00,
  Dynamic = 0x01,
  Kinematic = 0x02,
}

// =============================================================================
// COLLIDER SHAPES
// =============================================================================

export enum ColliderShape {
  Box = 0x01,
  Sphere = 0x02,
  Capsule = 0x03,
  Cylinder = 0x04,
  ConvexHull = 0x05,
  TriMesh = 0x06,
}

// =============================================================================
// LIGHT TYPES
// =============================================================================

export enum LightType {
  Directional = 0x01,
  Point = 0x02,
  Spot = 0x03,
  Ambient = 0x04,
  Area = 0x05,
}

// =============================================================================
// NETWORK SYNC TIERS (per P.NET.01)
// =============================================================================

export enum SyncTier {
  /** Server-authoritative, 60Hz, reliable ordered */
  Physics = 0x00,
  /** Client-predicted, 20Hz, unreliable */
  Movement = 0x01,
  /** CRDT-based, 1-5Hz, eventual consistency */
  AIAgent = 0x02,
  /** Last-write-wins, <1Hz, fire-and-forget */
  Cosmetic = 0x03,
}

// =============================================================================
// VALUE TYPE TAGS (for PUSH operand encoding)
// =============================================================================

export enum ValueType {
  Null = 0x00,
  Bool = 0x01,
  I32 = 0x02,
  F32 = 0x03,
  F64 = 0x04,
  String = 0x05,
  Vec3 = 0x06,
  Quat = 0x07,
  EntityRef = 0x08,
  Array = 0x09,
}

// =============================================================================
// OPCODE METADATA
// =============================================================================

export interface OpCodeMeta {
  name: string;
  family: string;
  operandCount: number;
  description: string;
  pops: number;
  pushes: number;
}

const FAMILY_NAMES: Record<number, string> = {
  0x0: 'Entity',
  0x1: 'Spatial',
  0x2: 'Physics',
  0x3: 'Rendering',
  0x4: 'Trait',
  0x5: 'I/O',
  0x6: 'Control',
  0x7: 'Agent',
  0x8: 'Comparison',
};

/**
 * Get the family name for an opcode
 */
export function getOpcodeFamily(opcode: HoloOpCode): string {
  const familyByte = (opcode >> 4) & 0x0F;
  return FAMILY_NAMES[familyByte] ?? 'Unknown';
}

/**
 * Get the mnemonic name for an opcode
 */
export function getOpcodeName(opcode: HoloOpCode): string {
  return HoloOpCode[opcode] ?? `UNKNOWN_0x${opcode.toString(16).padStart(2, '0')}`;
}

/**
 * Check if an opcode is a jump/branch instruction
 */
export function isControlFlow(opcode: HoloOpCode): boolean {
  return opcode === HoloOpCode.JUMP
    || opcode === HoloOpCode.JUMP_IF
    || opcode === HoloOpCode.CALL
    || opcode === HoloOpCode.RETURN
    || opcode === HoloOpCode.HALT
    || opcode === HoloOpCode.YIELD;
}
