/**
 * @fileoverview Safety Report — Aggregated Compile-Time Safety Analysis
 * @module @holoscript/core/compiler/safety
 *
 * Collects results from all safety passes into a single exportable report.
 * Used for marketplace safety certificates and developer feedback.
 *
 * @version 1.0.0
 */

import {
  EffectRow,
  VREffect,
  EffectViolation,
  EffectCertificate,
  EffectTrustLevel,
} from '../../types/effects';
import type { LinearViolation, LinearCheckResult } from '../../types/linear';
import type { ModuleEffectCheckResult } from './EffectChecker';
import type { BudgetAnalysisResult, BudgetDiagnostic } from './ResourceBudgetAnalyzer';
import type { CapabilityCheckResult, CapabilityRequirement } from './CapabilityTypes';

// =============================================================================
// SAFETY REPORT
// =============================================================================

/** Overall safety verdict */
export type SafetyVerdict = 'safe' | 'warnings' | 'unsafe' | 'unchecked';

/** Aggregated safety report */
export interface SafetyReport {
  /** Module identifier */
  moduleId: string;
  /** Overall verdict */
  verdict: SafetyVerdict;
  /** Danger score (0-10) */
  dangerScore: number;
  /** Analysis timestamp */
  timestamp: number;
  /** Checker version */
  version: string;

  /** Layer 1-2: Effect analysis */
  effects: {
    passed: boolean;
    totalEffects: number;
    categories: string[];
    violations: EffectViolation[];
    moduleRow: VREffect[];
  };

  /** Layer 3: Budget analysis */
  budget: {
    passed: boolean;
    diagnostics: BudgetDiagnostic[];
    platformStatus: {
      platform: string;
      exceeded: boolean;
      worstCategory: string;
      worstPercent: number;
    }[];
  };

  /** Layer 4: Capability analysis */
  capabilities: {
    passed: boolean;
    required: CapabilityRequirement[];
    missing: CapabilityRequirement[];
    minimumTrustLevel: string;
  };

  /** Layer 6: Linear type analysis */
  linear: {
    passed: boolean;
    violations: LinearViolation[];
    trackedResources: number;
  };

  /** Summary statistics */
  summary: {
    totalViolations: number;
    errors: number;
    warnings: number;
    infos: number;
  };
}

// =============================================================================
// REPORT BUILDER
// =============================================================================

const CHECKER_VERSION = '1.0.0';

/**
 * Build a safety report from the results of all safety passes.
 */
export function buildSafetyReport(
  moduleId: string,
  effectResult: ModuleEffectCheckResult,
  budgetResult: BudgetAnalysisResult,
  capabilityResult: CapabilityCheckResult,
  dangerScore: number,
  linearResult?: LinearCheckResult
): SafetyReport {
  const effectViolations = effectResult.violations;
  const budgetDiagnostics = budgetResult.diagnostics;
  const capMissing = capabilityResult.missing;
  const linearViolations = linearResult?.violations || [];

  const totalErrors =
    effectViolations.filter((v) => v.severity === 'error').length +
    budgetDiagnostics.filter((d) => d.severity === 'error').length +
    capMissing.length +
    linearViolations.filter((v) => v.severity === 'error').length;

  const totalWarnings =
    effectViolations.filter((v) => v.severity === 'warning').length +
    budgetDiagnostics.filter((d) => d.severity === 'warning').length +
    linearViolations.filter((v) => v.severity === 'warning').length;

  const totalInfos =
    effectViolations.filter((v) => v.severity === 'info').length +
    budgetDiagnostics.filter((d) => d.severity === 'info').length;

  let verdict: SafetyVerdict = 'safe';
  if (totalErrors > 0) verdict = 'unsafe';
  else if (totalWarnings > 0) verdict = 'warnings';

  // Determine minimum trust level
  let minimumTrustLevel = 'untrusted';
  if (capMissing.length === 0) {
    // Find the lowest trust level that covers all requirements
    const trustLevels = ['untrusted', 'basic', 'trusted', 'admin', 'system'];
    minimumTrustLevel =
      capabilityResult.granted.length === 0
        ? 'untrusted'
        : capabilityResult.required.length === 0
          ? 'untrusted'
          : 'basic';
  }

  const platformStatus = [...budgetResult.platformStatus.entries()].map(([platform, status]) => ({
    platform,
    ...status,
  }));

  return {
    moduleId,
    verdict,
    dangerScore,
    timestamp: Date.now(),
    version: CHECKER_VERSION,
    effects: {
      passed: effectResult.passed,
      totalEffects: effectResult.totalEffects,
      categories: effectResult.moduleEffects.categories(),
      violations: effectViolations,
      moduleRow: effectResult.moduleEffects.toArray(),
    },
    budget: {
      passed: budgetResult.passed,
      diagnostics: budgetDiagnostics,
      platformStatus,
    },
    capabilities: {
      passed: capabilityResult.passed,
      required: capabilityResult.required,
      missing: capMissing,
      minimumTrustLevel,
    },
    linear: {
      passed: linearResult ? linearResult.passed : true,
      violations: linearViolations,
      trackedResources: linearResult ? linearResult.trackedResources.size : 0,
    },
    summary: {
      totalViolations: totalErrors + totalWarnings + totalInfos,
      errors: totalErrors,
      warnings: totalWarnings,
      infos: totalInfos,
    },
  };
}

/**
 * Generate a safety certificate for a module that passed all checks.
 */
export function generateCertificate(report: SafetyReport): EffectCertificate | null {
  if (report.verdict === 'unsafe') return null;

  const trust: EffectTrustLevel = report.verdict === 'safe' ? 'verified' : 'declared';

  return {
    moduleId: report.moduleId,
    effects: new EffectRow(report.effects.moduleRow),
    trust,
    functions: new Map(),
    timestamp: report.timestamp,
    checkerVersion: report.version,
  };
}

/**
 * Format a safety report as human-readable text.
 */
export function formatReport(report: SafetyReport): string {
  const lines: string[] = [];
  const icon = report.verdict === 'safe' ? '✅' : report.verdict === 'warnings' ? '⚠️' : '❌';

  lines.push(`${icon} Safety Report: ${report.moduleId}`);
  lines.push(`Verdict: ${report.verdict.toUpperCase()} | Danger: ${report.dangerScore}/10`);
  lines.push('');

  // Effects
  lines.push(
    `Effects: ${report.effects.passed ? '✓' : '✗'} (${report.effects.totalEffects} effects across [${report.effects.categories.join(', ')}])`
  );
  for (const v of report.effects.violations.filter((v) => v.severity === 'error')) {
    lines.push(`  ✗ ${v.message}`);
  }

  // Budget
  lines.push(`Budget: ${report.budget.passed ? '✓' : '✗'}`);
  for (const d of report.budget.diagnostics.filter((d) => d.severity === 'error')) {
    lines.push(`  ✗ ${d.message}`);
  }
  for (const ps of report.budget.platformStatus) {
    lines.push(
      `  ${ps.platform}: ${ps.exceeded ? '✗ EXCEEDED' : '✓ OK'} (worst: ${ps.worstCategory} at ${ps.worstPercent.toFixed(0)}%)`
    );
  }

  // Capabilities
  lines.push(
    `Capabilities: ${report.capabilities.passed ? '✓' : '✗'} (min trust: ${report.capabilities.minimumTrustLevel})`
  );
  for (const m of report.capabilities.missing) {
    lines.push(`  ✗ Missing '${m.scope}': ${m.reason}`);
  }

  // Linear types
  lines.push(
    `Linear Types: ${report.linear.passed ? '✓' : '✗'} (${report.linear.trackedResources} resources tracked)`
  );
  for (const v of report.linear.violations.filter((v) => v.severity === 'error')) {
    lines.push(`  ✗ ${v.message}`);
  }
  for (const v of report.linear.violations.filter((v) => v.severity === 'warning')) {
    lines.push(`  ⚠ ${v.message}`);
  }

  lines.push('');
  lines.push(
    `Summary: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.infos} infos`
  );

  return lines.join('\n');
}
