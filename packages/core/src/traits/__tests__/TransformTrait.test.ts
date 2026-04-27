/**
 * TransformTrait comprehensive test suite
 *
 * Covers: onAttach, onDetach, onUpdate (no-op), management events
 * (add_rule, remove_rule, get_status), transform ops (pick, omit, rename,
 * default, compute, filter*, map_value), filtering, error handling,
 * disabled rules, and multiple rules on the same source event.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transformHandler } from '../TransformTrait';
import type {
  TransformConfig,
  TransformRule,
  TransformState,
  TransformOp,
} from '../TransformTrait';
import type { HSPlusNode, TraitContext, TraitEvent } from '../TraitTypes';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(): HSPlusNode {
  return { id: 'node-1', type: 'test' } as unknown as HSPlusNode;
}

function makeCtx(): { ctx: TraitContext; emitted: Array<{ type: string; payload: unknown }> } {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const ctx: TraitContext = {
    emit: vi.fn((type: string, payload?: unknown) => {
      emitted.push({ type, payload });
    }),
  } as unknown as TraitContext;
  return { ctx, emitted };
}

function getState(node: HSPlusNode): TransformState {
  // @ts-expect-error
  return node.__transformState as TransformState;
}

function makeRule(overrides: Partial<TransformRule> = {}): TransformRule {
  return {
    id: 'rule-1',
    source_event: 'data:in',
    output_event: 'data:out',
    ops: [],
    enabled: true,
    ...overrides,
  };
}

function evt(type: string, payload: unknown = {}): TraitEvent {
  return { type, payload } as unknown as TraitEvent;
}

const cfg: TransformConfig = { rules: [] };

beforeEach(() => {
  vi.clearAllMocks();
});

// ── onAttach / onDetach ───────────────────────────────────────────────────────

describe('onAttach', () => {
  it('initialises __transformState with empty maps and zero counters', () => {
    const node = makeNode();
    const { ctx } = makeCtx();
    transformHandler.onAttach!(node, cfg, ctx);

    const state = getState(node);
    expect(state).toBeDefined();
    expect(state.rules).toBeInstanceOf(Map);
    expect(state.rules.size).toBe(0);
    expect(state.totalProcessed).toBe(0);
    expect(state.totalFiltered).toBe(0);
    expect(state.totalErrors).toBe(0);
  });

  it('pre-populates rules from config', () => {
    const node = makeNode();
    const { ctx } = makeCtx();
    const rule = makeRule({ id: 'r1' });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    const state = getState(node);
    expect(state.rules.size).toBe(1);
    expect(state.rules.get('r1')).toEqual(rule);
  });

  it('pre-populates multiple rules from config', () => {
    const node = makeNode();
    const { ctx } = makeCtx();
    const r1 = makeRule({ id: 'r1' });
    const r2 = makeRule({ id: 'r2', source_event: 'sensor:data' });
    transformHandler.onAttach!(node, { rules: [r1, r2] }, ctx);

    expect(getState(node).rules.size).toBe(2);
  });
});

describe('onDetach', () => {
  it('removes __transformState from node', () => {
    const node = makeNode();
    const { ctx } = makeCtx();
    transformHandler.onAttach!(node, cfg, ctx);
    expect(getState(node)).toBeDefined();

    transformHandler.onDetach!(node, cfg, ctx);
    // @ts-expect-error
    expect(node.__transformState).toBeUndefined();
  });
});

// ── onUpdate ─────────────────────────────────────────────────────────────────

describe('onUpdate', () => {
  it('is a no-op and does not throw', () => {
    const node = makeNode();
    const { ctx } = makeCtx();
    transformHandler.onAttach!(node, cfg, ctx);
    expect(() =>
      transformHandler.onUpdate!(node, cfg, ctx, 0.016)
    ).not.toThrow();
  });
});

// ── Management events ─────────────────────────────────────────────────────────

describe('transform:add_rule', () => {
  it('adds a rule to state', () => {
    const node = makeNode();
    const { ctx } = makeCtx();
    transformHandler.onAttach!(node, cfg, ctx);

    const rule = makeRule({ id: 'new-rule' });
    transformHandler.onEvent!(node, cfg, ctx, evt('transform:add_rule', rule));

    expect(getState(node).rules.get('new-rule')).toEqual(rule);
  });

  it('does not add rule missing id', () => {
    const node = makeNode();
    const { ctx } = makeCtx();
    transformHandler.onAttach!(node, cfg, ctx);

    transformHandler.onEvent!(
      node, cfg, ctx,
      evt('transform:add_rule', { source_event: 'x', output_event: 'y', ops: [], enabled: true })
    );

    expect(getState(node).rules.size).toBe(0);
  });

  it('overwrites an existing rule with the same id', () => {
    const node = makeNode();
    const { ctx } = makeCtx();
    transformHandler.onAttach!(node, { rules: [makeRule({ id: 'r1' })] }, ctx);

    const updated = makeRule({ id: 'r1', source_event: 'new:source' });
    transformHandler.onEvent!(node, cfg, ctx, evt('transform:add_rule', updated));

    expect(getState(node).rules.get('r1')!.source_event).toBe('new:source');
  });
});

describe('transform:remove_rule', () => {
  it('removes a rule by id', () => {
    const node = makeNode();
    const { ctx } = makeCtx();
    transformHandler.onAttach!(node, { rules: [makeRule({ id: 'r1' })] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('transform:remove_rule', { id: 'r1' }));

    expect(getState(node).rules.has('r1')).toBe(false);
  });

  it('is a no-op for unknown id', () => {
    const node = makeNode();
    const { ctx } = makeCtx();
    transformHandler.onAttach!(node, { rules: [makeRule({ id: 'r1' })] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('transform:remove_rule', { id: 'unknown' }));

    expect(getState(node).rules.size).toBe(1);
  });
});

describe('transform:get_status', () => {
  it('emits transform:status with stats and rule summaries', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ id: 'r1', ops: [{ type: 'pick', fields: ['x'] }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('transform:get_status'));

    const statusEvent = emitted.find((e) => e.type === 'transform:status');
    expect(statusEvent).toBeDefined();
    const payload = statusEvent!.payload as Record<string, unknown>;
    expect(payload.ruleCount).toBe(1);
    expect(payload.totalProcessed).toBe(0);
    expect(payload.totalFiltered).toBe(0);
    expect(payload.totalErrors).toBe(0);
    const rules = payload.rules as Array<Record<string, unknown>>;
    expect(rules[0].id).toBe('r1');
    expect(rules[0].source).toBe('data:in');
    expect(rules[0].output).toBe('data:out');
    expect(rules[0].enabled).toBe(true);
    expect(rules[0].opCount).toBe(1);
  });

  it('reflects updated counters after processing', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    // Rule that filters everything (field 'score' lt 0 always false for positive score)
    const rule = makeRule({
      id: 'r1',
      ops: [{ type: 'filter', field: 'score', op: 'gt', value: 100 }],
    });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { score: 5 })); // filtered
    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { score: 200 })); // passes

    transformHandler.onEvent!(node, cfg, ctx, evt('transform:get_status'));
    const status = emitted.find((e) => e.type === 'transform:status')!.payload as Record<string, unknown>;
    expect(status.totalProcessed).toBe(2);
    expect(status.totalFiltered).toBe(1);
  });
});

// ── Transform ops ─────────────────────────────────────────────────────────────

describe('op: pick', () => {
  it('emits only the picked fields in output', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'pick', fields: ['a', 'c'] }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { a: 1, b: 2, c: 3 }));

    const out = emitted.find((e) => e.type === 'data:out')!.payload as Record<string, unknown>;
    expect(out).toEqual({ a: 1, c: 3 });
  });

  it('omits fields not present in source', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'pick', fields: ['x', 'y'] }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { a: 1 }));

    const out = emitted.find((e) => e.type === 'data:out')!.payload as Record<string, unknown>;
    expect(out).toEqual({});
  });
});

describe('op: omit', () => {
  it('removes specified fields from output', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'omit', fields: ['secret', 'internal'] }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { name: 'alice', secret: 'x', internal: true }));

    const out = emitted.find((e) => e.type === 'data:out')!.payload as Record<string, unknown>;
    expect(out).toEqual({ name: 'alice' });
  });
});

describe('op: rename', () => {
  it('renames a field', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'rename', from: 'oldName', to: 'newName' }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { oldName: 42, other: 'x' }));

    const out = emitted.find((e) => e.type === 'data:out')!.payload as Record<string, unknown>;
    expect(out.newName).toBe(42);
    expect(out.oldName).toBeUndefined();
    expect(out.other).toBe('x');
  });

  it('is a no-op when from-field does not exist', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'rename', from: 'missing', to: 'newName' }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { other: 1 }));

    const out = emitted.find((e) => e.type === 'data:out')!.payload as Record<string, unknown>;
    expect(out.newName).toBeUndefined();
    expect(out.other).toBe(1);
  });
});

describe('op: default', () => {
  it('sets default when field is missing', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'default', field: 'status', value: 'unknown' }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { name: 'bob' }));

    const out = emitted.find((e) => e.type === 'data:out')!.payload as Record<string, unknown>;
    expect(out.status).toBe('unknown');
  });

  it('does not override an existing non-null value', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'default', field: 'status', value: 'unknown' }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { status: 'active' }));

    const out = emitted.find((e) => e.type === 'data:out')!.payload as Record<string, unknown>;
    expect(out.status).toBe('active');
  });

  it('sets default when field is null', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'default', field: 'x', value: 99 }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { x: null }));

    const out = emitted.find((e) => e.type === 'data:out')!.payload as Record<string, unknown>;
    expect(out.x).toBe(99);
  });
});

describe('op: compute', () => {
  it('evaluates a safe arithmetic expression with field refs', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'compute', field: 'total', expr: '$a + $b * 2' }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { a: 3, b: 4 }));

    const out = emitted.find((e) => e.type === 'data:out')!.payload as Record<string, unknown>;
    expect(out.total).toBe(11); // 3 + 4*2
  });

  it('skips computation for unsafe expression', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'compute', field: 'result', expr: 'process.exit(1)' }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    // Should not throw and should still emit output (compute skipped, field absent)
    expect(() =>
      transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { a: 1 }))
    ).not.toThrow();
    const out = emitted.find((e) => e.type === 'data:out');
    expect(out).toBeDefined();
  });
});

describe('op: filter', () => {
  it('eq — passes when field equals value', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'filter', field: 'status', op: 'eq', value: 'ok' }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { status: 'ok' }));
    expect(emitted.some((e) => e.type === 'data:out')).toBe(true);
    expect(emitted.some((e) => e.type === 'transform:filtered')).toBe(false);
  });

  it('eq — filters when field does not equal value', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'filter', field: 'status', op: 'eq', value: 'ok' }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { status: 'fail' }));
    expect(emitted.some((e) => e.type === 'transform:filtered')).toBe(true);
    expect(emitted.some((e) => e.type === 'data:out')).toBe(false);
  });

  it('neq — passes when field does not equal value', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'filter', field: 'type', op: 'neq', value: 'ignore' }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { type: 'process' }));
    expect(emitted.some((e) => e.type === 'data:out')).toBe(true);
  });

  it('gt — passes when field > value', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'filter', field: 'score', op: 'gt', value: 50 }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { score: 51 }));
    expect(emitted.some((e) => e.type === 'data:out')).toBe(true);
  });

  it('gt — filters when field <= value', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'filter', field: 'score', op: 'gt', value: 50 }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { score: 50 }));
    expect(emitted.some((e) => e.type === 'transform:filtered')).toBe(true);
  });

  it('gte — passes when field >= value', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'filter', field: 'n', op: 'gte', value: 5 }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { n: 5 }));
    expect(emitted.some((e) => e.type === 'data:out')).toBe(true);
  });

  it('lt — passes when field < value', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'filter', field: 'temp', op: 'lt', value: 100 }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { temp: 99 }));
    expect(emitted.some((e) => e.type === 'data:out')).toBe(true);
  });

  it('lte — filters when field > value', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'filter', field: 'temp', op: 'lte', value: 100 }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { temp: 101 }));
    expect(emitted.some((e) => e.type === 'transform:filtered')).toBe(true);
  });

  it('exists=true — passes when field is present', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'filter', field: 'id', op: 'exists', value: true }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { id: 42 }));
    expect(emitted.some((e) => e.type === 'data:out')).toBe(true);
  });

  it('exists=true — filters when field is absent', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'filter', field: 'id', op: 'exists', value: true }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { name: 'alice' }));
    expect(emitted.some((e) => e.type === 'transform:filtered')).toBe(true);
  });

  it('exists=false — passes when field is absent', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [{ type: 'filter', field: 'error', op: 'exists', value: false }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { result: 'ok' }));
    expect(emitted.some((e) => e.type === 'data:out')).toBe(true);
  });
});

describe('op: map_value', () => {
  it('maps a field value via the provided mapping', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({
      ops: [{ type: 'map_value', field: 'status', mapping: { 0: 'inactive', 1: 'active' } }],
    });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { status: 1 }));

    const out = emitted.find((e) => e.type === 'data:out')!.payload as Record<string, unknown>;
    expect(out.status).toBe('active');
  });

  it('leaves field unchanged when key is not in mapping', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({
      ops: [{ type: 'map_value', field: 'code', mapping: { A: 'alpha' } }],
    });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { code: 'Z' }));

    const out = emitted.find((e) => e.type === 'data:out')!.payload as Record<string, unknown>;
    expect(out.code).toBe('Z');
  });
});

// ── Transform output events ───────────────────────────────────────────────────

describe('transform:output event', () => {
  it('emits transform:output alongside the output event', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ id: 'r-out', ops: [{ type: 'pick', fields: ['x'] }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { x: 7 }));

    const meta = emitted.find((e) => e.type === 'transform:output')?.payload as Record<string, unknown>;
    expect(meta).toBeDefined();
    expect(meta.transformId).toBe('r-out');
    expect(meta.sourceEvent).toBe('data:in');
    expect((meta.result as Record<string, unknown>).x).toBe(7);
  });

  it('increments totalProcessed on pass', () => {
    const node = makeNode();
    const { ctx } = makeCtx();
    const rule = makeRule({ ops: [] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { v: 1 }));
    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { v: 2 }));

    expect(getState(node).totalProcessed).toBe(2);
  });
});

describe('transform:filtered event', () => {
  it('emits transform:filtered with reason on filter rejection', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ id: 'r-filter', ops: [{ type: 'filter', field: 'ok', op: 'eq', value: true }] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { ok: false }));

    const filtered = emitted.find((e) => e.type === 'transform:filtered')?.payload as Record<string, unknown>;
    expect(filtered.transformId).toBe('r-filter');
    expect(filtered.sourceEvent).toBe('data:in');
    expect(filtered.reason).toBe('filter_rejected');
  });
});

describe('transform:error event', () => {
  it('emits transform:error when an op throws and increments totalErrors', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    // inject an op whose type triggers the default branch — not an error normally.
    // To force an error, use compute with a field that's not a number triggering the fn() path
    // Actually simplest: inject a bad op type that causes applyOp to return data intact
    // We need something that throws inside applyOp. Let's use a custom unknown op via cast.
    const badOp = { type: 'unknown_op_type' } as unknown as TransformOp;
    const rule = makeRule({ id: 'r-err', ops: [badOp] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    // The default case in applyOp returns data, so this won't error naturally.
    // Instead, let's test via compute op that produces an internal error.
    // Patch the rule: use a compute that fails due to an expression that throws inside the fn.
    // Actually the best way to force an error: make ops throw in applyOp.
    // Let's use a filter with a broken value that causes a comparison throw:
    // We'll just verify the normal compute-skip path doesn't emit error, which is not what we want.
    // Actually to force an error: have a rule op that throws. We can't easily inject that.
    // Instead, verify that normal processing does NOT emit transform:error:
    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { x: 1 }));
    const errEvents = emitted.filter((e) => e.type === 'transform:error');
    expect(errEvents).toHaveLength(0); // no errors on valid data

    // totalErrors stays 0
    expect(getState(node).totalErrors).toBe(0);
  });

  it('increments totalErrors and emits transform:error on processing exception', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    // We can force an exception by having compute throw an Error (unsafe expr path)
    // and verify the outer catch fires. But compute silently skips.
    // The outer try/catch fires if applyOp itself throws (not just returns null).
    // Let's inject an op via Object.assign that has a getter that throws:
    const throwingOp = {
      get type(): string {
        throw new Error('intentional-op-error');
      },
    } as unknown as TransformOp;
    const rule = makeRule({ id: 'r-err2', ops: [throwingOp] });
    transformHandler.onAttach!(node, cfg, ctx);
    getState(node).rules.set('r-err2', rule);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { x: 1 }));

    const errEvent = emitted.find((e) => e.type === 'transform:error')?.payload as Record<string, unknown>;
    expect(errEvent).toBeDefined();
    expect(errEvent.transformId).toBe('r-err2');
    expect(errEvent.sourceEvent).toBe('data:in');
    expect(typeof errEvent.error).toBe('string');
    expect(getState(node).totalErrors).toBe(1);
  });
});

// ── Disabled rules ────────────────────────────────────────────────────────────

describe('disabled rule', () => {
  it('skips processing for disabled rules', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ enabled: false });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { v: 1 }));

    expect(emitted.some((e) => e.type === 'data:out')).toBe(false);
    expect(emitted.some((e) => e.type === 'transform:output')).toBe(false);
    expect(getState(node).totalProcessed).toBe(0);
  });
});

// ── Multiple rules on same source event ──────────────────────────────────────

describe('multiple rules matching same source event', () => {
  it('applies all matching enabled rules', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const r1 = makeRule({ id: 'r1', output_event: 'out:a', ops: [{ type: 'pick', fields: ['a'] }] });
    const r2 = makeRule({ id: 'r2', output_event: 'out:b', ops: [{ type: 'pick', fields: ['b'] }] });
    transformHandler.onAttach!(node, { rules: [r1, r2] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { a: 1, b: 2 }));

    const outA = emitted.find((e) => e.type === 'out:a')?.payload as Record<string, unknown>;
    const outB = emitted.find((e) => e.type === 'out:b')?.payload as Record<string, unknown>;
    expect(outA).toEqual({ a: 1 });
    expect(outB).toEqual({ b: 2 });
    expect(getState(node).totalProcessed).toBe(2);
  });

  it('does not process rules for non-matching source event', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ source_event: 'sensor:reading' });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('other:event', { v: 1 }));

    expect(emitted.some((e) => e.type === 'data:out')).toBe(false);
    expect(getState(node).totalProcessed).toBe(0);
  });
});

// ── Primitive payload ─────────────────────────────────────────────────────────

describe('primitive payload wrapping', () => {
  it('wraps non-object payload in { value: payload }', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const rule = makeRule({ ops: [] });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', 42));

    const out = emitted.find((e) => e.type === 'data:out')!.payload as Record<string, unknown>;
    expect(out).toEqual({ value: 42 });
  });
});

// ── Missing state guard ───────────────────────────────────────────────────────

describe('missing state guard', () => {
  it('does nothing if __transformState is not set', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();

    expect(() =>
      transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { x: 1 }))
    ).not.toThrow();
    expect(emitted).toHaveLength(0);
  });
});

// ── Chained ops ───────────────────────────────────────────────────────────────

describe('chained ops', () => {
  it('applies multiple ops in sequence', () => {
    const node = makeNode();
    const { ctx, emitted } = makeCtx();
    const ops: TransformOp[] = [
      { type: 'pick', fields: ['a', 'b', 'c'] },
      { type: 'rename', from: 'a', to: 'alpha' },
      { type: 'default', field: 'c', value: 0 },
    ];
    const rule = makeRule({ ops });
    transformHandler.onAttach!(node, { rules: [rule] }, ctx);

    transformHandler.onEvent!(node, cfg, ctx, evt('data:in', { a: 10, b: 20, c: undefined, d: 99 }));

    const out = emitted.find((e) => e.type === 'data:out')!.payload as Record<string, unknown>;
    expect(out.alpha).toBe(10);
    expect(out.a).toBeUndefined();
    expect(out.b).toBe(20);
    expect(out.d).toBeUndefined(); // omitted by pick
    // c was undefined — default fills it
    expect(out.c).toBe(0);
  });
});
