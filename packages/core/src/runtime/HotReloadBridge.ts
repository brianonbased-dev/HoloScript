/**
 * HotReloadBridge.ts
 *
 * Thin wiring layer that connects HotReloadManager → ModuleResolver.
 *
 * When a .hs file changes on disk, the bridge:
 *   1. Calls `resolver.invalidate(canonicalPath)` — clears the AST cache
 *      so the next `resolver.load()` re-parses the updated source.
 *   2. Optionally fires a user-supplied `onReloaded` callback.
 *
 * This lives in `runtime/` rather than `compiler/` to avoid a circular
 * dependency (compiler/ must not import from runtime/).
 *
 * @module runtime/HotReloadBridge
 * @version 1.0.0
 */

import { HotReloadManager, type ReloadWatcher } from './HotReloadManager';
import { ModuleResolver } from '../compiler/ModuleResolver';

// =============================================================================
// TYPES
// =============================================================================

export type ModuleReloadCallback = (canonicalPath: string, version: number) => void;

export interface HotReloadBridgeOptions {
  /** Called after resolver cache is invalidated, before user onReloaded. */
  onInvalidated?: ModuleReloadCallback;
  /** Called after full successful reload sequence. */
  onReloaded?: ModuleReloadCallback;
  /** If a watcher throws, this receives the error instead of crashing. */
  onError?: (key: string, error: Error) => void;
}

// =============================================================================
// BRIDGE
// =============================================================================

export class HotReloadBridge {
  private readonly hotReload: HotReloadManager;
  private readonly resolver: ModuleResolver;
  private readonly opts: HotReloadBridgeOptions;

  /** Track unsubscribe fns keyed by canonicalPath */
  private unsubs = new Map<string, () => void>();

  constructor(
    hotReload: HotReloadManager,
    resolver: ModuleResolver,
    options: HotReloadBridgeOptions = {},
  ) {
    this.hotReload = hotReload;
    this.resolver = resolver;
    this.opts = options;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Watch a .hs file identified by its canonical path.
   *
   * When `hotReload.triggerReload(canonicalPath, newSource)` is called:
   *  - `resolver.invalidate()` is called immediately
   *  - `opts.onInvalidated` fires (if set)
   *  - `opts.onReloaded` fires (if set)
   *
   * Returns an unsubscribe fn for this specific watcher.
   */
  watchModule(canonicalPath: string, onReloaded?: ModuleReloadCallback): () => void {
    // Build a ReloadWatcher that invalidates the module cache
    const watcher: ReloadWatcher = (_content, _prevState, meta) => {
      try {
        this.resolver.invalidate(canonicalPath);
        this.opts.onInvalidated?.(canonicalPath, meta.version);
        onReloaded?.(canonicalPath, meta.version);
        this.opts.onReloaded?.(canonicalPath, meta.version);
      } catch (err) {
        if (this.opts.onError) {
          this.opts.onError(
            canonicalPath,
            err instanceof Error ? err : new Error(String(err)),
          );
        } else {
          throw err;
        }
      }
    };

    const unsub = this.hotReload.watch(canonicalPath, watcher);
    const bridgeUnsub = () => {
      unsub();
      this.unsubs.delete(canonicalPath);
    };
    this.unsubs.set(canonicalPath, bridgeUnsub);
    return bridgeUnsub;
  }

  /**
   * Stop watching a specific module.
   */
  unwatchModule(canonicalPath: string): void {
    const unsub = this.unsubs.get(canonicalPath);
    if (unsub) {
      unsub();
      this.unsubs.delete(canonicalPath);
    }
  }

  /**
   * Whether a module is currently being watched via this bridge.
   */
  isWatchingModule(canonicalPath: string): boolean {
    return this.unsubs.has(canonicalPath);
  }

  /**
   * Number of modules currently watched by this bridge.
   */
  get watchedCount(): number {
    return this.unsubs.size;
  }

  /**
   * Trigger a reload from the bridge — convenience wrapper that calls
   * `hotReload.triggerReload(canonicalPath, newSource)`.
   */
  triggerReload(canonicalPath: string, newSource: string): void {
    this.hotReload.triggerReload(canonicalPath, newSource);
  }

  /**
   * Stop watching ALL modules registered through this bridge.
   */
  dispose(): void {
    for (const unsub of this.unsubs.values()) {
      unsub();
    }
    this.unsubs.clear();
  }
}

export default HotReloadBridge;
