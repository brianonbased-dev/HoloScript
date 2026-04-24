/**
 * Reactive State System for HoloScript+
 *
 * Provides reactive state management with:
 * - Proxy-based reactivity
 * - Computed properties
 * - Effect system for side effects
 * - Batched updates for performance
 *
 * @version 1.0.0
 */

import type { StateDeclaration, ReactiveState as IReactiveState } from '../types/HoloScriptPlus';
import { getSharedEventBus } from '../events/EventBus';
import { CRDTStateManager, type CRDTOperation } from './CRDTStateManager';
import { UndoManager } from './UndoManager';

// =============================================================================
// TYPES
// =============================================================================

type Subscriber<T> = (state: T, changedKey?: keyof T) => void;
type UnsubscribeFunc = () => void;
type EffectFunc = () => void | (() => void);
type ComputedFunc<T> = () => T;

interface EffectOptions {
  immediate?: boolean;
  deep?: boolean;
}

// interface WatchOptions<T> extends EffectOptions {
//   handler: (newValue: T, oldValue: T) => void;
// }

// =============================================================================
// DEPENDENCY TRACKING
// =============================================================================

let activeEffect: EffectFunc | null = null;
const targetMap = new WeakMap<object, Map<string | symbol, Set<EffectFunc>>>();

function track(target: object, key: string | symbol): void {
  if (!activeEffect) return;

  let depsMap = targetMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    targetMap.set(target, depsMap);
  }

  let dep = depsMap.get(key);
  if (!dep) {
    dep = new Set();
    depsMap.set(key, dep);
  }

  dep.add(activeEffect);
}

function trigger(target: object, key: string | symbol): void {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;

  const dep = depsMap.get(key);
  if (!dep) return;

  // Create a copy to avoid infinite loops if effects modify dependencies
  const effectsToRun = new Set(dep);
  effectsToRun.forEach((effect) => {
    // Avoid running effect if it's the active one
    if (effect !== activeEffect) {
      queueEffect(effect);
    }
  });
}

// =============================================================================
// EFFECT BATCHING
// =============================================================================

const pendingEffects = new Set<EffectFunc>();
let isFlushing = false;

function queueEffect(effect: EffectFunc): void {
  pendingEffects.add(effect);
  if (!isFlushing) {
    isFlushing = true;
    Promise.resolve().then(flushEffects);
  }
}

function flushEffects(): void {
  pendingEffects.forEach((effect) => {
    try {
      runEffect(effect);
    } catch (error) {
      console.error('Error running effect:', error);
    }
  });
  pendingEffects.clear();
  isFlushing = false;
}

function runEffect(effect: EffectFunc): void {
  const prevEffect = activeEffect;
  activeEffect = effect;
  try {
    effect();
  } finally {
    activeEffect = prevEffect;
  }
}

// =============================================================================
// REACTIVE PROXY
// =============================================================================

function createReactiveProxy<T extends object>(
  target: T,
  onMutation?: (target: T, key: string | symbol, value: unknown, oldValue: unknown) => void
): T {
  return new Proxy(target, {
    get(obj, key: string | symbol) {
      track(obj, key);
      const value = Reflect.get(obj, key);

      // Deep reactivity for nested objects and arrays
      if (value !== null && typeof value === 'object') {
        return createReactiveProxy(value as T, onMutation);
      }

      return value;
    },

    set(obj, key: string | symbol, value: unknown) {
      const oldValue = Reflect.get(obj, key);
      const result = Reflect.set(obj, key, value);

      if (oldValue !== value) {
        trigger(obj, key);
        if (onMutation) {
          onMutation(obj as T, key, value, oldValue);
        }
      }

      return result;
    },

    deleteProperty(obj, key: string | symbol) {
      const hadKey = Reflect.has(obj, key);
      const result = Reflect.deleteProperty(obj, key);

      if (hadKey) {
        trigger(obj, key);
      }

      return result;
    },
  });
}

// =============================================================================
// REACTIVE STATE CLASS
// =============================================================================

export class ReactiveState<T extends StateDeclaration> implements IReactiveState<T> {
  private state: T;
  private proxy: T;
  private subscribers: Set<Subscriber<T>> = new Set();
  private computedCache: Map<string, { value: unknown; dirty: boolean }> = new Map();
  private watchCleanups: Map<string, () => void> = new Map();

  private syncId?: string;
  private isApplyingSync: boolean = false;
  private crdt: CRDTStateManager;
  private undoManager: UndoManager<CRDTOperation> = new UndoManager<CRDTOperation>();
  private clientId: string;

  constructor(initialState: T, syncId?: string) {
    this.clientId = `client_${Math.random().toString(36).substr(2, 9)}`;
    this.crdt = new CRDTStateManager(this.clientId);
    const normalized = Array.isArray(initialState)
      ? (initialState.length === 3 ? { x: initialState[0], y: initialState[1], z: initialState[2] }
        : initialState.length === 2 ? { x: initialState[0], y: initialState[1] }
        : { ...(initialState as object) })
      : { ...(initialState as object) };
    this.state = normalized as unknown as T;
    this.proxy = createReactiveProxy(this.state);
    this.syncId = syncId;

    if (this.syncId) {
      this.setupSync();
    }
  }

  get<K extends keyof T>(key: K): T[K] {
    const val = this.proxy[key];
    return val as T[K];
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    const oldValue = this.state[key];
    if (oldValue === value) return;

    // 1. Update Proxy/State
    (this.proxy as Record<string, unknown>)[key as string] = value;

    // 2. Create and reconcile local CRDT operation
    const redoOp = this.crdt.createOperation(key as string, value);
    this.crdt.reconcile(redoOp);

    // 3. Track in UndoManager if not applying a sync
    if (!this.isApplyingSync) {
      const undoOp = { ...redoOp, value: oldValue }; // Mirror op with old value
      this.undoManager.push(undoOp, redoOp);
    }

    this.notifySubscribers(key);
    this.broadcastOperation(redoOp);
  }

  has(key: string): boolean {
    return this.state[key as keyof T] !== undefined;
  }

  update(updates: Partial<T>): void {
    const changedKeys: (keyof T)[] = [];

    const normalizedUpdates: Partial<T> = Array.isArray(updates)
      ? (updates.length === 3 ? { x: updates[0], y: updates[1], z: updates[2] } as unknown as Partial<T>
        : updates.length === 2 ? { x: updates[0], y: updates[1] } as unknown as Partial<T>
        : { ...(updates as object) } as unknown as Partial<T>)
      : updates;

    for (const key in normalizedUpdates) {
      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, key)) {
        this.set(key as keyof T, normalizedUpdates[key] as T[keyof T]);
        changedKeys.push(key as keyof T);
      }
    }
  }

  undo(): void {
    const step = this.undoManager.undo();
    if (step) {
      this.isApplyingSync = true;
      try {
        this.set(step.undo.key as keyof T, step.undo.value as T[keyof T]);
      } finally {
        this.isApplyingSync = false;
      }
    }
  }

  redo(): void {
    const step = this.undoManager.redo();
    if (step) {
      this.isApplyingSync = true;
      try {
        this.set(step.redo.key as keyof T, step.redo.value as T[keyof T]);
      } finally {
        this.isApplyingSync = false;
      }
    }
  }

  private setupSync(): void {
    // Listen for remote updates
    getSharedEventBus().on(`state_sync:${this.syncId}`, (data: unknown) => {
      const syncData = data as { op: CRDTOperation };
      const op = syncData.op;
      if (op.clientId === this.clientId) return;

      this.isApplyingSync = true;
      try {
        const changed = this.crdt.reconcile(op);
        if (changed) {
          // @ts-expect-error
          this.proxy[op.key as keyof T] = op.value;
          this.notifySubscribers(op.key as keyof T);
        }
      } finally {
        this.isApplyingSync = false;
      }
    });
  }

  private broadcastOperation(op: CRDTOperation): void {
    if (this.syncId && !this.isApplyingSync) {
      getSharedEventBus().emit(`state_sync:${this.syncId}`, {
        source: 'local',
        op,
      } as unknown as import('../types').HoloScriptValue);
    }
  }

  subscribe(callback: Subscriber<T>): UnsubscribeFunc {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers(changedKey: keyof T): void {
    this.subscribers.forEach((callback) => {
      callback(this.state, changedKey);
    });
  }

  // ==========================================================================
  // COMPUTED PROPERTIES
  // ==========================================================================

  computed<R>(key: string, getter: ComputedFunc<R>): R {
    const cached = this.computedCache.get(key);

    if (cached && !cached.dirty) {
      return cached.value as R;
    }

    // Track dependencies
    const prevEffect = activeEffect;
    activeEffect = () => {
      // Mark cached value as dirty
      const entry = this.computedCache.get(key);
      if (entry) {
        entry.dirty = true;
      }
    };

    try {
      const value = getter();
      this.computedCache.set(key, { value, dirty: false });
      return value;
    } finally {
      activeEffect = prevEffect;
    }
  }

  // ==========================================================================
  // WATCHERS
  // ==========================================================================

  watch<K extends keyof T>(
    key: K,
    handler: (newValue: T[K], oldValue: T[K]) => void,
    options: EffectOptions = {}
  ): UnsubscribeFunc {
    let oldValue = this.state[key];

    const effect = () => {
      const newValue = this.proxy[key];
      if (newValue !== oldValue) {
        handler(newValue, oldValue);
        oldValue = newValue;
      }
    };

    // Run immediately if requested
    if (options.immediate) {
      handler(this.state[key], undefined as unknown as T[K]);
    }

    // Subscribe to changes
    return this.subscribe((_state, changedKey) => {
      if (changedKey === key) {
        effect();
      }
    });
  }

  watchEffect(effect: EffectFunc, _options: EffectOptions = {}): UnsubscribeFunc {
    let cleanup: (() => void) | void;

    const wrappedEffect = () => {
      // Run cleanup from previous run
      if (cleanup) {
        cleanup();
      }

      cleanup = effect();
    };

    // Run immediately
    runEffect(wrappedEffect);

    return () => {
      if (cleanup) {
        cleanup();
      }
      // Note: Would need to remove from dependency tracking
    };
  }

  // ==========================================================================
  // SNAPSHOT / RESET
  // ==========================================================================

  getSnapshot(): T {
    const copy = { ...this.state } as Record<string | number, unknown>;
    const values = Object.values(copy);
    values.forEach((v, i) => { copy[i] = v; });
    return copy as unknown as T;
  }

  reset(newState?: T): void {
    const stateToSet = newState || ({} as T);

    // Clear all keys
    for (const key in this.state) {
      if (Object.prototype.hasOwnProperty.call(this.state, key)) {
        delete this.state[key];
      }
    }

    // Set new state
    for (const key in stateToSet) {
      if (Object.prototype.hasOwnProperty.call(stateToSet, key)) {
        this.state[key] = stateToSet[key];
      }
    }

    // Notify all subscribers
    this.subscribers.forEach((callback) => {
      callback(this.state);
    });
  }

  // ==========================================================================
  // DESTROY
  // ==========================================================================

  destroy(): void {
    this.subscribers.clear();
    this.computedCache.clear();
    this.watchCleanups.forEach((cleanup) => cleanup());
    this.watchCleanups.clear();
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

export function createState<T extends StateDeclaration>(
  initialState: T,
  syncId?: string
): ReactiveState<T> {
  return new ReactiveState(initialState, syncId);
}

export function ref<T>(value: T): { value: T } {
  return createReactiveProxy({ value });
}

export function reactive<T extends object>(
  target: T,
  onMutation?: (target: T, key: string | symbol, value: unknown, oldValue: unknown) => void
): T {
  return createReactiveProxy(target, onMutation);
}

export function effect(fn: EffectFunc, _options?: EffectOptions): UnsubscribeFunc {
  let cleanup: (() => void) | void;

  const wrappedEffect = () => {
    if (cleanup) {
      cleanup();
    }
    cleanup = fn();
  };

  runEffect(wrappedEffect);

  return () => {
    if (cleanup) {
      cleanup();
    }
  };
}

export function computed<T>(getter: ComputedFunc<T>): { readonly value: T } {
  let value: T;
  let dirty = true;

  const runner = () => {
    dirty = true;
  };

  return {
    get value(): T {
      if (dirty) {
        const prevEffect = activeEffect;
        activeEffect = runner;
        try {
          value = getter();
          dirty = false;
        } finally {
          activeEffect = prevEffect;
        }
      }
      return value;
    },
  };
}

// =============================================================================
// STATE BINDING UTILITIES
// =============================================================================

export interface StateBinding<T> {
  get: () => T;
  set: (value: T) => void;
  subscribe: (callback: (value: T) => void) => UnsubscribeFunc;
}

export function bind<T extends StateDeclaration, K extends keyof T>(
  state: ReactiveState<T>,
  key: K
): StateBinding<T[K]> {
  return {
    get: () => state.get(key),
    set: (value: T[K]) => state.set(key, value),
    subscribe: (callback: (value: T[K]) => void) => {
      return state.subscribe((s, changedKey) => {
        if (changedKey === key || changedKey === undefined) {
          callback(s[key]);
        }
      });
    },
  };
}

// =============================================================================
// EXPRESSION EVALUATOR
// =============================================================================

export class ExpressionEvaluator {
  private context: Record<string, unknown>;
  private builtins: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}, builtins: Record<string, unknown> = {}) {
    this.context = context;
    this.builtins = {
      Math,
      parseInt,
      parseFloat,
      String,
      Number,
      Boolean,
      Array,
      Object,
      JSON,
      Date,
      ...builtins,
    };
  }

  evaluate(expression: string): unknown {
    // Security: Block dangerous keywords
    const dangerousPatterns = [
      /\beval\s*\(/,
      /\brequire\s*\(/,
      /\bimport\s*\(/,
      /\bprocess\s*\./,
      /\bglobal\s*\./,
      /\b__dirname\b/,
      /\b__filename\b/,
      /\bfs\s*\./,
      /\bchild_process\s*\./,
      /\bfs\.writeFileSync/,
      /\bfs\.readFileSync/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(expression)) {
        console.warn(`Security: Blocked suspicious expression: ${expression}`);
        return undefined;
      }
    }

    // Security: Create safe evaluation context
    const contextKeys = Object.keys(this.context);
    const contextValues = Object.values(this.context);
    const builtinKeys = Object.keys(this.builtins);
    const builtinValues = Object.values(this.builtins);

    try {
      // Create function with context variables as parameters
      const fn = new Function(
        ...contextKeys,
        ...builtinKeys,
        `"use strict"; return (${expression})`
      );

      return fn(...contextValues, ...builtinValues);
    } catch (error) {
      console.error(`Error evaluating expression: ${expression}`, error);
      return undefined;
    }
  }

  updateContext(updates: Record<string, unknown>): void {
    Object.assign(this.context, updates);
  }

  setContext(context: Record<string, unknown>): void {
    this.context = context;
  }
}

// =============================================================================
// STATE-TO-DOM BINDING (for future renderer)
// =============================================================================

export interface DOMBinding {
  element: unknown;
  property: string;
  expression: string;
  unsubscribe: UnsubscribeFunc;
}

export class StateDOMBinder<T extends StateDeclaration> {
  private state: ReactiveState<T>;
  private evaluator: ExpressionEvaluator;
  private bindings: DOMBinding[] = [];

  constructor(state: ReactiveState<T>) {
    this.state = state;
    this.evaluator = new ExpressionEvaluator();
  }

  bind(element: unknown, property: string, expression: string): DOMBinding {
    // Update evaluator context with state
    this.evaluator.setContext(this.state.getSnapshot() as Record<string, unknown>);

    // Initial evaluation
    const value = this.evaluator.evaluate(expression);
    this.applyValue(element, property, value);

    // Subscribe to state changes
    const unsubscribe = this.state.subscribe((newState) => {
      this.evaluator.setContext(newState as Record<string, unknown>);
      const newValue = this.evaluator.evaluate(expression);
      this.applyValue(element, property, newValue);
    });

    const binding: DOMBinding = { element, property, expression, unsubscribe };
    this.bindings.push(binding);

    return binding;
  }

  unbind(binding: DOMBinding): void {
    binding.unsubscribe();
    const index = this.bindings.indexOf(binding);
    if (index > -1) {
      this.bindings.splice(index, 1);
    }
  }

  unbindAll(): void {
    this.bindings.forEach((binding) => binding.unsubscribe());
    this.bindings = [];
  }

  private applyValue(element: unknown, property: string, value: unknown): void {
    // Abstract - actual implementation depends on renderer (Three.js, DOM, etc.)
    if (element && typeof element === 'object') {
      const el = element as Record<string, unknown>;
      const props = property.split('.');
      let target = el;

      for (let i = 0; i < props.length - 1; i++) {
        target = target[props[i]] as Record<string, unknown>;
        if (!target) return;
      }

      target[props[props.length - 1]] = value;
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { track, trigger, runEffect, flushEffects, createReactiveProxy };
