/**
 * Headless Runtime
 *
 * Lightweight runtime for server-side execution, IoT devices, edge computing,
 * and testing scenarios. No rendering, audio, or input - just state, events,
 * and trait execution.
 *
 * Features:
 * - State management with reactive updates
 * - Event system for pub/sub
 * - Trait system for behavior composition
 * - Lifecycle hooks (on_mount, on_update, on_unmount)
 * - MQTT/WebSocket protocol support
 * - Memory-efficient (<50MB footprint)
 * - Fast startup (<500ms)
 *
 * @version 1.0.0
 */

import type { HSPlusAST, HSPlusNode, StateDeclaration } from '../../types/HoloScriptPlus';
import type { HSPlusDirective } from '../../types';
import { ReactiveState, createState, ExpressionEvaluator } from '../../state/ReactiveState';
import type { HostCapabilities, TraitEvent } from '../../traits/TraitTypes';
import { vrTraitRegistry, type TraitContext } from '../../traits/VRTraitSystem';
import { eventBus } from '../EventBus';
import type { RuntimeProfile } from './RuntimeProfile';
import { HEADLESS_PROFILE } from './RuntimeProfile';

// =============================================================================
// TYPES
// =============================================================================

type LifecycleHandler = (...args: unknown[]) => void;

export interface HeadlessNodeInstance {
  node: HSPlusNode;
  lifecycleHandlers: Map<string, LifecycleHandler[]>;
  children: HeadlessNodeInstance[];
  parent: HeadlessNodeInstance | null;
  destroyed: boolean;
  data?: Record<string, unknown>;
}

/**
 * Handler function for BT action dispatch via `runtime.registerAction()`.
 * Called when the BehaviorTree's native action bridge emits `action:${name}`.
 * Return true (success) or false (failure). Async handlers return a Promise.
 */
export type ActionHandler = (
  params: Record<string, unknown>,
  blackboard: Record<string, unknown>,
  context: { emit: (event: string, payload?: unknown) => void; hostCapabilities?: HostCapabilities }
) => Promise<boolean> | boolean;

export interface HeadlessRuntimeOptions {
  /** Runtime profile (defaults to HEADLESS_PROFILE) */
  profile?: RuntimeProfile;
  /** External state providers */
  stateProviders?: Map<string, () => unknown>;
  /** Update tick rate in Hz (default: 10) */
  tickRate?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Max instances limit (default: 1000) */
  maxInstances?: number;
  /** Custom builtins to inject */
  builtins?: Record<string, unknown>;
  /** Action dispatcher for BehaviorTreeTrait — maps BT action names to external handlers.
   *  Return true (success), false (failure), or 'running' (async in progress).
   *  The blackboard parameter is the BT's shared state for updating conditions. */
  executeAction?: (owner: unknown, actionName: string, params: Record<string, unknown>, blackboard?: Record<string, unknown>) => boolean | 'running';
  /** Optional capability adapter for host operations used by traits such as shell/file_system. */
  hostCapabilities?: HostCapabilities;
}

export interface HeadlessRuntimeStats {
  /** Number of active node instances */
  instanceCount: number;
  /** Memory usage estimate in bytes */
  memoryEstimate: number;
  /** Total updates processed */
  updateCount: number;
  /** Total events emitted */
  eventCount: number;
  /** Uptime in milliseconds */
  uptime: number;
  /** Average tick duration in ms */
  avgTickDuration: number;
}

// =============================================================================
// HEADLESS RUNTIME IMPLEMENTATION
// =============================================================================

export class HeadlessRuntime {
  private ast: HSPlusAST;
  private profile: RuntimeProfile;
  private options: HeadlessRuntimeOptions;
  public state: ReactiveState<StateDeclaration>;
  private evaluator: ExpressionEvaluator;
  private rootInstance: HeadlessNodeInstance | null = null;
  private eventHandlers: Map<string, Set<(payload: unknown) => void>> = new Map();
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private startTime: number = 0;
  private lastTickTime: number = 0;
  private tickDurations: number[] = [];
  private stats: HeadlessRuntimeStats = {
    instanceCount: 0,
    memoryEstimate: 0,
    updateCount: 0,
    eventCount: 0,
    uptime: 0,
    avgTickDuration: 0,
  };
  private running: boolean = false;
  private builtins: Record<string, unknown>;
  private actionRegistry: Map<string, ActionHandler> = new Map();

  constructor(ast: HSPlusAST, options: HeadlessRuntimeOptions = {}) {
    this.ast = ast;
    this.profile = options.profile || HEADLESS_PROFILE;
    this.options = {
      tickRate: 10,
      debug: false,
      maxInstances: 1000,
      ...options,
    };

    // Initialize state
    this.state = createState({} as StateDeclaration);

    // Initialize expression evaluator
    this.builtins = this.createBuiltins();
    this.evaluator = new ExpressionEvaluator(this.state.getSnapshot(), this.builtins);

    // Initialize state from AST
    this.initializeState();

    this.log('HeadlessRuntime initialized', { profile: this.profile.name });
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  private initializeState(): void {
    const stateDirective = (this.ast.root.directives || []).find(
      (d: HSPlusDirective) => d.type === 'state'
    );
    if (stateDirective && stateDirective.type === 'state') {
      this.state.update(stateDirective.body as StateDeclaration);
    }
  }

  private createBuiltins(): Record<string, unknown> {
    const runtime = this;
    return {
      log: (...args: unknown[]) => {
        if (this.options.debug) {
          console.log('[HeadlessRuntime]', ...args);
        }
      },
      warn: (...args: unknown[]) => console.warn('[HeadlessRuntime]', ...args),
      error: (...args: unknown[]) => console.error('[HeadlessRuntime]', ...args),
      Math: Math as unknown,

      range: (start: number, end: number, step: number = 1): number[] => {
        const result: number[] = [];
        if (step > 0) {
          for (let i = start; i < end; i += step) result.push(i);
        } else if (step < 0) {
          for (let i = start; i > end; i += step) result.push(i);
        }
        return result;
      },

      emit: (event: string, payload?: unknown) => {
        runtime.emit(event, payload);
      },

      getState: () => runtime.state.getSnapshot(),

      setState: (updates: Partial<StateDeclaration>) => {
        runtime.state.update(updates);
      },

      setTimeout: (callback: () => void, delay: number): number => {
        return setTimeout(callback, delay) as unknown as number;
      },

      clearTimeout: (id: number): void => {
        clearTimeout(id);
      },

      api_call: async (url: string, method: string = 'GET', body?: unknown): Promise<unknown> => {
        // In Node.js environment, use fetch or http module
        if (typeof fetch !== 'undefined') {
          const response = await fetch(url, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
          });
          return response.json();
        }
        throw new Error('fetch not available in this environment');
      },

      // Inject custom builtins
      ...this.options.builtins,
    };
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Start the headless runtime
   */
  start(): void {
    if (this.running) {
      this.log('Runtime already running');
      return;
    }

    this.startTime = Date.now();
    this.running = true;

    // Build node tree
    this.rootInstance = this.instantiateNode(this.ast.root, null);

    // Call mount lifecycle
    this.callLifecycle(this.rootInstance, 'on_mount');

    // Start update loop
    if (this.options.tickRate && this.options.tickRate > 0) {
      const tickInterval = Math.floor(1000 / this.options.tickRate);
      this.lastTickTime = Date.now();
      this.updateInterval = setInterval(() => this.tick(), tickInterval);
    }

    this.log('Runtime started', {
      instanceCount: this.stats.instanceCount,
      tickRate: this.options.tickRate,
    });

    this.emit('runtime_started', { timestamp: this.startTime });
  }

  /**
   * Stop the headless runtime
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;

    // Stop update loop
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Call unmount lifecycle
    if (this.rootInstance) {
      this.callLifecycle(this.rootInstance, 'on_unmount');
      this.destroyInstance(this.rootInstance);
    }

    this.rootInstance = null;
    this.stats.uptime = Date.now() - this.startTime;

    this.log('Runtime stopped', { uptime: this.stats.uptime });

    this.emit('runtime_stopped', { uptime: this.stats.uptime });
  }

  /**
   * Check if runtime is running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ===========================================================================
  // UPDATE LOOP
  // ===========================================================================

  private tick(): void {
    if (!this.running || !this.rootInstance) return;

    const tickStart = Date.now();
    const delta = (tickStart - this.lastTickTime) / 1000;
    this.lastTickTime = tickStart;

    // Update state from providers
    this.updateStateProviders();

    // Update all instances
    this.updateInstance(this.rootInstance, delta);

    // Call update lifecycle
    this.callLifecycle(this.rootInstance, 'on_update', delta);

    // Track stats
    this.stats.updateCount++;
    const tickDuration = Date.now() - tickStart;
    this.tickDurations.push(tickDuration);
    if (this.tickDurations.length > 100) {
      this.tickDurations.shift();
    }
    this.stats.avgTickDuration =
      this.tickDurations.reduce((a, b) => a + b, 0) / this.tickDurations.length;
  }

  private updateStateProviders(): void {
    if (!this.options.stateProviders) return;

    for (const [key, provider] of this.options.stateProviders) {
      try {
        const value = provider();
        this.state.set(key as keyof StateDeclaration, value);
      } catch (error) {
        this.log('Error in state provider', { key, error });
      }
    }
  }

  private updateInstance(instance: HeadlessNodeInstance, delta: number): void {
    if (instance.destroyed) return;

    // Update traits
    if (this.profile.traits && instance.node.traits) {
      const traitContext = this.createTraitContext(instance);
      vrTraitRegistry.updateAllTraits(instance.node, traitContext, delta);
    }

    // Update children
    for (const child of instance.children) {
      this.updateInstance(child, delta);
    }
  }

  // ===========================================================================
  // NODE INSTANTIATION
  // ===========================================================================

  private instantiateNode(
    node: HSPlusNode,
    parent: HeadlessNodeInstance | null
  ): HeadlessNodeInstance {
    // Check instance limit
    if (this.stats.instanceCount >= (this.options.maxInstances || 1000)) {
      throw new Error(`Instance limit exceeded: ${this.options.maxInstances}`);
    }

    const instance: HeadlessNodeInstance = {
      node,
      lifecycleHandlers: new Map(),
      children: [],
      parent,
      destroyed: false,
      data: {},
    };

    this.stats.instanceCount++;

    // Process directives
    this.processDirectives(instance);

    // Attach traits (without rendering)
    if (this.profile.traits && node.traits) {
      const traitContext = this.createTraitContext(instance);
      for (const [traitName, config] of node.traits) {
        vrTraitRegistry.attachTrait(node, traitName, config, traitContext);
      }
    }

    // Process children
    const children = node.children || [];
    for (const childNode of children) {
      const childInstance = this.instantiateNode(childNode, instance);
      instance.children.push(childInstance);
    }

    return instance;
  }

  private processDirectives(instance: HeadlessNodeInstance): void {
    if (!instance.node.directives) return;

    for (const directive of instance.node.directives) {
      if (directive.type === 'lifecycle') {
        this.registerLifecycleHandler(instance, directive);
      }
    }
  }

  private registerLifecycleHandler(
    instance: HeadlessNodeInstance,
    directive: HSPlusDirective & { type: 'lifecycle' }
  ): void {
    const { hook, params, body } = directive;

    const handler = (...args: unknown[]) => {
      const paramContext: Record<string, unknown> = {};
      if (params) {
        params.forEach((param: string, i: number) => {
          paramContext[param] = args[i];
        });
      }

      this.evaluator.updateContext({
        ...this.state.getSnapshot(),
        ...paramContext,
        node: instance.node,
        self: instance.node,
      });

      try {
        if (body.includes(';') || body.includes('{')) {
          new Function(
            ...Object.keys(this.builtins),
            ...Object.keys(paramContext),
            'state',
            'node',
            body
          )(
            ...Object.values(this.builtins),
            ...Object.values(paramContext),
            this.state,
            instance.node
          );
        } else {
          this.evaluator.evaluate(body);
        }
      } catch (error) {
        console.error(`Error in lifecycle handler ${hook}:`, error);
      }
    };

    if (!instance.lifecycleHandlers.has(hook)) {
      instance.lifecycleHandlers.set(hook, []);
    }
    instance.lifecycleHandlers.get(hook)!.push(handler);
  }

  // ===========================================================================
  // LIFECYCLE CALLS
  // ===========================================================================

  private callLifecycle(
    instance: HeadlessNodeInstance | null,
    hook: string,
    ...args: unknown[]
  ): void {
    if (!instance || instance.destroyed) return;

    const handlers = instance.lifecycleHandlers.get(hook);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in lifecycle ${hook}:`, error);
        }
      }
    }

    // Recurse to children
    for (const child of instance.children) {
      this.callLifecycle(child, hook, ...args);
    }
  }

  // ===========================================================================
  // TRAIT CONTEXT
  // ===========================================================================

  private createTraitContext(_instance: HeadlessNodeInstance): TraitContext {
    return {
      vr: {
        hands: { left: null, right: null },
        headset: { position: [0, 0, 0], rotation: [0, 0, 0] },
        getPointerRay: () => null,
        getDominantHand: () => null,
      },
      physics: {
        applyVelocity: () => {},
        applyAngularVelocity: () => {},
        setKinematic: () => {},
        raycast: () => null,
      },
      audio: {
        playSound: () => {},
      },
      haptics: {
        pulse: () => {},
        rumble: () => {},
      },
      emit: this.emit.bind(this),
      getState: () => this.state.getSnapshot(),
      setState: (updates) => this.state.update(updates),
      getScaleMultiplier: () => 1,
      setScaleContext: () => {},
      ...(this.options.executeAction ? { executeAction: this.options.executeAction } : {}),
      ...(this.options.hostCapabilities ? { hostCapabilities: this.options.hostCapabilities } : {}),
    };
  }

  // ===========================================================================
  // EVENT-TO-TRAIT ROUTING
  // ===========================================================================

  /**
   * Route an event to trait onEvent() handlers on all node instances.
   * This enables @shell, @file_system, @llm_agent and other traits to
   * receive events in headless mode (previously only onUpdate/onAttach fired).
   */
  private routeEventToTraits(instance: HeadlessNodeInstance, event: TraitEvent): void {
    if (instance.destroyed) return;
    if (instance.node.traits) {
      const traitContext = this.createTraitContext(instance);
      vrTraitRegistry.handleEventForAllTraits(instance.node, traitContext, event);
    }
    for (const child of instance.children) {
      this.routeEventToTraits(child, event);
    }
  }

  // ===========================================================================
  // INSTANCE DESTRUCTION
  // ===========================================================================

  private destroyInstance(instance: HeadlessNodeInstance): void {
    if (instance.destroyed) return;

    instance.destroyed = true;
    this.stats.instanceCount--;

    // Destroy children first
    for (const child of instance.children) {
      this.destroyInstance(child);
    }

    // Detach traits
    if (this.profile.traits && instance.node.traits) {
      const traitContext = this.createTraitContext(instance);
      for (const traitName of instance.node.traits.keys()) {
        vrTraitRegistry.detachTrait(instance.node, traitName, traitContext);
      }
    }

    // Clear handlers
    instance.lifecycleHandlers.clear();
    instance.children = [];
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Get current state snapshot
   */
  getState(): StateDeclaration {
    return this.state.getSnapshot();
  }

  /**
   * Update state
   */
  setState(updates: Partial<StateDeclaration>): void {
    this.state.update(updates);
  }

  /**
   * Get a state value
   */
  get<K extends keyof StateDeclaration>(key: K): StateDeclaration[K] {
    return this.state.get(key);
  }

  /**
   * Set a state value
   */
  set<K extends keyof StateDeclaration>(key: K, value: StateDeclaration[K]): void {
    this.state.set(key, value);
  }

  /**
   * Emit an event
   */
  emit(event: string, payload?: unknown): void {
    this.stats.eventCount++;

    // Local handlers
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      }
    }

    // Global event bus
    if (this.profile.events) {
      eventBus.emit(event, payload as any);
    }

    // Native action bridge: route action:* events to registered handlers.
    // BehaviorTreeTrait emits action:${name} with { requestId, params, blackboard }.
    // We call the registered handler and emit action:result back.
    if (event.startsWith('action:') && !event.startsWith('action:result')) {
      const actionName = event.slice(7); // strip 'action:'
      const handler = this.actionRegistry.get(actionName);
      if (handler) {
        const p = payload as Record<string, unknown> | undefined;
        const requestId = p?.requestId as string | undefined;
        const blackboard = (p?.blackboard as Record<string, unknown>) ?? {};
        const params = (p?.params as Record<string, unknown>) ?? {};
        Promise.resolve(
          handler(params, blackboard, {
            emit: this.emit.bind(this),
            hostCapabilities: this.options.hostCapabilities,
          })
        )
          .then((result) => {
            this.emit('action:result', { requestId, status: result ? 'success' : 'failure' });
          })
          .catch(() => {
            this.emit('action:result', { requestId, status: 'failure' });
          });
      }
    }

    // Route events to trait onEvent() handlers on all nodes.
    // This activates @shell, @file_system, @llm_agent, @scheduler, etc. in headless mode.
    if (this.profile.traits && this.rootInstance) {
      const traitEvent: TraitEvent = typeof payload === 'object' && payload !== null
        ? { type: event, ...(payload as object) }
        : { type: event, payload };
      this.routeEventToTraits(this.rootInstance, traitEvent);
    }
  }

  /**
   * Register a named action handler for BehaviorTree's native action bridge.
   * When a BT action node emits `action:${name}`, this handler is called
   * and the result is sent back via `action:result`.
   */
  registerAction(name: string, handler: ActionHandler): void {
    this.actionRegistry.set(name, handler);
  }

  /**
   * Subscribe to an event
   */
  on(event: string, handler: (payload: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Subscribe to an event (fires once)
   */
  once(event: string, handler: (payload: unknown) => void): () => void {
    const wrappedHandler = (payload: unknown) => {
      unsubscribe();
      handler(payload);
    };
    const unsubscribe = this.on(event, wrappedHandler);
    return unsubscribe;
  }

  /**
   * Get runtime statistics
   */
  getStats(): HeadlessRuntimeStats {
    return {
      ...this.stats,
      uptime: this.running ? Date.now() - this.startTime : this.stats.uptime,
      memoryEstimate: this.estimateMemory(),
    };
  }

  /**
   * Get runtime profile
   */
  getProfile(): RuntimeProfile {
    return this.profile;
  }

  /**
   * Find a node by ID
   */
  findNode(id: string): HSPlusNode | null {
    if (!this.rootInstance) return null;

    const search = (instance: HeadlessNodeInstance): HSPlusNode | null => {
      if (instance.node.id === id) return instance.node;
      for (const child of instance.children) {
        const found = search(child);
        if (found) return found;
      }
      return null;
    };

    return search(this.rootInstance);
  }

  /**
   * Execute a manual update tick
   */
  manualTick(delta: number = 1 / 10): void {
    if (!this.rootInstance) return;
    this.updateInstance(this.rootInstance, delta);
    this.callLifecycle(this.rootInstance, 'on_update', delta);
    this.stats.updateCount++;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private estimateMemory(): number {
    // Rough estimate: ~500 bytes per instance + state size
    const instanceMemory = this.stats.instanceCount * 500;
    const stateMemory = JSON.stringify(this.state.getSnapshot()).length * 2;
    const handlerMemory = this.eventHandlers.size * 100;
    return instanceMemory + stateMemory + handlerMemory;
  }

  private log(message: string, data?: Record<string, unknown>): void {
    if (this.options.debug) {
      console.log(`[HeadlessRuntime] ${message}`, data || '');
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new headless runtime instance
 */
export function createHeadlessRuntime(
  ast: HSPlusAST,
  options: HeadlessRuntimeOptions = {}
): HeadlessRuntime {
  return new HeadlessRuntime(ast, options);
}

export default HeadlessRuntime;
