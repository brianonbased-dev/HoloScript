/**
 * Transformation operations — extracted from HoloScriptRuntime (W1-T4 slice 5)
 *
 * Applies declarative data transforms (filter / map / reduce / sort /
 * sum / count / unique / flatten / reverse / take / skip) to array
 * inputs. Predicate / mapper / reducer bodies are expression strings
 * evaluated through caller-supplied callbacks.
 *
 * **Pattern evolution**: this slice demonstrates **multi-callback
 * injection** — the pure module takes a small context object with
 * three callbacks (`setVariable`, `evaluateCondition`,
 * `evaluateExpression`) rather than one. This is the model for
 * subsystems that need to read AND write runtime state.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 * Any edit here must re-pass the characterization harness without
 * re-locking snapshots.
 *
 * **See**: W1-T4 slice 5 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (historical home,
 *         pre-extraction LOC marker: 1951-2045)
 *         packages/core/src/runtime/condition-evaluator.ts (slice 3)
 *         packages/core/src/runtime/particle-effects.ts (slice 4)
 */

import { logger } from '../logger';
import type { HoloScriptValue, TransformationNode } from '../types';

/** Default particle count when `take` operation has no count parameter. */
const TAKE_DEFAULT_COUNT = 10;

/**
 * Context passed by the runtime — lets the pure transformation code
 * read and write runtime state (for the iterator variables `_item`,
 * `_acc`) and resolve expression strings (for predicate / mapper /
 * reducer bodies).
 */
export interface TransformationContext {
  /** Write a variable into the runtime's current scope. */
  setVariable: (name: string, value: unknown) => void;
  /** Evaluate a boolean condition expression (used by `filter`). */
  evaluateCondition: (expr: string) => boolean;
  /** Evaluate a value-producing expression (used by `map`, `reduce`). */
  evaluateExpression: (expr: string) => unknown;
}

/**
 * Apply a declarative transformation to `data`. Non-array inputs
 * are returned unchanged for array-only operations (filter, map,
 * reduce, sort, take, skip, unique, flatten, reverse). Unknown
 * operations are logged at warn and return `data` unchanged.
 *
 * `async` return is preserved for API compatibility — every branch
 * is synchronous today, but the signature reserves headroom for
 * future async ops (e.g. remote aggregation).
 */
export async function applyTransformation(
  data: unknown,
  transform: TransformationNode,
  ctx: TransformationContext,
): Promise<HoloScriptValue> {
  const params = transform.parameters || {};

  switch (transform.operation) {
    case 'filter': {
      if (!Array.isArray(data)) return data as HoloScriptValue;
      const predicate = params.predicate as string;
      if (predicate) {
        return data.filter((item) => {
          ctx.setVariable('_item', item);
          return ctx.evaluateCondition(predicate);
        });
      }
      return data.filter((item) => item !== null && item !== undefined);
    }

    case 'map': {
      if (!Array.isArray(data)) return data as HoloScriptValue;
      const mapper = params.mapper as string;
      if (mapper) {
        return data.map((item) => {
          ctx.setVariable('_item', item);
          return ctx.evaluateExpression(mapper);
        });
      }
      return data.map((item) => ({ value: item, processed: true }));
    }

    case 'reduce': {
      if (!Array.isArray(data)) return data as HoloScriptValue;
      const initial = params.initial ?? 0;
      const reducer = params.reducer as string;
      if (reducer) {
        return data.reduce((acc, item) => {
          ctx.setVariable('_acc', acc);
          ctx.setVariable('_item', item);
          return ctx.evaluateExpression(reducer);
        }, initial);
      }
      return data.reduce((acc, item) => acc + (typeof item === 'number' ? item : 0), 0);
    }

    case 'sort': {
      if (!Array.isArray(data)) return data as HoloScriptValue;
      const key = params.key as string;
      const desc = params.descending as boolean;
      const sorted = [...data].sort((a, b) => {
        const aVal = key ? (a as Record<string, unknown>)[key] : a;
        const bVal = key ? (b as Record<string, unknown>)[key] : b;
        if (aVal < bVal) return desc ? 1 : -1;
        if (aVal > bVal) return desc ? -1 : 1;
        return 0;
      });
      return sorted;
    }

    case 'sum':
      return (
        Array.isArray(data)
          ? data.reduce((sum, item) => sum + (typeof item === 'number' ? item : 0), 0)
          : data
      ) as HoloScriptValue;

    case 'count':
      return (Array.isArray(data) ? data.length : 1) as HoloScriptValue;

    case 'unique':
      return (Array.isArray(data) ? Array.from(new Set(data)) : data) as HoloScriptValue;

    case 'flatten':
      return (Array.isArray(data) ? data.flat() : data) as HoloScriptValue;

    case 'reverse':
      return (Array.isArray(data) ? [...data].reverse() : data) as HoloScriptValue;

    case 'take': {
      if (!Array.isArray(data)) return data as HoloScriptValue;
      const count = Number(params.count) || TAKE_DEFAULT_COUNT;
      return data.slice(0, count);
    }

    case 'skip': {
      if (!Array.isArray(data)) return data as HoloScriptValue;
      const count = Number(params.count) || 0;
      return data.slice(count);
    }

    default:
      logger.warn('Unknown transformation', { operation: transform.operation });
      return data as HoloScriptValue;
  }
}
