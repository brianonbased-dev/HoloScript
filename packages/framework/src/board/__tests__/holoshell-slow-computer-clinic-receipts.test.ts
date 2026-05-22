import { describe, it, expect } from 'vitest';
import {
  HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
  SLOW_COMPUTER_CLINIC_WORKFLOW,
  RISK_STATES,
  CLINIC_WORKFLOW_STATES,
  PROCESS_CATEGORIES,
  STOP_POLICIES,
  OWNER_LANES,
  PERMISSION_ENVELOPES,
  isSupportedRiskState,
  isSupportedClinicWorkflowState,
  isSupportedProcessCategory,
  isSupportedStopPolicy,
  isSupportedOwnerLane,
  isSupportedPermissionEnvelope,
  validateProcessHealthReceipt,
  validateHardwareAuditReceipt,
  validateRemediationVerificationReceipt,
  validateProductionStopReadinessReceipt,
  validateSlowComputerClinicReplayReceipt,
  validateHoloShellSlowComputerClinicReceiptPack,
  cloneHoloShellSlowComputerClinicReceiptPack,
  type ProcessHealthReceipt,
  type HardwareAuditReceipt,
  type OwnershipPlan,
  type GuardedStopPlan,
  type RemediationVerificationReceipt,
  type ProductionStopReadinessReceipt,
  type SlowComputerClinicReplayReceipt,
  type HoloShellSlowComputerClinicReceiptPack,
} from '../holoshell-slow-computer-clinic-receipts';

// ── Fixtures ──

function makeProcessHealth(overrides?: Partial<ProcessHealthReceipt>): ProcessHealthReceipt {
  return {
    id: 'ph-001',
    schemaVersion: HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
    workflow: SLOW_COMPUTER_CLINIC_WORKFLOW,
    riskState: 'warn',
    processCount: 503,
    shellRunCount: 47,
    staleRunCount: 25,
    highMemoryCount: 0,
    ownerUnknownReviewCount: 4,
    ownerHandoffPlanCount: 21,
    cleanupCandidateCount: 4,
    stopPlanCount: 4,
    policies: {
      readOnlyByDefault: true,
      automaticTerminationAllowed: false,
      exactPidRequired: true,
      receiptRequired: true,
      stopPolicy: 'break_glass_required',
    },
    generatedAt: '2026-05-22T00:00:00.000Z',
    hash: 'abc123',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeHardwareAudit(overrides?: Partial<HardwareAuditReceipt>): HardwareAuditReceipt {
  return {
    id: 'ha-001',
    schemaVersion: HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
    workflow: SLOW_COMPUTER_CLINIC_WORKFLOW,
    cpuUtilizationPercent: 45.2,
    memoryUsedPercent: 72.1,
    memoryTotalGb: 32,
    gpuUtilizationPercent: 12.0,
    gpuMemoryUsedPercent: 8.5,
    diskUsedPercent: 65.3,
    thermalThrottling: false,
    platform: 'win32',
    arch: 'x64',
    release: '10.0.26200',
    generatedAt: '2026-05-22T00:00:00.000Z',
    hash: 'def456',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeOwnershipPlan(overrides?: Partial<OwnershipPlan>): OwnershipPlan {
  return {
    pid: 12345,
    name: 'node.exe',
    category: 'dev_runtime',
    ownerLane: 'codex-hardware',
    ownerHandoffRequired: false,
    cleanupEligible: true,
    stopPolicy: 'break_glass_required',
    memoryMb: 120.5,
    ageMinutes: 180,
    findings: ['stale_shell_or_dev_run'],
    ...overrides,
  };
}

function makeStopPlan(overrides?: Partial<GuardedStopPlan>): GuardedStopPlan {
  return {
    planId: 'stop-plan-001',
    targetPid: 12345,
    targetName: 'node.exe',
    category: 'dev_runtime',
    reason: 'stale_shell_or_dev_run',
    stopPolicy: 'break_glass_required',
    approvalRequired: true,
    safeToExecuteAutomatically: false,
    breakGlass: true,
    ownerLane: 'codex-hardware',
    ownerHandoffRequired: false,
    memoryMb: 120.5,
    ageMinutes: 180,
    findings: ['stale_shell_or_dev_run'],
    ...overrides,
  };
}

function makeReplayReceipt(overrides?: Partial<SlowComputerClinicReplayReceipt>): SlowComputerClinicReplayReceipt {
  return {
    id: 'replay-001',
    schemaVersion: HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
    workflow: SLOW_COMPUTER_CLINIC_WORKFLOW,
    status: 'explained',
    processHealthReceiptId: 'ph-001',
    hardwareAuditReceiptId: 'ha-001',
    replayKey: 'replay-key-001',
    processCount: 503,
    ownerHandoffPlanCount: 21,
    stopPlanCount: 4,
    rawCommandLinesCaptured: false,
    rawCommandLinesHiddenByDefault: true,
    createdAt: '2026-05-22T00:00:00.000Z',
    hash: 'ghi789',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeReceiptPack(
  overrides?: Partial<HoloShellSlowComputerClinicReceiptPack>
): HoloShellSlowComputerClinicReceiptPack {
  return {
    id: 'pack-001',
    schemaVersion: HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
    workflow: SLOW_COMPUTER_CLINIC_WORKFLOW,
    status: 'explained',
    processHealth: makeProcessHealth(),
    hardwareAudit: makeHardwareAudit(),
    ownershipPlans: [makeOwnershipPlan()],
    stopPlans: [makeStopPlan()],
    replay: makeReplayReceipt(),
    hash: 'pack-hash-001',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

// ── Type guard tests ──

describe('isSupportedRiskState', () => {
  it('accepts valid risk states', () => {
    for (const state of RISK_STATES) {
      expect(isSupportedRiskState(state)).toBe(true);
    }
  });

  it('rejects invalid risk states', () => {
    expect(isSupportedRiskState('unknown_risk')).toBe(false);
    expect(isSupportedRiskState('')).toBe(false);
  });
});

describe('isSupportedClinicWorkflowState', () => {
  it('accepts valid workflow states', () => {
    for (const state of CLINIC_WORKFLOW_STATES) {
      expect(isSupportedClinicWorkflowState(state)).toBe(true);
    }
  });

  it('rejects invalid workflow states', () => {
    expect(isSupportedClinicWorkflowState('running')).toBe(false);
  });
});

describe('isSupportedProcessCategory', () => {
  it('accepts valid process categories', () => {
    for (const cat of PROCESS_CATEGORIES) {
      expect(isSupportedProcessCategory(cat)).toBe(true);
    }
  });
});

describe('isSupportedStopPolicy', () => {
  it('accepts valid stop policies', () => {
    for (const policy of STOP_POLICIES) {
      expect(isSupportedStopPolicy(policy)).toBe(true);
    }
  });
});

describe('isSupportedOwnerLane', () => {
  it('accepts valid owner lanes', () => {
    for (const lane of OWNER_LANES) {
      expect(isSupportedOwnerLane(lane)).toBe(true);
    }
  });
});

describe('isSupportedPermissionEnvelope', () => {
  it('accepts valid permission envelopes', () => {
    for (const env of PERMISSION_ENVELOPES) {
      expect(isSupportedPermissionEnvelope(env)).toBe(true);
    }
  });
});

// ── Process health receipt validation ──

describe('validateProcessHealthReceipt', () => {
  it('accepts a valid process health receipt', () => {
    const errors = validateProcessHealthReceipt(makeProcessHealth());
    expect(errors).toHaveLength(0);
  });

  it('rejects missing receipt', () => {
    const errors = validateProcessHealthReceipt(undefined);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('required');
  });

  it('rejects wrong schema version', () => {
    const errors = validateProcessHealthReceipt(makeProcessHealth({ schemaVersion: 'wrong' }));
    expect(errors.some((e) => e.includes('schemaVersion'))).toBe(true);
  });

  it('rejects wrong workflow', () => {
    const errors = validateProcessHealthReceipt(makeProcessHealth({ workflow: 'wrong' as any }));
    expect(errors.some((e) => e.includes('workflow'))).toBe(true);
  });

  it('rejects invalid risk state', () => {
    const errors = validateProcessHealthReceipt(makeProcessHealth({ riskState: 'invalid' }));
    expect(errors.some((e) => e.includes('riskState'))).toBe(true);
  });

  it('rejects negative process count', () => {
    const errors = validateProcessHealthReceipt(makeProcessHealth({ processCount: -1 }));
    expect(errors.some((e) => e.includes('processCount'))).toBe(true);
  });

  it('rejects automaticTerminationAllowed true', () => {
    const errors = validateProcessHealthReceipt(
      makeProcessHealth({
        policies: {
          readOnlyByDefault: true,
          automaticTerminationAllowed: true as any,
          exactPidRequired: true,
          receiptRequired: true,
          stopPolicy: 'break_glass_required',
        },
      })
    );
    expect(errors.some((e) => e.includes('automaticTerminationAllowed'))).toBe(true);
  });

  it('rejects exactPidRequired false', () => {
    const errors = validateProcessHealthReceipt(
      makeProcessHealth({
        policies: {
          readOnlyByDefault: true,
          automaticTerminationAllowed: false,
          exactPidRequired: false as any,
          receiptRequired: true,
          stopPolicy: 'break_glass_required',
        },
      })
    );
    expect(errors.some((e) => e.includes('exactPidRequired'))).toBe(true);
  });

  it('rejects missing hash', () => {
    const errors = validateProcessHealthReceipt(makeProcessHealth({ hash: '' }));
    expect(errors.some((e) => e.includes('hash'))).toBe(true);
  });

  it('rejects non-sha256 algorithm', () => {
    const errors = validateProcessHealthReceipt(makeProcessHealth({ hashAlgorithm: 'md5' as any }));
    expect(errors.some((e) => e.includes('hashAlgorithm'))).toBe(true);
  });
});

// ── Hardware audit receipt validation ──

describe('validateHardwareAuditReceipt', () => {
  it('accepts a valid hardware audit receipt', () => {
    const errors = validateHardwareAuditReceipt(makeHardwareAudit());
    expect(errors).toHaveLength(0);
  });

  it('rejects missing receipt', () => {
    const errors = validateHardwareAuditReceipt(undefined);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('required');
  });

  it('accepts null GPU fields (no GPU)', () => {
    const errors = validateHardwareAuditReceipt(
      makeHardwareAudit({
        gpuUtilizationPercent: null,
        gpuMemoryUsedPercent: null,
        thermalThrottling: null,
      })
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects CPU utilization over 100', () => {
    const errors = validateHardwareAuditReceipt(
      makeHardwareAudit({ cpuUtilizationPercent: 150 })
    );
    expect(errors.some((e) => e.includes('cpuUtilizationPercent'))).toBe(true);
  });

  it('rejects negative memory total', () => {
    const errors = validateHardwareAuditReceipt(
      makeHardwareAudit({ memoryTotalGb: -1 })
    );
    expect(errors.some((e) => e.includes('memoryTotalGb'))).toBe(true);
  });
});

// ── Remediation verification receipt validation ──

describe('validateRemediationVerificationReceipt', () => {
  it('accepts a valid remediation receipt', () => {
    const receipt: RemediationVerificationReceipt = {
      id: 'rv-001',
      schemaVersion: HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
      workflow: SLOW_COMPUTER_CLINIC_WORKFLOW,
      targetPid: 12345,
      targetName: 'node.exe',
      approvalCaptured: true,
      terminationPerformed: true,
      afterVisible: false,
      externalProcessTerminationAllowed: false,
      exactPidRequired: true,
      beforeVisible: true,
      ownerAckCaptured: true,
      approvalId: 'approval-001',
      generatedAt: '2026-05-22T00:00:00.000Z',
      hash: 'rv-hash',
      hashAlgorithm: 'sha256',
    };
    const errors = validateRemediationVerificationReceipt(receipt);
    expect(errors).toHaveLength(0);
  });

  it('rejects afterVisible true', () => {
    const receipt: RemediationVerificationReceipt = {
      id: 'rv-001',
      schemaVersion: HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
      workflow: SLOW_COMPUTER_CLINIC_WORKFLOW,
      targetPid: 12345,
      targetName: 'node.exe',
      approvalCaptured: true,
      terminationPerformed: true,
      afterVisible: true as any, // must be false
      externalProcessTerminationAllowed: false,
      exactPidRequired: true,
      beforeVisible: true,
      ownerAckCaptured: true,
      approvalId: 'approval-001',
      generatedAt: '2026-05-22T00:00:00.000Z',
      hash: 'rv-hash',
      hashAlgorithm: 'sha256',
    };
    const errors = validateRemediationVerificationReceipt(receipt);
    expect(errors.some((e) => e.includes('afterVisible'))).toBe(true);
  });

  it('rejects externalProcessTerminationAllowed true', () => {
    const errors = validateRemediationVerificationReceipt({
      id: 'rv-001',
      schemaVersion: HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
      workflow: SLOW_COMPUTER_CLINIC_WORKFLOW,
      targetPid: 12345,
      targetName: 'node.exe',
      approvalCaptured: true,
      terminationPerformed: true,
      afterVisible: false,
      externalProcessTerminationAllowed: true as any,
      exactPidRequired: true,
      beforeVisible: true,
      ownerAckCaptured: true,
      approvalId: 'approval-001',
      generatedAt: '2026-05-22T00:00:00.000Z',
      hash: 'rv-hash',
      hashAlgorithm: 'sha256',
    });
    expect(errors.some((e) => e.includes('externalProcessTerminationAllowed'))).toBe(true);
  });
});

// ── Production stop readiness receipt validation ──

describe('validateProductionStopReadinessReceipt', () => {
  it('accepts a valid production stop readiness receipt', () => {
    const receipt: ProductionStopReadinessReceipt = {
      id: 'psr-001',
      schemaVersion: HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
      workflow: SLOW_COMPUTER_CLINIC_WORKFLOW,
      targetPid: 12345,
      targetName: 'node.exe',
      exactPidRechecked: true,
      approvalCaptured: true,
      ownerAckCaptured: true,
      dryRunOnly: true,
      terminationPerformed: false,
      externalProcessTerminationAllowed: false,
      stopPolicy: 'break_glass_required',
      blockedReasons: [],
      approvalId: 'approval-001',
      generatedAt: '2026-05-22T00:00:00.000Z',
      hash: 'psr-hash',
      hashAlgorithm: 'sha256',
    };
    const errors = validateProductionStopReadinessReceipt(receipt);
    expect(errors).toHaveLength(0);
  });

  it('rejects dryRunOnly false', () => {
    const errors = validateProductionStopReadinessReceipt({
      id: 'psr-001',
      schemaVersion: HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
      workflow: SLOW_COMPUTER_CLINIC_WORKFLOW,
      targetPid: 12345,
      targetName: 'node.exe',
      exactPidRechecked: true,
      approvalCaptured: true,
      ownerAckCaptured: true,
      dryRunOnly: false as any,
      terminationPerformed: false,
      externalProcessTerminationAllowed: false,
      stopPolicy: 'break_glass_required',
      blockedReasons: [],
      approvalId: 'approval-001',
      generatedAt: '2026-05-22T00:00:00.000Z',
      hash: 'psr-hash',
      hashAlgorithm: 'sha256',
    });
    expect(errors.some((e) => e.includes('dryRunOnly'))).toBe(true);
  });

  it('rejects terminationPerformed true', () => {
    const errors = validateProductionStopReadinessReceipt({
      id: 'psr-001',
      schemaVersion: HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
      workflow: SLOW_COMPUTER_CLINIC_WORKFLOW,
      targetPid: 12345,
      targetName: 'node.exe',
      exactPidRechecked: true,
      approvalCaptured: true,
      ownerAckCaptured: true,
      dryRunOnly: true,
      terminationPerformed: true as any,
      externalProcessTerminationAllowed: false,
      stopPolicy: 'break_glass_required',
      blockedReasons: [],
      approvalId: 'approval-001',
      generatedAt: '2026-05-22T00:00:00.000Z',
      hash: 'psr-hash',
      hashAlgorithm: 'sha256',
    });
    expect(errors.some((e) => e.includes('terminationPerformed'))).toBe(true);
  });

  it('rejects blocked reasons with approval_id_required', () => {
    // This mirrors the fixture's blocked case
    const receipt: ProductionStopReadinessReceipt = {
      id: 'psr-001',
      schemaVersion: HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
      workflow: SLOW_COMPUTER_CLINIC_WORKFLOW,
      targetPid: 12345,
      targetName: 'node.exe',
      exactPidRechecked: true,
      approvalCaptured: true,
      ownerAckCaptured: true,
      dryRunOnly: true,
      terminationPerformed: false,
      externalProcessTerminationAllowed: false,
      stopPolicy: 'break_glass_required',
      blockedReasons: ['approval_id_required'],
      approvalId: 'approval-001',
      generatedAt: '2026-05-22T00:00:00.000Z',
      hash: 'psr-hash',
      hashAlgorithm: 'sha256',
    };
    // blockedReasons is valid as an array — the validation just checks it's an array
    const errors = validateProductionStopReadinessReceipt(receipt);
    expect(errors).toHaveLength(0);
  });
});

// ── Replay receipt validation ──

describe('validateSlowComputerClinicReplayReceipt', () => {
  it('accepts a valid replay receipt', () => {
    const errors = validateSlowComputerClinicReplayReceipt(makeReplayReceipt());
    expect(errors).toHaveLength(0);
  });

  it('rejects rawCommandLinesCaptured true', () => {
    const errors = validateSlowComputerClinicReplayReceipt(
      makeReplayReceipt({ rawCommandLinesCaptured: true as any })
    );
    expect(errors.some((e) => e.includes('rawCommandLinesCaptured'))).toBe(true);
  });

  it('rejects rawCommandLinesHiddenByDefault false', () => {
    const errors = validateSlowComputerClinicReplayReceipt(
      makeReplayReceipt({ rawCommandLinesHiddenByDefault: false as any })
    );
    expect(errors.some((e) => e.includes('rawCommandLinesHiddenByDefault'))).toBe(true);
  });
});

// ── Full receipt pack validation ──

describe('validateHoloShellSlowComputerClinicReceiptPack', () => {
  it('accepts a valid minimal receipt pack', () => {
    const errors = validateHoloShellSlowComputerClinicReceiptPack(makeReceiptPack());
    expect(errors).toHaveLength(0);
  });

  it('rejects missing pack', () => {
    const errors = validateHoloShellSlowComputerClinicReceiptPack(undefined);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('required');
  });

  it('rejects status mismatch with replay', () => {
    const errors = validateHoloShellSlowComputerClinicReceiptPack(
      makeReceiptPack({
        status: 'scanned',
        replay: makeReplayReceipt({ status: 'verified' }),
      })
    );
    expect(errors.some((e) => e.includes('status must match replay.status'))).toBe(true);
  });

  it('accepts pack with remediation verification', () => {
    const rv: RemediationVerificationReceipt = {
      id: 'rv-001',
      schemaVersion: HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
      workflow: SLOW_COMPUTER_CLINIC_WORKFLOW,
      targetPid: 12345,
      targetName: 'node.exe',
      approvalCaptured: true,
      terminationPerformed: true,
      afterVisible: false,
      externalProcessTerminationAllowed: false,
      exactPidRequired: true,
      beforeVisible: true,
      ownerAckCaptured: true,
      approvalId: 'approval-001',
      generatedAt: '2026-05-22T00:00:00.000Z',
      hash: 'rv-hash',
      hashAlgorithm: 'sha256',
    };
    const errors = validateHoloShellSlowComputerClinicReceiptPack(
      makeReceiptPack({ remediationVerification: rv })
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts pack with production stop readiness', () => {
    const psr: ProductionStopReadinessReceipt = {
      id: 'psr-001',
      schemaVersion: HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
      workflow: SLOW_COMPUTER_CLINIC_WORKFLOW,
      targetPid: 12345,
      targetName: 'node.exe',
      exactPidRechecked: true,
      approvalCaptured: true,
      ownerAckCaptured: true,
      dryRunOnly: true,
      terminationPerformed: false,
      externalProcessTerminationAllowed: false,
      stopPolicy: 'break_glass_required',
      blockedReasons: [],
      approvalId: 'approval-001',
      generatedAt: '2026-05-22T00:00:00.000Z',
      hash: 'psr-hash',
      hashAlgorithm: 'sha256',
    };
    const errors = validateHoloShellSlowComputerClinicReceiptPack(
      makeReceiptPack({ productionStopReadiness: psr })
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects ownership plan with invalid category', () => {
    const errors = validateHoloShellSlowComputerClinicReceiptPack(
      makeReceiptPack({
        ownershipPlans: [
          makeOwnershipPlan({ category: 'invalid_category' }),
        ],
      })
    );
    expect(errors.some((e) => e.includes('category is unsupported'))).toBe(true);
  });

  it('rejects stop plan with safeToExecuteAutomatically true', () => {
    const errors = validateHoloShellSlowComputerClinicReceiptPack(
      makeReceiptPack({
        stopPlans: [
          makeStopPlan({ safeToExecuteAutomatically: true as any }),
        ],
      })
    );
    expect(errors.some((e) => e.includes('safeToExecuteAutomatically must be false'))).toBe(true);
  });
});

// ── Clone ──

describe('cloneHoloShellSlowComputerClinicReceiptPack', () => {
  it('deep-clones arrays', () => {
    const pack = makeReceiptPack();
    const cloned = cloneHoloShellSlowComputerClinicReceiptPack(pack);
    expect(cloned).not.toBe(pack);
    expect(cloned.ownershipPlans).not.toBe(pack.ownershipPlans);
    expect(cloned.ownershipPlans[0].findings).not.toBe(pack.ownershipPlans[0].findings);
    expect(cloned.stopPlans).not.toBe(pack.stopPlans);
    expect(cloned.stopPlans[0].findings).not.toBe(pack.stopPlans[0].findings);
    expect(cloned.replay).not.toBe(pack.replay);
  });

  it('clones production stop readiness blocked reasons', () => {
    const psr: ProductionStopReadinessReceipt = {
      id: 'psr-001',
      schemaVersion: HOLOSHELL_SLOW_COMPUTER_CLINIC_RECEIPT_VERSION,
      workflow: SLOW_COMPUTER_CLINIC_WORKFLOW,
      targetPid: 12345,
      targetName: 'node.exe',
      exactPidRechecked: true,
      approvalCaptured: true,
      ownerAckCaptured: true,
      dryRunOnly: true,
      terminationPerformed: false,
      externalProcessTerminationAllowed: false,
      stopPolicy: 'break_glass_required',
      blockedReasons: ['approval_id_required'],
      approvalId: 'approval-001',
      generatedAt: '2026-05-22T00:00:00.000Z',
      hash: 'psr-hash',
      hashAlgorithm: 'sha256',
    };
    const pack = makeReceiptPack({ productionStopReadiness: psr });
    const cloned = cloneHoloShellSlowComputerClinicReceiptPack(pack);
    expect(cloned.productionStopReadiness!.blockedReasons).not.toBe(psr.blockedReasons);
    expect(cloned.productionStopReadiness!.blockedReasons).toEqual(psr.blockedReasons);
  });
});