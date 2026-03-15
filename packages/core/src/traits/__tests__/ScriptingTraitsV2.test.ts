/**
 * ScriptingTraitsV2.test.ts — v5.1
 * Tests for the 7 new Scripting & Automation traits:
 *   SchedulerTrait, CircuitBreakerTrait, RateLimiterTrait,
 *   TimeoutGuardTrait, TransformTrait, BufferTrait, StructuredLoggerTrait
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { schedulerHandler } from '../SchedulerTrait';
import type { SchedulerConfig } from '../SchedulerTrait';

import { circuitBreakerHandler } from '../CircuitBreakerTrait';
import type { CircuitBreakerConfig } from '../CircuitBreakerTrait';

import { rateLimiterHandler } from '../RateLimiterTrait';
import type { RateLimiterConfig } from '../RateLimiterTrait';

import { timeoutGuardHandler } from '../TimeoutGuardTrait';
import type { TimeoutGuardConfig } from '../TimeoutGuardTrait';

import { transformHandler } from '../TransformTrait';
import type { TransformConfig } from '../TransformTrait';

import { bufferHandler } from '../BufferTrait';
import type { BufferConfig } from '../BufferTrait';

import { structuredLoggerHandler } from '../StructuredLoggerTrait';
import type { StructuredLoggerConfig } from '../StructuredLoggerTrait';

// =============================================================================
// SHARED HELPERS
// =============================================================================

function makeCtx() {
  const events: { type: string; payload: unknown }[] = [];
  return {
    emit: (type: string, payload: unknown) => events.push({ type, payload }),
    events,
    of: (type: string) => events.filter((e) => e.type === type),
    last: () => events[events.length - 1],
  };
}

// =============================================================================
// SchedulerTrait
// =============================================================================

describe('SchedulerTrait', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function attach(extra: Partial<SchedulerConfig> = {}) {
    const node = {} as any;
    const ctx = makeCtx();
    const config: SchedulerConfig = { jobs: [], max_jobs: 50, poll_interval_ms: 1000, ...extra };
    schedulerHandler.onAttach!(node, config, ctx);
    return { node, ctx, config };
  }

  it('initializes empty state', () => {
    const { node } = attach();
    expect(node.__schedulerState.jobs.size).toBe(0);
    expect(node.__schedulerState.totalTriggered).toBe(0);
  });

  it('adds a job via event', () => {
    const { node, ctx, config } = attach();
    schedulerHandler.onEvent!(node, config, ctx, {
      type: 'scheduler:add_job',
      payload: { id: 'j1', action: 'do_work', interval_ms: 500, mode: 'repeat' },
    });
    expect(ctx.of('scheduler:job_added').length).toBe(1);
    expect(node.__schedulerState.jobs.size).toBe(1);
  });

  it('triggers job after interval', () => {
    const { node, ctx, config } = attach();
    schedulerHandler.onEvent!(node, config, ctx, {
      type: 'scheduler:add_job',
      payload: { id: 'j1', action: 'tick_action', interval_ms: 100, mode: 'repeat' },
    });
    vi.advanceTimersByTime(100);
    expect(ctx.of('scheduler:job_triggered').length).toBe(1);
    expect(ctx.of('tick_action').length).toBe(1);
  });

  it('removes a job', () => {
    const { node, ctx, config } = attach();
    schedulerHandler.onEvent!(node, config, ctx, {
      type: 'scheduler:add_job',
      payload: { id: 'j1', action: 'x', interval_ms: 100, mode: 'repeat' },
    });
    schedulerHandler.onEvent!(node, config, ctx, {
      type: 'scheduler:remove_job',
      payload: { jobId: 'j1' },
    });
    expect(ctx.of('scheduler:job_removed').length).toBe(1);
    expect(node.__schedulerState.jobs.size).toBe(0);
  });

  it('pauses and resumes a job', () => {
    const { node, ctx, config } = attach();
    schedulerHandler.onEvent!(node, config, ctx, {
      type: 'scheduler:add_job',
      payload: { id: 'j1', action: 'x', interval_ms: 100, mode: 'repeat' },
    });
    schedulerHandler.onEvent!(node, config, ctx, {
      type: 'scheduler:pause_job', payload: { jobId: 'j1' },
    });
    expect(ctx.of('scheduler:job_paused').length).toBe(1);

    vi.advanceTimersByTime(200);
    expect(ctx.of('scheduler:job_triggered').length).toBe(0);

    schedulerHandler.onEvent!(node, config, ctx, {
      type: 'scheduler:resume_job', payload: { jobId: 'j1' },
    });
    expect(ctx.of('scheduler:job_resumed').length).toBe(1);
  });

  it('enforces max_jobs limit', () => {
    const { node, ctx, config } = attach({ max_jobs: 2 });
    for (let i = 0; i < 3; i++) {
      schedulerHandler.onEvent!(node, config, ctx, {
        type: 'scheduler:add_job',
        payload: { id: `j${i}`, action: 'x', interval_ms: 100, mode: 'repeat' },
      });
    }
    expect(node.__schedulerState.jobs.size).toBe(2);
    expect(ctx.of('scheduler:job_error').length).toBe(1);
  });

  it('one-shot job auto-removes after execution', () => {
    const { node, ctx, config } = attach();
    schedulerHandler.onEvent!(node, config, ctx, {
      type: 'scheduler:add_job',
      payload: { id: 'once', action: 'run_once', interval_ms: 50, mode: 'once' },
    });
    vi.advanceTimersByTime(50);
    expect(ctx.of('run_once').length).toBe(1);
    expect(node.__schedulerState.jobs.has('once')).toBe(false);
  });

  it('pre-configured jobs register on attach', () => {
    const { node, ctx } = attach({
      jobs: [{ id: 'pre', interval_ms: 100, action: 'x', params: {}, mode: 'repeat', max_executions: 0, paused: false }],
    });
    expect(node.__schedulerState.jobs.size).toBe(1);
    expect(ctx.of('scheduler:job_added').length).toBe(1);
  });

  it('cleans up timers on detach', () => {
    const { node, ctx, config } = attach();
    schedulerHandler.onEvent!(node, config, ctx, {
      type: 'scheduler:add_job',
      payload: { id: 'j1', action: 'x', interval_ms: 100, mode: 'repeat' },
    });
    schedulerHandler.onDetach!(node, config, ctx);
    expect(node.__schedulerState).toBeUndefined();
  });

  it('reports status', () => {
    const { node, ctx, config } = attach();
    schedulerHandler.onEvent!(node, config, ctx, {
      type: 'scheduler:add_job',
      payload: { id: 'j1', action: 'x', interval_ms: 100, mode: 'repeat' },
    });
    schedulerHandler.onEvent!(node, config, ctx, { type: 'scheduler:get_status', payload: {} });
    const status = ctx.of('scheduler:status')[0].payload as any;
    expect(status.jobCount).toBe(1);
  });
});

// =============================================================================
// CircuitBreakerTrait
// =============================================================================

describe('CircuitBreakerTrait', () => {
  function attach(extra: Partial<CircuitBreakerConfig> = {}) {
    const node = {} as any;
    const ctx = makeCtx();
    const config: CircuitBreakerConfig = {
      failure_threshold: 3,
      window_ms: 60000,
      reset_timeout_ms: 5000,
      success_threshold: 2,
      failure_rate_threshold: 0,
      min_requests: 10,
      ...extra,
    };
    circuitBreakerHandler.onAttach!(node, config, ctx);
    return { node, ctx, config };
  }

  it('starts in closed state', () => {
    const { node } = attach();
    expect(node.__circuitBreakerState.state).toBe('closed');
  });

  it('forwards action when closed', () => {
    const { node, ctx, config } = attach();
    circuitBreakerHandler.onEvent!(node, config, ctx, {
      type: 'circuit_breaker:execute',
      payload: { action: 'call_api', params: { url: '/test' } },
    });
    expect(ctx.of('call_api').length).toBe(1);
  });

  it('opens after failure threshold', () => {
    const { node, ctx, config } = attach({ failure_threshold: 2 });

    for (let i = 0; i < 2; i++) {
      circuitBreakerHandler.onEvent!(node, config, ctx, {
        type: 'circuit_breaker:execute',
        payload: { action: 'api', params: {} },
      });
      const cbId = (ctx.of('api')[i].payload as any).__circuitBreakerId;
      circuitBreakerHandler.onEvent!(node, config, ctx, {
        type: 'circuit_breaker:result',
        payload: { cbId, success: false, error: 'fail' },
      });
    }

    expect(ctx.of('circuit_breaker:opened').length).toBe(1);
    expect(node.__circuitBreakerState.state).toBe('open');
  });

  it('rejects actions when open', () => {
    const { node, ctx, config } = attach({ failure_threshold: 1 });
    circuitBreakerHandler.onEvent!(node, config, ctx, {
      type: 'circuit_breaker:execute',
      payload: { action: 'api', params: {} },
    });
    const cbId = (ctx.of('api')[0].payload as any).__circuitBreakerId;
    circuitBreakerHandler.onEvent!(node, config, ctx, {
      type: 'circuit_breaker:result',
      payload: { cbId, success: false },
    });

    circuitBreakerHandler.onEvent!(node, config, ctx, {
      type: 'circuit_breaker:execute',
      payload: { action: 'api2', params: {} },
    });
    expect(ctx.of('circuit_breaker:rejected').length).toBe(1);
    expect(ctx.of('api2').length).toBe(0);
  });

  it('closes after success threshold in half-open', () => {
    const { node, ctx, config } = attach({
      failure_threshold: 1,
      reset_timeout_ms: 100,
      success_threshold: 1,
    });

    // Trigger open
    circuitBreakerHandler.onEvent!(node, config, ctx, {
      type: 'circuit_breaker:execute',
      payload: { action: 'a', params: {} },
    });
    const cbId1 = (ctx.of('a')[0].payload as any).__circuitBreakerId;
    circuitBreakerHandler.onEvent!(node, config, ctx, {
      type: 'circuit_breaker:result',
      payload: { cbId: cbId1, success: false },
    });
    expect(node.__circuitBreakerState.state).toBe('open');

    // Force half-open transition
    node.__circuitBreakerState.openedAt = Date.now() - 200;
    circuitBreakerHandler.onUpdate!(node, config, ctx, 0.1);
    expect(node.__circuitBreakerState.state).toBe('half-open');

    // Succeed in half-open
    circuitBreakerHandler.onEvent!(node, config, ctx, {
      type: 'circuit_breaker:execute',
      payload: { action: 'a2', params: {} },
    });
    const cbId2 = (ctx.of('a2')[0].payload as any).__circuitBreakerId;
    circuitBreakerHandler.onEvent!(node, config, ctx, {
      type: 'circuit_breaker:result',
      payload: { cbId: cbId2, success: true },
    });
    expect(node.__circuitBreakerState.state).toBe('closed');
    expect(ctx.of('circuit_breaker:closed').length).toBe(1);
  });

  it('resets on command', () => {
    const { node, ctx, config } = attach({ failure_threshold: 1 });
    circuitBreakerHandler.onEvent!(node, config, ctx, {
      type: 'circuit_breaker:execute',
      payload: { action: 'a', params: {} },
    });
    const cbId = (ctx.of('a')[0].payload as any).__circuitBreakerId;
    circuitBreakerHandler.onEvent!(node, config, ctx, {
      type: 'circuit_breaker:result', payload: { cbId, success: false },
    });
    expect(node.__circuitBreakerState.state).toBe('open');

    circuitBreakerHandler.onEvent!(node, config, ctx, { type: 'circuit_breaker:reset', payload: {} });
    expect(node.__circuitBreakerState.state).toBe('closed');
  });

  it('reports status', () => {
    const { node, ctx, config } = attach();
    circuitBreakerHandler.onEvent!(node, config, ctx, { type: 'circuit_breaker:get_status', payload: {} });
    const status = ctx.of('circuit_breaker:status')[0].payload as any;
    expect(status.state).toBe('closed');
    expect(status.totalRequests).toBe(0);
  });
});

// =============================================================================
// RateLimiterTrait
// =============================================================================

describe('RateLimiterTrait', () => {
  function attach(extra: Partial<RateLimiterConfig> = {}) {
    const node = {} as any;
    const ctx = makeCtx();
    const config: RateLimiterConfig = {
      strategy: 'token_bucket',
      max_requests: 100,
      window_ms: 60000,
      refill_rate: 10,
      max_tokens: 5,
      default_key: 'default',
      ...extra,
    };
    rateLimiterHandler.onAttach!(node, config, ctx);
    return { node, ctx, config };
  }

  it('initializes empty state', () => {
    const { node } = attach();
    expect(node.__rateLimiterState.totalAllowed).toBe(0);
    expect(node.__rateLimiterState.totalRejected).toBe(0);
  });

  it('allows requests within token bucket limit', () => {
    const { node, ctx, config } = attach({ max_tokens: 3 });
    for (let i = 0; i < 3; i++) {
      rateLimiterHandler.onEvent!(node, config, ctx, {
        type: 'rate_limiter:execute',
        payload: { action: 'api_call', params: {} },
      });
    }
    expect(ctx.of('rate_limiter:allowed').length).toBe(3);
    expect(ctx.of('api_call').length).toBe(3);
  });

  it('rejects requests exceeding token bucket', () => {
    const { node, ctx, config } = attach({ max_tokens: 2 });
    for (let i = 0; i < 3; i++) {
      rateLimiterHandler.onEvent!(node, config, ctx, {
        type: 'rate_limiter:execute',
        payload: { action: 'api_call', params: {} },
      });
    }
    expect(ctx.of('rate_limiter:allowed').length).toBe(2);
    expect(ctx.of('rate_limiter:rejected').length).toBe(1);
    expect(ctx.of('api_call').length).toBe(2);
  });

  it('sliding window allows within limit', () => {
    const { node, ctx, config } = attach({
      strategy: 'sliding_window',
      max_requests: 3,
      window_ms: 1000,
    });
    for (let i = 0; i < 4; i++) {
      rateLimiterHandler.onEvent!(node, config, ctx, {
        type: 'rate_limiter:execute',
        payload: { action: 'api', params: {} },
      });
    }
    expect(ctx.of('rate_limiter:allowed').length).toBe(3);
    expect(ctx.of('rate_limiter:rejected').length).toBe(1);
  });

  it('supports per-key limits', () => {
    const { node, ctx, config } = attach({ max_tokens: 1 });
    rateLimiterHandler.onEvent!(node, config, ctx, {
      type: 'rate_limiter:execute',
      payload: { action: 'a', key: 'user1', params: {} },
    });
    rateLimiterHandler.onEvent!(node, config, ctx, {
      type: 'rate_limiter:execute',
      payload: { action: 'a', key: 'user2', params: {} },
    });
    expect(ctx.of('rate_limiter:allowed').length).toBe(2);
  });

  it('resets a specific key', () => {
    const { node, ctx, config } = attach({ max_tokens: 1 });
    rateLimiterHandler.onEvent!(node, config, ctx, {
      type: 'rate_limiter:execute',
      payload: { action: 'a', params: {} },
    });
    rateLimiterHandler.onEvent!(node, config, ctx, {
      type: 'rate_limiter:reset', payload: { key: 'default' },
    });
    rateLimiterHandler.onEvent!(node, config, ctx, {
      type: 'rate_limiter:execute',
      payload: { action: 'a', params: {} },
    });
    expect(ctx.of('rate_limiter:allowed').length).toBe(2);
  });

  it('reports status', () => {
    const { node, ctx, config } = attach();
    rateLimiterHandler.onEvent!(node, config, ctx, { type: 'rate_limiter:get_status', payload: {} });
    const status = ctx.of('rate_limiter:status')[0].payload as any;
    expect(status.strategy).toBe('token_bucket');
  });
});

// =============================================================================
// TimeoutGuardTrait
// =============================================================================

describe('TimeoutGuardTrait', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function attach(extra: Partial<TimeoutGuardConfig> = {}) {
    const node = {} as any;
    const ctx = makeCtx();
    const config: TimeoutGuardConfig = {
      default_timeout_ms: 1000,
      default_fallback_action: '',
      max_concurrent: 20,
      ...extra,
    };
    timeoutGuardHandler.onAttach!(node, config, ctx);
    return { node, ctx, config };
  }

  it('initializes empty state', () => {
    const { node } = attach();
    expect(node.__timeoutGuardState.totalStarted).toBe(0);
  });

  it('forwards action and tracks it', () => {
    const { node, ctx, config } = attach();
    timeoutGuardHandler.onEvent!(node, config, ctx, {
      type: 'timeout_guard:execute',
      payload: { action: 'slow_api', params: { q: 1 } },
    });
    expect(ctx.of('timeout_guard:started').length).toBe(1);
    expect(ctx.of('slow_api').length).toBe(1);
    expect(node.__timeoutGuardState.operations.size).toBe(1);
  });

  it('completes on result', () => {
    const { node, ctx, config } = attach();
    timeoutGuardHandler.onEvent!(node, config, ctx, {
      type: 'timeout_guard:execute',
      payload: { action: 'api', params: {} },
    });
    const guardId = (ctx.of('api')[0].payload as any).__timeoutGuardId;
    timeoutGuardHandler.onEvent!(node, config, ctx, {
      type: 'timeout_guard:result', payload: { guardId },
    });
    expect(ctx.of('timeout_guard:completed').length).toBe(1);
    expect(node.__timeoutGuardState.operations.size).toBe(0);
  });

  it('fires timeout when no result arrives', () => {
    const { node, ctx, config } = attach({ default_timeout_ms: 500 });
    timeoutGuardHandler.onEvent!(node, config, ctx, {
      type: 'timeout_guard:execute',
      payload: { action: 'slow', params: {} },
    });
    vi.advanceTimersByTime(500);
    expect(ctx.of('timeout_guard:timed_out').length).toBe(1);
    expect(node.__timeoutGuardState.totalTimedOut).toBe(1);
  });

  it('fires fallback action on timeout', () => {
    const { node, ctx, config } = attach({
      default_timeout_ms: 200,
      default_fallback_action: 'use_cache',
    });
    timeoutGuardHandler.onEvent!(node, config, ctx, {
      type: 'timeout_guard:execute',
      payload: { action: 'slow', params: {} },
    });
    vi.advanceTimersByTime(200);
    expect(ctx.of('timeout_guard:fallback').length).toBe(1);
    expect(ctx.of('use_cache').length).toBe(1);
  });

  it('cancels a pending guard', () => {
    const { node, ctx, config } = attach();
    timeoutGuardHandler.onEvent!(node, config, ctx, {
      type: 'timeout_guard:execute',
      payload: { action: 'api', params: {} },
    });
    const guardId = (ctx.of('api')[0].payload as any).__timeoutGuardId;
    timeoutGuardHandler.onEvent!(node, config, ctx, {
      type: 'timeout_guard:cancel', payload: { guardId },
    });
    expect(node.__timeoutGuardState.operations.size).toBe(0);
  });

  it('cleans up on detach', () => {
    const { node, ctx, config } = attach();
    timeoutGuardHandler.onEvent!(node, config, ctx, {
      type: 'timeout_guard:execute',
      payload: { action: 'x', params: {} },
    });
    timeoutGuardHandler.onDetach!(node, config, ctx);
    expect(node.__timeoutGuardState).toBeUndefined();
  });

  it('reports status', () => {
    const { node, ctx, config } = attach();
    timeoutGuardHandler.onEvent!(node, config, ctx, { type: 'timeout_guard:get_status', payload: {} });
    const status = ctx.of('timeout_guard:status')[0].payload as any;
    expect(status.active).toBe(0);
  });
});

// =============================================================================
// TransformTrait
// =============================================================================

describe('TransformTrait', () => {
  function attach(extra: Partial<TransformConfig> = {}) {
    const node = {} as any;
    const ctx = makeCtx();
    const config: TransformConfig = { rules: [], ...extra };
    transformHandler.onAttach!(node, config, ctx);
    return { node, ctx, config };
  }

  it('initializes empty state', () => {
    const { node } = attach();
    expect(node.__transformState.totalProcessed).toBe(0);
  });

  it('applies pick transform', () => {
    const { node, ctx, config } = attach({
      rules: [{
        id: 'r1', source_event: 'raw_data', output_event: 'clean_data', enabled: true,
        ops: [{ type: 'pick', fields: ['name', 'score'] }],
      }],
    });
    transformHandler.onEvent!(node, config, ctx, {
      type: 'raw_data', payload: { name: 'Alice', score: 95, extra: 'removed' },
    });
    const output = ctx.of('clean_data')[0].payload as any;
    expect(output.name).toBe('Alice');
    expect(output.score).toBe(95);
    expect(output.extra).toBeUndefined();
  });

  it('applies omit transform', () => {
    const { node, ctx, config } = attach({
      rules: [{
        id: 'r1', source_event: 'data', output_event: 'clean', enabled: true,
        ops: [{ type: 'omit', fields: ['password'] }],
      }],
    });
    transformHandler.onEvent!(node, config, ctx, {
      type: 'data', payload: { user: 'Bob', password: 'secret' },
    });
    const output = ctx.of('clean')[0].payload as any;
    expect(output.user).toBe('Bob');
    expect(output.password).toBeUndefined();
  });

  it('applies rename transform', () => {
    const { node, ctx, config } = attach({
      rules: [{
        id: 'r1', source_event: 'in', output_event: 'out', enabled: true,
        ops: [{ type: 'rename', from: 'old_name', to: 'new_name' }],
      }],
    });
    transformHandler.onEvent!(node, config, ctx, {
      type: 'in', payload: { old_name: 'value' },
    });
    const output = ctx.of('out')[0].payload as any;
    expect(output.new_name).toBe('value');
    expect(output.old_name).toBeUndefined();
  });

  it('applies filter transform — passes', () => {
    const { node, ctx, config } = attach({
      rules: [{
        id: 'r1', source_event: 'metric', output_event: 'high_metric', enabled: true,
        ops: [{ type: 'filter', field: 'value', op: 'gt', value: 50 }],
      }],
    });
    transformHandler.onEvent!(node, config, ctx, {
      type: 'metric', payload: { value: 75 },
    });
    expect(ctx.of('high_metric').length).toBe(1);
  });

  it('applies filter transform — rejects', () => {
    const { node, ctx, config } = attach({
      rules: [{
        id: 'r1', source_event: 'metric', output_event: 'high_metric', enabled: true,
        ops: [{ type: 'filter', field: 'value', op: 'gt', value: 50 }],
      }],
    });
    transformHandler.onEvent!(node, config, ctx, {
      type: 'metric', payload: { value: 20 },
    });
    expect(ctx.of('high_metric').length).toBe(0);
    expect(ctx.of('transform:filtered').length).toBe(1);
  });

  it('applies default transform', () => {
    const { node, ctx, config } = attach({
      rules: [{
        id: 'r1', source_event: 'in', output_event: 'out', enabled: true,
        ops: [{ type: 'default', field: 'status', value: 'pending' }],
      }],
    });
    transformHandler.onEvent!(node, config, ctx, {
      type: 'in', payload: { name: 'test' },
    });
    const output = ctx.of('out')[0].payload as any;
    expect(output.status).toBe('pending');
    expect(output.name).toBe('test');
  });

  it('chains multiple transforms', () => {
    const { node, ctx, config } = attach({
      rules: [{
        id: 'r1', source_event: 'raw', output_event: 'processed', enabled: true,
        ops: [
          { type: 'pick', fields: ['name', 'score'] },
          { type: 'rename', from: 'score', to: 'points' },
          { type: 'default', field: 'rank', value: 'unranked' },
        ],
      }],
    });
    transformHandler.onEvent!(node, config, ctx, {
      type: 'raw', payload: { name: 'Alice', score: 95, extra: 'x' },
    });
    const output = ctx.of('processed')[0].payload as any;
    expect(output.name).toBe('Alice');
    expect(output.points).toBe(95);
    expect(output.rank).toBe('unranked');
    expect(output.extra).toBeUndefined();
    expect(output.score).toBeUndefined();
  });

  it('skips disabled rules', () => {
    const { node, ctx, config } = attach({
      rules: [{
        id: 'r1', source_event: 'in', output_event: 'out', enabled: false,
        ops: [{ type: 'pick', fields: ['x'] }],
      }],
    });
    transformHandler.onEvent!(node, config, ctx, { type: 'in', payload: { x: 1 } });
    expect(ctx.of('out').length).toBe(0);
  });

  it('adds and removes rules dynamically', () => {
    const { node, ctx, config } = attach();
    transformHandler.onEvent!(node, config, ctx, {
      type: 'transform:add_rule',
      payload: {
        id: 'dyn1', source_event: 'a', output_event: 'b', enabled: true,
        ops: [{ type: 'pick', fields: ['x'] }],
      },
    });
    expect(node.__transformState.rules.size).toBe(1);

    transformHandler.onEvent!(node, config, ctx, {
      type: 'transform:remove_rule', payload: { id: 'dyn1' },
    });
    expect(node.__transformState.rules.size).toBe(0);
  });

  it('reports status', () => {
    const { node, ctx, config } = attach({
      rules: [{ id: 'r1', source_event: 'a', output_event: 'b', enabled: true, ops: [] }],
    });
    transformHandler.onEvent!(node, config, ctx, { type: 'transform:get_status', payload: {} });
    const status = ctx.of('transform:status')[0].payload as any;
    expect(status.ruleCount).toBe(1);
  });
});

// =============================================================================
// BufferTrait
// =============================================================================

describe('BufferTrait', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function attach(extra: Partial<BufferConfig> = {}) {
    const node = {} as any;
    const ctx = makeCtx();
    const config: BufferConfig = { channels: [], ...extra };
    bufferHandler.onAttach!(node, config, ctx);
    return { node, ctx, config };
  }

  it('initializes empty state', () => {
    const { node } = attach();
    expect(node.__bufferState.totalFlushed).toBe(0);
  });

  it('buffers events and flushes by count', () => {
    const { node, ctx, config } = attach({
      channels: [{
        id: 'ch1', source_event: 'tick', output_event: 'batch', max_count: 3,
        max_wait_ms: 0, max_size: 100, enabled: true,
      }],
    });

    for (let i = 0; i < 3; i++) {
      bufferHandler.onEvent!(node, config, ctx, {
        type: 'tick', payload: { value: i },
      });
    }

    expect(ctx.of('batch').length).toBe(1);
    const batch = ctx.of('batch')[0].payload as any;
    expect(batch.count).toBe(3);
    expect(batch.items.length).toBe(3);
  });

  it('flushes by time window', () => {
    const { node, ctx, config } = attach({
      channels: [{
        id: 'ch1', source_event: 'event', output_event: 'batch', max_count: 100,
        max_wait_ms: 200, max_size: 100, enabled: true,
      }],
    });

    bufferHandler.onEvent!(node, config, ctx, { type: 'event', payload: { v: 1 } });
    expect(ctx.of('batch').length).toBe(0);

    vi.advanceTimersByTime(200);
    expect(ctx.of('batch').length).toBe(1);
    const batch = ctx.of('batch')[0].payload as any;
    expect(batch.count).toBe(1);
  });

  it('drops oldest on overflow', () => {
    const { node, ctx, config } = attach({
      channels: [{
        id: 'ch1', source_event: 'e', output_event: 'b', max_count: 100,
        max_wait_ms: 0, max_size: 2, enabled: true,
      }],
    });

    for (let i = 0; i < 3; i++) {
      bufferHandler.onEvent!(node, config, ctx, { type: 'e', payload: { v: i } });
    }
    expect(ctx.of('buffer:overflow').length).toBe(1);
  });

  it('force flushes a channel', () => {
    const { node, ctx, config } = attach({
      channels: [{
        id: 'ch1', source_event: 'e', output_event: 'b', max_count: 100,
        max_wait_ms: 0, max_size: 100, enabled: true,
      }],
    });

    bufferHandler.onEvent!(node, config, ctx, { type: 'e', payload: { v: 1 } });
    bufferHandler.onEvent!(node, config, ctx, {
      type: 'buffer:force_flush', payload: { id: 'ch1' },
    });
    expect(ctx.of('buffer:flush').length).toBe(1);
  });

  it('adds and removes channels dynamically', () => {
    const { node, ctx, config } = attach();
    bufferHandler.onEvent!(node, config, ctx, {
      type: 'buffer:add_channel',
      payload: {
        id: 'dyn', source_event: 'x', output_event: 'y', max_count: 5,
        max_wait_ms: 0, max_size: 50, enabled: true,
      },
    });
    expect(node.__bufferState.channels.size).toBe(1);

    bufferHandler.onEvent!(node, config, ctx, {
      type: 'buffer:remove_channel', payload: { id: 'dyn' },
    });
    expect(node.__bufferState.channels.size).toBe(0);
  });

  it('skips disabled channels', () => {
    const { node, ctx, config } = attach({
      channels: [{
        id: 'ch1', source_event: 'e', output_event: 'b', max_count: 1,
        max_wait_ms: 0, max_size: 100, enabled: false,
      }],
    });
    bufferHandler.onEvent!(node, config, ctx, { type: 'e', payload: {} });
    expect(ctx.of('b').length).toBe(0);
  });

  it('reports status', () => {
    const { node, ctx, config } = attach({
      channels: [{
        id: 'ch1', source_event: 'e', output_event: 'b', max_count: 10,
        max_wait_ms: 0, max_size: 100, enabled: true,
      }],
    });
    bufferHandler.onEvent!(node, config, ctx, { type: 'buffer:get_status', payload: {} });
    const status = ctx.of('buffer:status')[0].payload as any;
    expect(status.channelCount).toBe(1);
  });
});

// =============================================================================
// StructuredLoggerTrait
// =============================================================================

describe('StructuredLoggerTrait', () => {
  function attach(extra: Partial<StructuredLoggerConfig> = {}) {
    const node = {} as any;
    const ctx = makeCtx();
    const config: StructuredLoggerConfig = {
      min_level: 'debug',
      max_entries: 100,
      rotation_count: 20,
      emit_events: true,
      console_output: false,
      default_fields: {},
      ...extra,
    };
    structuredLoggerHandler.onAttach!(node, config, ctx);
    return { node, ctx, config };
  }

  it('initializes empty state', () => {
    const { node } = attach();
    expect(node.__structuredLoggerState.totalLogged).toBe(0);
    expect(node.__structuredLoggerState.entries.length).toBe(0);
  });

  it('logs info-level entry', () => {
    const { node, ctx, config } = attach();
    structuredLoggerHandler.onEvent!(node, config, ctx, {
      type: 'logger:info',
      payload: { message: 'Hello world', fields: { component: 'test' } },
    });
    expect(ctx.of('logger:entry').length).toBe(1);
    const entry = ctx.of('logger:entry')[0].payload as any;
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('Hello world');
    expect(entry.fields.component).toBe('test');
    expect(node.__structuredLoggerState.counts.info).toBe(1);
  });

  it('logs all levels', () => {
    const { node, ctx, config } = attach();
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      structuredLoggerHandler.onEvent!(node, config, ctx, {
        type: `logger:${level}`,
        payload: { message: `${level} msg` },
      });
    }
    expect(node.__structuredLoggerState.totalLogged).toBe(4);
    expect(ctx.of('logger:entry').length).toBe(4);
  });

  it('respects min_level filter', () => {
    const { node, ctx, config } = attach({ min_level: 'warn' });
    structuredLoggerHandler.onEvent!(node, config, ctx, {
      type: 'logger:debug', payload: { message: 'too low' },
    });
    structuredLoggerHandler.onEvent!(node, config, ctx, {
      type: 'logger:info', payload: { message: 'too low' },
    });
    structuredLoggerHandler.onEvent!(node, config, ctx, {
      type: 'logger:warn', payload: { message: 'passes' },
    });
    expect(node.__structuredLoggerState.totalLogged).toBe(1);
    expect(ctx.of('logger:entry').length).toBe(1);
  });

  it('rotates old entries', () => {
    const { node, ctx, config } = attach({ max_entries: 5, rotation_count: 3 });
    for (let i = 0; i < 6; i++) {
      structuredLoggerHandler.onEvent!(node, config, ctx, {
        type: 'logger:info', payload: { message: `log ${i}` },
      });
    }
    expect(ctx.of('logger:rotated').length).toBe(1);
    expect(node.__structuredLoggerState.entries.length).toBeLessThanOrEqual(5);
  });

  it('retrieves logs with pagination', () => {
    const { node, ctx, config } = attach();
    for (let i = 0; i < 5; i++) {
      structuredLoggerHandler.onEvent!(node, config, ctx, {
        type: 'logger:info', payload: { message: `msg ${i}` },
      });
    }
    structuredLoggerHandler.onEvent!(node, config, ctx, {
      type: 'logger:get_logs', payload: { limit: 2, offset: 1 },
    });
    const result = ctx.of('logger:logs')[0].payload as any;
    expect(result.entries.length).toBe(2);
    expect(result.total).toBe(5);
    expect(result.offset).toBe(1);
  });

  it('filters logs by level on retrieval', () => {
    const { node, ctx, config } = attach();
    structuredLoggerHandler.onEvent!(node, config, ctx, {
      type: 'logger:info', payload: { message: 'info msg' },
    });
    structuredLoggerHandler.onEvent!(node, config, ctx, {
      type: 'logger:error', payload: { message: 'err msg' },
    });
    structuredLoggerHandler.onEvent!(node, config, ctx, {
      type: 'logger:get_logs', payload: { level: 'error' },
    });
    const result = ctx.of('logger:logs')[0].payload as any;
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].level).toBe('error');
  });

  it('clears all logs', () => {
    const { node, ctx, config } = attach();
    structuredLoggerHandler.onEvent!(node, config, ctx, {
      type: 'logger:info', payload: { message: 'x' },
    });
    structuredLoggerHandler.onEvent!(node, config, ctx, {
      type: 'logger:clear', payload: {},
    });
    expect(node.__structuredLoggerState.entries.length).toBe(0);
  });

  it('adds default fields to every entry', () => {
    const { node, ctx, config } = attach({
      default_fields: { service: 'daemon', version: '1.0' },
    });
    structuredLoggerHandler.onEvent!(node, config, ctx, {
      type: 'logger:info', payload: { message: 'test' },
    });
    const entry = ctx.of('logger:entry')[0].payload as any;
    expect(entry.fields.service).toBe('daemon');
    expect(entry.fields.version).toBe('1.0');
  });

  it('logs via generic logger:log with explicit level', () => {
    const { node, ctx, config } = attach();
    structuredLoggerHandler.onEvent!(node, config, ctx, {
      type: 'logger:log',
      payload: { level: 'warn', message: 'custom level' },
    });
    const entry = ctx.of('logger:entry')[0].payload as any;
    expect(entry.level).toBe('warn');
  });

  it('reports status', () => {
    const { node, ctx, config } = attach();
    structuredLoggerHandler.onEvent!(node, config, ctx, { type: 'logger:get_status', payload: {} });
    const status = ctx.of('logger:status')[0].payload as any;
    expect(status.entryCount).toBe(0);
    expect(status.minLevel).toBe('debug');
  });
});
