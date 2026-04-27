/**
 * AssetLoadCoordinator — first of the 4 consumer-bus infrastructures
 * identified by /stub-audit Phase 3.5 (2026-04-27).
 *
 * **Pattern E remediation**:
 * Core traits GLTFTrait, USDTrait, FBXTrait emit asset-loading lifecycle
 * events (`gltf:loaded`, `usd:loaded`, `fbx:loaded`, `gltf:loading_progress`,
 * `*:load_error`, `on_asset_*`) that previously had ZERO listeners across
 * runtime/studio/r3f-renderer/engine. /stub-audit found 35 void events,
 * 69 compiler refs across the three traits — the highest-leverage
 * consumer-bus to build first per the systemic Pattern E task
 * (`task_1777281302813_eezs`).
 *
 * **Contract**:
 * Constructor takes a duck-typed `EventSource` (anything with `on(event,
 * handler)`). Typically the engine's TraitContextFactory (which provides
 * `on()` at packages/engine/src/runtime/TraitContextFactory.ts:222), but
 * the coordinator is decoupled from any specific source — tests and
 * future SSR/headless paths can pass mock sources.
 *
 * The coordinator subscribes once at construction to the full asset-load
 * event vocabulary, tracks state per asset URL, aggregates progress, and
 * exposes a unified `subscribe()` surface for downstream consumers (asset
 * caches, scene loading progress UI, prefetch heuristics).
 *
 * **Why this is the consumer-bus pattern, not a TraitHandler**:
 * The /critic batch-6 verdict on the per-trait wrapper pattern (RULING 2)
 * said wiring should be one-engine-one-trait. But the consumer side is
 * different — multiple traits emit into a SHARED vocabulary (the
 * `on_asset_loaded` channel, the `*:load_error` shape) and a single bus
 * handles all of them. Per-trait consumers would duplicate the asset
 * cache + progress aggregator three times. This is the right shape for
 * the receiver side.
 *
 * **Replication**: SecurityEventBus (RBAC+SSO+Quota+Tenant), GenerativeJobMonitor
 * (AiInpainting+AiTextureGen+ControlNet+DiffusionRealtime), and
 * SessionPresenceCoordinator (SharePlay+SpatialVoice+WorldHeartbeat) all
 * follow this same shape. Build them in this directory using this file
 * as the template.
 */

/** Duck-typed event source — TraitContextFactory matches this shape. */
export interface AssetLoadEventSource {
  on(event: string, handler: (payload: unknown) => void): void;
}

/** Asset loading lifecycle states. */
export type AssetLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

/** Single asset's tracked state. */
export interface AssetLoadState {
  /** Asset URL or modelId. */
  url: string;
  /** Asset format — derived from the event prefix that loaded it. */
  format: 'gltf' | 'usd' | 'fbx' | 'unknown';
  status: AssetLoadStatus;
  /** Progress in [0, 1] when status === 'loading'. */
  progress: number;
  /** Error message when status === 'error'. */
  error?: string;
  /** Timestamp the asset entered current state. */
  updatedAt: number;
}

/** Aggregate stats across all tracked assets. */
export interface AssetLoadStats {
  total: number;
  loading: number;
  loaded: number;
  failed: number;
  /** Mean progress across loading assets in [0, 1]. */
  averageProgress: number;
}

export type AssetLoadListener = (state: AssetLoadState) => void;

/**
 * The full asset-load event vocabulary the coordinator subscribes to.
 * Listed explicitly so future agents know exactly which trait emits feed
 * the bus. Adding a new asset format means: emit the same lifecycle
 * shape on `<format>:loaded` / `<format>:loading_progress` / `<format>:load_error`
 * and add the format to the union below.
 */
const ASSET_LOAD_EVENTS = [
  // GLTF
  'gltf:loaded',
  'gltf:loading_progress',
  'gltf:load_error',
  'gltf:load_started',
  // USD
  'usd:loaded',
  'usd:loading_progress',
  'usd:load_error',
  'usd:load_started',
  // FBX
  'fbx:loaded',
  'fbx:loading_progress',
  'fbx:load_error',
  'fbx:load_started',
  // Format-agnostic shared channel — all three traits ALSO emit these
  // for cross-format observers that don't care about the source format.
  'on_asset_loaded',
  'on_asset_progress',
  'on_asset_error',
] as const;

export class AssetLoadCoordinator {
  private states = new Map<string, AssetLoadState>();
  private listeners = new Set<AssetLoadListener>();

  constructor(source: AssetLoadEventSource) {
    for (const event of ASSET_LOAD_EVENTS) {
      source.on(event, (payload: unknown) => this.handleEvent(event, payload));
    }
  }

  private handleEvent(event: string, payload: unknown): void {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as Record<string, unknown>;
    const url = (p.url as string) ?? (p.modelId as string) ?? (p.assetId as string);
    if (!url || typeof url !== 'string') return;

    const format = this.formatFromEvent(event);
    const phase = this.phaseFromEvent(event);

    const existing = this.states.get(url);
    const next: AssetLoadState = {
      url,
      format: existing?.format && existing.format !== 'unknown' ? existing.format : format,
      status: 'idle',
      progress: existing?.progress ?? 0,
      updatedAt: Date.now(),
    };

    if (phase === 'started') {
      next.status = 'loading';
      next.progress = 0;
    } else if (phase === 'progress') {
      next.status = 'loading';
      const progressVal = p.progress;
      if (typeof progressVal === 'number' && progressVal >= 0 && progressVal <= 1) {
        next.progress = progressVal;
      }
    } else if (phase === 'loaded') {
      next.status = 'loaded';
      next.progress = 1;
    } else if (phase === 'error') {
      next.status = 'error';
      next.error =
        typeof p.error === 'string' ? p.error : typeof p.message === 'string' ? p.message : 'unknown error';
    }

    this.states.set(url, next);
    this.notifyListeners(next);
  }

  private formatFromEvent(event: string): AssetLoadState['format'] {
    if (event.startsWith('gltf:')) return 'gltf';
    if (event.startsWith('usd:')) return 'usd';
    if (event.startsWith('fbx:')) return 'fbx';
    return 'unknown';
  }

  private phaseFromEvent(event: string): 'started' | 'progress' | 'loaded' | 'error' | 'unknown' {
    if (event.endsWith(':loaded') || event === 'on_asset_loaded') return 'loaded';
    if (event.endsWith(':load_error') || event === 'on_asset_error') return 'error';
    if (event.endsWith(':loading_progress') || event === 'on_asset_progress') return 'progress';
    if (event.endsWith(':load_started')) return 'started';
    return 'unknown';
  }

  private notifyListeners(state: AssetLoadState): void {
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (_) {
        // Bus discipline: one listener throwing must not crash other listeners
        // (matches StudioBus pattern in packages/studio/src/hooks/useStudioBus.ts).
      }
    }
  }

  /** Subscribe to all asset-state changes. Returns an unsubscribe function. */
  subscribe(listener: AssetLoadListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Read the current state of one asset (or undefined if never seen). */
  getAssetState(url: string): AssetLoadState | undefined {
    return this.states.get(url);
  }

  /** Read all tracked asset states (snapshot copy — safe to iterate). */
  getAllStates(): AssetLoadState[] {
    return Array.from(this.states.values());
  }

  /** Aggregate stats across all tracked assets. */
  getStats(): AssetLoadStats {
    const all = Array.from(this.states.values());
    const loading = all.filter((s) => s.status === 'loading');
    const loaded = all.filter((s) => s.status === 'loaded');
    const failed = all.filter((s) => s.status === 'error');
    const averageProgress =
      loading.length > 0 ? loading.reduce((sum, s) => sum + s.progress, 0) / loading.length : 0;
    return {
      total: all.length,
      loading: loading.length,
      loaded: loaded.length,
      failed: failed.length,
      averageProgress,
    };
  }

  /** Clear all tracked state — typically called on scene change. */
  reset(): void {
    this.states.clear();
  }

  /** Number of distinct event types this coordinator subscribes to (diagnostic). */
  get subscribedEventCount(): number {
    return ASSET_LOAD_EVENTS.length;
  }
}
