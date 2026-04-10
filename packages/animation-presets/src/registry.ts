/**
 * PresetRegistry — Category-grouped animation preset store.
 *
 * Provides lookup by name, category filtering, tag search,
 * and enumeration of all registered presets.
 *
 * The registry is pre-loaded with all 15 canonical presets
 * and supports runtime registration of custom presets.
 */

import type {
  AnimationPreset,
  CustomAnimationPreset,
  PresetCategory,
  PresetName,
} from './types.js';
import { allPresets } from './presets/index.js';

// ---------------------------------------------------------------------------
// Category Metadata
// ---------------------------------------------------------------------------

/**
 * Metadata for a preset category within the registry.
 */
export interface CategoryInfo {
  /** Category identifier. */
  category: PresetCategory;

  /** Human-readable label. */
  label: string;

  /** Short description of what this category contains. */
  description: string;

  /** Preset names belonging to this category. */
  presetNames: (PresetName | string)[];
}

/**
 * Static category definitions with their display metadata.
 */
const CATEGORY_METADATA: Record<PresetCategory, Omit<CategoryInfo, 'presetNames'>> = {
  locomotion: {
    category: 'locomotion',
    label: 'Locomotion',
    description:
      'Movement behaviors: walking, running, jumping, climbing, swimming, flying, and crouching.',
  },
  combat: {
    category: 'combat',
    label: 'Combat',
    description: 'Combat-related actions: melee attacks, strikes, and offensive maneuvers.',
  },
  social: {
    category: 'social',
    label: 'Social',
    description:
      'Social and communication behaviors: speaking, waving, and interpersonal gestures.',
  },
  emote: {
    category: 'emote',
    label: 'Emote',
    description:
      'Expressive emotes and performances: dancing, celebrating, and emotional displays.',
  },
  environmental: {
    category: 'environmental',
    label: 'Environmental',
    description: 'Ambient and passive states: idling, sitting, sleeping, and stationary behaviors.',
  },
};

// ---------------------------------------------------------------------------
// PresetRegistry
// ---------------------------------------------------------------------------

/**
 * Registry for animation presets with category grouping, name lookup,
 * tag-based search, and custom preset registration.
 *
 * Usage:
 * ```ts
 * import { PresetRegistry } from '@holoscript/animation-presets';
 *
 * const registry = new PresetRegistry();
 * const walk = registry.get('walk');
 * const locomotion = registry.getByCategory('locomotion');
 * const aerial = registry.searchByTag('aerial');
 * ```
 */
export class PresetRegistry {
  /** Internal store: name -> preset. */
  private readonly presets: Map<PresetName | string, AnimationPreset | CustomAnimationPreset>;

  /**
   * Creates a new PresetRegistry pre-loaded with all 15 canonical presets.
   * Pass `false` to create an empty registry.
   */
  constructor(loadDefaults = true) {
    this.presets = new Map();
    if (loadDefaults) {
      for (const preset of allPresets) {
        this.presets.set(preset.name, preset);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Lookup
  // -----------------------------------------------------------------------

  /**
   * Get a preset by its canonical name.
   *
   * @param name - The preset name (e.g. 'walk', 'idle', 'attack')
   * @returns The matching AnimationPreset, or `undefined` if not found.
   */
  get(name: PresetName | string): AnimationPreset | CustomAnimationPreset | undefined {
    return this.presets.get(name);
  }

  /**
   * Check whether a preset with the given name exists in the registry.
   */
  has(name: PresetName | string): boolean {
    return this.presets.has(name);
  }

  // -----------------------------------------------------------------------
  // Category Operations
  // -----------------------------------------------------------------------

  /**
   * Get all presets belonging to a specific category.
   *
   * @param category - The category to filter by.
   * @returns Array of presets in that category (may be empty).
   */
  getByCategory(category: PresetCategory): (AnimationPreset | CustomAnimationPreset)[] {
    const results: (AnimationPreset | CustomAnimationPreset)[] = [];
    for (const preset of this.presets.values()) {
      if (preset.category === category) {
        results.push(preset);
      }
    }
    return results;
  }

  /**
   * Get metadata and preset names for all categories.
   *
   * @returns Array of CategoryInfo objects with associated preset names.
   */
  getCategories(): CategoryInfo[] {
    const categoryMap = new Map<PresetCategory, (PresetName | string)[]>();

    for (const preset of this.presets.values()) {
      const names = categoryMap.get(preset.category) ?? [];
      names.push(preset.name);
      categoryMap.set(preset.category, names);
    }

    const result: CategoryInfo[] = [];
    for (const [category, presetNames] of categoryMap) {
      const meta = CATEGORY_METADATA[category];
      if (meta) {
        result.push({ ...meta, presetNames });
      }
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  /**
   * Search for presets that have a specific tag.
   *
   * @param tag - Tag string to search for (case-insensitive).
   * @returns Array of presets containing the tag.
   */
  searchByTag(tag: string): (AnimationPreset | CustomAnimationPreset)[] {
    const normalizedTag = tag.toLowerCase();
    const results: (AnimationPreset | CustomAnimationPreset)[] = [];
    for (const preset of this.presets.values()) {
      if (preset.tags.some((t) => t.toLowerCase() === normalizedTag)) {
        results.push(preset);
      }
    }
    return results;
  }

  /**
   * Search for presets matching a query string against name, description, and tags.
   *
   * @param query - Search query (case-insensitive substring match).
   * @returns Array of matching presets.
   */
  search(query: string): (AnimationPreset | CustomAnimationPreset)[] {
    const q = query.toLowerCase();
    const results: (AnimationPreset | CustomAnimationPreset)[] = [];
    for (const preset of this.presets.values()) {
      const matchesName = preset.name.toLowerCase().includes(q);
      const matchesDescription = preset.description.toLowerCase().includes(q);
      const matchesTags = preset.tags.some((t) => t.toLowerCase().includes(q));
      const matchesClip = preset.mixamoClip.clipName.toLowerCase().includes(q);

      if (matchesName || matchesDescription || matchesTags || matchesClip) {
        results.push(preset);
      }
    }
    return results;
  }

  // -----------------------------------------------------------------------
  // Enumeration
  // -----------------------------------------------------------------------

  /**
   * Get all registered presets as an array.
   */
  getAll(): (AnimationPreset | CustomAnimationPreset)[] {
    return Array.from(this.presets.values());
  }

  /**
   * Get all registered preset names.
   */
  getNames(): string[] {
    return Array.from(this.presets.keys());
  }

  /**
   * Get the total number of registered presets.
   */
  get size(): number {
    return this.presets.size;
  }

  // -----------------------------------------------------------------------
  // Custom Registration
  // -----------------------------------------------------------------------

  /**
   * Register a custom preset in the registry.
   * Overwrites any existing preset with the same name.
   * Accepts both canonical presets (PresetName) and custom-named presets (string).
   *
   * @param preset - The AnimationPreset to register.
   */
  register(preset: AnimationPreset | CustomAnimationPreset): void {
    this.presets.set(preset.name, preset);
  }

  /**
   * Remove a preset from the registry by name.
   *
   * @param name - The preset name to remove.
   * @returns `true` if the preset was found and removed, `false` otherwise.
   */
  unregister(name: PresetName | string): boolean {
    return this.presets.delete(name);
  }

  /**
   * Remove all presets from the registry.
   */
  clear(): void {
    this.presets.clear();
  }
}
