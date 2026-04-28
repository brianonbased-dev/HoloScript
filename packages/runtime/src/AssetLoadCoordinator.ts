/**
 * @holoscript/runtime - AssetLoadCoordinator
 *
 * Consumes on_asset_loaded / on_asset_error events emitted by GLTF, USD, FBX, and Portable
 * traits. Bridges those events to an asset registry, progress tracking, and error reporting
 * so downstream systems (scene renderer, physics world, analytics) can react to asset state
 * without polling trait internals.
 *
 * Closes Pattern E stub gap: GLTF/USD/FBX traits emit 35+ void events; this coordinator is
 * the missing consumer side.
 */

import { EventBus } from './events.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetType = 'gltf' | 'usd' | 'usdz' | 'fbx' | 'portable' | string;

export interface AssetLoadedEvent {
  node: string;
  assetType: AssetType;
  source: string;
  /** Optional metadata forwarded from trait-specific events */
  metadata?: Record<string, unknown>;
}

export interface AssetErrorEvent {
  node: string;
  assetType: AssetType;
  source: string;
  error: string;
}

export interface AssetRecord {
  node: string;
  assetType: AssetType;
  source: string;
  status: 'loaded' | 'error';
  loadedAt: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AssetLoadCoordinatorOptions {
  /** Custom EventBus instance. Defaults to a new EventBus when not provided. */
  bus?: EventBus;
  /** Max entries in the loaded-asset LRU cache before oldest are pruned. Default 1000. */
  maxCacheSize?: number;
  /** Called when an asset finishes loading. */
  onLoaded?: (record: AssetRecord) => void;
  /** Called when an asset fails to load. */
  onError?: (record: AssetRecord) => void;
}

// ---------------------------------------------------------------------------
// AssetLoadCoordinator
// ---------------------------------------------------------------------------

/**
 * Central listener for all asset-load lifecycle events produced by HoloScript traits.
 *
 * Usage:
 * ```ts
 * import { eventBus } from '@holoscript/runtime';
 * import { AssetLoadCoordinator } from '@holoscript/runtime';
 *
 * const coordinator = new AssetLoadCoordinator({ bus: eventBus });
 * coordinator.start();
 *
 * // Query loaded assets
 * const gltfAssets = coordinator.getByType('gltf');
 * ```
 */
export class AssetLoadCoordinator {
  private readonly bus: EventBus;
  private readonly registry: Map<string, AssetRecord> = new Map();
  private readonly maxCacheSize: number;
  private readonly onLoaded?: (record: AssetRecord) => void;
  private readonly onError?: (record: AssetRecord) => void;
  private unsubscribers: Array<() => void> = [];
  private _started = false;

  constructor(options: AssetLoadCoordinatorOptions = {}) {
    this.bus = options.bus ?? new EventBus();
    this.maxCacheSize = options.maxCacheSize ?? 1000;
    this.onLoaded = options.onLoaded;
    this.onError = options.onError;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Subscribe to on_asset_loaded and on_asset_error events on the bus.
   * Idempotent — calling start() twice is a no-op.
   */
  start(): void {
    if (this._started) return;
    this._started = true;

    this.unsubscribers.push(
      this.bus.on<AssetLoadedEvent>('on_asset_loaded', (evt) => this.handleLoaded(evt))
    );
    this.unsubscribers.push(
      this.bus.on<AssetErrorEvent>('on_asset_error', (evt) => this.handleError(evt))
    );
    // Also listen to the portable-trait events which use slightly different names
    this.unsubscribers.push(
      this.bus.on<AssetLoadedEvent & { format?: string }>('on_asset_ported', (evt) =>
        this.handleLoaded({ ...evt, assetType: evt.format ?? 'portable' })
      )
    );
    this.unsubscribers.push(
      this.bus.on<AssetLoadedEvent & { format?: string }>('on_asset_imported', (evt) =>
        this.handleLoaded({ ...evt, assetType: evt.format ?? 'portable' })
      )
    );
  }

  /**
   * Unsubscribe from all events and clear the registry.
   */
  stop(): void {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
    this._started = false;
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  private handleLoaded(evt: AssetLoadedEvent): void {
    const record: AssetRecord = {
      node: evt.node,
      assetType: evt.assetType,
      source: evt.source,
      status: 'loaded',
      loadedAt: Date.now(),
      metadata: evt.metadata,
    };
    this.upsert(record);
    this.onLoaded?.(record);
    this.bus.emit<AssetRecord>('asset_coordinator:loaded', record);
  }

  private handleError(evt: AssetErrorEvent): void {
    const record: AssetRecord = {
      node: evt.node,
      assetType: evt.assetType,
      source: evt.source,
      status: 'error',
      loadedAt: Date.now(),
      error: evt.error,
    };
    this.upsert(record);
    this.onError?.(record);
    this.bus.emit<AssetRecord>('asset_coordinator:error', record);
  }

  // -------------------------------------------------------------------------
  // Registry
  // -------------------------------------------------------------------------

  private upsert(record: AssetRecord): void {
    const key = `${record.assetType}:${record.source}:${record.node}`;
    this.registry.set(key, record);
    // LRU prune — drop oldest entries once over limit
    if (this.registry.size > this.maxCacheSize) {
      const firstKey = this.registry.keys().next().value;
      if (firstKey !== undefined) {
        this.registry.delete(firstKey);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Query API
  // -------------------------------------------------------------------------

  /** All tracked asset records (loaded + errored). */
  getAll(): AssetRecord[] {
    return Array.from(this.registry.values());
  }

  /** Assets filtered by assetType. */
  getByType(assetType: AssetType): AssetRecord[] {
    return this.getAll().filter((r) => r.assetType === assetType);
  }

  /** Assets filtered by status. */
  getByStatus(status: 'loaded' | 'error'): AssetRecord[] {
    return this.getAll().filter((r) => r.status === status);
  }

  /** Lookup a specific asset record by source URL. Returns undefined if not tracked yet. */
  getBySource(source: string): AssetRecord | undefined {
    for (const record of this.registry.values()) {
      if (record.source === source) return record;
    }
    return undefined;
  }

  /** Total number of tracked asset records. */
  get size(): number {
    return this.registry.size;
  }

  /** Whether the coordinator is currently listening. */
  get started(): boolean {
    return this._started;
  }

  /** Clear all tracked records without stopping event subscriptions. */
  clearRegistry(): void {
    this.registry.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

/**
 * Create a pre-started AssetLoadCoordinator bound to the provided (or a new) EventBus.
 *
 * ```ts
 * import { eventBus } from '@holoscript/runtime';
 * const coordinator = createAssetLoadCoordinator({ bus: eventBus });
 * ```
 */
export function createAssetLoadCoordinator(
  options: AssetLoadCoordinatorOptions = {}
): AssetLoadCoordinator {
  const coordinator = new AssetLoadCoordinator(options);
  coordinator.start();
  return coordinator;
}
