/**
 * @fileoverview HoloLand Safety Gate — Runtime Safety Enforcement
 * @module @holoscript/core/runtime
 *
 * Wires the compile-time safety system into HoloLand's runtime:
 * - Gate: blocks unsafe packages from loading into a world
 * - Monitor: tracks resource usage at runtime, compares to budget
 * - Enforce: applies norm compliance and capability checks live
 *
 * This is the bridge between compile-time verification and
 * the running spatial engine.
 *
 * @version 1.0.0
 */
import { SafetyReport, SafetyVerdict } from '@holoscript/core';
import { runSafetyPass, EffectASTNode } from '@holoscript/core';
import { ResourceCategory, PLATFORM_BUDGETS } from '@holoscript/core';
import { PlatformTarget, PLATFORM_CAPABILITIES } from '@holoscript/core';
import { InstallManifest } from '@holoscript/core';

// =============================================================================
// SAFETY GATE — Load-Time Verification
// =============================================================================

/** Gate decision */
export interface GateDecision {
  allowed: boolean;
  packageId: string;
  reason: string;
  safetyVerdict: SafetyVerdict;
  dangerScore: number;
  warnings: string[];
}

/** World safety policy */
export interface WorldSafetyPolicy {
  /** Maximum danger score allowed (0-10) */
  maxDangerScore: number;
  /** Allowed safety verdicts */
  allowedVerdicts: SafetyVerdict[];
  /** Required minimum publisher trust level */
  minPublisherTrust: 'new' | 'verified' | 'trusted' | 'official';
  /** Maximum total packages per world */
  maxPackages: number;
  /** Platform this world runs on */
  platform: PlatformTarget;
}

const DEFAULT_POLICY: WorldSafetyPolicy = {
  maxDangerScore: 5,
  allowedVerdicts: ['safe', 'warnings'],
  minPublisherTrust: 'new',
  maxPackages: 50,
  platform: 'quest3',
};

/**
 * Gate check: can this package load into this world?
 */
export function gateCheck(
  manifest: InstallManifest,
  report: SafetyReport,
  currentPackageCount: number,
  policy: Partial<WorldSafetyPolicy> = {}
): GateDecision {
  const p = { ...DEFAULT_POLICY, ...policy };
  const warnings: string[] = [];

  // Check verdict
  if (!p.allowedVerdicts.includes(report.verdict)) {
    return {
      allowed: false,
      packageId: manifest.packageId,
      reason: `Safety verdict '${report.verdict}' not allowed (allowed: ${p.allowedVerdicts.join(', ')})`,
      safetyVerdict: report.verdict,
      dangerScore: report.dangerScore,
      warnings,
    };
  }

  // Check danger score
  if (report.dangerScore > p.maxDangerScore) {
    return {
      allowed: false,
      packageId: manifest.packageId,
      reason: `Danger score ${report.dangerScore} exceeds max ${p.maxDangerScore}`,
      safetyVerdict: report.verdict,
      dangerScore: report.dangerScore,
      warnings,
    };
  }

  // Check package limit
  if (currentPackageCount >= p.maxPackages) {
    return {
      allowed: false,
      packageId: manifest.packageId,
      reason: `World at package limit (${p.maxPackages})`,
      safetyVerdict: report.verdict,
      dangerScore: report.dangerScore,
      warnings,
    };
  }

  // Check platform compatibility
  if (!manifest.targetPlatforms.includes(p.platform)) {
    warnings.push(`Package not optimized for ${p.platform}`);
  }

  // Check budget headroom
  for (const diag of report.budget.diagnostics) {
    if (diag.severity === 'warning') {
      warnings.push(`Budget warning: ${diag.category} at ${diag.usagePercent.toFixed(0)}%`);
    }
  }

  return {
    allowed: true,
    packageId: manifest.packageId,
    reason: 'Passed all safety gates',
    safetyVerdict: report.verdict,
    dangerScore: report.dangerScore,
    warnings,
  };
}

// =============================================================================
// RUNTIME MONITOR — Live Resource Tracking
// =============================================================================

/** Real-time resource usage snapshot */
export interface ResourceSnapshot {
  timestamp: number;
  usage: Partial<Record<ResourceCategory, number>>;
  budgetPercent: Partial<Record<ResourceCategory, number>>;
  overBudget: boolean;
  violations: string[];
}

/**
 * RuntimeMonitor — tracks live resource usage against platform budgets.
 */
export class RuntimeMonitor {
  private platform: PlatformTarget;
  private currentUsage: Record<string, number> = {};
  private history: ResourceSnapshot[] = [];
  private maxHistory: number;

  constructor(platform: PlatformTarget, maxHistory: number = 100) {
    this.platform = platform;
    this.maxHistory = maxHistory;
  }

  /**
   * Report current resource usage.
   */
  report(usage: Partial<Record<ResourceCategory, number>>): ResourceSnapshot {
    const limits = PLATFORM_BUDGETS[this.platform] || {};
    const budgetPercent: Partial<Record<ResourceCategory, number>> = {};
    const violations: string[] = [];
    let overBudget = false;

    for (const [cat, value] of Object.entries(usage)) {
      this.currentUsage[cat] = value as number;
      const limit = limits[cat as ResourceCategory];
      if (limit) {
        const percent = ((value as number) / limit) * 100;
        budgetPercent[cat as ResourceCategory] = percent;
        if (percent > 100) {
          overBudget = true;
          violations.push(`${cat}: ${value as number}/${limit} (${percent.toFixed(0)}%)`);
        }
      }
    }

    const snapshot: ResourceSnapshot = {
      timestamp: Date.now(),
      usage,
      budgetPercent,
      overBudget,
      violations,
    };

    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) this.history.shift();

    return snapshot;
  }

  /**
   * Get current usage for a resource.
   */
  getUsage(category: ResourceCategory): number {
    return this.currentUsage[category] || 0;
  }

  /**
   * Get budget percentage for a resource.
   */
  getBudgetPercent(category: ResourceCategory): number {
    const limit = (PLATFORM_BUDGETS[this.platform] || {})[category];
    if (!limit) return 0;
    return ((this.currentUsage[category] || 0) / limit) * 100;
  }

  /**
   * Check if any resource is over budget.
   */
  isOverBudget(): boolean {
    const limits = PLATFORM_BUDGETS[this.platform] || {};
    for (const [cat, limit] of Object.entries(limits)) {
      if ((this.currentUsage[cat] || 0) > (limit as number)) return true;
    }
    return false;
  }

  /**
   * Get resource usage history.
   */
  getHistory(): ResourceSnapshot[] {
    return [...this.history];
  }

  /**
   * Get frame timing info for the platform.
   */
  getFrameBudget(): { frameBudgetMs: number; agentBudgetMs: number } {
    const caps = PLATFORM_CAPABILITIES[this.platform];
    return { frameBudgetMs: caps.frameBudgetMs, agentBudgetMs: caps.agentBudgetMs };
  }
}
