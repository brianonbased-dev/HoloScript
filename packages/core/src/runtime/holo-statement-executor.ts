/**
 * HoloStatement executor — extracted from HoloScriptRuntime (W1-T4 slice 30).
 *
 * Pure executors for HoloStatement AST nodes + the iterative driver.
 * Covers: Assignment (with += -= *= /= operators), IfStatement,
 * WhileStatement, ClassicForStatement, VariableDeclaration, EmitStatement,
 * AwaitStatement, ReturnStatement, ExpressionStatement.
 *
 * **Pattern**: multi-callback context (pattern 5 variant — same shape
 * peer used for holo-expression.ts). The runtime threads in callbacks
 * for getVariable / setVariable / emit / evaluateHoloExpression, plus
 * a currentScope reference for the default-scope case. The pure module
 * has no `this` binding and no hidden runtime dependencies.
 *
 * **Recursion**: executeHoloStatement can invoke executeHoloProgram
 * (for IfStatement bodies, loops) which in turn iterates back. Both
 * live in this module so the mutual recursion is module-local; the
 * runtime wrapper supplies the context once per top-level call.
 *
 * **ClassicForStatement init-note**: the original HSR code called
 * `this.executeHoloStatement(stmt.init, scopeOverride)` for the init
 * expression, which is a statement context, not an expression. We
 * preserve that exact dispatch so `for (x = 0; ...)` with Assignment
 * init keeps working.
 *
 * Behavior LOCKED by HoloScriptRuntime.characterization.test.ts +
 * the `holo-statement-executor.test.ts` unit suite co-landed with this
 * slice (covers all 9 statement kinds + MAX_ITERATIONS infinite-loop
 * guard + ReturnStatement short-circuit in program).
 *
 * **See**: W1-T4 slice 30 — extraction of executeHoloProgram + executeHoloStatement
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 1541-1659, ~119 LOC total)
 */

import type { HoloStatement } from '../parser/HoloCompositionTypes';
import type { HoloScriptValue, ExecutionResult } from '../types';

/**
 * Structural mirror of HoloScriptRuntime's `Scope`; see holo-expression.ts.
 *
 * Note: `parent` is `Scope | undefined` (via the optional `?`), NOT
 * `Scope | null | undefined`. HSR's `Scope` interface narrows to
 * `parent?: Scope` (no `null`), and the executors here never construct a
 * `null` parent — they only ever read it. Keeping `| null` here previously
 * caused TS2345 at HoloScriptRuntime.ts:1385/1387/1393 because the runtime's
 * `Scope | undefined` was not assignable to the executor's `Scope | undefined`
 * (the inner `parent` field was incompatible).
 */
export interface Scope {
  variables: Map<string, HoloScriptValue>;
  parent?: Scope;
}

/** Telemetry seam — pure module delegates timing to the runtime's harness. */
export interface StatementTelemetry {
  setGauge(name: string, value: number): void;
  incrementCounter(name: string, value: number, labels?: Record<string, string>): void;
  measureLatency<T>(name: string, fn: () => Promise<T>): Promise<T>;
  executionDepth(): number;
}

/**
 * Context for the statement executor. Supplied by the runtime each call;
 * the module itself holds no state.
 */
export interface HoloStatementContext {
  /** Resolve a variable name to its value, honouring scope chain. */
  getVariable(name: string, scope?: Scope): HoloScriptValue;
  /** Assign a variable; operators +=, -=, *=, /= resolve to the `=` path after arithmetic. */
  setVariable(name: string, value: HoloScriptValue, scope?: Scope): void;
  /** Fallback scope when caller doesn't pass a scopeOverride. */
  readonly currentScope: Scope;
  /** Emit a named event with an optional payload. */
  emit(event: string, data?: HoloScriptValue): void | Promise<void>;
  /** Evaluate an expression-typed AST node, using scopeOverride if given. */
  evaluateHoloExpression(
    expr: unknown,
    scopeOverride?: Scope,
  ): Promise<HoloScriptValue>;
  /** Telemetry seam — module delegates timing to the runtime's harness. */
  readonly telemetry: StatementTelemetry;
}

/** Bound after which While / ClassicFor loops self-abort. Mirrors HSR original. */
export const MAX_ITERATIONS = 1000;

/**
 * Execute a sequence of HoloStatements in order. Short-circuits on the
 * first ReturnStatement with a defined output — mirrors HSR behavior.
 */
export async function executeHoloProgram(
  statements: HoloStatement[],
  scopeOverride: Scope | undefined,
  ctx: HoloStatementContext,
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  ctx.telemetry.setGauge('execution_depth', ctx.telemetry.executionDepth());
  for (const stmt of statements) {
    ctx.telemetry.incrementCounter('statements_executed', 1, { type: stmt.type });
    const res = await ctx.telemetry.measureLatency(`execute_stmt_${stmt.type}`, () =>
      executeHoloStatement(stmt, scopeOverride, ctx),
    );
    results.push(res);
    const last = results[results.length - 1];
    if (last.success && last.output !== undefined && stmt.type === 'ReturnStatement') {
      break;
    }
  }
  return results;
}

/**
 * Execute a single HoloStatement node. Returns `{ success: true }` on
 * the happy path, `{ success: false, error }` on thrown errors or
 * detected infinite loops, `{ success: true, output }` for returns /
 * expression statements.
 */
export async function executeHoloStatement(
  stmt: HoloStatement,
  scopeOverride: Scope | undefined,
  ctx: HoloStatementContext,
): Promise<ExecutionResult> {
  try {
    switch (stmt.type) {
      case 'Assignment': {
        const value = await ctx.evaluateHoloExpression(stmt.value, scopeOverride);
        let finalValue = value;
        if (stmt.operator !== '=') {
          const current = ctx.getVariable(stmt.target, scopeOverride);
          if (stmt.operator === '+=')
            finalValue = (Number(current) + Number(value)) as HoloScriptValue;
          else if (stmt.operator === '-=')
            finalValue = (Number(current) - Number(value)) as HoloScriptValue;
          else if (stmt.operator === '*=')
            finalValue = (Number(current) * Number(value)) as HoloScriptValue;
          else if (stmt.operator === '/=')
            finalValue = (Number(current) / Number(value)) as HoloScriptValue;
        }
        ctx.setVariable(stmt.target, finalValue, scopeOverride);
        return { success: true };
      }
      case 'IfStatement': {
        const condition = await ctx.evaluateHoloExpression(stmt.condition, scopeOverride);
        if (condition) {
          await executeHoloProgram(stmt.consequent, scopeOverride, ctx);
        } else if (stmt.alternate) {
          await executeHoloProgram(stmt.alternate, scopeOverride, ctx);
        }
        return { success: true };
      }
      case 'WhileStatement': {
        let iter = 0;
        while (await ctx.evaluateHoloExpression(stmt.condition, scopeOverride)) {
          if (iter++ > MAX_ITERATIONS) return { success: false, error: 'Infinite loop' };
          await executeHoloProgram(stmt.body, scopeOverride, ctx);
        }
        return { success: true };
      }
      case 'ClassicForStatement': {
        if (stmt.init) await executeHoloStatement(stmt.init, scopeOverride, ctx);
        let iter = 0;
        while (!stmt.test || (await ctx.evaluateHoloExpression(stmt.test, scopeOverride))) {
          if (iter++ > MAX_ITERATIONS) return { success: false, error: 'Infinite loop' };
          await executeHoloProgram(stmt.body, scopeOverride, ctx);
          if (stmt.update) await executeHoloStatement(stmt.update, scopeOverride, ctx);
        }
        return { success: true };
      }
      case 'VariableDeclaration': {
        const value = stmt.value
          ? await ctx.evaluateHoloExpression(stmt.value, scopeOverride)
          : undefined;
        const scope = scopeOverride || ctx.currentScope;
        scope.variables.set(stmt.name, value as HoloScriptValue);
        return { success: true };
      }
      case 'EmitStatement': {
        const data = stmt.data
          ? await ctx.evaluateHoloExpression(stmt.data, scopeOverride)
          : undefined;
        ctx.emit(stmt.event, data);
        return { success: true };
      }
      case 'AwaitStatement': {
        const value = await ctx.evaluateHoloExpression(stmt.expression, scopeOverride);
        if (value instanceof Promise) await value;
        return { success: true };
      }
      case 'ReturnStatement': {
        const value = stmt.value
          ? await ctx.evaluateHoloExpression(stmt.value, scopeOverride)
          : null;
        return { success: true, output: value };
      }
      case 'ExpressionStatement': {
        const val = await ctx.evaluateHoloExpression(stmt.expression, scopeOverride);
        return { success: true, output: val };
      }
      default:
        return {
          success: false,
          error: `Unknown stmt type: ${(stmt as { type?: string }).type}`,
        };
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`[EXEC_ERROR] Statement ${stmt.type} failed:`, errMsg);
    return { success: false, error: errMsg };
  }
}
