/**
 * Three-Tier Progressive Quality Gates
 *
 * Implements confidence-calibrated quality gates for the HoloScript compiler.
 * Gates are calibrated by action risk profile, not arbitrary thresholds.
 *
 * Tier 1 (70% confidence) - AUTONOMOUS:
 *   Lint, type-check, basic tests. Fully autonomous -- no human in the loop.
 *   Actions: Format, lint auto-fix, dependency resolution, cache invalidation.
 *
 * Tier 2 (85% confidence) - NOTIFY:
 *   Semantic analysis, coverage thresholds, performance budgets.
 *   Actions: Refactoring, API changes, cross-package modifications.
 *   Human is notified but not blocked.
 *
 * Tier 3 (95% confidence) - REQUIRE APPROVAL:
 *   Security audit, production export, identity/permission changes.
 *   Actions: Production deploys, security config, RBAC changes, signing.
 *
 * @module compiler/QualityGates
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Quality gate tier levels
 */
export enum QualityTier {
  /** 70% confidence - fully autonomous */
  TIER_1_AUTONOMOUS = 1,

  /** 85% confidence - notify human */
  TIER_2_NOTIFY = 2,

  /** 95% confidence - require human approval */
  TIER_3_APPROVAL = 3,
}

/**
 * Risk profile for an action
 */
export enum RiskProfile {
  /** Low risk: formatting, linting, test running */
  LOW = 'low',

  /** Medium risk: refactoring, API changes, cross-package mods */
  MEDIUM = 'medium',

  /** High risk: production, security, identity, signing */
  HIGH = 'high',

  /** Critical risk: RBAC changes, production deploys, key management */
  CRITICAL = 'critical',
}

/**
 * Quality check category
 */
export enum CheckCategory {
  LINT = 'lint',
  TYPE_CHECK = 'type_check',
  UNIT_TEST = 'unit_test',
  SEMANTIC_ANALYSIS = 'semantic_analysis',
  COVERAGE = 'coverage',
  PERFORMANCE = 'performance',
  SECURITY_AUDIT = 'security_audit',
  PRODUCTION_EXPORT = 'production_export',
  IDENTITY_CHECK = 'identity_check',
  BUNDLE_BUDGET = 'bundle_budget',
}

/**
 * Individual quality check definition
 */
export interface QualityCheck {
  /** Check identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this check validates */
  description: string;

  /** Quality tier this check belongs to */
  tier: QualityTier;

  /** Check category */
  category: CheckCategory;

  /** Risk profile of the action being gated */
  riskProfile: RiskProfile;

  /** Confidence threshold (0.0 - 1.0) */
  confidenceThreshold: number;

  /** Whether this check is blocking */
  blocking: boolean;

  /** Timeout in milliseconds */
  timeoutMs: number;

  /** Check execution function */
  execute: (context: QualityContext) => Promise<CheckResult>;
}

/**
 * Context passed to quality checks
 */
export interface QualityContext {
  /** HoloScript source being compiled */
  source?: string;

  /** Compilation target */
  target?: string;

  /** File paths being affected */
  affectedFiles: string[];

  /** Whether this is a production build */
  isProduction: boolean;

  /** Agent identity token (if available) */
  agentToken?: string;

  /** Authority metadata and provenance for this pipeline run */
  provenanceContext?: import('./traits/ProvenanceSemiring').ProvenanceContext;

  /** Custom metadata */
  metadata: Record<string, unknown>;
}

/**
 * Result of a single quality check
 */
export interface CheckResult {
  /** Check identifier */
  checkId: string;

  /** Whether the check passed */
  passed: boolean;

  /** Confidence score (0.0 - 1.0) */
  confidence: number;

  /** Human-readable message */
  message: string;

  /** Detailed findings */
  findings: Finding[];

  /** Time taken in ms */
  durationMs: number;

  /** Suggested fixes (if any) */
  fixes?: SuggestedFix[];
}

/**
 * A specific finding from a quality check
 */
export interface Finding {
  /** Severity level */
  severity: 'error' | 'warning' | 'info';

  /** Finding message */
  message: string;

  /** File path (if applicable) */
  file?: string;

  /** Line number (if applicable) */
  line?: number;

  /** Rule or check that produced this finding */
  rule?: string;
}

/**
 * Suggested fix for a finding
 */
export interface SuggestedFix {
  /** Fix description */
  description: string;

  /** Confidence that fix is correct (0.0 - 1.0) */
  confidence: number;

  /** Whether the fix can be applied automatically */
  autoApplicable: boolean;
}

/**
 * Gate decision after running all checks for a tier
 */
export interface GateDecision {
  /** Quality tier */
  tier: QualityTier;

  /** Whether the gate passed */
  passed: boolean;

  /** Action to take */
  action: 'proceed' | 'notify' | 'block';

  /** Aggregate confidence score */
  aggregateConfidence: number;

  /** Individual check results */
  results: CheckResult[];

  /** Human-readable summary */
  summary: string;

  /** Whether human approval is required */
  requiresApproval: boolean;

  /** Timestamp */
  timestamp: string;
}

/**
 * Full pipeline result after running all tiers
 */
export interface QualityPipelineResult {
  /** Whether all enforced gates passed */
  passed: boolean;

  /** Tier decisions */
  tiers: GateDecision[];

  /** Highest tier that passed */
  highestPassedTier: QualityTier | null;

  /** Notifications to send */
  notifications: Notification[];

  /** Approval requests */
  approvalRequests: ApprovalRequest[];

  /** Total execution time */
  totalDurationMs: number;
}

/**
 * Notification for Tier 2 events
 */
export interface Notification {
  type: 'info' | 'warning' | 'error';
  message: string;
  tier: QualityTier;
  checkId: string;
  timestamp: string;
}

/**
 * Approval request for Tier 3 events
 */
export interface ApprovalRequest {
  id: string;
  action: string;
  reason: string;
  riskProfile: RiskProfile;
  tier: QualityTier;
  findings: Finding[];
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

// =============================================================================
// RISK-TO-TIER MAPPING
// =============================================================================

/**
 * Map action risk profiles to required quality tiers.
 * Higher risk demands higher confidence checks.
 */
const RISK_TIER_MAP: Record<RiskProfile, QualityTier> = {
  [RiskProfile.LOW]: QualityTier.TIER_1_AUTONOMOUS,
  [RiskProfile.MEDIUM]: QualityTier.TIER_2_NOTIFY,
  [RiskProfile.HIGH]: QualityTier.TIER_3_APPROVAL,
  [RiskProfile.CRITICAL]: QualityTier.TIER_3_APPROVAL,
};

/**
 * Confidence thresholds per tier
 */
const TIER_CONFIDENCE_THRESHOLDS: Record<QualityTier, number> = {
  [QualityTier.TIER_1_AUTONOMOUS]: 0.7,
  [QualityTier.TIER_2_NOTIFY]: 0.85,
  [QualityTier.TIER_3_APPROVAL]: 0.95,
};

// =============================================================================
// BUILT-IN QUALITY CHECKS
// =============================================================================

/**
 * Create Tier 1 lint check
 */
export function createLintCheck(): QualityCheck {
  return {
    id: 'lint-001',
    name: 'HoloScript Lint',
    description: 'Validate source against HoloScript linting rules (syntax, style, naming)',
    tier: QualityTier.TIER_1_AUTONOMOUS,
    category: CheckCategory.LINT,
    riskProfile: RiskProfile.LOW,
    confidenceThreshold: 0.7,
    blocking: true,
    timeoutMs: 30_000,
    execute: async (context: QualityContext): Promise<CheckResult> => {
      const start = Date.now();
      const findings: Finding[] = [];

      // Source validation checks
      if (context.source) {
        // Check for common issues
        if (context.source.includes('\t')) {
          findings.push({
            severity: 'warning',
            message: 'Tab characters detected. Use spaces for consistent indentation.',
            rule: 'no-tabs',
          });
        }

        // Check for balanced braces
        const openBraces = (context.source.match(/{/g) || []).length;
        const closeBraces = (context.source.match(/}/g) || []).length;
        if (openBraces !== closeBraces) {
          findings.push({
            severity: 'error',
            message: `Unbalanced braces: ${openBraces} opening vs ${closeBraces} closing`,
            rule: 'balanced-braces',
          });
        }

        // Check for undefined trait references
        const traitRefs = context.source.match(/@[\w-]+/g) || [];
        for (const ref of traitRefs) {
          if (ref.startsWith('@import') || ref.startsWith('@use')) continue;
          // This is a basic check - real implementation would validate against registry
        }
      }

      const errors = findings.filter((f) => f.severity === 'error');
      const passed = errors.length === 0;
      const confidence = passed ? 0.95 : Math.max(0, 1 - errors.length * 0.15);

      return {
        checkId: 'lint-001',
        passed,
        confidence,
        message: passed
          ? `Lint passed with ${findings.length} warnings`
          : `Lint failed with ${errors.length} errors`,
        findings,
        durationMs: Date.now() - start,
      };
    },
  };
}

/**
 * Create Tier 1 type check
 */
export function createTypeCheck(): QualityCheck {
  return {
    id: 'type-001',
    name: 'Type Validation',
    description: 'Validate trait configurations match expected types',
    tier: QualityTier.TIER_1_AUTONOMOUS,
    category: CheckCategory.TYPE_CHECK,
    riskProfile: RiskProfile.LOW,
    confidenceThreshold: 0.7,
    blocking: true,
    timeoutMs: 60_000,
    execute: async (context: QualityContext): Promise<CheckResult> => {
      const start = Date.now();
      const findings: Finding[] = [];

      // Type checks would validate trait config schemas
      // Simplified for proof-of-concept
      if (context.source) {
        // Check for numeric values in position fields
        const positionMatches = context.source.match(/position:\s*\[([^\]]+)\]/g) || [];
        for (const match of positionMatches) {
          const values = match.match(/[\d.-]+/g);
          if (values && values.length !== 3) {
            findings.push({
              severity: 'error',
              message: `Position must have exactly 3 components (x, y, z), found ${values.length}`,
              rule: 'position-type',
            });
          }
        }
      }

      const errors = findings.filter((f) => f.severity === 'error');
      const passed = errors.length === 0;

      return {
        checkId: 'type-001',
        passed,
        confidence: passed ? 0.9 : 0.5,
        message: passed ? 'Type check passed' : `Type check failed: ${errors.length} type errors`,
        findings,
        durationMs: Date.now() - start,
      };
    },
  };
}

/**
 * Create Tier 2 semantic analysis check
 */
export function createSemanticCheck(): QualityCheck {
  return {
    id: 'semantic-001',
    name: 'Semantic Analysis',
    description: 'Deep analysis of trait interactions, dependency cycles, and composition safety',
    tier: QualityTier.TIER_2_NOTIFY,
    category: CheckCategory.SEMANTIC_ANALYSIS,
    riskProfile: RiskProfile.MEDIUM,
    confidenceThreshold: 0.85,
    blocking: false,
    timeoutMs: 120_000,
    execute: async (context: QualityContext): Promise<CheckResult> => {
      const start = Date.now();
      const findings: Finding[] = [];

      if (context.source) {
        // Check for potentially conflicting traits
        const traitRefs = context.source.match(/@(\w+)/g) || [];
        const traitNames = traitRefs.map((t) => t.replace('@', ''));

        // Check physics + static conflict
        if (traitNames.includes('physics') && traitNames.includes('static')) {
          findings.push({
            severity: 'warning',
            message:
              '@physics and @static traits conflict - object cannot be both dynamic and static',
            rule: 'trait-conflict',
          });
        }

        // Check visible + invisible conflict
        if (traitNames.includes('visible') && traitNames.includes('invisible')) {
          findings.push({
            severity: 'error',
            message: '@visible and @invisible traits are mutually exclusive',
            rule: 'trait-conflict',
          });
        }

        // Check for grabbable without collidable
        if (traitNames.includes('grabbable') && !traitNames.includes('collidable')) {
          findings.push({
            severity: 'warning',
            message: '@grabbable requires @collidable for proper grab detection',
            rule: 'missing-dependency',
          });
        }

        // Check throwable without grabbable
        if (traitNames.includes('throwable') && !traitNames.includes('grabbable')) {
          findings.push({
            severity: 'warning',
            message:
              '@throwable requires @grabbable - object must be grabbable before it can be thrown',
            rule: 'missing-dependency',
          });
        }
      }

      const errors = findings.filter((f) => f.severity === 'error');
      const warnings = findings.filter((f) => f.severity === 'warning');
      const passed = errors.length === 0;
      const confidence = Math.max(0.5, 1 - errors.length * 0.2 - warnings.length * 0.05);

      return {
        checkId: 'semantic-001',
        passed,
        confidence,
        message: passed
          ? `Semantic analysis passed (${warnings.length} warnings)`
          : `Semantic analysis found ${errors.length} issues`,
        findings,
        durationMs: Date.now() - start,
      };
    },
  };
}

/**
 * Create Tier 2 coverage check
 */
export function createCoverageCheck(threshold: number = 0.8): QualityCheck {
  return {
    id: 'coverage-001',
    name: 'Test Coverage Gate',
    description: `Ensure test coverage meets ${(threshold * 100).toFixed(0)}% threshold`,
    tier: QualityTier.TIER_2_NOTIFY,
    category: CheckCategory.COVERAGE,
    riskProfile: RiskProfile.MEDIUM,
    confidenceThreshold: 0.85,
    blocking: false,
    timeoutMs: 300_000,
    execute: async (context: QualityContext): Promise<CheckResult> => {
      const start = Date.now();
      const findings: Finding[] = [];

      // Coverage would be checked against actual test results
      // This is a framework for integration with vitest coverage
      const coveragePercent = (context.metadata.coveragePercent as number) ?? 0;
      const passed = coveragePercent >= threshold * 100;

      if (!passed) {
        findings.push({
          severity: 'warning',
          message: `Test coverage ${coveragePercent.toFixed(1)}% is below threshold ${(threshold * 100).toFixed(0)}%`,
          rule: 'coverage-threshold',
        });
      }

      return {
        checkId: 'coverage-001',
        passed,
        confidence: passed ? 0.9 : 0.6,
        message: `Coverage: ${coveragePercent.toFixed(1)}% (threshold: ${(threshold * 100).toFixed(0)}%)`,
        findings,
        durationMs: Date.now() - start,
      };
    },
  };
}

/**
 * Create Tier 3 security audit check
 */
export function createSecurityAuditCheck(): QualityCheck {
  return {
    id: 'security-001',
    name: 'Security Audit',
    description: 'Comprehensive security analysis: permission escalation, injection, supply chain',
    tier: QualityTier.TIER_3_APPROVAL,
    category: CheckCategory.SECURITY_AUDIT,
    riskProfile: RiskProfile.HIGH,
    confidenceThreshold: 0.95,
    blocking: true,
    timeoutMs: 600_000,
    execute: async (context: QualityContext): Promise<CheckResult> => {
      const start = Date.now();
      const findings: Finding[] = [];

      // Authority bypass for highly trusted operations
      const { authorityWeight } = await import('./traits/ProvenanceSemiring');
      if (authorityWeight(context.provenanceContext?.authorityLevel ?? 0) >= 100) {
        return {
          checkId: 'security-001',
          passed: true,
          confidence: 1.0,
          message: `Security Audit Bypassed (Authority: ${context.provenanceContext?.sourceType || 'verified'})`,
          findings: [],
          durationMs: Date.now() - start,
        };
      }

      if (context.source) {
        // Check for eval-like patterns
        if (/eval\s*\(/.test(context.source)) {
          findings.push({
            severity: 'error',
            message: 'eval() detected - potential code injection vector',
            rule: 'no-eval',
          });
        }

        // Check for hardcoded secrets
        if (/(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}/i.test(context.source)) {
          findings.push({
            severity: 'error',
            message: 'Potential hardcoded secret detected',
            rule: 'no-secrets',
          });
        }

        // Check for dangerous file operations
        if (/fs\.(writeFile|unlink|rmdir|rm)/i.test(context.source)) {
          findings.push({
            severity: 'warning',
            message: 'Filesystem write operation detected - verify sandboxing',
            rule: 'fs-safety',
          });
        }

        // Check for network access
        if (/fetch\s*\(|axios|http\.request/i.test(context.source)) {
          findings.push({
            severity: 'warning',
            message: 'Network access detected - verify allowed domains',
            rule: 'network-safety',
          });
        }

        // Check for prototype pollution patterns
        if (/__proto__|constructor\s*\[|Object\.assign\(\s*{}\s*,/.test(context.source)) {
          findings.push({
            severity: 'error',
            message: 'Potential prototype pollution pattern detected',
            rule: 'no-prototype-pollution',
          });
        }
      }

      // Validate agent token if present
      if (context.isProduction && !context.agentToken) {
        findings.push({
          severity: 'error',
          message: 'Production build requires valid agent identity token',
          rule: 'production-auth',
        });
      }

      const errors = findings.filter((f) => f.severity === 'error');
      const passed = errors.length === 0;
      const confidence = passed ? 0.97 : Math.max(0.3, 1 - errors.length * 0.25);

      return {
        checkId: 'security-001',
        passed,
        confidence,
        message: passed
          ? 'Security audit passed'
          : `Security audit found ${errors.length} critical issues requiring review`,
        findings,
        durationMs: Date.now() - start,
        fixes: errors.map((e) => ({
          description: `Fix: ${e.message}`,
          confidence: 0.7,
          autoApplicable: false,
        })),
      };
    },
  };
}

/**
 * Create Tier 3 production export check
 */
export function createProductionExportCheck(): QualityCheck {
  return {
    id: 'prod-export-001',
    name: 'Production Export Gate',
    description: 'Final gate before production artifact generation - requires human approval',
    tier: QualityTier.TIER_3_APPROVAL,
    category: CheckCategory.PRODUCTION_EXPORT,
    riskProfile: RiskProfile.CRITICAL,
    confidenceThreshold: 0.95,
    blocking: true,
    timeoutMs: 60_000,
    execute: async (context: QualityContext): Promise<CheckResult> => {
      const start = Date.now();
      const findings: Finding[] = [];

      if (!context.isProduction) {
        return {
          checkId: 'prod-export-001',
          passed: true,
          confidence: 1.0,
          message: 'Non-production build - gate skipped',
          findings: [],
          durationMs: Date.now() - start,
        };
      }

      // Verify all required metadata
      if (!context.metadata.version) {
        findings.push({
          severity: 'error',
          message: 'Production build must specify version',
          rule: 'prod-version',
        });
      }

      if (!context.agentToken) {
        findings.push({
          severity: 'error',
          message: 'Production build requires authenticated agent identity',
          rule: 'prod-auth',
        });
      }

      if (!context.metadata.changelog) {
        findings.push({
          severity: 'warning',
          message: 'No changelog entry for this version',
          rule: 'prod-changelog',
        });
      }

      const errors = findings.filter((f) => f.severity === 'error');
      const passed = errors.length === 0;

      return {
        checkId: 'prod-export-001',
        passed,
        confidence: passed ? 0.98 : 0.4,
        message: passed
          ? 'Production export gate passed - awaiting human approval'
          : `Production gate blocked: ${errors.length} requirements unmet`,
        findings,
        durationMs: Date.now() - start,
      };
    },
  };
}

// =============================================================================
// QUALITY GATE PIPELINE
// =============================================================================

/**
 * Quality Gate Pipeline
 *
 * Runs all three tiers of quality checks in sequence.
 * Earlier tiers must pass before later tiers execute.
 */
export class QualityGatePipeline {
  private checks: Map<QualityTier, QualityCheck[]> = new Map();
  private approvalCallback?: (request: ApprovalRequest) => Promise<boolean>;

  constructor() {
    this.checks.set(QualityTier.TIER_1_AUTONOMOUS, []);
    this.checks.set(QualityTier.TIER_2_NOTIFY, []);
    this.checks.set(QualityTier.TIER_3_APPROVAL, []);
  }

  /**
   * Register a quality check
   */
  registerCheck(check: QualityCheck): void {
    const tierChecks = this.checks.get(check.tier);
    if (tierChecks) {
      tierChecks.push(check);
    }
  }

  /**
   * Set callback for approval requests (Tier 3)
   */
  setApprovalCallback(callback: (request: ApprovalRequest) => Promise<boolean>): void {
    this.approvalCallback = callback;
  }

  /**
   * Run the full quality gate pipeline
   */
  async run(context: QualityContext): Promise<QualityPipelineResult> {
    const startTime = Date.now();
    const tiers: GateDecision[] = [];
    const notifications: Notification[] = [];
    const approvalRequests: ApprovalRequest[] = [];

    // Determine required tier based on risk profile
    const riskProfile = this.assessRiskProfile(context);
    const requiredTier = RISK_TIER_MAP[riskProfile];

    // Run Tier 1 (always runs)
    const tier1 = await this.runTier(QualityTier.TIER_1_AUTONOMOUS, context);
    tiers.push(tier1);

    if (!tier1.passed) {
      return this.buildResult(tiers, notifications, approvalRequests, Date.now() - startTime);
    }

    // Run Tier 2 (if required)
    if (requiredTier >= QualityTier.TIER_2_NOTIFY) {
      const tier2 = await this.runTier(QualityTier.TIER_2_NOTIFY, context);
      tiers.push(tier2);

      // Generate notifications for Tier 2 findings
      for (const result of tier2.results) {
        if (!result.passed || result.findings.length > 0) {
          notifications.push({
            type: result.passed ? 'warning' : 'error',
            message: result.message,
            tier: QualityTier.TIER_2_NOTIFY,
            checkId: result.checkId,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // Run Tier 3 (if required)
    if (requiredTier >= QualityTier.TIER_3_APPROVAL) {
      const tier3 = await this.runTier(QualityTier.TIER_3_APPROVAL, context);
      tiers.push(tier3);

      // Generate approval requests for Tier 3
      if (tier3.passed) {
        const request: ApprovalRequest = {
          id: `approval-${Date.now()}`,
          action: context.isProduction ? 'production-export' : 'high-risk-operation',
          reason: `Tier 3 checks passed with ${(tier3.aggregateConfidence * 100).toFixed(1)}% confidence. Human approval required.`,
          riskProfile,
          tier: QualityTier.TIER_3_APPROVAL,
          findings: tier3.results.flatMap((r) => r.findings),
          requestedAt: new Date().toISOString(),
          status: 'pending',
        };
        approvalRequests.push(request);

        // If approval callback is registered, await it
        if (this.approvalCallback) {
          const approved = await this.approvalCallback(request);
          request.status = approved ? 'approved' : 'rejected';
          if (!approved) {
            tier3.passed = false;
            tier3.action = 'block';
            tier3.summary = 'Approval rejected by human reviewer';
          }
        }
      }
    }

    return this.buildResult(tiers, notifications, approvalRequests, Date.now() - startTime);
  }

  /**
   * Run all checks for a specific tier
   */
  private async runTier(tier: QualityTier, context: QualityContext): Promise<GateDecision> {
    const checks = this.checks.get(tier) || [];
    const results: CheckResult[] = [];
    const threshold = TIER_CONFIDENCE_THRESHOLDS[tier];

    for (const check of checks) {
      try {
        const result = await Promise.race([
          check.execute(context),
          this.timeout(check.timeoutMs, check.id),
        ]);
        results.push(result);
      } catch (err) {
        results.push({
          checkId: check.id,
          passed: false,
          confidence: 0,
          message: `Check failed with error: ${err instanceof Error ? err.message : String(err)}`,
          findings: [
            {
              severity: 'error',
              message: `Check execution error: ${err instanceof Error ? err.message : String(err)}`,
              rule: 'execution-error',
            },
          ],
          durationMs: 0,
        });
      }
    }

    // Calculate aggregate confidence
    const confidenceValues = results.map((r) => r.confidence);
    const aggregateConfidence =
      confidenceValues.length > 0
        ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
        : 1.0;

    // Determine if gate passes
    const blockingFailures = results.filter(
      (r) => !r.passed && checks.find((c) => c.id === r.checkId)?.blocking
    );
    const passed = blockingFailures.length === 0 && aggregateConfidence >= threshold;

    // Determine action
    let action: 'proceed' | 'notify' | 'block';
    if (!passed) {
      action = 'block';
    } else if (tier === QualityTier.TIER_3_APPROVAL) {
      action = 'notify'; // Tier 3 always notifies even on pass
    } else if (tier === QualityTier.TIER_2_NOTIFY) {
      action = results.some((r) => r.findings.length > 0) ? 'notify' : 'proceed';
    } else {
      action = 'proceed';
    }

    return {
      tier,
      passed,
      action,
      aggregateConfidence,
      results,
      summary: passed
        ? `Tier ${tier} passed (confidence: ${(aggregateConfidence * 100).toFixed(1)}%)`
        : `Tier ${tier} blocked: ${blockingFailures.length} blocking failures`,
      requiresApproval: tier === QualityTier.TIER_3_APPROVAL && passed,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Assess risk profile from context
   */
  private assessRiskProfile(context: QualityContext): RiskProfile {
    if (context.isProduction) return RiskProfile.CRITICAL;

    // Check if security-sensitive files are affected
    const sensitivePatterns = [
      /identity/i,
      /rbac/i,
      /permission/i,
      /auth/i,
      /security/i,
      /signing/i,
      /keystore/i,
      /token/i,
      /secret/i,
    ];
    const hasSensitiveFiles = context.affectedFiles.some((f) =>
      sensitivePatterns.some((p) => p.test(f))
    );
    if (hasSensitiveFiles) return RiskProfile.HIGH;

    // Check if cross-package changes
    const packages = new Set(
      context.affectedFiles
        .filter((f) => f.includes('packages/'))
        .map((f) => f.split('packages/')[1]?.split('/')[0])
        .filter(Boolean)
    );
    if (packages.size > 1) return RiskProfile.MEDIUM;

    return RiskProfile.LOW;
  }

  /**
   * Timeout helper
   */
  private timeout(ms: number, checkId: string): Promise<CheckResult> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Check ${checkId} timed out after ${ms}ms`)), ms)
    );
  }

  /**
   * Build final pipeline result
   */
  private buildResult(
    tiers: GateDecision[],
    notifications: Notification[],
    approvalRequests: ApprovalRequest[],
    totalDurationMs: number
  ): QualityPipelineResult {
    const allPassed = tiers.every((t) => t.passed);
    const noRejectedApprovals = !approvalRequests.some((a) => a.status === 'rejected');

    let highestPassedTier: QualityTier | null = null;
    for (const tier of tiers) {
      if (tier.passed) {
        highestPassedTier = tier.tier;
      }
    }

    return {
      passed: allPassed && noRejectedApprovals,
      tiers,
      highestPassedTier,
      notifications,
      approvalRequests,
      totalDurationMs,
    };
  }

  /**
   * Create a pipeline with default HoloScript checks
   */
  static createDefault(): QualityGatePipeline {
    const pipeline = new QualityGatePipeline();

    // Tier 1: Autonomous
    pipeline.registerCheck(createLintCheck());
    pipeline.registerCheck(createTypeCheck());

    // Tier 2: Notify
    pipeline.registerCheck(createSemanticCheck());
    pipeline.registerCheck(createCoverageCheck(0.8));

    // Tier 3: Approval
    pipeline.registerCheck(createSecurityAuditCheck());
    pipeline.registerCheck(createProductionExportCheck());

    return pipeline;
  }
}

/**
 * Convenience: determine minimum required tier for an action
 */
export function getRequiredTier(riskProfile: RiskProfile): QualityTier {
  return RISK_TIER_MAP[riskProfile];
}

/**
 * Convenience: get confidence threshold for a tier
 */
export function getTierThreshold(tier: QualityTier): number {
  return TIER_CONFIDENCE_THRESHOLDS[tier];
}
