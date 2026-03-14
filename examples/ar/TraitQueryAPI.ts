// TARGET: packages/platform/agents/src/TraitQueryAPI.ts
// TODO-050 (HIGH): Trait-aware AI agent query API
//
// Provides an API for AI agents to query available traits and their
// current state on any node in the world. This enables:
//   1. Agent introspection: "What traits does this object have?"
//   2. Trait capability discovery: "What traits can I attach here?"
//   3. State observation: "What are the current trait values?"
//   4. Constraint checking: "Would attaching @throwable conflict?"
//   5. Bulk queries: "Find all nodes with @interactive trait"
//
// Integrates with: CrossRealityTraitRegistry, VRTraitRegistry,
//                  CrossValidationEngine (for constraint checking)

/**
 * TraitQueryAPI
 *
 * Read-only API for AI agents to discover and observe traits in the
 * VR world. All queries are non-mutating and safe for the render loop.
 *
 * This API follows the principle that agents should be able to observe
 * the world freely but can only modify it through the CrossValidation
 * protocol (TODO-003).
 *
 * @module TraitQueryAPI
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * A trait definition as visible to agents.
 */
export interface TraitInfo {
  /** Trait name (e.g., 'throwable', 'interactive', 'scalable') */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Trait category (behavior, appearance, physics, spatial, etc.) */
  readonly category: TraitCategory;
  /** Configuration schema (JSON Schema subset) */
  readonly configSchema: TraitConfigSchema;
  /** Traits this trait requires to be present */
  readonly requires: readonly string[];
  /** Traits this trait conflicts with */
  readonly conflicts: readonly string[];
  /** Default configuration values */
  readonly defaults: Readonly<Record<string, unknown>>;
  /** Whether this trait is currently available on the platform */
  readonly available: boolean;
  /** Platform compatibility */
  readonly platforms: readonly TraitPlatform[];
}

/**
 * Trait category for grouping and filtering.
 */
export type TraitCategory =
  | 'physics'      // Throwable, Collidable, Gravity
  | 'interaction'  // Interactive, Selectable, Clickable
  | 'appearance'   // Material, Emissive, Transparent
  | 'animation'    // Animated, Keyframed, Procedural
  | 'spatial'      // Scalable, Rotatable, Positionable
  | 'behavior'     // StateMachine, PathFollower, Orbit
  | 'social'       // Communicative, Trustworthy, Cultural
  | 'audio'        // Audible, Spatial3D, Reactive
  | 'ai'           // Perceivable, Inferrable, Learnable
  | 'custom';      // User-defined traits

/**
 * Platform compatibility.
 */
export type TraitPlatform = 'vr' | 'ar' | 'desktop' | 'mobile' | 'robot';

/**
 * Simplified JSON Schema for trait configuration.
 */
export interface TraitConfigSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, TraitPropertySchema>>;
  readonly required?: readonly string[];
}

/**
 * Schema for a single trait property.
 */
export interface TraitPropertySchema {
  readonly type: 'number' | 'string' | 'boolean' | 'array' | 'object';
  readonly description?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly default?: unknown;
  readonly enum?: readonly unknown[];
}

/**
 * State of a trait currently attached to a node.
 */
export interface TraitState {
  /** Trait name */
  readonly traitName: string;
  /** Node this trait is attached to */
  readonly nodeId: string;
  /** Whether the trait is currently active */
  readonly active: boolean;
  /** Current configuration values */
  readonly config: Readonly<Record<string, unknown>>;
  /** When the trait was attached (ISO timestamp) */
  readonly attachedAt: string;
  /** Which agent attached this trait */
  readonly attachedBy: string;
  /** Last configuration update time */
  readonly lastUpdatedAt: string;
}

/**
 * Result of a trait attachment compatibility check.
 */
export interface TraitCompatibilityResult {
  /** Whether the trait can be attached */
  readonly compatible: boolean;
  /** Missing required traits */
  readonly missingRequirements: readonly string[];
  /** Conflicting traits that are currently attached */
  readonly conflicts: readonly string[];
  /** Warnings (non-blocking compatibility notes) */
  readonly warnings: readonly string[];
  /** Suggested resolution for conflicts */
  readonly suggestions: readonly string[];
}

/**
 * Query filter for trait searches.
 */
export interface TraitQueryFilter {
  /** Filter by category */
  readonly category?: TraitCategory;
  /** Filter by name pattern (glob-style) */
  readonly namePattern?: string;
  /** Filter by platform compatibility */
  readonly platform?: TraitPlatform;
  /** Only return traits that are currently available */
  readonly availableOnly?: boolean;
  /** Maximum results to return */
  readonly limit?: number;
}

/**
 * Node query filter for finding nodes by trait.
 */
export interface NodeTraitQueryFilter {
  /** Trait name to search for */
  readonly traitName: string;
  /** Optional: only nodes where the trait is active */
  readonly activeOnly?: boolean;
  /** Optional: only nodes in this world */
  readonly worldId?: string;
  /** Maximum results */
  readonly limit?: number;
}

/**
 * Result of a node-by-trait query.
 */
export interface NodeTraitQueryResult {
  readonly nodeId: string;
  readonly worldId: string;
  readonly traitState: TraitState;
}

/**
 * Configuration for the TraitQueryAPI.
 */
export interface TraitQueryAPIConfig {
  /** Maximum query results per request (default: 100) */
  readonly maxResults: number;
  /** Whether to cache query results (default: true) */
  readonly cacheEnabled: boolean;
  /** Cache TTL in milliseconds (default: 1000) */
  readonly cacheTTLMs: number;
  /** Allowed agent IDs (empty = all agents allowed) */
  readonly allowedAgents: readonly string[];
}

// =============================================================================
// TRAIT REGISTRY INTERFACE
// =============================================================================

/**
 * Interface that the underlying trait registry must implement.
 * This decouples TraitQueryAPI from the specific registry implementation
 * (VRTraitRegistry, CrossRealityTraitRegistry, etc.).
 */
export interface TraitRegistryAdapter {
  /** Get all registered trait definitions */
  getAllTraits(): TraitInfo[];
  /** Get a specific trait definition */
  getTrait(name: string): TraitInfo | undefined;
  /** Get traits currently attached to a node */
  getNodeTraits(nodeId: string): TraitState[];
  /** Find nodes that have a specific trait */
  findNodesByTrait(traitName: string, worldId?: string): NodeTraitQueryResult[];
}

// =============================================================================
// TRAIT QUERY API
// =============================================================================

/**
 * Read-only API for AI agents to query the trait system.
 *
 * All methods are synchronous and side-effect-free, making them
 * safe to call from any thread (including the render loop for
 * quick checks).
 *
 * Usage:
 * ```ts
 * const api = createTraitQueryAPI(registryAdapter);
 *
 * // Agent discovers available traits
 * const allTraits = api.listTraits({ category: 'physics' });
 *
 * // Agent checks what traits an object has
 * const nodeTraits = api.getNodeTraits('tree-42');
 *
 * // Agent checks if a trait can be attached
 * const compat = api.checkCompatibility('throwable', 'tree-42');
 *
 * // Agent finds all interactive objects
 * const interactive = api.findNodesByTrait({ traitName: 'interactive' });
 * ```
 */
export class TraitQueryAPI {
  private readonly registry: TraitRegistryAdapter;
  private readonly config: Required<TraitQueryAPIConfig>;
  private readonly cache: Map<string, { data: unknown; expiresAt: number }> = new Map();

  // Statistics
  private queryCount = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(
    registry: TraitRegistryAdapter,
    config?: Partial<TraitQueryAPIConfig>,
  ) {
    this.registry = registry;
    this.config = {
      maxResults: config?.maxResults ?? 100,
      cacheEnabled: config?.cacheEnabled ?? true,
      cacheTTLMs: config?.cacheTTLMs ?? 1000,
      allowedAgents: config?.allowedAgents ?? [],
    };
  }

  // =========================================================================
  // TRAIT DISCOVERY
  // =========================================================================

  /**
   * List all available traits, optionally filtered.
   *
   * @param filter Optional filter criteria
   * @returns Array of trait definitions
   */
  listTraits(filter?: TraitQueryFilter): readonly TraitInfo[] {
    this.queryCount++;

    const cacheKey = `listTraits:${JSON.stringify(filter ?? {})}`;
    const cached = this.getFromCache<TraitInfo[]>(cacheKey);
    if (cached !== undefined) return cached;

    let traits = this.registry.getAllTraits();

    // Apply filters
    if (filter) {
      if (filter.category) {
        traits = traits.filter(t => t.category === filter.category);
      }
      if (filter.namePattern) {
        const pattern = this.globToRegex(filter.namePattern);
        traits = traits.filter(t => pattern.test(t.name));
      }
      if (filter.platform) {
        traits = traits.filter(t => t.platforms.includes(filter.platform!));
      }
      if (filter.availableOnly) {
        traits = traits.filter(t => t.available);
      }
      if (filter.limit) {
        traits = traits.slice(0, Math.min(filter.limit, this.config.maxResults));
      } else {
        traits = traits.slice(0, this.config.maxResults);
      }
    } else {
      traits = traits.slice(0, this.config.maxResults);
    }

    this.putInCache(cacheKey, traits);
    return traits;
  }

  /**
   * Get detailed information about a specific trait.
   *
   * @param traitName The trait name (e.g., 'throwable')
   * @returns Trait definition or undefined if not found
   */
  getTraitInfo(traitName: string): TraitInfo | undefined {
    this.queryCount++;

    const cacheKey = `traitInfo:${traitName}`;
    const cached = this.getFromCache<TraitInfo>(cacheKey);
    if (cached !== undefined) return cached;

    const result = this.registry.getTrait(traitName);
    if (result) {
      this.putInCache(cacheKey, result);
    }
    return result;
  }

  /**
   * List trait categories with counts.
   */
  listCategories(): ReadonlyMap<TraitCategory, number> {
    this.queryCount++;

    const all = this.registry.getAllTraits();
    const categories = new Map<TraitCategory, number>();
    for (const trait of all) {
      categories.set(trait.category, (categories.get(trait.category) ?? 0) + 1);
    }
    return categories;
  }

  // =========================================================================
  // NODE TRAIT QUERIES
  // =========================================================================

  /**
   * Get all traits currently attached to a node.
   *
   * @param nodeId The node to inspect
   * @returns Array of trait states (empty if node has no traits)
   */
  getNodeTraits(nodeId: string): readonly TraitState[] {
    this.queryCount++;

    const cacheKey = `nodeTraits:${nodeId}`;
    const cached = this.getFromCache<TraitState[]>(cacheKey);
    if (cached !== undefined) return cached;

    const result = this.registry.getNodeTraits(nodeId);
    this.putInCache(cacheKey, result);
    return result;
  }

  /**
   * Check if a node has a specific trait.
   *
   * @param nodeId The node to check
   * @param traitName The trait to look for
   * @returns true if the node has the trait
   */
  nodeHasTrait(nodeId: string, traitName: string): boolean {
    this.queryCount++;
    const traits = this.registry.getNodeTraits(nodeId);
    return traits.some(t => t.traitName === traitName);
  }

  /**
   * Get the state of a specific trait on a node.
   *
   * @param nodeId The node to inspect
   * @param traitName The trait name
   * @returns The trait state or undefined if not attached
   */
  getTraitState(nodeId: string, traitName: string): TraitState | undefined {
    this.queryCount++;
    const traits = this.registry.getNodeTraits(nodeId);
    return traits.find(t => t.traitName === traitName);
  }

  /**
   * Find all nodes that have a specific trait.
   *
   * @param filter Query filter
   * @returns Array of matching nodes
   */
  findNodesByTrait(filter: NodeTraitQueryFilter): readonly NodeTraitQueryResult[] {
    this.queryCount++;

    const cacheKey = `nodesByTrait:${JSON.stringify(filter)}`;
    const cached = this.getFromCache<NodeTraitQueryResult[]>(cacheKey);
    if (cached !== undefined) return cached;

    let results = this.registry.findNodesByTrait(filter.traitName, filter.worldId);

    if (filter.activeOnly) {
      results = results.filter(r => r.traitState.active);
    }

    const limit = Math.min(filter.limit ?? this.config.maxResults, this.config.maxResults);
    results = results.slice(0, limit);

    this.putInCache(cacheKey, results);
    return results;
  }

  // =========================================================================
  // COMPATIBILITY CHECKING
  // =========================================================================

  /**
   * Check if a trait can be attached to a node without conflicts.
   *
   * This checks:
   *   1. Required traits are present on the node
   *   2. No conflicting traits are present
   *   3. The trait is available on the current platform
   *
   * @param traitName The trait to check
   * @param nodeId The target node
   * @returns Compatibility result with details
   */
  checkCompatibility(traitName: string, nodeId: string): TraitCompatibilityResult {
    this.queryCount++;

    const traitDef = this.registry.getTrait(traitName);
    if (!traitDef) {
      return {
        compatible: false,
        missingRequirements: [],
        conflicts: [],
        warnings: [`Trait "${traitName}" not found in registry`],
        suggestions: [],
      };
    }

    if (!traitDef.available) {
      return {
        compatible: false,
        missingRequirements: [],
        conflicts: [],
        warnings: [`Trait "${traitName}" is not available on the current platform`],
        suggestions: [`Available platforms: ${traitDef.platforms.join(', ')}`],
      };
    }

    const nodeTraits = this.registry.getNodeTraits(nodeId);
    const nodeTraitNames = new Set(nodeTraits.map(t => t.traitName));

    // Check if already attached
    if (nodeTraitNames.has(traitName)) {
      return {
        compatible: false,
        missingRequirements: [],
        conflicts: [],
        warnings: [`Trait "${traitName}" is already attached to node "${nodeId}"`],
        suggestions: ['Use trait configuration update instead of re-attachment'],
      };
    }

    // Check requirements
    const missingRequirements = traitDef.requires.filter(r => !nodeTraitNames.has(r));

    // Check conflicts
    const conflicts = traitDef.conflicts.filter(c => nodeTraitNames.has(c));

    const compatible = missingRequirements.length === 0 && conflicts.length === 0;

    const suggestions: string[] = [];
    if (missingRequirements.length > 0) {
      suggestions.push(`Attach required traits first: ${missingRequirements.join(', ')}`);
    }
    if (conflicts.length > 0) {
      suggestions.push(`Remove conflicting traits: ${conflicts.join(', ')}`);
    }

    return {
      compatible,
      missingRequirements,
      conflicts,
      warnings: [],
      suggestions,
    };
  }

  // =========================================================================
  // CACHE MANAGEMENT
  // =========================================================================

  private getFromCache<T>(key: string): T | undefined {
    if (!this.config.cacheEnabled) {
      this.cacheMisses++;
      return undefined;
    }

    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      this.cacheHits++;
      return entry.data as T;
    }

    this.cacheMisses++;
    return undefined;
  }

  private putInCache(key: string, data: unknown): void {
    if (!this.config.cacheEnabled) return;

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.config.cacheTTLMs,
    });
  }

  /**
   * Clear the query cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  // =========================================================================
  // STATISTICS
  // =========================================================================

  /**
   * Get query API statistics.
   */
  getStats(): {
    totalQueries: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
    cacheSize: number;
  } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      totalQueries: this.queryCount,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate: total > 0 ? this.cacheHits / total : 0,
      cacheSize: this.cache.size,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.queryCount = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  // =========================================================================
  // UTILITIES
  // =========================================================================

  private globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i');
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a TraitQueryAPI with the given registry adapter.
 */
export function createTraitQueryAPI(
  registry: TraitRegistryAdapter,
  config?: Partial<TraitQueryAPIConfig>,
): TraitQueryAPI {
  return new TraitQueryAPI(registry, config);
}
