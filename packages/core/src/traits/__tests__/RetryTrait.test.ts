/**
 * RetryTrait tests — vitest
 * Covers: onAttach, onDetach, onUpdate (circuit auto-reset), onEvent (execute,
 * action_result, reset_circuit, get_status), backoff strategies, circuit breaker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryHandler } from '../RetryTrait';
import type { RetryConfig, RetryState } from '../RetryTrait';
import type { HSPlusNode } from '../../types';
import type { TraitContext } from '../../types/TraitContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(extra?: Partial<HSPlusNode>): HSPlusNode {
  return { id: 'n1', type: 'object', traits: new Set(), ...extra } as unknown as HSPlusNode;
}

function makeContext() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const ctx = {
    emit: vi.fn((type: string, payload?: unknown) => {
      emitted.push({ type, payload });
      return 0;
    }),
  } as unknown as TraitContext;
  return { ctx, emitted };
}

function defaultCfg(overrides?: Partial<RetryConfig>): RetryConfig {
  return {
    max_retries: 3,
    base_delay_ms: 1000,
    max_delay_ms: 30000,
    backoff: 'exponential',
    jitter: 0,
    circuit_threshold: 5,
    circuit_reset_ms: 60000,
    ...overrides,
  };
}

function getState(node: HSPlusNode): RetryState {
  return (node as unknown as Record<string, unknown>).__retryState as RetryState;
}

// Execute an action and return its retryId
function executeAction(node: HSPlusNode, config: RetryConfig, ctx: TraitContext, action: string, params?: Record<string, unknown>) {
  retryHandler.onEvent!(node, config, ctx, { type: 'retry:execute', payload: { action, params } });
  const state = getState(node);
  // The retryId is the most recently emitted attempt's retryId
  const emitted = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls;
  const attemptCall = [...emitted].reverse().find(c => c[0] === 'retry:attempt');
  return attemptCall?.[1]?.retryId as string;
}

// Report a result for a pending retryId
function reportResult(node: HSPlusNode, config: RetryConfig, ctx: TraitContext, retryId: string, success: boolean, error?: string) {
  retryHandler.onEvent!(node, config, ctx, {
    type: 'retry:action_result',
    payload: { retryId, success, error },
  });
}

// ---------------------------------------------------------------------------
// 1. Basic metadata
// ---------------------------------------------------------------------------

describe('RetryTrait – metadata', () => {
  it('has name "retry"', () => {
    expect(retryHandler.name).toBe('retry');
  });

  it('defaultConfig has expected defaults', () => {
    const cfg = retryHandler.defaultConfig!;
    expect(cfg.max_retries).toBe(3);
    expect(cfg.base_delay_ms).toBe(1000);
    expect(cfg.max_delay_ms).toBe(30000);
    expect(cfg.backoff).toBe('exponential');
    expect(cfg.jitter).toBe(0.1);
    expect(cfg.circuit_threshold).toBe(5);
    expect(cfg.circuit_reset_ms).toBe(60000);
  });
});

// ---------------------------------------------------------------------------
// 2. onAttach / onDetach
// ---------------------------------------------------------------------------

describe('RetryTrait – onAttach / onDetach', () => {
  it('onAttach initializes state with defaults', () => {
    const node = makeNode();
    const { ctx } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    const state = getState(node);
    expect(state).toBeDefined();
    expect(state.circuit).toBe('closed');
    expect(state.consecutiveFailures).toBe(0);
    expect(state.circuitOpenedAt).toBe(0);
    expect(state.totalAttempts).toBe(0);
    expect(state.totalSuccesses).toBe(0);
    expect(state.totalFailures).toBe(0);
    expect(state.pendingActions).toBeInstanceOf(Map);
    expect(state.pendingActions.size).toBe(0);
    expect(state.actionCounter).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    const { ctx } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    retryHandler.onDetach!(node, defaultCfg(), ctx);
    expect(getState(node)).toBeUndefined();
  });

  it('onDetach is safe when state is missing', () => {
    const node = makeNode();
    const { ctx } = makeContext();
    expect(() => retryHandler.onDetach!(node, defaultCfg(), ctx)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. onUpdate – circuit auto-reset
// ---------------------------------------------------------------------------

describe('RetryTrait – onUpdate circuit auto-reset', () => {
  it('does nothing when state is missing', () => {
    const node = makeNode();
    const { ctx } = makeContext();
    expect(() => retryHandler.onUpdate!(node, defaultCfg(), ctx, 0.016)).not.toThrow();
  });

  it('does nothing when circuit is closed', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    retryHandler.onUpdate!(node, defaultCfg(), ctx, 0.016);
    expect(emitted).toHaveLength(0);
  });

  it('transitions open→half-open after circuit_reset_ms elapsed', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    const state = getState(node);
    state.circuit = 'open';
    state.circuitOpenedAt = Date.now() - 70000; // 70s ago > 60s reset
    retryHandler.onUpdate!(node, defaultCfg(), ctx, 0.016);
    expect(state.circuit).toBe('half-open');
    expect(emitted.some(e => e.type === 'retry:circuit_half')).toBe(true);
  });

  it('does NOT transition open→half-open when cooldown not elapsed', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    const state = getState(node);
    state.circuit = 'open';
    state.circuitOpenedAt = Date.now() - 5000; // only 5s ago
    retryHandler.onUpdate!(node, defaultCfg(), ctx, 0.016);
    expect(state.circuit).toBe('open');
    expect(emitted).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. onEvent – retry:execute
// ---------------------------------------------------------------------------

describe('RetryTrait – retry:execute', () => {
  it('ignores execute with no actionName', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    retryHandler.onEvent!(node, defaultCfg(), ctx, { type: 'retry:execute', payload: {} });
    expect(emitted).toHaveLength(0);
  });

  it('emits retry:failure immediately when circuit is open', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    getState(node).circuit = 'open';
    retryHandler.onEvent!(node, defaultCfg(), ctx, {
      type: 'retry:execute',
      payload: { action: 'myAction' },
    });
    const failure = emitted.find(e => e.type === 'retry:failure');
    expect(failure).toBeDefined();
    expect((failure!.payload as Record<string,unknown>).actionName).toBe('myAction');
    expect((failure!.payload as Record<string,unknown>).error).toContain('Circuit');
  });

  it('emits retry:attempt and the action itself when circuit closed', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    retryHandler.onEvent!(node, defaultCfg(), ctx, {
      type: 'retry:execute',
      payload: { action: 'doWork', params: { x: 1 } },
    });
    const attempt = emitted.find(e => e.type === 'retry:attempt');
    expect(attempt).toBeDefined();
    expect((attempt!.payload as Record<string,unknown>).actionName).toBe('doWork');
    expect((attempt!.payload as Record<string,unknown>).attempt).toBe(0);
    const action = emitted.find(e => e.type === 'doWork');
    expect(action).toBeDefined();
    expect((action!.payload as Record<string,unknown>).x).toBe(1);
  });

  it('increments totalAttempts on execute', () => {
    const node = makeNode();
    const { ctx } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    retryHandler.onEvent!(node, defaultCfg(), ctx, {
      type: 'retry:execute',
      payload: { action: 'act' },
    });
    expect(getState(node).totalAttempts).toBe(1);
  });

  it('stores pending action in Map', () => {
    const node = makeNode();
    const { ctx } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    retryHandler.onEvent!(node, defaultCfg(), ctx, {
      type: 'retry:execute',
      payload: { action: 'act' },
    });
    expect(getState(node).pendingActions.size).toBe(1);
  });

  it('is safe when state is missing', () => {
    const node = makeNode();
    const { ctx } = makeContext();
    expect(() =>
      retryHandler.onEvent!(node, defaultCfg(), ctx, {
        type: 'retry:execute',
        payload: { action: 'act' },
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5. onEvent – retry:action_result success
// ---------------------------------------------------------------------------

describe('RetryTrait – retry:action_result success', () => {
  it('emits retry:success and removes pending action', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    const retryId = executeAction(node, defaultCfg(), ctx, 'act');
    reportResult(node, defaultCfg(), ctx, retryId, true);
    expect(emitted.some(e => e.type === 'retry:success')).toBe(true);
    expect(getState(node).pendingActions.size).toBe(0);
  });

  it('increments totalSuccesses on success', () => {
    const node = makeNode();
    const { ctx } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    const retryId = executeAction(node, defaultCfg(), ctx, 'act');
    reportResult(node, defaultCfg(), ctx, retryId, true);
    expect(getState(node).totalSuccesses).toBe(1);
  });

  it('resets consecutiveFailures on success', () => {
    const node = makeNode();
    const { ctx } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    getState(node).consecutiveFailures = 3;
    const retryId = executeAction(node, defaultCfg(), ctx, 'act');
    reportResult(node, defaultCfg(), ctx, retryId, true);
    expect(getState(node).consecutiveFailures).toBe(0);
  });

  it('closes circuit when success in half-open state, emits retry:circuit_close', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    getState(node).circuit = 'half-open';
    const retryId = executeAction(node, defaultCfg(), ctx, 'act');
    reportResult(node, defaultCfg(), ctx, retryId, true);
    expect(getState(node).circuit).toBe('closed');
    expect(emitted.some(e => e.type === 'retry:circuit_close')).toBe(true);
  });

  it('ignores unknown retryId', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    reportResult(node, defaultCfg(), ctx, 'nonexistent', true);
    expect(emitted).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. onEvent – retry:action_result failure
// ---------------------------------------------------------------------------

describe('RetryTrait – retry:action_result failure', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('emits retry:failure and increments totalFailures', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    const retryId = executeAction(node, defaultCfg(), ctx, 'act');
    reportResult(node, defaultCfg(), ctx, retryId, false, 'timeout');
    expect(emitted.some(e => e.type === 'retry:failure')).toBe(true);
    expect(getState(node).totalFailures).toBe(1);
  });

  it('increments consecutiveFailures on failure', () => {
    const node = makeNode();
    const { ctx } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    const retryId = executeAction(node, defaultCfg(), ctx, 'act');
    reportResult(node, defaultCfg(), ctx, retryId, false);
    expect(getState(node).consecutiveFailures).toBe(1);
  });

  it('schedules retry attempt via setTimeout', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    const cfg = defaultCfg({ max_retries: 3, base_delay_ms: 100, backoff: 'constant', jitter: 0 });
    retryHandler.onAttach!(node, cfg, ctx);
    const retryId = executeAction(node, cfg, ctx, 'doRetry');
    reportResult(node, cfg, ctx, retryId, false, 'err');
    // Advance timers to trigger the scheduled retry
    vi.advanceTimersByTime(200);
    const attempts = emitted.filter(e => e.type === 'retry:attempt');
    expect(attempts.length).toBeGreaterThanOrEqual(2); // initial + scheduled
  });

  it('emits retry:exhausted when max_retries exceeded', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    const cfg = defaultCfg({ max_retries: 1, base_delay_ms: 0, backoff: 'constant', jitter: 0 });
    retryHandler.onAttach!(node, cfg, ctx);
    const retryId = executeAction(node, cfg, ctx, 'act');
    // First failure: attempt=1, which equals max_retries=1, so attempt(1) > max_retries(1) is false.
    // Need two failures: first bumps to attempt=1, second bumps to attempt=2 > max_retries=1
    reportResult(node, cfg, ctx, retryId, false, 'e1');
    vi.advanceTimersByTime(10);
    // Get the new emitted retry:attempt's retryId (same retryId is reused)
    reportResult(node, cfg, ctx, retryId, false, 'e2');
    expect(emitted.some(e => e.type === 'retry:exhausted')).toBe(true);
    expect(getState(node).pendingActions.size).toBe(0);
  });

  it('opens circuit after consecutive failures reach threshold', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    const cfg = defaultCfg({ circuit_threshold: 3, max_retries: 10, base_delay_ms: 0, jitter: 0 });
    retryHandler.onAttach!(node, cfg, ctx);
    // Execute 3 actions and fail each to build consecutiveFailures=3
    for (let i = 0; i < 3; i++) {
      const rid = executeAction(node, cfg, ctx, 'act');
      reportResult(node, cfg, ctx, rid, false, 'err');
    }
    expect(getState(node).circuit).toBe('open');
    expect(emitted.some(e => e.type === 'retry:circuit_open')).toBe(true);
  });

  it('circuit_open payload has consecutiveFailures and resetMs', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    const cfg = defaultCfg({ circuit_threshold: 1, max_retries: 10, base_delay_ms: 0, jitter: 0 });
    retryHandler.onAttach!(node, cfg, ctx);
    const rid = executeAction(node, cfg, ctx, 'act');
    reportResult(node, cfg, ctx, rid, false, 'err');
    const circuitOpen = emitted.find(e => e.type === 'retry:circuit_open');
    expect(circuitOpen).toBeDefined();
    expect((circuitOpen!.payload as Record<string,unknown>).consecutiveFailures).toBe(1);
    expect((circuitOpen!.payload as Record<string,unknown>).resetMs).toBe(cfg.circuit_reset_ms);
  });

  it('reopens circuit on failure in half-open state', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    const cfg = defaultCfg({ max_retries: 10, base_delay_ms: 0, jitter: 0 });
    retryHandler.onAttach!(node, cfg, ctx);
    getState(node).circuit = 'half-open';
    const rid = executeAction(node, cfg, ctx, 'act');
    reportResult(node, cfg, ctx, rid, false, 'err');
    expect(getState(node).circuit).toBe('open');
    expect(emitted.some(e => e.type === 'retry:circuit_open')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. onEvent – retry:reset_circuit
// ---------------------------------------------------------------------------

describe('RetryTrait – retry:reset_circuit', () => {
  it('closes circuit and emits retry:circuit_close', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    getState(node).circuit = 'open';
    getState(node).consecutiveFailures = 5;
    retryHandler.onEvent!(node, defaultCfg(), ctx, { type: 'retry:reset_circuit', payload: {} });
    expect(getState(node).circuit).toBe('closed');
    expect(getState(node).consecutiveFailures).toBe(0);
    expect(emitted.some(e => e.type === 'retry:circuit_close')).toBe(true);
  });

  it('circuit_close recoveredAfterMs is 0 on manual reset', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    retryHandler.onEvent!(node, defaultCfg(), ctx, { type: 'retry:reset_circuit', payload: {} });
    const close = emitted.find(e => e.type === 'retry:circuit_close');
    expect((close!.payload as Record<string,unknown>).recoveredAfterMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 8. onEvent – retry:get_status
// ---------------------------------------------------------------------------

describe('RetryTrait – retry:get_status', () => {
  it('emits retry:status with current stats', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    const state = getState(node);
    state.totalAttempts = 5;
    state.totalSuccesses = 3;
    state.totalFailures = 2;
    retryHandler.onEvent!(node, defaultCfg(), ctx, { type: 'retry:get_status', payload: {} });
    const status = emitted.find(e => e.type === 'retry:status');
    expect(status).toBeDefined();
    const p = status!.payload as Record<string,unknown>;
    expect(p.circuit).toBe('closed');
    expect(p.totalAttempts).toBe(5);
    expect(p.totalSuccesses).toBe(3);
    expect(p.totalFailures).toBe(2);
    expect(p.pending).toBe(0);
  });

  it('reports pending count correctly', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    executeAction(node, defaultCfg(), ctx, 'act1');
    executeAction(node, defaultCfg(), ctx, 'act2');
    retryHandler.onEvent!(node, defaultCfg(), ctx, { type: 'retry:get_status', payload: {} });
    const status = emitted.find(e => e.type === 'retry:status');
    expect((status!.payload as Record<string,unknown>).pending).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 9. Backoff strategy
// ---------------------------------------------------------------------------

describe('RetryTrait – backoff strategies (via retry delays)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('constant backoff always uses base_delay_ms', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    const cfg = defaultCfg({ backoff: 'constant', base_delay_ms: 50, max_delay_ms: 30000, jitter: 0, max_retries: 2 });
    retryHandler.onAttach!(node, cfg, ctx);
    const rid = executeAction(node, cfg, ctx, 'act');
    reportResult(node, cfg, ctx, rid, false);
    // Should schedule next attempt at exactly 50ms
    vi.advanceTimersByTime(49);
    let attempts = emitted.filter(e => e.type === 'retry:attempt');
    expect(attempts).toHaveLength(1); // not yet
    vi.advanceTimersByTime(2);
    attempts = emitted.filter(e => e.type === 'retry:attempt');
    expect(attempts).toHaveLength(2); // now scheduled
  });

  it('linear backoff delay scales with attempt number', () => {
    // linear: delay = base * (attempt + 1), but attempt is already incremented
    // attempt=1 → base*(1+0)=base (attempt-1=0 in computeDelay)
    // We just check it fires within the expected window
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    const cfg = defaultCfg({ backoff: 'linear', base_delay_ms: 100, max_delay_ms: 30000, jitter: 0, max_retries: 3 });
    retryHandler.onAttach!(node, cfg, ctx);
    const rid = executeAction(node, cfg, ctx, 'act');
    reportResult(node, cfg, ctx, rid, false);
    vi.advanceTimersByTime(150);
    expect(emitted.filter(e => e.type === 'retry:attempt').length).toBeGreaterThanOrEqual(2);
  });

  it('max_delay_ms caps the computed delay', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    const cfg = defaultCfg({ backoff: 'exponential', base_delay_ms: 1000, max_delay_ms: 100, jitter: 0, max_retries: 5 });
    retryHandler.onAttach!(node, cfg, ctx);
    const rid = executeAction(node, cfg, ctx, 'act');
    reportResult(node, cfg, ctx, rid, false);
    vi.advanceTimersByTime(110);
    expect(emitted.filter(e => e.type === 'retry:attempt').length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 10. Unknown events
// ---------------------------------------------------------------------------

describe('RetryTrait – unknown events', () => {
  it('ignores unknown event types', () => {
    const node = makeNode();
    const { ctx, emitted } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    retryHandler.onEvent!(node, defaultCfg(), ctx, { type: 'unrelated:event', payload: {} });
    expect(emitted).toHaveLength(0);
  });

  it('handles string event type gracefully', () => {
    const node = makeNode();
    const { ctx } = makeContext();
    retryHandler.onAttach!(node, defaultCfg(), ctx);
    expect(() =>
      retryHandler.onEvent!(node, defaultCfg(), ctx, 'retry:get_status' as unknown as { type: string; payload: unknown }),
    ).not.toThrow();
  });
});
