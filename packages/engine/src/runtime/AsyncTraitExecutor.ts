/**
 * AsyncTraitExecutor — HoloScript+ First-Class Async Handlers
 *
 * Wraps trait lifecycle calls (onAttach, onUpdate, onEvent, onDetach) so
 * they can return Promises. Tracks per-node-per-handler async state and
 * emits lifecycle events back through the node's event bus.
 *
 * Design:
 *  - Zero-overhead for sync handlers (fast-path check).
 *  - Per-node concurrency cap (maxConcurrent, default 3).
 *  - FIFO queue for excess concurrent calls.
 *  - Emits: on_async_start, on_async_done, on_async_error.
 *
 * @module AsyncTraitExecutor
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export type AsyncStatus = 'idle' | 'loading' | 'error' | 'done';

export interface AsyncHandlerState {
  status: AsyncStatus;
  error?: Error;
  /** Wall-clock ms when the last op started */
  startedAt?: number;
  /** Wall-clock ms when the last op finished */
  finishedAt?: number;
}

export interface AsyncTraitExecutorOptions {
  /** Maximum concurrent async handlers per node. Default: 3 */
  maxConcurrent?: number;
  /**
   * Function to emit events back to the node.
   * Signature mirrors the EventBus.emit() / node.emit() API.
   */
  emit?: (event: string, payload?: unknown) => void;
}

export interface AsyncExecuteResult {
  /** Resolved value (if handler returned a Promise) */
  value?: unknown;
  /** Status after execution */
  status: AsyncStatus;
  /** Error if status === 'error' */
  error?: Error;
}

// =============================================================================
// EXECUTOR
// =============================================================================

export class AsyncTraitExecutor {
  /**
   * By handler key: current in-flight count.
   * Key format: `${nodeId}:${handlerName}`
   */
  private inflightCounts = new Map<string, number>();

  /**
   * Pending queue when maxConcurrent is reached.
   * Key format: `${nodeId}:${handlerName}`
   */
  private queues = new Map<string, Array<() => void>>();

  /**
   * Latest state per handler key.
   */
  private states = new Map<string, AsyncHandlerState>();

  private readonly maxConcurrent: number;
  private readonly emit: (event: string, payload?: unknown) => void;

  constructor(options: AsyncTraitExecutorOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 3;
    this.emit = options.emit ?? (() => {});
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Execute a (potentially async) trait handler function.
   *
   * - If the handler returns a non-Promise, it short-circuits (no state change).
   * - If the handler returns a Promise, it tracks loading state and emits events.
   * - Excess concurrent calls are queued and run FIFO.
   */
  async execute(
    nodeId: string,
    handlerName: string,
    fn: (...args: unknown[]) => unknown,
    args: unknown[] = []
  ): Promise<AsyncExecuteResult> {
    const key = `${nodeId}:${handlerName}`;

    // ----- Fast-path: check if result is a Promise at all -----
    let rawResult: unknown;
    try {
      rawResult = fn(...args);
    } catch (err) {
      // Sync throw — still track as error state
      const error = err instanceof Error ? err : new Error(String(err));
      this.setState(key, { status: 'error', error });
      this.emit('on_async_error', { nodeId, handlerName, error: error.message });
      return { status: 'error', error };
    }

    if (!isPromise(rawResult)) {
      // Sync return — no state management needed
      return { status: 'done', value: rawResult };
    }

    // ----- Concurrency cap -----
    const current = this.inflightCounts.get(key) ?? 0;
    if (current >= this.maxConcurrent) {
      return new Promise<AsyncExecuteResult>((resolve) => {
        const queue = this.queues.get(key) ?? [];
        queue.push(() => {
          this.execute(nodeId, handlerName, fn, args).then(resolve);
        });
        this.queues.set(key, queue);
      });
    }

    // ----- Track loading -----
    this.inflightCounts.set(key, current + 1);
    this.setState(key, { status: 'loading', startedAt: Date.now() });
    this.emit('on_async_start', { nodeId, handlerName });

    try {
      const value = await (rawResult as Promise<unknown>);
      const finishedAt = Date.now();
      this.setState(key, {
        status: 'done',
        startedAt: this.states.get(key)?.startedAt,
        finishedAt,
      });
      this.emit('on_async_done', { nodeId, handlerName, value });
      return { status: 'done', value };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setState(key, { status: 'error', error });
      this.emit('on_async_error', { nodeId, handlerName, error: error.message });
      return { status: 'error', error };
    } finally {
      // Decrement inflight and drain one queued call if available
      const remaining = (this.inflightCounts.get(key) ?? 1) - 1;
      this.inflightCounts.set(key, remaining);
      const queue = this.queues.get(key);
      if (queue && queue.length > 0) {
        const next = queue.shift()!;
        if (queue.length === 0) this.queues.delete(key);
        else this.queues.set(key, queue);
        next();
      }
    }
  }

  /**
   * Get latest async state for a specific handler.
   */
  getState(nodeId: string, handlerName: string): AsyncHandlerState {
    const key = `${nodeId}:${handlerName}`;
    return this.states.get(key) ?? { status: 'idle' };
  }

  /**
   * Get all handler states for a given node.
   */
  getNodeStates(nodeId: string): Map<string, AsyncHandlerState> {
    const result = new Map<string, AsyncHandlerState>();
    for (const [key, state] of this.states) {
      if (key.startsWith(`${nodeId}:`)) {
        const handlerName = key.slice(nodeId.length + 1);
        result.set(handlerName, state);
      }
    }
    return result;
  }

  /**
   * True if any handler for the node is currently loading.
   */
  isLoading(nodeId: string): boolean {
    for (const [key, state] of this.states) {
      if (key.startsWith(`${nodeId}:`) && state.status === 'loading') return true;
    }
    return false;
  }

  /**
   * Reset all state (useful in tests or on scene reload).
   */
  reset(): void {
    this.inflightCounts.clear();
    this.queues.clear();
    this.states.clear();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private setState(key: string, state: AsyncHandlerState): void {
    this.states.set(key, state);
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Promise<unknown>).then === 'function'
  );
}

