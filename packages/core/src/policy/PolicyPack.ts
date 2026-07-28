/**
 * PolicyPack - named regulatory bundle for regulated AI deployment gates.
 *
 * A policy pack is data: it names the regulatory framework posture, the
 * FairnessSweep evidence required before deploy, the compliance artifacts the
 * compiler must emit, and the audit/monitoring obligations that must be armed.
 */

export const POLICY_PACK_FRAMEWORK_IDS = [
  'EU_AI_ACT_HIGH_RISK',
  'NIST_AI_RMF',
  'ISO_42001',
  'CFPB_FAIR_LENDING',
  'NYC_LL144',
  'EEOC',
  'COLORADO_SB21_169',
] as const;

export type PolicyPackFrameworkId = (typeof POLICY_PACK_FRAMEWORK_IDS)[number];

export const POLICY_PACK_COMPILE_TARGETS = [
  'bias_audit_report',
  'model_card',
  'impact_assessment',
  'declaration_of_conformity',
] as const;

export type PolicyPackCompileTarget = (typeof POLICY_PACK_COMPILE_TARGETS)[number];

const POLICY_PACK_AUDIT_STORES = ['append_only', 'immutable_ledger', 'external_archive'] as const;

const POLICY_PACK_MONITORING_INTERVALS = [
  'per_deploy',
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'annual',
] as const;

export type PolicyPackMonitoringInterval = (typeof POLICY_PACK_MONITORING_INTERVALS)[number];

export interface RequiredFairnessSweep {
  /** Stable test id. Deployment evidence must reference this id. */
  id: string;
  /** Protected attribute label passed to FairnessSweep. */
  protectedAttribute: string;
  /** Optional cohort floor for the submitted receipt. */
  minSampleSize?: number;
  /** Default regulatory four-fifths floor is 0.8 when omitted by callers. */
  adverseImpactRatioMin?: number;
  /** Optional upper bound for demographic parity difference. */
  demographicParityDiffMax?: number;
  /** Require a fairness.robustness.v1 receipt alongside the point estimate. */
  requireRobustnessReceipt?: boolean;
  /** Extra sweep config that a domain bridge may pass through to FairnessSweep. */
  config?: Record<string, unknown>;
}

export interface PolicyPackAuditRetentionPolicy {
  /** Minimum retention period for receipts and artifacts. */
  minDays: number;
  storage: 'append_only' | 'immutable_ledger' | 'external_archive';
  legalHold?: boolean;
}

export interface PolicyPackMonitoringCadence {
  interval: PolicyPackMonitoringInterval;
  driftSweepRequired?: boolean;
  alertThreshold?: number;
}

export interface PolicyPack {
  type: 'PolicyPack';
  name: string;
  version: string;
  frameworkId: PolicyPackFrameworkId;
  requiredTests: RequiredFairnessSweep[];
  requiredCompileTargets: PolicyPackCompileTarget[];
  auditRetention: PolicyPackAuditRetentionPolicy;
  monitoringCadence: PolicyPackMonitoringCadence;
  controlsMapping?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export type PolicyPackIssueCode =
  | 'invalid_framework'
  | 'invalid_compile_target'
  | 'missing_required_test'
  | 'failed_required_test'
  | 'missing_compile_target'
  | 'audit_retention_not_armed'
  | 'monitoring_not_scheduled'
  | 'invalid_pack';

export interface PolicyPackGateIssue {
  code: PolicyPackIssueCode;
  severity: 'error' | 'warning';
  message: string;
  testId?: string;
  compileTarget?: PolicyPackCompileTarget | string;
}

export interface PolicyPackTestEvidence {
  id: string;
  passed: boolean;
  receiptHash?: string;
  sampleSize?: number;
  adverseImpactRatio?: number;
  demographicParityDiff?: number;
  robustnessReceiptHash?: string;
}

export interface PolicyPackCompileArtifact {
  target: PolicyPackCompileTarget;
  artifactId: string;
  contentHash?: string;
  generatedAt?: string;
}

export interface PolicyPackDeploymentEvidence {
  tests: PolicyPackTestEvidence[];
  compileTargets: PolicyPackCompileArtifact[];
  auditRetentionAccepted?: boolean;
  monitoringScheduled?: boolean;
}

export interface PolicyPackDeploymentEvaluation {
  allowed: boolean;
  policyPack: string;
  frameworkId: PolicyPackFrameworkId;
  missingTests: string[];
  failedTests: string[];
  missingCompileTargets: PolicyPackCompileTarget[];
  issues: PolicyPackGateIssue[];
}

export interface PolicyPackSchemaBlock {
  name: string;
  version?: string;
  frameworkId?: string;
  requiredTests?: unknown[];
  requiredCompileTargets?: unknown[];
  auditRetention?: Record<string, unknown>;
  monitoringCadence?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

export class PolicyPackDeploymentError extends Error {
  constructor(public readonly evaluation: PolicyPackDeploymentEvaluation) {
    super(
      `PolicyPack "${evaluation.policyPack}" refused deploy: ` +
        evaluation.issues.map((issue) => issue.code).join(', ')
    );
    this.name = 'PolicyPackDeploymentError';
  }
}

export class PolicyPackDefinitionError extends Error {
  constructor(public readonly issues: PolicyPackGateIssue[]) {
    super(`Invalid PolicyPack: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'PolicyPackDefinitionError';
  }
}

export function isPolicyPackFrameworkId(value: string): value is PolicyPackFrameworkId {
  return (POLICY_PACK_FRAMEWORK_IDS as readonly string[]).includes(value);
}

export function isPolicyPackCompileTarget(value: string): value is PolicyPackCompileTarget {
  return (POLICY_PACK_COMPILE_TARGETS as readonly string[]).includes(value);
}

function isAuditStore(value: string): value is PolicyPackAuditRetentionPolicy['storage'] {
  return (POLICY_PACK_AUDIT_STORES as readonly string[]).includes(value);
}

function isMonitoringInterval(value: string): value is PolicyPackMonitoringInterval {
  return (POLICY_PACK_MONITORING_INTERVALS as readonly string[]).includes(value);
}

export function validatePolicyPack(pack: PolicyPack): PolicyPackGateIssue[] {
  const issues: PolicyPackGateIssue[] = [];

  if (!pack.name.trim()) {
    issues.push({
      code: 'invalid_pack',
      severity: 'error',
      message: 'PolicyPack name is required.',
    });
  }
  if (!pack.version.trim()) {
    issues.push({
      code: 'invalid_pack',
      severity: 'error',
      message: 'PolicyPack version is required.',
    });
  }
  if (!isPolicyPackFrameworkId(pack.frameworkId)) {
    issues.push({
      code: 'invalid_framework',
      severity: 'error',
      message: `Unknown frameworkId "${pack.frameworkId}".`,
    });
  }
  if (pack.requiredTests.length === 0) {
    issues.push({
      code: 'invalid_pack',
      severity: 'error',
      message: 'PolicyPack requires at least one FairnessSweep test.',
    });
  }
  for (const test of pack.requiredTests) {
    if (!test.id.trim() || !test.protectedAttribute.trim()) {
      issues.push({
        code: 'invalid_pack',
        severity: 'error',
        message: 'Every required FairnessSweep needs id and protectedAttribute.',
        testId: test.id,
      });
    }
  }
  for (const target of pack.requiredCompileTargets) {
    if (!isPolicyPackCompileTarget(target)) {
      issues.push({
        code: 'invalid_compile_target',
        severity: 'error',
        message: `Unknown policy-pack compile target "${target}".`,
        compileTarget: target,
      });
    }
  }
  if (pack.requiredCompileTargets.length === 0) {
    issues.push({
      code: 'invalid_pack',
      severity: 'error',
      message: 'PolicyPack requires at least one compliance compile target.',
    });
  }
  if (!Number.isFinite(pack.auditRetention.minDays) || pack.auditRetention.minDays <= 0) {
    issues.push({
      code: 'invalid_pack',
      severity: 'error',
      message: 'auditRetention.minDays must be a positive number.',
    });
  }
  if (!isAuditStore(pack.auditRetention.storage)) {
    issues.push({
      code: 'invalid_pack',
      severity: 'error',
      message: `Unknown audit retention storage "${pack.auditRetention.storage}".`,
    });
  }
  if (!isMonitoringInterval(pack.monitoringCadence.interval)) {
    issues.push({
      code: 'invalid_pack',
      severity: 'error',
      message: `Unknown monitoring interval "${pack.monitoringCadence.interval}".`,
    });
  }

  return issues;
}

export function definePolicyPack(
  input: Omit<PolicyPack, 'type'> & { type?: 'PolicyPack' }
): PolicyPack {
  const pack: PolicyPack = { ...input, type: 'PolicyPack' };
  const issues = validatePolicyPack(pack);
  if (issues.some((issue) => issue.severity === 'error')) {
    throw new PolicyPackDefinitionError(issues);
  }
  return pack;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function field(record: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (record[name] !== undefined) return record[name];
  }
  return undefined;
}

function stringField(
  record: Record<string, unknown>,
  fallback: string,
  ...names: string[]
): string {
  const value = field(record, ...names);
  return typeof value === 'string' ? value : fallback;
}

function numberField(
  record: Record<string, unknown>,
  fallback: number,
  ...names: string[]
): number {
  const value = field(record, ...names);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanField(record: Record<string, unknown>, ...names: string[]): boolean | undefined {
  const value = field(record, ...names);
  return typeof value === 'boolean' ? value : undefined;
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function normalizeRequiredFairnessSweep(value: unknown, index: number): RequiredFairnessSweep {
  const record = asRecord(value);
  const out: RequiredFairnessSweep = {
    id: stringField(record, `fairness_sweep_${index + 1}`, 'id', 'name'),
    protectedAttribute: stringField(record, 'group', 'protectedAttribute', 'protected_attribute'),
  };
  const minSampleSize = numberField(record, Number.NaN, 'minSampleSize', 'min_sample_size');
  if (Number.isFinite(minSampleSize)) out.minSampleSize = minSampleSize;
  const adverseImpactRatioMin = numberField(
    record,
    Number.NaN,
    'adverseImpactRatioMin',
    'adverse_impact_ratio_min'
  );
  if (Number.isFinite(adverseImpactRatioMin)) out.adverseImpactRatioMin = adverseImpactRatioMin;
  const demographicParityDiffMax = numberField(
    record,
    Number.NaN,
    'demographicParityDiffMax',
    'demographic_parity_diff_max'
  );
  if (Number.isFinite(demographicParityDiffMax)) {
    out.demographicParityDiffMax = demographicParityDiffMax;
  }
  const requireRobustnessReceipt = booleanField(
    record,
    'requireRobustnessReceipt',
    'require_robustness_receipt'
  );
  if (requireRobustnessReceipt !== undefined)
    out.requireRobustnessReceipt = requireRobustnessReceipt;
  out.config = record;
  return out;
}

function normalizeAuditRetention(record: Record<string, unknown>): PolicyPackAuditRetentionPolicy {
  return {
    minDays: numberField(record, 0, 'minDays', 'min_days'),
    storage: stringField(record, '', 'storage') as PolicyPackAuditRetentionPolicy['storage'],
    legalHold: booleanField(record, 'legalHold', 'legal_hold'),
  };
}

function normalizeMonitoringCadence(record: Record<string, unknown>): PolicyPackMonitoringCadence {
  const cadence: PolicyPackMonitoringCadence = {
    interval: stringField(record, '', 'interval') as PolicyPackMonitoringInterval,
  };
  const driftSweepRequired = booleanField(record, 'driftSweepRequired', 'drift_sweep_required');
  if (driftSweepRequired !== undefined) cadence.driftSweepRequired = driftSweepRequired;
  const alertThreshold = numberField(record, Number.NaN, 'alertThreshold', 'alert_threshold');
  if (Number.isFinite(alertThreshold)) cadence.alertThreshold = alertThreshold;
  return cadence;
}

export function policyPackFromSchemaBlock(block: PolicyPackSchemaBlock): PolicyPack {
  const properties = block.properties ?? {};
  const frameworkId = (block.frameworkId ??
    stringField(properties, '', 'framework_id', 'frameworkId')) as PolicyPackFrameworkId;
  const rawTests =
    block.requiredTests ?? arrayField(field(properties, 'required_tests', 'requiredTests'));
  const rawTargets =
    block.requiredCompileTargets ??
    arrayField(field(properties, 'required_compile_targets', 'requiredCompileTargets'));
  const auditRetention =
    block.auditRetention ?? asRecord(field(properties, 'audit_retention', 'auditRetention'));
  const monitoringCadence =
    block.monitoringCadence ??
    asRecord(field(properties, 'monitoring', 'monitoring_cadence', 'monitoringCadence'));

  return definePolicyPack({
    name: block.name,
    version: block.version ?? stringField(properties, '1.0.0', 'version'),
    frameworkId,
    requiredTests: rawTests.map(normalizeRequiredFairnessSweep),
    requiredCompileTargets: rawTargets.map((target) => String(target) as PolicyPackCompileTarget),
    auditRetention: normalizeAuditRetention(auditRetention),
    monitoringCadence: normalizeMonitoringCadence(monitoringCadence),
    metadata: properties,
  });
}

export function evaluatePolicyPackDeployment(
  pack: PolicyPack,
  evidence: PolicyPackDeploymentEvidence
): PolicyPackDeploymentEvaluation {
  const issues = validatePolicyPack(pack);
  const testEvidence = new Map(evidence.tests.map((test) => [test.id, test]));
  const artifactTargets = new Set(evidence.compileTargets.map((artifact) => artifact.target));
  const missingTests: string[] = [];
  const failedTests: string[] = [];
  const missingCompileTargets: PolicyPackCompileTarget[] = [];

  for (const required of pack.requiredTests) {
    const observed = testEvidence.get(required.id);
    if (!observed) {
      missingTests.push(required.id);
      issues.push({
        code: 'missing_required_test',
        severity: 'error',
        message: `Missing required FairnessSweep evidence "${required.id}".`,
        testId: required.id,
      });
      continue;
    }

    const ratioFloor = required.adverseImpactRatioMin ?? 0.8;
    const ratio = observed.adverseImpactRatio;
    const parityDiff = observed.demographicParityDiff;
    const failed =
      !observed.passed ||
      (required.minSampleSize !== undefined &&
        (observed.sampleSize ?? 0) < required.minSampleSize) ||
      (ratio !== undefined && ratio < ratioFloor) ||
      (required.demographicParityDiffMax !== undefined &&
        (parityDiff === undefined || parityDiff > required.demographicParityDiffMax)) ||
      (required.requireRobustnessReceipt === true && !observed.robustnessReceiptHash);

    if (failed) {
      failedTests.push(required.id);
      issues.push({
        code: 'failed_required_test',
        severity: 'error',
        message: `Required FairnessSweep "${required.id}" did not satisfy the policy pack.`,
        testId: required.id,
      });
    }
  }

  for (const target of pack.requiredCompileTargets) {
    if (!artifactTargets.has(target)) {
      missingCompileTargets.push(target);
      issues.push({
        code: 'missing_compile_target',
        severity: 'error',
        message: `Missing required compliance artifact "${target}".`,
        compileTarget: target,
      });
    }
  }

  if (evidence.auditRetentionAccepted !== true) {
    issues.push({
      code: 'audit_retention_not_armed',
      severity: 'error',
      message: 'Audit retention policy has not been accepted by the deploy gate.',
    });
  }

  if (evidence.monitoringScheduled !== true) {
    issues.push({
      code: 'monitoring_not_scheduled',
      severity: 'error',
      message: 'Monitoring cadence has not been scheduled for the deployment.',
    });
  }

  return {
    allowed: !issues.some((issue) => issue.severity === 'error'),
    policyPack: pack.name,
    frameworkId: pack.frameworkId,
    missingTests,
    failedTests,
    missingCompileTargets,
    issues,
  };
}

export function assertPolicyPackDeploymentReady(
  pack: PolicyPack,
  evidence: PolicyPackDeploymentEvidence
): PolicyPackDeploymentEvaluation {
  const evaluation = evaluatePolicyPackDeployment(pack, evidence);
  if (!evaluation.allowed) {
    throw new PolicyPackDeploymentError(evaluation);
  }
  return evaluation;
}

export function defaultPolicyPackCompileTargets(): PolicyPackCompileTarget[] {
  return [...POLICY_PACK_COMPILE_TARGETS];
}
