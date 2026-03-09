/**
 * HotReloadManager.ts — Sprint 8
 *
 * Manages live module reload with:
 *  - Per-key watcher registration / deregistration
 *  - State migration helper for preserving entity state across reloads
 *  - Version tracking (increments per triggerReload call)
 *  - Isolated watcher error handling (one failure does not block others)
 *
 * Design:
 *  - `watch(key, fn)` registers a callback. Multiple watchers per key allowed.
 *  - `triggerReload(key, content, oldState?)` calls each watcher in order.
 *    If a watcher throws, `onError` is called and the next watcher still runs.
 *  - `migrateState(old, newDefaults)` produces a merged state object:
 *    fields present in newDefaults take their value from oldState (preserving
 *    live game values), and any field in newDefaults not in oldState gets its
 *    default value from newDefaults.
 */

export type ReloadWatcher<TContent = unknown, TState = unknown> = (
  content: TContent,
  prevState: TState | undefined,
  meta: { key: string; version: number }
) => void;

export interface HotReloadManagerOptions {
  onError?: (key: string, error: Error) => void;
}

export class HotReloadManager {
  private watchers = new Map<string, Set<ReloadWatcher>>();
  private versions = new Map<string, number>();
  private readonly onError?: (key: string, error: Error) => void;

  constructor(options: HotReloadManagerOptions = {}) {
    this.onError = options.onError;
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /** Register a watcher for a module key. Returns an unsubscribe function. */
  watch(key: string, fn: ReloadWatcher): () => void {
    if (!this.watchers.has(key)) this.watchers.set(key, new Set());
    this.watchers.get(key)!.add(fn);
    return () => this.unwatch(key, fn);
  }

  /** Remove a specific watcher. */
  unwatch(key: string, fn: ReloadWatcher): void {
    this.watchers.get(key)?.delete(fn);
  }

  /** Remove ALL watchers for a key. */
  unwatchAll(key: string): void {
    this.watchers.get(key)?.clear();
  }

  /** Whether at least one watcher is registered for the key. */
  isWatched(key: string): boolean {
    const set = this.watchers.get(key);
    return !!set && set.size > 0;
  }

  // ---------------------------------------------------------------------------
  // Reloading
  // ---------------------------------------------------------------------------

  /**
   * Trigger a reload for the given key.
   *
   * @param key       Module identifier (file path, scene name, etc.)
   * @param content   New module content (AST, raw code, etc.)
   * @param oldState  Previous runtime state to pass to watchers for migration
   */
  triggerReload<TContent = unknown, TState = unknown>(
    key: string,
    content: TContent,
    oldState?: TState
  ): void {
    // Increment version even if no watchers
    const version = (this.versions.get(key) ?? 0) + 1;
    this.versions.set(key, version);

    const meta = { key, version };
    const set = this.watchers.get(key);
    if (!set || set.size === 0) return;

    for (const fn of set) {
      try {
        fn(content, oldState, meta);
      } catch (err) {
        if (this.onError) {
          this.onError(key, err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // State migration
  // ---------------------------------------------------------------------------

  /**
   * Produce a merged state after a reload.
   *
   * Strategy:
   *  - Start with `newState` (the defaults from the new module).
   *  - For each key in `newState`, if `oldState` also has that key, prefer
   *    the old value (preserves live runtime values like hp, position, etc.).
   *  - Keys in `oldState` NOT present in `newState` are discarded (the new
   *    module removed that field).
   *
   * If `oldState` is null/undefined, returns `newState` unchanged.
   */
  migrateState<T extends Record<string, unknown>>(oldState: T | null | undefined, newState: T): T {
    if (!oldState) return { ...newState };

    const result = { ...newState };
    for (const key of Object.keys(newState) as (keyof T)[]) {
      if (key in oldState) {
        result[key] = oldState[key] as any;
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Version tracking
  // ---------------------------------------------------------------------------

  /** How many times triggerReload has been called for this key. */
  version(key: string): number {
    return this.versions.get(key) ?? 0;
  }
}
