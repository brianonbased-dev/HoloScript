/**
 * @fileoverview Platform-Conditional Compilation Mixin
 * @module @holoscript/core/compiler/PlatformConditionalCompilerMixin
 *
 * Filters a HoloComposition's blocks based on a target platform.
 * Blocks decorated with `@platform(...)` that don't match the target
 * are removed during compilation (dead code elimination).
 *
 * Integrates with the platform taxonomy defined in
 * `./platform/PlatformConditional.ts` for category resolution.
 *
 * @version 1.0.0
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloTemplate,
  HoloNormBlock,
  HoloSpatialGroup,
  HoloLight,
  PlatformConstraint,
} from '../parser/HoloCompositionTypes';

import {
  type PlatformTarget,
  type PlatformCategory,
  PLATFORM_CATEGORIES,
  ALL_PLATFORMS,
  platformCategory,
} from './platform/PlatformConditional';

// Re-export the PlatformTarget type for external consumers
export type { PlatformTarget } from './platform/PlatformConditional';

// =============================================================================
// PLATFORM TARGET (compile-time target specification)
// =============================================================================

/**
 * A fully-specified compilation target including platform and form factor.
 */
export interface CompilePlatformTarget {
  /** Specific platform target (e.g., 'quest3', 'ios', 'android-auto') */
  platform: PlatformTarget;
  /** Derived form factor category */
  formFactor: PlatformCategory;
}

/**
 * Create a CompilePlatformTarget from just the platform name.
 * The formFactor is automatically derived from the platform hierarchy.
 */
export function createPlatformTarget(platform: PlatformTarget): CompilePlatformTarget {
  return {
    platform,
    formFactor: platformCategory(platform),
  };
}

// =============================================================================
// PLATFORM ALIASES
// =============================================================================

/**
 * Common shorthand aliases used in `@platform()` decorators.
 * These map user-friendly names to their canonical category or platform name.
 *
 * For example, `@platform(phone)` is equivalent to `@platform(mobile)`.
 */
const PLATFORM_ALIASES: Record<string, PlatformCategory> = {
  phone: 'mobile',
  car: 'automotive',
};

// =============================================================================
// CONSTRAINT MATCHING
// =============================================================================

/**
 * Resolve a platform constraint's `include` list, expanding category names
 * and aliases into their member platforms.
 *
 * For example, `@platform(vr)` expands to `['quest3', 'pcvr', 'visionos', 'android-xr']`.
 * `@platform(phone)` expands to `['ios', 'android']` (alias for `mobile`).
 * Unknown names are kept as-is (they might be future platform names).
 */
function expandPlatformNames(names: string[]): string[] {
  const expanded: string[] = [];
  for (const rawName of names) {
    // Resolve alias first (e.g., phone -> mobile, car -> automotive)
    const name = rawName in PLATFORM_ALIASES ? PLATFORM_ALIASES[rawName] : rawName;

    if (name in PLATFORM_CATEGORIES) {
      expanded.push(...PLATFORM_CATEGORIES[name as PlatformCategory]);
    } else {
      expanded.push(name);
    }
  }
  return expanded;
}

/**
 * Check if a platform constraint matches a target platform.
 *
 * Rules:
 * - If the constraint is undefined, it matches all platforms (no restriction).
 * - If `include` is non-empty, the target must be in the expanded include list.
 * - If `exclude` is non-empty, the target must NOT be in the expanded exclude list.
 * - Both include and exclude can be specified simultaneously.
 */
export function matchesPlatformConstraint(
  constraint: PlatformConstraint | undefined,
  target: CompilePlatformTarget
): boolean {
  if (!constraint) return true;

  const targetPlatform = target.platform;
  const targetCategory = target.formFactor;

  // Check exclusions first
  if (constraint.exclude.length > 0) {
    const expandedExcludes = expandPlatformNames(constraint.exclude);
    if (expandedExcludes.includes(targetPlatform) || expandedExcludes.includes(targetCategory)) {
      return false;
    }
  }

  // Check inclusions
  if (constraint.include.length > 0) {
    const expandedIncludes = expandPlatformNames(constraint.include);
    if (expandedIncludes.includes(targetPlatform) || expandedIncludes.includes(targetCategory)) {
      return true;
    }
    return false;
  }

  // No include list = matches everything (minus excludes, already checked)
  return true;
}

// =============================================================================
// COMPOSITION FILTERING
// =============================================================================

/**
 * Platform-conditional compilation mixin.
 *
 * Provides methods to filter a HoloComposition's blocks based on the
 * target platform, removing any blocks whose `@platform()` constraint
 * doesn't match.
 */
export class PlatformConditionalCompilerMixin {
  /**
   * Filter a composition's blocks based on the target platform.
   * Returns a new HoloComposition with non-matching blocks removed.
   *
   * Blocks without a `@platform()` constraint are always included.
   */
  filterForPlatform(composition: HoloComposition, target: CompilePlatformTarget): HoloComposition {
    return {
      ...composition,
      objects: this.filterBlocks(composition.objects, target),
      templates: this.filterBlocks(composition.templates, target),
      spatialGroups: this.filterBlocks(composition.spatialGroups, target),
      lights: this.filterBlocks(composition.lights, target),
      norms: composition.norms ? this.filterBlocks(composition.norms, target) : undefined,
    };
  }

  /**
   * Check if a platform constraint matches a target.
   */
  matchesPlatform(
    constraint: PlatformConstraint | undefined,
    target: CompilePlatformTarget
  ): boolean {
    return matchesPlatformConstraint(constraint, target);
  }

  /**
   * Generic filter for arrays of blocks that have an optional platformConstraint.
   */
  private filterBlocks<T extends { platformConstraint?: PlatformConstraint }>(
    blocks: T[],
    target: CompilePlatformTarget
  ): T[] {
    return blocks.filter((block) => matchesPlatformConstraint(block.platformConstraint, target));
  }
}
