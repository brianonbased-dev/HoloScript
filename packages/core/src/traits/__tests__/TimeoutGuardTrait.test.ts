import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { timeoutGuardHandler } from '../TimeoutGuardTrait';

function makeNode() {
  return {
    id: 'n1',
    traits: new Set(),
    emit: vi.fn(),
  } as any;
}

describe('timeoutGuardHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('has name timeout_guard', () => {
    expect(timeoutGuardHandler.name).toBe('timeout_guard');
  });

  it('has defaultConfig', () => {
    expect(timeoutGuardHandler.defaultConfig).toMatchObject({
      default_timeout_ms: 30000,
      default_fallback_action: '',
      max_concurrent: 20,
    });
  });

  it('onAttach sets __timeoutGuardState with empty operations', () => {
    const node = makeNode();
    const cfg = timeoutGuardHandler.defaultConfig!;
    timeoutGuardHandler.onAttach!(node, cfg, { emit: vi.fn() } as any);
    const state = node.__timeoutGuardState;
    expect(state).toBeDefined();
    expect(state.operations).toBeInstanceOf(Map);
    expect(state.totalStarted).toBe(0);
    expect(state.totalCompleted).toBe(0);
    expect(state.totalTimedOut).toBe(0);
    expect(state.guardCounter).toBe(0);
  });

  it('timeout_guard:execute creates a guarded operation', () => {
    const node = makeNode();
    const ctx = { emit: vi.fn() };
    const cfg = timeoutGuardHandler.defaultConfig!;
    timeoutGuardHandler.onAttach!(node, cfg, ctx as any);

    timeoutGuardHandler.onEvent!(node, cfg, ctx as any, {
      type: 'timeout_guard:execute',
      action: 'do_something',
      timeout_ms: 1000,
    } as any);

    const state = node.__timeoutGuardState;
    expect(state.operations.size).toBe(1);
    const [, op] = [...state.operations.entries()][0];
    expect(op.action).toBe('do_something');
  });

  it('timeout_guard:execute emits timeout_guard:started', () => {
    const node = makeNode();
    const ctx = { emit: vi.fn() };
    const cfg = timeoutGuardHandler.defaultConfig!;
    timeoutGuardHandler.onAttach!(node, cfg, ctx as any);

    timeoutGuardHandler.onEvent!(node, cfg, ctx as any, {
      type: 'timeout_guard:execute',
      action: 'my_action',
    } as any);

    expect(ctx.emit).toHaveBeenCalledWith('timeout_guard:started', expect.objectContaining({
      action: 'my_action',
    }));
  });

  it('fires timeout_guard:timed_out after timeout expires', () => {
    const node = makeNode();
    const ctx = { emit: vi.fn() };
    const cfg = { ...timeoutGuardHandler.defaultConfig!, default_timeout_ms: 500 };
    timeoutGuardHandler.onAttach!(node, cfg, ctx as any);

    timeoutGuardHandler.onEvent!(node, cfg, ctx as any, {
      type: 'timeout_guard:execute',
      action: 'slow_op',
      timeout_ms: 500,
    } as any);

    vi.advanceTimersByTime(501);

    const timedOutCall = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0] === 'timeout_guard:timed_out'
    );
    expect(timedOutCall).toBeDefined();
    expect(timedOutCall![1]).toMatchObject({ action: 'slow_op' });
  });

  it('timeout_guard:cancel removes operation and clears timer', () => {
    const node = makeNode();
    const ctx = { emit: vi.fn() };
    const cfg = timeoutGuardHandler.defaultConfig!;
    timeoutGuardHandler.onAttach!(node, cfg, ctx as any);

    timeoutGuardHandler.onEvent!(node, cfg, ctx as any, {
      type: 'timeout_guard:execute',
      action: 'op_to_cancel',
    } as any);

    const state = node.__timeoutGuardState;
    const [guardId] = [...state.operations.keys()];

    timeoutGuardHandler.onEvent!(node, cfg, ctx as any, {
      type: 'timeout_guard:cancel',
      guardId,
    } as any);

    expect(state.operations.has(guardId)).toBe(false);
    // Advance time — timer should NOT fire after cancel
    vi.advanceTimersByTime(60000);
    const timedOutCall = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === 'timeout_guard:timed_out'
    );
    expect(timedOutCall.length).toBe(0);
  });

  it('timeout_guard:get_status emits status', () => {
    const node = makeNode();
    const ctx = { emit: vi.fn() };
    const cfg = timeoutGuardHandler.defaultConfig!;
    timeoutGuardHandler.onAttach!(node, cfg, ctx as any);

    timeoutGuardHandler.onEvent!(node, cfg, ctx as any, {
      type: 'timeout_guard:get_status',
    } as any);

    expect(ctx.emit).toHaveBeenCalledWith('timeout_guard:status', expect.anything());
  });

  it('onDetach clears all timers and removes state', () => {
    const node = makeNode();
    const ctx = { emit: vi.fn() };
    const cfg = timeoutGuardHandler.defaultConfig!;
    timeoutGuardHandler.onAttach!(node, cfg, ctx as any);

    timeoutGuardHandler.onEvent!(node, cfg, ctx as any, {
      type: 'timeout_guard:execute',
      action: 'op1',
    } as any);
    timeoutGuardHandler.onEvent!(node, cfg, ctx as any, {
      type: 'timeout_guard:execute',
      action: 'op2',
    } as any);

    timeoutGuardHandler.onDetach!(node, cfg, ctx as any);

    expect(node.__timeoutGuardState).toBeUndefined();
    // Advance time — timers should NOT fire after detach
    vi.advanceTimersByTime(60000);
    const timedOutCalls = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0] === 'timeout_guard:timed_out'
    );
    expect(timedOutCalls.length).toBe(0);
  });
});
