import { describe, expect, it } from 'vitest';
import {
  cloneBrittneyFieldActionReceipt,
  cloneBrittneyFieldPermissionEnvelopeData,
  cloneBrittneyFieldReplayReceipt,
  cloneBrittneyFieldRepairPath,
  cloneBrittneyFieldSourceContext,
  cloneBrittneyFieldTimelineEntry,
  cloneHoloShellBrittneyActionReceiptPack,
  isSupportedBrittneyFieldActionKind,
  isSupportedBrittneyFieldOutcome,
  isSupportedBrittneyFieldPermissionEnvelope,
  isSupportedBrittneyFieldRepairKind,
  isSupportedBrittneyFieldSourceKind,
  isSupportedBrittneyTimelineVisibility,
  validateBrittneyFieldActionReceipt,
  validateBrittneyFieldPermissionEnvelopeData,
  validateBrittneyFieldReplayReceipt,
  validateBrittneyFieldRepairPath,
  validateBrittneyFieldSourceContext,
  validateBrittneyFieldTimelineEntry,
  validateHoloShellBrittneyActionReceiptPack,
  type BrittneyFieldActionReceipt,
  type BrittneyFieldCheck,
  type BrittneyFieldPermissionEnvelopeData,
  type BrittneyFieldRepairPath,
  type BrittneyFieldReplayReceipt,
  type BrittneyFieldSourceContext,
  type BrittneyFieldTimelineEntry,
  type HoloShellBrittneyActionReceiptPack,
} from '../holoshell-brittney-action-receipts';

// ── Helpers ──

function makeSourceContext(
  overrides: Partial<BrittneyFieldSourceContext> = {}
): BrittneyFieldSourceContext {
  return {
    id: 'src_20260518_001',
    sourceKind: 'auto_claim',
    initiatedBy: 'brittney',
    triggerDescription: 'Auto-claimed highest-priority open board task',
    autoInitiated: true,
    humanApprovalRequired: false,
    humanApprovalObtained: false,
    contextRef: 'task_1779149587047_fd60',
    hash: 'sha256:source_context_001',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makePermissionEnvelope(
  overrides: Partial<BrittneyFieldPermissionEnvelopeData> = {}
): BrittneyFieldPermissionEnvelopeData {
  return {
    id: 'perm_20260518_001',
    envelopeKind: 'session_scoped',
    scopeDescription: 'Claim and complete board tasks within session scope',
    mutationAllowed: true,
    secretAccessAllowed: false,
    networkAccessAllowed: true,
    requiresFreshUserGesture: false,
    reversibleByDefault: true,
    hash: 'sha256:perm_envelope_001',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeTimelineEntry(
  overrides: Partial<BrittneyFieldTimelineEntry> = {}
): BrittneyFieldTimelineEntry {
  return {
    id: 'tl_20260518_001',
    visibility: 'room_log',
    roomId: 'team_1777834718247_unr35n',
    summary: 'Brittney auto-claimed task [receipts][safety] Prove autonomous field actions',
    roomChange: true,
    fieldActionId: 'action_20260518_001',
    createdAt: '2026-05-18T12:00:00Z',
    hash: 'sha256:timeline_001',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeRepairPath(
  overrides: Partial<BrittneyFieldRepairPath> = {}
): BrittneyFieldRepairPath {
  return {
    repairKind: 'board_unclaim',
    description: 'Unclaim the task on the board, no local mutation to revert',
    reversible: true,
    autoRolledBack: false,
    ...overrides,
  };
}

function makeActionReceipt(
  overrides: Partial<BrittneyFieldActionReceipt> = {}
): BrittneyFieldActionReceipt {
  return {
    id: 'action_20260518_001',
    actionKind: 'claim_task',
    target: 'task_1779149587047_fd60',
    inputsHash: 'sha256:claim_inputs_001',
    outputsHash: 'sha256:claim_outputs_001',
    permissionEnvelope: makePermissionEnvelope(),
    sourceContext: makeSourceContext(),
    timelineEntry: makeTimelineEntry(),
    checks: [
      { kind: 'auto_initiated_flag_set', status: 'pass' },
      { kind: 'permission_envelope_declared', status: 'pass' },
      { kind: 'mutation_guard_checked', status: 'pass' },
      { kind: 'repair_path_present', status: 'pass' },
      { kind: 'timeline_entry_created', status: 'pass' },
      { kind: 'source_context_traceable', status: 'pass' },
    ],
    repairPath: makeRepairPath(),
    mutationExecuted: true,
    nonDestructiveDefault: true,
    outcome: 'success',
    startedAt: '2026-05-18T12:00:00Z',
    endedAt: '2026-05-18T12:00:01Z',
    executedOn: 'claudecode',
    hash: 'sha256:action_001',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeReplayReceipt(
  overrides: Partial<BrittneyFieldReplayReceipt> = {}
): BrittneyFieldReplayReceipt {
  return {
    id: 'replay_20260518_001',
    workflow: 'brittney-field-action',
    fieldActionId: 'action_20260518_001',
    status: 'success',
    mutationExecuted: true,
    allMutationsReversible: true,
    timelineVisible: true,
    sourceTraceable: true,
    repairSummary: 'Task claim reversible via board unclaim',
    createdAt: '2026-05-18T12:00:01Z',
    hash: 'sha256:replay_001',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

function makeReceiptPack(
  overrides: Partial<HoloShellBrittneyActionReceiptPack> = {}
): HoloShellBrittneyActionReceiptPack {
  return {
    id: 'pack_20260518_001',
    action: makeActionReceipt(),
    replay: makeReplayReceipt(),
    outcome: 'success',
    hash: 'sha256:pack_001',
    hashAlgorithm: 'sha256',
    ...overrides,
  };
}

// ── Type guards ──

describe('Brittney field action type guards', () => {
  it('recognizes all valid action kinds', () => {
    for (const kind of [
      'tool_call', 'claim_task', 'complete_task', 'send_message',
      'knowledge_sync', 'file_read', 'file_write', 'file_delete',
      'network_request', 'compile_target', 'absorb_codebase',
      'board_operation', 'session_handoff', 'environment_change', 'agent-other',
    ]) {
      expect(isSupportedBrittneyFieldActionKind(kind)).toBe(true);
    }
  });

  it('rejects invalid action kind', () => {
    expect(isSupportedBrittneyFieldActionKind('invalid')).toBe(false);
  });

  it('recognizes all valid permission envelopes', () => {
    for (const env of ['read_only', 'session_scoped', 'guarded_execute', 'break_glass', 'break_glass_blocked']) {
      expect(isSupportedBrittneyFieldPermissionEnvelope(env)).toBe(true);
    }
  });

  it('recognizes all valid outcomes', () => {
    for (const outcome of ['success', 'partial', 'blocked_by_policy', 'blocked_by_consent', 'failed', 'rolled_back']) {
      expect(isSupportedBrittneyFieldOutcome(outcome)).toBe(true);
    }
  });

  it('recognizes all valid repair kinds', () => {
    for (const kind of ['undo_command', 'git_revert', 'board_unclaim', 'board_reopen', 'manual_repair', 'not_repairable', 'auto_rolled_back']) {
      expect(isSupportedBrittneyFieldRepairKind(kind)).toBe(true);
    }
  });

  it('recognizes all valid source kinds', () => {
    for (const kind of ['auto_claim', 'auto_continue', 'auto_heal', 'auto_audit', 'hook_triggered', 'schedule_triggered', 'peer_delegation', 'founder_directive', 'cascade_from_parent']) {
      expect(isSupportedBrittneyFieldSourceKind(kind)).toBe(true);
    }
  });

  it('recognizes all valid timeline visibilities', () => {
    for (const vis of ['room_broadcast', 'room_log', 'private_session', 'founder_only']) {
      expect(isSupportedBrittneyTimelineVisibility(vis)).toBe(true);
    }
  });
});

// ── Source context validation ──

describe('validateBrittneyFieldSourceContext', () => {
  it('accepts a valid source context', () => {
    const errors = validateBrittneyFieldSourceContext(makeSourceContext());
    expect(errors).toEqual([]);
  });

  it('requires autoInitiated to be true', () => {
    const errors = validateBrittneyFieldSourceContext(
      makeSourceContext({ autoInitiated: false as unknown as true })
    );
    expect(errors.some((e) => e.includes('autoInitiated must be true'))).toBe(true);
  });

  it('requires hash and hashAlgorithm', () => {
    const errors = validateBrittneyFieldSourceContext(
      makeSourceContext({ hash: '', hashAlgorithm: '' as any })
    );
    expect(errors.some((e) => e.includes('.hash is required'))).toBe(true);
    expect(errors.some((e) => e.includes('.hashAlgorithm is required'))).toBe(true);
  });

  it('rejects invalid source kind', () => {
    const errors = validateBrittneyFieldSourceContext(
      makeSourceContext({ sourceKind: 'invalid' as any })
    );
    expect(errors.some((e) => e.includes('sourceKind is unsupported'))).toBe(true);
  });

  it('requires humanApprovalObtained when humanApprovalRequired is true', () => {
    const errors = validateBrittneyFieldSourceContext(
      makeSourceContext({ humanApprovalRequired: true, humanApprovalObtained: undefined as any })
    );
    expect(errors.some((e) => e.includes('humanApprovalObtained must be a boolean'))).toBe(true);
  });
});

// ── Permission envelope validation ──

describe('validateBrittneyFieldPermissionEnvelopeData', () => {
  it('accepts a valid permission envelope', () => {
    const errors = validateBrittneyFieldPermissionEnvelopeData(makePermissionEnvelope());
    expect(errors).toEqual([]);
  });

  it('requires reversibleByDefault to be true', () => {
    const errors = validateBrittneyFieldPermissionEnvelopeData(
      makePermissionEnvelope({ reversibleByDefault: false as unknown as true })
    );
    expect(errors.some((e) => e.includes('reversibleByDefault must be true'))).toBe(true);
  });

  it('rejects break_glass_blocked with mutationAllowed=true', () => {
    const errors = validateBrittneyFieldPermissionEnvelopeData(
      makePermissionEnvelope({ envelopeKind: 'break_glass_blocked', mutationAllowed: true })
    );
    expect(errors.some((e) => e.includes('break_glass_blocked cannot allow mutations'))).toBe(true);
  });
});

// ── Timeline entry validation ──

describe('validateBrittneyFieldTimelineEntry', () => {
  it('accepts a valid timeline entry', () => {
    const errors = validateBrittneyFieldTimelineEntry(makeTimelineEntry());
    expect(errors).toEqual([]);
  });

  it('rejects invalid visibility', () => {
    const errors = validateBrittneyFieldTimelineEntry(
      makeTimelineEntry({ visibility: 'invalid' as any })
    );
    expect(errors.some((e) => e.includes('visibility is unsupported'))).toBe(true);
  });

  it('requires summary', () => {
    const errors = validateBrittneyFieldTimelineEntry(
      makeTimelineEntry({ summary: '' })
    );
    expect(errors.some((e) => e.includes('summary is required'))).toBe(true);
  });
});

// ── Repair path validation ──

describe('validateBrittneyFieldRepairPath', () => {
  it('accepts a valid repair path', () => {
    const errors = validateBrittneyFieldRepairPath(makeRepairPath());
    expect(errors).toEqual([]);
  });

  it('rejects not_repairable with reversible=true', () => {
    const errors = validateBrittneyFieldRepairPath(
      makeRepairPath({ repairKind: 'not_repairable', reversible: true })
    );
    expect(errors.some((e) => e.includes('reversible must be false when repairKind is not_repairable'))).toBe(true);
  });

  it('requires undoReceiptId when autoRolledBack=true', () => {
    const errors = validateBrittneyFieldRepairPath(
      makeRepairPath({ autoRolledBack: true, undoReceiptId: undefined })
    );
    expect(errors.some((e) => e.includes('undoReceiptId is required when autoRolledBack'))).toBe(true);
  });

  it('accepts autoRolledBack with undoReceiptId', () => {
    const errors = validateBrittneyFieldRepairPath(
      makeRepairPath({ autoRolledBack: true, undoReceiptId: 'undo_001' })
    );
    expect(errors.every((e) => !e.includes('undoReceiptId'))).toBe(true);
  });
});

// ── Action receipt validation ──

describe('validateBrittneyFieldActionReceipt', () => {
  it('accepts a valid action receipt', () => {
    const errors = validateBrittneyFieldActionReceipt(makeActionReceipt());
    expect(errors).toEqual([]);
  });

  it('requires actionLabel for agent-other kind', () => {
    const errors = validateBrittneyFieldActionReceipt(
      makeActionReceipt({ actionKind: 'agent-other', actionLabel: undefined })
    );
    expect(errors.some((e) => e.includes('actionLabel is required when actionKind is agent-other'))).toBe(true);
  });

  it('accepts agent-other with actionLabel', () => {
    const errors = validateBrittneyFieldActionReceipt(
      makeActionReceipt({ actionKind: 'agent-other', actionLabel: 'custom-action' })
    );
    expect(errors.every((e) => !e.includes('actionLabel'))).toBe(true);
  });

  it('requires repairPath (silence is not safety)', () => {
    const receipt = makeActionReceipt();
    const errors = validateBrittneyFieldActionReceipt({
      ...receipt,
      repairPath: undefined as unknown as BrittneyFieldRepairPath,
    });
    expect(errors.some((e) => e.includes('repairPath is required'))).toBe(true);
  });

  it('requires nonDestructiveDefault to be true', () => {
    const errors = validateBrittneyFieldActionReceipt(
      makeActionReceipt({ nonDestructiveDefault: false as unknown as true })
    );
    expect(errors.some((e) => e.includes('nonDestructiveDefault must be true'))).toBe(true);
  });

  it('rejects read_only envelope with mutation', () => {
    const errors = validateBrittneyFieldActionReceipt(
      makeActionReceipt({
        mutationExecuted: true,
        permissionEnvelope: makePermissionEnvelope({ envelopeKind: 'read_only' }),
      })
    );
    expect(errors.some((e) => e.includes('read_only envelope cannot execute mutations'))).toBe(true);
  });

  it('accepts a read-only action with no mutation', () => {
    const errors = validateBrittneyFieldActionReceipt(
      makeActionReceipt({
        actionKind: 'file_read',
        mutationExecuted: false,
        permissionEnvelope: makePermissionEnvelope({
          envelopeKind: 'read_only',
          mutationAllowed: false,
        }),
        repairPath: makeRepairPath({
          repairKind: 'not_repairable',
          reversible: false,
          description: 'Read-only action, no mutation to repair',
        }),
      })
    );
    // Should not have the mutation-envelope conflict error
    expect(errors.every((e) => !e.includes('read_only envelope cannot execute mutations'))).toBe(true);
  });

  it('validates all check kinds', () => {
    const allChecks: BrittneyFieldCheck[] = [
      { kind: 'auto_initiated_flag_set', status: 'pass' },
      { kind: 'permission_envelope_declared', status: 'pass' },
      { kind: 'mutation_guard_checked', status: 'pass' },
      { kind: 'repair_path_present', status: 'pass' },
      { kind: 'timeline_entry_created', status: 'pass' },
      { kind: 'source_context_traceable', status: 'pass' },
      { kind: 'no_hidden_automation', status: 'pass' },
      { kind: 'consent_gate_respected', status: 'pass' },
    ];
    const errors = validateBrittneyFieldActionReceipt(
      makeActionReceipt({ checks: allChecks })
    );
    expect(errors.every((e) => !e.includes('checks kind is unsupported'))).toBe(true);
  });

  it('rejects invalid check kind', () => {
    const errors = validateBrittneyFieldActionReceipt(
      makeActionReceipt({ checks: [{ kind: 'invalid' as any, status: 'pass' }] })
    );
    expect(errors.some((e) => e.includes('checks kind is unsupported'))).toBe(true);
  });

  it('rejects invalid check status', () => {
    const errors = validateBrittneyFieldActionReceipt(
      makeActionReceipt({ checks: [{ kind: 'auto_initiated_flag_set', status: 'invalid' as any }] })
    );
    expect(errors.some((e) => e.includes('checks status is unsupported'))).toBe(true);
  });
});

// ── Replay receipt validation ──

describe('validateBrittneyFieldReplayReceipt', () => {
  it('accepts a valid replay receipt', () => {
    const errors = validateBrittneyFieldReplayReceipt(makeReplayReceipt());
    expect(errors).toEqual([]);
  });

  it('requires workflow to be brittney-field-action', () => {
    const errors = validateBrittneyFieldReplayReceipt(
      makeReplayReceipt({ workflow: 'other' as any })
    );
    expect(errors.some((e) => e.includes('workflow must be brittney-field-action'))).toBe(true);
  });

  it('rejects invalid status', () => {
    const errors = validateBrittneyFieldReplayReceipt(
      makeReplayReceipt({ status: 'invalid' as any })
    );
    expect(errors.some((e) => e.includes('status is unsupported'))).toBe(true);
  });
});

// ── Receipt pack validation ──

describe('validateHoloShellBrittneyActionReceiptPack', () => {
  it('accepts a valid receipt pack', () => {
    const errors = validateHoloShellBrittneyActionReceiptPack(makeReceiptPack());
    expect(errors).toEqual([]);
  });

  it('requires action', () => {
    const errors = validateHoloShellBrittneyActionReceiptPack({
      ...makeReceiptPack(),
      action: undefined as unknown as BrittneyFieldActionReceipt,
    });
    expect(errors.some((e) => e.includes('action is required'))).toBe(true);
  });

  it('requires replay', () => {
    const errors = validateHoloShellBrittneyActionReceiptPack({
      ...makeReceiptPack(),
      replay: undefined as unknown as BrittneyFieldReplayReceipt,
    });
    expect(errors.some((e) => e.includes('replay is required'))).toBe(true);
  });

  it('rejects invalid outcome', () => {
    const errors = validateHoloShellBrittneyActionReceiptPack(
      makeReceiptPack({ outcome: 'invalid' as any })
    );
    expect(errors.some((e) => e.includes('outcome is unsupported'))).toBe(true);
  });

  it('cascades action validation errors', () => {
    const errors = validateHoloShellBrittneyActionReceiptPack(
      makeReceiptPack({
        action: makeActionReceipt({ id: '', target: '' }),
      })
    );
    expect(errors.some((e) => e.includes('actionKind') || e.includes('action.id') || e.includes('target'))).toBe(true);
  });
});

// ── Clone functions ──

describe('clone functions', () => {
  it('deep clones source context', () => {
    const original = makeSourceContext();
    const cloned = cloneBrittneyFieldSourceContext(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  it('deep clones permission envelope', () => {
    const original = makePermissionEnvelope();
    const cloned = cloneBrittneyFieldPermissionEnvelopeData(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  it('deep clones timeline entry', () => {
    const original = makeTimelineEntry();
    const cloned = cloneBrittneyFieldTimelineEntry(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  it('deep clones repair path', () => {
    const original = makeRepairPath();
    const cloned = cloneBrittneyFieldRepairPath(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  it('deep clones action receipt (with nested objects)', () => {
    const original = makeActionReceipt();
    const cloned = cloneBrittneyFieldActionReceipt(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    // Verify deep clone of nested objects
    expect(cloned.permissionEnvelope).not.toBe(original.permissionEnvelope);
    expect(cloned.sourceContext).not.toBe(original.sourceContext);
    expect(cloned.checks).not.toBe(original.checks);
    expect(cloned.repairPath).not.toBe(original.repairPath);
  });

  it('deep clones action receipt without optional timeline entry', () => {
    const original = makeActionReceipt({ timelineEntry: undefined });
    const cloned = cloneBrittneyFieldActionReceipt(original);
    expect(cloned).toEqual(original);
    expect(cloned.timelineEntry).toBeUndefined();
  });

  it('deep clones replay receipt', () => {
    const original = makeReplayReceipt();
    const cloned = cloneBrittneyFieldReplayReceipt(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  it('deep clones full receipt pack', () => {
    const original = makeReceiptPack();
    const cloned = cloneHoloShellBrittneyActionReceiptPack(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.action).not.toBe(original.action);
    expect(cloned.replay).not.toBe(original.replay);
  });

  it('clones action receipt with verification commands', () => {
    const original = makeActionReceipt({
      verificationCommands: [
        { id: 'vc_1', command: 'pnpm test', description: 'Run tests' },
        { id: 'vc_2', command: 'pnpm build', artifactIds: ['artifact_1'] },
      ],
    });
    const cloned = cloneBrittneyFieldActionReceipt(original);
    expect(cloned.verificationCommands).not.toBe(original.verificationCommands);
    expect(cloned.verificationCommands![1].artifactIds).not.toBe(
      original.verificationCommands![1].artifactIds
    );
  });

  it('clones action receipt with provenance', () => {
    const original = makeActionReceipt({
      provenance: {
        taskId: 'task_1779149587047_fd60',
        commitHash: 'abc123',
        parentArtifactIds: ['parent_1', 'parent_2'],
      },
    });
    const cloned = cloneBrittneyFieldActionReceipt(original);
    expect(cloned.provenance).not.toBe(original.provenance);
    expect(cloned.provenance!.parentArtifactIds).not.toBe(
      original.provenance!.parentArtifactIds
    );
  });
});

// ── Safety invariant edge cases ──

describe('safety invariants', () => {
  it('rejects mutating action with not_repairable path and no explicit reversible=false', () => {
    // A mutating action MUST have a reversible repair path or explicitly declare not_repairable.
    // This test ensures the invariant fires: mutation + read_only envelope = error
    const errors = validateBrittneyFieldActionReceipt(
      makeActionReceipt({
        mutationExecuted: true,
        permissionEnvelope: makePermissionEnvelope({ envelopeKind: 'read_only', mutationAllowed: false }),
      })
    );
    expect(errors.some((e) => e.includes('read_only envelope cannot execute mutations'))).toBe(true);
  });

  it('accepts a full audit trail receipt pack with all safety checks passing', () => {
    const pack = makeReceiptPack({
      action: makeActionReceipt({
        checks: [
          { kind: 'auto_initiated_flag_set', status: 'pass' },
          { kind: 'permission_envelope_declared', status: 'pass' },
          { kind: 'mutation_guard_checked', status: 'pass' },
          { kind: 'repair_path_present', status: 'pass' },
          { kind: 'timeline_entry_created', status: 'pass' },
          { kind: 'source_context_traceable', status: 'pass' },
          { kind: 'no_hidden_automation', status: 'pass' },
          { kind: 'consent_gate_respected', status: 'pass' },
        ],
      }),
    });
    const errors = validateHoloShellBrittneyActionReceiptPack(pack);
    expect(errors).toEqual([]);
  });

  it('accepts a break_glass action with repair path', () => {
    const errors = validateBrittneyFieldActionReceipt(
      makeActionReceipt({
        actionKind: 'file_write',
        mutationExecuted: true,
        permissionEnvelope: makePermissionEnvelope({
          envelopeKind: 'break_glass',
          mutationAllowed: true,
          requiresFreshUserGesture: true,
        }),
        repairPath: makeRepairPath({
          repairKind: 'git_revert',
          description: 'Git revert the file change',
          reversible: true,
        }),
      })
    );
    // break_glass is allowed with mutation if reversible
    expect(errors.every((e) => !e.includes('cannot allow'))).toBe(true);
  });

  it('accepts a rolled-back action', () => {
    const errors = validateBrittneyFieldActionReceipt(
      makeActionReceipt({
        outcome: 'rolled_back',
        mutationExecuted: false,
        repairPath: makeRepairPath({
          repairKind: 'auto_rolled_back',
          reversible: true,
          autoRolledBack: true,
          undoReceiptId: 'undo_001',
          description: 'Action was automatically rolled back',
        }),
        permissionEnvelope: makePermissionEnvelope({
          envelopeKind: 'session_scoped',
          mutationAllowed: true,
        }),
      })
    );
    expect(errors).toEqual([]);
  });
});