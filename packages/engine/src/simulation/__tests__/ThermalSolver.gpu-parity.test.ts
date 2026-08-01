import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  COMPUTE_WORK_UNIT_COMPILER_VERSION,
  compileComputeWorkUnits,
  computeWorkUnitDigest,
  validateComputeWorkUnitContract,
} from '@holoscript/core/compiler';
import {
  HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
  buildComputeExecutionReceipt,
  validateComputeExecutionReceipt,
} from '@holoscript/core/world-model';
import { ThermalSolver, type ThermalConfig } from '../ThermalSolver';

const REQUIRE_LIVE_GPU = process.env.HOLOSCRIPT_REQUIRE_LIVE_GPU === '1';
const STEPS = 20;
const MAX_ABS_TOLERANCE = 1e-5;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function thermalConfig(useGPU: boolean): ThermalConfig {
  return {
    gridResolution: [8, 8, 8],
    domainSize: [8, 8, 8],
    timeStep: 0.01,
    materials: {},
    defaultMaterial: 'air',
    initialTemperature: 20,
    useGPU,
    requireGPU: useGPU,
    boundaryConditions: [
      { type: 'dirichlet', faces: ['x-'], value: 100 },
      { type: 'dirichlet', faces: ['x+'], value: 0 },
      { type: 'dirichlet', faces: ['y-', 'y+', 'z-', 'z+'], value: 20 },
    ],
    sources: [
      {
        id: 'center-heater',
        type: 'volume',
        position: [4, 4, 4],
        radius: 1,
        heat_output: 5_000,
      },
    ],
  };
}

describe.skipIf(!REQUIRE_LIVE_GPU)('ThermalSolver live GPU parity', () => {
  it('executes on GPU, matches CPU, emits a bound receipt, and releases its device', async () => {
    const source = `
      composition "ThermalGpuTracer" {
        object "ThermalStep" @compute {
          intent: "Advance the thermal field with a live GPU and compare every cell to CPU.",
          allowed_accelerators: ["gpu"],
          placement_policy: "local_only",
          data_classification: "internal",
          quality_metric: "max_abs_error",
          quality_operator: "lte",
          quality_threshold: 0.00001,
          quality_reference: "cpu_reference",
          deadline_ms: 0,
          budget_currency: "USD",
          max_cost_minor_units: 0,
          allow_fallback: false
        } {}
      }
    `;
    const { parseHoloStrict } = await import('@holoscript/core/parser');
    const composition = parseHoloStrict(source);
    const [{ workUnit }] = compileComputeWorkUnits(composition, { sourceText: source });
    expect(validateComputeWorkUnitContract(workUnit)).toEqual({ valid: true, errors: [] });

    const cpu = new ThermalSolver(thermalConfig(false));
    const gpu = new ThermalSolver(thermalConfig(true));
    const startedAt = new Date().toISOString();

    let maxAbsError = 0;
    let rmsError = 0;
    try {
      for (let step = 0; step < STEPS; step++) {
        cpu.step(0.01);
        await gpu.stepAsync(0.01);
        expect(gpu.getStats().usedGPU, `step ${step + 1} fell back to CPU`).toBe(true);
      }

      const cpuField = cpu.getTemperatureField();
      const gpuField = gpu.getTemperatureField();
      let squaredError = 0;
      for (let index = 0; index < cpuField.length; index++) {
        const error = Math.abs(cpuField[index] - gpuField[index]);
        maxAbsError = Math.max(maxAbsError, error);
        squaredError += error * error;
      }
      rmsError = Math.sqrt(squaredError / cpuField.length);

      expect(maxAbsError).toBeLessThanOrEqual(MAX_ABS_TOLERANCE);
      expect(rmsError).toBeLessThanOrEqual(MAX_ABS_TOLERANCE);

      const adapterInfo = gpu.getGPUAdapterIdentity();
      expect(adapterInfo).not.toBeNull();
      const hasAdapterIdentity = Object.values(adapterInfo ?? {}).some(
        (value) => typeof value === 'string' && value.length > 0
      );
      const completedAt = new Date().toISOString();
      const receipt = buildComputeExecutionReceipt({
        workUnit: {
          digest: computeWorkUnitDigest(workUnit),
          sourceEvidence: workUnit.source_evidence,
        },
        placement: {
          planReceiptId: 'fixture:local-only-placement-plan',
          capacityLeaseReceiptId: 'fixture:exclusive-test-device-lease',
          outcome: 'local_device',
        },
        execution: {
          actualAccelerator: 'gpu',
          fallbackAllowed: false,
          fallbackUsed: false,
          terminalStatus: 'succeeded',
          startedAt,
          completedAt,
        },
        quality: {
          metric: 'max_abs_error',
          operator: 'lte',
          threshold: MAX_ABS_TOLERANCE,
          reference: 'cpu_reference',
          observedValue: maxAbsError,
          passed: maxAbsError <= MAX_ABS_TOLERANCE,
        },
        cost: { measurementState: 'not_measured', reason: 'not_applicable' },
        hardware: {
          schemaVersion: HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION,
          target: {
            id: 'thermal-explicit-tracer',
            kind: 'compute-workload',
            architecture: 'regular-grid-3d',
            artifactKind: 'webgpu-wgsl',
          },
          device: {
            vendor: adapterInfo?.vendor || 'unknown',
            model:
              adapterInfo?.description ||
              adapterInfo?.device ||
              adapterInfo?.architecture ||
              'unknown',
            accelerator: 'gpu',
          },
          runtime: {
            name: 'Node WebGPU (Dawn)',
            version: process.version,
            hostOS: process.platform,
            ...(hasAdapterIdentity
              ? { adapterFingerprint: `sha256:${sha256(JSON.stringify(adapterInfo))}` }
              : {}),
          },
          compilerVersion: `ComputeWorkUnitCompiler@${COMPUTE_WORK_UNIT_COMPILER_VERSION}`,
          constraints: [
            {
              id: 'required-accelerator',
              description: 'CPU fallback is not success for this tracer.',
              limit: 'gpu',
            },
            {
              id: 'max-abs-error',
              description: 'GPU output must remain within the CPU-reference error envelope.',
              limit: MAX_ABS_TOLERANCE,
              unit: 'temperature-unit',
            },
          ],
          measuredResults: [
            {
              metric: 'max_abs_error',
              value: maxAbsError,
              unit: 'temperature-unit',
              method: 'cellwise CPU reference comparison',
              sampleCount: cpuField.length,
              tolerance: MAX_ABS_TOLERANCE,
            },
            {
              metric: 'gpu_execution_observed',
              value: gpu.getStats().usedGPU ? 1 : 0,
              unit: 'boolean',
              method: 'ThermalSolver.getStats().usedGPU',
              sampleCount: STEPS,
            },
            {
              metric: 'rms_error',
              value: rmsError,
              unit: 'temperature-unit',
              method: 'cellwise CPU reference comparison',
              sampleCount: cpuField.length,
              tolerance: MAX_ABS_TOLERANCE,
            },
          ],
          replayInputs: [
            {
              kind: 'holo-composition',
              uri: 'holoscript://tests/thermal-gpu-tracer',
              sha256: sha256(source),
              description: 'Exact source for the bounded thermal parity tracer.',
            },
          ],
          provenance: {
            capturedAt: completedAt,
            sourceCompositionHash: workUnit.source_evidence,
          },
          owner: { agent: 'codex-hardware', team: 'HoloMesh' },
        },
      });

      expect(receipt.execution).toMatchObject({
        actualAccelerator: 'gpu',
        fallbackUsed: false,
        terminalStatus: 'succeeded',
      });
      expect(receipt.quality).toMatchObject({
        observedValue: maxAbsError,
        passed: true,
      });
      expect(validateComputeExecutionReceipt(receipt)).toEqual({ valid: true, errors: [] });
      console.info(
        `[thermal-gpu] receipt=${receipt.receiptId} max_abs_error=${maxAbsError} rms_error=${rmsError} adapter=${JSON.stringify(adapterInfo ?? {})}`
      );
    } finally {
      cpu.dispose();
      gpu.dispose();
    }
  }, 60_000);
});
