/**
 * TraitComposer — HoloScript Trait Composition System (Sprint 2)
 *
 * Enables: @turret = @physics + @ai_npc + @targeting
 *
 * Merges N TraitHandler configs into one unified composed handler:
 *  - Later traits override earlier ones (right-side wins)
 *  - Conflict detection via TraitDependencyGraph
 *  - Result is registered back into BuiltinRegistry
 *
 * @version 1.0.0
 */

import type { TraitHandler } from '../traits/TraitTypes';
import { TraitDependencyGraph } from './TraitDependencyGraph';

// =============================================================================
// TYPES
// =============================================================================

export interface CompositionResult {
  name: string;
  sources: string[];
  handler: TraitHandler<Record<string, unknown>>;
  conflicts: string[];
  warnings: string[];
}

// =============================================================================
// TRAIT COMPOSER
// =============================================================================

export class TraitComposer {
  private graph?: TraitDependencyGraph;

  constructor(graph?: TraitDependencyGraph) {
    this.graph = graph;
  }

  /**
   * Compose multiple trait handlers into a single named handler.
   *
   * @param name       Name for the composed trait (without @ prefix)
   * @param handlers   TraitHandler implementations keyed by trait name
   * @param traitNames Ordered list of source trait names (earlier = lower priority)
   */
  compose(
    name: string,
    handlers: Map<string, TraitHandler<Record<string, unknown>>>,
    traitNames: string[],
  ): CompositionResult {
    const conflicts: string[] = [];
    const warnings: string[] = [];

    // Check for known conflicts via dependency graph
    if (this.graph) {
      for (let i = 0; i < traitNames.length; i++) {
        for (let j = i + 1; j < traitNames.length; j++) {
          const a = traitNames[i];
          const b = traitNames[j];
          // Use the graph to detect if traits conflict
          const aConflicts = (this.graph as any).traitConflicts?.get(a) as Set<string> | undefined;
          if (aConflicts?.has(b)) {
            conflicts.push(`@${a} conflicts with @${b}`);
          }
        }
      }
    }

    if (conflicts.length > 0) {
      warnings.push(
        `Composition "${name}" has conflicts — check conflict list before using.`,
      );
    }

    // Merge defaultConfigs (right-side wins)
    const mergedDefaultConfig: Record<string, unknown> = {};
    for (const traitName of traitNames) {
      const h = handlers.get(traitName);
      if (!h) {
        warnings.push(`Trait "@${traitName}" not found in registry — skipped in composition.`);
        continue;
      }
      if (h.defaultConfig) {
        Object.assign(mergedDefaultConfig, h.defaultConfig);
      }
    }

    // Build composed handler
    const composedHandler: TraitHandler<Record<string, unknown>> = {
      name: name as any,
      defaultConfig: mergedDefaultConfig,

      onAttach(node, config, context) {
        for (const traitName of traitNames) {
          const h = handlers.get(traitName);
          h?.onAttach?.(node, config, context);
        }
      },

      onDetach(node, config, context) {
        // Detach in reverse order
        for (let i = traitNames.length - 1; i >= 0; i--) {
          const h = handlers.get(traitNames[i]);
          h?.onDetach?.(node, config, context);
        }
      },

      onUpdate(node, config, context, delta) {
        for (const traitName of traitNames) {
          const h = handlers.get(traitName);
          h?.onUpdate?.(node, config, context, delta);
        }
      },

      onEvent(node, config, context, event) {
        for (const traitName of traitNames) {
          const h = handlers.get(traitName);
          h?.onEvent?.(node, config, context, event);
        }
      },
    };

    // Register the composed trait in the dependency graph
    if (this.graph) {
      this.graph.registerTrait({
        name,
        requires: traitNames.filter((t) => handlers.has(t)),
        conflicts: [],
      });
    }

    return {
      name,
      sources: traitNames,
      handler: composedHandler,
      conflicts,
      warnings,
    };
  }

  /**
   * Parse a composition assignment from a source line.
   * Handles: `@turret = @physics + @ai_npc + @targeting`
   * Returns null if the line doesn't match.
   */
  static parseCompositionLine(
    line: string,
  ): { name: string; sources: string[] } | null {
    const m = line.match(/^@(\w+)\s*=\s*((?:@\w+\s*\+\s*)*@\w+)/);
    if (!m) return null;

    const name = m[1];
    const sources = m[2]
      .split('+')
      .map((s) => s.trim().replace('@', ''))
      .filter(Boolean);

    return { name, sources };
  }
}
