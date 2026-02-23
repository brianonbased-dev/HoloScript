/**
 * GameEngine — HoloScript+ Top-Level Runtime Facade
 *
 * Composes GameLoop + AssetPipeline + HotReloadManager into a
 * single ergonomic entry point:
 *
 *   const engine = new GameEngine();
 *   engine.addUpdateHandler('physics', myPhysicsFn);
 *   engine.start();
 *   // ...
 *   engine.stop();
 *
 * The engine does NOT depend on a renderer or HoloScript parser directly —
 * it provides lifecycle hooks so the caller can wire those in.
 *
 * @module runtime/GameEngine
 * @version 1.0.0
 */

import { GameLoop, type GameLoopOptions } from './GameLoop';
import { AssetPipeline, type AssetLoader } from './AssetPipeline';
import { HotReloadManager, type ReloadWatcher } from './HotReloadManager';

// =============================================================================
// TYPES
// =============================================================================

export type UpdateHandler = (delta: number, frame: number) => void;
export type EnginePhase = 'idle' | 'running' | 'paused' | 'stopped';

export interface GameEngineOptions extends GameLoopOptions {
  /** Enable hot-reload watcher integration. Default: false */
  hotReload?: boolean;
}

export interface EngineStats {
  phase: EnginePhase;
  frame: number;
  fps: number;
  assetCount: number;
}

// =============================================================================
// ENGINE
// =============================================================================

export class GameEngine {
  // ── Sub-systems ────────────────────────────────────────────────────────────
  public readonly loop: GameLoop;
  public readonly assets: AssetPipeline;
  public readonly hotReload: HotReloadManager;

  // ── State ──────────────────────────────────────────────────────────────────
  private _phase: EnginePhase = 'idle';
  private _updateHandlers = new Map<string, UpdateHandler>();
  private _frame = 0;
  private _lastTickTime = 0;
  private _fps = 0;

  constructor(options: GameEngineOptions = {}) {
    // Build game loop — delegates all tick work via our internal _onUpdate
    this.loop = new GameLoop({
      ...options,
      onUpdate: (delta: number) => this._onUpdate(delta),
    });

    this.assets = new AssetPipeline();
    this.hotReload = new HotReloadManager();
  }

  // =============================================================================
  // LIFECYCLE
  // =============================================================================

  /** Start the engine (and the internal game loop). */
  start(): void {
    if (this._phase === 'running') return;
    this._phase = 'running';
    this.loop.start();
  }

  /** Stop the engine permanently. */
  stop(): void {
    this.loop.stop();
    this._phase = 'stopped';
  }

  /** Pause the update loop (keep state intact). */
  pause(): void {
    this.loop.pause();
    this._phase = 'paused';
  }

  /** Resume from paused state. */
  resume(): void {
    this.loop.resume();
    this._phase = 'running';
  }

  // =============================================================================
  // UPDATE HANDLERS
  // =============================================================================

  /**
   * Register a named update handler that runs every tick.
   * Multiple handlers run in insertion order.
   */
  addUpdateHandler(name: string, fn: UpdateHandler): void {
    this._updateHandlers.set(name, fn);
  }

  /** Remove a previously-registered update handler. */
  removeUpdateHandler(name: string): boolean {
    return this._updateHandlers.delete(name);
  }

  /** List all registered handler names. */
  getHandlerNames(): string[] {
    return Array.from(this._updateHandlers.keys());
  }

  // =============================================================================
  // ASSETS
  // =============================================================================

  /**
   * Register a typed asset loader and return the engine (fluent API).
   * Delegates to this.assets.registerLoader().
   */
  registerLoader<T = unknown>(type: string, loader: AssetLoader<T>): this {
    this.assets.registerLoader(type, loader);
    return this;
  }

  /**
   * Preload an asset by type and path. Resolves when loaded or throws.
   * Delegates to this.assets.load().
   */
  async preload<T = unknown>(type: string, path: string): Promise<T> {
    return this.assets.load<T>(type, path);
  }

  // =============================================================================
  // HOT RELOAD
  // =============================================================================

  /**
   * Watch a module by key. On reload, the watcher fn is called.
   * Returns an unsubscribe function.
   */
  watch(key: string, fn: ReloadWatcher): () => void {
    return this.hotReload.watch(key, fn);
  }

  /**
   * Trigger a hot-reload for the given key.
   */
  reload<TContent = unknown, TState = unknown>(
    key: string,
    content: TContent,
    oldState?: TState,
  ): void {
    this.hotReload.triggerReload(key, content, oldState);
  }

  // =============================================================================
  // STATS
  // =============================================================================

  get phase(): EnginePhase {
    return this._phase;
  }

  get frame(): number {
    return this._frame;
  }

  get fps(): number {
    return this._fps;
  }

  /** Snapshot of engine state for debugging/telemetry. */
  getStats(): EngineStats {
    return {
      phase: this._phase,
      frame: this._frame,
      fps: this._fps,
      assetCount: this.assets.loadedCount,
    };
  }

  // =============================================================================
  // INTERNAL
  // =============================================================================

  private _onUpdate(delta: number): void {
    this._frame++;

    // Rolling FPS (simple 1-frame sample; callers can smooth externally)
    const now = Date.now();
    if (this._lastTickTime > 0) {
      const elapsed = now - this._lastTickTime;
      this._fps = elapsed > 0 ? 1000 / elapsed : 0;
    }
    this._lastTickTime = now;

    // Dispatch to all registered update handlers
    for (const handler of this._updateHandlers.values()) {
      handler(delta, this._frame);
    }
  }
}

export default GameEngine;
