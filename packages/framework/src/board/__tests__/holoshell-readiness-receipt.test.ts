/**
 * HoloShell Source-Native Readiness Receipt — Unit Tests
 *
 * Validates the composite receipt model, validator, type guard, and clone.
 */

import { describe, it, expect } from 'vitest';
import {
  READINESS_OUTCOMES,
  type HoloShellReadinessReceipt,
  type ReadinessGitStatus,
  type ReadinessSourceValidation,
  type ReadinessDeviceLabStatus,
  type ReadinessGraphStatus,
  type ReadinessTaskFiling,
  validateHoloShellReadinessReceipt,
  isSupportedReadinessOutcome,
  isSupportedReadinessStatus,
  cloneHoloShellReadinessReceipt,
} from '../holoshell-readiness-receipt';
import type { LocalCliAbsorptionReceipt } from '../holoshell-cli-receipts';

function makeValidBuildReceipt(): LocalCliAbsorptionReceipt {
  return {
    id: 'cli_build_001',
    projectPath: '/tmp/holoscript',
    binary: 'pnpm',
    args: ['build'],
    startedAt: '2026-05-14T10:00:00Z',
    endedAt: '2026-05-14T10:01:00Z',
    policy: {
      allowedBinaries: ['pnpm'],
      blockedBinaries: [],
      allowedPaths: ['/tmp/holoscript'],
      blockedPaths: [],
      maxDurationMs: 300_000,
      captureStdout: true,
      captureStderr: true,
      captureExitCode: true,
      captureLockfileDiff: false,
      captureNetworkLog: false,
      auditEnvironment: false,
    },
    exitCode: 0,
    actions: [
      {
        step: 0,
        kind: 'build',
        timestamp: '2026-05-14T10:00:00Z',
        command: 'pnpm',
        args: ['build'],
        cwd: '/tmp/holoscript',
        exitCode: 0,
        durationMs: 45_000,
      },
    ],
    outcome: 'success',
    hash: 'build_hash_001',
    hashAlgorithm: 'sha256',
  };
}

function makeValidReceipt(): HoloShellReadinessReceipt {
  return {
    id: 'holoshell_readiness_20260514_001',
    workflow: 'prepare-computer-for-hololand-world',
    startedAt: '2026-05-14T09:00:00Z',
    endedAt: '2026-05-14T09:05:00Z',
    gitStatus: {
      branch: 'main',
      commitShort: 'abc1234',
      changedFiles: 2,
      stagedFiles: 1,
      untrackedFiles: 0,
      aheadBehind: '+1/-0',
      isClean: false,
    },
    buildReceipt: makeValidBuildReceipt(),
    sourceValidation: {
      status: 'pass',
      checks: [
        {
          id: 'tsc-noemit',
          label: 'TypeScript type check',
          status: 'pass',
          exitCode: 0,
          fileCount: 340,
          errorCount: 0,
          warningCount: 0,
          durationMs: 12_000,
        },
      ],
      holoScriptVersion: '7.0.0',
    },
    deviceLab: {
      status: 'warn',
      checks: [
        { id: 'webgpu', label: 'WebGPU support', status: 'pass', detail: 'Adapter found' },
        { id: 'headset', label: 'VR headset', status: 'warn', detail: 'No headset detected' },
      ],
      gpuAdapter: 'NVIDIA GeForce RTX 4090',
      nodeVersion: '22.4.0',
      pnpmVersion: '10.8.0',
    },
    graphStatus: {
      graphLoaded: true,
      nodeCount: 12_400,
      edgeCount: 38_200,
      typeErrors: 0,
      summary: 'Graph healthy, zero type errors.',
    },
    taskFiling: {
      tasksFiled: 1,
      taskIds: ['task_1778739828973_uirq'],
      seedSource: 'holoshell-human-os-frontier',
      boardMode: 'build',
    },
    overallOutcome: 'warn',
    summary: 'Build passed, validation passed, device lab warned (no headset), graph healthy.',
    hash: 'readiness_hash_001',
    hashAlgorithm: 'sha256',
    provenance: {
      parentArtifactIds: ['task_1778739828973_uirq'],
    },
    verificationCommands: [
      {
        command: 'pnpm build && pnpm test',
        description: 'Replay build and test sequence',
      },
    ],
    metadata: { platform: 'win32', shell: 'powershell' },
  };
}

describe('READINESS_OUTCOMES', () => {
  it('contains pass/warn/fail', () => {
    expect(READINESS_OUTCOMES).toHaveLength(3);
    expect(READINESS_OUTCOMES).toContain('pass');
    expect(READINESS_OUTCOMES).toContain('warn');
    expect(READINESS_OUTCOMES).toContain('fail');
  });
});

describe('isSupportedReadinessOutcome', () => {
  it('returns true for known outcomes', () => {
    expect(isSupportedReadinessOutcome('pass')).toBe(true);
    expect(isSupportedReadinessOutcome('warn')).toBe(true);
    expect(isSupportedReadinessOutcome('fail')).toBe(true);
  });

  it('returns false for unknown outcomes', () => {
    expect(isSupportedReadinessOutcome('success')).toBe(false);
    expect(isSupportedReadinessOutcome('cancelled')).toBe(false);
    expect(isSupportedReadinessOutcome('')).toBe(false);
  });
});

describe('isSupportedReadinessStatus', () => {
  it('returns true for known statuses', () => {
    expect(isSupportedReadinessStatus('pass')).toBe(true);
    expect(isSupportedReadinessStatus('warn')).toBe(true);
    expect(isSupportedReadinessStatus('fail')).toBe(true);
    expect(isSupportedReadinessStatus('skipped')).toBe(true);
  });

  it('returns false for unknown statuses', () => {
    expect(isSupportedReadinessStatus('success')).toBe(false);
    expect(isSupportedReadinessStatus('')).toBe(false);
  });
});

describe('validateHoloShellReadinessReceipt', () => {
  it('returns empty for a valid receipt', () => {
    const receipt = makeValidReceipt();
    expect(validateHoloShellReadinessReceipt(receipt)).toEqual([]);
  });

  it('requires id', () => {
    const receipt = { ...makeValidReceipt(), id: '' };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'HoloShellReadinessReceipt.id is required.',
    );
  });

  it('requires workflow', () => {
    const receipt = { ...makeValidReceipt(), workflow: '' };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'HoloShellReadinessReceipt.workflow is required.',
    );
  });

  it('requires valid startedAt', () => {
    const receipt = { ...makeValidReceipt(), startedAt: 'invalid' };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'HoloShellReadinessReceipt.startedAt is required and must be a valid ISO-8601 timestamp.',
    );
  });

  it('requires valid endedAt', () => {
    const receipt = { ...makeValidReceipt(), endedAt: '' };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'HoloShellReadinessReceipt.endedAt is required and must be a valid ISO-8601 timestamp.',
    );
  });

  it('requires gitStatus', () => {
    const receipt = { ...makeValidReceipt(), gitStatus: undefined as unknown as ReadinessGitStatus };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'HoloShellReadinessReceipt.gitStatus is required.',
    );
  });

  it('validates gitStatus fields', () => {
    const receipt = makeValidReceipt();
    receipt.gitStatus = { ...receipt.gitStatus, changedFiles: -1 };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'ReadinessGitStatus.changedFiles must be a non-negative number.',
    );
  });

  it('requires buildReceipt', () => {
    const receipt = { ...makeValidReceipt(), buildReceipt: undefined as unknown as LocalCliAbsorptionReceipt };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'HoloShellReadinessReceipt.buildReceipt is required.',
    );
  });

  it('requires sourceValidation', () => {
    const receipt = { ...makeValidReceipt(), sourceValidation: undefined as unknown as ReadinessSourceValidation };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'HoloShellReadinessReceipt.sourceValidation is required.',
    );
  });

  it('validates sourceValidation checks', () => {
    const receipt = makeValidReceipt();
    receipt.sourceValidation = {
      ...receipt.sourceValidation,
      checks: [{ id: '', label: '', status: 'pass' }],
    };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'ReadinessValidationCheck.id is required.',
    );
  });

  it('requires deviceLab', () => {
    const receipt = { ...makeValidReceipt(), deviceLab: undefined as unknown as ReadinessDeviceLabStatus };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'HoloShellReadinessReceipt.deviceLab is required.',
    );
  });

  it('validates deviceLab checks', () => {
    const receipt = makeValidReceipt();
    receipt.deviceLab = {
      ...receipt.deviceLab,
      checks: [{ id: 'gpu', label: 'GPU', status: 'bad' as 'pass' }],
    };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'ReadinessDeviceLabCheck.status is unsupported: bad.',
    );
  });

  it('requires graphStatus', () => {
    const receipt = { ...makeValidReceipt(), graphStatus: undefined as unknown as ReadinessGraphStatus };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'HoloShellReadinessReceipt.graphStatus is required.',
    );
  });

  it('validates graphStatus fields', () => {
    const receipt = makeValidReceipt();
    receipt.graphStatus = { ...receipt.graphStatus, nodeCount: -5 };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'ReadinessGraphStatus.nodeCount must be a non-negative number.',
    );
  });

  it('validates optional taskFiling', () => {
    const receipt = makeValidReceipt();
    receipt.taskFiling = { tasksFiled: -1 } as ReadinessTaskFiling;
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'ReadinessTaskFiling.tasksFiled must be a non-negative number.',
    );
  });

  it('requires hash', () => {
    const receipt = { ...makeValidReceipt(), hash: '' };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'HoloShellReadinessReceipt.hash is required.',
    );
  });

  it('requires hashAlgorithm', () => {
    const receipt = { ...makeValidReceipt(), hashAlgorithm: '' as unknown as 'sha256' };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'HoloShellReadinessReceipt.hashAlgorithm is required.',
    );
  });

  it('rejects unsupported overallOutcome', () => {
    const receipt = { ...makeValidReceipt(), overallOutcome: 'success' as unknown as 'pass' };
    expect(validateHoloShellReadinessReceipt(receipt)).toContain(
      'HoloShellReadinessReceipt.overallOutcome is unsupported: success.',
    );
  });
});

describe('cloneHoloShellReadinessReceipt', () => {
  it('produces an equal but independent copy', () => {
    const original = makeValidReceipt();
    const clone = cloneHoloShellReadinessReceipt(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.gitStatus).not.toBe(original.gitStatus);
    expect(clone.sourceValidation).not.toBe(original.sourceValidation);
    expect(clone.sourceValidation.checks).not.toBe(original.sourceValidation.checks);
    expect(clone.deviceLab).not.toBe(original.deviceLab);
    expect(clone.deviceLab.checks).not.toBe(original.deviceLab.checks);
    expect(clone.graphStatus).not.toBe(original.graphStatus);
    expect(clone.taskFiling).not.toBe(original.taskFiling);
    expect(clone.taskFiling?.taskIds).not.toBe(original.taskFiling?.taskIds);
    expect(clone.provenance).not.toBe(original.provenance);
    expect(clone.verificationCommands).not.toBe(original.verificationCommands);
    expect(clone.metadata).not.toBe(original.metadata);
  });

  it('handles minimal receipt without optional fields', () => {
    const minimal: HoloShellReadinessReceipt = {
      id: 'minimal',
      workflow: 'test',
      startedAt: '2026-05-14T09:00:00Z',
      endedAt: '2026-05-14T09:01:00Z',
      gitStatus: {
        branch: 'main',
        commitShort: 'abc',
        changedFiles: 0,
        stagedFiles: 0,
        untrackedFiles: 0,
        aheadBehind: '0/0',
        isClean: true,
      },
      buildReceipt: makeValidBuildReceipt(),
      sourceValidation: {
        status: 'pass',
        checks: [],
      },
      deviceLab: {
        status: 'pass',
        checks: [],
      },
      graphStatus: {
        graphLoaded: true,
        nodeCount: 0,
        edgeCount: 0,
      },
      overallOutcome: 'pass',
      hash: 'hash',
      hashAlgorithm: 'sha256',
    };
    const clone = cloneHoloShellReadinessReceipt(minimal);
    expect(clone).toEqual(minimal);
    expect(clone.taskFiling).toBeUndefined();
    expect(clone.provenance).toBeUndefined();
    expect(clone.verificationCommands).toBeUndefined();
    expect(clone.metadata).toBeUndefined();
  });
});
