/**
 * TransformTrait — v5.1
 *
 * Map/filter/reduce event streams for HoloScript compositions.
 * Subscribes to source events, applies a chain of transformations,
 * and emits the result as a new event. Enables reactive data pipelines
 * without custom code.
 *
 * Events:
 *  transform:output         { transformId, sourceEvent, result }
 *  transform:filtered       { transformId, sourceEvent, reason }
 *  transform:error          { transformId, sourceEvent, error }
 *  transform:add_rule       (command) Add a transform rule
 *  transform:remove_rule    (command) Remove a transform rule
 *  transform:get_status     (command) Get transform status
 *  [source events]          (inbound) Subscribed source events trigger transforms
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type TransformOp =
  | { type: 'pick'; fields: string[] }
  | { type: 'omit'; fields: string[] }
  | { type: 'rename'; from: string; to: string }
  | { type: 'default'; field: string; value: unknown }
  | { type: 'compute'; field: string; expr: string }
  | {
      type: 'filter';
      field: string;
      op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists';
      value: unknown;
    }
  | { type: 'map_value'; field: string; mapping: Record<string, unknown> };

export interface TransformRule {
  /** Unique rule identifier */
  id: string;
  /** Source event to subscribe to */
  source_event: string;
  /** Output event to emit */
  output_event: string;
  /** Ordered list of transform operations */
  ops: TransformOp[];
  /** Whether this rule is active */
  enabled: boolean;
}

export interface TransformConfig {
  /** Pre-configured transform rules */
  rules: TransformRule[];
}

export interface TransformState {
  rules: Map<string, TransformRule>;
  totalProcessed: number;
  totalFiltered: number;
  totalErrors: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function applyOp(data: Record<string, unknown>, op: TransformOp): Record<string, unknown> | null {
  switch (op.type) {
    case 'pick': {
      const result: Record<string, unknown> = {};
      for (const field of op.fields) {
        if (field in data) result[field] = data[field];
      }
      return result;
    }

    case 'omit': {
      const result = { ...data };
      for (const field of op.fields) {
        delete result[field];
      }
      return result;
    }

    case 'rename': {
      const result = { ...data };
      if (op.from in result) {
        result[op.to] = result[op.from];
        delete result[op.from];
      }
      return result;
    }

    case 'default': {
      const result = { ...data };
      if (!(op.field in result) || result[op.field] === undefined || result[op.field] === null) {
        result[op.field] = op.value;
      }
      return result;
    }

    case 'compute': {
      const result = { ...data };
      // Simple expression evaluation for safe operations
      try {
        const val = evaluateExpr(op.expr, result);
        result[op.field] = val;
      } catch {
        // Skip computation on error
      }
      return result;
    }

    case 'filter': {
      const fieldVal = data[op.field];
      let pass = false;
      switch (op.op) {
        case 'eq':
          pass = fieldVal === op.value;
          break;
        case 'neq':
          pass = fieldVal !== op.value;
          break;
        case 'gt':
          pass = (fieldVal as number) > (op.value as number);
          break;
        case 'gte':
          pass = (fieldVal as number) >= (op.value as number);
          break;
        case 'lt':
          pass = (fieldVal as number) < (op.value as number);
          break;
        case 'lte':
          pass = (fieldVal as number) <= (op.value as number);
          break;
        case 'exists':
          pass = op.value ? op.field in data : !(op.field in data);
          break;
      }
      return pass ? data : null; // null = filtered out
    }

    case 'map_value': {
      const result = { ...data };
      const key = String(result[op.field]);
      if (key in op.mapping) {
        result[op.field] = op.mapping[key];
      }
      return result;
    }

    default:
      return data;
  }
}

function evaluateExpr(expr: string, data: Record<string, unknown>): unknown {
  // Safe expression evaluator — supports basic arithmetic with field references
  // Field references use $ prefix: $fieldName
  let resolved = expr;
  for (const [key, val] of Object.entries(data)) {
    if (typeof val === 'number') {
      resolved = resolved.replace(new RegExp(`\\$${key}`, 'g'), String(val));
    }
  }

  // Only allow numbers, operators, parens, and whitespace
  if (!/^[\d\s+\-*/().]+$/.test(resolved)) {
    throw new Error('Unsafe expression');
  }

  // eslint-disable-next-line no-new-func
  return new Function(`return (${resolved})`)();
}

// =============================================================================
// HANDLER
// =============================================================================

export const transformHandler: TraitHandler<TransformConfig> = {
  name: 'transform',

  defaultConfig: {
    rules: [],
  },

  onAttach(node: HSPlusNode, config: TransformConfig, _context: TraitContext): void {
    const state: TransformState = {
      rules: new Map(),
      totalProcessed: 0,
      totalFiltered: 0,
      totalErrors: 0,
    };

    for (const rule of config.rules) {
      state.rules.set(rule.id, rule);
    }

    node.__transformState = state;
  },

  onDetach(node: HSPlusNode, _config: TransformConfig, _context: TraitContext): void {
    delete node.__transformState;
  },

  onUpdate(_node: HSPlusNode, _config: TransformConfig, _context: TraitContext, _delta: number): void {
    // Event-driven
  },

  onEvent(node: HSPlusNode, _config: TransformConfig, context: TraitContext, event: TraitEvent): void {
    const state: TransformState | undefined = node.__transformState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = (event as any)?.payload ?? event;

    // Check for management commands
    switch (eventType) {
      case 'transform:add_rule': {
        const rule = payload as TransformRule;
        if (rule.id && rule.source_event && rule.output_event) {
          state.rules.set(rule.id, rule);
        }
        return;
      }

      case 'transform:remove_rule': {
        state.rules.delete(payload.id as string);
        return;
      }

      case 'transform:get_status': {
        context.emit?.('transform:status', {
          ruleCount: state.rules.size,
          totalProcessed: state.totalProcessed,
          totalFiltered: state.totalFiltered,
          totalErrors: state.totalErrors,
          rules: Array.from(state.rules.values()).map((r) => ({
            id: r.id,
            source: r.source_event,
            output: r.output_event,
            enabled: r.enabled,
            opCount: r.ops.length,
          })),
        });
        return;
      }
    }

    // Check if this event matches any transform rule
    for (const [, rule] of state.rules) {
      if (!rule.enabled || rule.source_event !== eventType) continue;

      state.totalProcessed++;

      try {
        let data: Record<string, unknown> | null =
          typeof payload === 'object' && payload !== null ? { ...payload } : { value: payload };

        for (const op of rule.ops) {
          if (data === null) break;
          data = applyOp(data, op);
        }

        if (data === null) {
          state.totalFiltered++;
          context.emit?.('transform:filtered', {
            transformId: rule.id,
            sourceEvent: eventType,
            reason: 'filter_rejected',
          });
        } else {
          context.emit?.(rule.output_event, data);
          context.emit?.('transform:output', {
            transformId: rule.id,
            sourceEvent: eventType,
            result: data,
          });
        }
      } catch (err: unknown) {
        state.totalErrors++;
        context.emit?.('transform:error', {
          transformId: rule.id,
          sourceEvent: eventType,
          // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
          error: err.message,
        });
      }
    }
  },
};

export default transformHandler;
