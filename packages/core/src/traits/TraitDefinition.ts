/**
 * Unified Trait Definition
 *
 * Canonical TraitDefinition schema that both HoloScript and TrainingMonkey consume.
 * Extends trait metadata with training information and composition hints.
 *
 * Gap 2: Trait Registry Unification
 *
 * @version 1.0.0
 */

import type { TrainingMetadata } from '../training/trait-mappings';

/**
 * Trait category in the unified registry
 */
export type TraitCategory =
  | 'spatial'
  | 'agent'
  | 'service'
  | 'physics'
  | 'interaction'
  | 'audio'
  | 'visual'
  | 'networking'
  | 'web3'
  | 'accessibility'
  | 'procedural'
  | 'environment'
  | 'ui'
  | 'robotics'
  | 'iot'
  | 'scientific'
  | 'game-mechanics'
  | 'narrative'
  | 'locomotion'
  | 'fabrication'
  | 'hologram'
  | 'other';

/**
 * Property definition for a trait
 */
export interface PropertyDef {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'array' | 'object' | 'vector3' | 'color';
  default?: unknown;
  required?: boolean;
  description?: string;
  range?: [number, number];
}

/**
 * Compilation hint for a specific target
 */
export interface CompileHint {
  target: string;
  supported: boolean;
  notes?: string;
}

/**
 * Deprecation info for a trait
 */
export interface TraitDeprecationInfo {
  since: string;
  removeIn?: string;
  replacement?: string;
  migrationGuide?: string;
}

/**
 * Source registry tracking which system originally defined this trait
 */
export type TraitSource = 'holoscript' | 'trainingmonkey' | 'hololand' | 'community';

/**
 * Canonical Trait Definition
 *
 * Single unified schema for traits across HoloScript, TrainingMonkey, and Hololand.
 */
export interface TraitDefinition {
  /** Canonical trait identifier (e.g., "grabbable") */
  id: string;
  /** Display name */
  displayName?: string;
  /** Namespace (e.g., "@holoscript" or "@holoscript:v6") */
  namespace: string;
  /** Primary category */
  category: TraitCategory;
  /** Human-readable description */
  description?: string;
  /** Typed property declarations */
  properties: PropertyDef[];
  /** Which compilation targets support this trait */
  compileHints: CompileHint[];
  /** Traits that compose well with this one */
  composable: string[];
  /** Traits that conflict with this one */
  conflicts: string[];
  /** Deprecation info (if deprecated) */
  deprecated?: TraitDeprecationInfo;
  /** Training metadata from TrainingMonkey */
  training?: TrainingMetadata;
  /** Source registry */
  source: TraitSource;
  /** Version when this trait was introduced */
  since?: string;
}

/**
 * Summary of unified trait registry coverage
 */
export interface TraitRegistrySummary {
  totalTraits: number;
  byCategory: Record<string, number>;
  bySource: Record<TraitSource, number>;
  deprecated: number;
  withTrainingData: number;
}

/**
 * Unified Trait Registry
 *
 * In-memory registry that aggregates traits from all sources.
 */
export class UnifiedTraitRegistry {
  private traits: Map<string, TraitDefinition> = new Map();

  /**
   * Register a trait definition
   */
  register(trait: TraitDefinition): void {
    this.traits.set(trait.id, trait);
  }

  /**
   * Register multiple trait definitions
   */
  registerBulk(traits: TraitDefinition[]): void {
    for (const trait of traits) {
      this.traits.set(trait.id, trait);
    }
  }

  /**
   * Get a trait by ID
   */
  get(id: string): TraitDefinition | undefined {
    return this.traits.get(id);
  }

  /**
   * Check if a trait exists
   */
  has(id: string): boolean {
    return this.traits.has(id);
  }

  /**
   * Get all traits
   */
  getAll(): TraitDefinition[] {
    return Array.from(this.traits.values());
  }

  /**
   * Get traits by category
   */
  getByCategory(category: TraitCategory): TraitDefinition[] {
    return this.getAll().filter((t) => t.category === category);
  }

  /**
   * Get traits by source
   */
  getBySource(source: TraitSource): TraitDefinition[] {
    return this.getAll().filter((t) => t.source === source);
  }

  /**
   * Get deprecated traits
   */
  getDeprecated(): TraitDefinition[] {
    return this.getAll().filter((t) => t.deprecated !== undefined);
  }

  /**
   * Get traits with training data
   */
  getWithTrainingData(): TraitDefinition[] {
    return this.getAll().filter((t) => t.training !== undefined);
  }

  /**
   * Get composable partners for a trait
   */
  getComposablePartners(traitId: string): TraitDefinition[] {
    const trait = this.get(traitId);
    if (!trait) return [];
    return trait.composable
      .map((id) => this.get(id))
      .filter((t): t is TraitDefinition => t !== undefined);
  }

  /**
   * Get conflicting traits for a trait
   */
  getConflicts(traitId: string): TraitDefinition[] {
    const trait = this.get(traitId);
    if (!trait) return [];
    return trait.conflicts
      .map((id) => this.get(id))
      .filter((t): t is TraitDefinition => t !== undefined);
  }

  /**
   * Get registry summary
   */
  getSummary(): TraitRegistrySummary {
    const all = this.getAll();
    const byCategory: Record<string, number> = {};
    const bySource: Record<string, number> = {
      holoscript: 0,
      trainingmonkey: 0,
      hololand: 0,
      community: 0,
    };

    for (const trait of all) {
      byCategory[trait.category] = (byCategory[trait.category] || 0) + 1;
      bySource[trait.source] = (bySource[trait.source] || 0) + 1;
    }

    return {
      totalTraits: all.length,
      byCategory,
      bySource: bySource as Record<TraitSource, number>,
      deprecated: all.filter((t) => t.deprecated).length,
      withTrainingData: all.filter((t) => t.training).length,
    };
  }

  /**
   * Export registry as JSON (for machine-readable consumption)
   */
  toJSON(): Record<string, TraitDefinition> {
    const result: Record<string, TraitDefinition> = {};
    for (const [id, trait] of this.traits) {
      result[id] = trait;
    }
    return result;
  }

  /**
   * Import from JSON
   */
  fromJSON(data: Record<string, TraitDefinition>): void {
    for (const [id, trait] of Object.entries(data)) {
      this.traits.set(id, { ...trait, id });
    }
  }

  /**
   * Get total count
   */
  get size(): number {
    return this.traits.size;
  }

  /**
   * Clear registry
   */
  clear(): void {
    this.traits.clear();
  }
}

/**
 * Default global trait registry instance
 */
export const defaultTraitRegistry = new UnifiedTraitRegistry();

/**
 * Create a new trait registry
 */
export function createTraitRegistry(): UnifiedTraitRegistry {
  return new UnifiedTraitRegistry();
}
