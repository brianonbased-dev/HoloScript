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
 *
 * @module TraitCompositionCompiler
 * @version 1.0.0
 */

import type { TraitDependencyGraph } from './TraitDependencyGraph';

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
    public readonly conflictKey: string,
  ) {
    super(
      `Trait composition conflict: "${traitA}" and "${traitB}" both declare conflicting key "${conflictKey}".`,
    );
    this.name = 'CompositionConflictError';
  }
}

export class MissingComponentError extends Error {
  constructor(public readonly composedName: string, public readonly missingComponent: string) {
    super(
      `Composition "${composedName}" references unknown component trait "${missingComponent}". ` +
        `Register it in TraitBinder before compiling.`,
    );
    this.name = 'MissingComponentError';
  }
}

// =============================================================================
// COMPILER
// =============================================================================

export class TraitCompositionCompiler {
  /**
   * Compile a set of composition declarations.
   *
   * @param decls         - Declarations to compile.
   * @param getHandler    - Lookup a component handler by name.
   * @param traitGraph    - Optional TraitDependencyGraph; if supplied, new
   *                        composed traits are registered there.
   * @returns Compiled ComposedTraitDef[], in declaration order.
   */
  compile(
    decls: TraitCompositionDecl[],
    getHandler: (name: string) => ComponentTraitHandler | undefined,
    traitGraph?: TraitDependencyGraph,
  ): ComposedTraitDef[] {
    return decls.map((decl) => this.compileOne(decl, getHandler, traitGraph));
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private compileOne(
    decl: TraitCompositionDecl,
    getHandler: (name: string) => ComponentTraitHandler | undefined,
    traitGraph?: TraitDependencyGraph,
  ): ComposedTraitDef {
    // 1. Resolve all components
    const handlers = decl.components.map((name) => {
      const handler = getHandler(name);
      if (!handler) throw new MissingComponentError(decl.name, name);
      return { name, handler };
    });

    // 2. Conflict detection
    this.detectConflicts(handlers);

    // 3. Merge configs (left-to-right, later components win, overrides win over all)
    let merged: Record<string, unknown> = {};
    for (const { handler } of handlers) {
      merged = { ...merged, ...(handler.defaultConfig ?? {}) };
    }
    if (decl.overrides) {
      merged = { ...merged, ...decl.overrides };
    }

    // 4. Register in TraitDependencyGraph
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
  private detectConflicts(
    handlers: Array<{ name: string; handler: ComponentTraitHandler }>,
  ): void {
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
