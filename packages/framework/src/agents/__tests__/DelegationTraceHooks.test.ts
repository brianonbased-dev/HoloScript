/**
 * DelegationTraceHooks Tests
 *
 * Tests agent-to-agent delegation tracing, chain walking, and replay.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DelegationTraceStore,
  traceDelegation,
  replayDelegation,
  getDelegationChain,
  resetDefaultTraceStore,
  getDefaultTraceStore,
  type DelegationEvent,
  type DelegationTrace,
  type DelegationExecutor,
} from '../DelegationTraceHooks';

// =============================================================================
// TESTS
// =============================================================================

describe('DelegationTraceHooks', () => {
  let store: DelegationTraceStore;

  beforeEach(() => {
    store = new DelegationTraceStore();
    resetDefaultTraceStore();
  });

  // ===========================================================================
  // traceDelegation
  // ===========================================================================

  describe('traceDelegation', () => {
    it('creates a root delegation event with no parent', () => {
      const event = store.traceDelegation('agent-a', 'agent-b', 'task-1', { skill: 'parse' });

      expect(event.fromAgent).toBe('agent-a');
      expect(event.toAgent).toBe('agent-b');
      expect(event.taskId).toBe('task-1');
      expect(event.payload).toEqual({ skill: 'parse' });
      expect(event.parentDelegation).toBeNull();
      expect(event.status).toBe('pending');
      expect(event.id).toBeTruthy();
      expect(event.timestamp).toBeTruthy();
    });

    it('creates a child delegation linked to parent', () => {
      const root = store.traceDelegation('agent-a', 'agent-b', 'task-1');
      const child = store.traceDelegation('agent-b', 'agent-c', 'task-2', {}, root.id);

      expect(child.parentDelegation).toBe(root.id);

      // Both should be in the same trace
      const trace = store.getTrace(root.id);
      expect(trace).toBeDefined();
      expect(trace!.events.size).toBe(2);
      expect(trace!.events.has(root.id)).toBe(true);
      expect(trace!.events.has(child.id)).toBe(true);
    });

    it('creates a new trace when parent is not found', () => {
      const orphan = store.traceDelegation('agent-x', 'agent-y', 'task-99', {}, 'nonexistent');

      expect(orphan.parentDelegation).toBe('nonexistent');
      expect(store.size).toBe(1);
    });

    it('handles empty payload', () => {
      const event = store.traceDelegation('a', 'b', 't');
      expect(event.payload).toEqual({});
    });
  });

  // ===========================================================================
  // updateStatus
  // ===========================================================================

  describe('updateStatus', () => {
    it('updates event status', () => {
      const event = store.traceDelegation('a', 'b', 't');
      const updated = store.updateStatus(event.id, 'completed', { durationMs: 150 });

      expect(updated).toBe(true);
      const retrieved = store.getEvent(event.id);
      expect(retrieved!.status).toBe('completed');
      expect(retrieved!.durationMs).toBe(150);
    });

    it('records error on failure', () => {
      const event = store.traceDelegation('a', 'b', 't');
      store.updateStatus(event.id, 'failed', { error: 'Connection refused' });

      const retrieved = store.getEvent(event.id);
      expect(retrieved!.status).toBe('failed');
      expect(retrieved!.error).toBe('Connection refused');
    });

    it('returns false for unknown event', () => {
      expect(store.updateStatus('nonexistent', 'completed')).toBe(false);
    });
  });

  // ===========================================================================
  // getDelegationChain
  // ===========================================================================

  describe('getDelegationChain', () => {
    it('returns the full chain from root to leaf', () => {
      const root = store.traceDelegation('orchestrator', 'agent-a', 'task-1');
      const mid = store.traceDelegation('agent-a', 'agent-b', 'task-2', {}, root.id);
      const leaf = store.traceDelegation('agent-b', 'agent-c', 'task-3', {}, mid.id);

      const chain = store.getDelegationChain(leaf.id);

      expect(chain).toHaveLength(3);
      expect(chain[0].event.id).toBe(root.id);
      expect(chain[0].depth).toBe(0);
      expect(chain[1].event.id).toBe(mid.id);
      expect(chain[1].depth).toBe(1);
      expect(chain[2].event.id).toBe(leaf.id);
      expect(chain[2].depth).toBe(2);
    });

    it('returns single entry for root event', () => {
      const root = store.traceDelegation('a', 'b', 't');
      const chain = store.getDelegationChain(root.id);

      expect(chain).toHaveLength(1);
      expect(chain[0].depth).toBe(0);
    });

    it('returns empty for unknown event', () => {
      expect(store.getDelegationChain('nonexistent')).toEqual([]);
    });
  });

  // ===========================================================================
  // getChildren
  // ===========================================================================

  describe('getChildren', () => {
    it('returns direct children of an event', () => {
      const root = store.traceDelegation('a', 'b', 't1');
      store.traceDelegation('b', 'c', 't2', {}, root.id);
      store.traceDelegation('b', 'd', 't3', {}, root.id);

      const children = store.getChildren(root.id);
      expect(children).toHaveLength(2);
    });

    it('returns empty for leaf events', () => {
      const root = store.traceDelegation('a', 'b', 't');
      expect(store.getChildren(root.id)).toHaveLength(0);
    });
  });

  // ===========================================================================
  // replayDelegation
  // ===========================================================================

  describe('replayDelegation', () => {
    it('performs a dry-run replay of a trace', async () => {
      const root = store.traceDelegation('a', 'b', 't1', { skill: 'parse' });
      store.traceDelegation('b', 'c', 't2', { skill: 'compile' }, root.id);

      const result = await store.replayDelegation(root.id);

      expect(result.status).toBe('completed');
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].status).toBe('dry_run');
      expect(result.steps[1].status).toBe('dry_run');
    });

    it('executes replay with an executor', async () => {
      const root = store.traceDelegation('a', 'b', 't1', { skill: 'parse' });
      store.traceDelegation('b', 'c', 't2', { skill: 'compile' }, root.id);

      const executor: DelegationExecutor = vi.fn(async (_from, _to, _task, payload) => ({
        executed: payload.skill,
      }));

      const result = await store.replayDelegation(root.id, executor, { execute: true });

      expect(result.status).toBe('completed');
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].status).toBe('executed');
      expect(result.steps[1].status).toBe('executed');
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it('reports failure when executor throws', async () => {
      const root = store.traceDelegation('a', 'b', 't1');

      const executor: DelegationExecutor = async () => {
        throw new Error('Replay error');
      };

      const result = await store.replayDelegation(root.id, executor, { execute: true });

      expect(result.steps[0].status).toBe('failed');
      expect(result.steps[0].error).toBe('Replay error');
    });

    it('supports beforeStep to skip events', async () => {
      const root = store.traceDelegation('a', 'b', 't1');
      store.traceDelegation('b', 'c', 't2', {}, root.id);

      const executor: DelegationExecutor = vi.fn(async () => 'ok');

      const result = await store.replayDelegation(root.id, executor, {
        execute: true,
        beforeStep: (event) => event.fromAgent !== 'b', // skip agent-b delegations
      });

      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].status).toBe('executed'); // root a->b
      expect(result.steps[1].status).toBe('skipped'); // child b->c
    });

    it('supports afterStep callback', async () => {
      const root = store.traceDelegation('a', 'b', 't1');

      const afterEvents: string[] = [];
      await store.replayDelegation(root.id, undefined, {
        afterStep: (event) => {
          afterEvents.push(event.id);
        },
      });

      expect(afterEvents).toHaveLength(1);
      expect(afterEvents[0]).toBe(root.id);
    });

    it('supports payload overrides during replay', async () => {
      const root = store.traceDelegation('a', 'b', 't1', { original: true });

      const capturedPayloads: Record<string, unknown>[] = [];
      const executor: DelegationExecutor = async (_from, _to, _task, payload) => {
        capturedPayloads.push(payload);
        return 'ok';
      };

      const overrides = new Map([[root.id, { overridden: true }]]);

      await store.replayDelegation(root.id, executor, {
        execute: true,
        payloadOverrides: overrides,
      });

      expect(capturedPayloads[0]).toEqual({ overridden: true });
    });

    it('returns failed for unknown trace', async () => {
      const result = await store.replayDelegation('nonexistent');
      expect(result.status).toBe('failed');
      expect(result.steps).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Hooks (onDelegation)
  // ===========================================================================

  describe('onDelegation hooks', () => {
    it('notifies subscribers on new delegation', () => {
      const events: DelegationEvent[] = [];
      store.onDelegation((event) => events.push(event));

      store.traceDelegation('a', 'b', 't1');
      store.traceDelegation('b', 'c', 't2');

      expect(events).toHaveLength(2);
    });

    it('notifies on status updates', () => {
      const events: DelegationEvent[] = [];
      store.onDelegation((event) => events.push(event));

      const e = store.traceDelegation('a', 'b', 't1');
      store.updateStatus(e.id, 'completed');

      expect(events).toHaveLength(2); // creation + update
      expect(events[1].status).toBe('completed');
    });

    it('unsubscribe stops notifications', () => {
      const events: DelegationEvent[] = [];
      const unsub = store.onDelegation((event) => events.push(event));

      store.traceDelegation('a', 'b', 't1');
      unsub();
      store.traceDelegation('c', 'd', 't2');

      expect(events).toHaveLength(1);
    });

    it('hook errors do not break delegation flow', () => {
      store.onDelegation(() => {
        throw new Error('Hook exploded');
      });

      // Should not throw
      const event = store.traceDelegation('a', 'b', 't1');
      expect(event.id).toBeTruthy();
    });
  });

  // ===========================================================================
  // Query methods
  // ===========================================================================

  describe('query', () => {
    it('getTracesForAgent finds all traces involving an agent', () => {
      store.traceDelegation('agent-a', 'agent-b', 't1');
      store.traceDelegation('agent-c', 'agent-d', 't2');
      store.traceDelegation('agent-b', 'agent-e', 't3');

      const traces = store.getTracesForAgent('agent-b');
      expect(traces).toHaveLength(2); // t1 (as target) and t3 (as source, separate trace)
    });

    it('getAllTraces returns all traces sorted by recency', () => {
      store.traceDelegation('a', 'b', 't1');
      store.traceDelegation('c', 'd', 't2');

      const all = store.getAllTraces();
      expect(all).toHaveLength(2);
    });

    it('getEvent returns undefined for unknown', () => {
      expect(store.getEvent('nonexistent')).toBeUndefined();
    });
  });

  // ===========================================================================
  // Eviction
  // ===========================================================================

  describe('eviction', () => {
    it('evicts oldest traces when maxTraces is exceeded', () => {
      const small = new DelegationTraceStore({ maxTraces: 2 });

      small.traceDelegation('a', 'b', 't1');
      small.traceDelegation('c', 'd', 't2');
      small.traceDelegation('e', 'f', 't3');

      expect(small.size).toBe(2);
    });
  });

  // ===========================================================================
  // Module-level convenience functions
  // ===========================================================================

  describe('module-level functions', () => {
    it('traceDelegation uses default store', () => {
      const event = traceDelegation('a', 'b', 't1', { key: 'val' });
      expect(event.fromAgent).toBe('a');
      expect(getDefaultTraceStore().size).toBe(1);
    });

    it('getDelegationChain uses default store', () => {
      const root = traceDelegation('a', 'b', 't1');
      const child = traceDelegation('b', 'c', 't2', {}, root.id);

      const chain = getDelegationChain(child.id);
      expect(chain).toHaveLength(2);
      expect(chain[0].event.fromAgent).toBe('a');
      expect(chain[1].event.fromAgent).toBe('b');
    });

    it('replayDelegation uses default store', async () => {
      const root = traceDelegation('a', 'b', 't1');
      const result = await replayDelegation(root.id);
      expect(result.status).toBe('completed');
      expect(result.steps).toHaveLength(1);
    });

    it('resetDefaultTraceStore clears state', () => {
      traceDelegation('a', 'b', 't1');
      expect(getDefaultTraceStore().size).toBe(1);

      resetDefaultTraceStore();
      expect(getDefaultTraceStore().size).toBe(0);
    });
  });
});
