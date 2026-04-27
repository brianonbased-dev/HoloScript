/**
 * RateLimiterTrait — comprehensive tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rateLimiterHandler, type RateLimiterState } from '../RateLimiterTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RLNode = HSPlusNode & { __rateLimiterState?: RateLimiterState };

function makeNode(): RLNode {
  return {} as RLNode;
}

function makeContext() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const context: TraitContext = {
    emit: (type: string, payload?: unknown) => emitted.push({ type, payload }),
  };
  return { context, emitted };
}

const BASE_CONFIG = {
  ...(rateLimiterHandler.defaultConfig as any),
};

function setup(configOverrides: Record<string, unknown> = {}) {
  const node = makeNode();
  const { context, emitted } = makeContext();
  const config = { ...BASE_CONFIG, ...configOverrides };
  rateLimiterHandler.onAttach?.(node, config, context);
  emitted.length = 0;
  return { node, config, context, emitted };
}

function exec(node: RLNode, config: any, context: TraitContext, action = 'do_work', key?: string, params: Record<string, unknown> = {}) {
  rateLimiterHandler.onEvent?.(node, config, context, {
    type: 'rate_limiter:execute',
    payload: { action, key, params },
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

describe('rateLimiterHandler attach/defaults', () => {
  it('name is rate_limiter', () => {
    expect(rateLimiterHandler.name).toBe('rate_limiter');
  });

  it('default strategy is token_bucket', () => {
    expect(BASE_CONFIG.strategy).toBe('token_bucket');
  });

  it('creates state on attach', () => {
    const { node } = setup();
    expect(node.__rateLimiterState).toBeDefined();
    expect(node.__rateLimiterState?.totalAllowed).toBe(0);
  });

  it('onDetach removes state', () => {
    const { node, config, context } = setup();
    rateLimiterHandler.onDetach?.(node, config, context);
    expect(node.__rateLimiterState).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// token bucket strategy
// ---------------------------------------------------------------------------

describe('token bucket behavior', () => {
  it('allows request when token available', () => {
    const { node, config, context, emitted } = setup({
      strategy: 'token_bucket',
      max_tokens: 2,
      window_ms: 1000,
      refill_rate: 1,
    });

    exec(node, config, context, 'act', 'k1', { x: 1 });

    expect(emitted.some(e => e.type === 'rate_limiter:allowed')).toBe(true);
    expect(emitted.some(e => e.type === 'act')).toBe(true);
    expect(node.__rateLimiterState?.totalAllowed).toBe(1);
  });

  it('forwards action payload with __rateLimitKey', () => {
    const { node, config, context, emitted } = setup({ strategy: 'token_bucket' });
    exec(node, config, context, 'perform', 'tenantA', { foo: 'bar' });
    const ev = emitted.find(e => e.type === 'perform');
    expect((ev?.payload as any).foo).toBe('bar');
    expect((ev?.payload as any).__rateLimitKey).toBe('tenantA');
  });

  it('rejects when tokens exhausted', () => {
    const { node, config, context, emitted } = setup({
      strategy: 'token_bucket',
      max_tokens: 1,
      window_ms: 1000,
      refill_rate: 1,
      max_requests: 1,
    });

    exec(node, config, context, 'a1', 'k1');
    exec(node, config, context, 'a2', 'k1');

    expect(emitted.some(e => e.type === 'rate_limiter:rejected')).toBe(true);
    expect(node.__rateLimiterState?.totalRejected).toBe(1);
  });

  it('onUpdate refills tokens after window', () => {
    const { node, config, context } = setup({
      strategy: 'token_bucket',
      max_tokens: 2,
      window_ms: 1000,
      refill_rate: 1,
    });

    exec(node, config, context, 'a1', 'k1');
    exec(node, config, context, 'a2', 'k1');
    // now 0 tokens
    let bucket = node.__rateLimiterState?.buckets.get('k1');
    expect(bucket?.tokens).toBe(0);

    vi.advanceTimersByTime(1000);
    rateLimiterHandler.onUpdate?.(node, config, context, 0.016);

    bucket = node.__rateLimiterState?.buckets.get('k1');
    expect((bucket?.tokens ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it('refill does not exceed max_tokens', () => {
    const { node, config, context } = setup({
      strategy: 'token_bucket',
      max_tokens: 3,
      window_ms: 1000,
      refill_rate: 10,
    });

    exec(node, config, context, 'a1', 'k1');
    vi.advanceTimersByTime(3000);
    rateLimiterHandler.onUpdate?.(node, config, context, 0.016);

    const bucket = node.__rateLimiterState?.buckets.get('k1');
    expect((bucket?.tokens ?? 0)).toBeLessThanOrEqual(3);
  });

  it('uses default_key when key omitted', () => {
    const { node, config, context } = setup({ strategy: 'token_bucket', default_key: 'global' });
    exec(node, config, context, 'a1');
    expect(node.__rateLimiterState?.buckets.has('global')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sliding window strategy
// ---------------------------------------------------------------------------

describe('sliding window behavior', () => {
  it('allows up to max_requests inside window', () => {
    const { node, config, context, emitted } = setup({
      strategy: 'sliding_window',
      max_requests: 2,
      window_ms: 1000,
    });

    exec(node, config, context, 'a1', 'k1');
    exec(node, config, context, 'a2', 'k1');
    exec(node, config, context, 'a3', 'k1');

    const allowedCount = emitted.filter(e => e.type === 'rate_limiter:allowed').length;
    const rejectedCount = emitted.filter(e => e.type === 'rate_limiter:rejected').length;
    expect(allowedCount).toBe(2);
    expect(rejectedCount).toBe(1);
  });

  it('allows again after window passes and onUpdate pruning', () => {
    const { node, config, context, emitted } = setup({
      strategy: 'sliding_window',
      max_requests: 1,
      window_ms: 1000,
    });

    exec(node, config, context, 'a1', 'k1');
    exec(node, config, context, 'a2', 'k1'); // rejected
    expect(emitted.some(e => e.type === 'rate_limiter:rejected')).toBe(true);

    vi.advanceTimersByTime(1001);
    rateLimiterHandler.onUpdate?.(node, config, context, 0.016);

    emitted.length = 0;
    exec(node, config, context, 'a3', 'k1');
    expect(emitted.some(e => e.type === 'rate_limiter:allowed')).toBe(true);
  });

  it('tracks separate windows per key', () => {
    const { node, config, context, emitted } = setup({
      strategy: 'sliding_window',
      max_requests: 1,
      window_ms: 1000,
    });

    exec(node, config, context, 'a1', 'k1');
    exec(node, config, context, 'b1', 'k2');
    const allowed = emitted.filter(e => e.type === 'rate_limiter:allowed').length;
    expect(allowed).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// reset/status
// ---------------------------------------------------------------------------

describe('reset and status', () => {
  it('reset(key) clears only that key', () => {
    const { node, config, context } = setup({ strategy: 'token_bucket', max_tokens: 1 });
    exec(node, config, context, 'a1', 'k1');
    exec(node, config, context, 'b1', 'k2');

    rateLimiterHandler.onEvent?.(node, config, context, {
      type: 'rate_limiter:reset',
      payload: { key: 'k1' },
    } as any);

    expect(node.__rateLimiterState?.buckets.has('k1')).toBe(false);
    expect(node.__rateLimiterState?.buckets.has('k2')).toBe(true);
  });

  it('reset(all) clears all keys', () => {
    const { node, config, context } = setup({ strategy: 'token_bucket' });
    exec(node, config, context, 'a1', 'k1');
    exec(node, config, context, 'b1', 'k2');

    rateLimiterHandler.onEvent?.(node, config, context, {
      type: 'rate_limiter:reset',
      payload: {},
    } as any);

    expect(node.__rateLimiterState?.buckets.size).toBe(0);
    expect(node.__rateLimiterState?.windows.size).toBe(0);
  });

  it('get_status emits rate_limiter:status for token bucket', () => {
    const { node, config, context, emitted } = setup({ strategy: 'token_bucket', max_tokens: 5 });
    exec(node, config, context, 'a1', 'k1');

    rateLimiterHandler.onEvent?.(node, config, context, {
      type: 'rate_limiter:get_status',
      payload: { key: 'k1' },
    } as any);

    const status = emitted.find(e => e.type === 'rate_limiter:status');
    expect(status).toBeDefined();
    expect((status!.payload as any).strategy).toBe('token_bucket');
    expect((status!.payload as any)).toHaveProperty('remaining');
  });

  it('get_status emits rate_limiter:status for sliding window', () => {
    const { node, config, context, emitted } = setup({ strategy: 'sliding_window', max_requests: 3 });
    exec(node, config, context, 'a1', 'k1');

    rateLimiterHandler.onEvent?.(node, config, context, {
      type: 'rate_limiter:get_status',
      payload: { key: 'k1' },
    } as any);

    const status = emitted.find(e => e.type === 'rate_limiter:status');
    expect((status!.payload as any).strategy).toBe('sliding_window');
    expect((status!.payload as any).remaining).toBe(2);
  });

  it('onEvent safe when state missing', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() =>
      rateLimiterHandler.onEvent?.(node, BASE_CONFIG, context, {
        type: 'rate_limiter:get_status',
        payload: {},
      } as any)
    ).not.toThrow();
  });

  it('execute without action is ignored', () => {
    const { node, config, context, emitted } = setup();
    rateLimiterHandler.onEvent?.(node, config, context, {
      type: 'rate_limiter:execute',
      payload: { key: 'k1' },
    } as any);
    expect(emitted.length).toBe(0);
  });

  it('onUpdate safe when state missing', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() => rateLimiterHandler.onUpdate?.(node, BASE_CONFIG, context, 0.016)).not.toThrow();
  });
}
);