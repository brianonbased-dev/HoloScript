/**
 * Sovereign compiler for accelerator-neutral @compute work-unit contracts.
 *
 * This module owns authored compute semantics. Backend compilers may attach
 * independently hashed artifacts, but provider selection, admission, capacity,
 * credentials, live prices, and leases remain runtime placement state.
 */

import { createHash } from 'crypto';
import type { HoloComposition } from '../parser/HoloCompositionTypes';
import { parseHoloStrict } from '../parser/HoloCompositionParser';

export type ComputeAccelerator = 'cpu' | 'gpu' | 'npu' | 'other';
export type ComputePlacementPolicy = 'local_only' | 'owned_fleet' | 'external_bridge_requested';
export type ComputeDataClassification = 'public' | 'internal' | 'confidential' | 'restricted';
export type ComputeQualityOperator = 'eq' | 'lte' | 'gte';
export type ComputeQualityReference = 'none' | 'cpu_reference';
export type ComputeBudgetCurrency = 'USD';
export type ComputeSourceDigestKind = 'source_utf8' | 'canonical_ast';

export const COMPUTE_WORK_UNIT_SCHEMA_VERSION = 'holoscript.compute-work-unit.v1' as const;
export const COMPUTE_WORK_UNIT_COMPILER_VERSION = '1.0.0' as const;

const COMPUTE_COMPILER_NAME = 'ComputeWorkUnitCompiler' as const;
const PLACEMENT_PLAN_RECEIPT = 'holoscript.compute-placement-plan.v1' as const;
const CAPACITY_LEASE_RECEIPT = 'holoscript.compute-capacity-lease.v1' as const;
const EXECUTION_RECEIPT = 'holoscript.compute-execution-receipt.v1' as const;
const BRIDGE_ADMISSION_RECEIPT = 'holoscript.compute-bridge-admission.v1' as const;

export interface ComputeWorkUnitSourceConfig {
  /** Outcome requested by the author. Missing or empty keeps the legacy shader-only path. */
  intent: string;
  /** Ordered portable accelerator classes; this also defines fallback preference. */
  allowed_accelerators: readonly ComputeAccelerator[];
  /** External bridge requests still require an admitted runtime receipt. */
  placement_policy: ComputePlacementPolicy;
  data_classification: ComputeDataClassification;
  quality_metric: string;
  quality_operator: ComputeQualityOperator;
  quality_threshold: number;
  quality_reference: ComputeQualityReference;
  /** Zero means no deadline constraint. */
  deadline_ms: number;
  budget_currency: ComputeBudgetCurrency;
  /** Integer minor units avoid ambiguous floating-point monetary caps. */
  max_cost_minor_units: number;
  allow_fallback: boolean;
}

export interface ComputeWorkUnitSourceBinding {
  readonly objectName: string;
  readonly sourceDigest: string;
  readonly sourceDigestKind: ComputeSourceDigestKind;
  readonly compiler: typeof COMPUTE_COMPILER_NAME;
  readonly compilerVersion: typeof COMPUTE_WORK_UNIT_COMPILER_VERSION;
  readonly artifact?: string;
  readonly artifactDigest?: string;
}

export interface ComputeWorkUnitContract {
  readonly schemaVersion: typeof COMPUTE_WORK_UNIT_SCHEMA_VERSION;
  readonly intent: string;
  readonly source_evidence: string;
  readonly producer_surface: '@compute';
  readonly executor_lane: 'compute';
  readonly allowed_actions: readonly string[];
  readonly forbidden_actions: readonly string[];
  readonly required_runtime_evidence: readonly string[];
  readonly done_criteria: string;
  readonly verification_mode: 'producer_contract';
  readonly verifier_command_or_receipt: 'verifyComputeWorkUnitEvidence';
  readonly compute: {
    readonly source: ComputeWorkUnitSourceBinding;
    readonly policy: {
      readonly placement: ComputePlacementPolicy;
      readonly externalAccess: 'denied' | 'requires_admission';
      readonly bridgeAdmission: 'not_applicable' | 'runtime_receipt_required';
      readonly allowedAccelerators: readonly ComputeAccelerator[];
      readonly dataClassification: ComputeDataClassification;
      readonly allowFallback: boolean;
    };
    readonly quality: {
      readonly metric: string;
      readonly operator: ComputeQualityOperator;
      readonly threshold: number;
      readonly reference: ComputeQualityReference;
    };
    readonly budget: {
      readonly deadlineMs: number;
      readonly currency: ComputeBudgetCurrency;
      readonly maxCostMinorUnits: number;
    };
  };
}

export interface ComputeWorkUnitValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface CompiledComputeWorkUnit {
  readonly objectName: string;
  readonly workUnit: ComputeWorkUnitContract;
}

export interface ComputeWorkUnitCompilationOptions {
  /** Exact UTF-8 source when the caller still has it; otherwise canonical AST is labeled honestly. */
  readonly sourceText?: string;
}

export interface ComputeWorkUnitEvidenceInput {
  readonly sourceText?: string;
  readonly composition?: HoloComposition;
  readonly artifacts?: Readonly<Record<string, string | Uint8Array>>;
}

const COMPUTE_ACCELERATORS = new Set<ComputeAccelerator>(['cpu', 'gpu', 'npu', 'other']);
const COMPUTE_PLACEMENTS = new Set<ComputePlacementPolicy>([
  'local_only',
  'owned_fleet',
  'external_bridge_requested',
]);
const COMPUTE_DATA_CLASSES = new Set<ComputeDataClassification>([
  'public',
  'internal',
  'confidential',
  'restricted',
]);
const COMPUTE_QUALITY_OPERATORS = new Set<ComputeQualityOperator>(['eq', 'lte', 'gte']);
const COMPUTE_QUALITY_REFERENCES = new Set<ComputeQualityReference>(['none', 'cpu_reference']);
const COMPUTE_SOURCE_DIGEST_KINDS = new Set<ComputeSourceDigestKind>([
  'source_utf8',
  'canonical_ast',
]);
const COMPUTE_ALLOWED_ACTIONS = new Set([
  'compute:plan',
  'compute:execute',
  'compute:fallback',
  'compute:request_bridge',
]);
const COMPUTE_FORBIDDEN_ACTIONS = new Set(['network:external', 'compute:unapproved_bridge']);
const COMPUTE_RUNTIME_EVIDENCE = new Set<string>([
  PLACEMENT_PLAN_RECEIPT,
  CAPACITY_LEASE_RECEIPT,
  EXECUTION_RECEIPT,
  BRIDGE_ADMISSION_RECEIPT,
]);
const RUNTIME_ONLY_SOURCE_FIELDS = new Set([
  'provider',
  'provider_id',
  'endpoint',
  'endpoint_url',
  'credential',
  'credentials',
  'api_key',
  'device',
  'device_id',
  'device_health',
  'quota',
  'live_price',
  'live_price_usd',
  'lease_id',
  'capacity',
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('canonical AST cannot contain non-finite numbers');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
    }
    return result;
  }
  throw new TypeError(`canonical AST cannot contain ${typeof value}`);
}

export function computeCanonicalAstDigest(composition: HoloComposition): string {
  return sha256(JSON.stringify(canonicalize(composition)));
}

function normalizeSourceFieldName(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function normalizeAccelerators(value: unknown): ComputeAccelerator[] {
  if (!Array.isArray(value)) return ['cpu'];
  return [...new Set(value as ComputeAccelerator[])];
}

function normalizePlacement(value: unknown): ComputePlacementPolicy {
  return typeof value === 'string' && COMPUTE_PLACEMENTS.has(value as ComputePlacementPolicy)
    ? (value as ComputePlacementPolicy)
    : 'local_only';
}

function normalizeDataClassification(value: unknown): ComputeDataClassification {
  return typeof value === 'string' && COMPUTE_DATA_CLASSES.has(value as ComputeDataClassification)
    ? (value as ComputeDataClassification)
    : 'confidential';
}

function normalizeQualityOperator(value: unknown): ComputeQualityOperator {
  return typeof value === 'string' && COMPUTE_QUALITY_OPERATORS.has(value as ComputeQualityOperator)
    ? (value as ComputeQualityOperator)
    : 'eq';
}

function normalizeQualityReference(value: unknown): ComputeQualityReference {
  return typeof value === 'string' &&
    COMPUTE_QUALITY_REFERENCES.has(value as ComputeQualityReference)
    ? (value as ComputeQualityReference)
    : 'none';
}

function qualityDoneCriteria(quality: {
  metric: string;
  operator: ComputeQualityOperator;
  threshold: number;
  reference: ComputeQualityReference;
}): string {
  const symbol = quality.operator === 'eq' ? '==' : quality.operator === 'lte' ? '<=' : '>=';
  return `${quality.metric} ${symbol} ${quality.threshold}; reference=${quality.reference}`;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[]
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key} is not allowed in an authored work unit`);
  }
}

function assertValidSourceConfig(config: Partial<ComputeWorkUnitSourceConfig>): void {
  const raw = config as Record<string, unknown>;
  for (const field of Object.keys(raw)) {
    const normalized = normalizeSourceFieldName(field);
    if (RUNTIME_ONLY_SOURCE_FIELDS.has(normalized)) {
      throw new TypeError(`${field} is runtime placement state and cannot be authored`);
    }
  }
  if (!nonEmptyText(config.intent)) throw new TypeError('intent must be non-empty text');
  if (config.allowed_accelerators !== undefined) {
    if (
      !Array.isArray(config.allowed_accelerators) ||
      config.allowed_accelerators.length === 0 ||
      config.allowed_accelerators.some(
        (entry) =>
          typeof entry !== 'string' || !COMPUTE_ACCELERATORS.has(entry as ComputeAccelerator)
      )
    ) {
      throw new TypeError('allowed_accelerators must contain supported accelerator classes');
    }
  }
  if (
    config.placement_policy !== undefined &&
    !COMPUTE_PLACEMENTS.has(config.placement_policy as ComputePlacementPolicy)
  ) {
    throw new TypeError('placement_policy is invalid');
  }
  if (
    config.data_classification !== undefined &&
    !COMPUTE_DATA_CLASSES.has(config.data_classification as ComputeDataClassification)
  ) {
    throw new TypeError('data_classification is invalid');
  }
  if (config.quality_metric !== undefined && !nonEmptyText(config.quality_metric)) {
    throw new TypeError('quality_metric must be non-empty text when present');
  }
  if (
    config.quality_operator !== undefined &&
    !COMPUTE_QUALITY_OPERATORS.has(config.quality_operator as ComputeQualityOperator)
  ) {
    throw new TypeError('quality_operator is invalid');
  }
  if (config.quality_threshold !== undefined && !nonNegativeFinite(config.quality_threshold)) {
    throw new TypeError('quality_threshold must be a non-negative finite number');
  }
  if (
    config.quality_reference !== undefined &&
    !COMPUTE_QUALITY_REFERENCES.has(config.quality_reference as ComputeQualityReference)
  ) {
    throw new TypeError('quality_reference is invalid');
  }
  if (config.deadline_ms !== undefined && !nonNegativeInteger(config.deadline_ms)) {
    throw new TypeError('deadline_ms must be a non-negative safe integer');
  }
  if (config.budget_currency !== undefined && config.budget_currency !== 'USD') {
    throw new TypeError('budget_currency must be USD');
  }
  if (
    config.max_cost_minor_units !== undefined &&
    !nonNegativeInteger(config.max_cost_minor_units)
  ) {
    throw new TypeError('max_cost_minor_units must be a non-negative safe integer');
  }
  if (
    (config.placement_policy === undefined || config.placement_policy === 'local_only') &&
    config.max_cost_minor_units !== undefined &&
    config.max_cost_minor_units !== 0
  ) {
    throw new TypeError('local_only placement requires max_cost_minor_units=0');
  }
  if (config.allow_fallback !== undefined && typeof config.allow_fallback !== 'boolean') {
    throw new TypeError('allow_fallback must be boolean');
  }
}

function assertValidSourceBinding(source: ComputeWorkUnitSourceBinding): void {
  if (!isRecord(source)) throw new TypeError('source binding must be an object');
  if (!SHA256_PATTERN.test(source.sourceDigest)) {
    throw new TypeError('sourceDigest must be a lowercase SHA-256 digest');
  }
  if (!COMPUTE_SOURCE_DIGEST_KINDS.has(source.sourceDigestKind)) {
    throw new TypeError('sourceDigestKind is invalid');
  }
  if (source.compiler !== COMPUTE_COMPILER_NAME) {
    throw new TypeError(`compiler must be ${COMPUTE_COMPILER_NAME}`);
  }
  if (source.compilerVersion !== COMPUTE_WORK_UNIT_COMPILER_VERSION) {
    throw new TypeError(`compilerVersion must be ${COMPUTE_WORK_UNIT_COMPILER_VERSION}`);
  }
  if ((source.artifact === undefined) !== (source.artifactDigest === undefined)) {
    throw new TypeError('artifact and artifactDigest must be provided together');
  }
  if (!nonEmptyText(source.objectName)) throw new TypeError('objectName must be non-empty text');
  if (source.artifact !== undefined && !nonEmptyText(source.artifact)) {
    throw new TypeError('artifact must be non-empty text when present');
  }
  if (source.artifactDigest !== undefined && !SHA256_PATTERN.test(source.artifactDigest)) {
    throw new TypeError('artifactDigest must be a lowercase SHA-256 digest');
  }
}

function makeSourceBinding(
  composition: HoloComposition,
  objectName: string,
  sourceText?: string
): ComputeWorkUnitSourceBinding {
  return {
    objectName,
    sourceDigest:
      sourceText === undefined ? computeCanonicalAstDigest(composition) : sha256(sourceText),
    sourceDigestKind: sourceText === undefined ? 'canonical_ast' : 'source_utf8',
    compiler: COMPUTE_COMPILER_NAME,
    compilerVersion: COMPUTE_WORK_UNIT_COMPILER_VERSION,
  };
}

function withoutArtifactEvidence(contract: ComputeWorkUnitContract): unknown {
  const source: Record<string, unknown> = { ...contract.compute.source };
  delete source.artifact;
  delete source.artifactDigest;
  return {
    ...contract,
    compute: {
      ...contract.compute,
      source,
    },
  };
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** Build one already-source-bound producer contract. */
export function buildComputeWorkUnit(
  config: Partial<ComputeWorkUnitSourceConfig>,
  source: ComputeWorkUnitSourceBinding
): ComputeWorkUnitContract {
  assertValidSourceConfig(config);
  assertValidSourceBinding(source);
  const placement = normalizePlacement(config.placement_policy);
  const externalRequested = placement === 'external_bridge_requested';
  const allowedAccelerators = normalizeAccelerators(config.allowed_accelerators);
  const quality = {
    metric: nonEmptyText(config.quality_metric) ? config.quality_metric.trim() : 'exact_result',
    operator: normalizeQualityOperator(config.quality_operator),
    threshold: nonNegativeFinite(config.quality_threshold) ? config.quality_threshold : 0,
    reference: normalizeQualityReference(config.quality_reference),
  };
  const deadlineMs = nonNegativeInteger(config.deadline_ms) ? config.deadline_ms : 0;
  const requestedMaxCostMinorUnits = nonNegativeInteger(config.max_cost_minor_units)
    ? config.max_cost_minor_units
    : 0;
  const maxCostMinorUnits = placement === 'local_only' ? 0 : requestedMaxCostMinorUnits;
  const allowFallback = config.allow_fallback !== false;

  return {
    schemaVersion: COMPUTE_WORK_UNIT_SCHEMA_VERSION,
    intent: config.intent!.trim(),
    source_evidence: `sha256:${source.sourceDigest}`,
    producer_surface: '@compute',
    executor_lane: 'compute',
    allowed_actions: [
      'compute:plan',
      'compute:execute',
      ...(allowFallback ? ['compute:fallback'] : []),
      ...(externalRequested ? ['compute:request_bridge'] : []),
    ],
    forbidden_actions: [
      ...(placement === 'local_only' ? ['network:external'] : []),
      'compute:unapproved_bridge',
    ],
    required_runtime_evidence: [
      PLACEMENT_PLAN_RECEIPT,
      CAPACITY_LEASE_RECEIPT,
      EXECUTION_RECEIPT,
      ...(externalRequested ? [BRIDGE_ADMISSION_RECEIPT] : []),
    ],
    done_criteria: qualityDoneCriteria(quality),
    verification_mode: 'producer_contract',
    verifier_command_or_receipt: 'verifyComputeWorkUnitEvidence',
    compute: {
      source,
      policy: {
        placement,
        externalAccess: externalRequested ? 'requires_admission' : 'denied',
        bridgeAdmission: externalRequested ? 'runtime_receipt_required' : 'not_applicable',
        allowedAccelerators,
        dataClassification: normalizeDataClassification(config.data_classification),
        allowFallback,
      },
      quality,
      budget: {
        deadlineMs,
        currency: config.budget_currency === 'USD' ? config.budget_currency : 'USD',
        maxCostMinorUnits,
      },
    },
  };
}

/** Compile every intent-bearing @compute declaration without depending on any backend compiler. */
export function compileComputeWorkUnits(
  composition: HoloComposition,
  options: ComputeWorkUnitCompilationOptions = {}
): CompiledComputeWorkUnit[] {
  if (options.sourceText !== undefined) {
    const parsedSource = parseHoloStrict(options.sourceText);
    if (computeCanonicalAstDigest(parsedSource) !== computeCanonicalAstDigest(composition)) {
      throw new TypeError('sourceText must parse to the supplied composition');
    }
  }
  const compiled: CompiledComputeWorkUnit[] = [];
  for (const object of composition.objects ?? []) {
    const trait = object.traits?.find((candidate) => candidate.name === 'compute');
    if (!trait) continue;
    const config = isRecord(trait.config) ? trait.config : {};
    if (!Object.prototype.hasOwnProperty.call(config, 'intent')) continue;
    if (typeof config.intent !== 'string') {
      throw new TypeError(`@compute intent on ${object.name} must be text when present`);
    }
    if (config.intent.trim().length === 0) continue;
    compiled.push({
      objectName: object.name,
      workUnit: buildComputeWorkUnit(
        config as Partial<ComputeWorkUnitSourceConfig>,
        makeSourceBinding(composition, object.name, options.sourceText)
      ),
    });
  }
  return compiled;
}

/** Strict structural and semantic validation; the board remains only bounded transport. */
export function validateComputeWorkUnitContract(value: unknown): ComputeWorkUnitValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ['Compute work unit must be an object'] };
  }
  rejectUnknownKeys(
    value,
    new Set([
      'schemaVersion',
      'intent',
      'source_evidence',
      'producer_surface',
      'executor_lane',
      'allowed_actions',
      'forbidden_actions',
      'required_runtime_evidence',
      'done_criteria',
      'verification_mode',
      'verifier_command_or_receipt',
      'compute',
    ]),
    'workUnit',
    errors
  );
  if (value.schemaVersion !== COMPUTE_WORK_UNIT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${COMPUTE_WORK_UNIT_SCHEMA_VERSION}`);
  }
  if (!nonEmptyText(value.intent)) errors.push('intent must be non-empty text');
  if (value.producer_surface !== '@compute') errors.push('producer_surface must be @compute');
  if (value.executor_lane !== 'compute') errors.push('executor_lane must be compute');

  if (!isStringArray(value.allowed_actions)) {
    errors.push('allowed_actions must be a string array');
  } else {
    if (value.allowed_actions.some((action) => !COMPUTE_ALLOWED_ACTIONS.has(action))) {
      errors.push('allowed_actions contains an unsupported action');
    }
    for (const required of ['compute:plan', 'compute:execute']) {
      if (!value.allowed_actions.includes(required))
        errors.push(`allowed_actions must include ${required}`);
    }
  }
  if (!isStringArray(value.forbidden_actions)) {
    errors.push('forbidden_actions must be a string array');
  } else {
    if (value.forbidden_actions.some((action) => !COMPUTE_FORBIDDEN_ACTIONS.has(action))) {
      errors.push('forbidden_actions contains an unsupported action');
    }
    if (!value.forbidden_actions.includes('compute:unapproved_bridge')) {
      errors.push('forbidden_actions must include compute:unapproved_bridge');
    }
  }
  if (!isStringArray(value.required_runtime_evidence)) {
    errors.push('required_runtime_evidence must be a string array');
  } else {
    if (value.required_runtime_evidence.some((item) => !COMPUTE_RUNTIME_EVIDENCE.has(item))) {
      errors.push('required_runtime_evidence contains an unsupported receipt');
    }
    for (const required of [PLACEMENT_PLAN_RECEIPT, CAPACITY_LEASE_RECEIPT, EXECUTION_RECEIPT]) {
      if (!value.required_runtime_evidence.includes(required)) {
        errors.push(`required_runtime_evidence must include ${required}`);
      }
    }
  }
  if (value.verification_mode !== 'producer_contract') {
    errors.push('verification_mode must be producer_contract');
  }
  if (value.verifier_command_or_receipt !== 'verifyComputeWorkUnitEvidence') {
    errors.push('verifier_command_or_receipt must be verifyComputeWorkUnitEvidence');
  }
  if (!nonEmptyText(value.source_evidence)) errors.push('source_evidence must be non-empty text');

  const compute = isRecord(value.compute) ? value.compute : null;
  if (!compute) {
    errors.push('compute must be an object');
    return { valid: false, errors };
  }
  rejectUnknownKeys(compute, new Set(['source', 'policy', 'quality', 'budget']), 'compute', errors);
  const source = isRecord(compute.source) ? compute.source : null;
  const policy = isRecord(compute.policy) ? compute.policy : null;
  const quality = isRecord(compute.quality) ? compute.quality : null;
  const budget = isRecord(compute.budget) ? compute.budget : null;
  if (!source) errors.push('compute.source must be an object');
  if (!policy) errors.push('compute.policy must be an object');
  if (!quality) errors.push('compute.quality must be an object');
  if (!budget) errors.push('compute.budget must be an object');

  if (source) {
    rejectUnknownKeys(
      source,
      new Set([
        'objectName',
        'sourceDigest',
        'sourceDigestKind',
        'compiler',
        'compilerVersion',
        'artifact',
        'artifactDigest',
      ]),
      'compute.source',
      errors
    );
    if (!nonEmptyText(source.objectName)) {
      errors.push('compute.source.objectName must be non-empty text');
    }
    if (typeof source.sourceDigest !== 'string' || !SHA256_PATTERN.test(source.sourceDigest)) {
      errors.push('compute.source.sourceDigest must be a lowercase SHA-256 digest');
    } else if (value.source_evidence !== `sha256:${source.sourceDigest}`) {
      errors.push('source_evidence must bind compute.source.sourceDigest');
    }
    if (
      typeof source.sourceDigestKind !== 'string' ||
      !COMPUTE_SOURCE_DIGEST_KINDS.has(source.sourceDigestKind as ComputeSourceDigestKind)
    ) {
      errors.push('compute.source.sourceDigestKind is invalid');
    }
    if (source.compiler !== COMPUTE_COMPILER_NAME) {
      errors.push(`compute.source.compiler must be ${COMPUTE_COMPILER_NAME}`);
    }
    if (source.compilerVersion !== COMPUTE_WORK_UNIT_COMPILER_VERSION) {
      errors.push(`compute.source.compilerVersion must be ${COMPUTE_WORK_UNIT_COMPILER_VERSION}`);
    }
    if ((source.artifact === undefined) !== (source.artifactDigest === undefined)) {
      errors.push('compute.source.artifact and artifactDigest must be present together');
    }
    if (source.artifact !== undefined && !nonEmptyText(source.artifact)) {
      errors.push('compute.source.artifact must be non-empty text when present');
    }
    if (
      source.artifactDigest !== undefined &&
      (typeof source.artifactDigest !== 'string' || !SHA256_PATTERN.test(source.artifactDigest))
    ) {
      errors.push('compute.source.artifactDigest must be a lowercase SHA-256 digest');
    }
  }

  if (policy) {
    rejectUnknownKeys(
      policy,
      new Set([
        'placement',
        'externalAccess',
        'bridgeAdmission',
        'allowedAccelerators',
        'dataClassification',
        'allowFallback',
      ]),
      'compute.policy',
      errors
    );
    const placement = policy.placement;
    const externalRequested = placement === 'external_bridge_requested';
    if (
      typeof placement !== 'string' ||
      !COMPUTE_PLACEMENTS.has(placement as ComputePlacementPolicy)
    ) {
      errors.push('compute.policy.placement is invalid');
    }
    if (!Array.isArray(policy.allowedAccelerators) || policy.allowedAccelerators.length === 0) {
      errors.push('compute.policy.allowedAccelerators must be non-empty');
    } else if (
      policy.allowedAccelerators.some(
        (entry) =>
          typeof entry !== 'string' || !COMPUTE_ACCELERATORS.has(entry as ComputeAccelerator)
      )
    ) {
      errors.push('compute.policy.allowedAccelerators contains an invalid accelerator');
    }
    if (
      typeof policy.dataClassification !== 'string' ||
      !COMPUTE_DATA_CLASSES.has(policy.dataClassification as ComputeDataClassification)
    ) {
      errors.push('compute.policy.dataClassification is invalid');
    }
    if (typeof policy.allowFallback !== 'boolean') {
      errors.push('compute.policy.allowFallback must be boolean');
    }
    const expectedExternalAccess = externalRequested ? 'requires_admission' : 'denied';
    if (policy.externalAccess !== expectedExternalAccess) {
      errors.push(
        `${String(placement)} placement requires externalAccess=${expectedExternalAccess}`
      );
    }
    const expectedAdmission = externalRequested ? 'runtime_receipt_required' : 'not_applicable';
    if (policy.bridgeAdmission !== expectedAdmission) {
      errors.push(`${String(placement)} placement requires bridgeAdmission=${expectedAdmission}`);
    }
    if (isStringArray(value.allowed_actions)) {
      if (policy.allowFallback !== value.allowed_actions.includes('compute:fallback')) {
        errors.push('compute.policy.allowFallback must match the compute:fallback action');
      }
      if (externalRequested !== value.allowed_actions.includes('compute:request_bridge')) {
        errors.push('external bridge request must match the compute:request_bridge action');
      }
    }
    if (
      placement === 'local_only' &&
      isStringArray(value.forbidden_actions) &&
      !value.forbidden_actions.includes('network:external')
    ) {
      errors.push('local_only placement must forbid network:external');
    }
    if (
      isStringArray(value.required_runtime_evidence) &&
      externalRequested !== value.required_runtime_evidence.includes(BRIDGE_ADMISSION_RECEIPT)
    ) {
      errors.push('external bridge request must match the bridge admission receipt requirement');
    }
  }

  if (quality) {
    rejectUnknownKeys(
      quality,
      new Set(['metric', 'operator', 'threshold', 'reference']),
      'compute.quality',
      errors
    );
    if (!nonEmptyText(quality.metric)) errors.push('compute.quality.metric must be non-empty text');
    if (
      typeof quality.operator !== 'string' ||
      !COMPUTE_QUALITY_OPERATORS.has(quality.operator as ComputeQualityOperator)
    ) {
      errors.push('compute.quality.operator is invalid');
    }
    if (!nonNegativeFinite(quality.threshold)) {
      errors.push('compute.quality.threshold must be a non-negative finite number');
    }
    if (
      typeof quality.reference !== 'string' ||
      !COMPUTE_QUALITY_REFERENCES.has(quality.reference as ComputeQualityReference)
    ) {
      errors.push('compute.quality.reference is invalid');
    }
    if (
      nonEmptyText(quality.metric) &&
      typeof quality.operator === 'string' &&
      COMPUTE_QUALITY_OPERATORS.has(quality.operator as ComputeQualityOperator) &&
      nonNegativeFinite(quality.threshold) &&
      typeof quality.reference === 'string' &&
      COMPUTE_QUALITY_REFERENCES.has(quality.reference as ComputeQualityReference)
    ) {
      const expected = qualityDoneCriteria({
        metric: quality.metric,
        operator: quality.operator as ComputeQualityOperator,
        threshold: quality.threshold,
        reference: quality.reference as ComputeQualityReference,
      });
      if (value.done_criteria !== expected) errors.push('done_criteria must match compute.quality');
    }
  }

  if (budget) {
    rejectUnknownKeys(
      budget,
      new Set(['deadlineMs', 'currency', 'maxCostMinorUnits']),
      'compute.budget',
      errors
    );
    if (!nonNegativeInteger(budget.deadlineMs)) {
      errors.push('compute.budget.deadlineMs must be a non-negative safe integer');
    }
    if (budget.currency !== 'USD') errors.push('compute.budget.currency must be USD');
    if (!nonNegativeInteger(budget.maxCostMinorUnits)) {
      errors.push('compute.budget.maxCostMinorUnits must be a non-negative safe integer');
    }
    if (policy?.placement === 'local_only' && budget.maxCostMinorUnits !== 0) {
      errors.push('local_only placement requires maxCostMinorUnits=0');
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Recompute source/artifact digests from caller-supplied bytes or AST evidence. */
export function verifyComputeWorkUnitEvidence(
  value: unknown,
  evidence: ComputeWorkUnitEvidenceInput
): ComputeWorkUnitValidation {
  const structural = validateComputeWorkUnitContract(value);
  if (!structural.valid || !isRecord(value) || !isRecord(value.compute)) return structural;
  const source = isRecord(value.compute.source) ? value.compute.source : null;
  if (!source) return structural;

  const errors: string[] = [];
  let evidenceComposition: HoloComposition | undefined;
  let exactSourceText: string | undefined;
  if (source.sourceDigestKind === 'source_utf8') {
    if (typeof evidence.sourceText !== 'string') {
      errors.push('source_utf8 evidence requires sourceText');
    } else if (sha256(evidence.sourceText) !== source.sourceDigest) {
      errors.push('sourceText digest does not match compute.source.sourceDigest');
    } else {
      exactSourceText = evidence.sourceText;
      try {
        evidenceComposition = parseHoloStrict(evidence.sourceText);
      } catch (error) {
        errors.push(
          `sourceText cannot be parsed as the authored compute source: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  } else if (source.sourceDigestKind === 'canonical_ast') {
    if (!evidence.composition) {
      errors.push('canonical_ast evidence requires composition');
    } else if (computeCanonicalAstDigest(evidence.composition) !== source.sourceDigest) {
      errors.push('composition digest does not match compute.source.sourceDigest');
    } else {
      evidenceComposition = evidence.composition;
    }
  }

  if (evidenceComposition && nonEmptyText(source.objectName)) {
    try {
      const expected = compileComputeWorkUnits(
        evidenceComposition,
        exactSourceText === undefined ? {} : { sourceText: exactSourceText }
      ).find((entry) => entry.objectName === source.objectName);
      if (!expected) {
        errors.push(`authored compute source does not contain ${source.objectName}`);
      } else if (
        canonicalJson(withoutArtifactEvidence(value as unknown as ComputeWorkUnitContract)) !==
        canonicalJson(expected.workUnit)
      ) {
        errors.push('work unit does not match the authored compute source');
      }
    } catch (error) {
      errors.push(
        `authored compute source cannot regenerate the work unit: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (typeof source.artifact === 'string' && typeof source.artifactDigest === 'string') {
    const bytes = evidence.artifacts?.[source.artifact];
    if (bytes === undefined) {
      errors.push(`artifact evidence is missing for ${source.artifact}`);
    } else if (sha256(bytes) !== source.artifactDigest) {
      errors.push(`artifact digest does not match for ${source.artifact}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
