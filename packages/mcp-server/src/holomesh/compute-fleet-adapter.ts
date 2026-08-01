/**
 * Fail-closed normalization from the observed HoloMesh Vast fleet projection
 * into provider-neutral @compute capacity evidence input.
 *
 * This adapter observes existing state only. In particular, it never reserves
 * provider capacity, mutates the allocation cursor, or treats utilization as a
 * lease/availability signal. Global spend is also observation only: atomic
 * budget holds belong to A.GPU.007 and are not claimed by this adapter.
 */

import type { ComputeDataClassification, ComputeWorkUnitContract } from '@holoscript/core/compiler';
import { validateComputeWorkUnitContract } from '@holoscript/core/compiler';
import type {
  BuildComputeCapacitySnapshotInput,
  ComputeCapacityAllocationCursor,
  ComputeEvidenceSigner,
} from '@holoscript/core/world-model';
import { validateComputeCapacityAllocationCursor } from '@holoscript/core/world-model';
import type { TeamFleetSnapshotRecord } from './types';

export const COMPUTE_FLEET_DATA_POLICY_SCHEMA_VERSION =
  'holoscript.compute-fleet-data-policy.v1' as const;
export const COMPUTE_FLEET_RESOURCE_ELIGIBILITY_SCHEMA_VERSION =
  'holoscript.compute-fleet-resource-eligibility.v1' as const;

const FLEET_SNAPSHOT_SCHEMA_VERSION = 'holomesh.fleet-snapshot/v2';
const VAST_RESOURCE_FLOW_SCHEMA_VERSION = 'holomesh.vast-resource-flow/v1';
const VAST_SPEND_SCHEMA_VERSION = 'holomesh.vast-spend-accounting/v1';
const CAPACITY_MAX_AGE_MS = 60_000;
const SPEND_MAX_AGE_MS = 15 * 60_000;
const FLOW_CAPTURE_TOLERANCE_MS = 5_000;
const MONEY_ARITHMETIC_TOLERANCE_USD = 0.000001;
const SHA256_LABEL = /^sha256:[a-f0-9]{64}$/;
const DATA_CLASSIFICATIONS: readonly ComputeDataClassification[] = [
  'public',
  'internal',
  'confidential',
  'restricted',
];
const DATA_CLASSIFICATION_SET = new Set<ComputeDataClassification>(DATA_CLASSIFICATIONS);
const ADMITTED_CAPACITY_STATE = 'endpoint_active';
const ADMITTED_BINDING_KIND = 'vast_endpoint';

export interface ComputeFleetResourceEligibilityBinding {
  readonly schemaVersion: typeof COMPUTE_FLEET_RESOURCE_ELIGIBILITY_SCHEMA_VERSION;
  /** Opaque durable identity supplied by the caller; never derived from provider data. */
  readonly capacityRef: string;
  readonly provider: 'vast.ai';
  readonly instanceId: number;
  readonly eligible: boolean;
  readonly validUntil: string;
}

export interface ComputeFleetDataPolicy {
  readonly schemaVersion: typeof COMPUTE_FLEET_DATA_POLICY_SCHEMA_VERSION;
  readonly capacityRef: string;
  readonly allowedDataClassifications: readonly ComputeDataClassification[];
  readonly validUntil: string;
}

export interface NormalizeComputeFleetCapacityInput {
  readonly record: TeamFleetSnapshotRecord;
  /** Server-owned source authority; a record's self-declared source is not sufficient. */
  readonly allowedSources: readonly string[];
  /** Publisher identity is authority only when present in this caller-supplied allowlist. */
  readonly allowedPublisherAgentIds: readonly string[];
  /** Durable binding that prevents mixing an opaque capacity ref with another provider resource. */
  readonly resourceEligibility: ComputeFleetResourceEligibilityBinding;
  readonly workUnit: ComputeWorkUnitContract;
  readonly dataPolicy: ComputeFleetDataPolicy;
  readonly allocationCursor: ComputeCapacityAllocationCursor;
  readonly signer: ComputeEvidenceSigner;
  readonly now: string;
  readonly quoteExpiresAt: string;
}

const NORMALIZATION_REASON_CODES = [
  'normalization_time_invalid',
  'fleet_record_invalid',
  'source_allowlist_invalid',
  'source_not_allowed',
  'publisher_allowlist_invalid',
  'publisher_not_allowed',
  'publication_timestamp_invalid',
  'publication_before_capture',
  'publication_future',
  'publication_stale',
  'snapshot_schema_invalid',
  'snapshot_capture_invalid',
  'snapshot_capture_future',
  'snapshot_capture_stale',
  'snapshot_health_not_ok',
  'snapshot_health_reasons_present',
  'snapshot_operational_error',
  'fleet_inventory_invalid',
  'resource_flow_invalid',
  'resource_flow_capture_invalid',
  'visibility_incomplete',
  'spend_accounting_invalid',
  'spend_accounting_stale',
  'spend_cap_exceeded',
  'resource_inventory_invalid',
  'capacity_binding_invalid',
  'resource_eligibility_invalid',
  'resource_ineligible',
  'resource_eligibility_expired',
  'selected_resource_invalid',
  'selected_resource_not_found',
  'selected_resource_ambiguous',
  'selected_resource_unavailable',
  'selected_resource_not_gpu',
  'resource_quote_invalid',
  'capacity_ref_invalid',
  'work_unit_invalid',
  'placement_incompatible',
  'data_policy_invalid',
  'data_classification_denied',
  'allocation_cursor_invalid',
  'allocation_capacity_mismatch',
  'signer_invalid',
  'quote_expired',
  'runtime_unbounded',
  'budget_exceeded',
  'spend_headroom_exceeded',
  'evidence_window_empty',
] as const;

export type ComputeFleetNormalizationReason = (typeof NORMALIZATION_REASON_CODES)[number];

export type ComputeFleetNormalizationResult =
  | {
      readonly ok: true;
      readonly capacityInput: BuildComputeCapacitySnapshotInput;
    }
  | {
      readonly ok: false;
      readonly reasonCodes: readonly ComputeFleetNormalizationReason[];
    };

interface SelectedVastResource {
  readonly lifecycleState: string;
  readonly gpuName: string;
  readonly numGpus: number;
  readonly vramGb: number;
  readonly gpuUtilPercent: number;
  readonly effectiveTotalDphUsd: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function positiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function canonicalTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) return null;
  return parsed;
}

function emptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function addReason(
  reasons: Set<ComputeFleetNormalizationReason>,
  reason: ComputeFleetNormalizationReason
): void {
  reasons.add(reason);
}

function failure(
  reasons: ReadonlySet<ComputeFleetNormalizationReason>
): ComputeFleetNormalizationResult {
  return {
    ok: false,
    reasonCodes: NORMALIZATION_REASON_CODES.filter((reason) => reasons.has(reason)),
  };
}

function validFleetRecordMetadata(value: Record<string, unknown>): boolean {
  return (
    nonEmptyText(value.source) &&
    nonEmptyText(value.publishedByAgentId) &&
    nonEmptyText(value.publishedByName)
  );
}

function validateSourceAllowlist(
  value: unknown,
  source: unknown,
  reasons: Set<ComputeFleetNormalizationReason>
): void {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => !nonEmptyText(entry)) ||
    new Set(value).size !== value.length
  ) {
    addReason(reasons, 'source_allowlist_invalid');
    return;
  }
  if (typeof source !== 'string' || !value.includes(source)) {
    addReason(reasons, 'source_not_allowed');
  }
}

function validatePublicationTime(
  publishedAt: unknown,
  capturedAtMs: number | null,
  nowMs: number,
  reasons: Set<ComputeFleetNormalizationReason>
): void {
  const publishedAtMs = canonicalTimestamp(publishedAt);
  if (publishedAtMs === null) {
    addReason(reasons, 'publication_timestamp_invalid');
    return;
  }
  if (capturedAtMs !== null && publishedAtMs < capturedAtMs) {
    addReason(reasons, 'publication_before_capture');
  }
  if (publishedAtMs > nowMs) {
    addReason(reasons, 'publication_future');
  } else if (nowMs - publishedAtMs >= CAPACITY_MAX_AGE_MS) {
    addReason(reasons, 'publication_stale');
  }
}

function validatePublisherAllowlist(
  value: unknown,
  publisherAgentId: unknown,
  reasons: Set<ComputeFleetNormalizationReason>
): void {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => !nonEmptyText(entry)) ||
    new Set(value).size !== value.length
  ) {
    addReason(reasons, 'publisher_allowlist_invalid');
    return;
  }
  if (typeof publisherAgentId !== 'string' || !value.includes(publisherAgentId)) {
    addReason(reasons, 'publisher_not_allowed');
  }
}

function validateResourceEligibility(
  value: unknown,
  nowMs: number,
  reasons: Set<ComputeFleetNormalizationReason>
): {
  capacityRef: string;
  provider: 'vast.ai';
  instanceId: number;
  validUntilMs: number;
} | null {
  if (!isRecord(value)) {
    addReason(reasons, 'resource_eligibility_invalid');
    return null;
  }
  const validUntilMs = canonicalTimestamp(value.validUntil);
  if (
    value.schemaVersion !== COMPUTE_FLEET_RESOURCE_ELIGIBILITY_SCHEMA_VERSION ||
    typeof value.capacityRef !== 'string' ||
    !SHA256_LABEL.test(value.capacityRef) ||
    value.provider !== 'vast.ai' ||
    !positiveInteger(value.instanceId) ||
    typeof value.eligible !== 'boolean' ||
    validUntilMs === null
  ) {
    addReason(reasons, 'resource_eligibility_invalid');
    return null;
  }
  if (!value.eligible) addReason(reasons, 'resource_ineligible');
  if (validUntilMs <= nowMs) addReason(reasons, 'resource_eligibility_expired');
  return {
    capacityRef: value.capacityRef,
    provider: value.provider,
    instanceId: value.instanceId,
    validUntilMs,
  };
}

function validateFleetInventory(
  snapshot: Record<string, unknown>,
  reasons: Set<ComputeFleetNormalizationReason>
): void {
  const summary = snapshot.summary;
  if (!isRecord(summary)) {
    addReason(reasons, 'fleet_inventory_invalid');
    return;
  }

  if (
    !positiveInteger(summary.running_count) ||
    !nonNegativeInteger(summary.declared_count) ||
    summary.orphaned_capacity_count !== 0 ||
    summary.orphan_count !== 0 ||
    summary.no_instance_count !== 0 ||
    !nonNegativeFinite(summary.total_cost_so_far_usd) ||
    !nonNegativeFinite(summary.total_dph_usd) ||
    !nonNegativeFinite(summary.projected_24h_cost_usd) ||
    !emptyArray(snapshot.orphans)
  ) {
    addReason(reasons, 'fleet_inventory_invalid');
  }
}

function validateVisibility(
  flow: Record<string, unknown>,
  reasons: Set<ComputeFleetNormalizationReason>
): void {
  const visibility = flow.visibility;
  if (
    !isRecord(visibility) ||
    visibility.complete !== true ||
    visibility.gap_count !== 0 ||
    !emptyArray(visibility.gaps) ||
    !emptyArray(visibility.duplicate_endpoint_bindings) ||
    visibility.invalid_manifest_count !== 0 ||
    !emptyArray(visibility.invalid_manifests) ||
    !Array.isArray(visibility.evidence_sources) ||
    visibility.evidence_sources.length === 0 ||
    visibility.evidence_sources.some((entry) => !nonEmptyText(entry))
  ) {
    addReason(reasons, 'visibility_incomplete');
  }
}

function validateSpendAccounting(
  flow: Record<string, unknown>,
  flowCapturedMs: number | null,
  nowMs: number,
  reasons: Set<ComputeFleetNormalizationReason>
): { observedAtMs: number | null; authorizationHeadroomMinorUnits: number | null } {
  const spend = flow.spend_accounting;
  if (!isRecord(spend)) {
    addReason(reasons, 'spend_accounting_invalid');
    return { observedAtMs: null, authorizationHeadroomMinorUnits: null };
  }

  const observedAtMs = canonicalTimestamp(spend.observed_at_utc);
  const monetaryGapsValid = emptyArray(spend.monetary_gap_reasons);
  const provenanceGapsValid = emptyArray(spend.provenance_gap_reasons);
  const vendorTotalUsd = nonNegativeFinite(spend.vendor_total_usd) ? spend.vendor_total_usd : null;
  const observedPurchasedComputeUsd = nonNegativeFinite(spend.observed_purchased_compute_usd)
    ? spend.observed_purchased_compute_usd
    : null;
  const capUsd = nonNegativeFinite(spend.cap_usd) ? spend.cap_usd : null;
  const signedHeadroomUsd = finiteNumber(spend.trusted_headroom_usd)
    ? spend.trusted_headroom_usd
    : null;
  const valuesPresent =
    vendorTotalUsd !== null &&
    observedPurchasedComputeUsd !== null &&
    capUsd !== null &&
    signedHeadroomUsd !== null;

  if (
    spend.schema_version !== VAST_SPEND_SCHEMA_VERSION ||
    spend.provider !== 'vast.ai' ||
    spend.status !== 'ok' ||
    spend.freshness_status !== 'fresh' ||
    spend.max_age_ms !== SPEND_MAX_AGE_MS ||
    spend.rail !== 'purchased_compute' ||
    spend.reset_window !== 'utc_day' ||
    spend.monetary_complete !== true ||
    !monetaryGapsValid ||
    spend.provenance_complete !== true ||
    !provenanceGapsValid ||
    spend.intentional_gap_captured !== false ||
    spend.cap_applicable !== true ||
    spend.no_paid_actions !== true ||
    !valuesPresent ||
    observedAtMs === null ||
    !nonNegativeInteger(spend.age_ms)
  ) {
    addReason(reasons, 'spend_accounting_invalid');
  }

  if (observedAtMs !== null) {
    if (
      observedAtMs > nowMs ||
      (flowCapturedMs !== null && observedAtMs > flowCapturedMs) ||
      (flowCapturedMs !== null &&
        nonNegativeInteger(spend.age_ms) &&
        Math.abs(spend.age_ms - (flowCapturedMs - observedAtMs)) > FLOW_CAPTURE_TOLERANCE_MS)
    ) {
      addReason(reasons, 'spend_accounting_invalid');
    }
    if (nowMs - observedAtMs > SPEND_MAX_AGE_MS) {
      addReason(reasons, 'spend_accounting_stale');
    }
  }

  let authorizationHeadroomMinorUnits: number | null = null;
  if (
    vendorTotalUsd !== null &&
    observedPurchasedComputeUsd !== null &&
    capUsd !== null &&
    signedHeadroomUsd !== null
  ) {
    // Conservative point-in-time admission bound only. A.GPU.007 must atomically
    // hold budget before execution; neither the signed nor recomputed value is a reservation.
    authorizationHeadroomMinorUnits = Math.floor(
      Math.max(
        0,
        Math.min(signedHeadroomUsd, capUsd - Math.max(vendorTotalUsd, observedPurchasedComputeUsd))
      ) * 100
    );
    if (
      observedPurchasedComputeUsd + MONEY_ARITHMETIC_TOLERANCE_USD < vendorTotalUsd ||
      Math.abs(observedPurchasedComputeUsd + signedHeadroomUsd - capUsd) >
        MONEY_ARITHMETIC_TOLERANCE_USD
    ) {
      addReason(reasons, 'spend_accounting_invalid');
    }
    if (
      spend.observed_admission_verdict !== 'under-cap' ||
      spend.trusted_admission_verdict !== 'under-cap' ||
      signedHeadroomUsd < 0
    ) {
      addReason(reasons, 'spend_cap_exceeded');
    }
  }

  return {
    observedAtMs,
    authorizationHeadroomMinorUnits,
  };
}

function selectVastResource(
  flow: Record<string, unknown>,
  selectedIdentity: unknown,
  reasons: Set<ComputeFleetNormalizationReason>
): SelectedVastResource | null {
  if (
    !isRecord(selectedIdentity) ||
    selectedIdentity.provider !== 'vast.ai' ||
    !positiveInteger(selectedIdentity.instanceId)
  ) {
    addReason(reasons, 'selected_resource_invalid');
    return null;
  }

  const utilized = flow.utilized;
  if (!isRecord(utilized) || !Array.isArray(utilized.resources)) {
    addReason(reasons, 'resource_inventory_invalid');
    return null;
  }
  const capacityBindings = Array.isArray(utilized.capacity_bindings)
    ? utilized.capacity_bindings
    : [];

  if (
    !nonNegativeInteger(utilized.instance_count) ||
    utilized.instance_count !== utilized.resources.length ||
    !nonNegativeInteger(utilized.active_compute_count) ||
    !nonNegativeInteger(utilized.retained_storage_count) ||
    !nonNegativeInteger(utilized.manifest_bound_instance_count) ||
    !nonNegativeInteger(utilized.unbound_instance_count) ||
    !nonNegativeInteger(utilized.capacity_binding_count) ||
    utilized.capacity_binding_count !== capacityBindings.length ||
    !nonNegativeFinite(utilized.effective_dph_usd) ||
    !nonNegativeFinite(utilized.projected_24h_usd) ||
    !Array.isArray(utilized.capacity_bindings)
  ) {
    addReason(reasons, 'resource_inventory_invalid');
  }

  const seen = new Set<number>();
  const matches: Record<string, unknown>[] = [];
  for (const rawResource of utilized.resources) {
    if (!isRecord(rawResource) || !positiveInteger(rawResource.instance_id)) {
      addReason(reasons, 'resource_inventory_invalid');
      continue;
    }
    if (seen.has(rawResource.instance_id)) {
      addReason(reasons, 'resource_inventory_invalid');
      if (rawResource.instance_id === selectedIdentity.instanceId) {
        addReason(reasons, 'selected_resource_ambiguous');
      }
    }
    seen.add(rawResource.instance_id);
    if (rawResource.instance_id === selectedIdentity.instanceId) matches.push(rawResource);
  }

  if (matches.length === 0) {
    addReason(reasons, 'selected_resource_not_found');
    return null;
  }
  if (matches.length !== 1) {
    addReason(reasons, 'selected_resource_ambiguous');
    return null;
  }

  const selectedBindings: Record<string, unknown>[] = [];
  let inventoryBindingsValid = Array.isArray(utilized.capacity_bindings);
  for (const entry of capacityBindings) {
    if (!isRecord(entry) || !positiveInteger(entry.instance_id)) {
      inventoryBindingsValid = false;
      continue;
    }
    if (entry.instance_id === selectedIdentity.instanceId) selectedBindings.push(entry);
  }
  const selectedBinding = selectedBindings.length === 1 ? selectedBindings[0] : null;
  if (
    !inventoryBindingsValid ||
    selectedBinding === null ||
    !nonEmptyText(selectedBinding.lane_id) ||
    selectedBinding.binding_kind !== ADMITTED_BINDING_KIND ||
    selectedBinding.capacity_state !== ADMITTED_CAPACITY_STATE
  ) {
    addReason(reasons, 'capacity_binding_invalid');
  }

  const resource = matches[0];
  if (resource.lifecycle_state !== 'running') {
    addReason(reasons, 'selected_resource_unavailable');
  }
  if (
    !nonEmptyText(resource.gpu_name) ||
    !positiveInteger(resource.num_gpus) ||
    !positiveFinite(resource.vram_gb) ||
    typeof resource.gpu_util_percent !== 'number' ||
    !Number.isFinite(resource.gpu_util_percent) ||
    resource.gpu_util_percent < 0 ||
    resource.gpu_util_percent > 100
  ) {
    addReason(reasons, 'selected_resource_not_gpu');
  }
  if (
    !positiveFinite(resource.effective_total_dph_usd) ||
    resource.effective_cost_mode !== 'compute_plus_storage'
  ) {
    addReason(reasons, 'resource_quote_invalid');
  }

  if (
    resource.lifecycle_state !== 'running' ||
    !nonEmptyText(resource.gpu_name) ||
    !positiveInteger(resource.num_gpus) ||
    !positiveFinite(resource.vram_gb) ||
    typeof resource.gpu_util_percent !== 'number' ||
    !Number.isFinite(resource.gpu_util_percent) ||
    resource.gpu_util_percent < 0 ||
    resource.gpu_util_percent > 100 ||
    !positiveFinite(resource.effective_total_dph_usd)
  ) {
    return null;
  }

  return {
    lifecycleState: resource.lifecycle_state,
    gpuName: resource.gpu_name,
    numGpus: resource.num_gpus,
    vramGb: resource.vram_gb,
    gpuUtilPercent: resource.gpu_util_percent,
    effectiveTotalDphUsd: resource.effective_total_dph_usd,
  };
}

function validateDataPolicy(
  value: unknown,
  capacityRef: string,
  requiredClassification: ComputeDataClassification,
  nowMs: number,
  reasons: Set<ComputeFleetNormalizationReason>
): { allowed: ComputeDataClassification[]; validUntilMs: number | null } {
  if (!isRecord(value)) {
    addReason(reasons, 'data_policy_invalid');
    return { allowed: [], validUntilMs: null };
  }

  const rawAllowed = value.allowedDataClassifications;
  const allowed = Array.isArray(rawAllowed)
    ? rawAllowed.filter(
        (entry): entry is ComputeDataClassification =>
          typeof entry === 'string' &&
          DATA_CLASSIFICATION_SET.has(entry as ComputeDataClassification)
      )
    : [];
  const uniqueAllowed = new Set(allowed);
  const validUntilMs = canonicalTimestamp(value.validUntil);

  if (
    value.schemaVersion !== COMPUTE_FLEET_DATA_POLICY_SCHEMA_VERSION ||
    value.capacityRef !== capacityRef ||
    !Array.isArray(rawAllowed) ||
    rawAllowed.length === 0 ||
    allowed.length !== rawAllowed.length ||
    uniqueAllowed.size !== rawAllowed.length ||
    validUntilMs === null ||
    validUntilMs <= nowMs
  ) {
    addReason(reasons, 'data_policy_invalid');
  }
  if (!uniqueAllowed.has(requiredClassification)) {
    addReason(reasons, 'data_classification_denied');
  }

  return {
    allowed: DATA_CLASSIFICATIONS.filter((entry) => uniqueAllowed.has(entry)),
    validUntilMs,
  };
}

function validSigner(value: unknown): value is ComputeEvidenceSigner {
  return (
    isRecord(value) &&
    nonEmptyText(value.issuer) &&
    nonEmptyText(value.keyId) &&
    typeof value.sign === 'function'
  );
}

/**
 * Convert a current, complete Vast fleet observation into capacity snapshot
 * builder input. Evidence or policy rejection is returned as stable reason
 * codes; this function does not throw for rejected input.
 */
export function normalizeComputeFleetCapacity(
  input: NormalizeComputeFleetCapacityInput
): ComputeFleetNormalizationResult {
  const reasons = new Set<ComputeFleetNormalizationReason>();
  const rawInput: unknown = input;
  if (!isRecord(rawInput)) {
    addReason(reasons, 'fleet_record_invalid');
    return failure(reasons);
  }

  const nowMs = canonicalTimestamp(rawInput.now);
  if (nowMs === null) {
    addReason(reasons, 'normalization_time_invalid');
    return failure(reasons);
  }

  const record = rawInput.record;
  if (!isRecord(record) || !validFleetRecordMetadata(record)) {
    addReason(reasons, 'fleet_record_invalid');
  }
  validateSourceAllowlist(
    rawInput.allowedSources,
    isRecord(record) ? record.source : undefined,
    reasons
  );
  validatePublisherAllowlist(
    rawInput.allowedPublisherAgentIds,
    isRecord(record) ? record.publishedByAgentId : undefined,
    reasons
  );
  const resourceEligibility = validateResourceEligibility(
    rawInput.resourceEligibility,
    nowMs,
    reasons
  );
  const rawEligibility = isRecord(rawInput.resourceEligibility)
    ? rawInput.resourceEligibility
    : null;
  const capacityRef = resourceEligibility?.capacityRef ?? rawEligibility?.capacityRef;
  if (typeof capacityRef !== 'string' || !SHA256_LABEL.test(capacityRef)) {
    addReason(reasons, 'capacity_ref_invalid');
  }
  const snapshot = isRecord(record) && isRecord(record.snapshot) ? record.snapshot : null;
  if (!snapshot) {
    addReason(reasons, 'snapshot_schema_invalid');
    return failure(reasons);
  }
  if (snapshot.schema_version !== FLEET_SNAPSHOT_SCHEMA_VERSION) {
    addReason(reasons, 'snapshot_schema_invalid');
  }

  const capturedAtMs = canonicalTimestamp(snapshot.captured_at);
  if (capturedAtMs === null) {
    addReason(reasons, 'snapshot_capture_invalid');
  } else {
    if (capturedAtMs > nowMs) addReason(reasons, 'snapshot_capture_future');
    if (nowMs - capturedAtMs >= CAPACITY_MAX_AGE_MS) {
      addReason(reasons, 'snapshot_capture_stale');
    }
  }
  validatePublicationTime(
    isRecord(record) ? record.publishedAt : undefined,
    capturedAtMs,
    nowMs,
    reasons
  );

  const summary = snapshot.summary;
  if (
    !isRecord(summary) ||
    canonicalTimestamp(summary.captured_at) === null ||
    summary.captured_at !== snapshot.captured_at
  ) {
    addReason(reasons, 'snapshot_capture_invalid');
  }

  const health = isRecord(record) && isRecord(record.health) ? record.health : null;
  if (!health || health.status !== 'ok') addReason(reasons, 'snapshot_health_not_ok');
  if (!health || !emptyArray(health.reasons)) {
    addReason(reasons, 'snapshot_health_reasons_present');
  }
  if (nonEmptyText(snapshot.error) || nonEmptyText(snapshot.warning)) {
    addReason(reasons, 'snapshot_operational_error');
  }
  validateFleetInventory(snapshot, reasons);

  const flow = isRecord(snapshot.resource_flow) ? snapshot.resource_flow : null;
  if (
    !flow ||
    flow.schema_version !== VAST_RESOURCE_FLOW_SCHEMA_VERSION ||
    flow.provider !== 'vast.ai'
  ) {
    addReason(reasons, 'resource_flow_invalid');
  }
  const flowCapturedMs = flow ? canonicalTimestamp(flow.captured_at) : null;
  if (
    flowCapturedMs === null ||
    capturedAtMs === null ||
    flow?.captured_at !== snapshot.captured_at ||
    flowCapturedMs > nowMs
  ) {
    addReason(reasons, 'resource_flow_capture_invalid');
  }

  let spendObservedAtMs: number | null = null;
  let authorizationHeadroomMinorUnits: number | null = null;
  let selectedResource: SelectedVastResource | null = null;
  if (flow) {
    validateVisibility(flow, reasons);
    const spend = validateSpendAccounting(flow, flowCapturedMs, nowMs, reasons);
    spendObservedAtMs = spend.observedAtMs;
    authorizationHeadroomMinorUnits = spend.authorizationHeadroomMinorUnits;
    selectedResource = selectVastResource(
      flow,
      resourceEligibility ?? rawInput.resourceEligibility,
      reasons
    );
  }

  const workUnit = rawInput.workUnit;
  let workUnitValid = false;
  try {
    workUnitValid = validateComputeWorkUnitContract(workUnit).valid;
  } catch {
    workUnitValid = false;
  }
  if (!workUnitValid || !isRecord(workUnit)) addReason(reasons, 'work_unit_invalid');

  const typedWorkUnit = workUnit as ComputeWorkUnitContract;
  const compute = workUnitValid ? typedWorkUnit.compute : null;
  if (
    compute &&
    (compute.policy.placement !== 'external_bridge_requested' ||
      !compute.policy.allowedAccelerators.includes('gpu'))
  ) {
    addReason(reasons, 'placement_incompatible');
  }

  const deadlineMs = compute?.budget.deadlineMs;
  if (!positiveInteger(deadlineMs)) addReason(reasons, 'runtime_unbounded');

  const requiredClassification = compute?.policy.dataClassification ?? 'restricted';
  const dataPolicy = validateDataPolicy(
    rawInput.dataPolicy,
    typeof capacityRef === 'string' ? capacityRef : '',
    requiredClassification,
    nowMs,
    reasons
  );

  const allocationCursor = rawInput.allocationCursor;
  let cursorValid = false;
  try {
    cursorValid = validateComputeCapacityAllocationCursor(allocationCursor).valid;
  } catch {
    cursorValid = false;
  }
  if (!cursorValid || !isRecord(allocationCursor)) {
    addReason(reasons, 'allocation_cursor_invalid');
  } else if (allocationCursor.capacityRef !== capacityRef) {
    addReason(reasons, 'allocation_capacity_mismatch');
  }

  if (!validSigner(rawInput.signer)) addReason(reasons, 'signer_invalid');

  const quoteExpiresAtMs = canonicalTimestamp(rawInput.quoteExpiresAt);
  if (quoteExpiresAtMs === null || quoteExpiresAtMs <= nowMs) {
    addReason(reasons, 'quote_expired');
  }

  let estimatedMinorUnits: number | null = null;
  if (selectedResource && positiveInteger(deadlineMs)) {
    estimatedMinorUnits = Math.ceil(
      (selectedResource.effectiveTotalDphUsd * deadlineMs * 100) / 3_600_000
    );
    if (!Number.isSafeInteger(estimatedMinorUnits) || estimatedMinorUnits <= 0) {
      estimatedMinorUnits = null;
      addReason(reasons, 'resource_quote_invalid');
    }
  }

  if (
    estimatedMinorUnits !== null &&
    compute &&
    estimatedMinorUnits > compute.budget.maxCostMinorUnits
  ) {
    addReason(reasons, 'budget_exceeded');
  }
  if (
    estimatedMinorUnits !== null &&
    (authorizationHeadroomMinorUnits === null ||
      estimatedMinorUnits > authorizationHeadroomMinorUnits)
  ) {
    addReason(reasons, 'spend_headroom_exceeded');
  }

  const evidenceDeadlineMs =
    capturedAtMs !== null &&
    spendObservedAtMs !== null &&
    quoteExpiresAtMs !== null &&
    dataPolicy.validUntilMs !== null &&
    resourceEligibility !== null
      ? Math.min(
          capturedAtMs + CAPACITY_MAX_AGE_MS,
          spendObservedAtMs + SPEND_MAX_AGE_MS,
          quoteExpiresAtMs,
          dataPolicy.validUntilMs,
          resourceEligibility.validUntilMs
        )
      : null;
  if (
    evidenceDeadlineMs === null ||
    capturedAtMs === null ||
    evidenceDeadlineMs <= nowMs ||
    evidenceDeadlineMs <= capturedAtMs
  ) {
    addReason(reasons, 'evidence_window_empty');
  }

  if (reasons.size > 0) return failure(reasons);

  const validCursor = allocationCursor as unknown as ComputeCapacityAllocationCursor;
  return {
    ok: true,
    capacityInput: {
      lane: 'managed_bridge',
      capacityRef: capacityRef as string,
      accelerator: 'gpu',
      health: 'ready',
      availableSlots: validCursor.slotState === 'available' ? 1 : 0,
      allowedDataClassifications: dataPolicy.allowed,
      observedAt: snapshot.captured_at as string,
      validUntil: new Date(evidenceDeadlineMs as number).toISOString(),
      estimatedCost: {
        measurementState: 'measured',
        currency: 'USD',
        estimatedMinorUnits: estimatedMinorUnits as number,
      },
      signer: rawInput.signer as ComputeEvidenceSigner,
    },
  };
}
