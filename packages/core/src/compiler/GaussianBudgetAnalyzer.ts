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
 *   G.SIG25.02 — Overdraw estimator (CDRIN SIGGRAPH 2025)
 *   W.SIG25.04 — Format-agnostic GS interface
 *   P.043 — Multi-user shared-sort cost model
 *   P.XR.07 — Dynamic GS↔KV memory budget manager
 *
 * @version 2.0.0
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
export type GaussianPlatform = 'quest3' | 'desktop_vr' | 'webgpu' | 'mobile_ar' | 'visionos';

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
  /** G.SIG25.02: Estimated average overdraw factor (splats-per-pixel) */
  overdrawFactor: number;
  /** P.043: Estimated savings percentage for multi-user shared sort */
  multiUserSavings: MultiUserCostEstimate | null;
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
export const GAUSSIAN_PLATFORM_BUDGETS: Record<
  GaussianPlatform,
  {
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
  }
> = {
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

// =============================================================================
// FORMAT-AGNOSTIC GS INTERFACE (W.SIG25.04)
// =============================================================================

/**
 * Supported Gaussian splat formats.
 * W.SIG25.04: Abstraction layer to survive format standardization wars.
 */
export type GaussianFormat = 'ply' | 'splat' | 'spz' | 'holoscript_native';

/**
 * Format-agnostic Gaussian data interface.
 * W.SIG25.04: Internal representation is format-independent.
 */
export interface IGaussianData {
  /** Source format the data was imported from */
  sourceFormat: GaussianFormat;
  /** Number of Gaussian primitives */
  splatCount: number;
  /** Spherical harmonics degree (0-3) */
  shDegree: number;
  /** Whether opacity pruning has been applied */
  pruned: boolean;
  /** Compression method applied */
  compression: 'none' | 'spz_v2' | 'quantized';
  /** Estimated memory footprint in bytes */
  memorySizeBytes: number;
}

/**
 * Detect the GS format from a file extension or magic bytes.
 */
export function detectGaussianFormat(filename: string): GaussianFormat {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ply':
      return 'ply';
    case 'splat':
      return 'splat';
    case 'spz':
      return 'spz';
    default:
      return 'holoscript_native';
  }
}

// =============================================================================
// OVERDRAW ESTIMATOR (G.SIG25.02)
// =============================================================================

/**
 * G.SIG25.02: Estimate overdraw factor from splat count and viewport.
 * CDRIN (SIGGRAPH 2025) confirmed overdraw is the #1 mobile VR GS performance killer.
 *
 * Effective splats = splatCount × overdrawFactor.
 * Quest 3 can't handle >200K effective splats with overdraw >3x.
 *
 * @param splatCount - Total number of Gaussian primitives
 * @param viewportPixels - Viewport resolution in total pixels (width × height)
 * @param avgSplatRadiusPx - Average splat radius in pixels (default: 4px for typical scenes)
 * @returns Estimated overdraw factor (>1.0 means overlapping splats per pixel)
 */
export function estimateOverdraw(
  splatCount: number,
  viewportPixels: number = 1832 * 1920, // Quest 3 per-eye
  avgSplatRadiusPx: number = 4
): number {
  if (splatCount === 0 || viewportPixels === 0) return 0;

  // Each splat covers a circular area of π × r² pixels
  const avgSplatArea = Math.PI * avgSplatRadiusPx * avgSplatRadiusPx;
  // Total covered pixel-area (assumes uniform distribution)
  const totalCoverage = splatCount * avgSplatArea;
  // Overdraw = total coverage / viewport pixels
  return totalCoverage / viewportPixels;
}

// =============================================================================
// MULTI-USER COST MODEL (P.043)
// =============================================================================

/**
 * P.043: Multi-user shared-sort cost estimate.
 */
export interface MultiUserCostEstimate {
  /** Number of simultaneous users/viewpoints */
  userCount: number;
  /** Savings percentage vs independent renders (0-100) */
  savingsPercent: number;
  /** Cost multiplier (1.0 = independent, lower = savings) */
  costMultiplier: number;
  /** Whether this exceeds the practical ceiling */
  exceedsPracticalCeiling: boolean;
}

/**
 * P.043: Calculate shared-sort multi-user rendering savings.
 *
 * C_shared(N) = S + N×R   where S = sort cost, R = rasterize cost.
 * Savings σ(N) = S(N-1) / N(S+R)
 * Asymptotic ceiling = S/(S+R) ≈ 60% (for typical radix sort).
 * Practical ceiling: N ≈ 8-12 (memory bandwidth, frustum divergence).
 *
 * @param userCount - Number of simultaneous users/viewpoints
 * @param sortFraction - Fraction of total render cost from sorting (default: 0.6)
 * @returns Multi-user cost estimate
 */
export function estimateMultiUserCost(
  userCount: number,
  sortFraction: number = 0.6
): MultiUserCostEstimate {
  const PRACTICAL_CEILING = 12;
  const rasterFraction = 1 - sortFraction;

  if (userCount <= 1) {
    return { userCount, savingsPercent: 0, costMultiplier: 1.0, exceedsPracticalCeiling: false };
  }

  // Per-user cost with shared sort: (S + N×R) / N = S/N + R
  const perUserCost = sortFraction / userCount + rasterFraction;
  const savingsPercent = (1 - perUserCost) * 100;
  const costMultiplier = perUserCost;

  return {
    userCount,
    savingsPercent: Math.max(0, Math.round(savingsPercent * 10) / 10),
    costMultiplier: Math.round(costMultiplier * 1000) / 1000,
    exceedsPracticalCeiling: userCount > PRACTICAL_CEILING,
  };
}

// =============================================================================
// DYNAMIC GS↔KV MEMORY BUDGET (P.XR.07)
// =============================================================================

/**
 * P.XR.07: Calculate available Gaussian budget after accounting for KV cache.
 * GS primitives vs KV cache is zero-sum on constrained devices.
 *
 * @param platform - Target platform
 * @param kvCacheSizeMB - Current KV cache size from @llm_agent (in MB)
 * @param totalDeviceMemoryMB - Total device memory (default: per-platform)
 * @param renderReservedMB - Memory reserved for VR rendering pipeline
 * @returns Adjusted max Gaussians after accounting for KV cache
 */
export function getAvailableGaussianBudget(
  platform: GaussianPlatform,
  kvCacheSizeMB: number = 0,
  totalDeviceMemoryMB?: number,
  renderReservedMB?: number
): { maxGaussians: number; memoryAvailableMB: number; kvCacheImpact: string } {
  const DEVICE_MEMORY: Record<GaussianPlatform, number> = {
    quest3: 8192, // 8 GB LPDDR5
    desktop_vr: 16384, // 16 GB typical
    webgpu: 4096, // Browser memory budget
    mobile_ar: 4096, // Mobile RAM budget
    visionos: 16384, // M2 unified memory
  };

  const RENDER_RESERVED: Record<GaussianPlatform, number> = {
    quest3: 3072, // 3 GB for VR rendering
    desktop_vr: 4096, // 4 GB for VR rendering
    webgpu: 1024, // 1 GB browser overhead
    mobile_ar: 1536, // 1.5 GB for AR
    visionos: 4096, // 4 GB for visionOS
  };

  // Bytes per Gaussian primitive (SH degree 2, compressed)
  const BYTES_PER_GAUSSIAN = 64;

  const totalMem = totalDeviceMemoryMB ?? DEVICE_MEMORY[platform];
  const reserved = renderReservedMB ?? RENDER_RESERVED[platform];
  const availableMB = Math.max(0, totalMem - reserved - kvCacheSizeMB);
  const maxGaussians = Math.floor((availableMB * 1024 * 1024) / BYTES_PER_GAUSSIAN);

  // Cap to platform's inherent GPU throughput limit
  const gpuLimit = GAUSSIAN_PLATFORM_BUDGETS[platform].maxGaussians;
  const effectiveMax = Math.min(maxGaussians, gpuLimit);

  let impact = 'none';
  if (kvCacheSizeMB > 0) {
    const reduction = gpuLimit > 0 ? Math.round(((gpuLimit - effectiveMax) / gpuLimit) * 100) : 0;
    impact = `KV cache (${kvCacheSizeMB}MB) reduces GS budget by ${reduction}%`;
  }

  return {
    maxGaussians: effectiveMax,
    memoryAvailableMB: availableMB,
    kvCacheImpact: impact,
  };
}

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
    this.platforms =
      options.platforms ?? (Object.keys(GAUSSIAN_PLATFORM_BUDGETS) as GaussianPlatform[]);
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
    // Built incrementally — all platforms in this.platforms are assigned in the loop below
    const platformUtilization: Partial<Record<GaussianPlatform, number>> = {};

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
    const withinBudget = warnings.every((w) => w.severity !== 'critical');

    return {
      totalGaussians,
      sources,
      warnings,
      withinBudget,
      platformUtilization: platformUtilization as Record<GaussianPlatform, number>,
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
      const icon =
        warning.severity === 'critical'
          ? 'ERROR'
          : warning.severity === 'warning'
            ? 'WARNING'
            : 'INFO';
      lines.push(`${commentPrefix} [${icon}] ${warning.platform}: ${warning.message}`);
      if (warning.suggestion) {
        lines.push(`${commentPrefix}   -> ${warning.suggestion}`);
      }
    }

    if (analysis.sources.length > 0) {
      lines.push(`${commentPrefix} ----------------------------------------`);
      lines.push(`${commentPrefix} Sources:`);
      for (const source of analysis.sources) {
        lines.push(
          `${commentPrefix}   ${source.objectName}: ${formatNumber(source.maxSplats)} splats (${source.sourceFile || 'no source'})`
        );
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
      maxSplats: typeof config.max_splats === 'number' ? config.max_splats : DEFAULT_MAX_SPLATS,
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
    utilization: number
  ): GaussianBudgetWarning | null {
    const platformInfo = GAUSSIAN_PLATFORM_BUDGETS[platform];
    const overage = Math.max(0, totalGaussians - budget);

    // G.SIG25.02: Compute overdraw factor for this platform
    const viewportPixels =
      platform === 'quest3'
        ? 1832 * 1920
        : platform === 'mobile_ar'
          ? 1170 * 2532
          : platform === 'visionos'
            ? 1920 * 1920
            : 1920 * 1080;
    const overdrawFactor = estimateOverdraw(totalGaussians, viewportPixels);

    // P.043: Multi-user savings (null if single-user)
    const multiUserSavings: MultiUserCostEstimate | null = null;

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
        overdrawFactor,
        multiUserSavings,
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
        overdrawFactor,
        multiUserSavings,
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
        overdrawFactor,
        multiUserSavings,
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
    overage: number
  ): string {
    const reductionPercent = Math.ceil((overage / totalGaussians) * 100);

    const suggestions: string[] = [];

    // Primary: reduce max_splats
    suggestions.push(
      `Reduce total Gaussians by ${reductionPercent}% ` + `(remove ${formatNumber(overage)} splats)`
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
        `Use aggressive pruning (pruneAlphaThreshold: 0.03) and ` + `reduce SH degree to 0 or 1`
      );
    }

    // Universal advice
    suggestions.push(
      `Set gaussian_budget.total_cap: ${budget} in trait config ` + `for runtime enforcement`
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
  platforms?: GaussianPlatform[]
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
