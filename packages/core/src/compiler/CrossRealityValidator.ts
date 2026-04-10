/**
 * @fileoverview Cross-Reality Composition Validator
 * @module @holoscript/core/compiler
 *
 * A static analysis pass that validates HoloScript compositions for
 * cross-reality correctness. Checks that objects with VR-only traits
 * have platform constraints, verifies handoff paths between form factors,
 * analyzes platform coverage, and detects circular handoff dependencies.
 *
 * Validation rules:
 *   CR001 (error)   — VR-only traits without @platform() constraint
 *   CR002 (warning) — No fallback object for platforms lacking a capability
 *   CR003 (error)   — Norm referencing a spatial zone missing on some platforms
 *   CR004 (warning) — Platform with zero objects (empty experience)
 *   CR005 (info)    — Handoff path requires significant embodiment change
 *   CR006 (warning) — MVC payload might exceed 10KB budget
 *   CR007 (error)   — Circular handoff dependency
 *
 * @version 1.0.0
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
} from '../parser/HoloCompositionTypes';
import {
  PlatformCategory,
  PLATFORM_CATEGORIES,
  DEFAULT_EMBODIMENT,
  type EmbodimentType,
} from './platform/PlatformConditional';

// =============================================================================
// TYPES
// =============================================================================

export interface CrossRealityValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  /** Block name that triggered the issue */
  blockName: string;
  /** Suggested fix */
  suggestion?: string;
}

export interface CrossRealityValidationResult {
  valid: boolean;
  issues: CrossRealityValidationIssue[];
  /** Platform coverage analysis */
  platformCoverage: Record<string, number>;
  /** Handoff path analysis */
  handoffPaths: HandoffPathAnalysis[];
}

export interface HandoffPathAnalysis {
  from: string;
  to: string;
  feasible: boolean;
  reason?: string;
  /** Which MVC objects would need adaptation */
  adaptations: string[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Traits that require spatial tracking / VR hardware */
const VR_ONLY_TRAITS: ReadonlySet<string> = new Set([
  'spatial_audio_3d',
  'hand_tracking',
  'eye_tracking',
  'body_tracking',
  'face_tracking',
  'spatial_anchor',
  'gaussian_splat',
  'volumetric_video',
  'hand_gesture',
  'controller_input',
  'haptic_feedback',
  'room_scale',
  'passthrough',
  'spatial_mesh',
  'co_located',
  'avatar_embodiment',
  'head_tracked_audio',
  'ambisonics',
  'hrtf',
]);

/** Form factors for handoff analysis */
const FORM_FACTORS: readonly string[] = [
  'vr-headset',
  'ar-glasses',
  'phone',
  'desktop',
  'car',
  'wearable',
] as const;

/** Map form factors to platform categories */
const FORM_FACTOR_TO_CATEGORY: Record<string, PlatformCategory> = {
  'vr-headset': 'vr',
  'ar-glasses': 'ar',
  phone: 'mobile',
  desktop: 'desktop',
  car: 'automotive',
  wearable: 'wearable',
};

/** Form factors that are safety-critical */
const SAFETY_CRITICAL_FORM_FACTORS: ReadonlySet<string> = new Set(['car']);

/** Embodiment "distance" for evaluating significant changes */
const EMBODIMENT_WEIGHT: Record<EmbodimentType, number> = {
  Avatar3D: 5,
  SpatialPersona: 4,
  WebXR: 3,
  FullGUI: 2,
  UI2D: 1,
  VoiceHUD: 0,
};

/** Threshold for a "significant" embodiment change (CR005) */
const SIGNIFICANT_EMBODIMENT_DELTA = 3;

// =============================================================================
// VALIDATOR
// =============================================================================

export class CrossRealityValidator {
  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Validate a composition for cross-reality correctness.
   */
  validate(composition: HoloComposition): CrossRealityValidationResult {
    const issues: CrossRealityValidationIssue[] = [];

    // CR001: VR-only traits without @platform() constraint
    this.checkVROnlyTraits(composition, issues);

    // CR002: No fallback for platforms lacking a capability
    this.checkFallbackObjects(composition, issues);

    // CR003: Norm references spatial zone missing on some platforms
    this.checkNormZoneReferences(composition, issues);

    // CR004: Platform with zero objects
    this.checkEmptyPlatforms(composition, issues);

    // CR006: MVC payload size estimate
    this.checkMVCPayloadSize(composition, issues);

    // CR007: Circular handoff dependencies
    this.checkCircularHandoffs(composition, issues);

    // Handoff path analysis (includes CR005 for significant embodiment changes)
    const handoffPaths = this.analyzeHandoffPaths(composition);
    for (const path of handoffPaths) {
      if (!path.feasible && path.reason) {
        // CR005 issues are generated inside analyzeHandoffPaths
      }
    }
    this.generateHandoffIssues(handoffPaths, issues);

    // Platform coverage
    const platformCoverage = this.analyzePlatformCoverage(composition);

    const hasErrors = issues.some((i) => i.severity === 'error');

    return {
      valid: !hasErrors,
      issues,
      platformCoverage,
      handoffPaths,
    };
  }

  /**
   * Analyze all possible handoff paths between form factors.
   */
  analyzeHandoffPaths(_composition: HoloComposition): HandoffPathAnalysis[] {
    const paths: HandoffPathAnalysis[] = [];

    for (const from of FORM_FACTORS) {
      for (const to of FORM_FACTORS) {
        if (from === to) continue;
        paths.push(this.analyzeOneHandoff(from, to));
      }
    }

    return paths;
  }

  /**
   * Check platform coverage -- warn if a platform has no content.
   */
  analyzePlatformCoverage(composition: HoloComposition): Record<string, number> {
    const coverage: Record<string, number> = {};

    for (const category of Object.keys(PLATFORM_CATEGORIES)) {
      coverage[category] = this.countObjectsForCategory(composition, category as PlatformCategory);
    }

    return coverage;
  }

  // ---------------------------------------------------------------------------
  // CR001: VR-only traits without @platform() constraint
  // ---------------------------------------------------------------------------

  private checkVROnlyTraits(
    composition: HoloComposition,
    issues: CrossRealityValidationIssue[]
  ): void {
    const allObjects = this.collectAllObjects(composition);

    for (const obj of allObjects) {
      for (const trait of obj.traits) {
        if (VR_ONLY_TRAITS.has(trait.name)) {
          // Check if the object has a @platform() trait constraining it
          const hasPlatformConstraint = obj.traits.some((t) => t.name === 'platform');
          if (!hasPlatformConstraint) {
            issues.push({
              severity: 'error',
              code: 'CR001',
              message: `Object "${obj.name}" uses VR-only trait "@${trait.name}" without a @platform() constraint. This trait is unavailable on non-VR platforms.`,
              blockName: obj.name,
              suggestion: `Add @platform(include: ["vr"]) to constrain "${obj.name}" to VR platforms, or provide a fallback object for other platforms.`,
            });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // CR002: No fallback for platforms lacking a capability
  // ---------------------------------------------------------------------------

  private checkFallbackObjects(
    composition: HoloComposition,
    issues: CrossRealityValidationIssue[]
  ): void {
    const allObjects = this.collectAllObjects(composition);

    // Find objects with platform constraints
    const constrainedObjects = allObjects.filter((obj) =>
      obj.traits.some((t) => t.name === 'platform')
    );

    for (const obj of constrainedObjects) {
      const platformTrait = obj.traits.find((t) => t.name === 'platform');
      if (!platformTrait) continue;

      const includedCategories = this.extractPlatformCategories(platformTrait);
      if (includedCategories.length === 0) continue;

      // Check if there's a fallback for excluded platforms
      const allCategories = Object.keys(PLATFORM_CATEGORIES) as PlatformCategory[];
      const excludedCategories = allCategories.filter((c) => !includedCategories.includes(c));

      if (excludedCategories.length > 0) {
        // Look for a sibling object that covers the excluded categories
        const hasFallback = allObjects.some((other) => {
          if (other.name === obj.name) return false;
          // Check if the other object covers at least one excluded category
          const otherPlatformTrait = other.traits.find((t) => t.name === 'platform');
          if (!otherPlatformTrait) return true; // Unconstrained = covers all
          const otherCategories = this.extractPlatformCategories(otherPlatformTrait);
          return excludedCategories.some((c) => otherCategories.includes(c));
        });

        if (!hasFallback) {
          issues.push({
            severity: 'warning',
            code: 'CR002',
            message: `Object "${obj.name}" is constrained to [${includedCategories.join(', ')}] but no fallback exists for [${excludedCategories.join(', ')}].`,
            blockName: obj.name,
            suggestion: `Add a fallback object with @platform(include: [${excludedCategories.map((c) => `"${c}"`).join(', ')}]) to provide content on those platforms.`,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // CR003: Norm referencing a spatial zone missing on some platforms
  // ---------------------------------------------------------------------------

  private checkNormZoneReferences(
    composition: HoloComposition,
    issues: CrossRealityValidationIssue[]
  ): void {
    const norms = composition.norms ?? [];
    const zones = composition.zones ?? [];
    const zoneNames = new Set(zones.map((z) => z.name));

    for (const norm of norms) {
      // Check if the norm references a zone in its properties
      const scope = norm.properties?.['scope'];
      if (typeof scope === 'string' && scope.startsWith('zone:')) {
        const zoneName = scope.slice(5); // strip "zone:"
        if (!zoneNames.has(zoneName)) {
          issues.push({
            severity: 'error',
            code: 'CR003',
            message: `Norm "${norm.name}" references spatial zone "${zoneName}" which does not exist in this composition.`,
            blockName: norm.name,
            suggestion: `Add a zone "${zoneName}" block, or change the norm scope to reference an existing zone.`,
          });
        }
      }

      // Also check the representation condition for zone references
      const repr = norm.representation;
      if (repr) {
        const condition = repr.properties?.['scope'];
        if (typeof condition === 'string' && condition.startsWith('zone:')) {
          const zoneName = condition.slice(5);
          if (!zoneNames.has(zoneName)) {
            issues.push({
              severity: 'error',
              code: 'CR003',
              message: `Norm "${norm.name}" representation references spatial zone "${zoneName}" which is not defined.`,
              blockName: norm.name,
              suggestion: `Define zone "${zoneName}" in the composition or update the norm representation scope.`,
            });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // CR004: Platform with zero objects
  // ---------------------------------------------------------------------------

  private checkEmptyPlatforms(
    composition: HoloComposition,
    issues: CrossRealityValidationIssue[]
  ): void {
    const coverage = this.analyzePlatformCoverage(composition);

    for (const [category, count] of Object.entries(coverage)) {
      if (count === 0) {
        issues.push({
          severity: 'warning',
          code: 'CR004',
          message: `Platform category "${category}" has zero objects. Users on ${category} devices will see an empty experience.`,
          blockName: composition.name,
          suggestion: `Add at least one object targeting "${category}" or create a universal fallback object without @platform() constraints.`,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // CR006: MVC payload size estimate
  // ---------------------------------------------------------------------------

  private checkMVCPayloadSize(
    composition: HoloComposition,
    issues: CrossRealityValidationIssue[]
  ): void {
    // Estimate size based on state complexity
    const stateProps = composition.state?.properties ?? [];
    let estimatedBytes = 0;

    // Base overhead for MVC payload structure
    estimatedBytes += 500;

    // State properties contribute to resumeContext
    for (const prop of stateProps) {
      const val = prop.value;
      if (typeof val === 'string') {
        estimatedBytes += val.length * 2; // UTF-16 worst case
      } else if (Array.isArray(val)) {
        estimatedBytes += JSON.stringify(val).length;
      } else if (val !== null && typeof val === 'object') {
        estimatedBytes += JSON.stringify(val).length;
      } else {
        estimatedBytes += 20; // number/boolean
      }
    }

    // Objects with state contribute to context
    const allObjects = this.collectAllObjects(composition);
    for (const obj of allObjects) {
      if (obj.state) {
        for (const sp of obj.state.properties) {
          if (typeof sp.value === 'string') {
            estimatedBytes += sp.value.length;
          } else {
            estimatedBytes += 50;
          }
        }
      }
    }

    const BUDGET = 10 * 1024; // 10KB
    if (estimatedBytes > BUDGET) {
      issues.push({
        severity: 'warning',
        code: 'CR006',
        message: `Estimated MVC payload size (~${Math.round(estimatedBytes / 1024)}KB) exceeds the 10KB handoff budget. Large resumeContext in task state will cause slow handoffs.`,
        blockName: composition.name,
        suggestion: `Reduce state complexity, use lazy-loading for large data, or split context across multiple handoff cycles.`,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // CR007: Circular handoff dependencies
  // ---------------------------------------------------------------------------

  private checkCircularHandoffs(
    composition: HoloComposition,
    issues: CrossRealityValidationIssue[]
  ): void {
    // Build a dependency graph from objects that reference specific platforms
    const allObjects = this.collectAllObjects(composition);
    const deps = new Map<string, Set<string>>();

    for (const obj of allObjects) {
      // Check for "handoff_to" or "requires_device" trait configs
      for (const trait of obj.traits) {
        if (trait.name === 'handoff' || trait.name === 'requires_device') {
          const target = trait.config['target'] ?? trait.config['device'];
          if (typeof target === 'string') {
            if (!deps.has(obj.name)) deps.set(obj.name, new Set());
            deps.get(obj.name)!.add(target);
          }
        }
      }
    }

    // Detect cycles using DFS
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (node: string, path: string[]): string[] | null => {
      if (inStack.has(node)) {
        return [...path, node]; // cycle found
      }
      if (visited.has(node)) return null;

      visited.add(node);
      inStack.add(node);

      const neighbors = deps.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const cycle = dfs(neighbor, [...path, node]);
          if (cycle) return cycle;
        }
      }

      inStack.delete(node);
      return null;
    };

    for (const node of deps.keys()) {
      if (!visited.has(node)) {
        const cycle = dfs(node, []);
        if (cycle) {
          const cycleStr = cycle.join(' -> ');
          issues.push({
            severity: 'error',
            code: 'CR007',
            message: `Circular handoff dependency detected: ${cycleStr}. Device A needs device B which needs device A.`,
            blockName: cycle[0],
            suggestion: `Break the circular dependency by removing one of the handoff requirements or adding an intermediate device.`,
          });
          break; // Report one cycle per validation pass
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Handoff path analysis
  // ---------------------------------------------------------------------------

  private analyzeOneHandoff(from: string, to: string): HandoffPathAnalysis {
    const fromCategory = FORM_FACTOR_TO_CATEGORY[from];
    const toCategory = FORM_FACTOR_TO_CATEGORY[to];

    const fromEmbodiment = DEFAULT_EMBODIMENT[fromCategory];
    const toEmbodiment = DEFAULT_EMBODIMENT[toCategory];

    const adaptations: string[] = [];

    // Determine what MVC objects need adaptation
    if (fromEmbodiment !== toEmbodiment) {
      adaptations.push(`embodiment: ${fromEmbodiment} -> ${toEmbodiment}`);
    }

    // Spatial context adaptation
    if (fromCategory === 'vr' && toCategory !== 'vr' && toCategory !== 'ar') {
      adaptations.push('spatial_context: 3D -> 2D projection');
    }
    if (fromCategory !== 'vr' && fromCategory !== 'ar' && toCategory === 'vr') {
      adaptations.push('spatial_context: 2D -> 3D reconstruction');
    }

    // Input modality adaptation
    const fromInput = this.primaryInputFor(fromCategory);
    const toInput = this.primaryInputFor(toCategory);
    if (fromInput !== toInput) {
      adaptations.push(`input: ${fromInput} -> ${toInput}`);
    }

    // Feasibility check
    let feasible = true;
    let reason: string | undefined;

    // Safety-critical transitions
    if (SAFETY_CRITICAL_FORM_FACTORS.has(from) || SAFETY_CRITICAL_FORM_FACTORS.has(to)) {
      if (SAFETY_CRITICAL_FORM_FACTORS.has(to) && from === 'vr-headset') {
        feasible = false;
        reason = `Safety concern: direct handoff from ${from} to ${to} should require an intermediate step (e.g., phone or wearable). User must be alert before operating vehicle.`;
      }
      if (SAFETY_CRITICAL_FORM_FACTORS.has(from) && to === 'vr-headset') {
        feasible = false;
        reason = `Safety concern: direct handoff from ${from} to ${to} is dangerous. User must safely stop the vehicle first.`;
      }
    }

    // Significant embodiment change (CR005)
    const delta = Math.abs(EMBODIMENT_WEIGHT[fromEmbodiment] - EMBODIMENT_WEIGHT[toEmbodiment]);
    if (delta >= SIGNIFICANT_EMBODIMENT_DELTA && feasible) {
      // Still feasible but noteworthy
      reason = `Significant embodiment change (${fromEmbodiment} -> ${toEmbodiment}). User experience will change substantially.`;
    }

    return { from, to, feasible, reason, adaptations };
  }

  private generateHandoffIssues(
    paths: HandoffPathAnalysis[],
    issues: CrossRealityValidationIssue[]
  ): void {
    for (const path of paths) {
      if (!path.feasible) {
        // Safety concerns are reported as CR005 errors
        issues.push({
          severity: 'info',
          code: 'CR005',
          message: `Handoff ${path.from} -> ${path.to}: ${path.reason}`,
          blockName: `${path.from}->${path.to}`,
          suggestion: path.reason?.includes('Safety')
            ? `Add an intermediate handoff step (e.g., phone or wearable) between ${path.from} and ${path.to}.`
            : undefined,
        });
      } else if (path.reason) {
        // Significant embodiment changes are info-level
        issues.push({
          severity: 'info',
          code: 'CR005',
          message: `Handoff ${path.from} -> ${path.to}: ${path.reason}`,
          blockName: `${path.from}->${path.to}`,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Collect all objects from a composition, including those inside spatial groups,
   * conditionals, and iterators.
   */
  private collectAllObjects(composition: HoloComposition): HoloObjectDecl[] {
    const objects: HoloObjectDecl[] = [...composition.objects];

    // Objects in spatial groups
    for (const group of composition.spatialGroups) {
      objects.push(...group.objects);
      if (group.groups) {
        for (const nested of group.groups) {
          objects.push(...nested.objects);
        }
      }
    }

    // Objects in conditionals
    for (const cond of composition.conditionals) {
      objects.push(...cond.objects);
      if (cond.elseObjects) objects.push(...cond.elseObjects);
    }

    // Objects in iterators
    for (const iter of composition.iterators) {
      objects.push(...iter.objects);
    }

    // Objects in templates
    for (const template of composition.templates) {
      // Templates define object shapes but not instances;
      // however, traits on templates still need validation.
    }

    return objects;
  }

  /**
   * Count how many objects are available for a given platform category.
   * Unconstrained objects count for all platforms.
   */
  private countObjectsForCategory(
    composition: HoloComposition,
    category: PlatformCategory
  ): number {
    const allObjects = this.collectAllObjects(composition);
    let count = 0;

    for (const obj of allObjects) {
      const platformTrait = obj.traits.find((t) => t.name === 'platform');
      if (!platformTrait) {
        // Unconstrained: available on all platforms
        count++;
        continue;
      }

      const categories = this.extractPlatformCategories(platformTrait);
      if (categories.length === 0) {
        // No categories specified means all
        count++;
      } else if (categories.includes(category)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Extract platform categories from a @platform() trait config.
   */
  private extractPlatformCategories(trait: HoloObjectTrait): PlatformCategory[] {
    const include = trait.config['include'];
    if (Array.isArray(include)) {
      return include.filter(
        (v): v is PlatformCategory => typeof v === 'string' && v in PLATFORM_CATEGORIES
      );
    }
    if (typeof include === 'string' && include in PLATFORM_CATEGORIES) {
      return [include as PlatformCategory];
    }
    return [];
  }

  /**
   * Get the primary input modality for a platform category.
   */
  private primaryInputFor(category: PlatformCategory): string {
    switch (category) {
      case 'vr':
        return 'hand/controller';
      case 'ar':
        return 'gesture/gaze';
      case 'mobile':
        return 'touch';
      case 'desktop':
        return 'mouse/keyboard';
      case 'automotive':
        return 'voice';
      case 'wearable':
        return 'touch/voice';
      default:
        return 'unknown';
    }
  }
}
