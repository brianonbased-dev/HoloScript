/**
 * @holoscript/core Data Binding Schema
 *
 * Runtime data binding system for connecting HoloScript properties to
 * external data sources, reactive state, and cross-entity communication.
 */

// ============================================================================
// Binding Types
// ============================================================================

export type BindingDirection = 'one-way' | 'two-way' | 'one-time';
export type BindingSource =
  | 'state' // Local component state
  | 'props' // Incoming props
  | 'context' // React-like context
  | 'store' // Global state store
  | 'network' // Network synced state
  | 'asset' // Asset data
  | 'entity' // Another entity's property
  | 'input' // User input
  | 'sensor' // Device sensors
  | 'api' // External API
  | 'computed'; // Derived value

export type TransformType =
  | 'identity' // No transform
  | 'map' // Map function
  | 'filter' // Conditional filter
  | 'reduce' // Accumulator
  | 'debounce' // Debounced updates
  | 'throttle' // Throttled updates
  | 'clamp' // Value clamping
  | 'lerp' // Linear interpolation
  | 'format' // String formatting
  | 'validate' // Validation with fallback
  | 'custom'; // Custom transform function

// ============================================================================
// Binding Configuration
// ============================================================================

export interface BindingTransform {
  /** Transform type */
  type: TransformType;

  /** Transform parameters */
  params?: Record<string, unknown>;

  /** Custom transform function (for 'custom' type) */
  fn?: string;
}

export interface BindingConfig {
  /** Unique binding ID */
  id: string;

  /** Source property path */
  source: string;

  /** Source type */
  sourceType: BindingSource;

  /** Target property path */
  target: string;

  /** Binding direction */
  direction: BindingDirection;

  /** Transform chain (applied in order) */
  transforms: BindingTransform[];

  /** Condition for binding activation */
  condition?: string;

  /** Default value if source is undefined */
  defaultValue?: unknown;

  /** Update priority (higher = update first) */
  priority: number;

  /** Is binding currently active? */
  enabled: boolean;

  /** Binding metadata */
  metadata: Record<string, unknown>;
}

// ============================================================================
// Reactive Expression
// ============================================================================

export interface ReactiveExpression {
  /** Expression ID */
  id: string;

  /** Expression string (e.g., "position.x + offset") */
  expression: string;

  /** Dependencies (property paths this expression reads) */
  dependencies: string[];

  /** Computed result type */
  resultType: string;

  /** Cache the computed value? */
  cached: boolean;

  /** Recompute on every frame? */
  perFrame: boolean;
}

// ============================================================================
// Data Store Schema
// ============================================================================

export interface StoreSlice {
  /** Slice name */
  name: string;

  /** Initial state */
  initialState: Record<string, unknown>;

  /** State schema (for validation) */
  schema?: Record<string, string>;

  /** Reducers/actions available */
  actions: string[];

  /** Is state persisted? */
  persistent: boolean;

  /** Is state synced across network? */
  networked: boolean;
}

export interface DataStore {
  /** Store ID */
  id: string;

  /** Store name */
  name: string;

  /** State slices */
  slices: Map<string, StoreSlice>;

  /** Computed selectors */
  selectors: Map<string, ReactiveExpression>;

  /** Middleware chain */
  middleware: string[];
}

// ============================================================================
// Binding Manager
// ============================================================================

export class BindingManager {
  private static instance: BindingManager | null = null;
  private bindings: Map<string, BindingConfig> = new Map();
  private expressions: Map<string, ReactiveExpression> = new Map();
  private stores: Map<string, DataStore> = new Map();
  private dependencyGraph: Map<string, Set<string>> = new Map(); // source -> binding IDs

  private constructor() {}

  static getInstance(): BindingManager {
    if (!BindingManager.instance) {
      BindingManager.instance = new BindingManager();
    }
    return BindingManager.instance;
  }

  static resetInstance(): void {
    BindingManager.instance = null;
  }

  // ─── Binding Registration ─────────────────────────────────────────────────

  /**
   * Register a data binding
   */
  registerBinding(config: BindingConfig): void {
    this.bindings.set(config.id, config);

    // Update dependency graph
    if (!this.dependencyGraph.has(config.source)) {
      this.dependencyGraph.set(config.source, new Set());
    }
    this.dependencyGraph.get(config.source)!.add(config.id);
  }

  /**
   * Unregister a binding
   */
  unregisterBinding(bindingId: string): void {
    const binding = this.bindings.get(bindingId);
    if (binding) {
      this.dependencyGraph.get(binding.source)?.delete(bindingId);
      this.bindings.delete(bindingId);
    }
  }

  /**
   * Get binding by ID
   */
  getBinding(bindingId: string): BindingConfig | undefined {
    return this.bindings.get(bindingId);
  }

  /**
   * Get all bindings for a source
   */
  getBindingsForSource(sourcePath: string): BindingConfig[] {
    const bindingIds = this.dependencyGraph.get(sourcePath);
    if (!bindingIds) return [];

    return Array.from(bindingIds)
      .map((id) => this.bindings.get(id))
      .filter((b): b is BindingConfig => b !== undefined && b.enabled);
  }

  /**
   * Get all bindings for a target
   */
  getBindingsForTarget(targetPath: string): BindingConfig[] {
    return Array.from(this.bindings.values()).filter((b) => b.target === targetPath && b.enabled);
  }

  // ─── Expression Registration ──────────────────────────────────────────────

  /**
   * Register a reactive expression
   */
  registerExpression(expr: ReactiveExpression): void {
    this.expressions.set(expr.id, expr);
  }

  /**
   * Get expression by ID
   */
  getExpression(exprId: string): ReactiveExpression | undefined {
    return this.expressions.get(exprId);
  }

  /**
   * Find expressions dependent on a property
   */
  findDependentExpressions(propertyPath: string): ReactiveExpression[] {
    return Array.from(this.expressions.values()).filter((e) =>
      e.dependencies.includes(propertyPath)
    );
  }

  // ─── Store Management ─────────────────────────────────────────────────────

  /**
   * Register a data store
   */
  registerStore(store: DataStore): void {
    this.stores.set(store.id, store);
  }

  /**
   * Get store by ID
   */
  getStore(storeId: string): DataStore | undefined {
    return this.stores.get(storeId);
  }

  /**
   * Get all stores
   */
  getAllStores(): DataStore[] {
    return Array.from(this.stores.values());
  }

  // ─── Binding Execution ────────────────────────────────────────────────────

  /**
   * Apply transforms to a value
   */
  applyTransforms(value: unknown, transforms: BindingTransform[]): unknown {
    let result = value;

    for (const transform of transforms) {
      result = this.applyTransform(result, transform);
    }

    return result;
  }

  /**
   * Apply a single transform
   */
  private applyTransform(value: unknown, transform: BindingTransform): unknown {
    switch (transform.type) {
      case 'identity':
        return value;

      case 'clamp': {
        const min = (transform.params?.min as number) ?? -Infinity;
        const max = (transform.params?.max as number) ?? Infinity;
        return Math.max(min, Math.min(max, value as number));
      }

      case 'lerp': {
        const target = transform.params?.target as number;
        const factor = (transform.params?.factor as number) ?? 0.1;
        return (value as number) + (target - (value as number)) * factor;
      }

      case 'format': {
        const template = transform.params?.template as string;
        return template?.replace('{value}', String(value)) ?? String(value);
      }

      case 'map': {
        const mapping = transform.params?.mapping as Record<string, unknown>;
        return mapping?.[String(value)] ?? value;
      }

      case 'filter': {
        const condition = transform.params?.condition as string;
        // Simplified - real implementation would evaluate condition
        return condition ? value : undefined;
      }

      case 'debounce':
      case 'throttle':
        // These need stateful handling - return value for now
        return value;

      case 'validate': {
        const _validator = transform.params?.validator as string;
        void _validator; // Validation function name for runtime
        const fallback = transform.params?.fallback;
        // Simplified validation
        return value !== undefined && value !== null ? value : fallback;
      }

      case 'custom':
        // Custom function would be evaluated by runtime
        return value;

      default:
        return value;
    }
  }

  // ─── Dependency Analysis ──────────────────────────────────────────────────

  /**
   * Get all properties affected by a change
   */
  getAffectedProperties(sourcePath: string): string[] {
    const affected = new Set<string>();
    const visited = new Set<string>();
    const queue = [sourcePath];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const bindings = this.getBindingsForSource(current);
      for (const binding of bindings) {
        affected.add(binding.target);

        // For two-way bindings, also check reverse
        if (binding.direction === 'two-way') {
          queue.push(binding.target);
        }
      }
    }

    return Array.from(affected);
  }

  /**
   * Detect circular bindings
   */
  detectCircularBindings(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (path: string, currentPath: string[]): void => {
      visited.add(path);
      recursionStack.add(path);

      const bindings = this.getBindingsForSource(path);
      for (const binding of bindings) {
        if (!visited.has(binding.target)) {
          dfs(binding.target, [...currentPath, binding.target]);
        } else if (recursionStack.has(binding.target)) {
          const cycleStart = currentPath.indexOf(binding.target);
          cycles.push([...currentPath.slice(cycleStart), binding.target]);
        }
      }

      recursionStack.delete(path);
    };

    for (const binding of this.bindings.values()) {
      if (!visited.has(binding.source)) {
        dfs(binding.source, [binding.source]);
      }
    }

    return cycles;
  }

  /**
   * Get binding execution order (topological sort)
   */
  getExecutionOrder(): BindingConfig[] {
    const result: BindingConfig[] = [];
    const visited = new Set<string>();

    const visit = (bindingId: string) => {
      if (visited.has(bindingId)) return;
      visited.add(bindingId);

      const binding = this.bindings.get(bindingId);
      if (!binding || !binding.enabled) return;

      // Visit dependencies first
      const dependentBindings = this.getBindingsForTarget(binding.source);
      for (const dep of dependentBindings) {
        visit(dep.id);
      }

      result.push(binding);
    };

    // Sort by priority first
    const sortedIds = Array.from(this.bindings.keys()).sort((a, b) => {
      const bindingA = this.bindings.get(a)!;
      const bindingB = this.bindings.get(b)!;
      return bindingB.priority - bindingA.priority;
    });

    for (const id of sortedIds) {
      visit(id);
    }

    return result;
  }

  // ─── Statistics ───────────────────────────────────────────────────────────

  /**
   * Get binding statistics
   */
  getStats(): {
    totalBindings: number;
    enabledBindings: number;
    byDirection: Record<BindingDirection, number>;
    bySourceType: Record<BindingSource, number>;
    circularCount: number;
  } {
    const bindings = Array.from(this.bindings.values());
    const byDirection: Record<string, number> = {};
    const bySourceType: Record<string, number> = {};

    for (const binding of bindings) {
      byDirection[binding.direction] = (byDirection[binding.direction] ?? 0) + 1;
      bySourceType[binding.sourceType] = (bySourceType[binding.sourceType] ?? 0) + 1;
    }

    return {
      totalBindings: bindings.length,
      enabledBindings: bindings.filter((b) => b.enabled).length,
      byDirection: byDirection as Record<BindingDirection, number>,
      bySourceType: bySourceType as Record<BindingSource, number>,
      circularCount: this.detectCircularBindings().length,
    };
  }

  /**
   * Clear all bindings
   */
  clear(): void {
    this.bindings.clear();
    this.expressions.clear();
    this.stores.clear();
    this.dependencyGraph.clear();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a one-way binding
 */
export function createBinding(
  source: string,
  target: string,
  sourceType: BindingSource = 'state',
  options: Partial<Omit<BindingConfig, 'id' | 'source' | 'target' | 'sourceType'>> = {}
): BindingConfig {
  return {
    id: `binding_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    source,
    target,
    sourceType,
    direction: options.direction ?? 'one-way',
    transforms: options.transforms ?? [],
    condition: options.condition,
    defaultValue: options.defaultValue,
    priority: options.priority ?? 0,
    enabled: options.enabled ?? true,
    metadata: options.metadata ?? {},
  };
}

/**
 * Create a two-way binding
 */
export function createTwoWayBinding(
  pathA: string,
  pathB: string,
  sourceType: BindingSource = 'state'
): BindingConfig {
  return createBinding(pathA, pathB, sourceType, { direction: 'two-way' });
}

/**
 * Create a computed binding with expression
 */
export function createComputedBinding(
  expression: string,
  target: string,
  dependencies: string[]
): { binding: BindingConfig; expression: ReactiveExpression } {
  const exprId = `expr_${Date.now()}`;

  const expr: ReactiveExpression = {
    id: exprId,
    expression,
    dependencies,
    resultType: 'unknown',
    cached: true,
    perFrame: false,
  };

  const binding = createBinding(`$computed.${exprId}`, target, 'computed', {
    metadata: { expressionId: exprId },
  });

  return { binding, expression: expr };
}

/**
 * Create a store slice
 */
export function createStoreSlice(
  name: string,
  initialState: Record<string, unknown>,
  options: Partial<Omit<StoreSlice, 'name' | 'initialState'>> = {}
): StoreSlice {
  return {
    name,
    initialState,
    schema: options.schema,
    actions: options.actions ?? [],
    persistent: options.persistent ?? false,
    networked: options.networked ?? false,
  };
}

/**
 * Create a data store
 */
export function createDataStore(name: string, slices: StoreSlice[]): DataStore {
  const store: DataStore = {
    id: `store_${name}`,
    name,
    slices: new Map(),
    selectors: new Map(),
    middleware: [],
  };

  for (const slice of slices) {
    store.slices.set(slice.name, slice);
  }

  return store;
}

/**
 * Get global binding manager
 */
export function getBindingManager(): BindingManager {
  return BindingManager.getInstance();
}

// ============================================================================
// Common Binding Patterns
// ============================================================================

/**
 * Bind entity position to another entity (follow)
 */
export function createFollowBinding(
  sourceEntity: string,
  targetEntity: string,
  offset: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
): BindingConfig {
  return createBinding(`${sourceEntity}.position`, `${targetEntity}.position`, 'entity', {
    transforms: [
      {
        type: 'custom',
        fn: `(pos) => ({ x: pos.x + ${offset.x}, y: pos.y + ${offset.y}, z: pos.z + ${offset.z} })`,
      },
    ],
  });
}

/**
 * Bind property to user input
 */
export function createInputBinding(
  inputPath: string,
  targetProperty: string,
  options: {
    clamp?: { min: number; max: number };
    sensitivity?: number;
  } = {}
): BindingConfig {
  const transforms: BindingTransform[] = [];

  if (options.sensitivity) {
    transforms.push({
      type: 'custom',
      fn: `(v) => v * ${options.sensitivity}`,
    });
  }

  if (options.clamp) {
    transforms.push({
      type: 'clamp',
      params: options.clamp,
    });
  }

  return createBinding(inputPath, targetProperty, 'input', { transforms });
}

/**
 * Bind property to network sync
 */
export function createNetworkBinding(
  localProperty: string,
  syncPriority: 'critical' | 'high' | 'normal' | 'low' = 'normal'
): BindingConfig {
  return createBinding(localProperty, `$network.${localProperty}`, 'state', {
    direction: 'two-way',
    priority:
      syncPriority === 'critical'
        ? 100
        : syncPriority === 'high'
          ? 50
          : syncPriority === 'normal'
            ? 0
            : -50,
    metadata: { networkSync: true, syncPriority },
  });
}
