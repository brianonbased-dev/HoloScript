/**
 * State-invalidation registry — consumer for `persistent_expired`.
 *
 * Closes a Pattern-E capability gap: PersistentTrait.onUpdate emits
 * `persistent_expired` on TTL expiry (packages/core/src/traits/PersistentTrait.ts),
 * but NOTHING subscribes to it — the event was dispatched into the void, so a
 * downstream reader (a cache layer, a Studio panel, an agent re-hydration path)
 * had no way to learn that a persisted value had been cleared and needed refetch.
 *
 * This module registers a real consumer on the runtime event-system
 * (packages/core/src/runtime/event-system.ts, Stage-4 local listeners) that
 * records every expiry into a queryable registry. Readers call `wasInvalidated`
 * / `consume` to detect staleness and trigger a refetch — i.e. it surfaces the
 * cleared value rather than letting expiry be silent.
 *
 * Pure-core: no I/O, no external decoder/renderer dependency. The behavior is
 * locked by state-invalidation.test.ts with a failing-if-broken assertion
 * (a key that expired IS recorded; a key that did not is NOT).
 *
 * **See**: board task task_1779744793932_tfmr (capability-gap stub-wiring batch).
 */

import { onEvent, type EventSystemContext } from './event-system';
import type { HoloScriptValue } from '../types';

/** A single recorded state invalidation. */
export interface InvalidationRecord {
  /** The persistence key that expired. */
  key: string;
  /** Wall-clock time the invalidation was recorded (ms epoch). */
  at: number;
  /** Originating node id, when the event payload carried one. */
  nodeId?: string;
}

/**
 * Tracks keys whose persisted value has been invalidated (TTL expiry).
 * A reader checks `wasInvalidated(key)` before trusting a cached value and
 * `consume(key)` once it has refetched (read-and-clear acknowledgement).
 */
export class StateInvalidationRegistry {
  private records = new Map<string, InvalidationRecord>();

  /** Record an invalidation for `key`. No-op on an empty/invalid key. */
  record(key: string, nodeId?: string): void {
    if (typeof key !== 'string' || key.length === 0) return;
    this.records.set(key, { key, at: Date.now(), nodeId });
  }

  /** True if `key` has an outstanding (unacknowledged) invalidation. */
  wasInvalidated(key: string): boolean {
    return this.records.has(key);
  }

  /** Peek the invalidation record without acknowledging it. */
  get(key: string): InvalidationRecord | undefined {
    return this.records.get(key);
  }

  /**
   * Read-and-clear: returns the record (if any) and removes it, so a reader
   * that has refetched the value acknowledges the invalidation exactly once.
   */
  consume(key: string): InvalidationRecord | undefined {
    const record = this.records.get(key);
    this.records.delete(key);
    return record;
  }

  /** All outstanding invalidations. */
  list(): InvalidationRecord[] {
    return Array.from(this.records.values());
  }

  /** Drop all outstanding invalidations. */
  clear(): void {
    this.records.clear();
  }

  /** Count of outstanding invalidations. */
  get size(): number {
    return this.records.size;
  }
}

/**
 * Process-wide default registry. Most callers can share this; pass an explicit
 * registry to {@link attachStateInvalidationConsumer} for isolation (e.g. tests).
 */
export const defaultStateInvalidationRegistry = new StateInvalidationRegistry();

/**
 * The handler registered for `persistent_expired`. Exposed for direct unit
 * testing without standing up the full event-system dispatch chain.
 */
export function makeStateInvalidationHandler(
  registry: StateInvalidationRegistry
): (data?: HoloScriptValue) => void {
  return (data?: HoloScriptValue) => {
    const payload = (data ?? {}) as { key?: unknown; node?: { id?: unknown } };
    if (typeof payload.key === 'string') {
      const nodeId =
        payload.node && typeof payload.node.id === 'string' ? payload.node.id : undefined;
      registry.record(payload.key, nodeId);
    }
  };
}

/**
 * Wire the registry as a consumer of `persistent_expired` on a runtime
 * event-system context. After this call, any `persistent_expired` event that
 * flows through `emit(..., ctx)` — including those emitted by PersistentTrait
 * via a TraitContext bound to this ctx — records an invalidation.
 *
 * @returns the registry (the passed one, or the process-wide default).
 */
export function attachStateInvalidationConsumer(
  ctx: EventSystemContext,
  registry: StateInvalidationRegistry = defaultStateInvalidationRegistry
): StateInvalidationRegistry {
  onEvent('persistent_expired', makeStateInvalidationHandler(registry), ctx);
  return registry;
}
