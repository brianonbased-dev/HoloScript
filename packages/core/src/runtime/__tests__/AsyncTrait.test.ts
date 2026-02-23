/**
 * Sprint 4 — Async Trait Executor Tests
 *
 * Tests the AsyncTraitExecutor standalone (no runtime wiring needed):
 * - Sync handler fast-path (no state change)
 * - Promise handler tracking (loading → done)
 * - Concurrency cap + FIFO queue
 * - Error handling (sync throw and async reject)
 * - State getters (getState, getNodeStates, isLoading)
 * - reset()
 */

import { describe, it, expect, vi } from 'vitest';
import { AsyncTraitExecutor } from '../../runtime/AsyncTraitExecutor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const nodeId = 'node-1';
const handlerName = 'onAttach';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Sync fast-path
// ---------------------------------------------------------------------------

describe('AsyncTraitExecutor — sync fast-path', () => {
  it('returns status done synchronously for non-async handler', async () => {
    const exec = new AsyncTraitExecutor();
    const result = await exec.execute(nodeId, handlerName, () => 42);
    expect(result.status).toBe('done');
    expect(result.value).toBe(42);
  });

  it('does NOT change state for sync handlers', async () => {
    const exec = new AsyncTraitExecutor();
    await exec.execute(nodeId, handlerName, () => 'hello');
    // Sync handlers should not set loading state
    const state = exec.getState(nodeId, handlerName);
    expect(state.status).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// Async tracking
// ---------------------------------------------------------------------------

describe('AsyncTraitExecutor — async tracking', () => {
  it('emits on_async_start and on_async_done events', async () => {
    const emit = vi.fn();
    const exec = new AsyncTraitExecutor({ emit });

    await exec.execute(nodeId, handlerName, async () => {
      await delay(1);
      return 'done-value';
    });

    expect(emit).toHaveBeenCalledWith('on_async_start', expect.objectContaining({ nodeId, handlerName }));
    expect(emit).toHaveBeenCalledWith('on_async_done', expect.objectContaining({ nodeId, handlerName, value: 'done-value' }));
  });

  it('tracks loading state during execution', async () => {
    const exec = new AsyncTraitExecutor();
    let wasLoading = false;

    const promise = exec.execute(nodeId, handlerName, async () => {
      await delay(10);
      wasLoading = exec.isLoading(nodeId);
    });

    await promise;
    expect(wasLoading).toBe(true);
  });

  it('sets status to done after resolution', async () => {
    const exec = new AsyncTraitExecutor();
    await exec.execute(nodeId, handlerName, async () => 'result');
    expect(exec.getState(nodeId, handlerName).status).toBe('done');
  });

  it('resolves the return value', async () => {
    const exec = new AsyncTraitExecutor();
    const result = await exec.execute(nodeId, handlerName, async () => 99);
    expect(result.value).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('AsyncTraitExecutor — error handling', () => {
  it('handles synchronous throw', async () => {
    const emit = vi.fn();
    const exec = new AsyncTraitExecutor({ emit });
    const result = await exec.execute(nodeId, handlerName, () => {
      throw new Error('sync-error');
    });
    expect(result.status).toBe('error');
    expect(result.error?.message).toBe('sync-error');
    expect(emit).toHaveBeenCalledWith('on_async_error', expect.objectContaining({ nodeId }));
  });

  it('handles async rejection', async () => {
    const exec = new AsyncTraitExecutor();
    const result = await exec.execute(nodeId, handlerName, async () => {
      throw new Error('async-error');
    });
    expect(result.status).toBe('error');
    expect(result.error?.message).toBe('async-error');
  });
});

// ---------------------------------------------------------------------------
// Concurrency cap
// ---------------------------------------------------------------------------

describe('AsyncTraitExecutor — concurrency cap', () => {
  it('queued calls eventually resolve when maxConcurrent is exceeded', async () => {
    // maxConcurrent = 1: 2nd and 3rd calls will be queued against the same key
    const exec = new AsyncTraitExecutor({ maxConcurrent: 1 });
    const key = { nodeId: 'q-node', handlerName: 'onUpdta' };
    const completions: number[] = [];

    // All three calls must complete (not be lost/dropped)
    await Promise.all([
      exec.execute(key.nodeId, key.handlerName, async () => { await delay(5); completions.push(1); }),
      exec.execute(key.nodeId, key.handlerName, async () => { completions.push(2); }),
      exec.execute(key.nodeId, key.handlerName, async () => { completions.push(3); }),
    ]);

    expect(completions).toContain(1);
    expect(completions).toContain(2);
    expect(completions).toContain(3);
  });
});

// ---------------------------------------------------------------------------
// State inspection
// ---------------------------------------------------------------------------

describe('AsyncTraitExecutor — state inspection', () => {
  it('getNodeStates() lists all handlers for a node', async () => {
    const exec = new AsyncTraitExecutor();
    await exec.execute(nodeId, 'onAttach', async () => 1);
    await exec.execute(nodeId, 'onUpdate', async () => 2);

    const states = exec.getNodeStates(nodeId);
    expect(states.has('onAttach')).toBe(true);
    expect(states.has('onUpdate')).toBe(true);
  });

  it('reset() clears all state', async () => {
    const exec = new AsyncTraitExecutor();
    await exec.execute(nodeId, handlerName, async () => 1);
    exec.reset();
    expect(exec.getState(nodeId, handlerName).status).toBe('idle');
    expect(exec.isLoading(nodeId)).toBe(false);
  });
});
