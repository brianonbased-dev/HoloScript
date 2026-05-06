import { describe, expect, it } from 'vitest';
import {
  TASK_ENVIRONMENT_PROFILE_KINDS,
  addTasksToBoard,
  attachTaskEnvironmentReceipt,
  auditDoneLog,
  completeTask,
  validateTaskEnvironmentProfile,
  validateTaskEnvironmentReceipt,
  type ArtifactReceipt,
  type DoneLogEntry,
  type TaskEnvironmentProfile,
  type TaskEnvironmentReceipt,
  type TeamTask,
} from '../board';

function makeTask(overrides: Partial<TeamTask> = {}): TeamTask {
  return {
    id: 'task_environment',
    title: 'Run task-scoped environment',
    description: 'Capture runtime evidence.',
    status: 'open',
    priority: 7,
    createdAt: '2026-05-06T00:00:00Z',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<TaskEnvironmentProfile> = {}): TaskEnvironmentProfile {
  return {
    id: 'env_hardware',
    kind: 'hardware-native',
    setup: [{ command: 'node hooks/team-connect.mjs --once --name=codex --ide=hardware' }],
    allowedPaths: ['C:/Users/josep/Documents/GitHub/HoloScript'],
    network: { access: 'loopback' },
    packageManager: 'pnpm',
    gpu: { required: true, backend: 'webgpu', vendor: 'nvidia' },
    wasm: { required: true, simd: true },
    teardown: [{ description: 'Release HoloMesh handle.' }],
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<ArtifactReceipt> = {}): ArtifactReceipt {
  return {
    id: 'artifact_hardware_audit',
    type: 'test-output',
    path: 'artifacts/hardware-audit.json',
    hash: 'd'.repeat(64),
    hashAlgorithm: 'sha256',
    producer: 'codex-hardware',
    validator: 'framework-vitest',
    ...overrides,
  };
}

function makeReceipt(overrides: Partial<TaskEnvironmentReceipt> = {}): TaskEnvironmentReceipt {
  return {
    id: 'env_receipt_codex',
    profile: makeProfile(),
    fingerprint: {
      id: 'fingerprint_codex',
      profileKind: 'hardware-native',
      capturedAt: '2026-05-06T21:00:00Z',
      capturedBy: 'codex-hardware',
      os: 'win32',
      arch: 'x64',
      nodeVersion: 'v24.14.0',
      packageManagerVersion: 'pnpm:missing',
      gitWorktree: 'C:/Users/josep/Documents/GitHub/HoloScript',
      gpu: { required: true, supported: true, backend: 'd3d12', adapter: 'RTX 3060' },
      wasm: { required: true, supported: true, simd: true },
    },
    artifactOutputs: [makeArtifact()],
    hardwareAudit: {
      capturedAt: '2026-05-06T21:00:00Z',
      capturedBy: 'codex-hardware',
      nodeVersion: 'v24.14.0',
      pnpmVersion: 'missing-on-path',
      wasmSimd: true,
      webgpu: {
        supported: true,
        adapter: 'RTX 3060 via D3D12',
        backend: 'd3d12',
        flags: ['--enable-unsafe-webgpu'],
      },
      source: 'session-start hardware audit',
    },
    verificationCommands: [
      {
        id: 'env-vitest',
        command: 'node vitest.mjs run board-environment-profiles.test.ts',
        status: 'passed',
        artifactIds: ['artifact_hardware_audit'],
      },
    ],
    ...overrides,
  };
}

describe('board task environment profiles', () => {
  it('supports all task-scoped environment profile kinds', () => {
    for (const kind of TASK_ENVIRONMENT_PROFILE_KINDS) {
      expect(validateTaskEnvironmentProfile(makeProfile({ kind }))).toEqual([]);
    }
  });

  it('validates profile kind, allowlisted network, paths, and setup steps', () => {
    const invalid = makeProfile({
      kind: 'cloud' as TaskEnvironmentProfile['kind'],
      allowedPaths: [''],
      network: { access: 'allowlist' },
      setup: [{}],
    });

    expect(validateTaskEnvironmentProfile(invalid)).toEqual([
      'TaskEnvironmentProfile.kind is unsupported: cloud.',
      'TaskEnvironmentProfile.network.allowlist is required for allowlist access.',
      'TaskEnvironmentProfile.allowedPaths cannot contain empty paths.',
      'TaskEnvironmentProfile steps require command or description.',
    ]);
  });

  it('attaches runner environment receipts to live board tasks', () => {
    const receipt = makeReceipt();
    const board = [makeTask({ environment: makeProfile() })];
    const result = attachTaskEnvironmentReceipt(board, 'task_environment', receipt);

    expect(result.success).toBe(true);
    expect(result.task?.environmentReceipt?.fingerprint.nodeVersion).toBe('v24.14.0');

    receipt.hardwareAudit?.webgpu?.flags?.push('--mutated');
    expect(result.task?.environmentReceipt?.hardwareAudit?.webgpu?.flags).toEqual([
      '--enable-unsafe-webgpu',
    ]);
  });

  it('rejects malformed environment receipts', () => {
    const invalid = makeReceipt({
      id: '',
      fingerprint: {
        profileKind: 'browser',
        capturedAt: '',
        capturedBy: '',
      },
      verificationCommands: [{ command: '' }],
      hardwareAudit: { capturedAt: '' },
    });

    expect(validateTaskEnvironmentReceipt(invalid)).toEqual([
      'TaskEnvironmentReceipt.id is required.',
      'TaskEnvironmentReceipt.fingerprint.capturedAt is required.',
      'TaskEnvironmentReceipt.fingerprint.capturedBy is required.',
      'TaskEnvironmentReceipt  has a verification command without command text.',
      'TaskEnvironmentReceipt.hardwareAudit.capturedAt is required.',
    ]);
  });

  it('validates and clones environment profiles during batch task creation', () => {
    const { added, skipped } = addTasksToBoard(
      [],
      [],
      [
        {
          title: 'Hardware task',
          description: 'Run on Codex hardware.',
          priority: 7,
          environment: makeProfile(),
        },
        {
          title: 'Invalid environment task',
          description: 'Missing allowlist.',
          priority: 7,
          environment: makeProfile({ network: { access: 'allowlist' } }),
        },
      ],
      { dedupMode: 'exact' }
    );

    expect(added).toHaveLength(1);
    expect(added[0].environment?.kind).toBe('hardware-native');
    expect(skipped).toEqual([{ title: 'Invalid environment task', reason: 'invalid_environment' }]);
  });

  it('surfaces profiles, fingerprints, audit data, and artifact outputs in done logs', () => {
    const receipt = makeReceipt();
    const board = [makeTask({ environment: makeProfile() })];
    const { result, updatedBoard } = completeTask(board, 'task_environment', 'codex-hardware', {
      commit: 'abc1234',
      environmentReceipt: receipt,
    });

    expect(result.success).toBe(true);
    expect(updatedBoard).toHaveLength(0);
    expect(result.doneEntry?.environment?.kind).toBe('hardware-native');
    expect(result.doneEntry?.environmentReceipt?.hardwareAudit?.wasmSimd).toBe(true);
    expect(result.doneEntry?.environmentReceipt?.fingerprint.gpu?.adapter).toBe('RTX 3060');
    expect(result.doneEntry?.artifacts?.[0].id).toBe('artifact_hardware_audit');
  });

  it('counts environment receipts in done-log audit results', () => {
    const entries: DoneLogEntry[] = [
      {
        taskId: 'task_environment',
        title: 'Run task-scoped environment',
        completedBy: 'codex-hardware',
        commitHash: 'abc1234',
        timestamp: '2026-05-06T00:00:00Z',
        summary: 'Done.',
        environmentReceipt: makeReceipt(),
      },
    ];

    const result = auditDoneLog(entries);
    expect(result.environmentReceipts).toBe(1);
    expect(result.verified).toBe(1);
  });
});
