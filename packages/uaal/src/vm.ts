/**
 * uAAL Virtual Machine — Standalone Open Source Edition
 *
 * Stack-based bytecode execution engine for the uAA2++ 7-Phase Protocol.
 * This is the service-independent core. Custom opcode handlers are
 * injected via registerHandler() by the host application.
 *
 * Architecture:
 *   - Stack: operand stack (push/pop values)
 *   - PC: program counter
 *   - Context: key-value metadata
 *   - Handlers: pluggable opcode implementations
 */

import {
  UAALOpCode,
  UAALBytecode,
  UAALInstruction,
  UAALOperand,
  getUAALOpcodeName,
} from './opcodes';
import { sha256Bytes } from './sha256';

// =============================================================================
// VM STATE
// =============================================================================

export interface VMState {
  stack: UAALOperand[];
  pc: number;
  context: Record<string, UAALOperand>;
  isHalted: boolean;
  /**
   * Return-address stack for CALL/RET. Each entry is the pc to resume at
   * when the matching RET executes. Deliberately just return addresses, not
   * full call frames with locals -- argument/local scoping stays a
   * compiler/host concern layered on the operand stack + EXECUTE-delegated
   * conventions, the same way it already is for every other construct this
   * VM runs (see CALL's doc comment in opcodes.ts).
   */
  callStack: number[];
}

export interface VMResult {
  taskStatus: 'RUNNING' | 'HALTED' | 'SUSPENDED' | 'ERROR' | 'IDLE';
  stackTop: UAALOperand;
  state: VMState;
}

// =============================================================================
// EXECUTION LOG — replayable derivation (uaal.execution-log.v0)
// =============================================================================
//
// When a VM is constructed with `recordLog: true`, it appends one typed entry
// per executed instruction and can export the whole run via exportLog(). The
// log is a *replayable derivation*: a consumer calls replayUAALLog(bytecode,
// log), which re-executes the bytecode fresh and compares step-by-step. The
// derivation is VALID iff deterministic replay reproduces the claimed steps
// AND the final result — verify an execution instead of trusting it (the
// same falsifiable-replay pattern as the N1 provenance experiment).
//
// Determinism caveat — recorded-effect injection:
//   Four built-in opcodes are nondeterministic (INTAKE / REINTAKE push
//   objects containing Date.now(); OP_TIMESTAMP pushes Date.now(); OP_DELAY
//   waits on the wall clock), and ANY opcode with a registered custom
//   handler may perform arbitrary external work (LLM calls etc.) through
//   VMProxy. For those steps the recorder captures the step's complete stack
//   effects — every push/pop/peek the step performed, which is the only
//   channel through which handlers or the nondeterministic built-ins can
//   influence execution — and marks the step `injected`. Replay does NOT
//   re-call the handler or re-read the clock: it applies the recorded
//   effects (and skips OP_DELAY's sleep entirely). That injection is what
//   makes replay hermetic.
//
// Trust contract: injected effects are the log's *claimed external inputs*.
// Replay verifies the derivation GIVEN those inputs. Tampering with a single
// recorded effect IS caught (the step's own stackAfter snapshot and all
// downstream snapshots stop matching), but a log whose injected effects and
// downstream snapshots were consistently rewritten end-to-end is equivalent
// to claiming different external responses — the sha-bound bytecode cannot
// prevent that. Attest external calls separately when that matters.
//
// Bounding (documented log-size bound): recorded stack snapshots keep only
// the top LOG_STACK_WINDOW (4) values, each JSON-safe-cloned with depth cap
// LOG_SNAPSHOT_DEPTH (4), plus the full stack depth — logs stay small on
// deep stacks while still catching size and top-of-stack divergence.
// Injected effect values are cloned at depth cap LOG_VALUE_DEPTH (32)
// because replay must re-inject them at working fidelity.

/** Number of top-of-stack values captured per snapshot. */
const LOG_STACK_WINDOW = 4;
/** JSON-safe clone depth cap for snapshot values. */
const LOG_SNAPSHOT_DEPTH = 4;
/** JSON-safe clone depth cap for injected effect values / operands. */
const LOG_VALUE_DEPTH = 32;

/**
 * Built-in opcodes whose default implementations are nondeterministic
 * (wall-clock reads or real waiting). Steps executing these — or any opcode
 * with a registered custom handler — are recorded as `injected` so replay
 * can reproduce them hermetically.
 */
const NONDETERMINISTIC_OPCODES: ReadonlySet<UAALOpCode> = new Set([
  UAALOpCode.INTAKE,
  UAALOpCode.REINTAKE,
  UAALOpCode.OP_TIMESTAMP,
  UAALOpCode.OP_DELAY,
]);

/**
 * One recorded stack interaction performed by an injected step. `value` is
 * the JSON-safe clone (depth cap LOG_VALUE_DEPTH) of the pushed / popped /
 * peeked value at capture time.
 */
export interface UAALRecordedEffect {
  op: 'push' | 'pop' | 'peek';
  value: UAALOperand;
}

/**
 * Bounded stack snapshot: the full stack depth plus JSON-safe clones of the
 * top LOG_STACK_WINDOW values (each clipped at LOG_SNAPSHOT_DEPTH).
 */
export interface UAALBoundedStack {
  depth: number;
  top: unknown[];
}

/** One executed instruction in a recorded derivation. */
export interface UAALLogStep {
  step: number;
  opcode: UAALOpCode;
  opcodeName: string;
  operands: UAALOperand[];
  /** Program counter BEFORE the instruction executed. */
  pc: number;
  stackBefore: UAALBoundedStack;
  stackAfter: UAALBoundedStack;
  /**
   * True when this step's stack effects were captured for hermetic
   * injection (custom handler or nondeterministic built-in).
   */
  injected?: boolean;
  /** Why the step was injected. */
  source?: 'handler' | 'builtin-nondeterministic';
  /** Complete ordered stack effects of an injected step. */
  effects?: UAALRecordedEffect[];
  /** True when the instruction threw (execution ended with ERROR). */
  threw?: boolean;
}

/** Exported replayable derivation of one execute() run. */
export interface UAALExecutionLog {
  version: 'uaal.execution-log.v0';
  /** sha256 hex over a canonical serialization of the bytecode. */
  bytecodeSha256: string;
  /** Initial context the run started with (replay re-injects it). */
  initialContext: Record<string, UAALOperand>;
  /** VM limits in force during the run (replay re-applies them). */
  limits: { maxStackSize: number; maxInstructions: number; maxCallDepth: number };
  steps: UAALLogStep[];
  result: { taskStatus: VMResult['taskStatus']; stackTop: unknown };
  startedAt: number;
  finishedAt: number;
}

/** Verdict of replayUAALLog(). */
export interface UAALReplayResult {
  valid: boolean;
  reason: string;
  /** First diverging step index, when divergence is step-scoped. */
  divergenceStep?: number;
}

/**
 * JSON-safe structural clone with a depth cap. Non-JSON values become
 * marker strings; object properties with `undefined` values are dropped
 * (mirroring JSON.stringify); depth overflow becomes '[MaxDepth]'. The cap
 * also guarantees termination on circular structures.
 */
function cloneJsonSafe(value: unknown, maxDepth: number): unknown {
  if (value === null || value === undefined) return null;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : `[NonFinite:${String(value)}]`;
    case 'bigint':
      return `[BigInt:${String(value)}]`;
    case 'function':
      return '[Function]';
    case 'symbol':
      return '[Symbol]';
    default:
      break;
  }
  if (maxDepth <= 0) return '[MaxDepth]';
  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonSafe(entry, maxDepth - 1));
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    const entry = record[key];
    if (entry === undefined) continue;
    out[key] = cloneJsonSafe(entry, maxDepth - 1);
  }
  return out;
}

/**
 * Deterministic serialization: object keys sorted recursively, undefined
 * treated as null / dropped from objects. Used for both the canonical
 * bytecode hash and step comparison during replay.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'bigint') return JSON.stringify(`[BigInt:${String(value)}]`);
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : JSON.stringify(String(value));
  }
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

/** Bounded snapshot of the operand stack (see bounding notes above). */
function boundedStackSnapshot(stack: UAALOperand[]): UAALBoundedStack {
  return {
    depth: stack.length,
    top: stack.slice(-LOG_STACK_WINDOW).map((value) => cloneJsonSafe(value, LOG_SNAPSHOT_DEPTH)),
  };
}

/**
 * sha256 (hex) over a canonical serialization of the bytecode. Instruction
 * order, opcodes, and operands are all covered; `operands: undefined` and
 * `operands: []` canonicalize identically (they execute identically).
 */
export function computeUAALBytecodeSha256(bytecode: UAALBytecode): string {
  const canonical = stableStringify({
    version: bytecode.version,
    instructions: bytecode.instructions.map((instr) => ({
      opCode: instr.opCode,
      operands: cloneJsonSafe(instr.operands ?? [], LOG_VALUE_DEPTH),
    })),
  });
  return sha256Bytes(new TextEncoder().encode(canonical));
}

// =============================================================================
// HANDLER API
// =============================================================================

/**
 * Interface for the VM proxy passed to custom handlers.
 * Provides controlled access to VM internals.
 */
export interface VMProxy {
  push(value: UAALOperand): void;
  pop(): UAALOperand;
  peek(): UAALOperand;
  getState(): VMState;
}

/** Custom opcode handler function */
export type OpcodeHandler = (vm: VMProxy, operands: UAALOperand[]) => void | Promise<void>;

// =============================================================================
// VM OPTIONS
// =============================================================================

export const UAAL_BYTECODE_HASH_ALGORITHM = 'sha256-uaal-bytecode-canonical-v1' as const;
export const UAAL_VM_IMPLEMENTATION_ID = 'holoscript.uaal-virtual-machine.v1' as const;
export const UAAL_VM_EXECUTION_PROFILE_SCHEMA = 'holoscript.uaal-vm.execution-profile.v1' as const;

/**
 * Read-only runtime facts that affect execution admission.
 *
 * Receipts use this snapshot instead of inferring limits or handler state from
 * constructor call sites. A fresh snapshot is returned on every call so later
 * handler registration cannot mutate evidence captured before execution.
 */
export interface UAALVMExecutionProfile {
  readonly schema: typeof UAAL_VM_EXECUTION_PROFILE_SCHEMA;
  readonly implementation: typeof UAAL_VM_IMPLEMENTATION_ID;
  readonly limits: {
    readonly maxStackSize: number;
    readonly maxInstructions: number;
    readonly maxCallDepth: number;
  };
  readonly registeredHandlerOpcodes: readonly UAALOpCode[];
}

export interface UAALVMOptions {
  enableLogging?: boolean;
  maxStackSize?: number;
  maxInstructions?: number;
  /**
   * Max simultaneous CALL depth before RET can unwind it. Distinct from
   * maxInstructions: runaway recursion should fail with a specific,
   * diagnosable "call stack overflow" rather than the generic
   * max-instructions-reached ERROR that also covers unrelated infinite
   * loops -- the same class of ambiguous-failure risk already flagged for
   * unregistered EXECUTE handlers (see UaalBehaviorCompiler's loop-lowering
   * doc comments) is worth avoiding here too.
   */
  maxCallDepth?: number;
  /**
   * When true, the VM appends one typed UAALLogStep per executed instruction
   * and exposes the completed run via exportLog(). Default false — and with
   * the default, no recording state is touched at all: execution behavior is
   * identical to a VM built before this feature existed.
   */
  recordLog?: boolean;
  /**
   * Replay injection source — set by replayUAALLog(), not intended for
   * direct use. When present (together with recordLog), steps the provided
   * log marks `injected` are replayed by applying their recorded stack
   * effects instead of re-calling custom handlers / re-reading the clock /
   * sleeping, which is what keeps replay hermetic.
   */
  replayInjectLog?: UAALExecutionLog;
}

// =============================================================================
// VIRTUAL MACHINE
// =============================================================================

export class UAALVirtualMachine {
  private state: VMState;
  private handlers: Map<UAALOpCode, OpcodeHandler> = new Map();
  private enableLogging: boolean;
  private maxStackSize: number;
  private maxInstructions: number;
  private maxCallDepth: number;
  // ── Derivation-log state (untouched unless recordLog is true) ────────────
  private recordLog: boolean;
  private injectLog: UAALExecutionLog | null;
  private logSteps: UAALLogStep[] = [];
  private logStartedAt = 0;
  private logFinishedAt = 0;
  private logResult: UAALExecutionLog['result'] | null = null;
  private logBytecodeSha256 = '';
  private logInitialContext: Record<string, UAALOperand> = {};
  /**
   * Non-null ONLY while an injectable step is executing under recordLog —
   * push/pop/peek append their effect here so injected steps can be
   * replayed hermetically. Always null when recordLog is false.
   */
  private effectCapture: UAALRecordedEffect[] | null = null;

  constructor(options: UAALVMOptions = {}) {
    this.enableLogging = options.enableLogging ?? false;
    this.maxStackSize = options.maxStackSize ?? 4096;
    this.maxInstructions = options.maxInstructions ?? 100_000;
    this.maxCallDepth = options.maxCallDepth ?? 1000;
    this.recordLog = options.recordLog ?? false;
    this.injectLog = options.replayInjectLog ?? null;
    this.state = this.createInitialState();
    this.registerDefaultHandlers();
  }

  /**
   * Return the effective execution limits and currently registered host
   * handlers without exposing mutable VM internals.
   */
  getExecutionProfile(): UAALVMExecutionProfile {
    return Object.freeze({
      schema: UAAL_VM_EXECUTION_PROFILE_SCHEMA,
      implementation: UAAL_VM_IMPLEMENTATION_ID,
      limits: Object.freeze({
        maxStackSize: this.maxStackSize,
        maxInstructions: this.maxInstructions,
        maxCallDepth: this.maxCallDepth,
      }),
      registeredHandlerOpcodes: Object.freeze(
        [...this.handlers.keys()].sort((left, right) => left - right)
      ),
    });
  }

  private createInitialState(context: Record<string, UAALOperand> = {}): VMState {
    return {
      stack: [],
      pc: 0,
      context: { ...context },
      isHalted: false,
      callStack: [],
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Register a custom handler for an opcode.
   * This is the key extension point — host applications inject
   * service-specific logic (LLM calls, alignment audits, etc.)
   * without modifying the VM core.
   */
  registerHandler(opcode: UAALOpCode, handler: OpcodeHandler): void {
    this.handlers.set(opcode, handler);
    if (this.enableLogging) {
      this.log(`Registered handler for ${getUAALOpcodeName(opcode)}`);
    }
  }

  /**
   * Execute a bytecode program
   */
  async execute(
    bytecode: UAALBytecode,
    initialContext: Record<string, UAALOperand> = {}
  ): Promise<VMResult> {
    this.state = this.createInitialState(initialContext);

    if (this.recordLog) {
      this.logSteps = [];
      this.logResult = null;
      this.logStartedAt = Date.now();
      this.logFinishedAt = 0;
      this.logBytecodeSha256 = computeUAALBytecodeSha256(bytecode);
      this.logInitialContext = cloneJsonSafe(initialContext, LOG_VALUE_DEPTH) as Record<
        string,
        UAALOperand
      >;
    }

    if (this.enableLogging) {
      this.log(
        `Executing bytecode v${bytecode.version} (${bytecode.instructions.length} instructions)`
      );
    }

    let instructionCount = 0;

    try {
      while (!this.state.isHalted && this.state.pc < bytecode.instructions.length) {
        if (instructionCount >= this.maxInstructions) {
          this.log('Max instructions reached — halting');
          return this.finishRun(this.buildResult('ERROR'));
        }

        const instr = bytecode.instructions[this.state.pc];
        const isJump = this.recordLog
          ? await this.executeRecordedInstruction(instr)
          : await this.executeInstruction(instr);

        // Only increment PC if the instruction didn't jump
        if (!isJump) {
          this.state.pc++;
        }

        instructionCount++;
      }

      return this.finishRun(this.buildResult(this.state.isHalted ? 'HALTED' : 'HALTED'));
    } catch (err) {
      if (this.enableLogging) {
        this.log(`Execution error: ${err}`);
      }
      return this.finishRun(this.buildResult('ERROR'));
    }
  }

  /**
   * Export the last completed run as a replayable derivation log.
   * Requires the VM to have been constructed with `recordLog: true` and to
   * have finished at least one execute(). The returned structure is a fresh
   * deep clone — callers can persist or mutate it without touching VM state.
   * Verify it later with replayUAALLog(bytecode, log).
   */
  exportLog(): UAALExecutionLog {
    if (!this.recordLog) {
      throw new Error('exportLog() requires the VM to be constructed with recordLog: true');
    }
    if (this.logResult === null) {
      throw new Error('exportLog() called before execute() completed a run');
    }
    return {
      version: 'uaal.execution-log.v0',
      bytecodeSha256: this.logBytecodeSha256,
      initialContext: cloneJsonSafe(this.logInitialContext, LOG_VALUE_DEPTH) as Record<
        string,
        UAALOperand
      >,
      limits: {
        maxStackSize: this.maxStackSize,
        maxInstructions: this.maxInstructions,
        maxCallDepth: this.maxCallDepth,
      },
      steps: cloneJsonSafe(this.logSteps, LOG_VALUE_DEPTH + 8) as unknown as UAALLogStep[],
      result: {
        taskStatus: this.logResult.taskStatus,
        stackTop: cloneJsonSafe(this.logResult.stackTop, LOG_SNAPSHOT_DEPTH + 2),
      },
      startedAt: this.logStartedAt,
      finishedAt: this.logFinishedAt,
    };
  }

  /**
   * Verify a claimed execution log against bytecode by deterministic replay.
   * Convenience alias for the standalone replayUAALLog() — see its doc
   * comment for the full contract.
   */
  static async replayLog(bytecode: UAALBytecode, log: UAALExecutionLog): Promise<UAALReplayResult> {
    return replayUAALLog(bytecode, log);
  }

  /**
   * Get current VM state
   */
  getState(): VMState {
    return {
      ...this.state,
      stack: [...this.state.stack],
      context: { ...this.state.context },
      callStack: [...this.state.callStack],
    };
  }

  /**
   * Reset VM to initial state
   */
  reset(initialContext: Record<string, UAALOperand> = {}): void {
    this.state = this.createInitialState(initialContext);
  }

  /**
   * Stack operations exposed for handler use
   */
  push(value: UAALOperand): void {
    if (this.state.stack.length >= this.maxStackSize) {
      throw new Error('Stack overflow');
    }
    this.state.stack.push(value);
    if (this.effectCapture) {
      this.effectCapture.push({
        op: 'push',
        value: cloneJsonSafe(value, LOG_VALUE_DEPTH) as UAALOperand,
      });
    }
  }

  pop(): UAALOperand {
    const value = this.state.stack.pop() ?? null;
    if (this.effectCapture) {
      this.effectCapture.push({
        op: 'pop',
        value: cloneJsonSafe(value, LOG_VALUE_DEPTH) as UAALOperand,
      });
    }
    return value;
  }

  peek(): UAALOperand {
    const value =
      this.state.stack.length > 0 ? this.state.stack[this.state.stack.length - 1] : null;
    if (this.effectCapture) {
      this.effectCapture.push({
        op: 'peek',
        value: cloneJsonSafe(value, LOG_VALUE_DEPTH) as UAALOperand,
      });
    }
    return value;
  }

  // ── Instruction Execution ─────────────────────────────────────────────────

  /**
   * Recording/replaying wrapper around executeInstruction. Only reached when
   * recordLog is true — the recordLog:false path calls executeInstruction
   * directly, so default behavior is untouched.
   *
   * Live recording: injectable steps (custom handler registered, or opcode
   * in NONDETERMINISTIC_OPCODES) run with effect capture on and are marked
   * `injected` with their complete stack effects.
   *
   * Replay (injectLog set): steps the log marks `injected` are reproduced by
   * applying the recorded effects — the handler is NOT re-called, the clock
   * is NOT re-read, OP_DELAY does NOT sleep. Injection is honored only for
   * steps that are legitimately external (source 'handler', or a
   * nondeterministic built-in); everything else re-executes for real.
   */
  private async executeRecordedInstruction(instr: UAALInstruction): Promise<boolean> {
    const stepIndex = this.logSteps.length;
    const pcBefore = this.state.pc;
    const hasHandler = this.handlers.has(instr.opCode);
    const injectable = hasHandler || NONDETERMINISTIC_OPCODES.has(instr.opCode);
    const recorded = this.injectLog ? this.injectLog.steps[stepIndex] : undefined;
    const shouldInject =
      recorded !== undefined &&
      recorded.injected === true &&
      recorded.opcode === instr.opCode &&
      recorded.pc === pcBefore &&
      (recorded.source === 'handler' || NONDETERMINISTIC_OPCODES.has(instr.opCode));

    const entry: UAALLogStep = {
      step: stepIndex,
      opcode: instr.opCode,
      opcodeName: getUAALOpcodeName(instr.opCode),
      operands: cloneJsonSafe(instr.operands ?? [], LOG_VALUE_DEPTH) as UAALOperand[],
      pc: pcBefore,
      stackBefore: boundedStackSnapshot(this.state.stack),
      stackAfter: { depth: 0, top: [] }, // overwritten below
    };

    let isJump = false;
    try {
      if (shouldInject) {
        // Hermetic replay: inject the recorded external effects.
        entry.injected = true;
        if (recorded.source !== undefined) {
          entry.source = recorded.source;
        }
        this.effectCapture = [];
        try {
          for (const effect of recorded.effects ?? []) {
            if (effect.op === 'push') {
              this.push(cloneJsonSafe(effect.value, LOG_VALUE_DEPTH) as UAALOperand);
            } else if (effect.op === 'pop') {
              this.pop();
            } else {
              this.peek();
            }
          }
        } finally {
          entry.effects = this.effectCapture;
          this.effectCapture = null;
        }
        if (recorded.threw) {
          throw new Error(`replay: recorded step ${stepIndex} threw`);
        }
        // Handler dispatch and every injectable built-in return false
        // (no jump) in live execution, so injected steps never jump.
        isJump = false;
      } else if (injectable) {
        entry.injected = true;
        entry.source = hasHandler ? 'handler' : 'builtin-nondeterministic';
        this.effectCapture = [];
        try {
          isJump = await this.executeInstruction(instr);
        } finally {
          entry.effects = this.effectCapture;
          this.effectCapture = null;
        }
      } else {
        isJump = await this.executeInstruction(instr);
      }
      entry.stackAfter = boundedStackSnapshot(this.state.stack);
      this.logSteps.push(entry);
      return isJump;
    } catch (err) {
      entry.threw = true;
      entry.stackAfter = boundedStackSnapshot(this.state.stack);
      this.logSteps.push(entry);
      throw err;
    }
  }

  /** Stamp the derivation-log result on run completion (no-op when off). */
  private finishRun(result: VMResult): VMResult {
    if (this.recordLog) {
      this.logFinishedAt = Date.now();
      this.logResult = {
        taskStatus: result.taskStatus,
        stackTop: cloneJsonSafe(result.stackTop, LOG_SNAPSHOT_DEPTH),
      };
    }
    return result;
  }

  private async executeInstruction(instr: UAALInstruction): Promise<boolean> {
    const operands = instr.operands ?? [];

    if (this.enableLogging) {
      this.log(
        `[PC=${this.state.pc}] ${getUAALOpcodeName(instr.opCode)} ${operands.length > 0 ? JSON.stringify(operands) : ''}`
      );
    }

    // Check for custom handler first
    const handler = this.handlers.get(instr.opCode);
    if (handler) {
      const proxy: VMProxy = {
        push: (v) => this.push(v),
        pop: () => this.pop(),
        peek: () => this.peek(),
        getState: () => this.getState(),
      };
      await handler(proxy, operands);
      return false;
    }

    // Built-in handling
    switch (instr.opCode) {
      // ── Stack ─────────────────────────────────────────────
      case UAALOpCode.PUSH:
        this.push(operands[0] ?? null);
        return false;

      case UAALOpCode.POP:
        this.pop();
        return false;

      case UAALOpCode.PEEK:
        // No-op in default mode (logging handles this)
        return false;

      // ── Cognitive Operations (default no-op implementations) ───
      case UAALOpCode.INTAKE:
        this.push({ phase: 'INTAKE', timestamp: Date.now() });
        return false;

      case UAALOpCode.REFLECT:
        this.push({ phase: 'REFLECT', reflected: true, data: this.pop() });
        return false;

      case UAALOpCode.COMPRESS: {
        const data = this.pop();
        this.push({ phase: 'COMPRESS', compressed: true, data });
        return false;
      }

      case UAALOpCode.EXECUTE:
        this.push({ phase: 'EXECUTE', executed: true });
        return false;

      case UAALOpCode.REINTAKE:
        this.push({ phase: 'REINTAKE', timestamp: Date.now() });
        return false;

      case UAALOpCode.GROW:
        this.push({ phase: 'GROW', learning: true });
        return false;

      case UAALOpCode.EVOLVE:
        this.push({ phase: 'EVOLVE', adapted: true });
        return false;

      // ── Control Flow ──────────────────────────────────────
      case UAALOpCode.JUMP: {
        const target = operands[0] as number;
        this.state.pc = target;
        return true; // Signal: don't auto-increment PC
      }

      case UAALOpCode.JUMP_IF: {
        const condition = this.pop();
        if (condition) {
          this.state.pc = operands[0] as number;
          return true;
        }
        return false;
      }

      case UAALOpCode.CALL: {
        if (this.state.callStack.length >= this.maxCallDepth) {
          throw new Error(
            `Call stack overflow: exceeded maxCallDepth (${this.maxCallDepth}). ` +
              'This is a distinct signal from maxInstructions -- it specifically ' +
              'means CALL recursed deeper than the configured limit, not that ' +
              'total execution ran long.'
          );
        }
        const target = operands[0] as number;
        this.state.callStack.push(this.state.pc + 1);
        this.state.pc = target;
        return true;
      }

      case UAALOpCode.RET: {
        const returnPc = this.state.callStack.pop();
        if (returnPc === undefined) {
          // Return with no active call frame: nowhere to return to -- halt
          // rather than throw, since a top-level RET is a valid (if unusual)
          // "this program is done" signal, the same way falling off the end
          // of the instruction list already halts.
          this.state.isHalted = true;
          return false;
        }
        this.state.pc = returnPc;
        return true;
      }

      case UAALOpCode.HALT:
        this.state.isHalted = true;
        return false;

      // ── Temporal ──────────────────────────────────────────
      case UAALOpCode.OP_TIMESTAMP:
        this.push(Date.now());
        return false;

      case UAALOpCode.OP_TIME_DELTA: {
        const t2 = this.pop() as number;
        const t1 = this.pop() as number;
        this.push(typeof t1 === 'number' && typeof t2 === 'number' ? t2 - t1 : 0);
        return false;
      }

      case UAALOpCode.OP_DELAY: {
        const delayMs = operands[0] as number;
        if (typeof delayMs === 'number' && delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 5000)));
        }
        return false;
      }

      // ── State Management ──────────────────────────────────
      case UAALOpCode.OP_STATE_SET: {
        const key = operands[0] as string;
        const value = operands[1] ?? this.pop();
        if (typeof key === 'string') {
          this.state.context[key] = value;
        }
        return false;
      }

      case UAALOpCode.OP_STATE_GET: {
        const key = operands[0] as string;
        this.push(typeof key === 'string' ? (this.state.context[key] ?? null) : null);
        return false;
      }

      // ── Checkpoint ────────────────────────────────────────
      case UAALOpCode.OP_CHECKPOINT:
        this.push({ checkpoint: operands[0], state: this.getState() });
        return false;

      // ── Error Handling ────────────────────────────────────
      case UAALOpCode.OP_ERROR:
        throw new Error(`VM Error: ${operands[0] ?? 'unknown'}`);

      case UAALOpCode.OP_ASSERT: {
        const assertion = this.pop();
        if (!assertion) {
          throw new Error(`Assertion failed at PC=${this.state.pc}`);
        }
        return false;
      }

      // ── Default: unhandled opcodes push null ──────────────
      default:
        if (this.enableLogging) {
          this.log(`Unhandled opcode: ${getUAALOpcodeName(instr.opCode)}`);
        }
        this.push(null);
        return false;
    }
  }

  // ── Default Handlers Registration ─────────────────────────────────────────

  private registerDefaultHandlers(): void {
    // No default handlers — all built-in opcodes handled in switch.
    // This method exists for future extensibility.
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private buildResult(status: VMResult['taskStatus']): VMResult {
    return {
      taskStatus: status,
      stackTop: this.state.stack.length > 0 ? this.state.stack[this.state.stack.length - 1] : null,
      state: this.getState(),
    };
  }

  private log(message: string): void {
    if (this.enableLogging) {
      console.log(`[uAAL-VM] ${message}`);
    }
  }
}

// =============================================================================
// REPLAY — falsifiable verification of a claimed derivation
// =============================================================================

/**
 * Re-execute `bytecode` fresh (recordLog on, recorded effects injected for
 * externally-influenced steps) and compare step-by-step against `log`.
 *
 * The derivation is VALID iff:
 *   1. sha256 of the canonical bytecode serialization matches
 *      log.bytecodeSha256 (tampered bytecode fails here), AND
 *   2. every replayed step matches the claimed step exactly — opcode, pc,
 *      operands, bounded stack snapshots, injection metadata (first
 *      mismatch is reported as divergenceStep), AND
 *   3. the final result (taskStatus + bounded stackTop) matches.
 *
 * Replay is hermetic: custom handlers are never re-called and the clock is
 * never re-read — recorded effects are injected instead (see the trust
 * contract in the EXECUTION LOG section header).
 */
export async function replayUAALLog(
  bytecode: UAALBytecode,
  log: UAALExecutionLog
): Promise<UAALReplayResult> {
  if (!log || log.version !== 'uaal.execution-log.v0') {
    return {
      valid: false,
      reason: `unsupported log version: ${log ? String(log.version) : String(log)}`,
    };
  }

  const actualSha = computeUAALBytecodeSha256(bytecode);
  if (actualSha !== log.bytecodeSha256) {
    return {
      valid: false,
      reason: `bytecodeSha256 mismatch: log claims ${log.bytecodeSha256}, bytecode hashes to ${actualSha}`,
    };
  }

  const vm = new UAALVirtualMachine({
    recordLog: true,
    replayInjectLog: log,
    maxStackSize: log.limits?.maxStackSize,
    maxInstructions: log.limits?.maxInstructions,
    maxCallDepth: log.limits?.maxCallDepth,
  });
  await vm.execute(bytecode, (log.initialContext ?? {}) as Record<string, UAALOperand>);
  const replayed = vm.exportLog();

  const stepCount = Math.max(log.steps.length, replayed.steps.length);
  for (let i = 0; i < stepCount; i++) {
    const claimed = log.steps[i];
    const actual = replayed.steps[i];
    if (claimed === undefined || actual === undefined) {
      return {
        valid: false,
        reason: `step count mismatch: log claims ${log.steps.length} steps, replay produced ${replayed.steps.length}`,
        divergenceStep: i,
      };
    }
    if (stableStringify(claimed) !== stableStringify(actual)) {
      return {
        valid: false,
        reason:
          `divergence at step ${i}: claimed ${claimed.opcodeName} @ pc=${claimed.pc}, ` +
          `replay produced ${actual.opcodeName} @ pc=${actual.pc}`,
        divergenceStep: i,
      };
    }
  }

  if (
    log.result?.taskStatus !== replayed.result.taskStatus ||
    stableStringify(log.result?.stackTop) !== stableStringify(replayed.result.stackTop)
  ) {
    return {
      valid: false,
      reason:
        `final result mismatch: log claims ${String(log.result?.taskStatus)} / ` +
        `${stableStringify(log.result?.stackTop)}, replay produced ` +
        `${replayed.result.taskStatus} / ${stableStringify(replayed.result.stackTop)}`,
    };
  }

  return { valid: true, reason: 'deterministic replay reproduced the claimed derivation' };
}
