/**
 * Gaussian Primitive Budget Analyzer
 *
 * Analyzes HoloComposition ASTs to detect Gaussian splatting primitives and
 * emit warnings when the total Gaussian count exceeds platform-specific budgets.
 *
 * Platform budgets (based on real hardware profiling):
 *   - Quest 3 (mobile VR):  180,000 Gaussians at 72 fps (W.034)
 *   - Desktop VR (PCVR):  2,000,000 Gaussians at 90 fps
 *   - WebGPU (browser):     500,000 Gaussians at 60 fps
 *   - Mobile AR:            100,000 Gaussians at 30 fps
 *   - visionOS:           1,000,000 Gaussians at 90 fps
 *
 * Research references:
 *   W.034 — VR Gaussian budget (~180K total on Quest 3, 60K per avatar via SqueezeMe)
 *   W.035 — Radix sort outperforms bitonic sort for N > 64K splats
 *
 * TODO(G.SIG25.02): Add overdraw estimator — raw splat count is insufficient.
 *   CDRIN (SIGGRAPH 2025) confirmed overdraw is the #1 mobile VR GS killer.
 *   Quest 3 can't handle >200K effective splats with overdraw factors >3x.
 *   Need: estimated_overdraw = sum(per_pixel_splat_overlap) / pixel_count.
 *
 * TODO(W.SIG25.04): Abstract @gaussian_splat behind format-agnostic interface.
 *   GS standardization workshop at SIGGRAPH 2025 means format wars are coming.
 *   Support PLY import but store internally in our own representation.
 *   If we commit to one format and standardization picks another → expensive migration.
 *
 * TODO(P.043): Add shared-sort multi-user cost model.
 *   C_shared(N) = S + N*R where S=sort, R=rasterize.
 *   Savings σ(N) = S(N-1)/N(S+R), asymptotic ceiling = S/(S+R) ≈ 60%.
 *   Practical ceiling: N≈8-12 (memory bandwidth, frustum divergence, coordination).
 *   See docs/P043_MULTIVIEW_FOVEATED_GS_PAPER.md for full derivation.
 *
 * @version 1.0.0
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloObjectTrait,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Supported target platforms for Gaussian budget analysis.
 */
export type GaussianPlatform =
  | 'quest3'
  | 'desktop_vr'
  | 'webgpu'
  | 'mobile_ar'
  | 'visionos';

/**
 * Severity of a budget warning.
 *
 * - `info`:     Under budget, no action needed
 * - `warning`:  Approaching budget (> 80% utilization)
 * - `critical`: Over budget, will likely cause frame drops or OOM
 */
export type BudgetSeverity = 'info' | 'warning' | 'critical';

/**
 * A single Gaussian splat source found in the composition.
 */
export interface GaussianSource {
  /** Object name containing the gaussian_splat trait */
  objectName: string;
  /** Source file path (e.g., "scene.ply") */
  sourceFile: string;
  /** Maximum splat count declared in config (max_splats) */
  maxSplats: number;
  /** Per-avatar reservation if configured */
  perAvatarReservation: number;
  /** Budget cap from trait config (gaussian_budget.total_cap), 0 = none */
  traitBudgetCap: number;
}

/**
 * Budget warning emitted when Gaussian counts approach or exceed limits.
 */
export interface GaussianBudgetWarning {
  /** Warning severity */
  severity: BudgetSeverity;
  /** Target platform this warning applies to */
  platform: GaussianPlatform;
  /** Human-readable warning message */
  message: string;
  /** Total Gaussians in composition */
  totalGaussians: number;
  /** Platform budget limit */
  budgetLimit: number;
  /** Utilization percentage (0-100+) */
  utilizationPercent: number;
  /** Number of Gaussians over budget (0 if under) */
  overage: number;
  /** Actionable suggestion for resolving the issue */
  suggestion: string;
  // TODO(G.SIG25.02): Add overdrawFactor field (estimated avg splats-per-pixel)
  // TODO(P.043): Add multiUserCostMultiplier field for N-user shared-sort estimates
}

/**
 * Complete result of a Gaussian budget analysis.
 */
export interface GaussianBudgetAnalysis {
  /** Total Gaussian primitives found across all objects */
  totalGaussians: number;
  /** Individual Gaussian sources found */
  sources: GaussianSource[];
  /** Warnings for each requested platform */
  warnings: GaussianBudgetWarning[];
  /** Whether the composition is within budget for all requested platforms */
  withinBudget: boolean;
  /** Per-platform utilization summary */
  platformUtilization: Record<GaussianPlatform, number>;
}

// =============================================================================
// PLATFORM BUDGETS
// =============================================================================

/**
 * Platform-specific Gaussian primitive budgets.
 *
 * These values represent the maximum number of Gaussians that can be
 * rendered at the platform's target framerate without frame drops.
 */
export const GAUSSIAN_PLATFORM_BUDGETS: Record<GaussianPlatform, {
  /** Maximum Gaussian count for real-time rendering */
  maxGaussians: number;
  /** Target framerate (fps) */
  targetFps: number;
  /** Platform display name for warnings */
  displayName: string;
  /** Recommended per-avatar budget (W.034) */
  perAvatarBudget: number;
  /** Warning threshold as fraction of budget (e.g., 0.8 = warn at 80%) */
  warningThreshold: number;
}> = {
  quest3: {
    maxGaussians: 180_000,
    targetFps: 72,
    displayName: 'Meta Quest 3',
    perAvatarBudget: 60_000,
    warningThreshold: 0.8,
  },
  desktop_vr: {
    maxGaussians: 2_000_000,
    targetFps: 90,
    displayName: 'Desktop VR (PCVR)',
    perAvatarBudget: 200_000,
    warningThreshold: 0.8,
  },
  webgpu: {
    maxGaussians: 500_000,
    targetFps: 60,
    displayName: 'WebGPU (Browser)',
    perAvatarBudget: 100_000,
    warningThreshold: 0.8,
  },
  mobile_ar: {
    maxGaussians: 100_000,
    targetFps: 30,
    displayName: 'Mobile AR',
    perAvatarBudget: 30_000,
    warningThreshold: 0.8,
  },
  visionos: {
    maxGaussians: 1_000_000,
    targetFps: 90,
    displayName: 'Apple Vision Pro (visionOS)',
    perAvatarBudget: 150_000,
    warningThreshold: 0.8,
  },
};

/**
 * Default max_splats value used when gaussian_splat trait does not specify one.
 * Matches the GaussianSplatTrait default.
 */
const DEFAULT_MAX_SPLATS = 1_000_000;

// =============================================================================
// ANALYZER
// =============================================================================
// TODO(P.XR.07): Wire to dynamic memory budget manager.
//   GaussianBudgetAnalyzer must account for KV cache memory from @llm_agent.
//   On Quest 3 (8GB): agent KV cache competes with GS headroom.
//   Add getAvailableGaussianBudget(kvCacheSize_MB): per platform.
//   G.XR.05: 200K+ splats @ 67 GB/s → <15 GB/s left for model weight streaming.

/**
 * Options for configuring the Gaussian budget analysis.
 */
export interface GaussianBudgetAnalyzerOptions {
  /** Platforms to check budgets against (default: all platforms) */
  platforms?: GaussianPlatform[];
  /** Custom budget overrides per platform */
  budgetOverrides?: Partial<Record<GaussianPlatform, number>>;
  /** Whether to include info-level messages for under-budget platforms (default: false) */
  includeInfoMessages?: boolean;
}

/**
 * Analyzes a HoloComposition AST for Gaussian primitive budget compliance.
 *
 * Walks the entire composition tree (objects, spatial groups, children)
 * to find all gaussian_splat traits, sums their max_splats values, and
 * checks against platform-specific budgets.
 *
 * @example
 * ```typescript
 * const analyzer = new GaussianBudgetAnalyzer({ platforms: ['quest3', 'webgpu'] });
 * const result = analyzer.analyze(composition);
 *
 * for (const warning of result.warnings) {
 *   if (warning.severity === 'critical') {
 *     console.error(warning.message);
 *   }
 * }
 * ```
 */
export class GaussianBudgetAnalyzer {
  private platforms: GaussianPlatform[];
  private budgetOverrides: Partial<Record<GaussianPlatform, number>>;
  private includeInfoMessages: boolean;

  constructor(options: GaussianBudgetAnalyzerOptions = {}) {
    this.platforms = options.platforms ?? (
      Object.keys(GAUSSIAN_PLATFORM_BUDGETS) as GaussianPlatform[]
    );
    this.budgetOverrides = options.budgetOverrides ?? {};
    this.includeInfoMessages = options.includeInfoMessages ?? false;
  }

  /**
   * Analyze a HoloComposition for Gaussian budget compliance.
   *
   * @param composition - The parsed HoloComposition AST
   * @returns Complete budget analysis with warnings
   */
  analyze(composition: HoloComposition): GaussianBudgetAnalysis {
    // 1. Collect all Gaussian sources from the composition
    const sources = this.collectGaussianSources(composition);

    // 2. Sum total Gaussians
    const totalGaussians = sources.reduce((sum, s) => sum + s.maxSplats, 0);

    // 3. Check against each platform budget
    const warnings: GaussianBudgetWarning[] = [];
    const platformUtilization: Record<GaussianPlatform, number> = {} as any;

    for (const platform of this.platforms) {
      const budget = this.getBudgetForPlatform(platform);
      const utilization = budget > 0 ? (totalGaussians / budget) * 100 : 0;
      platformUtilization[platform] = Math.round(utilization * 10) / 10;

      const warning = this.evaluateBudget(platform, totalGaussians, budget, utilization);
      if (warning) {
        warnings.push(warning);
      }
    }

    // 4. Determine overall compliance
    const withinBudget = warnings.every(w => w.severity !== 'critical');

    return {
      totalGaussians,
      sources,
      warnings,
      withinBudget,
      platformUtilization,
    };
  }

  /**
   * Quick check: returns true if the composition is within budget for
   * a specific platform.
   */
  isWithinBudget(composition: HoloComposition, platform: GaussianPlatform): boolean {
    const sources = this.collectGaussianSources(composition);
    const totalGaussians = sources.reduce((sum, s) => sum + s.maxSplats, 0);
    const budget = this.getBudgetForPlatform(platform);
    return totalGaussians <= budget;
  }

  /**
   * Format warnings as compiler output comments.
   * Suitable for embedding in generated code.
   *
   * @param analysis - The analysis result to format
   * @param commentPrefix - Comment syntax for the target language (default: '//')
   * @returns Array of comment lines
   */
  formatAsComments(analysis: GaussianBudgetAnalysis, commentPrefix: string = '//'): string[] {
    if (analysis.warnings.length === 0) return [];

    const lines: string[] = [];
    lines.push(`${commentPrefix} ========================================`);
    lines.push(`${commentPrefix} GAUSSIAN SPLAT BUDGET ANALYSIS`);
    lines.push(`${commentPrefix} Total Gaussians: ${formatNumber(analysis.totalGaussians)}`);
    lines.push(`${commentPrefix} ========================================`);

    for (const warning of analysis.warnings) {
      const icon = warning.severity === 'critical' ? 'ERROR' :
                   warning.severity === 'warning' ? 'WARNING' : 'INFO';
      lines.push(`${commentPrefix} [${icon}] ${warning.platform}: ${warning.message}`);
      if (warning.suggestion) {
        lines.push(`${commentPrefix}   -> ${warning.suggestion}`);
      }
    }

    if (analysis.sources.length > 0) {
      lines.push(`${commentPrefix} ----------------------------------------`);
      lines.push(`${commentPrefix} Sources:`);
      for (const source of analysis.sources) {
        lines.push(`${commentPrefix}   ${source.objectName}: ${formatNumber(source.maxSplats)} splats (${source.sourceFile || 'no source'})`);
      }
    }

    lines.push(`${commentPrefix} ========================================`);
    return lines;
  }

  // ---------------------------------------------------------------------------
  // Private: AST Walking
  // ---------------------------------------------------------------------------

  /**
   * Walk the entire composition to find all gaussian_splat traits.
   */
  private collectGaussianSources(composition: HoloComposition): GaussianSource[] {
    const sources: GaussianSource[] = [];

    // Walk top-level objects
    if (composition.objects) {
      for (const obj of composition.objects) {
        this.collectFromObject(obj, sources);
      }
    }

    // Walk spatial groups
    if (composition.spatialGroups) {
      for (const group of composition.spatialGroups) {
        this.collectFromGroup(group, sources);
      }
    }

    // Walk conditional blocks (both branches)
    if (composition.conditionals) {
      for (const cond of composition.conditionals) {
        if (cond.objects) {
          for (const obj of cond.objects) {
            this.collectFromObject(obj, sources);
          }
        }
        if (cond.elseObjects) {
          for (const obj of cond.elseObjects) {
            this.collectFromObject(obj, sources);
          }
        }
      }
    }

    // Walk iterator blocks
    if (composition.iterators) {
      for (const iter of composition.iterators) {
        if (iter.objects) {
          for (const obj of iter.objects) {
            this.collectFromObject(obj, sources);
          }
        }
      }
    }

    return sources;
  }

  /**
   * Check a single object (and its children) for gaussian_splat traits.
   */
  private collectFromObject(obj: HoloObjectDecl, sources: GaussianSource[]): void {
    if (obj.traits) {
      for (const trait of obj.traits) {
        if (trait.name === 'gaussian_splat') {
          sources.push(this.extractGaussianSource(obj.name, trait));
        }
      }
    }

    // Recurse into children
    if (obj.children) {
      for (const child of obj.children) {
        this.collectFromObject(child, sources);
      }
    }
  }

  /**
   * Walk a spatial group and its nested groups/objects.
   */
  private collectFromGroup(group: HoloSpatialGroup, sources: GaussianSource[]): void {
    if (group.objects) {
      for (const obj of group.objects) {
        this.collectFromObject(obj, sources);
      }
    }

    if (group.groups) {
      for (const subgroup of group.groups) {
        this.collectFromGroup(subgroup, sources);
      }
    }
  }

  /**
   * Extract Gaussian source info from a gaussian_splat trait.
   */
  private extractGaussianSource(objectName: string, trait: HoloObjectTrait): GaussianSource {
    const config = (trait.config ?? {}) as Record<string, any>;

    return {
      objectName,
      sourceFile: (config.src as string) || (config.source as string) || '',
      maxSplats: typeof config.max_splats === 'number'
        ? config.max_splats
        : DEFAULT_MAX_SPLATS,
      perAvatarReservation:
        typeof config.gaussian_budget?.per_avatar_reservation === 'number'
          ? config.gaussian_budget.per_avatar_reservation
          : 0,
      traitBudgetCap:
        typeof config.gaussian_budget?.total_cap === 'number'
          ? config.gaussian_budget.total_cap
          : 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Private: Budget Evaluation
  // ---------------------------------------------------------------------------

  /**
   * Get the effective budget for a platform (with overrides).
   */
  private getBudgetForPlatform(platform: GaussianPlatform): number {
    if (this.budgetOverrides[platform] !== undefined) {
      return this.budgetOverrides[platform]!;
    }
    return GAUSSIAN_PLATFORM_BUDGETS[platform].maxGaussians;
  }

  /**
   * Evaluate whether the Gaussian count exceeds the platform budget
   * and produce an appropriate warning.
   */
  private evaluateBudget(
    platform: GaussianPlatform,
    totalGaussians: number,
    budget: number,
    utilization: number,
  ): GaussianBudgetWarning | null {
    const platformInfo = GAUSSIAN_PLATFORM_BUDGETS[platform];
    const overage = Math.max(0, totalGaussians - budget);

    if (totalGaussians > budget) {
      // Critical: over budget
      return {
        severity: 'critical',
        platform,
        message:
          `Gaussian count (${formatNumber(totalGaussians)}) exceeds ` +
          `${platformInfo.displayName} budget of ${formatNumber(budget)} ` +
          `by ${formatNumber(overage)} (${utilization.toFixed(1)}% utilization). ` +
          `Expect frame drops below ${platformInfo.targetFps} fps.`,
        totalGaussians,
        budgetLimit: budget,
        utilizationPercent: utilization,
        overage,
        suggestion: this.generateSuggestion(platform, totalGaussians, budget, overage),
      };
    }

    const warningThreshold = platformInfo.warningThreshold;
    if (utilization >= warningThreshold * 100) {
      // Warning: approaching budget
      const headroom = budget - totalGaussians;
      return {
        severity: 'warning',
        platform,
        message:
          `Gaussian count (${formatNumber(totalGaussians)}) is at ` +
          `${utilization.toFixed(1)}% of ${platformInfo.displayName} budget ` +
          `(${formatNumber(budget)}). Only ${formatNumber(headroom)} Gaussians of headroom remain.`,
        totalGaussians,
        budgetLimit: budget,
        utilizationPercent: utilization,
        overage: 0,
        suggestion:
          `Consider enabling SPZ v2 compression or octree LOD to maintain ` +
          `headroom for dynamic content.`,
      };
    }

    if (this.includeInfoMessages) {
      // Info: under budget
      return {
        severity: 'info',
        platform,
        message:
          `Gaussian count (${formatNumber(totalGaussians)}) is within ` +
          `${platformInfo.displayName} budget (${formatNumber(budget)}, ` +
          `${utilization.toFixed(1)}% utilization).`,
        totalGaussians,
        budgetLimit: budget,
        utilizationPercent: utilization,
        overage: 0,
        suggestion: '',
      };
    }

    return null;
  }

  /**
   * Generate an actionable suggestion for resolving budget overages.
   */
  private generateSuggestion(
    platform: GaussianPlatform,
    totalGaussians: number,
    budget: number,
    overage: number,
  ): string {
    const reductionPercent = Math.ceil((overage / totalGaussians) * 100);

    const suggestions: string[] = [];

    // Primary: reduce max_splats
    suggestions.push(
      `Reduce total Gaussians by ${reductionPercent}% ` +
      `(remove ${formatNumber(overage)} splats)`
    );

    // Platform-specific advice
    if (platform === 'quest3') {
      suggestions.push(
        `Apply SqueezeMe UV-space reduction for avatars ` +
        `(target ${formatNumber(GAUSSIAN_PLATFORM_BUDGETS.quest3.perAvatarBudget)}/avatar)`
      );
      suggestions.push(
        `Enable aggressive SPZ v2 compression with pruning (pruneAlphaThreshold: 0.02)`
      );
    } else if (platform === 'webgpu') {
      suggestions.push(
        `Enable octree LOD (lod.mode: "octree", lod.octree_depth: 4-6) ` +
        `for distance-based Gaussian culling`
      );
    } else if (platform === 'mobile_ar') {
      suggestions.push(
        `Use aggressive pruning (pruneAlphaThreshold: 0.03) and ` +
        `reduce SH degree to 0 or 1`
      );
    }

    // Universal advice
    suggestions.push(
      `Set gaussian_budget.total_cap: ${budget} in trait config ` +
      `for runtime enforcement`
    );

    return suggestions.join('. ') + '.';
  }
}

// =============================================================================
// STANDALONE FUNCTION
// =============================================================================

/**
 * Convenience function: analyze a composition against specific platforms.
 * Does not require instantiating the class.
 *
 * @param composition - HoloComposition AST to analyze
 * @param platforms - Target platforms to check (default: all)
 * @returns Budget analysis result
 */
export function analyzeGaussianBudget(
  composition: HoloComposition,
  platforms?: GaussianPlatform[],
): GaussianBudgetAnalysis {
  const analyzer = new GaussianBudgetAnalyzer({ platforms });
  return analyzer.analyze(composition);
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Format a number with thousands separators for readable warning messages.
 */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
