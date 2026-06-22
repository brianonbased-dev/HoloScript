/**
 * UaalBehaviorCompiler — HoloComposition behavior AST -> UAAL bytecode
 *
 * Gap G3 (docs/spec/spec-vs-reality-gap.md): the canonical three-format
 * front-end never reached the cognitive uAAL VM. `@holoscript/uaal` shipped a
 * VM + a compiler, but that compiler only consumed its own "Intent DSL"
 * (INTAKE("x"), CYCLE("task")), never the parser's AST. This pass bridges them:
 *
 *   .holo / .hsplus -> parse -> HoloComposition -> UaalBehaviorCompiler
 *     -> UAALBytecode -> UAALVirtualMachine.execute()
 *
 * SCOPE (premortem-bounded). It lowers ONLY the cognitive/behavioral subset of
 * a HoloComposition — `actions`, `eventHandlers`, and `logic` (their
 * HoloStatement bodies). It deliberately does NOT touch spatial nodes
 * (objects/geometry/transforms): a "spawn a cube" node has no image in the
 * uAAL cognitive ISA, and lowering it would be a category error (that path is
 * HolobCompiler -> HoloVM, the spatial VM). Loops/animate/on-error are recorded
 * as `stats.unhandled` rather than faked — an honest partial, not a stub that
 * discards its input.
 *
 * The emitted bytecode is structurally `UAALBytecode` from `@holoscript/uaal`
 * but is built with local opcode constants so this pass adds NO dependency edge
 * (mirrors how HolobCompiler stays decoupled from holo-vm). The opcode values
 * are drift-guarded against the real `UAALOpCode` enum by the e2e test.
 *
 * @module UaalBehaviorCompiler
 * @version 1.0.0
 */

import type {
  HoloComposition,
  HoloStatement,
  HoloIfStatement,
  HoloExpression,
} from '../parser/HoloCompositionTypes';

// UAAL opcode subset used by this lowering. Mirrors @holoscript/uaal
// `src/opcodes.ts` (verified 2026-06-22); drift-guarded in the e2e test.
const OP = {
  PUSH: 0x01,
  EXECUTE: 0x14,
  JUMP: 0x30,
  JUMP_IF: 0x31,
  HALT: 0xff,
} as const;

/** Structural mirror of `@holoscript/uaal`'s UAALOperand (no dependency edge). */
export type UaalOperand =
  | string
  | number
  | boolean
  | { [key: string]: unknown }
  | UaalOperand[]
  | null;

export interface UaalInstruction {
  opCode: number;
  operands?: UaalOperand[];
}

export interface UaalBytecode {
  version: number;
  instructions: UaalInstruction[];
}

export interface UaalBehaviorCompileStats {
  actions: number;
  handlers: number;
  statements: number;
  instructions: number;
  executeCalls: number;
  branches: number;
  /** Statement kinds intentionally not yet lowered (loops, animate, on-error). */
  unhandled: Record<string, number>;
  compilationMs: number;
}

export interface UaalBehaviorCompileResult {
  /** Pass to `new UAALVirtualMachine().execute(bytecode)`. */
  bytecode: UaalBytecode;
  stats: UaalBehaviorCompileStats;
}

export class UaalBehaviorCompiler {
  private instructions: UaalInstruction[] = [];
  private stats!: Omit<UaalBehaviorCompileStats, 'compilationMs'>;

  /**
   * Lower the behavioral subset of a HoloComposition to UAAL bytecode.
   * Spatial nodes are ignored by design (see module doc).
   */
  compile(composition: HoloComposition): UaalBehaviorCompileResult {
    const startMs = performance.now();
    this.instructions = [];
    this.stats = {
      actions: 0,
      handlers: 0,
      statements: 0,
      instructions: 0,
      executeCalls: 0,
      branches: 0,
      unhandled: {},
    };

    const actions = [
      ...(composition.actions ?? []),
      ...(composition.logic?.actions ?? []),
    ];
    const handlers = [
      ...(composition.eventHandlers ?? []),
      ...(composition.logic?.handlers ?? []),
    ];

    for (const action of actions) {
      this.stats.actions++;
      for (const stmt of action.body) this.lowerStatement(stmt);
    }
    for (const handler of handlers) {
      this.stats.handlers++;
      for (const stmt of handler.body) this.lowerStatement(stmt);
    }

    this.emit(OP.HALT);
    this.stats.instructions = this.instructions.length;

    return {
      bytecode: { version: 2, instructions: this.instructions },
      stats: { ...this.stats, compilationMs: performance.now() - startMs },
    };
  }

  /** Append an instruction; returns its index (for jump back-patching). */
  private emit(opCode: number, operands?: UaalOperand[]): number {
    this.instructions.push(operands ? { opCode, operands } : { opCode });
    return this.instructions.length - 1;
  }

  private lowerStatement(stmt: HoloStatement): void {
    this.stats.statements++;
    switch (stmt.type) {
      case 'MethodCall': {
        const key = stmt.object ? `${stmt.object}.${stmt.method}` : stmt.method;
        this.emit(OP.EXECUTE, [key, ...stmt.arguments.map((a) => this.lowerExpr(a))]);
        this.stats.executeCalls++;
        return;
      }
      case 'EmitStatement': {
        this.emit(OP.EXECUTE, [`emit:${stmt.event}`, stmt.data ? this.lowerExpr(stmt.data) : null]);
        this.stats.executeCalls++;
        return;
      }
      case 'Assignment': {
        this.emit(OP.EXECUTE, [`assign:${stmt.target}`, stmt.operator, this.lowerExpr(stmt.value)]);
        this.stats.executeCalls++;
        return;
      }
      case 'VariableDeclaration': {
        this.emit(OP.EXECUTE, [`declare:${stmt.name}`, stmt.value ? this.lowerExpr(stmt.value) : null]);
        this.stats.executeCalls++;
        return;
      }
      case 'AwaitStatement': {
        this.emit(OP.EXECUTE, ['await', this.lowerExpr(stmt.expression)]);
        this.stats.executeCalls++;
        return;
      }
      case 'ExpressionStatement': {
        this.emit(OP.EXECUTE, ['expr', this.lowerExpr(stmt.expression)]);
        this.stats.executeCalls++;
        return;
      }
      case 'ReturnStatement': {
        if (stmt.value) this.emit(OP.PUSH, [this.lowerExpr(stmt.value)]);
        return;
      }
      case 'IfStatement': {
        this.lowerIf(stmt);
        return;
      }
      // Deferred to a later G3 slice: loops need back-edge handling; animate /
      // on-error need domain ops. Recorded honestly rather than faked.
      case 'ForStatement':
      case 'WhileStatement':
      case 'ClassicForStatement':
      case 'AnimateStatement':
      case 'OnErrorStatement': {
        this.stats.unhandled[stmt.type] = (this.stats.unhandled[stmt.type] ?? 0) + 1;
        return;
      }
      default: {
        const _exhaustive: never = stmt;
        void _exhaustive;
      }
    }
  }

  /**
   * Lower an if/else into real control flow:
   *   PUSH cond; JUMP_IF thenStart; <alternate>; JUMP end; thenStart: <consequent>; end:
   * JUMP_IF pops the condition and jumps when truthy (uaal vm.ts), so a falsy
   * condition falls through to the alternate and the consequent is skipped.
   */
  private lowerIf(stmt: HoloIfStatement): void {
    this.emit(OP.PUSH, [this.lowerExpr(stmt.condition)]);
    const jumpIfIdx = this.emit(OP.JUMP_IF, [0]);
    if (stmt.alternate) for (const s of stmt.alternate) this.lowerStatement(s);
    const jumpEndIdx = this.emit(OP.JUMP, [0]);
    const thenStart = this.instructions.length;
    for (const s of stmt.consequent) this.lowerStatement(s);
    const end = this.instructions.length;
    this.instructions[jumpIfIdx].operands = [thenStart];
    this.instructions[jumpEndIdx].operands = [end];
    this.stats.branches++;
  }

  /** Lower an expression to a deterministic operand (equal source -> equal operand). */
  private lowerExpr(expr: HoloExpression): UaalOperand {
    switch (expr.type) {
      case 'Literal':
        return expr.value;
      case 'Identifier':
        return { ref: expr.name };
      case 'BinaryExpression':
        return { op: expr.operator, l: this.lowerExpr(expr.left), r: this.lowerExpr(expr.right) };
      case 'UnaryExpression':
        return { op: expr.operator, arg: this.lowerExpr(expr.argument) };
      case 'MemberExpression':
        return { member: this.lowerExpr(expr.object), prop: expr.property, computed: expr.computed };
      case 'CallExpression':
        return { call: this.lowerExpr(expr.callee), args: expr.arguments.map((a) => this.lowerExpr(a)) };
      case 'ArrayExpression':
        return expr.elements.map((e) => this.lowerExpr(e));
      case 'ObjectExpression': {
        const obj: { [key: string]: unknown } = {};
        for (const prop of expr.properties) obj[prop.key] = this.lowerExpr(prop.value);
        return obj;
      }
      case 'ConditionalExpression':
        return {
          cond: this.lowerExpr(expr.test),
          then: this.lowerExpr(expr.consequent),
          else: this.lowerExpr(expr.alternate),
        };
      case 'UpdateExpression':
        return { op: expr.operator, arg: this.lowerExpr(expr.argument), prefix: expr.prefix };
      case 'BindExpression':
        return { bind: expr.source, transform: expr.transform ?? null };
      default: {
        const _exhaustive: never = expr;
        void _exhaustive;
        return null;
      }
    }
  }
}
