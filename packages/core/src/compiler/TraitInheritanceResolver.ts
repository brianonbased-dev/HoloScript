/**
 * TraitInheritanceResolver — HoloScript Trait Inheritance & Composition
 *
 * Resolves trait inheritance chains declared via the `extends` clause:
 * ```holoscript
 * trait Interactable {
 *   cursor: "default"
 *   highlight: false
 * }
 *
 * trait Clickable extends Interactable {
 *   cursor: "pointer"
 *   highlight: true
 * }
 *
 * trait DraggableButton extends Clickable {
 *   draggable: true
 * }
 * ```
 *
 * Responsibilities:
 *  1. **Inheritance Resolution**: Walk the `extends` chain and merge properties
 *     (child overrides parent, like CSS specificity).
 *  2. **Diamond Inheritance Detection**: Detect when multiple paths lead to the
 *     same ancestor trait and emit a diagnostic.
 *  3. **Cycle Detection**: Detect circular inheritance (`A extends B extends A`)
 *     and reject with a clear error.
 *  4. **Trait Flattening**: Produce a fully-resolved property map for each trait
 *     so all 23 compiler targets receive pre-resolved traits without needing
 *     to walk the inheritance chain themselves.
 *
 * Design:
 *  - Pure data: no runtime/DOM dependencies (safe for Worker threads).
 *  - All trait definitions are registered first, then resolved in batch.
 *  - Results cached so repeated queries are O(1).
 *
 * @module TraitInheritanceResolver
 * @version 1.0.0
 */

import type {
  HoloTraitDefinition,
  HoloTraitProperty,
  HoloEventHandler,
  HoloAction,
  HoloValue,
  SourceLocation,
} from '../parser/HoloCompositionTypes';
import type { TraitDependencyGraph } from './TraitDependencyGraph';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A fully resolved trait with all inherited properties flattened.
 * This is the output format consumed by compiler targets.
 */
export interface ResolvedTrait {
  /** Trait name */
  name: string;
  /** The direct parent trait name (if any) */
  base?: string;
  /** Complete ancestry chain (from immediate parent to root), e.g. ['Clickable', 'Interactable'] */
  ancestors: string[];
  /** Fully resolved properties (inherited + own, child wins) */
  properties: Record<string, HoloValue>;
  /** Fully resolved event handlers (inherited + own, child wins by event name) */
  eventHandlers: HoloEventHandler[];
  /** Fully resolved actions (inherited + own, child wins by action name) */
  actions: HoloAction[];
  /** Warnings generated during resolution (e.g., diamond inheritance) */
  warnings: string[];
}

/**
 * Error emitted when trait inheritance cannot be resolved.
 */
export class TraitInheritanceError extends Error {
  constructor(
    public readonly traitName: string,
    public readonly detail: string,
    public readonly loc?: SourceLocation,
  ) {
    super(`Trait inheritance error in "${traitName}": ${detail}`);
    this.name = 'TraitInheritanceError';
  }
}

/**
 * Error emitted when a circular inheritance chain is detected.
 */
export class CircularInheritanceError extends TraitInheritanceError {
  constructor(
    public readonly cycle: string[],
    loc?: SourceLocation,
  ) {
    super(
      cycle[0],
      `Circular inheritance detected: ${cycle.join(' -> ')}`,
      loc,
    );
    this.name = 'CircularInheritanceError';
  }
}

/**
 * Diagnostic emitted when diamond inheritance is detected.
 * This is a warning, not an error (it can be resolved by child-wins semantics).
 */
export interface DiamondInheritanceWarning {
  /** The trait being resolved */
  traitName: string;
  /** The ancestor reached via multiple paths */
  sharedAncestor: string;
  /** The paths that lead to the shared ancestor */
  paths: string[][];
  /** Human-readable message */
  message: string;
}

/**
 * Complete result of resolving all trait definitions.
 */
export interface TraitResolutionResult {
  /** Map of trait name -> fully resolved trait */
  resolved: Map<string, ResolvedTrait>;
  /** Errors that prevented resolution */
  errors: TraitInheritanceError[];
  /** Warnings (diamond inheritance, etc.) */
  warnings: DiamondInheritanceWarning[];
}

// =============================================================================
// TRAIT INHERITANCE RESOLVER
// =============================================================================

export class TraitInheritanceResolver {
  /** Raw trait definitions keyed by name */
  private definitions: Map<string, HoloTraitDefinition> = new Map();

  /** Resolved trait cache (memoization) */
  private resolvedCache: Map<string, ResolvedTrait> = new Map();

  /** Set of traits currently being resolved (for cycle detection) */
  private resolving: Set<string> = new Set();

  /** Accumulated errors */
  private errors: TraitInheritanceError[] = [];

  /** Accumulated diamond warnings */
  private diamondWarnings: DiamondInheritanceWarning[] = [];

  // ===========================================================================
  // REGISTRATION
  // ===========================================================================

  /**
   * Register a trait definition for resolution.
   * Call this for every `trait Name [extends Base] { ... }` in the AST.
   *
   * @param definition The parsed trait definition
   */
  registerTrait(definition: HoloTraitDefinition): void {
    this.definitions.set(definition.name, definition);
    // Invalidate cache when definitions change
    this.resolvedCache.clear();
  }

  /**
   * Register multiple trait definitions at once.
   *
   * @param definitions Array of parsed trait definitions
   */
  registerTraits(definitions: HoloTraitDefinition[]): void {
    for (const def of definitions) {
      this.registerTrait(def);
    }
  }

  /**
   * Check if a trait is registered.
   */
  hasTrait(name: string): boolean {
    return this.definitions.has(name);
  }

  /**
   * Get a raw (unresolved) trait definition.
   */
  getDefinition(name: string): HoloTraitDefinition | undefined {
    return this.definitions.get(name);
  }

  // ===========================================================================
  // RESOLUTION
  // ===========================================================================

  /**
   * Resolve all registered trait definitions.
   *
   * Walks the inheritance chain for each trait, merging properties from
   * ancestors (parent first, child overrides). Detects cycles and diamond
   * inheritance patterns.
   *
   * @returns Complete resolution result with resolved traits, errors, and warnings
   */
  resolveAll(): TraitResolutionResult {
    this.resolvedCache.clear();
    this.errors = [];
    this.diamondWarnings = [];

    const resolved = new Map<string, ResolvedTrait>();

    for (const [name] of this.definitions) {
      try {
        const result = this.resolveTrait(name);
        resolved.set(name, result);
      } catch (err) {
        if (err instanceof TraitInheritanceError) {
          this.errors.push(err);
        } else {
          throw err;
        }
      }
    }

    return {
      resolved,
      errors: [...this.errors],
      warnings: [...this.diamondWarnings],
    };
  }

  /**
   * Resolve a single trait by name.
   *
   * @param name Trait name to resolve
   * @returns Fully resolved trait
   * @throws TraitInheritanceError if resolution fails
   */
  resolveTrait(name: string): ResolvedTrait {
    // Check cache first
    const cached = this.resolvedCache.get(name);
    if (cached) return cached;

    // Check for cycle
    if (this.resolving.has(name)) {
      const cycle = [...this.resolving, name];
      const startIdx = cycle.indexOf(name);
      throw new CircularInheritanceError(cycle.slice(startIdx));
    }

    const def = this.definitions.get(name);
    if (!def) {
      throw new TraitInheritanceError(
        name,
        `Trait "${name}" is not defined. Register it before resolving.`,
      );
    }

    // Mark as being resolved (cycle detection)
    this.resolving.add(name);

    try {
      const result = this.resolveTraitInternal(def);
      this.resolvedCache.set(name, result);
      return result;
    } finally {
      this.resolving.delete(name);
    }
  }

  /**
   * Get the flat property map for a trait (properties only, no metadata).
   * Useful for compilers that just need the key-value config.
   *
   * @param name Trait name
   * @returns Flattened properties record, or empty object if not found
   */
  getFlattenedProperties(name: string): Record<string, HoloValue> {
    try {
      const resolved = this.resolveTrait(name);
      return { ...resolved.properties };
    } catch {
      return {};
    }
  }

  /**
   * Get the complete ancestry chain for a trait.
   *
   * @param name Trait name
   * @returns Array of ancestor names from immediate parent to root, or empty
   */
  getAncestors(name: string): string[] {
    try {
      const resolved = this.resolveTrait(name);
      return [...resolved.ancestors];
    } catch {
      return [];
    }
  }

  // ===========================================================================
  // DIAMOND INHERITANCE DETECTION
  // ===========================================================================

  /**
   * Detect diamond inheritance patterns across all registered traits.
   *
   * Diamond inheritance occurs when a trait has two or more parents that
   * share a common ancestor. In HoloScript, this is resolved by child-wins
   * semantics (the most derived property value is used), but we emit a
   * warning so developers are aware.
   *
   * Example diamond:
   * ```
   *        Base
   *       /    \
   *   ChildA  ChildB
   *       \    /
   *      Diamond
   * ```
   *
   * Since HoloScript uses single inheritance (one `extends` clause), true
   * diamond inheritance occurs when trait composition (via `+` operator)
   * combines traits that share ancestors.
   *
   * @param composedTraitNames Array of trait names being composed together
   * @returns Array of diamond inheritance warnings
   */
  detectDiamondInheritance(composedTraitNames: string[]): DiamondInheritanceWarning[] {
    const warnings: DiamondInheritanceWarning[] = [];

    // Build ancestor sets for each trait being composed
    const ancestorSets: Map<string, Set<string>> = new Map();
    for (const name of composedTraitNames) {
      const ancestors = new Set<string>();
      this.collectAllAncestors(name, ancestors);
      ancestorSets.set(name, ancestors);
    }

    // Find shared ancestors between any pair of composed traits
    const sharedAncestors = new Map<string, string[][]>();

    for (let i = 0; i < composedTraitNames.length; i++) {
      for (let j = i + 1; j < composedTraitNames.length; j++) {
        const nameA = composedTraitNames[i];
        const nameB = composedTraitNames[j];
        const ancestorsA = ancestorSets.get(nameA) || new Set();
        const ancestorsB = ancestorSets.get(nameB) || new Set();

        for (const ancestor of ancestorsA) {
          if (ancestorsB.has(ancestor)) {
            const key = ancestor;
            if (!sharedAncestors.has(key)) {
              sharedAncestors.set(key, []);
            }
            const pathA = this.getPathToAncestor(nameA, ancestor);
            const pathB = this.getPathToAncestor(nameB, ancestor);
            sharedAncestors.get(key)!.push(pathA, pathB);
          }
        }
      }
    }

    for (const [ancestor, paths] of sharedAncestors) {
      // Deduplicate paths
      const uniquePaths = this.deduplicatePaths(paths);
      if (uniquePaths.length >= 2) {
        warnings.push({
          traitName: composedTraitNames.join(' + '),
          sharedAncestor: ancestor,
          paths: uniquePaths,
          message:
            `Diamond inheritance detected: traits ${composedTraitNames.map((n) => `"${n}"`).join(', ')} ` +
            `share common ancestor "${ancestor}" via multiple paths. ` +
            `Child-wins semantics will be applied (most-derived value used).`,
        });
      }
    }

    return warnings;
  }

  // ===========================================================================
  // GRAPH INTEGRATION
  // ===========================================================================

  /**
   * Register all resolved trait definitions into a TraitDependencyGraph.
   * This enables incremental recompilation to track trait inheritance edges.
   *
   * @param graph The dependency graph to populate
   */
  registerInGraph(graph: TraitDependencyGraph): void {
    for (const [name, def] of this.definitions) {
      graph.registerTrait({
        name,
        requires: def.base ? [def.base] : [],
        conflicts: [],
      });
    }
  }

  // ===========================================================================
  // CLEAR
  // ===========================================================================

  /**
   * Clear all registered definitions and cached results.
   */
  clear(): void {
    this.definitions.clear();
    this.resolvedCache.clear();
    this.resolving.clear();
    this.errors = [];
    this.diamondWarnings = [];
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Internal resolution logic for a single trait.
   */
  private resolveTraitInternal(def: HoloTraitDefinition): ResolvedTrait {
    const warnings: string[] = [];

    // Case 1: No parent — the trait is self-contained
    if (!def.base) {
      return {
        name: def.name,
        base: undefined,
        ancestors: [],
        properties: this.propertiesToRecord(def.properties),
        eventHandlers: def.eventHandlers ? [...def.eventHandlers] : [],
        actions: def.actions ? [...def.actions] : [],
        warnings,
      };
    }

    // Case 2: Has parent — resolve parent first (recursive)
    const parentDef = this.definitions.get(def.base);
    if (!parentDef) {
      throw new TraitInheritanceError(
        def.name,
        `Parent trait "${def.base}" is not defined. ` +
          `Ensure it is declared before "${def.name}".`,
        def.loc?.start ? { line: def.loc.start.line, column: def.loc.start.column } : undefined,
      );
    }

    const parent = this.resolveTrait(def.base);

    // Build ancestry chain
    const ancestors = [def.base, ...parent.ancestors];

    // Merge properties: parent first, child overrides
    const mergedProperties: Record<string, HoloValue> = {
      ...parent.properties,
      ...this.propertiesToRecord(def.properties),
    };

    // Merge event handlers: child handlers override parent handlers with same event name
    const mergedHandlers = this.mergeEventHandlers(
      parent.eventHandlers,
      def.eventHandlers || [],
    );

    // Merge actions: child actions override parent actions with same name
    const mergedActions = this.mergeActions(
      parent.actions,
      def.actions || [],
    );

    // Check for property shadowing and emit warnings
    const ownProps = this.propertiesToRecord(def.properties);
    for (const key of Object.keys(ownProps)) {
      if (key in parent.properties) {
        const parentVal = JSON.stringify(parent.properties[key]);
        const childVal = JSON.stringify(ownProps[key]);
        if (parentVal !== childVal) {
          warnings.push(
            `Property "${key}" in "${def.name}" overrides inherited value from ` +
              `"${this.findPropertyOrigin(key, ancestors)}" ` +
              `(${parentVal} -> ${childVal}).`,
          );
        }
      }
    }

    return {
      name: def.name,
      base: def.base,
      ancestors,
      properties: mergedProperties,
      eventHandlers: mergedHandlers,
      actions: mergedActions,
      warnings,
    };
  }

  /**
   * Convert HoloTraitProperty[] to a flat Record.
   */
  private propertiesToRecord(
    properties: HoloTraitProperty[] | undefined,
  ): Record<string, HoloValue> {
    const result: Record<string, HoloValue> = {};
    if (!properties) return result;
    for (const prop of properties) {
      result[prop.key] = prop.value;
    }
    return result;
  }

  /**
   * Merge event handlers (child wins for same event name).
   */
  private mergeEventHandlers(
    parentHandlers: HoloEventHandler[],
    childHandlers: HoloEventHandler[],
  ): HoloEventHandler[] {
    const handlerMap = new Map<string, HoloEventHandler>();

    // Parent handlers first
    for (const handler of parentHandlers) {
      handlerMap.set(handler.event, handler);
    }

    // Child handlers override
    for (const handler of childHandlers) {
      handlerMap.set(handler.event, handler);
    }

    return Array.from(handlerMap.values());
  }

  /**
   * Merge actions (child wins for same action name).
   */
  private mergeActions(
    parentActions: HoloAction[],
    childActions: HoloAction[],
  ): HoloAction[] {
    const actionMap = new Map<string, HoloAction>();

    // Parent actions first
    for (const action of parentActions) {
      actionMap.set(action.name, action);
    }

    // Child actions override
    for (const action of childActions) {
      actionMap.set(action.name, action);
    }

    return Array.from(actionMap.values());
  }

  /**
   * Find which ancestor originally defined a property.
   */
  private findPropertyOrigin(key: string, ancestors: string[]): string {
    for (const ancestor of ancestors) {
      const def = this.definitions.get(ancestor);
      if (def?.properties?.some((p) => p.key === key)) {
        return ancestor;
      }
    }
    return ancestors[ancestors.length - 1] || 'unknown';
  }

  /**
   * Collect all ancestors of a trait (recursive, including self).
   */
  private collectAllAncestors(name: string, ancestors: Set<string>): void {
    const def = this.definitions.get(name);
    if (!def?.base) return;

    if (ancestors.has(def.base)) return; // Prevent infinite loop
    ancestors.add(def.base);
    this.collectAllAncestors(def.base, ancestors);
  }

  /**
   * Get the path from a trait to a specific ancestor.
   * Returns [name, parent, grandparent, ..., ancestor].
   */
  private getPathToAncestor(name: string, ancestor: string): string[] {
    const path: string[] = [name];
    let current = name;

    while (current !== ancestor) {
      const def = this.definitions.get(current);
      if (!def?.base) break;
      path.push(def.base);
      current = def.base;
    }

    return path;
  }

  /**
   * Remove duplicate paths (same sequence of trait names).
   */
  private deduplicatePaths(paths: string[][]): string[][] {
    const seen = new Set<string>();
    const result: string[][] = [];

    for (const path of paths) {
      const key = path.join('->');
      if (!seen.has(key)) {
        seen.add(key);
        result.push(path);
      }
    }

    return result;
  }
}
