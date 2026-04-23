/**
 * HoloExpression evaluator — extracted from HoloScriptRuntime (W1-T4 slice).
 *
 * Pure recursive evaluator for HoloExpression AST nodes. Covers:
 *   - Literal / Identifier / MemberExpression
 *   - CallExpression (direct function-value spread + named callFunction dispatch)
 *   - BinaryExpression (+ - * / == === != !== < > <= >= && ||)
 *   - ConditionalExpression (ternary)
 *   - UpdateExpression (++/--) with getMemberPath-resolved writeback
 *   - ArrayExpression / ObjectExpression
 *
 * **Pattern**: multi-callback context (pattern 5 variant). The runtime
 * threads in four callbacks (getVariable, setVariable, callFunction,
 * scope) plus nothing else; the pure module has no `this` binding and
 * no hidden runtime dependencies.
 *
 * **Memoization preservation**: the original `getMemberPath` was
 * decorated with `@engineRuntime.MethodMemoize(500)`. Decorators bind
 * to class methods, so we reproduce the same semantics with a
 * standalone module-level FIFO cache (max 500, JSON-stringified key,
 * first-inserted eviction). Identical eviction order to the original.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts
 * (L12-L14 cover the string `evaluateExpression` surface; this module
 * covers the AST `evaluateHoloExpression` surface that the parser
 * emits for `.hs`/`.hsplus` statements).
 *
 * **See**: W1-T4 slice — extraction of evaluateHoloExpression + getMemberPath
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 2303-2417, ~115 LOC counting doc + dispatch)
 */

import type { HoloExpression } from '../parser/HoloCompositionTypes';
import type { HoloScriptValue, ExecutionResult } from '../types';

/**
 * Structural mirror of HoloScriptRuntime's `Scope`. Duplicated (not
 * imported) to keep this pure module free of back-references into
 * HoloScriptRuntime.ts — the same convention used by the other W1-T4
 * slices. Runtime passes its `Scope` through; structural typing makes
 * them assignable.
 */
export interface HoloExpressionScope {
  variables: Map<string, HoloScriptValue>;
  parent?: HoloExpressionScope;
}

/**
 * Context threaded in by the runtime — three callbacks (getVariable,
 * setVariable, callFunction). `scopeOverride` is forwarded through
 * every recursive call so lexical scope in for-loops / match arms
 * resolves correctly.
 */
export interface HoloExpressionContext {
  /** Read a variable from the runtime scope chain. */
  getVariable: (name: string, scopeOverride?: HoloExpressionScope) => HoloScriptValue;
  /** Write a variable into the runtime scope chain. UpdateExpression target. */
  setVariable: (name: string, value: HoloScriptValue, scopeOverride?: HoloExpressionScope) => void;
  /** Invoke a named function on the runtime (CallExpression w/ Identifier callee). */
  callFunction: (name: string, args: HoloScriptValue[]) => Promise<ExecutionResult>;
}

/** Standalone memo cache — preserves MethodMemoize(500) semantics. */
const GET_MEMBER_PATH_CACHE = new Map<string, string | null>();
const GET_MEMBER_PATH_MAX = 500;

/**
 * Resolve a MemberExpression/Identifier chain to a dotted path string,
 * or `null` for anything else (Call, Binary, Literal, …).
 *
 * Used by UpdateExpression (`++x`, `obj.prop--`) to know which
 * variable to write the new value back into.
 *
 * Preserves the memoization of the original `@MethodMemoize(500)`:
 * - max 500 entries
 * - JSON-stringify the single arg as cache key
 * - FIFO eviction (delete first-inserted when full)
 */
export function getMemberPath(expr: HoloExpression): string | null {
  const key = JSON.stringify(expr);
  const cached = GET_MEMBER_PATH_CACHE.get(key);
  if (cached !== undefined || GET_MEMBER_PATH_CACHE.has(key)) {
    return cached ?? null;
  }

  let result: string | null = null;
  if (expr.type === 'Identifier') {
    result = expr.name;
  } else if (expr.type === 'MemberExpression') {
    const parentPath = getMemberPath(expr.object);
    if (parentPath) result = `${parentPath}.${expr.property}`;
  }

  if (GET_MEMBER_PATH_CACHE.size >= GET_MEMBER_PATH_MAX) {
    const firstKey = GET_MEMBER_PATH_CACHE.keys().next().value;
    if (firstKey !== undefined) GET_MEMBER_PATH_CACHE.delete(firstKey);
  }
  GET_MEMBER_PATH_CACHE.set(key, result);
  return result;
}

/** Test-only: clear the getMemberPath memo cache. */
export function __clearGetMemberPathCache(): void {
  GET_MEMBER_PATH_CACHE.clear();
}

/**
 * Evaluate a HoloExpression AST node to a HoloScriptValue.
 *
 * Fully async + fully recursive. Array/Object literals evaluate
 * children in parallel via Promise.all (matches original behavior —
 * element evaluation order is not guaranteed across async boundaries
 * in either the old or new code).
 */
export async function evaluateHoloExpression(
  expr: HoloExpression,
  scopeOverride: HoloExpressionScope | undefined,
  ctx: HoloExpressionContext,
): Promise<HoloScriptValue> {
  switch (expr.type) {
    case 'Literal':
      return expr.value;
    case 'Identifier':
      return ctx.getVariable(expr.name, scopeOverride);
    case 'MemberExpression': {
      const obj = await evaluateHoloExpression(expr.object, scopeOverride, ctx);
      if (obj && typeof obj === 'object') {
        return (obj as Record<string, unknown>)[expr.property] as HoloScriptValue;
      }
      return undefined;
    }
    case 'CallExpression': {
      if (!Array.isArray(expr.arguments)) {
        console.error('[CRITICAL] arguments is not an array for', JSON.stringify(expr));
        return undefined;
      }
      const callee = await evaluateHoloExpression(expr.callee, scopeOverride, ctx);
      const args = await Promise.all(
        expr.arguments.map((a: HoloExpression) =>
          evaluateHoloExpression(a, scopeOverride, ctx),
        ),
      );

      if (typeof callee === 'function') {
        return (callee as (...a: HoloScriptValue[]) => HoloScriptValue)(...args);
      }
      if (expr.callee.type === 'Identifier') {
        const result = await ctx.callFunction(expr.callee.name, args);
        return result.output;
      }
      return undefined;
    }
    case 'BinaryExpression': {
      const left = await evaluateHoloExpression(expr.left, scopeOverride, ctx);
      const right = await evaluateHoloExpression(expr.right, scopeOverride, ctx);
      switch (expr.operator) {
        case '+':
          return (Number(left) + Number(right)) as HoloScriptValue;
        case '-':
          return (Number(left) - Number(right)) as HoloScriptValue;
        case '*':
          return (Number(left) * Number(right)) as HoloScriptValue;
        case '/':
          return (Number(left) / Number(right)) as HoloScriptValue;
        case '==':
          return left == right;
        case '===':
          return left === right;
        case '!=':
          return left != right;
        case '!==':
          return left !== right;
        case '<':
          return Number(left) < Number(right);
        case '>':
          return Number(left) > Number(right);
        case '<=':
          return Number(left) <= Number(right);
        case '>=':
          return Number(left) >= Number(right);
        case '&&':
          return left && right;
        case '||':
          return left || right;
        default:
          return undefined;
      }
    }
    case 'ConditionalExpression': {
      const test = await evaluateHoloExpression(expr.test, scopeOverride, ctx);
      return test
        ? await evaluateHoloExpression(expr.consequent, scopeOverride, ctx)
        : await evaluateHoloExpression(expr.alternate, scopeOverride, ctx);
    }
    case 'UpdateExpression': {
      const val = await evaluateHoloExpression(expr.argument, scopeOverride, ctx);
      const newVal = expr.operator === '++' ? (val as number) + 1 : (val as number) - 1;
      const path = getMemberPath(expr.argument);
      if (path) {
        ctx.setVariable(path, newVal as HoloScriptValue, scopeOverride);
      }
      return expr.prefix ? newVal : val;
    }
    case 'ArrayExpression': {
      return await Promise.all(
        expr.elements.map((e) => evaluateHoloExpression(e, scopeOverride, ctx)),
      );
    }
    case 'ObjectExpression': {
      const obj: Record<string, HoloScriptValue> = {};
      for (const prop of expr.properties) {
        obj[prop.key] = await evaluateHoloExpression(prop.value, scopeOverride, ctx);
      }
      return obj;
    }
    default:
      return undefined;
  }
}
