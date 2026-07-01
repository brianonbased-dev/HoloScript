import { describe, expect, it } from 'vitest';
import { CAELRecorder } from '../CAELRecorder';
import type { FieldData, SimSolver } from '../SimSolver';
import {
  createGeneratedArtifactReceipt,
  verifySimulationEvidencePack,
  verifySimulationEvidencePackJson,
  type SimulationEvidenceHardwareValidation,
  type SimulationEvidencePack,
  type SimulationEvidenceRequirements,
} from '../SimulationEvidencePack';

function mockSolver(): SimSolver & { time: number } {
  return {
    mode: 'transient',
    fieldNames: ['currentTime'],
    time: 0,
    step(dt: number) {
      this.time += dt;
    },
    solve() {},
    getField(name?: string): FieldData | null {
      return !name || name === 'currentTime' ? new Float32Array([this.time]) : null;
    },
    getStats() {
      return { converged: true, currentTime: this.time };
    },
    dispose() {},
  };
}

function simulationConfig() {
  return {
    vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
    tetrahedra: new Uint32Array([0, 1, 2, 3]),
  };
}

function requirements(): SimulationEvidenceRequirements {
  return {
    requirementId: 'REQ-CG010-THERMAL-001',
    requirementText:
      'The verification smoke solver shall advance exactly through the fixed-step envelope.',
    requirementSource: 'docs/requirements/cg010-simulation-evidence.md#thermal-smoke',
    verificationMethod: 'simulation',
    acceptanceCriteria: {
      currentTime: 0.02,
    },
  };
}

function hardwareValidation(): SimulationEvidenceHardwareValidation {
  return {
    status: 'pass',
    device: 'codex-local-cpu',
    runtime: 'vitest-simulated-hardware',
    checkedAt: '2026-07-01T17:00:00.000Z',
    adapterFingerprint: 'vitest-cpu-adapter',
    benchmark: {
      name: 'fixed-step-smoke',
      value: 2,
      unit: 'steps',
    },
  };
}

function makePack(): SimulationEvidencePack {
  const recorder = new CAELRecorder(mockSolver(), simulationConfig(), {
    solverType: 'thermal-fixed-step-smoke',
    fixedDt: 0.01,
    adapterFingerprint: 'vitest-cpu-adapter',
    useCryptographicHash: true,
  });
  recorder.step(0.02);

  return recorder.finalizeEvidencePack({
    packId: 'simulation-evidence-pack-cg010-test',
    createdAt: '2026-07-01T17:00:00.000Z',
    requirements: requirements(),
    generatedArtifacts: [
      createGeneratedArtifactReceipt({
        artifactId: 'cg010-cael-jsonl',
        kind: 'cael-jsonl',
        path: 'artifacts/cg010/thermal-smoke.cael.jsonl',
        content: recorder.toJSONL(),
        source: 'CAELRecorder.toJSONL',
      }),
    ],
    hardwareValidation: hardwareValidation(),
  });
}

function clonePack(pack: SimulationEvidencePack): SimulationEvidencePack {
  return JSON.parse(JSON.stringify(pack)) as SimulationEvidencePack;
}

describe('SimulationEvidencePack CG-010', () => {
  it('emits a complete SimulationContract evidence pack from CAELRecorder', () => {
    const pack = makePack();
    expect(Object.keys(pack)).toEqual([
      'packId',
      'schemaVersion',
      'createdAt',
      'simulationRunId',
      'contractId',
      'requirements',
      'solverConfig',
      'replay',
      'provenance',
      'toleranceTable',
      'generatedArtifacts',
      'hardwareValidation',
      'verificationResult',
    ]);
    expect(pack.schemaVersion).toBe('0.1.0');
    expect(pack.requirements.requirementId).toBe('REQ-CG010-THERMAL-001');
    expect(pack.solverConfig).toMatchObject({
      solverType: 'thermal-fixed-step-smoke',
      hashMode: 'sha256',
      useCryptographicHash: true,
    });
    expect(pack.replay.contractId).toBe(pack.contractId);
    expect(pack.provenance.contractId).toBe(pack.contractId);
    expect(pack.provenance.verified).toBe(true);
    expect(pack.toleranceTable.fieldTolerances.currentTime).toMatchObject({
      unit: 'dimensionless',
      acceptanceBound: 0.02,
    });
    expect(pack.generatedArtifacts[0].hash).toMatch(/^artifact-sha-[0-9a-f]{64}$/);
    expect(pack.hardwareValidation.adapterFingerprint).toBe('vitest-cpu-adapter');
    expect(pack.verificationResult).toMatchObject({
      status: 'pass',
      traceHashChainValid: true,
    });
    expect(pack.verificationResult.followUpAffordances.studioMbseRequirementsLinkUi).toContain(
      'Studio MBSE'
    );
    expect(pack.verificationResult.followUpAffordances.hilReplayHarness).toContain('HIL');

    expect(verifySimulationEvidencePack(pack)).toMatchObject({ valid: true, errors: [] });
    expect(verifySimulationEvidencePackJson(JSON.stringify(pack))).toMatchObject({
      valid: true,
      errors: [],
    });
  });

  it('fails verification when required evidence-pack fields are missing', () => {
    const cases: Array<[string, (pack: Record<string, unknown>) => void, RegExp]> = [
      ['requirements', (pack) => delete pack.requirements, /requirements/],
      ['replay', (pack) => delete pack.replay, /replay/],
      [
        'tolerance',
        (pack) => {
          const toleranceTable = pack.toleranceTable as {
            fieldTolerances: Record<string, unknown>;
          };
          delete toleranceTable.fieldTolerances.currentTime;
        },
        /toleranceTable\.fieldTolerances missing requirement field: currentTime/,
      ],
      [
        'artifact hash',
        (pack) => {
          const artifacts = pack.generatedArtifacts as Array<Record<string, unknown>>;
          delete artifacts[0].hash;
        },
        /generatedArtifacts\[0\]\.hash is required/,
      ],
      [
        'hardware validation',
        (pack) => {
          const hardware = pack.hardwareValidation as Record<string, unknown>;
          delete hardware.device;
        },
        /hardwareValidation requires status, device, runtime, and checkedAt/,
      ],
    ];

    for (const [label, mutate, expected] of cases) {
      const broken = clonePack(makePack()) as unknown as Record<string, unknown>;
      mutate(broken);
      const result = verifySimulationEvidencePack(broken);
      expect(result.valid, label).toBe(false);
      expect(result.errors.join('\n'), label).toMatch(expected);
      expect(result.verificationResult.status, label).toBe('fail');
    }
  });
});
