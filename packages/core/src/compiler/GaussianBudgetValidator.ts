/**
 * Gaussian Primitive Budget Validator
 *
 * Emits compiler warnings when a HoloScript composition exceeds the
 * Gaussian splat budget for the target platform.
 *
 * Platform budgets:
 * - Quest 3:     180,000 Gaussians
 * - Desktop VR:  2,000,000 Gaussians
 * - WebGPU:      500,000 Gaussians
 * - Mobile AR:   100,000 Gaussians
 * - visionOS:    1,000,000 Gaussians
 *
 * @version 1.0.0
 */

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Target platform identifiers for Gaussian budget enforcement.
 */
export type GaussianPlatform =
  | 'quest3'
  | 'desktop-vr'
  | 'webgpu'
  | 'mobile-ar'
  | 'visionos'
  | 'android-xr'
  | 'pcvr';

/**
 * Gaussian budget limits per platform (number of Gaussian primitives).
 */
export const GAUSSIAN_BUDGETS: Record<GaussianPlatform, number> = {
  quest3: 180_000,
  'desktop-vr': 2_000_000,
  webgpu: 500_000,
  'mobile-ar': 100_000,
  visionos: 1_000_000,
  'android-xr': 300_000,
  pcvr: 5_000_000,
};

/**
 * Warning severity levels.
 */
export type BudgetSeverity = 'info' | 'warning' | 'error';

/**
 * A Gaussian budget diagnostic emitted during compilation.
 */
export interface GaussianBudgetDiagnostic {
  /** Severity level */
  severity: BudgetSeverity;
  /** Human-readable message */
  message: string;
  /** Target platform */
  platform: GaussianPlatform;
  /** Actual Gaussian count in the composition */
  actualCount: number;
  /** Platform budget limit */
  budgetLimit: number;
  /** Usage percentage (0-100+) */
  usagePercent: number;
  /** Source location if available */
  source?: { file?: string; line?: number; column?: number };
  /** Specific node/object that contributes most Gaussians */
  largestContributor?: { name: string; count: number };
}

/**
 * Represents a Gaussian-bearing node in a composition.
 */
export interface GaussianNode {
  /** Node name/identifier */
  name: string;
  /** Gaussian primitive count */
  gaussianCount: number;
  /** Source file path */
  file?: string;
  /** Source line number */
  line?: number;
}

/**
 * Result of budget validation.
 */
export interface GaussianBudgetResult {
  /** All diagnostics generated */
  diagnostics: GaussianBudgetDiagnostic[];
  /** Total Gaussian count across all nodes */
  totalCount: number;
  /** Whether budget is exceeded for any target */
  hasErrors: boolean;
  /** Whether budget warnings were generated */
  hasWarnings: boolean;
  /** Per-platform status */
  platformStatus: Map<GaussianPlatform, { exceeded: boolean; usagePercent: number }>;
}

// ── Validator ──────────────────────────────────────────────────────────────

/**
 * Configuration for the budget validator.
 */
export interface GaussianBudgetValidatorConfig {
  /** Target platforms to validate against (default: all) */
  targetPlatforms?: GaussianPlatform[];
  /** Warning threshold as percentage (default: 80) */
  warningThresholdPercent?: number;
  /** Whether exceeding budget is an error or warning (default: 'warning') */
  overBudgetSeverity?: 'warning' | 'error';
  /** Enable per-node budget breakdown */
  enableBreakdown?: boolean;
}

/**
 * GaussianBudgetValidator checks Gaussian primitive counts against
 * platform-specific budgets during compilation.
 *
 * Usage:
 * ```typescript
 * const validator = new GaussianBudgetValidator({
 *   targetPlatforms: ['quest3', 'webgpu'],
 *   overBudgetSeverity: 'error',
 * });
 *
 * const nodes: GaussianNode[] = [
 *   { name: 'environment.ply', gaussianCount: 150000 },
 *   { name: 'character.ply', gaussianCount: 50000 },
 * ];
 *
 * const result = validator.validate(nodes);
 * for (const diag of result.diagnostics) {
 *   console.warn(`[${diag.severity}] ${diag.message}`);
 * }
 * ```
 */
export class GaussianBudgetValidator {
  private config: Required<GaussianBudgetValidatorConfig>;

  constructor(config: GaussianBudgetValidatorConfig = {}) {
    this.config = {
      targetPlatforms:
        config.targetPlatforms ?? (Object.keys(GAUSSIAN_BUDGETS) as GaussianPlatform[]),
      warningThresholdPercent: config.warningThresholdPercent ?? 80,
      overBudgetSeverity: config.overBudgetSeverity ?? 'warning',
      enableBreakdown: config.enableBreakdown ?? true,
    };
  }

  /**
   * Validate Gaussian primitive counts against platform budgets.
   */
  validate(nodes: GaussianNode[]): GaussianBudgetResult {
    const totalCount = nodes.reduce((sum, node) => sum + node.gaussianCount, 0);
    const diagnostics: GaussianBudgetDiagnostic[] = [];
    const platformStatus = new Map<GaussianPlatform, { exceeded: boolean; usagePercent: number }>();
    let hasErrors = false;
    let hasWarnings = false;

    // Find largest contributor for error messages
    const sorted = [...nodes].sort((a, b) => b.gaussianCount - a.gaussianCount);
    const largestContributor =
      sorted.length > 0 ? { name: sorted[0].name, count: sorted[0].gaussianCount } : undefined;

    for (const platform of this.config.targetPlatforms) {
      const budget = GAUSSIAN_BUDGETS[platform];
      const usagePercent = (totalCount / budget) * 100;
      const exceeded = totalCount > budget;

      platformStatus.set(platform, { exceeded, usagePercent });

      if (exceeded) {
        const severity = this.config.overBudgetSeverity;
        if (severity === 'error') hasErrors = true;
        else hasWarnings = true;

        diagnostics.push({
          severity,
          message:
            `Gaussian budget exceeded for ${platform}: ${totalCount.toLocaleString()} / ${budget.toLocaleString()} (${usagePercent.toFixed(1)}%). ` +
            `Reduce by ${(totalCount - budget).toLocaleString()} primitives.` +
            (largestContributor
              ? ` Largest contributor: '${largestContributor.name}' (${largestContributor.count.toLocaleString()}).`
              : ''),
          platform,
          actualCount: totalCount,
          budgetLimit: budget,
          usagePercent,
          largestContributor,
        });
      } else if (usagePercent >= this.config.warningThresholdPercent) {
        hasWarnings = true;
        diagnostics.push({
          severity: 'warning',
          message: `Gaussian budget approaching limit for ${platform}: ${totalCount.toLocaleString()} / ${budget.toLocaleString()} (${usagePercent.toFixed(1)}%).`,
          platform,
          actualCount: totalCount,
          budgetLimit: budget,
          usagePercent,
          largestContributor,
        });
      } else {
        diagnostics.push({
          severity: 'info',
          message: `Gaussian budget OK for ${platform}: ${totalCount.toLocaleString()} / ${budget.toLocaleString()} (${usagePercent.toFixed(1)}%).`,
          platform,
          actualCount: totalCount,
          budgetLimit: budget,
          usagePercent,
        });
      }
    }

    // Per-node breakdown warnings
    if (this.config.enableBreakdown && sorted.length > 1) {
      for (const node of sorted.slice(0, 5)) {
        const nodePercent = (node.gaussianCount / totalCount) * 100;
        if (nodePercent > 50) {
          diagnostics.push({
            severity: 'info',
            message: `Node '${node.name}' accounts for ${nodePercent.toFixed(1)}% of Gaussian budget (${node.gaussianCount.toLocaleString()} primitives).`,
            platform: this.config.targetPlatforms[0],
            actualCount: node.gaussianCount,
            budgetLimit: GAUSSIAN_BUDGETS[this.config.targetPlatforms[0]],
            usagePercent: nodePercent,
            source: node.file ? { file: node.file, line: node.line } : undefined,
          });
        }
      }
    }

    return { diagnostics, totalCount, hasErrors, hasWarnings, platformStatus };
  }

  /**
   * Quick check: does the total count exceed any target platform budget?
   */
  exceedsBudget(totalGaussians: number): boolean {
    return this.config.targetPlatforms.some(
      (platform) => totalGaussians > GAUSSIAN_BUDGETS[platform]
    );
  }

  /**
   * Get the most restrictive platform budget.
   */
  getMinBudget(): { platform: GaussianPlatform; budget: number } {
    let minPlatform = this.config.targetPlatforms[0];
    let minBudget = GAUSSIAN_BUDGETS[minPlatform];

    for (const platform of this.config.targetPlatforms) {
      if (GAUSSIAN_BUDGETS[platform] < minBudget) {
        minBudget = GAUSSIAN_BUDGETS[platform];
        minPlatform = platform;
      }
    }

    return { platform: minPlatform, budget: minBudget };
  }

  /**
   * Suggest Level-of-Detail (LOD) splits based on budget constraints.
   */
  suggestLODSplits(
    totalGaussians: number,
    platform: GaussianPlatform
  ): { lod0: number; lod1: number; lod2: number } {
    const budget = GAUSSIAN_BUDGETS[platform];

    if (totalGaussians <= budget) {
      return { lod0: totalGaussians, lod1: totalGaussians, lod2: totalGaussians };
    }

    // LOD0: full budget, LOD1: 50%, LOD2: 25%
    return {
      lod0: budget,
      lod1: Math.floor(budget * 0.5),
      lod2: Math.floor(budget * 0.25),
    };
  }
}
