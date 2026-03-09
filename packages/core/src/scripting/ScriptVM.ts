/**
 * ScriptVM.ts
 *
 * Stack-based bytecode VM: compile simple expressions to opcodes,
 * execute with sandboxed registers and call stack.
 *
 * @module scripting
 */

// =============================================================================
// TYPES
// =============================================================================

export enum OpCode {
  NOP = 0x00,
  PUSH = 0x01,
  POP = 0x02,
  ADD = 0x10,
  SUB = 0x11,
  MUL = 0x12,
  DIV = 0x13,
  MOD = 0x14,
  NEG = 0x15,
  EQ = 0x20,
  NEQ = 0x21,
  LT = 0x22,
  GT = 0x23,
  LTE = 0x24,
  GTE = 0x25,
  AND = 0x26,
  OR = 0x27,
  NOT = 0x28,
  LOAD = 0x30,
  STORE = 0x31,
  JMP = 0x40,
  JMP_IF = 0x41,
  JMP_NOT = 0x42,
  CALL = 0x50,
  RET = 0x51,
  HALT = 0xff,
}

export interface Instruction {
  op: OpCode;
  operand?: number | string;
}

export interface VMState {
  pc: number;
  stack: number[];
  registers: Map<string, number>;
  running: boolean;
  error: string | null;
  instructionsExecuted: number;
}

// =============================================================================
// SCRIPT VM
// =============================================================================

export class ScriptVM {
  private stack: number[] = [];
  private registers: Map<string, number> = new Map();
  private pc = 0;
  private program: Instruction[] = [];
  private running = false;
  private error: string | null = null;
  private maxStackSize = 256;
  private maxInstructions = 10000;
  private instructionsExecuted = 0;
  private nativeFunctions: Map<string, (...args: number[]) => number> = new Map();

  constructor() {
    // Register built-in functions
    this.nativeFunctions.set('abs', (a) => Math.abs(a));
    this.nativeFunctions.set('min', (a, b) => Math.min(a, b));
    this.nativeFunctions.set('max', (a, b) => Math.max(a, b));
    this.nativeFunctions.set('floor', (a) => Math.floor(a));
    this.nativeFunctions.set('sqrt', (a) => Math.sqrt(a));
  }

  // ---------------------------------------------------------------------------
  // Program Loading
  // ---------------------------------------------------------------------------

  load(instructions: Instruction[]): void {
    this.program = [...instructions];
    this.reset();
  }

  reset(): void {
    this.stack = [];
    this.pc = 0;
    this.running = false;
    this.error = null;
    this.instructionsExecuted = 0;
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  run(): VMState {
    this.running = true;
    this.error = null;

    while (this.running && this.pc < this.program.length) {
      if (this.instructionsExecuted >= this.maxInstructions) {
        this.error = 'Max instructions exceeded';
        this.running = false;
        break;
      }

      const instr = this.program[this.pc];
      this.pc++;
      this.instructionsExecuted++;

      try {
        this.execute(instr);
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e);
        this.running = false;
      }
    }

    this.running = false;
    return this.getState();
  }

  step(): boolean {
    if (this.pc >= this.program.length) return false;
    const instr = this.program[this.pc];
    this.pc++;
    this.instructionsExecuted++;
    try {
      this.execute(instr);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      return false;
    }
    return this.running;
  }

  private execute(instr: Instruction): void {
    switch (instr.op) {
      case OpCode.NOP:
        break;
      case OpCode.HALT:
        this.running = false;
        break;

      case OpCode.PUSH:
        this.push(instr.operand as number);
        break;
      case OpCode.POP:
        this.pop();
        break;

      case OpCode.ADD: {
        const b = this.pop(),
          a = this.pop();
        this.push(a + b);
        break;
      }
      case OpCode.SUB: {
        const b = this.pop(),
          a = this.pop();
        this.push(a - b);
        break;
      }
      case OpCode.MUL: {
        const b = this.pop(),
          a = this.pop();
        this.push(a * b);
        break;
      }
      case OpCode.DIV: {
        const b = this.pop(),
          a = this.pop();
        if (b === 0) throw new Error('Division by zero');
        this.push(a / b);
        break;
      }
      case OpCode.MOD: {
        const b = this.pop(),
          a = this.pop();
        this.push(a % b);
        break;
      }
      case OpCode.NEG:
        this.push(-this.pop());
        break;

      case OpCode.EQ: {
        const b = this.pop(),
          a = this.pop();
        this.push(a === b ? 1 : 0);
        break;
      }
      case OpCode.NEQ: {
        const b = this.pop(),
          a = this.pop();
        this.push(a !== b ? 1 : 0);
        break;
      }
      case OpCode.LT: {
        const b = this.pop(),
          a = this.pop();
        this.push(a < b ? 1 : 0);
        break;
      }
      case OpCode.GT: {
        const b = this.pop(),
          a = this.pop();
        this.push(a > b ? 1 : 0);
        break;
      }
      case OpCode.LTE: {
        const b = this.pop(),
          a = this.pop();
        this.push(a <= b ? 1 : 0);
        break;
      }
      case OpCode.GTE: {
        const b = this.pop(),
          a = this.pop();
        this.push(a >= b ? 1 : 0);
        break;
      }
      case OpCode.AND: {
        const b = this.pop(),
          a = this.pop();
        this.push(a && b ? 1 : 0);
        break;
      }
      case OpCode.OR: {
        const b = this.pop(),
          a = this.pop();
        this.push(a || b ? 1 : 0);
        break;
      }
      case OpCode.NOT:
        this.push(this.pop() ? 0 : 1);
        break;

      case OpCode.LOAD:
        this.push(this.registers.get(instr.operand as string) ?? 0);
        break;
      case OpCode.STORE:
        this.registers.set(instr.operand as string, this.pop());
        break;

      case OpCode.JMP:
        this.pc = instr.operand as number;
        break;
      case OpCode.JMP_IF: {
        const v = this.pop();
        if (v) this.pc = instr.operand as number;
        break;
      }
      case OpCode.JMP_NOT: {
        const v = this.pop();
        if (!v) this.pc = instr.operand as number;
        break;
      }

      case OpCode.CALL: {
        const name = instr.operand as string;
        const fn = this.nativeFunctions.get(name);
        if (!fn) throw new Error(`Unknown function: ${name}`);
        // Pop args count from stack, then pop args
        const argc = this.pop();
        const args: number[] = [];
        for (let i = 0; i < argc; i++) args.unshift(this.pop());
        this.push(fn(...args));
        break;
      }
      case OpCode.RET:
        this.running = false;
        break;

      default:
        throw new Error(`Unknown opcode: 0x${instr.op.toString(16)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Stack Operations
  // ---------------------------------------------------------------------------

  private push(value: number): void {
    if (this.stack.length >= this.maxStackSize) throw new Error('Stack overflow');
    this.stack.push(value);
  }

  private pop(): number {
    if (this.stack.length === 0) throw new Error('Stack underflow');
    return this.stack.pop()!;
  }

  peek(): number | undefined {
    return this.stack[this.stack.length - 1];
  }
  getStackSize(): number {
    return this.stack.length;
  }

  // ---------------------------------------------------------------------------
  // Registers & State
  // ---------------------------------------------------------------------------

  setRegister(name: string, value: number): void {
    this.registers.set(name, value);
  }
  getRegister(name: string): number {
    return this.registers.get(name) ?? 0;
  }

  registerFunction(name: string, fn: (...args: number[]) => number): void {
    this.nativeFunctions.set(name, fn);
  }

  getState(): VMState {
    return {
      pc: this.pc,
      stack: [...this.stack],
      registers: new Map(this.registers),
      running: this.running,
      error: this.error,
      instructionsExecuted: this.instructionsExecuted,
    };
  }
}
