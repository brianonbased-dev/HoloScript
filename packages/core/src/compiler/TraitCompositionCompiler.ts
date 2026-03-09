/**
 * TraitCompositionCompiler — HoloScript+ Trait Composition
 *
 * Compiles `trait <Name> = @a + @b + @c [{ overrides }]` declarations
 * into runnable `ComposedTraitDef` objects that TraitBinder can register.
 *
 * Design:
 *  - Pure data: no runtime/DOM dependencies (safe for Worker threads).
 *  - Conflict detection: throws CompositionConflictError if component traits
 *    declare conflicting requirements.
 *  - Override values win over component defaults (explicit beats implicit).
 *  - Registers composed definitions back into TraitDependencyGraph so that
 *    incremental recompilation is aware of the composed dependency edges.
 *  - Trait inheritance: if a TraitInheritanceResolver is provided, component
 *    traits are resolved through their inheritance chain before merging.
 *
 * @module TraitCompositionCompiler
 * @version 1.1.0
 */

import type { TraitDependencyGraph } from './TraitDependencyGraph';
import type { TraitInheritanceResolver } from './TraitInheritanceResolver';
import { getRBAC, ResourceType, type AccessDecision } from './identity/AgentRBAC';
import { WorkflowStep } from './identity/AgentIdentity';

// =============================================================================
// TYPES
// =============================================================================

/** A raw trait composition declaration from the AST */
export interface TraitCompositionDecl {
  /** Name of the composed trait (e.g. "Warrior") */
  name: string;
  /** Component trait names (e.g. ["combat", "inventory"]) */
  components: string[];
  /** Optional property overrides that win over component defaults */
  overrides?: Record<string, unknown>;
}

/**
 * A resolved, runtime-ready composed trait.
 * Passed to TraitBinder.registerComposed().
 */
export interface ComposedTraitDef {
  /** Name of the composed trait */
  name: string;
  /** Ordered list of component trait names (preserved for sequential dispatch) */
  components: string[];
  /** Merged defaultConfig (component defaults → overrides applied last) */
  defaultConfig: Record<string, unknown>;
}

/**
 * Interface that every component handler must at minimum satisfy.
 * TraitCompositionCompiler only needs defaultConfig; runtime dispatch
 * uses the full handler API via TraitBinder.
 */
export interface ComponentTraitHandler {
  defaultConfig?: Record<string, unknown>;
  conflicts?: string[];
}

export class CompositionConflictError extends Error {
  constructor(
    public readonly traitA: string,
    public readonly traitB: string,
    public readonly conflictKey: string
  ) {
    super(
      `Trait composition conflict: "${traitA}" and "${traitB}" both declare conflicting key "${conflictKey}".`
    );
    this.name = 'CompositionConflictError';
  }
}

export class MissingComponentError extends Error {
  constructor(
    public readonly composedName: string,
    public readonly missingComponent: string
  ) {
    super(
      `Composition "${composedName}" references unknown component trait "${missingComponent}". ` +
        `Register it in TraitBinder before compiling.`
    );
    this.name = 'MissingComponentError';
  }
}

// =============================================================================
// COMPILER
// =============================================================================

export class TraitCompositionCompiler {
  /**
   * Optional trait inheritance resolver.
   * When provided, component traits are resolved through their inheritance
   * chain before config merging, so inherited properties are included.
   */
  private inheritanceResolver?: TraitInheritanceResolver;

  constructor(inheritanceResolver?: TraitInheritanceResolver) {
    this.inheritanceResolver = inheritanceResolver;
  }

  /**
   * Set or replace the trait inheritance resolver.
   * Call this after constructing if the resolver becomes available later.
   */
  setInheritanceResolver(resolver: TraitInheritanceResolver): void {
    this.inheritanceResolver = resolver;
  }

  /**
   * Compile a set of composition declarations.
   *
   * @param decls         - Declarations to compile.
   * @param getHandler    - Lookup a component handler by name.
   * @param traitGraph    - Optional TraitDependencyGraph; if supplied, new
   *                        composed traits are registered there.
   * @param agentToken    - JWT token proving agent identity (optional for backwards compatibility).
   * @returns Compiled ComposedTraitDef[], in declaration order.
   * @throws UnauthorizedTraitCompositionAccessError if token is provided but invalid.
   */
  compile(
    decls: TraitCompositionDecl[],
    getHandler: (name: string) => ComponentTraitHandler | undefined,
    traitGraph?: TraitDependencyGraph,
    agentToken?: string
  ): ComposedTraitDef[] {
    this.validateAccess(agentToken);
    return decls.map((decl) => this.compileOne(decl, getHandler, traitGraph));
  }

  // ---------------------------------------------------------------------------
  // RBAC enforcement
  // ---------------------------------------------------------------------------

  /**
   * Validate agent has permission to compile trait compositions.
   * Skips validation when no token is provided (backwards compatibility / testing).
   */
  private validateAccess(agentToken?: string): void {
    if (!agentToken) return;

    const rbac = getRBAC();
    const decision = rbac.checkAccess({
      token: agentToken,
      resourceType: ResourceType.AST,
      operation: 'read',
      expectedWorkflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    });

    if (!decision.allowed) {
      throw new UnauthorizedTraitCompositionAccessError(decision, 'TraitCompositionCompiler');
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private compileOne(
    decl: TraitCompositionDecl,
    getHandler: (name: string) => ComponentTraitHandler | undefined,
    traitGraph?: TraitDependencyGraph
  ): ComposedTraitDef {
    // 1. Resolve all components
    const handlers = decl.components.map((name) => {
      const handler = getHandler(name);
      if (!handler) throw new MissingComponentError(decl.name, name);
      return { name, handler };
    });

    // 2. Conflict detection
    this.detectConflicts(handlers);

    // 3. Merge configs — if inheritance resolver available, include inherited props
    let merged: Record<string, unknown> = {};
    for (const { name, handler } of handlers) {
      // First, try to get fully-resolved inherited properties
      if (this.inheritanceResolver && this.inheritanceResolver.hasTrait(name)) {
        const resolvedProps = this.inheritanceResolver.getFlattenedProperties(name);
        merged = { ...merged, ...resolvedProps };
      }
      // Then apply handler's own defaultConfig (which may override inherited)
      merged = { ...merged, ...(handler.defaultConfig ?? {}) };
    }
    if (decl.overrides) {
      merged = { ...merged, ...decl.overrides };
    }

    // 4. Detect diamond inheritance in composed traits
    if (this.inheritanceResolver && decl.components.length > 1) {
      const diamonds = this.inheritanceResolver.detectDiamondInheritance(decl.components);
      // Diamond warnings are informational — stored on the resolver, not blocking
      for (const diamond of diamonds) {
        // Could be exposed via a warnings array on ComposedTraitDef in the future
        void diamond;
      }
    }

    // 5. Register in TraitDependencyGraph
    if (traitGraph) {
      traitGraph.registerTrait({
        name: decl.name,
        requires: decl.components,
        conflicts: [],
      });
    }

    return {
      name: decl.name,
      components: decl.components,
      defaultConfig: merged,
    };
  }

  /**
   * Naive conflict check: if handler A's `conflicts` array includes handler B's
   * name (or vice-versa), throw.
   */
  private detectConflicts(handlers: Array<{ name: string; handler: ComponentTraitHandler }>): void {
    for (let i = 0; i < handlers.length; i++) {
      const a = handlers[i];
      const aConflicts = a.handler.conflicts ?? [];
      for (let j = i + 1; j < handlers.length; j++) {
        const b = handlers[j];
        const bConflicts = b.handler.conflicts ?? [];
        if (aConflicts.includes(b.name) || bConflicts.includes(a.name)) {
          throw new CompositionConflictError(a.name, b.name, b.name);
        }
      }
    }
  }
}

// =============================================================================
// ERRORS
// =============================================================================

/**
 * Error thrown when agent lacks required permissions for trait composition.
 */
export class UnauthorizedTraitCompositionAccessError extends Error {
  constructor(
    public readonly decision: AccessDecision,
    public readonly compilerName: string
  ) {
    super(
      `[${compilerName}] Unauthorized access: ${decision.reason || 'Access denied'}\n` +
        `Agent Role: ${decision.agentRole || 'unknown'}\n` +
        `Required Permission: ${decision.requiredPermission || 'unknown'}`
    );
    this.name = 'UnauthorizedTraitCompositionAccessError';
  }
}
