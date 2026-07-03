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
 * HoloStatement bodies). Named actions lower as real UAAL CALL/RET entry
 * points with a patched name -> PC symbol table; `main` is the bootstrap entry
 * when present. It deliberately does NOT touch spatial nodes
 * (objects/geometry/transforms): a "spawn a cube" node has no image in the
 * uAAL cognitive ISA, and lowering it would be a category error (that path is
 * HolobCompiler -> HoloVM, the spatial VM). Loops (While/For/ClassicFor) lower
 * to real back-edge bytecode (see lowerWhile/lowerFor/lowerClassicFor below);
 * animate/on-error are still recorded as `stats.unhandled` rather than faked —
 * an honest partial, not a stub that discards its input.
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
  HoloWhileStatement,
  HoloForStatement,
  HoloClassicForStatement,
  HoloExpression,
  HoloAction,
  HoloEventHandler,
} from '../parser/HoloCompositionTypes';

// UAAL opcode subset used by this lowering. Mirrors @holoscript/uaal
// `src/opcodes.ts` (verified 2026-06-22); drift-guarded in the e2e test.
const OP = {
  PUSH: 0x01,
  EXECUTE: 0x14,
  JUMP: 0x30,
  JUMP_IF: 0x31,
  CALL: 0x32,
  RET: 0x33,
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
  /** Statement kinds intentionally not yet lowered (animate, on-error). */
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
  private entryPoints = new Map<string, number>();
  private actionNames = new Set<string>();
  private callPatches: Array<{ instructionIndex: number; targetName: string }> = [];

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

    this.entryPoints = new Map();
    this.actionNames = new Set();
    this.callPatches = [];

    const actions: HoloAction[] = [
      ...(composition.actions ?? []),
      ...(composition.logic?.actions ?? []),
    ];
    const handlers: HoloEventHandler[] = [
      ...(composition.eventHandlers ?? []),
      ...(composition.logic?.handlers ?? []),
    ];

    this.collectActionSymbols(actions);

    for (const targetName of this.bootstrapTargets(actions, handlers)) {
      this.emitCall(targetName);
    }
    this.emit(OP.HALT);

    for (const action of actions) {
      this.recordEntryPoint(action.name);
      this.stats.actions++;
      for (const stmt of action.body) this.lowerStatement(stmt);
      this.ensureReturn();
    }
    for (const handler of handlers) {
      this.recordEntryPoint(this.handlerEntryName(handler));
      this.stats.handlers++;
      for (const stmt of handler.body) this.lowerStatement(stmt);
      this.ensureReturn();
    }

    this.patchCallTargets();
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

  private collectActionSymbols(actions: HoloAction[]): void {
    for (const action of actions) {
      if (this.actionNames.has(action.name)) {
        throw new Error(`Duplicate UAAL action entry point: ${action.name}`);
      }
      this.actionNames.add(action.name);
    }
  }

  private bootstrapTargets(actions: HoloAction[], handlers: HoloEventHandler[]): string[] {
    const main = actions.find((action) => action.name === 'main');
    if (main) return [main.name];
    return [
      ...actions.map((action) => action.name),
      ...handlers.map((handler) => this.handlerEntryName(handler)),
    ];
  }

  private handlerEntryName(handler: HoloEventHandler): string {
    return `event:${handler.event}`;
  }

  private recordEntryPoint(name: string): void {
    if (this.entryPoints.has(name)) {
      throw new Error(`Duplicate UAAL entry point: ${name}`);
    }
    this.entryPoints.set(name, this.instructions.length);
  }

  private emitCall(targetName: string): number {
    const instructionIndex = this.emit(OP.CALL, [0]);
    this.callPatches.push({ instructionIndex, targetName });
    return instructionIndex;
  }

  private patchCallTargets(): void {
    for (const patch of this.callPatches) {
      const target = this.entryPoints.get(patch.targetName);
      if (target === undefined) {
        throw new Error(`Unresolved UAAL action call: ${patch.targetName}`);
      }
      this.instructions[patch.instructionIndex].operands = [target];
    }
  }

  private ensureReturn(): void {
    this.emit(OP.RET);
  }

  private lowerStatement(stmt: HoloStatement): void {
    this.stats.statements++;
    switch (stmt.type) {
      case 'MethodCall': {
        if (!stmt.object && this.actionNames.has(stmt.method)) {
          for (const arg of stmt.arguments) this.emit(OP.PUSH, [this.lowerExpr(arg)]);
          this.emitCall(stmt.method);
          return;
        }
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
        if (this.lowerActionCallExpression(stmt.expression)) return;
        this.emit(OP.EXECUTE, ['expr', this.lowerExpr(stmt.expression)]);
        this.stats.executeCalls++;
        return;
      }
      case 'ReturnStatement': {
        if (stmt.value) {
          if (!this.lowerActionCallExpression(stmt.value)) {
            this.emit(OP.PUSH, [this.lowerExpr(stmt.value)]);
          }
        }
        this.emit(OP.RET);
        return;
      }
      case 'IfStatement': {
        this.lowerIf(stmt);
        return;
      }
      case 'WhileStatement': {
        this.lowerWhile(stmt);
        return;
      }
      case 'ForStatement': {
        this.lowerFor(stmt);
        return;
      }
      case 'ClassicForStatement': {
        this.lowerClassicFor(stmt);
        return;
      }
      // Deferred to a later G3 slice: animate/on-error need domain ops this
      // pass has no lowering for yet. Recorded honestly rather than faked.
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
    this.lowerCondition(stmt.condition);
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

  private lowerCondition(expr: HoloExpression): void {
    if (expr.type === 'Literal') {
      this.emit(OP.PUSH, [expr.value]);
      return;
    }
    if (this.lowerActionCallExpression(expr)) return;
    this.emit(OP.EXECUTE, ['cond', this.lowerExpr(expr)]);
    this.stats.executeCalls++;
  }

  /**
   * Lower a while loop into a back-edge loop:
   *   loopHead: EXECUTE('cond', <condition>); JUMP_IF bodyStart; JUMP end;
   *   bodyStart: <body>; JUMP loopHead; end:
   *
   * Unlike `lowerIf`'s condition (a raw PUSH of the compiled expression
   * operand), the condition here is wrapped in an EXECUTE call rather than a
   * bare PUSH. This is deliberate, not cosmetic: PUSH+lowerExpr bakes a
   * COMPILE-TIME-fixed operand into the instruction stream (fine for if/else,
   * evaluated once), but a loop's condition must be re-examined every
   * iteration against the CURRENT runtime state. Only a host-registered
   * EXECUTE handler (the same extension point Assignment/VariableDeclaration
   * already delegate real semantics through, see lowerStatement above) can
   * produce a genuinely varying value across iterations; a bare PUSH of a
   * structural expression object (e.g. `{op:'<', l:..., r:...}`) would be a
   * non-null object and therefore always truthy to JUMP_IF regardless of the
   * comparison it describes, silently producing an infinite loop.
   */
  private lowerWhile(stmt: HoloWhileStatement): void {
    const loopHead = this.instructions.length;
    this.emit(OP.EXECUTE, ['cond', this.lowerExpr(stmt.condition)]);
    const jumpIfIdx = this.emit(OP.JUMP_IF, [0]);
    const jumpEndIdx = this.emit(OP.JUMP, [0]);
    const bodyStart = this.instructions.length;
    for (const s of stmt.body) this.lowerStatement(s);
    this.emit(OP.JUMP, [loopHead]);
    const end = this.instructions.length;
    this.instructions[jumpIfIdx].operands = [bodyStart];
    this.instructions[jumpEndIdx].operands = [end];
    this.stats.branches++;
  }

  /**
   * Lower a for-of loop (`for (variable in iterable) { body }`) into the same
   * back-edge shape as `lowerWhile`, with iteration state (the current index
   * and current-element binding) delegated to the host via two dedicated
   * EXECUTE tags -- `forHasNext:VAR` (host pushes a real boolean: more
   * elements remain) and `forNext:VAR` (host advances the iterator and binds
   * the current element to VAR in its own state/context). The VM has no
   * native iterator/collection-indexing primitive, so -- consistent with how
   * Assignment/VariableDeclaration already delegate real semantics rather
   * than the compiler inventing them -- iteration mechanics are the host's
   * responsibility, not this pass's. `forInit:VAR` binds the iterable once,
   * before the loop head, so it is evaluated exactly once, not per-iteration.
   */
  private lowerFor(stmt: HoloForStatement): void {
    this.emit(OP.EXECUTE, [`forInit:${stmt.variable}`, this.lowerExpr(stmt.iterable)]);
    const loopHead = this.instructions.length;
    this.emit(OP.EXECUTE, [`forHasNext:${stmt.variable}`]);
    const jumpIfIdx = this.emit(OP.JUMP_IF, [0]);
    const jumpEndIdx = this.emit(OP.JUMP, [0]);
    const bodyStart = this.instructions.length;
    this.emit(OP.EXECUTE, [`forNext:${stmt.variable}`]);
    for (const s of stmt.body) this.lowerStatement(s);
    this.emit(OP.JUMP, [loopHead]);
    const end = this.instructions.length;
    this.instructions[jumpIfIdx].operands = [bodyStart];
    this.instructions[jumpEndIdx].operands = [end];
    this.stats.branches++;
  }

  /**
   * Lower a classic C-style for loop (`for (init; test; update) { body }`)
   * into the same back-edge shape. `init`/`update` are themselves
   * `HoloStatement`s (per HoloCompositionTypes) so they reuse
   * `lowerStatement` directly rather than new machinery; `test` reuses the
   * same `cond` EXECUTE-tag convention as `lowerWhile` for the same reason
   * (a loop condition must be re-evaluated by the host every iteration, not
   * baked in once at compile time). A missing `test` lowers to a literal
   * `true` PUSH (an intentionally infinite loop, bounded only by the VM's
   * `maxInstructions` guard or a future break-statement lowering) rather than
   * silently treating "no test" as "never runs."
   */
  private lowerClassicFor(stmt: HoloClassicForStatement): void {
    if (stmt.init) this.lowerStatement(stmt.init);
    const loopHead = this.instructions.length;
    if (stmt.test) {
      this.emit(OP.EXECUTE, ['cond', this.lowerExpr(stmt.test)]);
    } else {
      this.emit(OP.PUSH, [true]);
    }
    const jumpIfIdx = this.emit(OP.JUMP_IF, [0]);
    const jumpEndIdx = this.emit(OP.JUMP, [0]);
    const bodyStart = this.instructions.length;
    for (const s of stmt.body) this.lowerStatement(s);
    if (stmt.update) this.lowerStatement(stmt.update);
    this.emit(OP.JUMP, [loopHead]);
    const end = this.instructions.length;
    this.instructions[jumpIfIdx].operands = [bodyStart];
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

  private lowerActionCallExpression(expr: HoloExpression): boolean {
    if (expr.type !== 'CallExpression') return false;
    const targetName = this.resolveActionCallee(expr.callee);
    if (!targetName) return false;
    for (const arg of expr.arguments) this.emit(OP.PUSH, [this.lowerExpr(arg)]);
    this.emitCall(targetName);
    return true;
  }

  private resolveActionCallee(callee: HoloExpression): string | null {
    if (callee.type === 'Identifier' && this.actionNames.has(callee.name)) {
      return callee.name;
    }
    return null;
  }
}
