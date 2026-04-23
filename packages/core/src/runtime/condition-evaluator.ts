/**
 * Condition evaluator — extracted from HoloScriptRuntime (W1-T4 slice 3)
 *
 * Near-pure helper: takes a condition string + an expression-evaluator
 * callback, returns boolean. No `this` binding; the caller threads
 * expression evaluation via the `evaluate` parameter. This is the
 * **callback-injection pattern** for future stateful-subsystem slices —
 * subsystem code moves to a module, runtime state stays in HSR and is
 * passed in through a narrow function boundary.
 *
 * **Security**: the suspicious-keyword guard lives here now and is
 * testable in isolation. Any change to the blocklist must come with
 * a unit test in a sibling `condition-evaluator.test.ts`.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts —
 * any edit here must re-pass the characterization harness without
 * re-locking snapshots.
 *
 * **See**: W1-T4 slice 3 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (historical home,
 *         pre-extraction LOC marker: 1927-1993)
 *         packages/core/src/HoloScriptRuntime.characterization.test.ts
 *         packages/core/src/runtime/easing.ts (slice 1 sibling)
 *         packages/core/src/runtime/physics-math.ts (slice 2 sibling)
 */

import { logger } from '../logger';

/** Expression-evaluation callback threaded in by the caller. */
export type ExpressionEvaluator = (expr: string) => unknown;

/**
 * Keywords that, if present in a condition string, cause the
 * evaluator to reject it and return false. Defends against
 * code-execution attempts (`eval`, `Function`, `require`) and
 * prototype-pollution attempts (`__proto__`, `constructor`).
 *
 * Matched case-insensitive against the full condition string.
 */
const SUSPICIOUS_KEYWORDS = [
  'eval',
  'process',
  'require',
  '__proto__',
  'constructor',
] as const;

/**
 * Evaluate a HoloScript condition expression.
 *
 * Supports boolean literals, comparison operators (`===`, `!==`,
 * `==`, `!=`, `>=`, `<=`, `>`, `<`), short-circuit logical operators
 * (`&&`, `||`), unary negation (`!expr`), and variable-truthiness
 * (bare identifier resolved through `evaluate`).
 *
 * @param condition Condition to evaluate (string, boolean, or any
 *                  truthy/falsy value — non-strings fall through to
 *                  the variable-truthiness path after `String(...)`).
 * @param evaluate  Expression-evaluation callback. Called with
 *                  trimmed sub-expressions (never raw condition).
 * @returns         Boolean result. Returns false on any parse or
 *                  evaluation error (logged at error level) and on
 *                  suspicious-keyword detection (logged at warn).
 */
export function evaluateCondition(
  condition: string | unknown,
  evaluate: ExpressionEvaluator,
): boolean {
  if (!condition) return false;
  const condStr = String(condition);

  if (SUSPICIOUS_KEYWORDS.some((kw) => condStr.toLowerCase().includes(kw))) {
    logger.warn('Suspicious condition blocked', { condition });
    return false;
  }

  try {
    // Boolean literals
    if (condStr.trim().toLowerCase() === 'true') return true;
    if (condStr.trim().toLowerCase() === 'false') return false;

    // Comparison + logical operators
    const comparisonPatterns: Array<{ regex: RegExp; logical?: string }> = [
      { regex: /^(.+?)\s*(===|!==)\s*(.+)$/ },
      { regex: /^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/ },
      { regex: /^(.+?)\s*(&&)\s*(.+)$/, logical: 'and' },
      { regex: /^(.+?)\s*(\|\|)\s*(.+)$/, logical: 'or' },
    ];

    for (const { regex, logical } of comparisonPatterns) {
      const match = condStr.match(regex);
      if (match) {
        const [, leftExpr, operator, rightExpr] = match;
        const left = evaluate(leftExpr.trim());
        const right = evaluate(rightExpr.trim());

        if (logical === 'and') return Boolean(left) && Boolean(right);
        if (logical === 'or') return Boolean(left) || Boolean(right);

        switch (operator) {
          case '===':
            return left === right;
          case '!==':
            return left !== right;
          case '==':
            return left == right;
          case '!=':
            return left != right;
          case '>=':
            return Number(left) >= Number(right);
          case '<=':
            return Number(left) <= Number(right);
          case '>':
            return Number(left) > Number(right);
          case '<':
            return Number(left) < Number(right);
        }
      }
    }

    // Negation
    if (condStr.startsWith('!')) {
      return !evaluateCondition(condStr.slice(1).trim(), evaluate);
    }

    // Variable truthiness
    const value = evaluate(condStr.trim());
    return Boolean(value);
  } catch (error) {
    logger.error('Condition evaluation error', { condition, error });
    return false;
  }
}
