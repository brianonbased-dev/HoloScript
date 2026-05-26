/**
 * @holoscript/runtime - PersistentExpiryCoordinator
 *
 * Consumes the persistence lifecycle emitted by PersistentTrait
 * (packages/core/src/traits/PersistentTrait.ts) and reacts to TTL expiry.
 * Closes the missing listener side (Pattern E: emit-without-listener) — before
 * this, `persistent_expired` fired every time a TTL lapsed but nothing
 * invalidated views, re-fetched, or notified.
 *
 * On `persistent_expired` the coordinator marks the key invalidated and, if a
 * recovery provider is registered for that key, recovers a fresh value and
 * surfaces it via `persistent_recovered`. Mirrors the other Pattern E
 * coordinators.
 */

import type { EventBus } from './events.js';

export type NodeRef = string | { id?: string; [k: string]: unknown };

export interface PersistentAttachedEvent {
  node: NodeRef;
  key: string;
  value: unknown;
  backend?: string;
}

export interface PersistentUpdatedEvent {
  node: NodeRef;
  key: string;
  value: unknown;
  backend?: string;
}

export interface PersistentExpiredEvent {
  node: NodeRef;
  key: string;
}

export interface InvalidationRecord {
  key: string;
  nodeId: string;
  /** Last known value before expiry (for diffing / optimistic UI). */
  lastValue: unknown;
  expiredAt: number;
  recovered: boolean;
  recoveredValue: unknown;
}

/** Recovery provider: given an expired key, produce a fresh value (or undefined). */
export type RecoveryProvider = (key: string, nodeId: string) => unknown;
export type ExpiryHandler = (record: InvalidationRecord) => void;

export interface PersistentExpiryCoordinatorOptions {
  bus: EventBus;
  onExpired?: ExpiryHandler;
}

function resolveNodeId(node: NodeRef): string {
  if (typeof node === 'string') return node;
  if (node && typeof node.id === 'string') return node.id;
  return String(node);
}

export class PersistentExpiryCoordinator {
  private readonly bus: EventBus;
  /** Live values observed via attach/update, keyed by key. */
  private liveValues = new Map<string, unknown>();
  private invalidations = new Map<string, InvalidationRecord>();
  private recoveryProviders = new Map<string, RecoveryProvider>();
  private handlers = new Set<ExpiryHandler>();
  private unsubscribers: Array<() => void> = [];
  private _started = false;

  constructor(options: PersistentExpiryCoordinatorOptions) {
    this.bus = options.bus;
    if (options.onExpired) this.handlers.add(options.onExpired);
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    this.unsubscribers.push(
      this.bus.on<PersistentAttachedEvent>('persistent_attached', (e) =>
        this.liveValues.set(e.key, e.value)
      )
    );
    this.unsubscribers.push(
      this.bus.on<PersistentUpdatedEvent>('persistent_updated', (e) => {
        this.liveValues.set(e.key, e.value);
        // A fresh write clears any prior invalidation for the key.
        this.invalidations.delete(e.key);
      })
    );
    this.unsubscribers.push(
      this.bus.on<PersistentExpiredEvent>('persistent_expired', (e) => this.onExpired(e))
    );
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this._started = false;
  }

  /** Register a recovery provider for a key (re-fetch / regenerate on expiry). */
  registerRecovery(key: string, provider: RecoveryProvider): void {
    this.recoveryProviders.set(key, provider);
  }

  private onExpired(e: PersistentExpiredEvent): void {
    const nodeId = resolveNodeId(e.node);
    const record: InvalidationRecord = {
      key: e.key,
      nodeId,
      lastValue: this.liveValues.get(e.key) ?? null,
      expiredAt: Date.now(),
      recovered: false,
      recoveredValue: undefined,
    };

    const provider = this.recoveryProviders.get(e.key);
    if (provider) {
      const recovered = provider(e.key, nodeId);
      if (recovered !== undefined) {
        record.recovered = true;
        record.recoveredValue = recovered;
        this.liveValues.set(e.key, recovered);
        // Surface the recovered value so views / stores can refresh.
        this.bus.emit('persistent_recovered', {
          node: e.node,
          key: e.key,
          value: recovered,
        });
      }
    }

    this.invalidations.set(e.key, record);
    this.handlers.forEach((h) => h(record));
  }

  // --- query API -----------------------------------------------------------

  isInvalidated(key: string): boolean {
    return this.invalidations.has(key);
  }
  getInvalidation(key: string): InvalidationRecord | undefined {
    return this.invalidations.get(key);
  }
  invalidatedKeys(): string[] {
    return Array.from(this.invalidations.keys());
  }
  onExpiry(handler: ExpiryHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

export function createPersistentExpiryCoordinator(
  options: PersistentExpiryCoordinatorOptions
): PersistentExpiryCoordinator {
  const coordinator = new PersistentExpiryCoordinator(options);
  coordinator.start();
  return coordinator;
}
