import { describe, expect, it } from 'vitest';
import {
  HOLOSHELL_MANAGED_SERVICE_RESTART_RECEIPT_PACK_VERSION,
  MANAGED_LOCAL_SERVICES,
  MANAGED_SERVICE_ACTIONS,
  MANAGED_SERVICE_PERMISSION_ENVELOPES,
  isSupportedManagedLocalService,
  isSupportedManagedServiceAction,
  isSupportedManagedServicePermissionEnvelope,
  validateHoloShellManagedServiceRestartReceiptPack,
  cloneHoloShellManagedServiceRestartReceiptPack,
  type HoloShellManagedServiceRestartReceiptPack,
} from '../holoshell-managed-service-restart-receipts';

const validRestartPack: HoloShellManagedServiceRestartReceiptPack = {
  schemaVersion: HOLOSHELL_MANAGED_SERVICE_RESTART_RECEIPT_PACK_VERSION,
  id: 'service-restart-valid',
  workflow: 'process-owner-lane-restart',
  generatedAt: '2026-05-20T12:00:00.000Z',
  requestedAction: 'restart',
  targetService: 'holoshell-control-daemon',
  permissionEnvelope: 'guarded_service_mutation',
  services: [
    {
      serviceId: 'holoshell-control-daemon',
      status: 'online',
      localOnly: true,
      pid: 4242,
      pidAlive: true,
      pidCommandVerified: true,
      commandLineObserved: true,
      rawCommandLineIncluded: false,
      executeEnabled: false,
      trustedExecuteEnabled: false,
      serviceMutationTaken: true,
      destructiveActionsTaken: false,
      statusHash: 'sha256:before-status',
      adapter: 'scripts/holoshell-control-daemon-service.mjs',
      source: 'apps/holoshell/source/holoshell-control-daemon-service.hsplus',
    },
  ],
  pidGate: {
    serviceId: 'holoshell-control-daemon',
    exactPidRequired: true,
    pid: 4242,
    pidAlive: true,
    pidCommandVerified: true,
    commandHash: 'sha256:redacted-command',
    commandLineObserved: true,
    rawCommandLineIncluded: false,
    unverifiedPidStopRefused: true,
    stopOnlyVerifiedManagedPid: true,
    forceKillAllowed: false,
  },
  approval: {
    approvalId: 'svc-approval-001',
    approvalRequired: true,
    approvalCaptured: true,
    freshHumanGestureCaptured: true,
    ownerAckRequired: false,
    ownerAckCaptured: false,
    requestedAction: 'restart',
    targetService: 'holoshell-control-daemon',
    approvedCommandPreview: 'holoshell control-daemon restart --receipt',
    rollbackLimits: [
      'Restart may drop in-flight daemon subscriptions.',
      'No force-kill is allowed for unverified PIDs.',
    ],
    expiresAt: '2026-05-20T12:05:00.000Z',
  },
  afterAction: {
    requestedAction: 'restart',
    targetService: 'holoshell-control-daemon',
    status: 'online',
    serviceMutationTaken: true,
    destructiveActionsTaken: false,
    beforeStatusHash: 'sha256:before-status',
    afterStatusHash: 'sha256:after-status',
    beforePid: 4242,
    afterPid: 5252,
    afterPidAlive: true,
    afterPidCommandVerified: true,
    rawCommandLineIncluded: false,
  },
  replayKey: 'sha256:service-restart-replay',
  hash: 'sha256:pack-hash',
  hashAlgorithm: 'sha256',
  sourceAnchors: {
    serviceRoom: 'apps/holoshell/source/holoshell-world-build-service-bay.holo',
    serviceSource: 'apps/holoshell/source/holoshell-control-daemon-service.hsplus',
    adapter: 'scripts/holoshell-control-daemon-service.mjs',
    upstreamValidator: 'packages/framework/src/board/holoshell-managed-service-restart-receipts.ts',
  },
  verificationCommands: ['node scripts/holoshell-control-daemon-service.mjs --self-test --json'],
  provenance: ['experiments/holoshell-human-os-frontier/process-owner-lane-restart-policy.hsplus'],
};

describe('HoloShell managed service restart constants', () => {
  it('covers the local service bay vocabulary', () => {
    expect(MANAGED_LOCAL_SERVICES).toContain('holoshell-control-daemon');
    expect(MANAGED_SERVICE_ACTIONS).toContain('restart');
    expect(MANAGED_SERVICE_ACTIONS).toContain('enable_execute');
    expect(MANAGED_SERVICE_PERMISSION_ENVELOPES).toContain('guarded_service_mutation');
    expect(isSupportedManagedLocalService('holoshell-service-supervisor')).toBe(true);
    expect(isSupportedManagedServiceAction('ambient_kill')).toBe(false);
    expect(isSupportedManagedServicePermissionEnvelope('silent_admin')).toBe(false);
  });
});

describe('validateHoloShellManagedServiceRestartReceiptPack', () => {
  it('accepts a verified service restart with approval and after-action hashes', () => {
    expect(validateHoloShellManagedServiceRestartReceiptPack(validRestartPack)).toEqual([]);
  });

  it('accepts status-only receipts in read-only mode', () => {
    const statusPack: HoloShellManagedServiceRestartReceiptPack = {
      ...validRestartPack,
      requestedAction: 'status',
      permissionEnvelope: 'read_only',
      approval: undefined,
      afterAction: undefined,
      services: [
        {
          ...validRestartPack.services[0],
          status: 'offline',
          pid: null,
          pidAlive: false,
          pidCommandVerified: false,
          serviceMutationTaken: false,
          statusHash: 'sha256:offline-status',
        },
      ],
      pidGate: {
        ...validRestartPack.pidGate,
        pid: null,
        pidAlive: false,
        pidCommandVerified: false,
      },
    };
    expect(validateHoloShellManagedServiceRestartReceiptPack(statusPack)).toEqual([]);
  });

  it('rejects raw command leakage', () => {
    const pack = {
      ...validRestartPack,
      pidGate: { ...validRestartPack.pidGate, rawCommandLineIncluded: true },
    };
    expect(validateHoloShellManagedServiceRestartReceiptPack(pack)).toContain(
      'VerifiedPidGateReceipt must not include raw command lines.'
    );
  });

  it('rejects unverified stop or restart PIDs', () => {
    const pack = {
      ...validRestartPack,
      pidGate: { ...validRestartPack.pidGate, pidCommandVerified: false },
    };
    expect(validateHoloShellManagedServiceRestartReceiptPack(pack)).toContain(
      'Stop or restart actions require a verified managed PID.'
    );
  });

  it('rejects mutation without fresh captured approval', () => {
    const pack = {
      ...validRestartPack,
      approval: {
        ...validRestartPack.approval!,
        approvalCaptured: false,
        freshHumanGestureCaptured: false,
      },
    };
    const errors = validateHoloShellManagedServiceRestartReceiptPack(pack);
    expect(errors).toEqual(
      expect.arrayContaining([
        'Service mutation receipts must capture approval before mutation.',
        'Service mutation receipts must capture a fresh human gesture.',
      ])
    );
  });

  it('rejects execute escalation without owner ack', () => {
    const pack: HoloShellManagedServiceRestartReceiptPack = {
      ...validRestartPack,
      requestedAction: 'enable_execute',
      permissionEnvelope: 'break_glass_execute_permission',
      approval: {
        ...validRestartPack.approval!,
        requestedAction: 'enable_execute',
        ownerAckRequired: true,
        ownerAckCaptured: false,
      },
      afterAction: undefined,
    };
    expect(validateHoloShellManagedServiceRestartReceiptPack(pack)).toContain(
      'Execute permission escalation requires captured owner ack.'
    );
  });

  it('deep-clones arrays and nested receipts', () => {
    const clone = cloneHoloShellManagedServiceRestartReceiptPack(validRestartPack);
    clone.services[0].statusHash = 'changed';
    clone.approval!.rollbackLimits.push('changed');
    clone.verificationCommands![0] = 'changed';
    expect(validRestartPack.services[0].statusHash).toBe('sha256:before-status');
    expect(validRestartPack.approval!.rollbackLimits).toHaveLength(2);
    expect(validRestartPack.verificationCommands![0]).toBe(
      'node scripts/holoshell-control-daemon-service.mjs --self-test --json'
    );
  });
});
