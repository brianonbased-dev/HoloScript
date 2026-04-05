/**
 * Blackboard.ts
 *
 * Shared key-value state for behavior trees: scoped data,
 * observer notifications, and history tracking.
 *
 * @module ai
 */

// =============================================================================
// TYPES
// =============================================================================

export interface BBEntry {
  key: string;
  value: unknown;
  scope: string;
  version: number;
  timestamp: number;
}

// =============================================================================
// BLACKBOARD
// =============================================================================

export class Blackboard {
  private data: Map<string, BBEntry> = new Map();
  private observers: Map<string, Array<(key: string, value: unknown, old: unknown) => void>> =
    new Map();
  private scopes: Map<string, Set<string>> = new Map(); // scope → keys
  private history: Array<{ key: string; old: unknown; value: unknown; timestamp: number }> = [];
  private maxHistory = 100;

  // ---------------------------------------------------------------------------
  // Get / Set
  // ---------------------------------------------------------------------------

  set(key: string, value: unknown, scope = 'global'): void {
    const existing = this.data.get(key);
    const old = existing?.value;

    this.data.set(key, {
      key,
      value,
      scope,
      version: existing ? existing.version + 1 : 0,
      timestamp: Date.now(),
    });

    // Track scope
    if (!this.scopes.has(scope)) this.scopes.set(scope, new Set());
    this.scopes.get(scope)!.add(key);

    // History
    this.history.push({ key, old, value, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) this.history.shift();

    // Notify
    this.notifyObservers(key, value, old);
  }

  get<T = unknown>(key: string): T | undefined {
    return this.data.get(key)?.value as T | undefined;
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  delete(key: string): boolean {
    const entry = this.data.get(key);
    if (!entry) return false;
    this.scopes.get(entry.scope)?.delete(key);
    return this.data.delete(key);
  }

  // ---------------------------------------------------------------------------
  // Scopes
  // ---------------------------------------------------------------------------

  getByScope(scope: string): Map<string, unknown> {
    const result = new Map<string, unknown>();
    const keys = this.scopes.get(scope);
    if (!keys) return result;
    for (const key of keys) {
      const entry = this.data.get(key);
      if (entry) result.set(key, entry.value);
    }
    return result;
  }

  clearScope(scope: string): number {
    const keys = this.scopes.get(scope);
    if (!keys) return 0;
    let count = 0;
    for (const key of keys) {
      if (this.data.delete(key)) count++;
    }
    keys.clear();
    return count;
  }

  getScopes(): string[] {
    return [...this.scopes.keys()];
  }

  // ---------------------------------------------------------------------------
  // Observers
  // ---------------------------------------------------------------------------

  observe(key: string, callback: (key: string, value: unknown, old: unknown) => void): void {
    if (!this.observers.has(key)) this.observers.set(key, []);
    this.observers.get(key)!.push(callback);
  }

  observeAll(callback: (key: string, value: unknown, old: unknown) => void): void {
    this.observe('*', callback);
  }

  private notifyObservers(key: string, value: unknown, old: unknown): void {
    const specific = this.observers.get(key);
    if (specific) for (const cb of specific) cb(key, value, old);
    const wildcard = this.observers.get('*');
    if (wildcard) for (const cb of wildcard) cb(key, value, old);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getEntryCount(): number {
    return this.data.size;
  }
  getKeys(): string[] {
    return [...this.data.keys()];
  }
  getVersion(key: string): number {
    return this.data.get(key)?.version ?? -1;
  }
  getHistory(): typeof this.history {
    return [...this.history];
  }

  clear(): void {
    this.data.clear();
    this.scopes.clear();
    this.history = [];
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of this.data) result[key] = entry.value;
    return result;
  }

  fromJSON(data: Record<string, unknown>, scope = 'global'): void {
    for (const [key, value] of Object.entries(data)) {
      this.set(key, value, scope);
    }
  }
}
