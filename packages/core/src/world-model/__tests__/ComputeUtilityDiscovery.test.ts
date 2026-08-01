import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  COMPUTE_WORK_UNIT_COMPILER_VERSION,
  buildComputeWorkUnit,
  computeWorkUnitDigest,
  type ComputeAccelerator,
  type ComputeWorkUnitContract,
  type ComputeWorkUnitSourceConfig,
} from '../../compiler/ComputeWorkUnitCompiler';
import {
  HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
  type PortableHardwareReceiptMetadata,
} from '../HardwareReceiptMetadata';
import {
  buildComputeExecutionReceipt,
  type ComputeExecutionCost,
  type ComputeExecutionPlacementOutcome,
  type ComputeExecutionReceipt,
  type ComputeExecutionTerminalStatus,
} from '../ComputeExecutionReceipt';
import {
  COMPUTE_UTILITY_MINIMUM_AGGREGATE,
  aggregateComputeUtilityObservations,
  buildComputeUtilityObservation,
  validateComputeUtilityAggregate,
  validateComputeUtilityObservation,
  type ComputeUtilityObservation,
} from '../ComputeUtilityDiscovery';

const SOURCE_DIGEST = 'a'.repeat(64);
const BASE_TIME = Date.parse('2026-08-01T12:00:00.000Z');
const PRIVATE_SENTINEL = 'PROPRIETARY_THERMAL_INTENT_7719';
const HARDWARE_SENTINEL = 'SECRET_GPU_SERIAL_8842';

function canonicalizeForTest(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalizeForTest);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalizeForTest(entry)])
  );
}

function rehashObservation(
  observation: Omit<ComputeUtilityObservation, 'observationId'>
): ComputeUtilityObservation {
  return {
    ...observation,
    observationId: `sha256:${createHash('sha256')
      .update(JSON.stringify(canonicalizeForTest(observation)))
      .digest('hex')}`,
  };
}

function workUnit(overrides: Partial<ComputeWorkUnitSourceConfig> = {}): ComputeWorkUnitContract {
  return buildComputeWorkUnit(
    {
      intent: 'Measure bounded thermal utility.',
      allowed_accelerators: ['gpu'],
      placement_policy: 'local_only',
      data_classification: 'confidential',
      quality_metric: 'max_abs_error',
      quality_operator: 'lte',
      quality_threshold: 1e-5,
      quality_reference: 'cpu_reference',
      deadline_ms: 60_000,
      budget_currency: 'USD',
      max_cost_minor_units: 0,
      allow_fallback: false,
      ...overrides,
    },
    {
      objectName: 'thermal-utility',
      sourceDigest: SOURCE_DIGEST,
      sourceDigestKind: 'source_utf8',
      compiler: 'ComputeWorkUnitCompiler',
      compilerVersion: COMPUTE_WORK_UNIT_COMPILER_VERSION,
    }
  );
}

interface ReceiptOptions {
  readonly startedOffsetMs?: number;
  readonly durationMs?: number;
  readonly placementOutcome?: ComputeExecutionPlacementOutcome;
  readonly actualAccelerator?: ComputeAccelerator;
  readonly fallbackUsed?: boolean;
  readonly fallbackReason?: string;
  readonly terminalStatus?: ComputeExecutionTerminalStatus;
  readonly observedValue?: number;
  readonly passed?: boolean;
  readonly cost?: ComputeExecutionCost;
  readonly workUnitDigest?: string;
  readonly qualityThreshold?: number;
  readonly hardwareSentinel?: string;
}

function hardware(
  unit: ComputeWorkUnitContract,
  accelerator: ComputeAccelerator,
  observedValue: number,
  completedAt: string,
  sentinel = 'Test GPU'
): PortableHardwareReceiptMetadata {
  return {
    schemaVersion: HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
    target: {
      id: 'private-compute-target',
      kind: 'compute-workload',
      architecture: 'private-architecture',
      artifactKind: 'webgpu-wgsl',
    },
    device: {
      vendor: sentinel,
      model: HARDWARE_SENTINEL,
      accelerator,
      deviceHash: `sha256:${'d'.repeat(64)}`,
    },
    runtime: {
      name: 'private-runtime',
      version: 'secret-version',
      hostOS: 'private-os',
    },
    compilerVersion: `ComputeWorkUnitCompiler@${COMPUTE_WORK_UNIT_COMPILER_VERSION}`,
    constraints: [
      {
        id: 'private-constraint',
        description: 'private constraint description',
        limit: 1e-5,
      },
    ],
    measuredResults: [
      {
        metric: 'max_abs_error',
        value: observedValue,
        unit: 'temperature-unit',
        method: 'private measurement method',
        sampleCount: 512,
        tolerance: 1e-5,
      },
      ...(accelerator === 'gpu'
        ? [
            {
              metric: 'gpu_execution_observed',
              value: 1,
              unit: 'boolean',
              method: 'instrumented dispatch',
              sampleCount: 1,
            },
          ]
        : []),
    ],
    replayInputs: [
      {
        kind: 'private-source',
        uri: 'private://source/never-export',
        sha256: 'e'.repeat(64),
      },
    ],
    provenance: {
      capturedAt: completedAt,
      sourceCompositionHash: unit.source_evidence,
    },
    owner: { agent: 'private-agent-id', team: 'private-tenant-id' },
  };
}

function receipt(
  unit: ComputeWorkUnitContract,
  options: ReceiptOptions = {}
): ComputeExecutionReceipt {
  const startedAt = new Date(BASE_TIME + (options.startedOffsetMs ?? 0)).toISOString();
  const completedAt = new Date(
    BASE_TIME + (options.startedOffsetMs ?? 0) + (options.durationMs ?? 50)
  ).toISOString();
  const actualAccelerator = options.actualAccelerator ?? 'gpu';
  const observedValue = options.observedValue ?? 0;
  const passed = options.passed ?? true;
  return buildComputeExecutionReceipt({
    workUnit: {
      digest: options.workUnitDigest ?? computeWorkUnitDigest(unit),
      sourceEvidence: unit.source_evidence,
    },
    placement: {
      planReceiptId: `sha256:${'1'.repeat(64)}`,
      capacityLeaseReceiptId: `sha256:${'2'.repeat(64)}`,
      outcome: options.placementOutcome ?? 'local_device',
    },
    execution: {
      actualAccelerator,
      fallbackAllowed: unit.compute.policy.allowFallback,
      fallbackUsed: options.fallbackUsed ?? false,
      ...(options.fallbackUsed
        ? { fallbackReason: options.fallbackReason ?? 'private fallback reason' }
        : {}),
      terminalStatus: options.terminalStatus ?? 'succeeded',
      startedAt,
      completedAt,
    },
    quality: {
      metric: unit.compute.quality.metric,
      operator: unit.compute.quality.operator,
      threshold: options.qualityThreshold ?? unit.compute.quality.threshold,
      reference: unit.compute.quality.reference,
      observedValue,
      passed,
    },
    cost: options.cost ?? { measurementState: 'not_measured', reason: 'not_applicable' },
    hardware: hardware(
      unit,
      actualAccelerator,
      observedValue,
      completedAt,
      options.hardwareSentinel
    ),
  });
}

function observation(
  unit: ComputeWorkUnitContract,
  executionReceipt: ComputeExecutionReceipt
): ComputeUtilityObservation {
  const result = buildComputeUtilityObservation({
    analyticsEnabled: true,
    consentGranted: true,
    workUnit: unit,
    executionReceipt,
  });
  expect(result.measurementState).toBe('measured');
  if (result.measurementState !== 'measured') throw new Error('expected measured observation');
  return result.observation;
}

describe('ComputeUtilityDiscovery', () => {
  it.each([
    [{}, 'analytics_unset'],
    [{ analyticsEnabled: false }, 'analytics_disabled'],
    [{ analyticsEnabled: true }, 'consent_unset'],
    [{ analyticsEnabled: true, consentGranted: false }, 'consent_denied'],
  ] as const)('keeps disabled or unset measurement explicit: %s', (flags, reason) => {
    const unit = workUnit();
    const result = buildComputeUtilityObservation({
      ...flags,
      workUnit: unit,
      executionReceipt: receipt(unit),
    });

    expect(result).toEqual({ measurementState: 'not_measured', reason });
    expect(JSON.stringify(result)).not.toContain('"count":0');
  });

  it('does not coerce non-boolean analytics or consent values into permission', () => {
    const unit = workUnit();
    const executionReceipt = receipt(unit);

    expect(
      buildComputeUtilityObservation({
        analyticsEnabled: 'true' as unknown as boolean,
        consentGranted: true,
        workUnit: unit,
        executionReceipt,
      })
    ).toEqual({ measurementState: 'not_measured', reason: 'analytics_disabled' });
    expect(
      buildComputeUtilityObservation({
        analyticsEnabled: true,
        consentGranted: 1 as unknown as boolean,
        workUnit: unit,
        executionReceipt,
      })
    ).toEqual({ measurementState: 'not_measured', reason: 'consent_denied' });
  });

  it.each([
    [
      99,
      { measurementState: 'not_measured', reason: 'not_applicable' },
      'lt_100ms',
      'not_measured',
    ],
    [
      100,
      { measurementState: 'measured', currency: 'USD', actualMinorUnits: 0 },
      '100ms_to_lt_1s',
      'zero',
    ],
    [
      1_000,
      { measurementState: 'measured', currency: 'USD', actualMinorUnits: 1 },
      '1s_to_lt_10s',
      'minor_1_10',
    ],
    [
      10_000,
      { measurementState: 'measured', currency: 'USD', actualMinorUnits: 11 },
      '10s_to_lt_60s',
      'minor_11_100',
    ],
    [
      60_000,
      { measurementState: 'measured', currency: 'USD', actualMinorUnits: 101 },
      '60s_plus',
      'minor_101_1000',
    ],
    [
      60_001,
      { measurementState: 'measured', currency: 'USD', actualMinorUnits: 1_001 },
      '60s_plus',
      'minor_1001_plus',
    ],
  ] as const)(
    'maps latency %s and cost to coarse buckets',
    (durationMs, cost, latency, costName) => {
      const unit = workUnit({
        placement_policy: 'owned_fleet',
        max_cost_minor_units: 10_000,
      });
      const utility = observation(
        unit,
        receipt(unit, { durationMs, cost, placementOutcome: 'owned_fleet' })
      );

      expect(utility.buckets).toMatchObject({ latency, cost: costName });
    }
  );

  it('uses ordered accelerator intent and records an authorized fallback bucket', () => {
    const unit = workUnit({
      allowed_accelerators: ['gpu', 'cpu'],
      placement_policy: 'owned_fleet',
      allow_fallback: true,
    });
    const utility = observation(
      unit,
      receipt(unit, {
        actualAccelerator: 'cpu',
        fallbackUsed: true,
        placementOutcome: 'owned_fleet',
      })
    );

    expect(utility.buckets).toMatchObject({
      requestedAccelerator: 'gpu',
      placementOutcome: 'owned_fleet',
      fallback: 'used_cpu',
    });
  });

  it('rejects unreported accelerator or placement fallback', () => {
    const acceleratorUnit = workUnit({
      allowed_accelerators: ['gpu', 'cpu'],
      allow_fallback: true,
    });
    expect(() =>
      observation(
        acceleratorUnit,
        receipt(acceleratorUnit, { actualAccelerator: 'cpu', fallbackUsed: false })
      )
    ).toThrow('deviated from the requested route without recording fallback');

    const placementUnit = workUnit({
      placement_policy: 'external_bridge_requested',
      allow_fallback: true,
    });
    expect(() =>
      observation(
        placementUnit,
        receipt(placementUnit, { placementOutcome: 'local_device', fallbackUsed: false })
      )
    ).toThrow('deviated from the requested route without recording fallback');
  });

  it('fails closed on WorkUnit, quality, placement, or budget mismatches', () => {
    const unit = workUnit({ placement_policy: 'owned_fleet', max_cost_minor_units: 10 });
    const flags = { analyticsEnabled: true, consentGranted: true, workUnit: unit } as const;

    expect(() =>
      buildComputeUtilityObservation({
        ...flags,
        executionReceipt: receipt(unit, { workUnitDigest: `sha256:${'f'.repeat(64)}` }),
      })
    ).toThrow('does not bind the supplied WorkUnit digest');
    expect(() =>
      buildComputeUtilityObservation({
        ...flags,
        executionReceipt: receipt(unit, {
          qualityThreshold: 1e-4,
          placementOutcome: 'owned_fleet',
        }),
      })
    ).toThrow('quality contract does not match');
    expect(() =>
      buildComputeUtilityObservation({
        ...flags,
        executionReceipt: receipt(unit, { placementOutcome: 'external_bridge' }),
      })
    ).toThrow('not allowed by owned_fleet policy');
    expect(() =>
      buildComputeUtilityObservation({
        ...flags,
        executionReceipt: receipt(unit, {
          placementOutcome: 'owned_fleet',
          cost: { measurementState: 'measured', currency: 'USD', actualMinorUnits: 11 },
        }),
      })
    ).toThrow('exceeds the supplied WorkUnit budget');
  });

  it('never serializes proprietary intent, source, hardware, owner, fallback reason, or raw values', () => {
    const unit = workUnit({
      intent: PRIVATE_SENTINEL,
      allowed_accelerators: ['gpu', 'cpu'],
      placement_policy: 'owned_fleet',
      allow_fallback: true,
      max_cost_minor_units: 500,
    });
    const utility = observation(
      unit,
      receipt(unit, {
        actualAccelerator: 'cpu',
        fallbackUsed: true,
        fallbackReason: 'PRIVATE_FALLBACK_REASON_991',
        placementOutcome: 'owned_fleet',
        durationMs: 12_345,
        cost: { measurementState: 'measured', currency: 'USD', actualMinorUnits: 321 },
        hardwareSentinel: HARDWARE_SENTINEL,
      })
    );
    const serialized = JSON.stringify(utility);

    for (const forbidden of [
      PRIVATE_SENTINEL,
      HARDWARE_SENTINEL,
      'PRIVATE_FALLBACK_REASON_991',
      'private://source/never-export',
      'private-agent-id',
      'private-tenant-id',
      '12345',
      '321',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('rejects raw or identifying fields and detects observation tampering', () => {
    const unit = workUnit();
    const valid = observation(unit, receipt(unit));
    const identified = { ...valid, userId: 'person-1', tenantId: 'tenant-1' };
    const raw = { ...valid, buckets: { ...valid.buckets, rawLatencyMs: 50 } };
    const tampered = { ...valid, buckets: { ...valid.buckets, latency: '60s_plus' } };

    expect(validateComputeUtilityObservation(identified).errors).toEqual(
      expect.arrayContaining([
        'observation.userId is not allowed',
        'observation.tenantId is not allowed',
      ])
    );
    expect(validateComputeUtilityObservation(raw).errors).toContain(
      'buckets.rawLatencyMs is not allowed'
    );
    expect(validateComputeUtilityObservation(tampered).errors).toContain(
      'observationId does not match canonical body'
    );
  });

  it('suppresses fewer than ten, deduplicates, and emits deterministic aggregate-only buckets', () => {
    const unit = workUnit();
    const observations = Array.from({ length: COMPUTE_UTILITY_MINIMUM_AGGREGATE }, (_, index) =>
      observation(unit, receipt(unit, { startedOffsetMs: index * 1_000 }))
    );

    expect(aggregateComputeUtilityObservations([])).toEqual({
      measurementState: 'not_measured',
      reason: 'no_observations',
    });
    expect(aggregateComputeUtilityObservations(observations.slice(0, 9))).toEqual({
      measurementState: 'measured_suppressed',
      reason: 'minimum_aggregate_not_met',
    });

    const forward = aggregateComputeUtilityObservations([
      ...observations,
      observations[0],
      observations[0],
    ]);
    const reverse = aggregateComputeUtilityObservations([...observations].reverse());
    expect(forward.measurementState).toBe('measured');
    expect(reverse.measurementState).toBe('measured');
    if (forward.measurementState !== 'measured' || reverse.measurementState !== 'measured') {
      throw new Error('expected measured aggregate');
    }
    expect(forward.aggregate).toEqual(reverse.aggregate);
    expect(forward.aggregate.buckets).toHaveLength(1);
    expect(forward.aggregate.buckets[0].count).toBe(COMPUTE_UTILITY_MINIMUM_AGGREGATE);
    const serialized = JSON.stringify(forward.aggregate);
    expect(serialized).not.toContain('workUnitDigest');
    expect(serialized).not.toContain('executionReceiptId');
    expect(validateComputeUtilityAggregate(forward.aggregate)).toEqual({ valid: true, errors: [] });
  });

  it('rejects conflicting observations for one execution receipt', () => {
    const unit = workUnit();
    const valid = observation(unit, receipt(unit));
    const { observationId: _observationId, ...body } = valid;
    const conflicting = rehashObservation({
      ...body,
      workUnitDigest: `sha256:${'f'.repeat(64)}`,
    });

    expect(validateComputeUtilityObservation(conflicting)).toEqual({ valid: true, errors: [] });
    expect(() => aggregateComputeUtilityObservations([valid, conflicting])).toThrow(
      'conflicting observations bind the same execution receipt'
    );
  });

  it('rejects identifying aggregate fields and tampered counts', () => {
    const unit = workUnit();
    const observations = Array.from({ length: COMPUTE_UTILITY_MINIMUM_AGGREGATE }, (_, index) =>
      observation(unit, receipt(unit, { startedOffsetMs: index * 1_000 }))
    );
    const result = aggregateComputeUtilityObservations(observations);
    if (result.measurementState !== 'measured') throw new Error('expected measured aggregate');
    const identified = { ...result.aggregate, tenantId: 'tenant-1' };
    const tampered = {
      ...result.aggregate,
      buckets: [{ ...result.aggregate.buckets[0], count: 11 }],
    };

    expect(validateComputeUtilityAggregate(identified).errors).toContain(
      'aggregate.tenantId is not allowed'
    );
    expect(validateComputeUtilityAggregate(tampered).errors).toContain(
      'aggregateId does not match canonical body'
    );
  });
});
