/**
 * State Synchronizer Implementation
 *
 * Synchronized state management with ownership, versioning,
 * and conflict resolution.
 *
 * @module network
 */

import {
  IStateSynchronizer,
  ISyncStateEntry,
  IStateSnapshot,
  ISyncConfig,
  StateOrigin,
  SYNC_DEFAULTS,
} from './NetworkTypes';

/**
 * State change callback
 */
type StateChangeCallback<T = unknown> = (entry: ISyncStateEntry<T>) => void;

/**
 * State synchronizer implementation
 */
export class StateSynchronizerImpl implements IStateSynchronizer {
  private localPeerId: string;
  private config: Required<ISyncConfig>;
  private states: Map<string, ISyncStateEntry> = new Map();
  private history: IStateSnapshot[] = [];
  private changeCallbacks: Map<string, Set<StateChangeCallback>> = new Map();
  private globalChangeCallbacks: Set<StateChangeCallback> = new Set();
  private tick: number = 0;
  private _isPaused: boolean = false;

  constructor(localPeerId: string, config: Partial<ISyncConfig> = {}) {
    this.localPeerId = localPeerId;
    this.config = { ...SYNC_DEFAULTS, ...config };
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  public set<T>(key: string, value: T, config?: ISyncConfig): void {
    const existing = this.states.get(key);
    const mergedConfig = { ...this.config, ...config };

    // Check ownership
    if (existing && existing.ownerId && existing.ownerId !== this.localPeerId) {
      if (mergedConfig.mode === 'authoritative') {
        throw new Error(`Cannot modify state '${key}' owned by '${existing.ownerId}'`);
      }
    }

    const version = existing ? existing.version + 1 : 1;
    const ownerId =
      mergedConfig.ownership === 'creator'
        ? (existing?.ownerId ?? this.localPeerId)
        : mergedConfig.ownership === 'host'
          ? undefined
          : this.localPeerId;

    const entry: ISyncStateEntry<T> = {
      key,
      value,
      version,
      ownerId,
      timestamp: Date.now(),
      origin: 'local',
    };

    this.states.set(key, entry as ISyncStateEntry);
    this.notifyStateChange(key, entry);

    // Auto-sync if immediate
    if (mergedConfig.frequency === 'immediate' && !this._isPaused) {
      this.sync();
    }
  }

  public get<T>(key: string): T | undefined {
    const entry = this.states.get(key);
    return entry ? (entry.value as T) : undefined;
  }

  public delete(key: string): boolean {
    const entry = this.states.get(key);
    if (!entry) return false;

    // Check ownership
    if (entry.ownerId && entry.ownerId !== this.localPeerId) {
      if (this.config.mode === 'authoritative') {
        throw new Error(`Cannot delete state '${key}' owned by '${entry.ownerId}'`);
      }
    }

    this.states.delete(key);

    // Notify with undefined value
    const deletedEntry: ISyncStateEntry<undefined> = {
      key,
      value: undefined,
      version: entry.version + 1,
      ownerId: undefined,
      timestamp: Date.now(),
      origin: 'local',
    };
    this.notifyStateChange(key, deletedEntry);

    return true;
  }

  public getAll(): Map<string, ISyncStateEntry> {
    return new Map(this.states);
  }

  public clear(): void {
    this.states.clear();
    this.history = [];
    this.tick = 0;
  }

  // ==========================================================================
  // Ownership
  // ==========================================================================

  public claim(key: string): boolean {
    const entry = this.states.get(key);
    if (!entry) return false;

    // Cannot claim if already owned by another
    if (entry.ownerId && entry.ownerId !== this.localPeerId) {
      return false;
    }

    entry.ownerId = this.localPeerId;
    entry.version++;
    entry.timestamp = Date.now();
    entry.origin = 'local';

    this.notifyStateChange(key, entry);
    return true;
  }

  public release(key: string): void {
    const entry = this.states.get(key);
    if (entry && entry.ownerId === this.localPeerId) {
      entry.ownerId = undefined;
      entry.version++;
      entry.timestamp = Date.now();
      entry.origin = 'local';
      this.notifyStateChange(key, entry);
    }
  }

  public getOwner(key: string): string | undefined {
    return this.states.get(key)?.ownerId;
  }

  public isOwner(key: string): boolean {
    const entry = this.states.get(key);
    return entry ? entry.ownerId === this.localPeerId : false;
  }

  // ==========================================================================
  // Snapshots
  // ==========================================================================

  public takeSnapshot(): IStateSnapshot {
    const snapshot: IStateSnapshot = {
      tick: this.tick,
      timestamp: Date.now(),
      states: new Map(this.states),
    };

    // Add to history
    this.history.push(snapshot);

    // Trim history if needed
    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }

    this.tick++;
    return snapshot;
  }

  public restoreSnapshot(snapshot: IStateSnapshot): void {
    this.states = new Map(snapshot.states);
    this.tick = snapshot.tick;

    // Notify all changes
    this.states.forEach((entry, key) => {
      this.notifyStateChange(key, { ...entry, origin: 'reconciled' });
    });
  }

  public getHistory(count?: number): IStateSnapshot[] {
    if (count === undefined) {
      return [...this.history];
    }
    return this.history.slice(-count);
  }

  // ==========================================================================
  // Sync Control
  // ==========================================================================

  public sync(): void {
    if (this._isPaused) return;

    // Take a snapshot to record current state
    this.takeSnapshot();

    // In a real implementation, this would broadcast state to peers
    // For this implementation, sync is handled by the network layer
  }

  public pause(): void {
    this._isPaused = true;
  }

  public resume(): void {
    this._isPaused = false;
  }

  public get isPaused(): boolean {
    return this._isPaused;
  }

  // ==========================================================================
  // Remote State Updates
  // ==========================================================================

  /**
   * Apply a remote state update
   */
  public applyRemoteUpdate(entry: ISyncStateEntry, origin: StateOrigin = 'remote'): boolean {
    const existing = this.states.get(entry.key);

    if (existing) {
      // Conflict resolution based on mode
      switch (this.config.mode) {
        case 'authoritative':
          // Only accept if from owner or we don't own it
          if (existing.ownerId && existing.ownerId !== entry.ownerId) {
            if (existing.ownerId === this.localPeerId) {
              return false; // Reject, we own it
            }
          }
          break;

        case 'last-write-wins':
          // Accept newer timestamps
          if (entry.timestamp < existing.timestamp) {
            return false;
          }
          break;

        case 'crdt':
          // Accept higher versions
          if (entry.version <= existing.version) {
            return false;
          }
          break;
      }
    }

    const updatedEntry: ISyncStateEntry = {
      ...entry,
      origin,
    };

    this.states.set(entry.key, updatedEntry);
    this.notifyStateChange(entry.key, updatedEntry);
    return true;
  }

  /**
   * Merge remote state with local state
   */
  public mergeRemoteState(remoteState: Map<string, ISyncStateEntry>): void {
    remoteState.forEach((entry, _key) => {
      this.applyRemoteUpdate(entry);
    });
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  public onStateChanged<T>(key: string, callback: (entry: ISyncStateEntry<T>) => void): void {
    let callbacks = this.changeCallbacks.get(key);
    if (!callbacks) {
      callbacks = new Set();
      this.changeCallbacks.set(key, callbacks);
    }
    callbacks.add(callback as StateChangeCallback);
  }

  public offStateChanged(key: string, callback: (entry: ISyncStateEntry) => void): void {
    const callbacks = this.changeCallbacks.get(key);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * Register callback for any state change
   */
  public onAnyStateChanged(callback: StateChangeCallback): void {
    this.globalChangeCallbacks.add(callback);
  }

  /**
   * Unregister callback for any state change
   */
  public offAnyStateChanged(callback: StateChangeCallback): void {
    this.globalChangeCallbacks.delete(callback);
  }

  private notifyStateChange(key: string, entry: ISyncStateEntry): void {
    // Notify key-specific callbacks
    const callbacks = this.changeCallbacks.get(key);
    if (callbacks) {
      callbacks.forEach((cb) => cb(entry));
    }

    // Notify global callbacks
    this.globalChangeCallbacks.forEach((cb) => cb(entry));
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  /**
   * Get current tick
   */
  public getCurrentTick(): number {
    return this.tick;
  }

  /**
   * Get state count
   */
  public getStateCount(): number {
    return this.states.size;
  }

  /**
   * Check if state exists
   */
  public has(key: string): boolean {
    return this.states.has(key);
  }

  /**
   * Get all keys
   */
  public keys(): string[] {
    return Array.from(this.states.keys());
  }

  /**
   * Get states owned by local peer
   */
  public getOwnedStates(): ISyncStateEntry[] {
    const owned: ISyncStateEntry[] = [];
    this.states.forEach((entry) => {
      if (entry.ownerId === this.localPeerId) {
        owned.push(entry);
      }
    });
    return owned;
  }
}

/**
 * Create a state synchronizer
 */
export function createStateSynchronizer(
  localPeerId: string,
  config?: Partial<ISyncConfig>
): IStateSynchronizer {
  return new StateSynchronizerImpl(localPeerId, config);
}
