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
  HoloObjectTrait,
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
export function createPlatformTarget(platform: PlatformTarget | string): CompilePlatformTarget {
  const normalized = normalizePlatformName(platform) as PlatformTarget;
  return {
    platform: normalized,
    formFactor: platformCategory(normalized),
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
const PLATFORM_ALIASES: Record<string, PlatformCategory | PlatformTarget> = {
  phone: 'mobile',
  car: 'automotive',
  androidxr: 'android-xr',
  android_xr: 'android-xr',
  visionosar: 'visionos-ar',
  visionos_ar: 'visionos-ar',
  androidxrar: 'android-xr-ar',
  android_xr_ar: 'android-xr-ar',
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
export function normalizePlatformName(name: string): string {
  const normalized = name.trim().toLowerCase();
  return PLATFORM_ALIASES[normalized] ?? normalized;
}

function expandPlatformNames(names: string[]): string[] {
  const expanded: string[] = [];
  for (const rawName of names) {
    // Resolve alias first (e.g., phone -> mobile, car -> automotive)
    const name = normalizePlatformName(rawName);

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
      objects: this.filterObjects(composition.objects || [], target),
      templates: this.filterTemplates(composition.templates || [], target),
      spatialGroups: this.filterSpatialGroups(composition.spatialGroups || [], target),
      lights: this.filterBlocks(composition.lights || [], target),
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

  private filterTraits(traits: HoloObjectTrait[] | undefined, target: CompilePlatformTarget) {
    return this.filterBlocks(traits || [], target);
  }

  private filterObjects(
    objects: HoloObjectDecl[] | undefined,
    target: CompilePlatformTarget
  ): HoloObjectDecl[] {
    return this.filterBlocks(objects || [], target).map((obj) => ({
      ...obj,
      traits: this.filterTraits(obj.traits, target),
      children: obj.children ? this.filterObjects(obj.children, target) : obj.children,
    }));
  }

  private filterTemplates(
    templates: HoloTemplate[] | undefined,
    target: CompilePlatformTarget
  ): HoloTemplate[] {
    return this.filterBlocks(templates || [], target).map((template) => ({
      ...template,
      traits: this.filterTraits(template.traits, target),
    }));
  }

  private filterSpatialGroups(
    groups: HoloSpatialGroup[] | undefined,
    target: CompilePlatformTarget
  ): HoloSpatialGroup[] {
    return this.filterBlocks(groups || [], target).map((group) => ({
      ...group,
      objects: this.filterObjects(group.objects, target),
      groups: group.groups ? this.filterSpatialGroups(group.groups, target) : group.groups,
    }));
  }
}

// =============================================================================
// PLATFORM CONSTRAINT VALIDATION (Compiler Gate)
// =============================================================================

/** All valid names that can appear inside @platform(...) */
const VALID_PLATFORM_NAMES = new Set<string>([
  ...ALL_PLATFORMS,
  ...Object.keys(PLATFORM_CATEGORIES),
  ...Object.keys(PLATFORM_ALIASES),
]);

function isValidPlatformName(name: string): boolean {
  return VALID_PLATFORM_NAMES.has(normalizePlatformName(name));
}

/**
 * Walk a parsed HoloComposition and return validation errors for every
 * @platform() constraint that references unknown platforms or is empty.
 *
 * This is the **compiler-side gate** — the parser stays permissive (future-
 * proofing), but the compilation pipeline can call this to fail clearly.
 */
export function validatePlatformConstraints(composition: HoloComposition): string[] {
  const errors: string[] = [];

  const check = (constraint: PlatformConstraint | undefined, context: string) => {
    if (!constraint) return;
    if (constraint.include.length === 0 && constraint.exclude.length === 0) {
      errors.push(
        `${context}: Empty @platform() constraint — specify at least one platform or category`
      );
    }
    for (const name of constraint.include) {
      if (!isValidPlatformName(name)) {
        errors.push(
          `${context}: Unknown platform '${name}' in @platform() — not a recognized platform or category`
        );
      }
    }
    for (const name of constraint.exclude) {
      if (!isValidPlatformName(name)) {
        errors.push(
          `${context}: Unknown platform '${name}' in @platform(not: ...) — not a recognized platform or category`
        );
      }
    }
  };

  const checkObject = (obj: HoloObjectDecl, contextPrefix = 'object') => {
    check(obj.platformConstraint, `${contextPrefix} "${obj.name}"`);
    for (const trait of obj.traits || []) {
      check(trait.platformConstraint, `trait "@${trait.name}" on ${contextPrefix} "${obj.name}"`);
    }
    for (const child of obj.children || []) {
      checkObject(child, `child object of ${obj.name}`);
    }
  };

  const checkGroup = (grp: HoloSpatialGroup) => {
    check(grp.platformConstraint, `spatial group "${grp.name}"`);
    for (const obj of grp.objects || []) {
      checkObject(obj, `object in spatial group "${grp.name}"`);
    }
    for (const childGroup of grp.groups || []) {
      checkGroup(childGroup);
    }
  };

  for (const obj of composition.objects || []) checkObject(obj);
  for (const tmpl of composition.templates || []) check(tmpl.platformConstraint, `template "${tmpl.name}"`);
  for (const tmpl of composition.templates || []) {
    for (const trait of tmpl.traits || []) {
      check(trait.platformConstraint, `trait "@${trait.name}" on template "${tmpl.name}"`);
    }
  }
  for (const norm of composition.norms || []) check(norm.platformConstraint, `norm "${norm.name}"`);
  for (const grp of composition.spatialGroups || []) checkGroup(grp);
  for (const light of composition.lights || []) check(light.platformConstraint, `light "${light.name}"`);

  return errors;
}

export function filterCompositionForPlatform(
  composition: HoloComposition,
  platform: PlatformTarget | string
): HoloComposition {
  const errors = validatePlatformConstraints(composition);
  if (errors.length > 0) {
    throw new Error(`Invalid @platform() constraints:\n${errors.join('\n')}`);
  }

  const normalized = normalizePlatformName(platform);
  return new PlatformConditionalCompilerMixin().filterForPlatform(
    composition,
    createPlatformTarget(normalized as PlatformTarget)
  );
}
