/**
 * TraitBinder.ts
 *
 * Maps trait names from parsed AST directives to runtime TraitHandler instances.
 * This is the registry that connects "@grabbable", "@audio", "@particles", etc.
 * to their actual runtime implementations.
 *
 * Sprint 2 addition: registerComposed() builds merged handlers from composition
 * syntax (`@turret = @physics + @ai_npc`) and registers them here so they are
 * available to all downstream systems as normal trait lookups.
 */
import type { TraitHandler } from '@holoscript/core';
import { TraitComposer } from '@holoscript/core';

export class TraitBinder {
  private handlers: Map<string, TraitHandler<any>> = new Map();

  /** Register a trait handler by name. */
  register(name: string, handler: TraitHandler<any>): void {
    this.handlers.set(name, handler);
  }

  /** Register multiple handlers at once. */
  registerAll(entries: Array<[string, TraitHandler<any>]>): void {
    for (const [name, handler] of entries) {
      this.handlers.set(name, handler);
    }
  }

  /** Resolve a trait name to a handler. */
  resolve(name: string): TraitHandler<any> | undefined {
    return this.handlers.get(name);
  }

  /** Check if a trait is registered. */
  has(name: string): boolean {
    return this.handlers.has(name);
  }

  /** Get all registered trait names. */
  listTraits(): string[] {
    return Array.from(this.handlers.keys());
  }

  /** Get count of registered handlers. */
  get count(): number {
    return this.handlers.size;
  }

  /** Merge config from directive with handler defaults. */
  mergeConfig(name: string, directiveConfig: Record<string, any>): any {
    const handler = this.handlers.get(name);
    if (!handler) return directiveConfig;
    return { ...handler.defaultConfig, ...directiveConfig };
  }

  /**
   * Compose multiple registered trait handlers into a new named handler.
   *
   * Sprint 2: Called after parsing `@turret = @physics + @ai_npc + @targeting`.
   *
   * - Resolves each source name from this registry.
   * - Delegates to TraitComposer.compose() for config merging + lifecycle wiring.
   * - Registers the resulting composed handler under `name`.
   *
   * @param name        New trait name (without @ prefix)
   * @param sourceNames Ordered source trait names (left = lower priority)
   * @param graph       Optional TraitDependencyGraph for conflict detection
   * @returns           Composition warnings (empty array = clean)
   */
  registerComposed(
    name: string,
    sourceNames: string[],
    graph?: import('@holoscript/core').TraitDependencyGraph
  ): string[] {
    const composer = new TraitComposer(graph);
    const result = composer.compose(name, this.handlers, sourceNames);

    // Register merged handler so it is available for future trait lookups
    this.handlers.set(name, result.handler);
    return result.warnings;
  }
}

