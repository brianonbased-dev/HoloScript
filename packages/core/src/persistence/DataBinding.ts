/**
 * DataBinding.ts
 *
 * Reactive data bindings: observable properties, computed values,
 * change notification, and two-way binding support.
 *
 * @module persistence
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Binding<T = unknown> {
  id: string;
  key: string;
  value: T;
  previousValue: T | undefined;
  dirty: boolean;
  listeners: Array<(newVal: T, oldVal: T | undefined) => void>;
}

export interface ComputedBinding<T = unknown> {
  id: string;
  key: string;
  compute: () => T;
  dependencies: string[];
  cachedValue: T | undefined;
  dirty: boolean;
}

// =============================================================================
// DATA BINDING
// =============================================================================

let _bindId = 0;

export class DataBindingContext {
  private bindings: Map<string, Binding> = new Map();
  private computed: Map<string, ComputedBinding> = new Map();
  private changeLog: Array<{ key: string; oldVal: unknown; newVal: unknown; timestamp: number }> =
    [];
  private maxChangeLog = 100;
  private batchMode = false;
  private batchedKeys: Set<string> = new Set();

  // ---------------------------------------------------------------------------
  // Property Binding
  // ---------------------------------------------------------------------------

  bind<T>(key: string, initialValue: T): Binding<T> {
    const binding: Binding<T> = {
      id: `bind_${_bindId++}`,
      key,
      value: initialValue,
      previousValue: undefined,
      dirty: false,
      listeners: [],
    };
    this.bindings.set(key, binding as Binding);
    return binding;
  }

  set<T>(key: string, value: T): boolean {
    const binding = this.bindings.get(key) as Binding<T> | undefined;
    if (!binding) return false;

    if (binding.value === value) return false; // No change

    binding.previousValue = binding.value;
    binding.value = value;
    binding.dirty = true;

    this.changeLog.push({
      key,
      oldVal: binding.previousValue,
      newVal: value,
      timestamp: Date.now(),
    });
    if (this.changeLog.length > this.maxChangeLog) this.changeLog.shift();

    if (this.batchMode) {
      this.batchedKeys.add(key);
    } else {
      this.notifyListeners(binding);
      this.updateDependentComputed(key);
    }

    return true;
  }

  get<T>(key: string): T | undefined {
    return this.bindings.get(key)?.value as T | undefined;
  }

  // ---------------------------------------------------------------------------
  // Computed Properties
  // ---------------------------------------------------------------------------

  addComputed<T>(key: string, compute: () => T, dependencies: string[]): ComputedBinding<T> {
    const binding: ComputedBinding<T> = {
      id: `comp_${_bindId++}`,
      key,
      compute,
      dependencies,
      cachedValue: undefined,
      dirty: true,
    };
    this.computed.set(key, binding as ComputedBinding);
    return binding;
  }

  getComputed<T>(key: string): T | undefined {
    const comp = this.computed.get(key) as ComputedBinding<T> | undefined;
    if (!comp) return undefined;

    if (comp.dirty || comp.cachedValue === undefined) {
      comp.cachedValue = comp.compute();
      comp.dirty = false;
    }
    return comp.cachedValue;
  }

  private updateDependentComputed(changedKey: string): void {
    for (const comp of this.computed.values()) {
      if (comp.dependencies.includes(changedKey)) {
        comp.dirty = true;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Listeners
  // ---------------------------------------------------------------------------

  watch<T>(key: string, listener: (newVal: T, oldVal: T | undefined) => void): string {
    const binding = this.bindings.get(key);
    if (!binding) return '';
    binding.listeners.push(listener as (newVal: unknown, oldVal: unknown) => void);
    return binding.id;
  }

  unwatch(key: string, listener: (...args: unknown[]) => void): boolean {
    const binding = this.bindings.get(key);
    if (!binding) return false;
    const idx = binding.listeners.indexOf(listener);
    if (idx < 0) return false;
    binding.listeners.splice(idx, 1);
    return true;
  }

  private notifyListeners(binding: Binding): void {
    for (const listener of binding.listeners) {
      listener(binding.value, binding.previousValue);
    }
    binding.dirty = false;
  }

  // ---------------------------------------------------------------------------
  // Batch Mode (defer notifications)
  // ---------------------------------------------------------------------------

  beginBatch(): void {
    this.batchMode = true;
    this.batchedKeys.clear();
  }

  endBatch(): void {
    this.batchMode = false;
    for (const key of this.batchedKeys) {
      const binding = this.bindings.get(key);
      if (binding) {
        this.notifyListeners(binding);
        this.updateDependentComputed(key);
      }
    }
    this.batchedKeys.clear();
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getBindingCount(): number {
    return this.bindings.size;
  }
  getComputedCount(): number {
    return this.computed.size;
  }
  getChangeLog(): typeof this.changeLog {
    return [...this.changeLog];
  }
  isDirty(key: string): boolean {
    return this.bindings.get(key)?.dirty ?? false;
  }
  getKeys(): string[] {
    return [...this.bindings.keys()];
  }

  has(key: string): boolean {
    return this.bindings.has(key) || this.computed.has(key);
  }

  unbind(key: string): boolean {
    return this.bindings.delete(key) || this.computed.delete(key);
  }

  clear(): void {
    this.bindings.clear();
    this.computed.clear();
    this.changeLog = [];
  }
}
