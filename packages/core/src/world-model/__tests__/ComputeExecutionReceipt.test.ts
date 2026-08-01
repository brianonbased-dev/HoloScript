import { describe, expect, it } from 'vitest';
import {
  COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION,
  buildComputeExecutionReceipt,
  validateComputeExecutionReceipt,
  type BuildComputeExecutionReceiptInput,
} from '../ComputeExecutionReceipt';
import {
  HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
  type PortableHardwareReceiptMetadata,
} from '../HardwareReceiptMetadata';

const SOURCE_EVIDENCE = `sha256:${'a'.repeat(64)}`;

function hardware(): PortableHardwareReceiptMetadata {
  return {
    schemaVersion: HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
    target: {
      id: 'thermal-explicit-tracer',
      kind: 'compute-workload',
      architecture: 'regular-grid-3d',
      artifactKind: 'webgpu-wgsl',
    },
    device: {
      vendor: 'Example',
      model: 'Test GPU',
      accelerator: 'gpu',
    },
    runtime: {
      name: 'WebGPU',
      version: 'test',
      hostOS: 'test-os',
    },
    compilerVersion: '1.0.0',
    constraints: [
      {
        id: 'max-abs-error',
        description: 'GPU output must match the CPU reference.',
        limit: 1e-5,
      },
    ],
    measuredResults: [
      {
        metric: 'max_abs_error',
        value: 0,
        unit: 'temperature-unit',
        method: 'cellwise CPU reference comparison',
        sampleCount: 512,
        tolerance: 1e-5,
      },
      {
        metric: 'gpu_execution_observed',
        value: 1,
        unit: 'boolean',
        method: 'instrumented solver dispatch',
        sampleCount: 20,
      },
    ],
    replayInputs: [
      {
        kind: 'composition',
        uri: 'holoscript://tests/thermal-explicit-tracer',
        sha256: 'b'.repeat(64),
      },
    ],
    provenance: {
      capturedAt: '2026-08-01T10:00:00.000Z',
      sourceCompositionHash: SOURCE_EVIDENCE,
      commit: 'abc1234',
    },
    owner: { agent: 'codex-hardware', team: 'HoloMesh' },
  };
}

function input(): BuildComputeExecutionReceiptInput {
  return {
    workUnit: {
      digest: `sha256:${'c'.repeat(64)}`,
      sourceEvidence: SOURCE_EVIDENCE,
    },
    placement: {
      planReceiptId: 'fixture:local-placement-plan',
      capacityLeaseReceiptId: 'fixture:exclusive-device-lease',
      outcome: 'local_device',
    },
    execution: {
      actualAccelerator: 'gpu',
      fallbackAllowed: false,
      fallbackUsed: false,
      terminalStatus: 'succeeded',
      startedAt: '2026-08-01T10:00:00.000Z',
      completedAt: '2026-08-01T10:00:00.125Z',
    },
    quality: {
      metric: 'max_abs_error',
      operator: 'lte',
      threshold: 1e-5,
      reference: 'cpu_reference',
      observedValue: 0,
      passed: true,
    },
    cost: { measurementState: 'not_measured', reason: 'not_applicable' },
    hardware: hardware(),
  };
}

describe('ComputeExecutionReceipt', () => {
  it('builds a canonical terminal receipt bound to WorkUnit and hardware evidence', () => {
    const receipt = buildComputeExecutionReceipt(input());

    expect(receipt.schemaVersion).toBe(COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION);
    expect(receipt.verificationScope).toBe('structural_only');
    expect(receipt.receiptId).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(receipt.execution.durationMs).toBe(125);
    expect(validateComputeExecutionReceipt(receipt)).toEqual({ valid: true, errors: [] });
    expect(buildComputeExecutionReceipt(input()).receiptId).toBe(receipt.receiptId);
  });

  it('rejects a changed outcome even when the old receipt id is retained', () => {
    const receipt = buildComputeExecutionReceipt(input());
    const tampered = {
      ...receipt,
      quality: { ...receipt.quality, observedValue: 0.5, passed: false },
    };

    expect(validateComputeExecutionReceipt(tampered).errors).toEqual(
      expect.arrayContaining([
        'a succeeded receipt requires passing quality evidence',
        'hardware measurements must include the quality observation',
        'receiptId does not match the canonical body',
      ])
    );
  });

  it('rejects quality pass flags that do not match the authored comparison', () => {
    const receipt = buildComputeExecutionReceipt(input());
    const tampered = { ...receipt, quality: { ...receipt.quality, passed: false } };

    expect(validateComputeExecutionReceipt(tampered).errors).toContain(
      'quality.passed must match the observed comparison'
    );
  });

  it('rejects hardware provenance that does not bind source evidence', () => {
    const valid = input();
    const invalid = {
      ...valid,
      hardware: {
        ...valid.hardware,
        provenance: {
          ...valid.hardware.provenance,
          sourceCompositionHash: `sha256:${'d'.repeat(64)}`,
        },
      },
    };

    expect(() => buildComputeExecutionReceipt(invalid)).toThrow(
      'hardware provenance must bind workUnit.sourceEvidence'
    );
  });

  it('rejects a succeeded execution that used a forbidden fallback', () => {
    const valid = input();
    const invalid = {
      ...valid,
      execution: {
        ...valid.execution,
        fallbackUsed: true,
        fallbackReason: 'GPU unavailable',
        actualAccelerator: 'cpu' as const,
      },
    };

    expect(() => buildComputeExecutionReceipt(invalid)).toThrow(
      'a forbidden fallback cannot produce a succeeded receipt'
    );
  });

  it('rejects an execution accelerator that disagrees with its hardware evidence', () => {
    const valid = input();
    const invalid = {
      ...valid,
      hardware: {
        ...valid.hardware,
        device: { ...valid.hardware.device, accelerator: 'cpu' },
      },
    };

    expect(() => buildComputeExecutionReceipt(invalid)).toThrow(
      'hardware accelerator must match execution.actualAccelerator'
    );
  });

  it('rejects a GPU execution without an observed GPU dispatch measurement', () => {
    const valid = input();
    const invalid = {
      ...valid,
      hardware: {
        ...valid.hardware,
        measuredResults: valid.hardware.measuredResults.filter(
          (measurement) => measurement.metric !== 'gpu_execution_observed'
        ),
      },
    };

    expect(() => buildComputeExecutionReceipt(invalid)).toThrow(
      'GPU execution requires gpu_execution_observed=1 hardware evidence'
    );
  });

  it('keeps unknown cost distinct from a measured zero', () => {
    const unknown = buildComputeExecutionReceipt(input());
    const measuredZero = buildComputeExecutionReceipt({
      ...input(),
      cost: { measurementState: 'measured', currency: 'USD', actualMinorUnits: 0 },
    });

    expect(unknown.cost).toEqual({ measurementState: 'not_measured', reason: 'not_applicable' });
    expect(measuredZero.cost).toEqual({
      measurementState: 'measured',
      currency: 'USD',
      actualMinorUnits: 0,
    });
    expect(measuredZero.receiptId).not.toBe(unknown.receiptId);
  });
});
