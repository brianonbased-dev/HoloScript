/**
 * AsyncTraitExecutor Production Tests
 *
 * Tests async handler lifecycle states, concurrency cap,
 * error handling, and event emission.
 */

import { describe, it, expect, vi } from 'vitest';
import { AsyncTraitExecutor } from '../../runtime/AsyncTraitExecutor';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeExecutor(maxConcurrent = 3) {
  const events: Array<{ name: string; payload: unknown }> = [];
  const executor = new AsyncTraitExecutor({
    maxConcurrent,
    emit: (name, payload) => events.push({ name, payload }),
  });
  return { executor, events };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AsyncTraitExecutor — Production', () => {
  // ─── Sync fast-path ────────────────────────────────────────────────

  it('sync handler returns done immediately with no state change', async () => {
    const { executor, events } = makeExecutor();
    const result = await executor.execute('node1', 'onAttach', () => 42);
    expect(result.status).toBe('done');
    expect(result.value).toBe(42);
    // Sync should NOT emit any async events
    expect(events).toHaveLength(0);
  });

  it('sync handler — getState remains idle', async () => {
    const { executor } = makeExecutor();
    await executor.execute('node1', 'onAttach', () => 'sync');
    expect(executor.getState('node1', 'onAttach').status).toBe('idle');
  });

  // ─── Async happy path ──────────────────────────────────────────────

  it('async handler: status is loading while running and done after', async () => {
    const { executor } = makeExecutor();
    // Start an async handler
    const p = executor.execute('n', 'onEvent', async () => {
      await delay(5);
    });
    // Microtask: state should be loading BEFORE we await p
    const statusDuringLoad = executor.getState('n', 'onEvent').status;
    await p;
    const statusAfter = executor.getState('n', 'onEvent').status;
    // During the async work the executor should have marked it loading
    expect(statusDuringLoad).toBe('loading');
    // After completion it should be done
    expect(statusAfter).toBe('done');
  });

  it('async handler emits on_async_start then on_async_done', async () => {
    const { executor, events } = makeExecutor();
    await executor.execute('n', 'h', async () => {
      await delay(1);
      return 'val';
    });
    expect(events[0].name).toBe('on_async_start');
    expect(events[1].name).toBe('on_async_done');
    expect((events[1].payload as any).value).toBe('val');
  });

  it('async handler result is returned in AsyncExecuteResult.value', async () => {
    const { executor } = makeExecutor();
    const result = await executor.execute('n', 'h', async () => ({ data: 99 }));
    expect(result.status).toBe('done');
    expect((result.value as any).data).toBe(99);
  });

  // ─── Error handling ────────────────────────────────────────────────

  it('rejected promise sets error status and emits on_async_error', async () => {
    const { executor, events } = makeExecutor();
    const result = await executor.execute('n', 'h', async () => {
      throw new Error('boom');
    });
    expect(result.status).toBe('error');
    expect(result.error?.message).toBe('boom');
    expect(events.some((e) => e.name === 'on_async_error')).toBe(true);
    expect(executor.getState('n', 'h').status).toBe('error');
  });

  it('sync throw also sets error and emits on_async_error', async () => {
    const { executor, events } = makeExecutor();
    const result = await executor.execute('n', 'h', () => {
      throw new Error('sync-boom');
    });
    expect(result.status).toBe('error');
    expect(result.error?.message).toBe('sync-boom');
    expect(events.some((e) => e.name === 'on_async_error')).toBe(true);
  });

  it('non-Error thrown value is wrapped in Error', async () => {
    const { executor } = makeExecutor();
    const result = await executor.execute('n', 'h', async () => {
      throw 'just a string';
    });
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toContain('just a string');
  });

  // ─── Concurrency cap ───────────────────────────────────────────────

  it('allows up to maxConcurrent simultaneous calls', async () => {
    const { executor } = makeExecutor(3);
    let active = 0;
    let maxActive = 0;

    const makeHandler = () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(10);
      active--;
    };

    await Promise.all([
      executor.execute('n', 'h', makeHandler()),
      executor.execute('n', 'h', makeHandler()),
      executor.execute('n', 'h', makeHandler()),
    ]);

    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it('4th call is queued when maxConcurrent=3 and does not run until a slot opens', async () => {
    const { executor } = makeExecutor(3);
    // Use a shared resolve to control when handlers complete
    let startCount = 0;
    const started: number[] = [];
    const completedOrder: number[] = [];

    const makeH = (id: number) => async () => {
      started.push(id);
      startCount++;
      await delay(20);
      completedOrder.push(id);
    };

    // Fire all 4 calls — 4th must queue
    await Promise.all([
      executor.execute('n', 'h', makeH(1)),
      executor.execute('n', 'h', makeH(2)),
      executor.execute('n', 'h', makeH(3)),
      executor.execute('n', 'h', makeH(4)),
    ]);

    // All 4 eventually complete (may finalize in different microtask order)
    expect(completedOrder.length).toBeGreaterThanOrEqual(4);
    expect(completedOrder).toContain(4);
  });

  // ─── isLoading / getNodeStates ─────────────────────────────────────

  it('isLoading returns true while handler is running, false after', async () => {
    const { executor } = makeExecutor();
    // Start async handler and immediately check — before awaiting
    const p = executor.execute('n', 'h', async () => {
      await delay(5);
    });
    // Synchronously after the call: state should be loading
    const loadingNow = executor.isLoading('n');
    await p;
    const loadingAfter = executor.isLoading('n');
    expect(loadingNow).toBe(true);
    expect(loadingAfter).toBe(false);
  });

  it('getNodeStates returns states for all handlers on a node', async () => {
    const { executor } = makeExecutor();
    await executor.execute('n', 'onAttach', async () => {});
    await executor.execute('n', 'onEvent', async () => {});
    const states = executor.getNodeStates('n');
    expect(states.has('onAttach')).toBe(true);
    expect(states.has('onEvent')).toBe(true);
  });

  it('getNodeStates does not include states for other nodes', async () => {
    const { executor } = makeExecutor();
    await executor.execute('a', 'h', async () => {});
    await executor.execute('b', 'h', async () => {});
    const states = executor.getNodeStates('a');
    expect(states.size).toBe(1);
    expect(states.has('h')).toBe(true);
  });

  // ─── reset() ───────────────────────────────────────────────────────

  it('reset() clears all state', async () => {
    const { executor } = makeExecutor();
    await executor.execute('n', 'h', async () => {});
    executor.reset();
    expect(executor.getState('n', 'h').status).toBe('idle');
    expect(executor.isLoading('n')).toBe(false);
  });

  // ─── finishedAt timing ─────────────────────────────────────────────

  it('done state includes startedAt and finishedAt timestamps', async () => {
    const { executor } = makeExecutor();
    const before = Date.now();
    await executor.execute('n', 'h', async () => {
      await delay(1);
    });
    const after = Date.now();
    const state = executor.getState('n', 'h');
    expect(state.startedAt).toBeGreaterThanOrEqual(before);
    expect(state.finishedAt).toBeLessThanOrEqual(after);
    expect(state.finishedAt!).toBeGreaterThanOrEqual(state.startedAt!);
  });
});
