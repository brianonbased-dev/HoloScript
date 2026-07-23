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
import {
  createSemanticClosureReceipt,
  type HoloScriptSurface,
  type SemanticClosureEntry,
  type SemanticClosureReceipt,
  type SemanticClosureStageResult,
} from '@holoscript/meaning';
import { hashComposition } from './ReproducibilityMode';
import { validateHoloBehaviorTypes } from './HoloBehaviorTypeValidator';

// UAAL opcode subset used by this lowering. Mirrors @holoscript/uaal
// `src/opcodes.ts` (verified 2026-06-22); drift-guarded in the e2e test.
const OP = {
  PUSH: 0x01,
  EXECUTE: 0x14,
  JUMP: 0x30,
  JUMP_IF: 0x31,
  CALL: 0x32,
  RET: 0x33,
  STATE_SET: 0xcb,
  HALT: 0xff,
} as const;

const HOLO_STATE_REFERENCE_ABI = 'holo.behavior.state-ref.v1';

/** Structural mirror of `@holoscript/uaal`'s UAALOperand (no dependency edge). */
export type UaalOperand =
  | string
  | number
  | boolean
  | { [key: string]: unknown }
  | UaalOperand[]
  | null;

export interface UaalBehaviorStateReference {
  abi: typeof HOLO_STATE_REFERENCE_ABI;
  key: string;
}

/**
 * Resolve the versioned state-reference ABI emitted for action parameters.
 * Hosts already provide EXECUTE handlers for `.holo` effects; this helper
 * lets those handlers recover the actual call-frame value without guessing
 * at compiler-private slot names.
 */
export function resolveUaalBehaviorOperand(
  operand: UaalOperand,
  context: Readonly<Record<string, UaalOperand>>
): UaalOperand {
  const seen = new Set<string>();
  const resolveValue = (value: UaalOperand): UaalOperand => {
    if (
      value !== null &&
      !Array.isArray(value) &&
      typeof value === 'object' &&
      value.abi === HOLO_STATE_REFERENCE_ABI &&
      typeof value.key === 'string'
    ) {
      if (seen.has(value.key)) {
        throw new Error(`Cyclic UAAL behavior state reference: ${value.key}`);
      }
      seen.add(value.key);
      const resolved = resolveValue(context[value.key] ?? null);
      seen.delete(value.key);
      return resolved;
    }
    if (Array.isArray(value)) return value.map(resolveValue);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, resolveValue(child as UaalOperand)])
      );
    }
    return value;
  };
  return resolveValue(operand);
}

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
  /** Fail-closed account of which accepted constructs survived this lowering. */
  semanticClosure: SemanticClosureReceipt;
}

export interface UaalBehaviorCompileOptions {
  /** The canonical surface that produced the composition-shaped AST. */
  sourceSurface?: Extract<HoloScriptSurface, '.holo' | '.hsplus'>;
  /**
   * Explicit action/event entry points to invoke from the bootstrap section.
   * Event handlers use `event:<event-name>`. Omitted preserves the legacy
   * `main`-or-all behavior.
   */
  entryPoints?: string[];
}

export class UaalBehaviorCompiler {
  private instructions: UaalInstruction[] = [];
  private stats!: Omit<UaalBehaviorCompileStats, 'compilationMs'>;
  private entryPoints = new Map<string, number>();
  private actionNames = new Set<string>();
  private actionsByName = new Map<string, HoloAction>();
  private currentParameterSlots = new Map<string, string>();
  private callPatches: Array<{ instructionIndex: number; targetName: string }> = [];

  /**
   * Lower the behavioral subset of a HoloComposition to UAAL bytecode.
   * Spatial nodes are ignored by design (see module doc).
   */
  compile(
    composition: HoloComposition,
    options: UaalBehaviorCompileOptions = {}
  ): UaalBehaviorCompileResult {
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
    this.actionsByName = new Map();
    this.currentParameterSlots = new Map();
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

    for (const targetName of this.bootstrapTargets(actions, handlers, options.entryPoints)) {
      const action = this.actionsByName.get(targetName);
      if (action) {
        this.emitActionArguments(targetName, [], true);
      } else {
        const handler = handlers.find(
          (candidate) => this.handlerEntryName(candidate) === targetName
        );
        if (handler && handler.parameters.length > 0) {
          throw new Error(
            `UAAL bootstrap event ${targetName} requires ${handler.parameters.length} runtime argument(s)`
          );
        }
      }
      this.emitCall(targetName);
    }
    this.emit(OP.HALT);

    for (const action of actions) {
      this.recordEntryPoint(action.name);
      this.stats.actions++;
      this.currentParameterSlots = new Map(
        action.parameters.map((parameter) => [
          parameter.name,
          this.parameterSlot(action.name, parameter.name),
        ])
      );
      for (const parameter of [...action.parameters].reverse()) {
        this.emit(OP.STATE_SET, [this.parameterSlot(action.name, parameter.name)]);
      }
      for (const stmt of action.body) this.lowerStatement(stmt);
      this.ensureReturn();
      this.currentParameterSlots.clear();
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
      semanticClosure: this.createSemanticClosure(
        composition,
        actions,
        handlers,
        options.sourceSurface ?? '.holo'
      ),
    };
  }

  private createSemanticClosure(
    composition: HoloComposition,
    actions: HoloAction[],
    handlers: HoloEventHandler[],
    surface: Extract<HoloScriptSurface, '.holo' | '.hsplus'>
  ): SemanticClosureReceipt {
    // Inventory the admitted AST independently from entry emission. Deriving
    // expectedConstructs from `entries` would make completeness circular: a
    // dropped statement would disappear from both sides and still pass.
    const expectedConstructs = this.collectExpectedConstructs(actions, handlers);
    const entries: SemanticClosureEntry[] = [];
    const typeEvidence = validateHoloBehaviorTypes(composition, actions, handlers);

    for (const action of actions) {
      const childEntries = this.collectStatementClosureEntries(
        action.body,
        `action:${action.name}/body`,
        surface,
        typeEvidence
      );
      entries.push(
        this.createClosureEntry(
          `action:${action.name}`,
          'Action',
          surface,
          childEntries.every((entry) => entry.stages.lowered.status === 'passed'),
          typeEvidence.get(`action:${action.name}`)
        ),
        ...childEntries
      );
    }

    for (const handler of handlers) {
      const handlerName = this.handlerEntryName(handler);
      const childEntries = this.collectStatementClosureEntries(
        handler.body,
        `${handlerName}/body`,
        surface,
        typeEvidence
      );
      entries.push(
        this.createClosureEntry(
          handlerName,
          'EventHandler',
          surface,
          childEntries.every((entry) => entry.stages.lowered.status === 'passed'),
          typeEvidence.get(handlerName)
        ),
        ...childEntries
      );
    }

    return createSemanticClosureReceipt({
      sourceDigest: `holo-fnv256:${hashComposition(composition)}`,
      toolchain: 'UaalBehaviorCompiler@1',
      target: 'cognitive-vm/uaal-bytecode',
      expectedConstructs,
      entries,
    });
  }

  private collectExpectedConstructs(actions: HoloAction[], handlers: HoloEventHandler[]): string[] {
    const expected: string[] = [];
    for (const action of actions) {
      expected.push(
        `action:${action.name}`,
        ...this.collectExpectedStatementConstructs(action.body, `action:${action.name}/body`)
      );
    }
    for (const handler of handlers) {
      const handlerName = this.handlerEntryName(handler);
      expected.push(
        handlerName,
        ...this.collectExpectedStatementConstructs(handler.body, `${handlerName}/body`)
      );
    }
    return expected;
  }

  private collectExpectedStatementConstructs(statements: HoloStatement[], path: string): string[] {
    const expected: string[] = [];
    statements.forEach((statement, index) => {
      const constructId = `${path}:${index}`;
      expected.push(constructId);

      switch (statement.type) {
        case 'IfStatement':
          expected.push(
            ...this.collectExpectedStatementConstructs(
              statement.consequent,
              `${constructId}/consequent`
            )
          );
          if (statement.alternate) {
            expected.push(
              ...this.collectExpectedStatementConstructs(
                statement.alternate,
                `${constructId}/alternate`
              )
            );
          }
          break;
        case 'WhileStatement':
        case 'ForStatement':
          expected.push(
            ...this.collectExpectedStatementConstructs(statement.body, `${constructId}/body`)
          );
          break;
        case 'ClassicForStatement':
          if (statement.init) {
            expected.push(
              ...this.collectExpectedStatementConstructs([statement.init], `${constructId}/init`)
            );
          }
          expected.push(
            ...this.collectExpectedStatementConstructs(statement.body, `${constructId}/body`)
          );
          if (statement.update) {
            expected.push(
              ...this.collectExpectedStatementConstructs(
                [statement.update],
                `${constructId}/update`
              )
            );
          }
          break;
        case 'OnErrorStatement':
          expected.push(
            ...this.collectExpectedStatementConstructs(statement.body, `${constructId}/body`)
          );
          break;
        case 'MethodCall':
        case 'EmitStatement':
        case 'Assignment':
        case 'VariableDeclaration':
        case 'AwaitStatement':
        case 'ExpressionStatement':
        case 'ReturnStatement':
        case 'AnimateStatement':
          break;
        default: {
          const _exhaustive: never = statement;
          void _exhaustive;
        }
      }
    });
    return expected;
  }

  private collectStatementClosureEntries(
    statements: HoloStatement[],
    path: string,
    surface: Extract<HoloScriptSurface, '.holo' | '.hsplus'>,
    typeEvidence: ReadonlyMap<string, SemanticClosureStageResult>,
    inheritedDeferral?: string
  ): SemanticClosureEntry[] {
    const entries: SemanticClosureEntry[] = [];

    statements.forEach((statement, index) => {
      const constructId = `${path}:${index}`;
      const ownDeferral =
        statement.type === 'AnimateStatement' || statement.type === 'OnErrorStatement'
          ? `${statement.type} has no UAAL lowering`
          : inheritedDeferral;
      entries.push(
        this.createClosureEntry(
          constructId,
          statement.type,
          surface,
          ownDeferral === undefined,
          typeEvidence.get(constructId),
          ownDeferral
        )
      );

      switch (statement.type) {
        case 'IfStatement':
          entries.push(
            ...this.collectStatementClosureEntries(
              statement.consequent,
              `${constructId}/consequent`,
              surface,
              typeEvidence,
              inheritedDeferral
            )
          );
          if (statement.alternate) {
            entries.push(
              ...this.collectStatementClosureEntries(
                statement.alternate,
                `${constructId}/alternate`,
                surface,
                typeEvidence,
                inheritedDeferral
              )
            );
          }
          break;
        case 'WhileStatement':
        case 'ForStatement':
          entries.push(
            ...this.collectStatementClosureEntries(
              statement.body,
              `${constructId}/body`,
              surface,
              typeEvidence,
              inheritedDeferral
            )
          );
          break;
        case 'ClassicForStatement':
          if (statement.init) {
            entries.push(
              ...this.collectStatementClosureEntries(
                [statement.init],
                `${constructId}/init`,
                surface,
                typeEvidence,
                inheritedDeferral
              )
            );
          }
          entries.push(
            ...this.collectStatementClosureEntries(
              statement.body,
              `${constructId}/body`,
              surface,
              typeEvidence,
              inheritedDeferral
            )
          );
          if (statement.update) {
            entries.push(
              ...this.collectStatementClosureEntries(
                [statement.update],
                `${constructId}/update`,
                surface,
                typeEvidence,
                inheritedDeferral
              )
            );
          }
          break;
        case 'OnErrorStatement':
          entries.push(
            ...this.collectStatementClosureEntries(
              statement.body,
              `${constructId}/body`,
              surface,
              typeEvidence,
              ownDeferral
            )
          );
          break;
        case 'MethodCall':
        case 'EmitStatement':
        case 'Assignment':
        case 'VariableDeclaration':
        case 'AwaitStatement':
        case 'ExpressionStatement':
        case 'ReturnStatement':
        case 'AnimateStatement':
          break;
        default: {
          const _exhaustive: never = statement;
          void _exhaustive;
        }
      }
    });

    return entries;
  }

  private createClosureEntry(
    constructId: string,
    kind: string,
    surface: Extract<HoloScriptSurface, '.holo' | '.hsplus'>,
    lowered: boolean,
    typeEvidence?: SemanticClosureStageResult,
    loweringReason?: string
  ): SemanticClosureEntry {
    const loweredStage: SemanticClosureStageResult = lowered
      ? { status: 'passed' }
      : {
          status: 'deferred',
          diagnosticCode: 'HS-CLOSURE-LOWER-001',
          reason: loweringReason ?? `${kind} contains semantics without UAAL lowering`,
        };

    return {
      constructId,
      surface,
      kind,
      target: 'cognitive-vm/uaal-bytecode',
      stages: {
        parsed: { status: 'passed' },
        typed:
          typeEvidence ??
          ({
            status: 'rejected',
            diagnosticCode: 'HS-HOLO-TYPE-EVIDENCE-001',
            reason: `type evidence is missing for ${constructId}`,
          } satisfies SemanticClosureStageResult),
        lowered: loweredStage,
        enforced: {
          status: 'not_applicable',
          reason: 'effect policy is enforced by the cognitive runtime, not bytecode lowering',
        },
        executed: {
          status: 'not_applicable',
          reason: 'this receipt covers compilation; the cognitive VM supplies execution evidence',
        },
        target_preserved: lowered
          ? { status: 'passed' }
          : { status: 'not_applicable', reason: 'target lowering was deferred' },
      },
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
      this.actionsByName.set(action.name, action);
    }
  }

  private parameterSlot(actionName: string, parameterName: string): string {
    return `__holo::${actionName}::${parameterName}`;
  }

  private emitActionArguments(
    targetName: string,
    arguments_: HoloExpression[],
    bootstrap = false
  ): void {
    const action = this.actionsByName.get(targetName);
    if (!action) throw new Error(`Unknown UAAL action signature: ${targetName}`);

    for (let index = 0; index < action.parameters.length; index++) {
      const argument = arguments_[index];
      if (argument) {
        this.emit(OP.PUSH, [this.lowerExpr(argument)]);
        continue;
      }
      const defaultValue = action.parameters[index].defaultValue;
      if (defaultValue !== undefined) {
        this.emit(OP.PUSH, [defaultValue as UaalOperand]);
        continue;
      }
      if (bootstrap) {
        throw new Error(
          `UAAL bootstrap entry point ${targetName} is missing required argument ${index + 1} (${action.parameters[index].name})`
        );
      }
      // The semantic-closure type stage rejects the bad call. Keep bytecode
      // emission backward compatible and stack-balanced so diagnostics remain
      // inspectable instead of converting a typed rejection into a throw.
      this.emit(OP.PUSH, [null]);
    }
  }

  private bootstrapTargets(
    actions: HoloAction[],
    handlers: HoloEventHandler[],
    requested?: string[]
  ): string[] {
    if (requested) {
      if (requested.length === 0) {
        throw new Error('UAAL entryPoints must contain at least one action or event entry point');
      }
      const available = new Set([
        ...actions.map((action) => action.name),
        ...handlers.map((handler) => this.handlerEntryName(handler)),
      ]);
      const selected = new Set<string>();
      for (const target of requested) {
        if (!available.has(target)) {
          throw new Error(`Unknown UAAL entry point: ${target}`);
        }
        if (selected.has(target)) {
          throw new Error(`Duplicate UAAL bootstrap entry point: ${target}`);
        }
        selected.add(target);
      }
      return [...selected];
    }

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
          this.emitActionArguments(stmt.method, stmt.arguments);
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
        this.emit(OP.EXECUTE, [
          `declare:${stmt.name}`,
          stmt.value ? this.lowerExpr(stmt.value) : null,
        ]);
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
      case 'Identifier': {
        const parameterSlot = this.currentParameterSlots.get(expr.name);
        return parameterSlot
          ? { abi: HOLO_STATE_REFERENCE_ABI, key: parameterSlot }
          : { ref: expr.name };
      }
      case 'BinaryExpression':
        return { op: expr.operator, l: this.lowerExpr(expr.left), r: this.lowerExpr(expr.right) };
      case 'UnaryExpression':
        return { op: expr.operator, arg: this.lowerExpr(expr.argument) };
      case 'MemberExpression':
        return {
          member: this.lowerExpr(expr.object),
          prop: expr.property,
          computed: expr.computed,
        };
      case 'CallExpression':
        return {
          call: this.lowerExpr(expr.callee),
          args: expr.arguments.map((a) => this.lowerExpr(a)),
        };
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
    this.emitActionArguments(targetName, expr.arguments);
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
