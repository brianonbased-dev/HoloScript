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

// =============================================================================
// VM STATE
// =============================================================================

export interface VMState {
  stack: UAALOperand[];
  pc: number;
  context: Record<string, UAALOperand>;
  isHalted: boolean;
}

export interface VMResult {
  taskStatus: 'RUNNING' | 'HALTED' | 'SUSPENDED' | 'ERROR' | 'IDLE';
  stackTop: UAALOperand;
  state: VMState;
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

export interface UAALVMOptions {
  enableLogging?: boolean;
  maxStackSize?: number;
  maxInstructions?: number;
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

  constructor(options: UAALVMOptions = {}) {
    this.enableLogging = options.enableLogging ?? false;
    this.maxStackSize = options.maxStackSize ?? 4096;
    this.maxInstructions = options.maxInstructions ?? 100_000;
    this.state = this.createInitialState();
    this.registerDefaultHandlers();
  }

  private createInitialState(context: Record<string, UAALOperand> = {}): VMState {
    return {
      stack: [],
      pc: 0,
      context: { ...context },
      isHalted: false,
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
          return this.buildResult('ERROR');
        }

        const instr = bytecode.instructions[this.state.pc];
        const isJump = await this.executeInstruction(instr);

        // Only increment PC if the instruction didn't jump
        if (!isJump) {
          this.state.pc++;
        }

        instructionCount++;
      }

      return this.buildResult(this.state.isHalted ? 'HALTED' : 'HALTED');
    } catch (err) {
      if (this.enableLogging) {
        this.log(`Execution error: ${err}`);
      }
      return this.buildResult('ERROR');
    }
  }

  /**
   * Get current VM state
   */
  getState(): VMState {
    return { ...this.state, stack: [...this.state.stack], context: { ...this.state.context } };
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
  }

  pop(): UAALOperand {
    return this.state.stack.pop() ?? null;
  }

  peek(): UAALOperand {
    return this.state.stack.length > 0 ? this.state.stack[this.state.stack.length - 1] : null;
  }

  // ── Instruction Execution ─────────────────────────────────────────────────

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
