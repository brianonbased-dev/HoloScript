/**
 * TraitComposer — HoloScript Trait Composition System (Sprint 2)
 *
 * Enables: @turret = @physics + @ai_npc + @targeting
 *
 * Merges N TraitHandler configs into one unified composed handler:
 *  - Later traits override earlier ones (right-side wins)
 *  - Conflict detection via TraitDependencyGraph
 *  - Trait inheritance resolution via TraitInheritanceResolver
 *  - Cultural compatibility checking via CulturalCompatibilityChecker
 *  - Result is registered back into BuiltinRegistry
 *
 * @version 1.2.0
 */

import type { TraitHandler } from '../traits/TraitTypes';
import { TraitDependencyGraph } from './TraitDependencyGraph';
import type { TraitInheritanceResolver } from './TraitInheritanceResolver';
import {
  CulturalCompatibilityChecker,
  type AgentCulturalEntry,
  type CulturalCompatibilityResult,
  type CulturalCheckerConfig,
} from './CulturalCompatibilityChecker';
import type { CulturalProfileTrait } from '../traits/CultureTraits';

// =============================================================================
// TYPES
// =============================================================================

export interface CompositionResult {
  name: string;
  sources: string[];
  handler: TraitHandler<Record<string, unknown>>;
  conflicts: string[];
  warnings: string[];
  /** Diamond inheritance warnings (if inheritance resolver is active) */
  diamondWarnings?: string[];
  /** Cultural compatibility result (if cultural_profile traits present) */
  culturalCompatibility?: CulturalCompatibilityResult;
}

// =============================================================================
// TRAIT COMPOSER
// =============================================================================

export class TraitComposer {
  private graph?: TraitDependencyGraph;
  private inheritanceResolver?: TraitInheritanceResolver;
  private culturalChecker: CulturalCompatibilityChecker;

  constructor(graph?: TraitDependencyGraph, inheritanceResolver?: TraitInheritanceResolver) {
    this.graph = graph;
    this.inheritanceResolver = inheritanceResolver;
    this.culturalChecker = new CulturalCompatibilityChecker();
  }

  /**
   * Set or replace the trait inheritance resolver.
   */
  setInheritanceResolver(resolver: TraitInheritanceResolver): void {
    this.inheritanceResolver = resolver;
  }

  /**
   * Configure the cultural compatibility checker.
   */
  setCulturalCheckerConfig(config: Partial<CulturalCheckerConfig>): void {
    this.culturalChecker.setConfig(config);
  }

  /**
   * Check cultural compatibility for a set of agent entries.
   * Can be called standalone or is automatically invoked during composition
   * when cultural_profile traits are detected.
   *
   * @param agents Array of agent cultural entries to check
   * @returns Cultural compatibility result with diagnostics
   */
  checkCulturalCompatibility(agents: AgentCulturalEntry[]): CulturalCompatibilityResult {
    return this.culturalChecker.check(agents);
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
    traitNames: string[]
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
      warnings.push(`Composition "${name}" has conflicts — check conflict list before using.`);
    }

    // Detect diamond inheritance (if resolver available)
    const diamondWarnings: string[] = [];
    if (this.inheritanceResolver && traitNames.length > 1) {
      const definedTraits = traitNames.filter((t) => this.inheritanceResolver!.hasTrait(t));
      if (definedTraits.length > 1) {
        const diamonds = this.inheritanceResolver.detectDiamondInheritance(definedTraits);
        for (const d of diamonds) {
          diamondWarnings.push(d.message);
          warnings.push(d.message);
        }
      }
    }

    // Merge defaultConfigs (right-side wins)
    // If inheritance resolver available, include inherited properties
    const mergedDefaultConfig: Record<string, unknown> = {};
    for (const traitName of traitNames) {
      // First, merge inherited properties (if available)
      if (this.inheritanceResolver && this.inheritanceResolver.hasTrait(traitName)) {
        const resolvedProps = this.inheritanceResolver.getFlattenedProperties(traitName);
        Object.assign(mergedDefaultConfig, resolvedProps);
      }
      // Then, merge handler's own defaultConfig (overrides inherited)
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

    // Cultural compatibility check
    // If any composed traits have cultural_profile configs, validate compatibility
    let culturalCompatibility: CulturalCompatibilityResult | undefined;
    const culturalEntries: AgentCulturalEntry[] = [];
    for (const traitName of traitNames) {
      const h = handlers.get(traitName);
      const config = h?.defaultConfig as Record<string, unknown> | undefined;
      if (config && this.isCulturalProfile(config)) {
        culturalEntries.push({
          name: traitName,
          profile: config as unknown as CulturalProfileTrait,
        });
      }
    }
    if (culturalEntries.length > 1) {
      culturalCompatibility = this.culturalChecker.check(culturalEntries);
      for (const err of culturalCompatibility.errors) {
        conflicts.push(`Cultural: ${err.message}`);
      }
      for (const warn of culturalCompatibility.warnings) {
        warnings.push(`Cultural: ${warn.message}`);
      }
    }

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
      diamondWarnings: diamondWarnings.length > 0 ? diamondWarnings : undefined,
      culturalCompatibility,
    };
  }

  /**
   * Detect whether a config object looks like a CulturalProfileTrait.
   * Checks for the four required fields: cooperation_index, cultural_family,
   * prompt_dialect, and norm_set.
   */
  private isCulturalProfile(config: Record<string, unknown>): boolean {
    return (
      typeof config.cooperation_index === 'number' &&
      typeof config.cultural_family === 'string' &&
      typeof config.prompt_dialect === 'string' &&
      Array.isArray(config.norm_set)
    );
  }

  /**
   * Parse a composition assignment from a source line.
   * Handles: `@turret = @physics + @ai_npc + @targeting`
   * Returns null if the line doesn't match.
   */
  static parseCompositionLine(line: string): { name: string; sources: string[] } | null {
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
