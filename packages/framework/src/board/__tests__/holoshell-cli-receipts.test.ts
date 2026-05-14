/**
 * HoloShell Local CLI Absorption Receipt — Unit Tests
 *
 * Validates the pilot receipt model, validator, type guard, and clone.
 */

import { describe, it, expect } from 'vitest';
import {
  CLI_ACTION_KINDS,
  type CliAction,
  type LocalCliPolicy,
  type LocalCliAbsorptionReceipt,
  validateLocalCliAbsorptionReceipt,
  isSupportedCliActionKind,
  isSupportedCliAbsorptionOutcome,
  cloneLocalCliAbsorptionReceipt,
} from '../holoshell-cli-receipts';

function makeValidReceipt(): LocalCliAbsorptionReceipt {
  return {
    id: 'cli_build_001',
    projectPath: 'C:\\Users\\josep\\Documents\\GitHub\\HoloScript',
    binary: 'pnpm',
    args: ['build'],
    startedAt: '2026-05-13T10:00:00Z',
    endedAt: '2026-05-13T10:01:00Z',
    policy: {
      allowedBinaries: ['pnpm', 'npm', 'cargo'],
      blockedBinaries: ['rm', 'del', 'format'],
      allowedPaths: ['C:\\Users\\josep\\Documents\\GitHub\\HoloScript'],
      blockedPaths: ['C:\\Windows', 'C:\\Program Files'],
      maxDurationMs: 300_000,
      captureStdout: true,
      captureStderr: true,
      captureExitCode: true,
      captureLockfileDiff: true,
      captureNetworkLog: false,
      auditEnvironment: true,
    },
    exitCode: 0,
    stdoutHash: 'abc123',
    stderrHash: 'def456',
    lockfileDiffHash: 'ghi789',
    buildArtifactHash: 'jkl012',
    actions: [
      {
        step: 0,
        kind: 'exec',
        timestamp: '2026-05-13T10:00:00Z',
        command: 'pnpm',
        args: ['build'],
        cwd: 'C:\\Users\\josep\\Documents\\GitHub\\HoloScript',
        exitCode: 0,
        durationMs: 45_000,
      },
      {
        step: 1,
        kind: 'test',
        timestamp: '2026-05-13T10:00:50Z',
        command: 'pnpm',
        args: ['test'],
        cwd: 'C:\\Users\\josep\\Documents\\GitHub\\HoloScript',
        exitCode: 0,
        durationMs: 8_000,
      },
    ],
    outcome: 'success',
    summary: 'Built HoloScript core and passed tests.',
    hash: 'receipt_hash_001',
    hashAlgorithm: 'sha256',
    provenance: {
      parentArtifactIds: ['task_1778625587950_uiv5'],
    },
    verificationCommands: [
      {
        command: 'pnpm build && pnpm test',
        description: 'Replay the local CLI build and test sequence',
      },
    ],
    metadata: { platform: 'win32', shell: 'powershell' },
  };
}

describe('CLI_ACTION_KINDS', () => {
  it('contains all 9 action kinds', () => {
    expect(CLI_ACTION_KINDS).toHaveLength(9);
    expect(CLI_ACTION_KINDS).toContain('exec');
    expect(CLI_ACTION_KINDS).toContain('install');
    expect(CLI_ACTION_KINDS).toContain('build');
    expect(CLI_ACTION_KINDS).toContain('test');
    expect(CLI_ACTION_KINDS).toContain('lint');
    expect(CLI_ACTION_KINDS).toContain('format');
    expect(CLI_ACTION_KINDS).toContain('clean');
    expect(CLI_ACTION_KINDS).toContain('deploy');
    expect(CLI_ACTION_KINDS).toContain('other');
  });
});

describe('isSupportedCliActionKind', () => {
  it('returns true for known kinds', () => {
    expect(isSupportedCliActionKind('exec')).toBe(true);
    expect(isSupportedCliActionKind('build')).toBe(true);
    expect(isSupportedCliActionKind('other')).toBe(true);
  });

  it('returns false for unknown kinds', () => {
    expect(isSupportedCliActionKind('hack')).toBe(false);
    expect(isSupportedCliActionKind('')).toBe(false);
  });
});

describe('isSupportedCliAbsorptionOutcome', () => {
  it('returns true for known outcomes', () => {
    expect(isSupportedCliAbsorptionOutcome('success')).toBe(true);
    expect(isSupportedCliAbsorptionOutcome('failure')).toBe(true);
    expect(isSupportedCliAbsorptionOutcome('timeout')).toBe(true);
    expect(isSupportedCliAbsorptionOutcome('blocked_by_policy')).toBe(true);
  });

  it('returns false for unknown outcomes', () => {
    expect(isSupportedCliAbsorptionOutcome('cancelled')).toBe(false);
    expect(isSupportedCliAbsorptionOutcome('')).toBe(false);
  });
});

describe('validateLocalCliAbsorptionReceipt', () => {
  it('returns empty for a valid receipt', () => {
    const receipt = makeValidReceipt();
    expect(validateLocalCliAbsorptionReceipt(receipt)).toEqual([]);
  });

  it('requires id', () => {
    const receipt = { ...makeValidReceipt(), id: '' };
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'LocalCliAbsorptionReceipt.id is required.',
    );
  });

  it('requires projectPath', () => {
    const receipt = { ...makeValidReceipt(), projectPath: '' };
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'LocalCliAbsorptionReceipt.projectPath is required.',
    );
  });

  it('requires binary', () => {
    const receipt = { ...makeValidReceipt(), binary: '' };
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'LocalCliAbsorptionReceipt.binary is required.',
    );
  });

  it('requires valid startedAt', () => {
    const receipt = { ...makeValidReceipt(), startedAt: 'invalid' };
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'LocalCliAbsorptionReceipt.startedAt is required and must be a valid ISO-8601 timestamp.',
    );
  });

  it('requires valid endedAt', () => {
    const receipt = { ...makeValidReceipt(), endedAt: '' };
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'LocalCliAbsorptionReceipt.endedAt is required and must be a valid ISO-8601 timestamp.',
    );
  });

  it('requires exitCode as number', () => {
    const receipt = { ...makeValidReceipt(), exitCode: undefined as unknown as number };
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'LocalCliAbsorptionReceipt.exitCode is required and must be a number.',
    );
  });

  it('requires policy', () => {
    const receipt = { ...makeValidReceipt(), policy: undefined as unknown as LocalCliPolicy };
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'LocalCliAbsorptionReceipt.policy is required.',
    );
  });

  it('requires policy.allowedBinaries as array', () => {
    const receipt = makeValidReceipt();
    receipt.policy = { ...receipt.policy, allowedBinaries: 'bad' as unknown as string[] };
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'LocalCliAbsorptionReceipt.policy.allowedBinaries must be an array.',
    );
  });

  it('requires policy.maxDurationMs as non-negative number', () => {
    const receipt = makeValidReceipt();
    receipt.policy = { ...receipt.policy, maxDurationMs: -1 };
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'LocalCliAbsorptionReceipt.policy.maxDurationMs must be a non-negative number.',
    );
  });

  it('requires policy.captureStdout as boolean', () => {
    const receipt = makeValidReceipt();
    receipt.policy = { ...receipt.policy, captureStdout: 'true' as unknown as boolean };
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'LocalCliAbsorptionReceipt.policy.captureStdout must be a boolean.',
    );
  });

  it('requires hash', () => {
    const receipt = { ...makeValidReceipt(), hash: '' };
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'LocalCliAbsorptionReceipt.hash is required.',
    );
  });

  it('requires hashAlgorithm', () => {
    const receipt = { ...makeValidReceipt(), hashAlgorithm: '' as unknown as 'sha256' };
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'LocalCliAbsorptionReceipt.hashAlgorithm is required.',
    );
  });

  it('rejects unsupported action kind', () => {
    const receipt = makeValidReceipt();
    receipt.actions = [{ ...receipt.actions[0], kind: 'hack' as unknown as CliAction['kind'] }];
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'CliAction kind is unsupported: hack.',
    );
  });

  it('rejects action with negative step', () => {
    const receipt = makeValidReceipt();
    receipt.actions = [{ ...receipt.actions[0], step: -1 }];
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'CliAction step must be a non-negative integer.',
    );
  });

  it('rejects action with invalid timestamp', () => {
    const receipt = makeValidReceipt();
    receipt.actions = [{ ...receipt.actions[0], timestamp: 'not-a-date' }];
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'CliAction step 0 timestamp is invalid.',
    );
  });

  it('rejects action with negative durationMs', () => {
    const receipt = makeValidReceipt();
    receipt.actions = [{ ...receipt.actions[0], durationMs: -100 }];
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'CliAction step 0 durationMs must be a non-negative number.',
    );
  });

  it('rejects unsupported outcome', () => {
    const receipt = { ...makeValidReceipt(), outcome: 'cancelled' as unknown as LocalCliAbsorptionReceipt['outcome'] };
    expect(validateLocalCliAbsorptionReceipt(receipt)).toContain(
      'LocalCliAbsorptionReceipt.outcome is unsupported: cancelled.',
    );
  });
});

describe('cloneLocalCliAbsorptionReceipt', () => {
  it('produces an equal but independent copy', () => {
    const original = makeValidReceipt();
    const clone = cloneLocalCliAbsorptionReceipt(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.policy).not.toBe(original.policy);
    expect(clone.actions).not.toBe(original.actions);
    expect(clone.policy.allowedBinaries).not.toBe(original.policy.allowedBinaries);
    expect(clone.verificationCommands).not.toBe(original.verificationCommands);
    expect(clone.args).not.toBe(original.args);
  });

  it('handles optional fields gracefully', () => {
    const minimal: LocalCliAbsorptionReceipt = {
      id: 'minimal',
      projectPath: '/tmp',
      binary: 'echo',
      args: ['hello'],
      startedAt: '2026-05-13T10:00:00Z',
      endedAt: '2026-05-13T10:01:00Z',
      policy: {
        allowedBinaries: [],
        blockedBinaries: [],
        allowedPaths: [],
        blockedPaths: [],
        maxDurationMs: 60_000,
        captureStdout: false,
        captureStderr: false,
        captureExitCode: false,
        captureLockfileDiff: false,
        captureNetworkLog: false,
        auditEnvironment: false,
      },
      exitCode: 0,
      actions: [],
      outcome: 'success',
      hash: 'hash',
      hashAlgorithm: 'sha256',
    };
    const clone = cloneLocalCliAbsorptionReceipt(minimal);
    expect(clone).toEqual(minimal);
    expect(clone.stdoutHash).toBeUndefined();
    expect(clone.stderrHash).toBeUndefined();
    expect(clone.lockfileDiffHash).toBeUndefined();
    expect(clone.buildArtifactHash).toBeUndefined();
    expect(clone.networkLogHash).toBeUndefined();
    expect(clone.environmentAuditHash).toBeUndefined();
    expect(clone.provenance).toBeUndefined();
    expect(clone.verificationCommands).toBeUndefined();
    expect(clone.metadata).toBeUndefined();
  });
});
