/**
 * Control-flow execution — extracted from HoloScriptRuntime (W1-T4 slice 12)
 *
 * Implements the five `@` control-flow constructs:
 *   - `@for item in iterable { body }`
 *   - `@forEach item in collection { body }` (delegates to @for)
 *   - `@while condition { body }`
 *   - `@if condition { body } @else { elseBody }`
 *   - `@match subject { pattern => result, ... }`
 *
 * All five take a `ControlFlowContext` with four callbacks + one
 * state container. The pure module has no `this` binding and no
 * hidden dependencies on HSR.
 *
 * **Pattern**: multi-callback + state container (pattern 5 evolved).
 * The `variables` Map is exposed so @for can bind/unbind its loop
 * variable in HSR's execution scope.
 *
 * **Safety**: @while loop enforces a 10,000-iteration ceiling to
 * prevent runaway scripts from locking the host.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 12 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 2903-3112)
 *         packages/core/src/runtime/condition-evaluator.ts (slice 3)
 *         packages/core/src/runtime/pattern-match.ts (slice 11)
 */

import type { ASTNode, ExecutionResult, HoloScriptValue } from '../types';
import { patternMatches } from './pattern-match';

/** Hard cap on @while iterations — prevents runaway scripts. */
const WHILE_MAX_ITERATIONS = 10_000;

/**
 * Context threaded in by the runtime — four callbacks + one state
 * container. Callbacks are captured at construction of each wrapper
 * method so pure module never binds `this`.
 */
export interface ControlFlowContext {
  /** Evaluate a value-producing expression (collections, match subjects). */
  evaluateExpression: (expr: string) => unknown;
  /** Evaluate a boolean condition (if-conditions, while-conditions, match guards). */
  evaluateCondition: (expr: string) => boolean;
  /** Execute a single AST node (recursive into @for / @while / @if bodies). */
  executeNode: (node: ASTNode) => Promise<ExecutionResult>;
  /** Runtime variable scope — @for writes loop variable here. */
  variables: Map<string, unknown>;
}

/**
 * Execute `@for item in iterable { body }`.
 *
 * Accepts both arrays and plain objects (entries) as iterables.
 * Binds `variable` in `ctx.variables` before each body iteration
 * and deletes it after the loop completes.
 */
export async function executeForLoop(
  node: { variable: string; iterable: string | unknown; body: ASTNode[] },
  ctx: ControlFlowContext,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const { variable, iterable, body } = node;

  try {
    const collection = ctx.evaluateExpression(String(iterable));

    if (!Array.isArray(collection) && typeof collection !== 'object') {
      return {
        success: false,
        error: `Cannot iterate over non-iterable: ${typeof collection}`,
        executionTime: Date.now() - startTime,
      };
    }

    const items = Array.isArray(collection)
      ? collection
      : collection && typeof collection === 'object'
        ? Object.entries(collection)
        : [];
    let lastResult: ExecutionResult = { success: true, output: null };

    for (const item of items) {
      ctx.variables.set(variable, item);

      for (const bodyNode of body) {
        lastResult = await ctx.executeNode(bodyNode);
        if (!lastResult.success) break;
      }

      if (!lastResult.success) break;
    }

    ctx.variables.delete(variable);

    return {
      success: true,
      output: lastResult.output,
      executionTime: Date.now() - startTime,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: `For loop error: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Execute `@forEach item in collection { body }`. Semantically
 * identical to @for; kept as a distinct entry point for grammar
 * symmetry with external HoloScript sources.
 */
export async function executeForEachLoop(
  node: { variable: string; collection: string | unknown; body: ASTNode[] },
  ctx: ControlFlowContext,
): Promise<ExecutionResult> {
  return executeForLoop(
    { variable: node.variable, iterable: node.collection, body: node.body },
    ctx,
  );
}

/**
 * Execute `@while condition { body }`.
 * Enforces a hard 10k-iteration ceiling (WHILE_MAX_ITERATIONS).
 */
export async function executeWhileLoop(
  node: { condition: string | unknown; body: ASTNode[] },
  ctx: ControlFlowContext,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const { condition, body } = node;

  try {
    let iterations = 0;
    let lastResult: ExecutionResult = { success: true, output: null };

    while (ctx.evaluateCondition(String(condition))) {
      iterations++;
      if (iterations > WHILE_MAX_ITERATIONS) {
        return {
          success: false,
          error: `While loop exceeded maximum iterations (${WHILE_MAX_ITERATIONS})`,
          executionTime: Date.now() - startTime,
        };
      }

      for (const bodyNode of body) {
        lastResult = await ctx.executeNode(bodyNode);
        if (!lastResult.success) break;
      }

      if (!lastResult.success) break;
    }

    return {
      success: true,
      output: lastResult.output,
      executionTime: Date.now() - startTime,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: `While loop error: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Execute `@if condition { body } @else { elseBody }`.
 * `elseBody` is optional; falls through to empty body if absent.
 */
export async function executeIfStatement(
  node: { condition: string | unknown; body: ASTNode[]; elseBody?: ASTNode[] },
  ctx: ControlFlowContext,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const { condition, body, elseBody } = node;

  try {
    const conditionResult = ctx.evaluateCondition(String(condition));
    const branchToExecute = conditionResult ? body : elseBody || [];

    let lastResult: ExecutionResult = { success: true, output: null };

    for (const bodyNode of branchToExecute) {
      lastResult = await ctx.executeNode(bodyNode);
      if (!lastResult.success) break;
    }

    return {
      success: true,
      output: lastResult.output,
      executionTime: Date.now() - startTime,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: `If statement error: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Execute `@match subject { pattern => result, ... }`.
 *
 * For each case in order:
 *   1. Evaluate the case's pattern expression.
 *   2. Test the pattern against the subject via `patternMatches`.
 *   3. If a guard is present, evaluate it; on false, continue.
 *   4. Execute the body — array of ASTNodes sequentially, or
 *      a single expression string evaluated for its value.
 */
export async function executeMatch(
  node: {
    subject: string | unknown;
    cases: Array<{ pattern: string | unknown; guard?: string | unknown; body: ASTNode[] | unknown }>;
  },
  ctx: ControlFlowContext,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const { subject, cases } = node;

  try {
    const subjectValue = ctx.evaluateExpression(String(subject));

    for (const matchCase of cases || []) {
      const patternValue = ctx.evaluateExpression(String(matchCase.pattern));

      if (patternMatches(patternValue as HoloScriptValue, subjectValue as HoloScriptValue)) {
        if (matchCase.guard && !ctx.evaluateCondition(String(matchCase.guard))) {
          continue;
        }

        if (Array.isArray(matchCase.body)) {
          let lastResult: ExecutionResult = { success: true, output: null };
          for (const bodyNode of matchCase.body) {
            lastResult = await ctx.executeNode(bodyNode);
            if (!lastResult.success) break;
          }
          return lastResult;
        } else {
          const result = ctx.evaluateExpression(String(matchCase.body));
          return { success: true, output: result as HoloScriptValue, executionTime: Date.now() - startTime };
        }
      }
    }

    return {
      success: false,
      error: 'No pattern matched',
      executionTime: Date.now() - startTime,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Match expression error: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}
