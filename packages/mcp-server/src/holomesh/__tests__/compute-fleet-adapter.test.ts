import { generateKeyPairSync, sign as signMessage } from 'crypto';
import {
  COMPUTE_WORK_UNIT_COMPILER_VERSION,
  buildComputeWorkUnit,
  type ComputePlacementPolicy,
  type ComputeWorkUnitContract,
} from '@holoscript/core/compiler';
import {
  buildComputeCapacitySnapshot,
  computeCapacityAllocationEtag,
  type ComputeCapacityAllocationCursor,
  type ComputeEvidenceSigner,
} from '@holoscript/core/world-model';
import { describe, expect, it } from 'vitest';
import {
  COMPUTE_FLEET_DATA_POLICY_SCHEMA_VERSION,
  COMPUTE_FLEET_RESOURCE_ELIGIBILITY_SCHEMA_VERSION,
  normalizeComputeFleetCapacity,
  type ComputeFleetNormalizationReason,
  type NormalizeComputeFleetCapacityInput,
} from '../compute-fleet-adapter';
import type { TeamFleetSnapshotRecord } from '../types';

const NOW = '2026-08-01T12:00:30.000Z';
const CAPTURED_AT = '2026-08-01T12:00:00.000Z';
const CAPACITY_REF = `sha256:${'c'.repeat(64)}`;
const LEASE_RECEIPT_ID = `sha256:${'d'.repeat(64)}`;
const INSTANCE_ID = 44_496_858;
const { privateKey } = generateKeyPairSync('ed25519');

const SIGNER: ComputeEvidenceSigner = {
  issuer: 'urn:holoscript:test:fleet-observer',
  keyId: 'test-fleet-observer-key',
  sign: (message) => signMessage(null, Buffer.from(message), privateKey).toString('base64'),
};

function workUnit(
  placement: ComputePlacementPolicy = 'external_bridge_requested'
): ComputeWorkUnitContract {
  return buildComputeWorkUnit(
    {
      intent: 'Run a bounded confidential GPU solve',
      allowed_accelerators: ['gpu', 'cpu'],
      placement_policy: placement,
      data_classification: 'confidential',
      quality_metric: 'max_abs_error',
      quality_operator: 'lte',
      quality_threshold: 0.00001,
      quality_reference: 'cpu_reference',
      deadline_ms: 60_000,
      budget_currency: 'USD',
      max_cost_minor_units: 100,
      allow_fallback: false,
    },
    {
      objectName: 'fleet-adapter-test',
      sourceDigest: 'a'.repeat(64),
      sourceDigestKind: 'source_utf8',
      compiler: 'ComputeWorkUnitCompiler',
      compilerVersion: COMPUTE_WORK_UNIT_COMPILER_VERSION,
    }
  );
}

function allocationCursor(slotState: 'available' | 'leased' = 'available') {
  const body: Omit<ComputeCapacityAllocationCursor, 'etag'> = {
    capacityRef: CAPACITY_REF,
    slotState,
    currentEpoch: 7,
    ...(slotState === 'leased' ? { currentLeaseReceiptId: LEASE_RECEIPT_ID } : {}),
    version: 11,
  };
  return { ...body, etag: computeCapacityAllocationEtag(body) };
}

function fleetRecord(): TeamFleetSnapshotRecord {
  return {
    source: 'fleet-status-live.mjs',
    publishedAt: '2026-08-01T12:00:01.000Z',
    publishedByAgentId: 'fleet-observer-1',
    publishedByName: 'Fleet Observer',
    health: {
      status: 'ok',
      reasons: [],
      ageMs: 30_000,
      staleAfterMs: 120_000,
    },
    snapshot: {
      schema_version: 'holomesh.fleet-snapshot/v2',
      captured_at: CAPTURED_AT,
      summary: {
        captured_at: CAPTURED_AT,
        running_count: 1,
        declared_count: 1,
        orphan_count: 0,
        orphaned_capacity_count: 0,
        no_instance_count: 0,
        total_cost_so_far_usd: 1,
        total_dph_usd: 0.6,
        projected_24h_cost_usd: 14.4,
      },
      matched: [],
      orphans: [],
      resource_flow: {
        schema_version: 'holomesh.vast-resource-flow/v1',
        provider: 'vast.ai',
        captured_at: CAPTURED_AT,
        spend_accounting: {
          schema_version: 'holomesh.vast-spend-accounting/v1',
          provider: 'vast.ai',
          status: 'ok',
          observed_at_utc: CAPTURED_AT,
          freshness_status: 'fresh',
          age_ms: 0,
          max_age_ms: 900_000,
          rail: 'purchased_compute',
          reset_window: 'utc_day',
          vendor_total_usd: 1,
          observed_purchased_compute_usd: 1,
          monetary_complete: true,
          monetary_gap_reasons: [],
          provenance_complete: true,
          provenance_gap_reasons: [],
          intentional_gap_captured: false,
          cap_applicable: true,
          cap_usd: 100,
          observed_admission_verdict: 'under-cap',
          trusted_admission_verdict: 'under-cap',
          trusted_headroom_usd: 99,
          no_paid_actions: true,
        },
        utilized: {
          instance_count: 1,
          active_compute_count: 1,
          retained_storage_count: 0,
          manifest_bound_instance_count: 1,
          unbound_instance_count: 0,
          capacity_binding_count: 1,
          effective_dph_usd: 0.6,
          projected_24h_usd: 14.4,
          resources: [
            {
              instance_id: INSTANCE_ID,
              resource_id: 'vast:instance:44496858',
              capacity_class: 'manifest_lane',
              lifecycle_state: 'running',
              gpu_name: 'RTX 4090',
              num_gpus: 4,
              vram_gb: 24,
              gpu_util_percent: 100,
              cpu_util_percent: 87,
              memory_usage_gb: 12,
              listed_compute_dph_usd: 0.5,
              listed_storage_dph_usd: 0.1,
              listed_total_dph_usd: 0.6,
              effective_compute_dph_usd: 0.5,
              effective_storage_dph_usd: 0.1,
              effective_total_dph_usd: 0.6,
              storage_dph_usd: 0.1,
              effective_dph_usd: 0.6,
              effective_cost_mode: 'compute_plus_storage',
            },
          ],
          capacity_bindings: [
            {
              instance_id: INSTANCE_ID,
              lane_id: 'gpu-lane-1',
              binding_kind: 'vast_endpoint',
              capacity_state: 'endpoint_active',
            },
          ],
        },
        produced: {
          output_aware_lane_count: 1,
          active_manifest_count: 1,
          output_contract_count: 1,
          bound_manifest_count: 1,
          unbound_manifest_count: 0,
          evidence_backed_output_count: 0,
          verified_product_count: 0,
          verified_artifact_count: 0,
          verified_receipt_count: 0,
          verified_current_binding_count: 0,
          declared_only_output_count: 1,
          unverified_evidence_output_count: 0,
          claimed_or_unverified_output_count: 1,
          productive_count: 0,
          work_in_progress_count: 1,
          inference_output_tokens: 0,
          active_manifests: [],
          output_contracts: [],
          declared_output_locations: [],
          claimed_or_declared_outputs: [],
          artifacts: [],
          receipts: [],
          product_verification_policy: 'artifact_and_receipt_sha256_match',
        },
        stored: {
          instance_volume_count: 1,
          total_capacity_gb: 40,
          total_used_gb: 1,
          projected_storage_24h_usd: 2.4,
          volumes: [],
          locally_present_output_location_count: 0,
          verified_artifact_location_count: 0,
          verified_receipt_location_count: 0,
          evidence_backed_output_location_count: 0,
          artifact_locations: [],
          receipt_locations: [],
        },
        consumed: {
          consumer_count: 1,
          manifest_attributed_count: 1,
          current_physical_consumer_count: 1,
          declared_or_historical_manifest_consumer_count: 1,
          bound_manifest_consumer_count: 1,
          unbound_manifest_consumer_count: 0,
          runtime_requests: 0,
          compute_bearing_requests: 0,
          runtime_metrics_age_ms: null,
          runtime_providers: [],
          runtime_endpoints: [],
          consumers: [],
          current_physical_consumers: [],
          declared_or_historical_manifest_consumers: [],
        },
        visibility: {
          complete: true,
          gap_count: 0,
          gaps: [],
          duplicate_endpoint_bindings: [],
          invalid_manifest_count: 0,
          invalid_manifests: [],
          evidence_sources: ['vastai show instances --raw'],
        },
      },
    },
  };
}

function validInput(): NormalizeComputeFleetCapacityInput {
  return {
    record: fleetRecord(),
    allowedSources: ['fleet-status-live.mjs'],
    allowedPublisherAgentIds: ['fleet-observer-1'],
    resourceEligibility: {
      schemaVersion: COMPUTE_FLEET_RESOURCE_ELIGIBILITY_SCHEMA_VERSION,
      capacityRef: CAPACITY_REF,
      provider: 'vast.ai',
      instanceId: INSTANCE_ID,
      eligible: true,
      validUntil: '2026-08-01T12:05:00.000Z',
    },
    workUnit: workUnit(),
    dataPolicy: {
      schemaVersion: COMPUTE_FLEET_DATA_POLICY_SCHEMA_VERSION,
      capacityRef: CAPACITY_REF,
      allowedDataClassifications: ['public', 'internal', 'confidential'],
      validUntil: '2026-08-01T12:05:00.000Z',
    },
    allocationCursor: allocationCursor(),
    signer: SIGNER,
    now: NOW,
    quoteExpiresAt: '2026-08-01T12:01:00.000Z',
  };
}

function mutable(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('test fixture value is not a record');
  }
  return value as Record<string, unknown>;
}

function flow(input: NormalizeComputeFleetCapacityInput): Record<string, unknown> {
  return mutable(input.record.snapshot.resource_flow);
}

function spend(input: NormalizeComputeFleetCapacityInput): Record<string, unknown> {
  return mutable(flow(input).spend_accounting);
}

function utilized(input: NormalizeComputeFleetCapacityInput): Record<string, unknown> {
  return mutable(flow(input).utilized);
}

function resource(input: NormalizeComputeFleetCapacityInput): Record<string, unknown> {
  return mutable((utilized(input).resources as unknown[])[0]);
}

function capacityBinding(input: NormalizeComputeFleetCapacityInput): Record<string, unknown> {
  return mutable((utilized(input).capacity_bindings as unknown[])[0]);
}

function expectReason(
  mutate: (input: NormalizeComputeFleetCapacityInput) => void,
  reason: ComputeFleetNormalizationReason
): void {
  const input = validInput();
  mutate(input);
  const result = normalizeComputeFleetCapacity(input);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reasonCodes).toContain(reason);
}

function setCapturedAt(input: NormalizeComputeFleetCapacityInput, capturedAt: string): void {
  input.record.snapshot.captured_at = capturedAt;
  if (input.record.snapshot.summary) input.record.snapshot.summary.captured_at = capturedAt;
  if (input.record.snapshot.resource_flow) {
    input.record.snapshot.resource_flow.captured_at = capturedAt;
    input.record.snapshot.resource_flow.spend_accounting.observed_at_utc = capturedAt;
    input.record.snapshot.resource_flow.spend_accounting.age_ms = 0;
  }
}

describe('normalizeComputeFleetCapacity', () => {
  it('emits provider-neutral managed-bridge input accepted by the sovereign builder', () => {
    const result = normalizeComputeFleetCapacity(validInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capacityInput).toEqual(
      expect.objectContaining({
        lane: 'managed_bridge',
        capacityRef: CAPACITY_REF,
        accelerator: 'gpu',
        health: 'ready',
        availableSlots: 1,
        allowedDataClassifications: ['public', 'internal', 'confidential'],
        observedAt: CAPTURED_AT,
        validUntil: '2026-08-01T12:01:00.000Z',
        estimatedCost: {
          measurementState: 'measured',
          currency: 'USD',
          estimatedMinorUnits: 1,
        },
      })
    );
    expect(Object.keys(result.capacityInput).sort()).toEqual(
      [
        'accelerator',
        'allowedDataClassifications',
        'availableSlots',
        'capacityRef',
        'estimatedCost',
        'health',
        'lane',
        'observedAt',
        'signer',
        'validUntil',
      ].sort()
    );
    expect(JSON.stringify(result.capacityInput)).not.toContain('vast.ai');
    expect(JSON.stringify(result.capacityInput)).not.toContain('RTX 4090');
    expect(JSON.stringify(result.capacityInput)).not.toContain('gpu-lane-1');
    expect(JSON.stringify(result.capacityInput)).not.toContain('vast_endpoint');
    expect(JSON.stringify(result.capacityInput)).not.toContain(String(INSTANCE_ID));
    expect(() => buildComputeCapacitySnapshot(result.capacityInput)).not.toThrow();
  });

  it('uses only the durable cursor for availability and keeps multi-GPU as one slot', () => {
    const available = validInput();
    resource(available).gpu_util_percent = 100;
    resource(available).num_gpus = 8;
    const availableResult = normalizeComputeFleetCapacity(available);
    expect(availableResult.ok && availableResult.capacityInput.availableSlots).toBe(1);

    const leased = validInput();
    resource(leased).gpu_util_percent = 0;
    mutable(leased).allocationCursor = allocationCursor('leased');
    const leasedResult = normalizeComputeFleetCapacity(leased);
    expect(leasedResult.ok && leasedResult.capacityInput.availableSlots).toBe(0);
  });

  it('rejects legacy/wrong flow schemas without throwing', () => {
    expectReason((input) => {
      input.record.snapshot.schema_version = 'holomesh.fleet-snapshot/v1';
    }, 'snapshot_schema_invalid');
    expectReason((input) => {
      mutable(input.record.snapshot.resource_flow).schema_version =
        'holomesh.vast-resource-flow/v0';
    }, 'resource_flow_invalid');
    expect(() =>
      normalizeComputeFleetCapacity(undefined as unknown as NormalizeComputeFleetCapacityInput)
    ).not.toThrow();
  });

  it('treats only an explicitly allowlisted publisher identity as authority', () => {
    expectReason((input) => {
      input.record.publishedByAgentId = 'unapproved-fleet-observer';
    }, 'publisher_not_allowed');
    expectReason((input) => {
      mutable(input).allowedPublisherAgentIds = [];
    }, 'publisher_allowlist_invalid');
  });

  it('treats only an explicitly server-allowlisted producer source as authority', () => {
    expectReason((input) => {
      input.record.source = 'lookalike-fleet-status-live.mjs';
    }, 'source_not_allowed');
    expectReason((input) => {
      mutable(input).allowedSources = [];
    }, 'source_allowlist_invalid');
    expectReason((input) => {
      mutable(input).allowedSources = ['fleet-status-live.mjs', 'fleet-status-live.mjs'];
    }, 'source_allowlist_invalid');
  });

  it('binds publication time to capture, current time, and the strict freshness window', () => {
    expectReason((input) => {
      input.record.publishedAt = '2026-08-01T11:59:59.999Z';
    }, 'publication_before_capture');
    expectReason((input) => {
      input.record.publishedAt = '2026-08-01T11:59:30.000Z';
    }, 'publication_stale');
    expectReason((input) => {
      input.record.publishedAt = '2026-08-01T12:00:30.001Z';
    }, 'publication_future');
    expectReason((input) => {
      input.record.publishedAt = '2026-08-01T12:00:01Z';
    }, 'publication_timestamp_invalid');
  });

  it('enforces a strictly sub-minute, non-future capture', () => {
    expectReason(
      (input) => setCapturedAt(input, '2026-08-01T11:59:30.000Z'),
      'snapshot_capture_stale'
    );
    expectReason(
      (input) => setCapturedAt(input, '2026-08-01T12:00:30.001Z'),
      'snapshot_capture_future'
    );
  });

  it('rejects degraded health, operational warnings, and unmanaged inventory', () => {
    expectReason((input) => {
      input.record.health.status = 'degraded';
    }, 'snapshot_health_not_ok');
    expectReason((input) => {
      input.record.health.reasons.push('collector_partial');
    }, 'snapshot_health_reasons_present');
    expectReason((input) => {
      input.record.snapshot.warning = 'partial collector output';
    }, 'snapshot_operational_error');
    expectReason((input) => {
      if (input.record.snapshot.summary) input.record.snapshot.summary.orphan_count = 1;
    }, 'fleet_inventory_invalid');
    expectReason((input) => {
      if (input.record.snapshot.summary) input.record.snapshot.summary.no_instance_count = 1;
    }, 'fleet_inventory_invalid');
  });

  it('requires visibility with no gaps, duplicates, or invalid manifests', () => {
    expectReason((input) => {
      const visibility = mutable(flow(input).visibility);
      visibility.complete = false;
      visibility.gap_count = 1;
      visibility.gaps = ['collector_gap'];
    }, 'visibility_incomplete');
    expectReason((input) => {
      mutable(flow(input).visibility).duplicate_endpoint_bindings = ['gpu-lane-1'];
    }, 'visibility_incomplete');
    expectReason((input) => {
      const visibility = mutable(flow(input).visibility);
      visibility.invalid_manifest_count = 1;
      visibility.invalid_manifests = ['gpu-lane-1'];
    }, 'visibility_incomplete');
  });

  it('requires fresh, complete, coherent, under-cap spend evidence', () => {
    expectReason((input) => {
      spend(input).provenance_complete = false;
      spend(input).provenance_gap_reasons = ['missing_vendor_receipt'];
    }, 'spend_accounting_invalid');
    expectReason((input) => {
      spend(input).observed_at_utc = '2026-08-01T11:44:29.999Z';
      spend(input).age_ms = 960_001;
    }, 'spend_accounting_stale');
    expectReason((input) => {
      spend(input).observed_purchased_compute_usd = 101;
      spend(input).cap_usd = 100;
      spend(input).trusted_headroom_usd = -1;
      spend(input).observed_admission_verdict = 'cap-exceeded';
      spend(input).trusted_admission_verdict = 'cap-exceeded';
    }, 'spend_cap_exceeded');
    expectReason((input) => {
      spend(input).trusted_headroom_usd = 98;
    }, 'spend_accounting_invalid');

    const nearCentExploit = validInput();
    spend(nearCentExploit).vendor_total_usd = 99.999999;
    spend(nearCentExploit).observed_purchased_compute_usd = 99.999999;
    spend(nearCentExploit).cap_usd = 100;
    spend(nearCentExploit).trusted_headroom_usd = 0.01;
    const exploitResult = normalizeComputeFleetCapacity(nearCentExploit);
    expect(exploitResult.ok).toBe(false);
    if (!exploitResult.ok) {
      expect(exploitResult.reasonCodes).toContain('spend_accounting_invalid');
      expect(exploitResult.reasonCodes).toContain('spend_headroom_exceeded');
    }
  });

  it('does not let coherence tolerance grant a full minor unit of spend authority', () => {
    const input = validInput();
    const spendAccounting = spend(input);
    const vendorTotalUsd = 99.9900001;
    const observedPurchasedComputeUsd = 99.9899992;
    const capUsd = 100;
    spendAccounting.vendor_total_usd = vendorTotalUsd;
    spendAccounting.observed_purchased_compute_usd = observedPurchasedComputeUsd;
    spendAccounting.cap_usd = capUsd;
    spendAccounting.trusted_headroom_usd = capUsd - observedPurchasedComputeUsd;

    const result = normalizeComputeFleetCapacity(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCodes).toContain('spend_headroom_exceeded');
      expect(result.reasonCodes).not.toContain('spend_accounting_invalid');
    }
  });

  it('requires a unique running GPU with a bounded effective quote', () => {
    expectReason((input) => {
      mutable(input.resourceEligibility).instanceId = 123;
    }, 'selected_resource_not_found');
    expectReason((input) => {
      const resources = utilized(input).resources as unknown[];
      resources.push({ ...resource(input) });
      utilized(input).instance_count = 2;
    }, 'selected_resource_ambiguous');
    expectReason((input) => {
      resource(input).lifecycle_state = 'stopped';
    }, 'selected_resource_unavailable');
    expectReason((input) => {
      resource(input).num_gpus = 0;
    }, 'selected_resource_not_gpu');
    expectReason((input) => {
      resource(input).effective_total_dph_usd = 0;
    }, 'resource_quote_invalid');
  });

  it('requires exactly one canonical Vast endpoint binding for the eligible instance', () => {
    expectReason((input) => {
      capacityBinding(input).instance_id = 123;
    }, 'capacity_binding_invalid');
    expectReason((input) => {
      const bindings = utilized(input).capacity_bindings as unknown[];
      bindings.push({ ...capacityBinding(input) });
      utilized(input).capacity_binding_count = 2;
    }, 'capacity_binding_invalid');
  });

  it.each([
    'fill-order',
    'gpu-name',
    'lane-label',
    'label-binding',
    'policy-preferred',
    'policy-fallback',
    'attached_manifest',
    'lane_manifest',
    'endpoint-binding',
  ])('rejects non-canonical binding kind %s', (bindingKind) => {
    expectReason((input) => {
      capacityBinding(input).binding_kind = bindingKind;
    }, 'capacity_binding_invalid');
  });

  it('binds explicit data policy and the durable cursor to the supplied capacity ref', () => {
    expectReason((input) => {
      mutable(input.resourceEligibility).eligible = false;
    }, 'resource_ineligible');
    expectReason((input) => {
      mutable(input.resourceEligibility).validUntil = NOW;
    }, 'resource_eligibility_expired');
    expectReason((input) => {
      mutable(input.dataPolicy).allowedDataClassifications = ['public'];
    }, 'data_classification_denied');
    expectReason((input) => {
      mutable(input.dataPolicy).capacityRef = `sha256:${'e'.repeat(64)}`;
    }, 'data_policy_invalid');
    expectReason((input) => {
      mutable(input.resourceEligibility).capacityRef = `sha256:${'e'.repeat(64)}`;
    }, 'allocation_capacity_mismatch');
    expectReason((input) => {
      mutable(input.allocationCursor).capacityRef = `sha256:${'e'.repeat(64)}`;
    }, 'allocation_cursor_invalid');
    expectReason((input) => {
      mutable(input.allocationCursor).etag = `sha256:${'0'.repeat(64)}`;
    }, 'allocation_cursor_invalid');
    expectReason((input) => {
      const otherRef = `sha256:${'f'.repeat(64)}`;
      const body: Omit<ComputeCapacityAllocationCursor, 'etag'> = {
        capacityRef: otherRef,
        slotState: 'available',
        currentEpoch: 7,
        version: 11,
      };
      mutable(input).allocationCursor = {
        ...body,
        etag: computeCapacityAllocationEtag(body),
      };
    }, 'allocation_capacity_mismatch');
  });

  it('enforces bridge placement, runtime, work-unit budget, headroom, and quote expiry', () => {
    expectReason((input) => {
      mutable(input).workUnit = workUnit('owned_fleet');
    }, 'placement_incompatible');
    expectReason((input) => {
      mutable(mutable(input.workUnit.compute).budget).deadlineMs = 0;
    }, 'runtime_unbounded');
    expectReason((input) => {
      mutable(mutable(input.workUnit.compute).budget).maxCostMinorUnits = 0;
    }, 'budget_exceeded');
    expectReason((input) => {
      spend(input).cap_usd = 1.009;
      spend(input).trusted_headroom_usd = 0.009;
    }, 'spend_headroom_exceeded');
    expectReason((input) => {
      mutable(input).quoteExpiresAt = NOW;
    }, 'quote_expired');
  });
});
