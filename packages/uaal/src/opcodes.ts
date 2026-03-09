/**
 * uAAL Instruction Set — Open Source
 *
 * Defines the OpCodes and types for the uAAL Virtual Machine.
 * This is the standalone, service-independent instruction set.
 *
 * Organized by protocol phase and capability tier:
 *   0x01–0x03  Stack Operations
 *   0x10–0x17  Cognitive Operations (7-Phase Protocol)
 *   0x20–0x2B  Execution & Mesh Operations
 *   0x30–0x31  Control Flow
 *   0x40–0x47  Temporal & Multiversal
 *   0x50–0x54  Transcendence
 *   0x60–0x62  Real-World Integration
 *   0x70–0x72  Local Intelligence
 *   0x80–0x82  Swarm Operations
 *   0x90–0x92  Discovery Operations
 *   0xA0–0xA2  Timeline/Snapshot
 *   0xB0–0xB6  HoloScript Integration
 *   0xC0–0xCF  Native Orchestration
 *   0xE0–0xE3  Error Handling
 *   0xF0–0xF2  Optimization
 *   0xFF       HALT
 */

export enum UAALOpCode {
  // ── Stack Operations ──────────────────────────────────────────────────────
  PUSH = 0x01,
  POP = 0x02,
  PEEK = 0x03,

  // ── Cognitive Operations (7-Phase uAA2++ Protocol) ────────────────────────
  INTAKE = 0x10,
  REFLECT = 0x11,
  COMPRESS = 0x12,
  OP_INTAKE_STREAM = 0x13,
  EXECUTE = 0x14,
  REINTAKE = 0x15,
  GROW = 0x16,
  EVOLVE = 0x17,

  // ── Execution & Mesh Operations ───────────────────────────────────────────
  EXEC = 0x20,
  CALL_NODE = 0x21,
  TELEPORT = 0x22,
  OP_OFFLOAD = 0x23,
  OP_SYNC = 0x24,
  OP_PAY = 0x25,
  OP_VALUE_PROOF = 0x26,
  OP_SCALE_UP = 0x27,
  OP_DELEGATE_FEDERATION = 0x28,
  OP_MERGE_TRUTH = 0x29,
  OP_ACTUATE_DEVICE = 0x2a,
  OP_MIND_MELD = 0x2b,

  // ── Control Flow ──────────────────────────────────────────────────────────
  JUMP = 0x30,
  JUMP_IF = 0x31,

  // ── Temporal & Multiversal ────────────────────────────────────────────────
  OP_FORK_UNIVERSE = 0x40,
  OP_REVERSE_ENTROPY = 0x41,
  OP_DREAM = 0x42,
  OP_COLLAPSE_WAVEFUNCTION = 0x43,
  OP_TIME_LOOP = 0x44,
  OP_DELAY = 0x45,
  OP_TIMESTAMP = 0x46,
  OP_TIME_DELTA = 0x47,

  // ── Transcendence ─────────────────────────────────────────────────────────
  OP_KERNEL_PANIC = 0x50,
  OP_GLOBAL_SYNC = 0x51,
  OP_BECOME_SENTIENT = 0x52,
  OP_TRANSCEND = 0x53,
  OP_GRADUATE_AGENT = 0x54,

  // ── Real-World Integration ────────────────────────────────────────────────
  OP_INVOKE_LLM = 0x60,
  OP_IOT_ACTION = 0x61,
  OP_EXECUTE_PAYMENT = 0x62,

  // ── Local Intelligence ────────────────────────────────────────────────────
  OP_LOCAL_INFERENCE = 0x70,
  OP_CHAOS_TEST = 0x71,
  OP_OPTIMIZE_POWER = 0x72,

  // ── Swarm Operations ──────────────────────────────────────────────────────
  OP_SPAWN_AGENT = 0x80,
  OP_EVOLVE_CODE = 0x81,
  OP_SHARE_WISDOM = 0x82,

  // ── Discovery Operations ──────────────────────────────────────────────────
  OP_ANALYZE_DATASET = 0x90,
  OP_CREATE_ART = 0x91,
  OP_PROTECT_SYSTEM = 0x92,

  // ── Timeline/Snapshot ─────────────────────────────────────────────────────
  CLOCK_ANCHOR = 0xa0,
  CLOCK_SHIFT = 0xa1,
  CLOCK_AUDIT = 0xa2,

  // ── HoloScript Integration ───────────────────────────────────────────────
  OP_EXECUTE_HOLOSCRIPT = 0xb0,
  OP_RENDER_HOLOGRAM = 0xb1,
  OP_SPATIAL_ANCHOR = 0xb2,
  OP_VR_TELEPORT = 0xb3,
  OP_EVAL_METRIC = 0xb4,
  OP_RESIZE_ZONE = 0xb5,
  OP_EMIT_SIGNAL = 0xb6,

  // ── Native Orchestration ──────────────────────────────────────────────────
  OP_GRAPH_START = 0xc0,
  OP_GRAPH_END = 0xc1,
  OP_NODE_ENTER = 0xc2,
  OP_NODE_EXIT = 0xc3,
  OP_SPAWN_PARALLEL = 0xc4,
  OP_AWAIT_ALL = 0xc5,
  OP_AWAIT_ANY = 0xc6,
  OP_CONSENSUS = 0xc7,
  OP_ROUTE_IF = 0xc8,
  OP_ROUTE_MATCH = 0xc9,
  OP_ROUTE_SCORE = 0xca,
  OP_STATE_SET = 0xcb,
  OP_STATE_GET = 0xcc,
  OP_STATE_MERGE = 0xcd,
  OP_CHECKPOINT = 0xce,
  OP_RESTORE = 0xcf,

  // ── Error Handling ────────────────────────────────────────────────────────
  OP_ERROR = 0xe0,
  OP_ASSERT = 0xe1,
  OP_SET_ERROR_HANDLER = 0xe2,
  OP_CLEAR_ERROR_HANDLER = 0xe3,

  // ── Optimization ──────────────────────────────────────────────────────────
  OP_FUSE_REFLECT_COMPRESS = 0xf0,
  OP_PRUNE_NOOP = 0xf1,
  OP_LINEAR_JIT = 0xf2,

  // ── Halt ──────────────────────────────────────────────────────────────────
  HALT = 0xff,
}

// =============================================================================
// TYPES
// =============================================================================

export type UAALOperand =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | UAALOperand[]
  | null;

export interface UAALInstruction {
  opCode: UAALOpCode;
  operands?: UAALOperand[];
}

export interface UAALBytecode {
  version: number;
  instructions: UAALInstruction[];
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Get the mnemonic name for an opcode
 */
export function getUAALOpcodeName(opcode: UAALOpCode): string {
  return UAALOpCode[opcode] ?? `UNKNOWN_0x${opcode.toString(16).padStart(2, '0')}`;
}

/**
 * Check if opcode is a 7-phase cognitive operation
 */
export function isCognitiveOp(opcode: UAALOpCode): boolean {
  return opcode >= 0x10 && opcode <= 0x17;
}

/**
 * Check if opcode is a control flow instruction
 */
export function isControlFlowOp(opcode: UAALOpCode): boolean {
  return opcode === UAALOpCode.JUMP || opcode === UAALOpCode.JUMP_IF || opcode === UAALOpCode.HALT;
}
