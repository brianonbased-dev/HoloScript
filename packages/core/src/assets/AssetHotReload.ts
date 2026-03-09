/**
 * AssetHotReload.ts
 *
 * Live asset hot-reloading for the editor: watches for changes,
 * invalidates caches, and notifies subscribers.
 *
 * @module assets
 */

// =============================================================================
// TYPES
// =============================================================================

export type ChangeType = 'created' | 'modified' | 'deleted';

export interface AssetChange {
  assetId: string;
  path: string;
  changeType: ChangeType;
  timestamp: number;
  previousHash?: string;
  newHash?: string;
}

export interface HotReloadSubscription {
  id: string;
  pattern: string; // Glob-like pattern or asset ID
  callback: (change: AssetChange) => void;
}

export interface HotReloadStats {
  totalReloads: number;
  lastReloadTime: number;
  watchedPaths: number;
  activeSubscriptions: number;
}

// =============================================================================
// ASSET HOT RELOAD SYSTEM
// =============================================================================

let _subId = 0;

export class AssetHotReload {
  private subscriptions: Map<string, HotReloadSubscription> = new Map();
  private watchedAssets: Map<string, { path: string; hash: string }> = new Map();
  private changeHistory: AssetChange[] = [];
  private enabled = true;
  private totalReloads = 0;
  private lastReloadTime = 0;
  private debounceMs = 100;
  private pendingChanges: Map<string, AssetChange> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  isEnabled(): boolean {
    return this.enabled;
  }

  setDebounceMs(ms: number): void {
    this.debounceMs = Math.max(0, ms);
  }

  // ---------------------------------------------------------------------------
  // Watch Registration
  // ---------------------------------------------------------------------------

  watch(assetId: string, path: string, hash: string): void {
    this.watchedAssets.set(assetId, { path, hash });
  }

  unwatch(assetId: string): void {
    this.watchedAssets.delete(assetId);
  }

  isWatched(assetId: string): boolean {
    return this.watchedAssets.has(assetId);
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  subscribe(pattern: string, callback: (change: AssetChange) => void): string {
    const id = `hotreload_sub_${_subId++}`;
    this.subscriptions.set(id, { id, pattern, callback });
    return id;
  }

  unsubscribe(id: string): void {
    this.subscriptions.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Change Detection
  // ---------------------------------------------------------------------------

  /**
   * Report a file change (typically from a file watcher).
   * Changes are debounced before notification.
   */
  reportChange(assetId: string, newHash: string, changeType: ChangeType = 'modified'): void {
    if (!this.enabled) return;

    const watched = this.watchedAssets.get(assetId);
    if (!watched && changeType !== 'created') return;

    const change: AssetChange = {
      assetId,
      path: watched?.path ?? assetId,
      changeType,
      timestamp: Date.now(),
      previousHash: watched?.hash,
      newHash,
    };

    this.pendingChanges.set(assetId, change);

    // Update the stored hash
    if (changeType === 'deleted') {
      this.watchedAssets.delete(assetId);
    } else if (watched) {
      watched.hash = newHash;
    }

    // Debounce
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), this.debounceMs);
  }

  /**
   * Immediately process all pending changes.
   */
  flush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    for (const change of this.pendingChanges.values()) {
      this.notifySubscribers(change);
      this.changeHistory.push(change);
      this.totalReloads++;
      this.lastReloadTime = change.timestamp;
    }

    this.pendingChanges.clear();
  }

  private notifySubscribers(change: AssetChange): void {
    for (const sub of this.subscriptions.values()) {
      if (
        this.matchesPattern(change.assetId, sub.pattern) ||
        this.matchesPattern(change.path, sub.pattern)
      ) {
        sub.callback(change);
      }
    }
  }

  private matchesPattern(value: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern === value) return true;

    // Simple glob: *.ext
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1);
      return value.endsWith(ext);
    }

    // Prefix match: path/**
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      return value.startsWith(prefix);
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getChangeHistory(): AssetChange[] {
    return [...this.changeHistory];
  }

  getRecentChanges(count: number): AssetChange[] {
    return this.changeHistory.slice(-count);
  }

  getStats(): HotReloadStats {
    return {
      totalReloads: this.totalReloads,
      lastReloadTime: this.lastReloadTime,
      watchedPaths: this.watchedAssets.size,
      activeSubscriptions: this.subscriptions.size,
    };
  }

  clearHistory(): void {
    this.changeHistory = [];
  }
}
