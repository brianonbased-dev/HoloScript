/**
 * HoloLand receipt model tests.
 *
 * Discipline:
 * - G.GOLD.013: every "validates X" case is paired with a "rejects bad X"
 *   case so the validator is proven to actually fire.
 * - G.GOLD.015: cover the failure categories we expect at runtime —
 *   missing required fields, unsupported enums, kind/discriminator
 *   coupling (hardware-other needs deviceModel), nested-receipt error
 *   propagation, and clone-deep-copy isolation. These are the failure
 *   shapes the existing ArtifactReceipt validator already catches in
 *   `board-artifact-receipts.test.ts`; the same shapes apply here.
 *
 * task_1778186605462_4z0o
 */

import { describe, expect, it } from 'vitest';
import {
  AGENT_ACTION_KINDS,
  HARDWARE_COMPILATION_TARGET_KINDS,
  HARDWARE_RECEIPT_KINDS,
  cloneAgentActionReceipt,
  cloneCrossHardwareCompilationReceipt,
  cloneHardwareReceipt,
  cloneReplayInput,
  cloneReplayOutcome,
  cloneValidationReceipt,
  isSupportedAgentActionKind,
  isSupportedHardwareCompilationTarget,
  isSupportedHardwareReceiptKind,
  isSupportedReplayOutcomeStatus,
  isSupportedValidationStatus,
  validateAgentActionReceipt,
  validateCrossHardwareCompilationReceipt,
  validateHardwareReceipt,
  validateReplayInput,
  validateReplayOutcome,
  validateValidationReceipt,
  type AgentActionReceipt,
  type CrossHardwareCompilationReceipt,
  type HardwareReceipt,
  type ReplayInput,
  type ReplayOutcome,
  type ValidationReceipt,
} from '../board/hololand-receipts';

function makeHardware(overrides: Partial<HardwareReceipt> = {}): HardwareReceipt {
  return {
    id: 'hw_quest3_001',
    kind: 'quest3',
    capturedAt: '2026-05-07T00:00:00Z',
    hash: 'a'.repeat(64),
    hashAlgorithm: 'sha256',
    firmwareVersion: 'v68.0',
    path: 'artifacts/hardware/quest3_001.bin',
    ...overrides,
  };
}

function makeReplayInput(overrides: Partial<ReplayInput> = {}): ReplayInput {
  return {
    id: 'rin_001',
    at: '2026-05-07T00:00:01Z',
    source: 'agent_steward_a',
    payload: { event: 'controller.click', x: 0.5, y: 0.5 },
    kind: 'vr.controller',
    ...overrides,
  };
}

function makeReplayOutcome(overrides: Partial<ReplayOutcome> = {}): ReplayOutcome {
  return {
    id: 'rout_001',
    status: 'matched',
    at: '2026-05-07T00:00:02Z',
    stateHash: 'b'.repeat(64),
    stateHashAlgorithm: 'sha256',
    summary: 'state matched expected fixture',
    artifactIds: ['artifact_trace_001'],
    ...overrides,
  };
}

function makeAgentAction(overrides: Partial<AgentActionReceipt> = {}): AgentActionReceipt {
  return {
    id: 'act_spawn_001',
    kind: 'spawn-encounter',
    actor: 'agent_steward_a',
    actedAt: '2026-05-07T00:00:03Z',
    hash: 'c'.repeat(64),
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeValidation(overrides: Partial<ValidationReceipt> = {}): ValidationReceipt {
  return {
    id: 'val_oasis_001',
    scenarioId: 'oasis.entry.scenario.v1',
    validatedAt: '2026-05-07T00:00:10Z',
    status: 'passed',
    hash: 'd'.repeat(64),
    hashAlgorithm: 'sha256',
    hardwareReceipts: [makeHardware()],
    replayInputs: [makeReplayInput()],
    replayOutcomes: [makeReplayOutcome()],
    agentActions: [makeAgentAction()],
    provenance: { taskId: 'task_1778186605462_4z0o', commitHash: 'pending' },
    ...overrides,
  };
}

function makeCrossHardwareCompilation(
  overrides: Partial<CrossHardwareCompilationReceipt> = {},
): CrossHardwareCompilationReceipt {
  return {
    id: 'hwc_jetson_001',
    exportTarget: 'nir',
    deviceFamily: 'jetson',
    deviceModel: 'Jetson Orin Nano 8GB',
    runtime: 'TensorRT 10.0',
    compilerVersion: '7.0.0',
    toolchainVersion: 'JetPack 6.0',
    constraints: {
      maxMemoryMB: 8192,
      maxComputeUnits: 1024,
      thermalBudgetC: 85,
      powerBudgetW: 15,
      targetLatencyMs: 16,
      quantization: 'fp16',
    },
    measuredResults: {
      latencyMs: 14.2,
      throughputFPS: 68,
      peakMemoryBytes: 3_200_000_000,
      powerDrawW: 12.4,
      thermalThrottleEvents: 0,
      accuracyVsReference: 0.982,
    },
    replayInputs: [makeReplayInput()],
    provenance: { taskId: 'task_1778222134390_8ixd', commitHash: 'pending' },
    owner: 'agent_1776836330914_1bli',
    hash: 'e'.repeat(64),
    hashAlgorithm: 'sha256',
    capturedAt: '2026-05-09T00:00:00Z',
    ...overrides,
  };
}

describe('HoloLand HardwareReceipt', () => {
  it('accepts every supported hardware kind', () => {
    for (const kind of HARDWARE_RECEIPT_KINDS) {
      const receipt = makeHardware({ kind, deviceModel: kind === 'hardware-other' ? 'custom-rig' : undefined });
      expect(validateHardwareReceipt(receipt)).toEqual([]);
    }
  });

  it('rejects unsupported kind', () => {
    const receipt = makeHardware({ kind: 'macintosh-plus' as never });
    const errors = validateHardwareReceipt(receipt);
    expect(errors).toContain('HardwareReceipt.kind is unsupported: macintosh-plus.');
  });

  it('rejects hardware-other without deviceModel (kind/discriminator coupling)', () => {
    const receipt = makeHardware({ kind: 'hardware-other', deviceModel: undefined });
    const errors = validateHardwareReceipt(receipt);
    expect(errors).toContain(
      'HardwareReceipt hw_quest3_001 kind=hardware-other requires deviceModel.',
    );
  });

  it('rejects when required fields are missing (G.GOLD.015 failure category)', () => {
    const receipt = makeHardware({
      id: '',
      hash: '',
      hashAlgorithm: '' as never,
      capturedAt: '',
    });
    const errors = validateHardwareReceipt(receipt);
    expect(errors).toEqual(
      expect.arrayContaining([
        'HardwareReceipt.id is required.',
        'HardwareReceipt.hash is required.',
        'HardwareReceipt.hashAlgorithm is required.',
        'HardwareReceipt.capturedAt is required.',
      ]),
    );
  });

  it('rejects verification command without command text', () => {
    const receipt = makeHardware({
      verificationCommands: [{ command: '' }],
    });
    const errors = validateHardwareReceipt(receipt);
    expect(errors).toContain(
      'HardwareReceipt hw_quest3_001 has a verification command without command text.',
    );
  });

  it('clones deeply (mutating clone does not mutate original)', () => {
    const receipt = makeHardware({
      provenance: { taskId: 'task_a', parentArtifactIds: ['parent_1'] },
      verificationCommands: [{ command: 'replay.sh', artifactIds: ['art_1'] }],
      metadata: { foo: 'bar' },
    });
    const cloned = cloneHardwareReceipt(receipt);
    cloned.provenance!.parentArtifactIds!.push('parent_mutant');
    cloned.verificationCommands![0].artifactIds!.push('art_mutant');
    (cloned.metadata as Record<string, unknown>).foo = 'mutated';

    expect(receipt.provenance!.parentArtifactIds).toEqual(['parent_1']);
    expect(receipt.verificationCommands![0].artifactIds).toEqual(['art_1']);
    expect(receipt.metadata!.foo).toBe('bar');
  });
});

describe('HoloLand ReplayInput', () => {
  it('accepts a well-formed input', () => {
    expect(validateReplayInput(makeReplayInput())).toEqual([]);
  });

  it('rejects when required fields are missing', () => {
    const input = makeReplayInput({ id: '', source: '', at: '' });
    const errors = validateReplayInput(input);
    expect(errors).toEqual(
      expect.arrayContaining([
        'ReplayInput.id is required.',
        'ReplayInput.source is required.',
        'ReplayInput.at is required.',
      ]),
    );
  });

  it('rejects non-object payload (defends against null/undefined/primitives)', () => {
    const input = makeReplayInput({ payload: null as never });
    const errors = validateReplayInput(input);
    expect(errors).toContain('ReplayInput rin_001.payload must be an object.');
  });

  it('clones deeply (mutating cloned payload does not mutate original)', () => {
    const input = makeReplayInput({ payload: { event: 'click', x: 1 } });
    const cloned = cloneReplayInput(input);
    (cloned.payload as Record<string, unknown>).x = 99;
    expect(input.payload.x).toBe(1);
  });
});

describe('HoloLand ReplayOutcome', () => {
  it('accepts every supported status', () => {
    for (const status of ['matched', 'diverged', 'errored', 'skipped'] as const) {
      expect(validateReplayOutcome(makeReplayOutcome({ status }))).toEqual([]);
    }
  });

  it('rejects unsupported status', () => {
    const outcome = makeReplayOutcome({ status: 'half-baked' as never });
    expect(validateReplayOutcome(outcome)).toContain(
      'ReplayOutcome.status is unsupported: half-baked.',
    );
  });

  it('rejects when required fields are missing', () => {
    const outcome = makeReplayOutcome({ id: '', at: '' });
    const errors = validateReplayOutcome(outcome);
    expect(errors).toEqual(
      expect.arrayContaining([
        'ReplayOutcome.id is required.',
        'ReplayOutcome.at is required.',
      ]),
    );
  });

  it('rejects stateHash without stateHashAlgorithm (paired-field rule)', () => {
    const outcome = makeReplayOutcome({ stateHash: 'b'.repeat(64), stateHashAlgorithm: undefined });
    expect(validateReplayOutcome(outcome)).toContain(
      'ReplayOutcome rout_001.stateHashAlgorithm is required when stateHash is set.',
    );
  });

  it('clones deeply (mutating clone does not mutate original)', () => {
    const outcome = makeReplayOutcome({ artifactIds: ['art_1'], metadata: { foo: 'bar' } });
    const cloned = cloneReplayOutcome(outcome);
    cloned.artifactIds!.push('art_mutant');
    (cloned.metadata as Record<string, unknown>).foo = 'mutated';
    expect(outcome.artifactIds).toEqual(['art_1']);
    expect(outcome.metadata!.foo).toBe('bar');
  });
});

describe('HoloLand AgentActionReceipt', () => {
  it('accepts every supported action kind', () => {
    for (const kind of AGENT_ACTION_KINDS) {
      const receipt = makeAgentAction({
        kind,
        actionLabel: kind === 'agent-other' ? 'custom-action' : undefined,
      });
      expect(validateAgentActionReceipt(receipt)).toEqual([]);
    }
  });

  it('rejects unsupported kind', () => {
    const receipt = makeAgentAction({ kind: 'eat-pizza' as never });
    expect(validateAgentActionReceipt(receipt)).toContain(
      'AgentActionReceipt.kind is unsupported: eat-pizza.',
    );
  });

  it('rejects agent-other without actionLabel (kind/discriminator coupling)', () => {
    const receipt = makeAgentAction({ kind: 'agent-other', actionLabel: undefined });
    expect(validateAgentActionReceipt(receipt)).toContain(
      'AgentActionReceipt act_spawn_001 kind=agent-other requires actionLabel.',
    );
  });

  it('rejects when required fields are missing', () => {
    const receipt = makeAgentAction({
      id: '',
      actor: '',
      hash: '',
      hashAlgorithm: '' as never,
      actedAt: '',
    });
    const errors = validateAgentActionReceipt(receipt);
    expect(errors).toEqual(
      expect.arrayContaining([
        'AgentActionReceipt.id is required.',
        'AgentActionReceipt.actor is required.',
        'AgentActionReceipt.hash is required.',
        'AgentActionReceipt.hashAlgorithm is required.',
        'AgentActionReceipt.actedAt is required.',
      ]),
    );
  });

  it('clones deeply (mutating clone does not mutate original)', () => {
    const receipt = makeAgentAction({
      provenance: { taskId: 'task_a' },
      metadata: { foo: 'bar' },
    });
    const cloned = cloneAgentActionReceipt(receipt);
    cloned.provenance!.taskId = 'mutated';
    (cloned.metadata as Record<string, unknown>).foo = 'mutated';
    expect(receipt.provenance!.taskId).toBe('task_a');
    expect(receipt.metadata!.foo).toBe('bar');
  });
});

describe('HoloLand ValidationReceipt envelope', () => {
  it('accepts a full receipt with every nested receipt type', () => {
    expect(validateValidationReceipt(makeValidation())).toEqual([]);
  });

  it('accepts a minimal receipt with no nested receipts', () => {
    const minimal: ValidationReceipt = {
      id: 'val_min',
      scenarioId: 'scenario.v1',
      validatedAt: '2026-05-07T00:00:00Z',
      status: 'passed',
      hash: 'a'.repeat(64),
      hashAlgorithm: 'sha256',
    };
    expect(validateValidationReceipt(minimal)).toEqual([]);
  });

  it('rejects unsupported status', () => {
    const receipt = makeValidation({ status: 'maybe' as never });
    expect(validateValidationReceipt(receipt)).toContain(
      'ValidationReceipt.status is unsupported: maybe.',
    );
  });

  it('rejects when required fields are missing', () => {
    const receipt = makeValidation({
      id: '',
      scenarioId: '',
      hash: '',
      hashAlgorithm: '' as never,
      validatedAt: '',
    });
    const errors = validateValidationReceipt(receipt);
    expect(errors).toEqual(
      expect.arrayContaining([
        'ValidationReceipt.id is required.',
        'ValidationReceipt.scenarioId is required.',
        'ValidationReceipt.hash is required.',
        'ValidationReceipt.hashAlgorithm is required.',
        'ValidationReceipt.validatedAt is required.',
      ]),
    );
  });

  it('propagates nested-receipt errors with grep-friendly prefixes', () => {
    const receipt = makeValidation({
      hardwareReceipts: [makeHardware({ id: 'hw_bad', hash: '' })],
      replayInputs: [makeReplayInput({ id: 'rin_bad', source: '' })],
      replayOutcomes: [makeReplayOutcome({ id: 'rout_bad', status: 'whatever' as never })],
      agentActions: [makeAgentAction({ id: 'act_bad', actor: '' })],
    });
    const errors = validateValidationReceipt(receipt);
    expect(errors).toContain('hardwareReceipts[hw_bad]: HardwareReceipt.hash is required.');
    expect(errors).toContain('replayInputs[rin_bad]: ReplayInput.source is required.');
    expect(errors).toContain(
      'replayOutcomes[rout_bad]: ReplayOutcome.status is unsupported: whatever.',
    );
    expect(errors).toContain('agentActions[act_bad]: AgentActionReceipt.actor is required.');
  });

  it('rejects verification command without command text on the envelope itself', () => {
    const receipt = makeValidation({
      verificationCommands: [{ command: '' }],
    });
    expect(validateValidationReceipt(receipt)).toContain(
      'ValidationReceipt val_oasis_001 has a verification command without command text.',
    );
  });

  it('clones deeply across every nested receipt type', () => {
    const receipt = makeValidation({
      metadata: { foo: 'bar' },
    });
    const cloned = cloneValidationReceipt(receipt);
    cloned.hardwareReceipts![0].id = 'mutated_hw';
    cloned.replayInputs![0].source = 'mutated_source';
    cloned.replayOutcomes![0].status = 'errored';
    cloned.agentActions![0].actor = 'mutated_actor';
    cloned.provenance!.taskId = 'mutated_task';
    (cloned.metadata as Record<string, unknown>).foo = 'mutated';

    expect(receipt.hardwareReceipts![0].id).toBe('hw_quest3_001');
    expect(receipt.replayInputs![0].source).toBe('agent_steward_a');
    expect(receipt.replayOutcomes![0].status).toBe('matched');
    expect(receipt.agentActions![0].actor).toBe('agent_steward_a');
    expect(receipt.provenance!.taskId).toBe('task_1778186605462_4z0o');
    expect(receipt.metadata!.foo).toBe('bar');
  });
});

describe('HoloLand receipt type guards', () => {
  it('isSupportedHardwareReceiptKind matches the registered list and rejects others', () => {
    expect(isSupportedHardwareReceiptKind('quest3')).toBe(true);
    expect(isSupportedHardwareReceiptKind('lookingglass')).toBe(true);
    expect(isSupportedHardwareReceiptKind('vintage-amiga')).toBe(false);
  });

  it('isSupportedAgentActionKind matches the registered list and rejects others', () => {
    expect(isSupportedAgentActionKind('spawn-encounter')).toBe(true);
    expect(isSupportedAgentActionKind('governance-vote')).toBe(true);
    expect(isSupportedAgentActionKind('summon-cthulhu')).toBe(false);
  });

  it('isSupportedReplayOutcomeStatus accepts the four statuses and rejects others', () => {
    expect(isSupportedReplayOutcomeStatus('matched')).toBe(true);
    expect(isSupportedReplayOutcomeStatus('diverged')).toBe(true);
    expect(isSupportedReplayOutcomeStatus('errored')).toBe(true);
    expect(isSupportedReplayOutcomeStatus('skipped')).toBe(true);
    expect(isSupportedReplayOutcomeStatus('half-baked')).toBe(false);
  });

  it('isSupportedValidationStatus accepts the three statuses and rejects others', () => {
    expect(isSupportedValidationStatus('passed')).toBe(true);
    expect(isSupportedValidationStatus('failed')).toBe(true);
    expect(isSupportedValidationStatus('inconclusive')).toBe(true);
    expect(isSupportedValidationStatus('maybe')).toBe(false);
  });
});

describe('CrossHardwareCompilationReceipt', () => {
  it('accepts every supported device family', () => {
    for (const family of HARDWARE_COMPILATION_TARGET_KINDS) {
      const receipt = makeCrossHardwareCompilation({ deviceFamily: family });
      expect(validateCrossHardwareCompilationReceipt(receipt)).toEqual([]);
    }
  });

  it('rejects unsupported device family', () => {
    const receipt = makeCrossHardwareCompilation({ deviceFamily: 'nvidia-rtx-4090' as never });
    const errors = validateCrossHardwareCompilationReceipt(receipt);
    expect(errors).toContain(
      'CrossHardwareCompilationReceipt.deviceFamily is unsupported: nvidia-rtx-4090.',
    );
  });

  it('rejects when required fields are missing', () => {
    const receipt = makeCrossHardwareCompilation({
      id: '',
      exportTarget: '',
      runtime: '',
      compilerVersion: '',
      hash: '',
      hashAlgorithm: '' as never,
      capturedAt: '',
    });
    const errors = validateCrossHardwareCompilationReceipt(receipt);
    expect(errors).toEqual(
      expect.arrayContaining([
        'CrossHardwareCompilationReceipt.id is required.',
        'CrossHardwareCompilationReceipt.exportTarget is required.',
        'CrossHardwareCompilationReceipt.runtime is required.',
        'CrossHardwareCompilationReceipt.compilerVersion is required.',
        'CrossHardwareCompilationReceipt.hash is required.',
        'CrossHardwareCompilationReceipt.hashAlgorithm is required.',
        'CrossHardwareCompilationReceipt.capturedAt is required.',
      ]),
    );
  });

  it('rejects negative constraint values', () => {
    const receipt = makeCrossHardwareCompilation({
      constraints: {
        maxMemoryMB: -1,
        maxComputeUnits: -1,
        powerBudgetW: -1,
        targetLatencyMs: -1,
      },
    });
    const errors = validateCrossHardwareCompilationReceipt(receipt);
    expect(errors).toContain(
      'CrossHardwareCompilationReceipt hwc_jetson_001.constraints.maxMemoryMB must be non-negative.',
    );
    expect(errors).toContain(
      'CrossHardwareCompilationReceipt hwc_jetson_001.constraints.maxComputeUnits must be non-negative.',
    );
    expect(errors).toContain(
      'CrossHardwareCompilationReceipt hwc_jetson_001.constraints.powerBudgetW must be non-negative.',
    );
    expect(errors).toContain(
      'CrossHardwareCompilationReceipt hwc_jetson_001.constraints.targetLatencyMs must be non-negative.',
    );
  });

  it('rejects negative or out-of-range measured result values', () => {
    const receipt = makeCrossHardwareCompilation({
      measuredResults: {
        latencyMs: -1,
        peakMemoryBytes: -1,
        powerDrawW: -1,
        accuracyVsReference: 1.5,
      },
    });
    const errors = validateCrossHardwareCompilationReceipt(receipt);
    expect(errors).toContain(
      'CrossHardwareCompilationReceipt hwc_jetson_001.measuredResults.latencyMs must be non-negative.',
    );
    expect(errors).toContain(
      'CrossHardwareCompilationReceipt hwc_jetson_001.measuredResults.peakMemoryBytes must be non-negative.',
    );
    expect(errors).toContain(
      'CrossHardwareCompilationReceipt hwc_jetson_001.measuredResults.powerDrawW must be non-negative.',
    );
    expect(errors).toContain(
      'CrossHardwareCompilationReceipt hwc_jetson_001.measuredResults.accuracyVsReference must be between 0 and 1.',
    );
  });

  it('accepts a minimal receipt without optional nested fields', () => {
    const minimal: CrossHardwareCompilationReceipt = {
      id: 'hwc_min',
      exportTarget: 'urdf',
      deviceFamily: 'generic-embedded',
      runtime: 'ROS 2 Humble',
      compilerVersion: '7.0.0',
      hash: 'a'.repeat(64),
      hashAlgorithm: 'sha256',
      capturedAt: '2026-05-09T00:00:00Z',
    };
    expect(validateCrossHardwareCompilationReceipt(minimal)).toEqual([]);
  });

  it('propagates nested replay input errors', () => {
    const receipt = makeCrossHardwareCompilation({
      replayInputs: [makeReplayInput({ id: 'rin_bad', source: '' })],
    });
    const errors = validateCrossHardwareCompilationReceipt(receipt);
    expect(errors).toContain('replayInputs[rin_bad]: ReplayInput.source is required.');
  });

  it('rejects verification command without command text', () => {
    const receipt = makeCrossHardwareCompilation({
      verificationCommands: [{ command: '' }],
    });
    const errors = validateCrossHardwareCompilationReceipt(receipt);
    expect(errors).toContain(
      'CrossHardwareCompilationReceipt hwc_jetson_001 has a verification command without command text.',
    );
  });

  it('clones deeply (mutating clone does not mutate original)', () => {
    const receipt = makeCrossHardwareCompilation({
      provenance: { taskId: 'task_a', parentArtifactIds: ['parent_1'] },
      verificationCommands: [{ command: 'replay.sh', artifactIds: ['art_1'] }],
      metadata: { foo: 'bar' },
    });
    const cloned = cloneCrossHardwareCompilationReceipt(receipt);
    cloned.provenance!.parentArtifactIds!.push('parent_mutant');
    cloned.verificationCommands![0].artifactIds!.push('art_mutant');
    (cloned.metadata as Record<string, unknown>).foo = 'mutated';

    expect(receipt.provenance!.parentArtifactIds).toEqual(['parent_1']);
    expect(receipt.verificationCommands![0].artifactIds).toEqual(['art_1']);
    expect(receipt.metadata!.foo).toBe('bar');
  });

  it('demonstrates cross-hardware portability (Jetson vs Qualcomm)', () => {
    // Same HoloScript composition, two hardware lanes — receipt schema is identical
    const jetson = makeCrossHardwareCompilation({
      id: 'hwc_jetson_orin_001',
      exportTarget: 'nir',
      deviceFamily: 'jetson',
      deviceModel: 'Jetson Orin Nano 8GB',
      runtime: 'TensorRT 10.0',
      compilerVersion: '7.0.0',
      toolchainVersion: 'JetPack 6.0',
    });
    const qualcomm = makeCrossHardwareCompilation({
      id: 'hwc_qualcomm_qcs8550_001',
      exportTarget: 'nir',
      deviceFamily: 'qualcomm-snapdragon',
      deviceModel: 'QCS8550',
      runtime: 'QNN 2.22',
      compilerVersion: '7.0.0',
      toolchainVersion: 'Snapdragon SDK 1.2',
    });

    expect(validateCrossHardwareCompilationReceipt(jetson)).toEqual([]);
    expect(validateCrossHardwareCompilationReceipt(qualcomm)).toEqual([]);

    // Both carry the same compiler version — the intent was described once
    expect(jetson.compilerVersion).toBe(qualcomm.compilerVersion);

    // But runtime and device are vendor-specific — evidence is portable
    expect(jetson.runtime).not.toBe(qualcomm.runtime);
    expect(jetson.deviceFamily).not.toBe(qualcomm.deviceFamily);
  });
});

describe('Cross-hardware compilation type guards', () => {
  it('isSupportedHardwareCompilationTarget matches the registered list and rejects others', () => {
    expect(isSupportedHardwareCompilationTarget('jetson')).toBe(true);
    expect(isSupportedHardwareCompilationTarget('qualcomm-snapdragon')).toBe(true);
    expect(isSupportedHardwareCompilationTarget('raspberry-pi')).toBe(true);
    expect(isSupportedHardwareCompilationTarget('nvidia-rtx-4090')).toBe(false);
  });
});
