/**
 * DataBinding.ts
 *
 * Reactive data binding: observable properties, computed values,
 * watchers, and two-way sync.
 *
 * @module events
 */

// =============================================================================
// TYPES
// =============================================================================

export type WatcherCallback<T> = (newValue: T, oldValue: T) => void;

// =============================================================================
// REACTIVE PROPERTY
// =============================================================================

export class ReactiveProperty<T> {
  private _value: T;
  private watchers: Map<number, WatcherCallback<T>> = new Map();
  private nextId = 1;

  constructor(initialValue: T) {
    this._value = initialValue;
  }

  get value(): T {
    return this._value;
  }
  set value(v: T) {
    const old = this._value;
    this._value = v;
    if (old !== v) {
      for (const cb of this.watchers.values()) cb(v, old);
    }
  }

  watch(callback: WatcherCallback<T>): number {
    const id = this.nextId++;
    this.watchers.set(id, callback);
    return id;
  }

  unwatch(id: number): void {
    this.watchers.delete(id);
  }
  getWatcherCount(): number {
    return this.watchers.size;
  }
}

// =============================================================================
// COMPUTED PROPERTY
// =============================================================================

export class ComputedProperty<T> {
  private compute: () => T;
  private _cached: T;
  private dirty = true;
  private deps: Array<{ prop: ReactiveProperty<unknown>; watchId: number }> = [];

  constructor(compute: () => T, deps: ReactiveProperty<unknown>[]) {
    this.compute = compute;
    this._cached = compute();

    for (const dep of deps) {
      const watchId = dep.watch(() => {
        this.dirty = true;
      });
      this.deps.push({ prop: dep, watchId });
    }
  }

  get value(): T {
    if (this.dirty) {
      this._cached = this.compute();
      this.dirty = false;
    }
    return this._cached;
  }

  dispose(): void {
    for (const { prop, watchId } of this.deps) prop.unwatch(watchId);
    this.deps = [];
  }
}

// =============================================================================
// DATA BINDING MANAGER
// =============================================================================

export class DataBindingManager {
  private bindings: Map<
    string,
    {
      source: ReactiveProperty<unknown>;
      target: ReactiveProperty<unknown>;
      watchId: number;
      twoWay: boolean;
      reverseWatchId?: number;
    }
  > = new Map();
  private nextId = 1;

  bind<T>(
    id: string,
    source: ReactiveProperty<T>,
    target: ReactiveProperty<T>,
    twoWay = false
  ): void {
    const watchId = source.watch((v) => {
      target.value = v as T;
    });
    let reverseWatchId: number | undefined;
    if (twoWay) {
      reverseWatchId = target.watch((v) => {
        source.value = v as T;
      });
    }
    this.bindings.set(id, {
      source: source as ReactiveProperty<unknown>,
      target: target as ReactiveProperty<unknown>,
      watchId,
      twoWay,
      reverseWatchId,
    });
  }

  unbind(id: string): void {
    const b = this.bindings.get(id);
    if (!b) return;
    b.source.unwatch(b.watchId);
    if (b.reverseWatchId !== undefined) b.target.unwatch(b.reverseWatchId);
    this.bindings.delete(id);
  }

  getBindingCount(): number {
    return this.bindings.size;
  }
  isbound(id: string): boolean {
    return this.bindings.has(id);
  }
}
