/**
 * CircuitBreakerTrait — comprehensive tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  circuitBreakerHandler,
  type CircuitBreakerConfig,
} from '../CircuitBreakerTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CBNode = HSPlusNode & { __circuitBreakerState?: any };

function makeNode(): CBNode {
  return {} as CBNode;
}

function makeContext() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const context: TraitContext = {
    emit: (type: string, payload?: unknown) => emitted.push({ type, payload }),
  };
  return { context, emitted };
}

const BASE_CONFIG: CircuitBreakerConfig = {
  ...(circuitBreakerHandler.defaultConfig as CircuitBreakerConfig),
};

function setup(configOverrides: Partial<CircuitBreakerConfig> = {}) {
  const node = makeNode();
  const { context, emitted } = makeContext();
  const config: CircuitBreakerConfig = { ...BASE_CONFIG, ...configOverrides };
  circuitBreakerHandler.onAttach?.(node, config, context);
  emitted.length = 0;
  return { node, config, context, emitted };
}

function execute(node: CBNode, config: CircuitBreakerConfig, context: TraitContext, action = 'do_work', params: Record<string, unknown> = {}) {
  circuitBreakerHandler.onEvent?.(node, config, context, {
    type: 'circuit_breaker:execute',
    payload: { action, params },
  } as any);
}

function resolveLatest(node: CBNode, config: CircuitBreakerConfig, context: TraitContext, emitted: Array<{ type: string; payload: unknown }>, success: boolean, error?: string) {
  const actionEv = [...emitted].reverse().find(e => e.type !== 'circuit_breaker:success' && e.type !== 'circuit_breaker:failure' && !e.type.startsWith('circuit_breaker:'));
  const cbId = (actionEv?.payload as any)?.__circuitBreakerId;
  if (!cbId) throw new Error('No cbId found to resolve');
  circuitBreakerHandler.onEvent?.(node, config, context, {
    type: 'circuit_breaker:result',
    payload: { cbId, success, error },
  } as any);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// attach/defaults
// ---------------------------------------------------------------------------

describe('circuitBreakerHandler attach/defaults', () => {
  it('name is circuit_breaker', () => {
    expect(circuitBreakerHandler.name).toBe('circuit_breaker');
  });

  it('default failure_threshold is 5', () => {
    expect(BASE_CONFIG.failure_threshold).toBe(5);
  });

  it('default state is closed after attach', () => {
    const { node } = setup();
    expect(node.__circuitBreakerState.state).toBe('closed');
  });

  it('initial counters are zero', () => {
    const { node } = setup();
    const s = node.__circuitBreakerState;
    expect(s.totalRequests).toBe(0);
    expect(s.totalSuccesses).toBe(0);
    expect(s.totalFailures).toBe(0);
  });

  it('onDetach removes state', () => {
    const { node, config, context } = setup();
    circuitBreakerHandler.onDetach?.(node, config, context);
    expect(node.__circuitBreakerState).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// execute and result flow
// ---------------------------------------------------------------------------

describe('execute/result flow', () => {
  it('execute forwards action with __circuitBreakerId', () => {
    const { node, config, context, emitted } = setup();
    execute(node, config, context, 'run_action', { x: 1 });
    const ev = emitted.find(e => e.type === 'run_action');
    expect(ev).toBeDefined();
    expect((ev!.payload as any).x).toBe(1);
    expect(typeof (ev!.payload as any).__circuitBreakerId).toBe('string');
  });

  it('increments totalRequests on execute', () => {
    const { node, config, context } = setup();
    execute(node, config, context, 'a1');
    expect(node.__circuitBreakerState.totalRequests).toBe(1);
  });

  it('result success emits circuit_breaker:success and increments success counter', () => {
    const { node, config, context, emitted } = setup();
    execute(node, config, context, 'a1');
    resolveLatest(node, config, context, emitted, true);
    expect(emitted.some(e => e.type === 'circuit_breaker:success')).toBe(true);
    expect(node.__circuitBreakerState.totalSuccesses).toBe(1);
  });

  it('result failure emits circuit_breaker:failure and increments failure counter', () => {
    const { node, config, context, emitted } = setup();
    execute(node, config, context, 'a1');
    resolveLatest(node, config, context, emitted, false, 'boom');
    expect(emitted.some(e => e.type === 'circuit_breaker:failure')).toBe(true);
    expect(node.__circuitBreakerState.totalFailures).toBe(1);
  });

  it('result with unknown cbId is ignored', () => {
    const { node, config, context, emitted } = setup();
    circuitBreakerHandler.onEvent?.(node, config, context, {
      type: 'circuit_breaker:result',
      payload: { cbId: 'missing', success: true },
    } as any);
    expect(emitted.some(e => e.type === 'circuit_breaker:success')).toBe(false);
    expect(emitted.some(e => e.type === 'circuit_breaker:failure')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// opening by count threshold
// ---------------------------------------------------------------------------

describe('opens by failure count threshold', () => {
  it('opens circuit when failure_threshold reached', () => {
    const { node, config, context, emitted } = setup({ failure_threshold: 2 });
    execute(node, config, context, 'a1');
    resolveLatest(node, config, context, emitted, false, 'e1');
    execute(node, config, context, 'a2');
    resolveLatest(node, config, context, emitted, false, 'e2');

    expect(node.__circuitBreakerState.state).toBe('open');
    expect(emitted.some(e => e.type === 'circuit_breaker:opened')).toBe(true);
  });

  it('opened payload includes failureCount/failureRate/window', () => {
    const { node, config, context, emitted } = setup({ failure_threshold: 1, window_ms: 5000 });
    execute(node, config, context, 'a1');
    resolveLatest(node, config, context, emitted, false, 'e1');
    const ev = emitted.find(e => e.type === 'circuit_breaker:opened');
    expect((ev!.payload as any)).toHaveProperty('failureCount');
    expect((ev!.payload as any)).toHaveProperty('failureRate');
    expect((ev!.payload as any).window).toBe(5000);
  });

  it('rejects execute when open', () => {
    const { node, config, context, emitted } = setup({ failure_threshold: 1 });
    execute(node, config, context, 'a1');
    resolveLatest(node, config, context, emitted, false, 'e1');
    emitted.length = 0;

    execute(node, config, context, 'a2');

    expect(emitted.some(e => e.type === 'circuit_breaker:rejected')).toBe(true);
    expect(emitted.some(e => e.type === 'a2')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// opening by failure rate threshold
// ---------------------------------------------------------------------------

describe('opens by failure rate threshold', () => {
  it('opens when failure rate >= threshold and min_requests reached', () => {
    const { node, config, context, emitted } = setup({
      failure_threshold: 999, // effectively disable count path
      failure_rate_threshold: 0.5,
      min_requests: 4,
    });

    // Rate check occurs on failure path; make the 4th request a failure.
    // 4 requests: 3 fail, 1 success => rate 0.75 (>= 0.5)
    execute(node, config, context, 'a1');
    resolveLatest(node, config, context, emitted, false, 'e1');
    execute(node, config, context, 'a2');
    resolveLatest(node, config, context, emitted, true);
    execute(node, config, context, 'a3');
    resolveLatest(node, config, context, emitted, false, 'e3');
    execute(node, config, context, 'a4');
    resolveLatest(node, config, context, emitted, false, 'e4');

    expect(node.__circuitBreakerState.state).toBe('open');
  });

  it('does not use rate threshold before min_requests', () => {
    const { node, config, context, emitted } = setup({
      failure_threshold: 999,
      failure_rate_threshold: 0.5,
      min_requests: 10,
    });

    execute(node, config, context, 'a1');
    resolveLatest(node, config, context, emitted, false, 'e1');
    execute(node, config, context, 'a2');
    resolveLatest(node, config, context, emitted, false, 'e2');

    expect(node.__circuitBreakerState.state).toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// open -> half-open -> closed transitions
// ---------------------------------------------------------------------------

describe('state transitions', () => {
  it('auto-transitions open -> half-open after reset_timeout_ms', () => {
    const { node, config, context, emitted } = setup({ failure_threshold: 1, reset_timeout_ms: 1000 });
    execute(node, config, context, 'a1');
    resolveLatest(node, config, context, emitted, false, 'e1');

    vi.advanceTimersByTime(1000);
    circuitBreakerHandler.onUpdate?.(node, config, context, 0.016);

    expect(node.__circuitBreakerState.state).toBe('half-open');
    expect(emitted.some(e => e.type === 'circuit_breaker:half_opened')).toBe(true);
  });

  it('half-open success_threshold successes close the circuit', () => {
    const { node, config, context, emitted } = setup({
      failure_threshold: 1,
      reset_timeout_ms: 1000,
      success_threshold: 2,
    });
    // Open first
    execute(node, config, context, 'a1');
    resolveLatest(node, config, context, emitted, false, 'e1');

    // Move to half-open
    vi.advanceTimersByTime(1000);
    circuitBreakerHandler.onUpdate?.(node, config, context, 0.016);

    // Two successful test requests
    execute(node, config, context, 't1');
    resolveLatest(node, config, context, emitted, true);
    execute(node, config, context, 't2');
    resolveLatest(node, config, context, emitted, true);

    expect(node.__circuitBreakerState.state).toBe('closed');
    expect(emitted.some(e => e.type === 'circuit_breaker:closed')).toBe(true);
  });

  it('half-open failure reopens the circuit', () => {
    const { node, config, context, emitted } = setup({
      failure_threshold: 1,
      reset_timeout_ms: 1000,
      success_threshold: 2,
    });
    execute(node, config, context, 'a1');
    resolveLatest(node, config, context, emitted, false, 'e1');

    vi.advanceTimersByTime(1000);
    circuitBreakerHandler.onUpdate?.(node, config, context, 0.016);

    execute(node, config, context, 't1');
    resolveLatest(node, config, context, emitted, false, 'half-open-fail');

    expect(node.__circuitBreakerState.state).toBe('open');
    expect(emitted.filter(e => e.type === 'circuit_breaker:opened').length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// reset + status + pruning window
// ---------------------------------------------------------------------------

describe('reset/status/window pruning', () => {
  it('reset forces closed and clears requestLog', () => {
    const { node, config, context, emitted } = setup({ failure_threshold: 1 });
    execute(node, config, context, 'a1');
    resolveLatest(node, config, context, emitted, false, 'e1');

    circuitBreakerHandler.onEvent?.(node, config, context, {
      type: 'circuit_breaker:reset',
      payload: {},
    } as any);

    expect(node.__circuitBreakerState.state).toBe('closed');
    expect(node.__circuitBreakerState.requestLog.length).toBe(0);
    expect(emitted.some(e => e.type === 'circuit_breaker:closed')).toBe(true);
  });

  it('get_status emits status with counters and failureRate', () => {
    const { node, config, context, emitted } = setup();
    execute(node, config, context, 'a1');
    resolveLatest(node, config, context, emitted, false, 'e1');
    execute(node, config, context, 'a2');
    resolveLatest(node, config, context, emitted, true);

    circuitBreakerHandler.onEvent?.(node, config, context, {
      type: 'circuit_breaker:get_status',
      payload: {},
    } as any);

    const status = emitted.find(e => e.type === 'circuit_breaker:status');
    expect(status).toBeDefined();
    expect((status!.payload as any)).toHaveProperty('state');
    expect((status!.payload as any)).toHaveProperty('totalRequests');
    expect((status!.payload as any)).toHaveProperty('failureRate');
    expect((status!.payload as any).windowTotal).toBeGreaterThan(0);
  });

  it('onUpdate prunes requestLog entries outside window', () => {
    const { node, config, context, emitted } = setup({ window_ms: 1000, failure_threshold: 999 });

    // old request
    execute(node, config, context, 'a1');
    resolveLatest(node, config, context, emitted, false, 'e1');

    vi.advanceTimersByTime(1500);

    // newer request
    execute(node, config, context, 'a2');
    resolveLatest(node, config, context, emitted, true);

    circuitBreakerHandler.onUpdate?.(node, config, context, 0.016);

    expect(node.__circuitBreakerState.requestLog.length).toBe(1);
  });

  it('onEvent is safe when state missing', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() =>
      circuitBreakerHandler.onEvent?.(node, BASE_CONFIG, context, { type: 'circuit_breaker:get_status' } as any)
    ).not.toThrow();
  });
});
