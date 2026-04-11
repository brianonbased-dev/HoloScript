/**
 * Delegation Trace & Replay Hooks
 *
 * Enables tracing which agent delegated work to which other agent,
 * and replaying those delegation chains for debugging.
 *
 * Builds on top of TaskDelegationService's per-task trace events
 * to provide a cross-agent delegation tree view.
 *
 * Part of HoloScript v6.0 Agent Orchestration.
 *
 * @module DelegationTraceHooks
 */

// =============================================================================
// TYPES
// =============================================================================

/** A single delegation event in the agent-to-agent chain. */
export interface DelegationEvent {
  /** Unique ID for this delegation event */
  id: string;
  /** Agent that initiated the delegation */
  fromAgent: string;
  /** Agent that received the delegation */
  toAgent: string;
  /** Task ID associated with this delegation */
  taskId: string;
  /** ISO-8601 timestamp of the delegation */
  timestamp: string;
  /** Arbitrary payload carried with the delegation (skill, args, etc.) */
  payload: Record<string, unknown>;
  /** ID of the parent DelegationEvent (null for root delegations) */
  parentDelegation: string | null;
  /** Current status of this delegation */
  status: DelegationEventStatus;
  /** Duration in ms (set after completion/failure) */
  durationMs?: number;
  /** Error message if the delegation failed */
  error?: string;
}

export type DelegationEventStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'replaying';

/** A full delegation trace — a tree of DelegationEvents with a single root. */
export interface DelegationTrace {
  /** The root delegation event ID */
  rootId: string;
  /** All events in this trace, keyed by event ID */
  events: Map<string, DelegationEvent>;
  /** Timestamp when the trace was created */
  createdAt: string;
  /** Timestamp of the most recent event */
  lastUpdated: string;
}

/** Summary of a delegation chain from root to leaf. */
export interface DelegationChainEntry {
  /** The delegation event */
  event: DelegationEvent;
  /** Depth in the chain (0 = root) */
  depth: number;
}

/** Subscriber callback for delegation events. */
export type DelegationHookFn = (event: DelegationEvent, trace: DelegationTrace) => void;

/** Options for replaying a delegation trace. */
export interface ReplayOptions {
  /** If true, invoke the executor for each event. If false (default), dry-run only. */
  execute?: boolean;
  /** Optional delay between replay steps in ms (for visualization). */
  stepDelayMs?: number;
  /** Override payloads for specific event IDs during replay. */
  payloadOverrides?: Map<string, Record<string, unknown>>;
  /** Callback invoked before each replay step. Return false to skip. */
  beforeStep?: (event: DelegationEvent, depth: number) => boolean | Promise<boolean>;
  /** Callback invoked after each replay step. */
  afterStep?: (event: DelegationEvent, result: ReplayStepResult) => void | Promise<void>;
}

/** Result of replaying a single delegation step. */
export interface ReplayStepResult {
  eventId: string;
  status: 'executed' | 'skipped' | 'dry_run' | 'failed';
  result?: unknown;
  error?: string;
  durationMs: number;
}

/** Full result of replaying an entire trace. */
export interface ReplayResult {
  traceId: string;
  steps: ReplayStepResult[];
  totalDurationMs: number;
  status: 'completed' | 'partial' | 'failed';
}

/** Executor function for replay — called for each event when execute=true. */
export type DelegationExecutor = (
  fromAgent: string,
  toAgent: string,
  taskId: string,
  payload: Record<string, unknown>
) => Promise<unknown>;

// =============================================================================
// DELEGATION TRACE STORE
// =============================================================================

/**
 * In-memory store for delegation traces with hooks support.
 *
 * Tracks agent-to-agent delegation chains, supports subscribing to
 * delegation events, and enables replaying traces for debugging.
 */
export class DelegationTraceStore {
  private traces: Map<string, DelegationTrace> = new Map();
  private eventToTrace: Map<string, string> = new Map();
  private hooks: DelegationHookFn[] = [];
  private maxTraces: number;
  private idCounter = 0;

  constructor(options?: { maxTraces?: number }) {
    this.maxTraces = options?.maxTraces ?? 10_000;
  }

  // ===========================================================================
  // TRACE DELEGATION
  // ===========================================================================

  /**
   * Record a new delegation event. Creates a new trace if no parent,
   * or appends to an existing trace via parentDelegation.
   */
  traceDelegation(
    fromAgent: string,
    toAgent: string,
    taskId: string,
    payload: Record<string, unknown> = {},
    parentDelegation: string | null = null
  ): DelegationEvent {
    const now = new Date().toISOString();
    const id = this.generateId();

    const event: DelegationEvent = {
      id,
      fromAgent,
      toAgent,
      taskId,
      timestamp: now,
      payload: { ...payload },
      parentDelegation,
      status: 'pending',
    };

    if (parentDelegation) {
      // Append to existing trace
      const traceId = this.eventToTrace.get(parentDelegation);
      if (traceId) {
        const trace = this.traces.get(traceId);
        if (trace) {
          trace.events.set(id, event);
          trace.lastUpdated = now;
          this.eventToTrace.set(id, traceId);
          this.notifyHooks(event, trace);
          return event;
        }
      }
      // Parent not found — create a new trace anyway (orphaned delegation)
    }

    // New root trace
    const trace: DelegationTrace = {
      rootId: id,
      events: new Map([[id, event]]),
      createdAt: now,
      lastUpdated: now,
    };

    this.traces.set(id, trace);
    this.eventToTrace.set(id, id);
    this.evictIfNeeded();
    this.notifyHooks(event, trace);

    return event;
  }

  // ===========================================================================
  // UPDATE STATUS
  // ===========================================================================

  /**
   * Update the status of a delegation event.
   */
  updateStatus(
    eventId: string,
    status: DelegationEventStatus,
    details?: { durationMs?: number; error?: string }
  ): boolean {
    const traceId = this.eventToTrace.get(eventId);
    if (!traceId) return false;

    const trace = this.traces.get(traceId);
    if (!trace) return false;

    const event = trace.events.get(eventId);
    if (!event) return false;

    event.status = status;
    if (details?.durationMs !== undefined) event.durationMs = details.durationMs;
    if (details?.error !== undefined) event.error = details.error;
    trace.lastUpdated = new Date().toISOString();

    this.notifyHooks(event, trace);
    return true;
  }

  // ===========================================================================
  // GET DELEGATION CHAIN
  // ===========================================================================

  /**
   * Walk up the parent chain from a given event to the root.
   * Returns the chain from root (depth 0) to the given event.
   */
  getDelegationChain(eventId: string): DelegationChainEntry[] {
    const traceId = this.eventToTrace.get(eventId);
    if (!traceId) return [];

    const trace = this.traces.get(traceId);
    if (!trace) return [];

    // Walk up from eventId to root
    const chain: DelegationEvent[] = [];
    let currentId: string | null = eventId;

    while (currentId) {
      const event = trace.events.get(currentId);
      if (!event) break;
      chain.push(event);
      currentId = event.parentDelegation;
    }

    // Reverse so root is first (depth 0)
    chain.reverse();
    return chain.map((event, index) => ({ event, depth: index }));
  }

  // ===========================================================================
  // GET CHILDREN
  // ===========================================================================

  /**
   * Get direct children of a delegation event.
   */
  getChildren(eventId: string): DelegationEvent[] {
    const traceId = this.eventToTrace.get(eventId);
    if (!traceId) return [];

    const trace = this.traces.get(traceId);
    if (!trace) return [];

    const children: DelegationEvent[] = [];
    for (const event of trace.events.values()) {
      if (event.parentDelegation === eventId) {
        children.push(event);
      }
    }
    return children;
  }

  // ===========================================================================
  // REPLAY DELEGATION
  // ===========================================================================

  /**
   * Replay a delegation trace for debugging.
   *
   * Walks the trace tree in depth-first order and optionally re-executes
   * each delegation step via the provided executor.
   */
  async replayDelegation(
    traceId: string,
    executor?: DelegationExecutor,
    options: ReplayOptions = {}
  ): Promise<ReplayResult> {
    const trace = this.traces.get(traceId);
    if (!trace) {
      return {
        traceId,
        steps: [],
        totalDurationMs: 0,
        status: 'failed',
      };
    }

    const totalStart = Date.now();
    const steps: ReplayStepResult[] = [];
    const shouldExecute = options.execute && executor;

    // DFS traversal from root
    const visited = new Set<string>();
    const stack: Array<{ eventId: string; depth: number }> = [
      { eventId: trace.rootId, depth: 0 },
    ];

    while (stack.length > 0) {
      const { eventId, depth } = stack.pop()!;
      if (visited.has(eventId)) continue;
      visited.add(eventId);

      const event = trace.events.get(eventId);
      if (!event) continue;

      // beforeStep hook
      if (options.beforeStep) {
        const proceed = await options.beforeStep(event, depth);
        if (!proceed) {
          const stepResult: ReplayStepResult = {
            eventId,
            status: 'skipped',
            durationMs: 0,
          };
          steps.push(stepResult);
          if (options.afterStep) await options.afterStep(event, stepResult);
          continue;
        }
      }

      // Optional delay for visualization
      if (options.stepDelayMs && options.stepDelayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, options.stepDelayMs));
      }

      const stepStart = Date.now();
      let stepResult: ReplayStepResult;

      if (shouldExecute) {
        try {
          const payload = options.payloadOverrides?.get(eventId) ?? event.payload;
          const result = await executor(event.fromAgent, event.toAgent, event.taskId, payload);
          stepResult = {
            eventId,
            status: 'executed',
            result,
            durationMs: Date.now() - stepStart,
          };
        } catch (err) {
          stepResult = {
            eventId,
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - stepStart,
          };
        }
      } else {
        stepResult = {
          eventId,
          status: 'dry_run',
          durationMs: Date.now() - stepStart,
        };
      }

      steps.push(stepResult);
      if (options.afterStep) await options.afterStep(event, stepResult);

      // Push children (reverse order so first child is processed first in DFS)
      const children = this.getChildren(eventId);
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({ eventId: children[i].id, depth: depth + 1 });
      }
    }

    const totalDurationMs = Date.now() - totalStart;
    const hasFailed = steps.some((s) => s.status === 'failed');
    const allExecuted = steps.every((s) => s.status === 'executed' || s.status === 'dry_run');

    return {
      traceId,
      steps,
      totalDurationMs,
      status: hasFailed ? (allExecuted ? 'failed' : 'partial') : 'completed',
    };
  }

  // ===========================================================================
  // HOOKS (subscribe/unsubscribe)
  // ===========================================================================

  /**
   * Subscribe to delegation events. Returns an unsubscribe function.
   */
  onDelegation(hook: DelegationHookFn): () => void {
    this.hooks.push(hook);
    return () => {
      const idx = this.hooks.indexOf(hook);
      if (idx >= 0) this.hooks.splice(idx, 1);
    };
  }

  // ===========================================================================
  // QUERY
  // ===========================================================================

  /** Get a trace by its root event ID. */
  getTrace(traceId: string): DelegationTrace | undefined {
    return this.traces.get(traceId);
  }

  /** Get a specific delegation event by ID. */
  getEvent(eventId: string): DelegationEvent | undefined {
    const traceId = this.eventToTrace.get(eventId);
    if (!traceId) return undefined;
    return this.traces.get(traceId)?.events.get(eventId);
  }

  /** Get all traces (most recent first). */
  getAllTraces(): DelegationTrace[] {
    return [...this.traces.values()].sort(
      (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );
  }

  /** Get traces involving a specific agent (as source or target). */
  getTracesForAgent(agentId: string): DelegationTrace[] {
    const result: DelegationTrace[] = [];
    for (const trace of this.traces.values()) {
      for (const event of trace.events.values()) {
        if (event.fromAgent === agentId || event.toAgent === agentId) {
          result.push(trace);
          break;
        }
      }
    }
    return result;
  }

  /** Get the total number of tracked traces. */
  get size(): number {
    return this.traces.size;
  }

  /** Clear all traces. */
  clear(): void {
    this.traces.clear();
    this.eventToTrace.clear();
  }

  // ===========================================================================
  // PRIVATE
  // ===========================================================================

  private generateId(): string {
    this.idCounter++;
    return `deleg-${Date.now()}-${this.idCounter}`;
  }

  private notifyHooks(event: DelegationEvent, trace: DelegationTrace): void {
    for (const hook of this.hooks) {
      try {
        hook(event, trace);
      } catch {
        // Hooks must not break the delegation flow
      }
    }
  }

  private evictIfNeeded(): void {
    while (this.traces.size > this.maxTraces) {
      // Evict oldest trace
      let oldestKey: string | undefined;
      let oldestTime = Infinity;
      for (const [key, trace] of this.traces) {
        const time = new Date(trace.createdAt).getTime();
        if (time < oldestTime) {
          oldestTime = time;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        const trace = this.traces.get(oldestKey);
        if (trace) {
          for (const eventId of trace.events.keys()) {
            this.eventToTrace.delete(eventId);
          }
        }
        this.traces.delete(oldestKey);
      } else {
        break;
      }
    }
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS (module-level, use a shared store)
// =============================================================================

let defaultStore: DelegationTraceStore | undefined;

/** Get or create the default (singleton) DelegationTraceStore. */
export function getDefaultTraceStore(): DelegationTraceStore {
  if (!defaultStore) {
    defaultStore = new DelegationTraceStore();
  }
  return defaultStore;
}

/** Reset the default store (for testing). */
export function resetDefaultTraceStore(): void {
  defaultStore?.clear();
  defaultStore = undefined;
}

/**
 * Record a delegation event in the default store.
 * Convenience wrapper around DelegationTraceStore.traceDelegation().
 */
export function traceDelegation(
  fromAgent: string,
  toAgent: string,
  taskId: string,
  payload?: Record<string, unknown>,
  parentDelegation?: string | null
): DelegationEvent {
  return getDefaultTraceStore().traceDelegation(
    fromAgent,
    toAgent,
    taskId,
    payload,
    parentDelegation ?? null
  );
}

/**
 * Replay a delegation trace from the default store.
 * Convenience wrapper around DelegationTraceStore.replayDelegation().
 */
export async function replayDelegation(
  traceId: string,
  executor?: DelegationExecutor,
  options?: ReplayOptions
): Promise<ReplayResult> {
  return getDefaultTraceStore().replayDelegation(traceId, executor, options);
}

/**
 * Get the delegation chain (root to leaf) for an event in the default store.
 * Convenience wrapper around DelegationTraceStore.getDelegationChain().
 */
export function getDelegationChain(eventId: string): DelegationChainEntry[] {
  return getDefaultTraceStore().getDelegationChain(eventId);
}
