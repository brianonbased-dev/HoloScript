import type { TraitVisualConfig } from './types';

/**
 * Singleton registry mapping VR trait names to visual configurations.
 *
 * Used by R3FCompiler (and future compilers) to look up PBR material
 * properties, emissive settings, scale overrides, and other visual
 * parameters for any registered trait.
 *
 * @example
 * ```ts
 * const registry = TraitVisualRegistry.getInstance();
 * const config = registry.get('metallic');
 * // { material: { metalness: 1.0, roughness: 0.2, ... }, tags: ['metallic'], ... }
 * ```
 */
export class TraitVisualRegistry {
  private static instance: TraitVisualRegistry;
  private configs = new Map<string, TraitVisualConfig>();

  private constructor() {}

  /** Get the singleton instance. */
  static getInstance(): TraitVisualRegistry {
    if (!TraitVisualRegistry.instance) {
      TraitVisualRegistry.instance = new TraitVisualRegistry();
    }
    return TraitVisualRegistry.instance;
  }

  /** Register a single trait's visual configuration. */
  register(traitName: string, config: TraitVisualConfig): void {
    this.configs.set(traitName, config);
  }

  /** Register multiple trait visual configs at once. */
  registerBatch(entries: Record<string, TraitVisualConfig>): void {
    for (const [name, config] of Object.entries(entries)) {
      this.configs.set(name, config);
    }
  }

  /** Look up a trait's visual config. Returns undefined if not registered. */
  get(traitName: string): TraitVisualConfig | undefined {
    return this.configs.get(traitName);
  }

  /** Check if a trait has a registered visual config. */
  has(traitName: string): boolean {
    return this.configs.has(traitName);
  }

  /** Get all registered configs (read-only). */
  getAll(): ReadonlyMap<string, TraitVisualConfig> {
    return this.configs;
  }

  /** Number of registered trait visuals. */
  get size(): number {
    return this.configs.size;
  }

  /** Reset the registry (primarily for testing). */
  reset(): void {
    this.configs.clear();
  }
}
