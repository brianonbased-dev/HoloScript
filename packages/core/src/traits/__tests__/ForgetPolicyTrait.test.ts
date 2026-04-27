/**
 * ForgetPolicyTrait — comprehensive tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { forgetPolicyHandler, type ForgetPolicyConfig } from '../ForgetPolicyTrait';
import type { AgentMemoryState, Memory } from '../AgentMemoryTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(): HSPlusNode & {
  __forgetPolicyState?: unknown;
  __agentMemoryState?: AgentMemoryState;
} {
  return {} as HSPlusNode & {
    __forgetPolicyState?: unknown;
    __agentMemoryState?: AgentMemoryState;
  };
}

function makeContext() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const context: TraitContext = {
    emit: (type: string, payload?: unknown) => emitted.push({ type, payload }),
  };
  return { context, emitted };
}

const BASE_CONFIG: ForgetPolicyConfig = {
  ...(forgetPolicyHandler.defaultConfig as ForgetPolicyConfig),
};

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  const now = Date.now();
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    key: `k-${Math.random().toString(36).slice(2)}`,
    content: 'hello memory',
    tags: ['test'],
    embedding: null,
    createdAt: now,
    accessedAt: now,
    accessCount: 1,
    ttl: null,
    source: 'test',
    ...overrides,
  };
}

function setup(
  configOverrides: Partial<ForgetPolicyConfig> = {},
  withMemoryState = false
): {
  node: ReturnType<typeof makeNode>;
  config: ForgetPolicyConfig;
  context: TraitContext;
  emitted: Array<{ type: string; payload: unknown }>;
} {
  const node = makeNode();
  const { context, emitted } = makeContext();
  const config: ForgetPolicyConfig = { ...BASE_CONFIG, ...configOverrides };

  if (withMemoryState) {
    node.__agentMemoryState = {
      memories: new Map(),
      db: null,
      isReady: true,
      totalStored: 0,
      totalRecalled: 0,
      totalCompressed: 0,
    };
  }

  forgetPolicyHandler.onAttach(node, config, context);
  emitted.length = 0;
  return { node, config, context, emitted };
}

// ---------------------------------------------------------------------------
// onAttach
// ---------------------------------------------------------------------------

describe('forgetPolicyHandler.onAttach', () => {
  it('attaches valid config and emits forget_policy_attached', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    forgetPolicyHandler.onAttach(node, BASE_CONFIG, context);
    expect(node.__forgetPolicyState).toBeDefined();
    expect(emitted.some(e => e.type === 'forget_policy_attached')).toBe(true);
  });

  it('rejects invalid duration format and emits forget_error', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    forgetPolicyHandler.onAttach(node, { ...BASE_CONFIG, after: 'thirty days' }, context);
    expect(node.__forgetPolicyState).toBeUndefined();
    expect(emitted.some(e => e.type === 'forget_error')).toBe(true);
  });

  it('rejects invalid predicate format and emits forget_error', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    forgetPolicyHandler.onAttach(node, { ...BASE_CONFIG, when: 'not a predicate' }, context);
    expect(node.__forgetPolicyState).toBeUndefined();
    expect(emitted.some(e => e.type === 'forget_error')).toBe(true);
  });

  it('emits warning forget_error when audit=false', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    forgetPolicyHandler.onAttach(node, { ...BASE_CONFIG, audit: false }, context);
    expect(node.__forgetPolicyState).toBeDefined();
    expect(emitted.some(e => e.type === 'forget_error')).toBe(true);
    expect(emitted.some(e => e.type === 'forget_policy_attached')).toBe(true);
  });

  it('parses 30d duration into ms', () => {
    const node = makeNode();
    const { context } = makeContext();
    forgetPolicyHandler.onAttach(node, { ...BASE_CONFIG, after: '30d' }, context);
    const state = node.__forgetPolicyState as { afterMs: number };
    expect(state.afterMs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('parses 12h duration into ms', () => {
    const node = makeNode();
    const { context } = makeContext();
    forgetPolicyHandler.onAttach(node, { ...BASE_CONFIG, after: '12h' }, context);
    const state = node.__forgetPolicyState as { afterMs: number };
    expect(state.afterMs).toBe(12 * 60 * 60 * 1000);
  });

  it('parses 1w duration into ms', () => {
    const node = makeNode();
    const { context } = makeContext();
    forgetPolicyHandler.onAttach(node, { ...BASE_CONFIG, after: '1w' }, context);
    const state = node.__forgetPolicyState as { afterMs: number };
    expect(state.afterMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('accepts valid predicate accessCount < 3', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    forgetPolicyHandler.onAttach(node, { ...BASE_CONFIG, when: 'accessCount < 3' }, context);
    expect(node.__forgetPolicyState).toBeDefined();
    expect(emitted.some(e => e.type === 'forget_error')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// onDetach
// ---------------------------------------------------------------------------

describe('forgetPolicyHandler.onDetach', () => {
  it('emits forget_policy_detached with summary', () => {
    const { node, config } = setup();
    const { context, emitted } = makeContext();
    forgetPolicyHandler.onDetach(node, config, context);
    const ev = emitted.find(e => e.type === 'forget_policy_detached');
    expect(ev).toBeDefined();
    expect((ev!.payload as any)).toHaveProperty('totalEvaluations');
    expect((ev!.payload as any)).toHaveProperty('totalDeleted');
  });

  it('deletes internal forget state on detach', () => {
    const { node, config, context } = setup();
    forgetPolicyHandler.onDetach(node, config, context);
    expect(node.__forgetPolicyState).toBeUndefined();
  });

  it('gracefully handles detach when no state exists', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() => forgetPolicyHandler.onDetach(node, BASE_CONFIG, context)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// onUpdate interval and prerequisites
// ---------------------------------------------------------------------------

describe('forgetPolicyHandler.onUpdate prerequisites', () => {
  it('does nothing when forget state missing', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    forgetPolicyHandler.onUpdate(node, BASE_CONFIG, context);
    expect(emitted.length).toBe(0);
  });

  it('does nothing when __agentMemoryState missing', () => {
    const { node, config, context, emitted } = setup();
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(emitted.length).toBe(0);
  });

  it('respects eval_interval_ms gate', () => {
    const { node, config, context, emitted } = setup({ eval_interval_ms: 60_000 }, true);
    // first call evaluates
    forgetPolicyHandler.onUpdate(node, config, context);
    const firstCount = emitted.filter(e => e.type === 'forget_evaluate').length;
    // immediate second call should be gated
    forgetPolicyHandler.onUpdate(node, config, context);
    const secondCount = emitted.filter(e => e.type === 'forget_evaluate').length;
    expect(firstCount).toBe(1);
    expect(secondCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// deletion conditions (after + predicate)
// ---------------------------------------------------------------------------

describe('forgetPolicyHandler.onUpdate deletion behavior', () => {
  it('emits forget_evaluate on evaluation', () => {
    const { node, config, context, emitted } = setup({ eval_interval_ms: 0 }, true);
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(emitted.some(e => e.type === 'forget_evaluate')).toBe(true);
  });

  it('does not delete memories younger than after threshold', () => {
    const { node, config, context } = setup({ after: '30d', eval_interval_ms: 0 }, true);
    const memState = node.__agentMemoryState!;
    memState.memories.set('fresh', makeMemory({ key: 'fresh', createdAt: Date.now() - 1_000 }));
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(memState.memories.has('fresh')).toBe(true);
  });

  it('deletes old memories when after condition met', () => {
    const { node, config, context, emitted } = setup({ after: '1s', eval_interval_ms: 0 }, true);
    const memState = node.__agentMemoryState!;
    memState.memories.set('old', makeMemory({ key: 'old', createdAt: Date.now() - 5_000 }));
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(memState.memories.has('old')).toBe(false);
    const apply = emitted.find(e => e.type === 'forget_apply');
    expect((apply!.payload as any).deletedCount).toBe(1);
  });

  it('respects max_deletes_per_cycle', () => {
    const { node, config, context } = setup(
      { after: '1s', eval_interval_ms: 0, max_deletes_per_cycle: 2 },
      true
    );
    const memState = node.__agentMemoryState!;
    for (let i = 0; i < 5; i++) {
      memState.memories.set(`k${i}`, makeMemory({ key: `k${i}`, createdAt: Date.now() - 5_000 }));
    }
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(memState.memories.size).toBe(3);
  });

  it('supports predicate accessCount < 3', () => {
    const { node, config, context } = setup(
      { after: '1s', when: 'accessCount < 3', eval_interval_ms: 0 },
      true
    );
    const memState = node.__agentMemoryState!;
    memState.memories.set(
      'low',
      makeMemory({ key: 'low', createdAt: Date.now() - 5_000, accessCount: 1 })
    );
    memState.memories.set(
      'high',
      makeMemory({ key: 'high', createdAt: Date.now() - 5_000, accessCount: 10 })
    );
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(memState.memories.has('low')).toBe(false);
    expect(memState.memories.has('high')).toBe(true);
  });

  it('supports predicate age > value', () => {
    const { node, config, context } = setup(
      { after: '1ms', when: 'age > 1000', eval_interval_ms: 0 },
      true
    );
    const memState = node.__agentMemoryState!;
    memState.memories.set('old', makeMemory({ key: 'old', createdAt: Date.now() - 5_000 }));
    memState.memories.set('new', makeMemory({ key: 'new', createdAt: Date.now() - 100 }));
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(memState.memories.has('old')).toBe(false);
    expect(memState.memories.has('new')).toBe(true);
  });

  it('supports predicate idleTime > value', () => {
    const { node, config, context } = setup(
      { after: '1ms', when: 'idleTime > 1000', eval_interval_ms: 0 },
      true
    );
    const memState = node.__agentMemoryState!;
    memState.memories.set(
      'idle',
      makeMemory({ key: 'idle', createdAt: Date.now() - 5_000, accessedAt: Date.now() - 2_000 })
    );
    memState.memories.set(
      'active',
      makeMemory({ key: 'active', createdAt: Date.now() - 5_000, accessedAt: Date.now() - 100 })
    );
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(memState.memories.has('idle')).toBe(false);
    expect(memState.memories.has('active')).toBe(true);
  });

  it('supports predicate tagCount >= value', () => {
    const { node, config, context } = setup(
      { after: '1ms', when: 'tagCount >= 2', eval_interval_ms: 0 },
      true
    );
    const memState = node.__agentMemoryState!;
    memState.memories.set('many', makeMemory({ key: 'many', createdAt: Date.now() - 5_000, tags: ['a', 'b'] }));
    memState.memories.set('few', makeMemory({ key: 'few', createdAt: Date.now() - 5_000, tags: ['a'] }));
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(memState.memories.has('many')).toBe(false);
    expect(memState.memories.has('few')).toBe(true);
  });

  it('supports predicate contentLength != value', () => {
    const { node, config, context } = setup(
      { after: '1ms', when: 'contentLength != 5', eval_interval_ms: 0 },
      true
    );
    const memState = node.__agentMemoryState!;
    memState.memories.set(
      'a',
      makeMemory({ key: 'a', createdAt: Date.now() - 5_000, content: '12345' })
    );
    memState.memories.set(
      'b',
      makeMemory({ key: 'b', createdAt: Date.now() - 5_000, content: '123456' })
    );
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(memState.memories.has('a')).toBe(true);
    expect(memState.memories.has('b')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// audit + dry_run
// ---------------------------------------------------------------------------

describe('audit and dry_run', () => {
  it('records audit entries when audit=true', () => {
    const { node, config, context, emitted } = setup(
      { after: '1s', eval_interval_ms: 0, audit: true },
      true
    );
    const memState = node.__agentMemoryState!;
    memState.memories.set('old', makeMemory({ key: 'old', createdAt: Date.now() - 5_000 }));
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(emitted.some(e => e.type === 'forget_audit_entry')).toBe(true);
  });

  it('does not emit forget_audit_entry when audit=false', () => {
    const { node, config, context, emitted } = setup(
      { after: '1s', eval_interval_ms: 0, audit: false },
      true
    );
    const memState = node.__agentMemoryState!;
    memState.memories.set('old', makeMemory({ key: 'old', createdAt: Date.now() - 5_000 }));
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(emitted.some(e => e.type === 'forget_audit_entry')).toBe(false);
  });

  it('dry_run=true does not delete, but reports wouldDelete', () => {
    const { node, config, context, emitted } = setup(
      { after: '1s', eval_interval_ms: 0, dry_run: true, audit: true },
      true
    );
    const memState = node.__agentMemoryState!;
    memState.memories.set('old', makeMemory({ key: 'old', createdAt: Date.now() - 5_000 }));
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(memState.memories.has('old')).toBe(true);
    const apply = emitted.find(e => e.type === 'forget_apply');
    expect((apply!.payload as any).deletedCount).toBe(0);
    expect((apply!.payload as any).wouldDelete).toBe(1);
    expect((apply!.payload as any).dryRun).toBe(true);
  });

  it('dry_run=false deletes candidates', () => {
    const { node, config, context } = setup(
      { after: '1s', eval_interval_ms: 0, dry_run: false },
      true
    );
    const memState = node.__agentMemoryState!;
    memState.memories.set('old', makeMemory({ key: 'old', createdAt: Date.now() - 5_000 }));
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(memState.memories.has('old')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// onEvent
// ---------------------------------------------------------------------------

describe('forgetPolicyHandler.onEvent', () => {
  it('forget_execute resets lastEvalAt to force immediate evaluation', () => {
    const { node, config, context } = setup({ eval_interval_ms: 60_000 }, true);
    const state = node.__forgetPolicyState as { lastEvalAt: number };
    state.lastEvalAt = Date.now();
    forgetPolicyHandler.onEvent(node, config, context, { type: 'forget_execute' });
    expect(state.lastEvalAt).toBe(0);
  });

  it('forget_audit_export emits forget_audit_log', () => {
    const { node, config, context, emitted } = setup(
      { after: '1s', eval_interval_ms: 0, audit: true },
      true
    );
    const memState = node.__agentMemoryState!;
    memState.memories.set('old', makeMemory({ key: 'old', createdAt: Date.now() - 5_000 }));
    forgetPolicyHandler.onUpdate(node, config, context);
    emitted.length = 0;
    forgetPolicyHandler.onEvent(node, config, context, { type: 'forget_audit_export' });
    const log = emitted.find(e => e.type === 'forget_audit_log');
    expect(log).toBeDefined();
    expect(Array.isArray((log!.payload as any).entries)).toBe(true);
  });

  it('ignores unknown events', () => {
    const { node, config, context } = setup();
    expect(() =>
      forgetPolicyHandler.onEvent(node, config, context, { type: 'unknown_event' })
    ).not.toThrow();
  });

  it('ignores events when state is missing', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() =>
      forgetPolicyHandler.onEvent(node, BASE_CONFIG, context, { type: 'forget_execute' })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles empty memory map gracefully', () => {
    const { node, config, context, emitted } = setup({ eval_interval_ms: 0 }, true);
    forgetPolicyHandler.onUpdate(node, config, context);
    const evalEv = emitted.find(e => e.type === 'forget_evaluate');
    expect((evalEv!.payload as any).candidateCount).toBe(0);
  });

  it('predicate with unknown field matches nothing', () => {
    const { node, config, context } = setup(
      { after: '1s', eval_interval_ms: 0, when: 'unknownField > 1' },
      true
    );
    // onAttach should reject invalid predicate syntax? unknownField is syntactically valid and allowed by parser
    // but evaluator returns false for unknown field
    const memState = node.__agentMemoryState!;
    memState.memories.set('old', makeMemory({ key: 'old', createdAt: Date.now() - 5_000 }));
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(memState.memories.has('old')).toBe(true);
  });

  it('strict operator handling: == works for accessCount', () => {
    const { node, config, context } = setup(
      { after: '1ms', eval_interval_ms: 0, when: 'accessCount == 2' },
      true
    );
    const memState = node.__agentMemoryState!;
    memState.memories.set('a', makeMemory({ key: 'a', createdAt: Date.now() - 5_000, accessCount: 2 }));
    memState.memories.set('b', makeMemory({ key: 'b', createdAt: Date.now() - 5_000, accessCount: 3 }));
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(memState.memories.has('a')).toBe(false);
    expect(memState.memories.has('b')).toBe(true);
  });

  it('strict operator handling: != works for accessCount', () => {
    const { node, config, context } = setup(
      { after: '1ms', eval_interval_ms: 0, when: 'accessCount != 2' },
      true
    );
    const memState = node.__agentMemoryState!;
    memState.memories.set('a', makeMemory({ key: 'a', createdAt: Date.now() - 5_000, accessCount: 2 }));
    memState.memories.set('b', makeMemory({ key: 'b', createdAt: Date.now() - 5_000, accessCount: 3 }));
    forgetPolicyHandler.onUpdate(node, config, context);
    expect(memState.memories.has('a')).toBe(true);
    expect(memState.memories.has('b')).toBe(false);
  });
});
