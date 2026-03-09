/**
 * @fileoverview Compiler Safety Pass — Orchestrator
 * @module @holoscript/core/compiler/safety
 *
 * Orchestrates all 5 safety layers into a single compiler pass:
 * 1. Effect type inference
 * 2. Effect declaration checking
 * 3. Resource budget analysis
 * 4. Capability type verification
 * 5. Safety report generation
 *
 * This is the entry point for the compile-time safety system.
 *
 * @version 1.0.0
 */

import { VREffect, EffectRow } from '../../types/effects';
import {
  EffectChecker,
  EffectCheckerConfig,
  EffectASTNode,
  createEffectChecker,
  dangerLevel,
} from './EffectChecker';
import { ResourceBudgetAnalyzer, ResourceUsageNode } from './ResourceBudgetAnalyzer';
import {
  deriveRequirements,
  checkCapabilities,
  CapabilityScope,
  TRUST_LEVEL_CAPABILITIES,
} from './CapabilityTypes';
import { buildSafetyReport, formatReport, generateCertificate, SafetyReport } from './SafetyReport';
import { LinearTypeChecker, LinearCheckerConfig } from './LinearTypeChecker';

// =============================================================================
// COMPILER SAFETY PASS
// =============================================================================

/** Configuration for the safety pass */
export interface SafetyPassConfig {
  /** Module identifier */
  moduleId?: string;
  /** Target platforms for budget analysis */
  targetPlatforms?: string[];
  /** Trust level of the agent running this code */
  trustLevel?: string;
  /** Effect checker config overrides */
  effectCheckerConfig?: EffectCheckerConfig;
  /** Budget warning threshold (0-1, default 0.8) */
  budgetWarningThreshold?: number;
  /** Linear type checker config overrides */
  linearCheckerConfig?: LinearCheckerConfig;
  /** Whether to generate a certificate on success */
  generateCertificate?: boolean;
}

/** Result of the full safety pass */
export interface SafetyPassResult {
  report: SafetyReport;
  certificate: ReturnType<typeof generateCertificate>;
  formattedReport: string;
  passed: boolean;
}

/**
 * Run the full compile-time safety pass on a set of AST nodes.
 *
 * This is the main entry point for the safety system.
 *
 * @example
 * ```typescript
 * const nodes: EffectASTNode[] = [
 *   { type: 'object', name: 'Player', traits: ['@mesh', '@physics', '@script'],
 *     calls: ['applyForce', 'setState'],
 *     declaredEffects: ['render:spawn', 'physics:force', 'physics:collision',
 *       'resource:cpu', 'state:read', 'state:write'] },
 * ];
 *
 * const result = runSafetyPass(nodes, {
 *   moduleId: 'my-game',
 *   targetPlatforms: ['quest3'],
 *   trustLevel: 'basic',
 * });
 *
 * console.log(result.formattedReport);
 * // ✅ Safety Report: my-game
 * // Verdict: SAFE | Danger: 2.5/10
 * ```
 */
export function runSafetyPass(
  nodes: EffectASTNode[],
  config: SafetyPassConfig = {}
): SafetyPassResult {
  const moduleId = config.moduleId || 'unknown';
  const trustLevel = config.trustLevel || 'basic';

  // ── Layer 1-2: Effect checking ──
  const effectChecker = createEffectChecker(config.effectCheckerConfig);
  const effectResult = effectChecker.checkModule(nodes, moduleId);

  // ── Layer 3: Budget analysis ──
  const budgetAnalyzer = new ResourceBudgetAnalyzer({
    targetPlatforms: config.targetPlatforms,
    warningThreshold: config.budgetWarningThreshold,
  });
  const resourceNodes: ResourceUsageNode[] = nodes.map((n) => ({
    name: n.name || '<anonymous>',
    traits: n.traits || [],
    calls: n.calls || [],
    count: 1,
  }));
  const budgetResult = budgetAnalyzer.analyze(resourceNodes);

  // ── Layer 4: Capability verification ──
  const allEffects = effectResult.moduleEffects.toArray();
  const requirements = deriveRequirements(allEffects, moduleId);
  const grantedCapabilities =
    TRUST_LEVEL_CAPABILITIES[trustLevel] || TRUST_LEVEL_CAPABILITIES['untrusted'];
  const capResult = checkCapabilities(requirements, grantedCapabilities);
  capResult.name = moduleId;

  // ── Layer 6: Linear type checking ──
  const linearChecker = new LinearTypeChecker(config.linearCheckerConfig);
  const linearResult = linearChecker.checkModule(nodes);

  // ── Layer 5: Safety report ──
  const danger = dangerLevel(effectResult.moduleEffects);
  const report = buildSafetyReport(
    moduleId,
    effectResult,
    budgetResult,
    capResult,
    danger,
    linearResult
  );

  const cert = config.generateCertificate !== false ? generateCertificate(report) : null;
  const formatted = formatReport(report);

  return {
    report,
    certificate: cert,
    formattedReport: formatted,
    passed: report.verdict !== 'unsafe',
  };
}

// =============================================================================
// CONVENIENCE: Quick safety check for a single object
// =============================================================================

/**
 * Quick safety check: given traits and function calls, verify safety.
 * Returns a simplified pass/fail with reasons.
 */
export function quickSafetyCheck(
  traits: string[],
  calls: string[],
  options: { trustLevel?: string; targetPlatform?: string } = {}
): { passed: boolean; verdict: string; reasons: string[] } {
  const result = runSafetyPass([{ type: 'object', name: 'quick-check', traits, calls }], {
    moduleId: 'quick-check',
    trustLevel: options.trustLevel || 'basic',
    targetPlatforms: options.targetPlatform ? [options.targetPlatform] : ['quest3'],
  });

  const reasons: string[] = [];
  for (const v of result.report.effects.violations.filter((v) => v.severity === 'error'))
    reasons.push(v.message);
  for (const d of result.report.budget.diagnostics.filter((d) => d.severity === 'error'))
    reasons.push(d.message);
  for (const m of result.report.capabilities.missing)
    reasons.push(`Missing capability: ${m.scope}`);

  return {
    passed: result.passed,
    verdict: result.report.verdict,
    reasons,
  };
}

// =============================================================================
// EXPORTS (barrel)
// =============================================================================

export { EffectChecker, createEffectChecker, dangerLevel, isSafeTraitSet } from './EffectChecker';
export type {
  EffectCheckerConfig,
  EffectASTNode,
  EffectCheckResult,
  ModuleEffectCheckResult,
} from './EffectChecker';
export {
  inferFromTraits,
  inferFromBuiltins,
  composeEffects,
  TRAIT_EFFECTS,
  BUILTIN_EFFECTS,
  knownTraits,
  knownBuiltins,
} from './EffectInference';
export type { InferredEffects } from './EffectInference';
export {
  ResourceBudgetAnalyzer,
  PLATFORM_BUDGETS,
  TRAIT_RESOURCE_COSTS,
} from './ResourceBudgetAnalyzer';
export type {
  BudgetAnalysisResult,
  BudgetDiagnostic,
  ResourceUsageNode,
  ResourceCategory,
} from './ResourceBudgetAnalyzer';
export {
  deriveRequirements,
  checkCapabilities,
  expandCapabilities,
  EFFECT_TO_CAPABILITY,
  CAPABILITY_HIERARCHY,
  TRUST_LEVEL_CAPABILITIES,
} from './CapabilityTypes';
export type {
  CapabilityScope,
  CapabilityRequirement,
  CapabilityCheckResult,
} from './CapabilityTypes';
export { buildSafetyReport, generateCertificate, formatReport } from './SafetyReport';
export type { SafetyReport, SafetyVerdict } from './SafetyReport';
export { LinearTypeChecker, BUILTIN_RESOURCES, TRAIT_RESOURCE_MAP } from './LinearTypeChecker';
export type { LinearCheckerConfig } from './LinearTypeChecker';
export type {
  ResourceType,
  ResourceAbility,
  OwnershipState,
  LinearViolation,
  LinearCheckResult,
} from '../../types/linear';
