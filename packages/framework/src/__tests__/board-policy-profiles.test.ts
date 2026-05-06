import { describe, expect, it } from 'vitest';
import {
  addTasksToBoard,
  auditDoneLog,
  completeTask,
  evaluateTaskPolicyAction,
  recordTaskPolicyEvent,
  validateTaskPolicyProfile,
  type DoneLogEntry,
  type TaskPolicyProfile,
  type TeamTask,
} from '../board';

function makeTask(overrides: Partial<TeamTask> = {}): TeamTask {
  return {
    id: 'task_policy',
    title: 'Run task-scoped policy',
    description: 'Enforce policy before runner execution.',
    status: 'open',
    priority: 7,
    createdAt: '2026-05-06T00:00:00Z',
    ...overrides,
  };
}

function makePolicy(overrides: Partial<TaskPolicyProfile> = {}): TaskPolicyProfile {
  return {
    id: 'policy_task',
    enforcement: 'block',
    allowedTools: ['functions.shell_command', 'web.*'],
    deniedTools: ['functions.apply_patch'],
    network: {
      access: 'allowlist',
      allowlist: ['api.holomesh.local', 'localhost'],
      deniedHosts: ['metadata.google.internal'],
    },
    filesystem: {
      mode: 'read-write',
      allowedPaths: ['C:/Users/josep/Documents/GitHub/HoloScript'],
      deniedPaths: ['C:/Users/josep/Documents/GitHub/HoloScript/.env'],
    },
    secrets: {
      allowedSecretRefs: ['vault:team/*'],
      deniedSecretRefs: ['env:*'],
      allowEnvironment: false,
    },
    spendCap: { amount: 5, currency: 'USD', hard: true },
    escalation: [
      { when: 'outside_policy', target: 'founder', targetId: 'joseph' },
      { when: 'spend_exceeded', target: 'human', targetId: 'joseph' },
    ],
    ...overrides,
  };
}

describe('board task policy profiles', () => {
  it('validates conflicts, scopes, spend caps, and escalation rules', () => {
    const invalid = makePolicy({
      enforcement: 'magic' as TaskPolicyProfile['enforcement'],
      allowedTools: ['tool.a', ''],
      deniedTools: ['tool.a'],
      network: { access: 'allowlist' },
      filesystem: { mode: 'magic' as never, allowedPaths: [''] },
      secrets: { allowedSecretRefs: [''] },
      spendCap: { amount: -1, currency: '' },
      escalation: [{ when: 'later' as never, target: 'robot' as never }],
    });

    expect(validateTaskPolicyProfile(invalid)).toEqual(
      expect.arrayContaining([
        'TaskPolicyProfile.enforcement is unsupported: magic.',
        'TaskPolicyProfile tool patterns cannot be empty.',
        'TaskPolicyProfile tool pattern cannot be both allowed and denied: tool.a.',
        'TaskEnvironmentProfile.network.allowlist is required for allowlist access.',
        'TaskPolicyProfile.filesystem.mode is unsupported: magic.',
        'TaskPolicyProfile filesystem paths cannot be empty.',
        'TaskPolicyProfile secret references cannot be empty.',
        'TaskPolicyProfile.spendCap.amount cannot be negative.',
        'TaskPolicyProfile.spendCap.currency is required.',
        'TaskPolicyProfile.escalation.when is unsupported: later.',
        'TaskPolicyProfile.escalation.target is unsupported: robot.',
      ])
    );
  });

  it('stores valid policies and rejects invalid policies during batch task creation', () => {
    const { added, skipped } = addTasksToBoard(
      [],
      [],
      [
        {
          title: 'Policy task',
          description: 'Allowed policy.',
          priority: 7,
          policy: makePolicy(),
        },
        {
          title: 'Invalid policy task',
          description: 'Conflicting tool policy.',
          priority: 7,
          policy: makePolicy({ allowedTools: ['tool.a'], deniedTools: ['tool.a'] }),
        },
      ],
      { dedupMode: 'exact' }
    );

    expect(added).toHaveLength(1);
    expect(added[0].policy?.allowedTools).toContain('functions.shell_command');
    expect(skipped).toEqual([{ title: 'Invalid policy task', reason: 'invalid_policy' }]);
  });

  it('allows declared tools and denies explicitly blocked tools', () => {
    const policy = makePolicy();
    const allowed = evaluateTaskPolicyAction(
      policy,
      { kind: 'tool', subject: 'functions.shell_command' },
      { taskId: 'task_policy', agent: 'codex-hardware', timestamp: '2026-05-06T00:00:00Z' }
    );
    const denied = evaluateTaskPolicyAction(
      policy,
      { kind: 'tool', subject: 'functions.apply_patch' },
      { taskId: 'task_policy', agent: 'codex-hardware', timestamp: '2026-05-06T00:00:00Z' }
    );

    expect(allowed.allowed).toBe(true);
    expect(allowed.event.decision).toBe('allow');
    expect(denied.allowed).toBe(false);
    expect(denied.event.decision).toBe('deny');
    expect(denied.reasons[0]).toContain('denied by task policy');
  });

  it('escalates actions outside the declared policy to founder/human targets', () => {
    const toolDecision = evaluateTaskPolicyAction(
      makePolicy(),
      { kind: 'tool', subject: 'functions.shell_command.elevated' },
      { taskId: 'task_policy', timestamp: '2026-05-06T00:00:00Z' }
    );
    const spendDecision = evaluateTaskPolicyAction(
      makePolicy(),
      { kind: 'spend', subject: 'openai', amount: 9, currency: 'USD' },
      { taskId: 'task_policy', timestamp: '2026-05-06T00:00:00Z' }
    );

    expect(toolDecision.allowed).toBe(false);
    expect(toolDecision.event.decision).toBe('escalate');
    expect(toolDecision.event.escalationTarget).toBe('founder');
    expect(spendDecision.event.decision).toBe('escalate');
    expect(spendDecision.event.escalationTarget).toBe('human');
  });

  it('checks network, filesystem, and secret scopes', () => {
    const policy = makePolicy();
    const networkDenied = evaluateTaskPolicyAction(policy, {
      kind: 'network',
      subject: 'https://metadata.google.internal/computeMetadata/v1',
    });
    const filesystemDenied = evaluateTaskPolicyAction(policy, {
      kind: 'filesystem',
      subject: 'C:/Users/josep/Documents/GitHub/HoloScript/.env',
      operation: 'read',
    });
    const secretDenied = evaluateTaskPolicyAction(policy, {
      kind: 'secret',
      subject: 'env:ANTHROPIC_API_KEY',
    });

    expect(networkDenied.event.decision).toBe('deny');
    expect(filesystemDenied.event.decision).toBe('deny');
    expect(secretDenied.event.decision).toBe('deny');
  });

  it('records policy events and carries them into the done log', () => {
    const policy = makePolicy();
    const board = [makeTask({ policy })];
    const decision = evaluateTaskPolicyAction(
      policy,
      { kind: 'tool', subject: 'functions.apply_patch' },
      { taskId: 'task_policy', timestamp: '2026-05-06T00:00:00Z' }
    );

    const recorded = recordTaskPolicyEvent(board, 'task_policy', decision.event);
    const { result } = completeTask(board, 'task_policy', 'codex-hardware', {
      commit: 'abc1234',
    });

    expect(recorded.success).toBe(true);
    expect(result.success).toBe(true);
    expect(result.doneEntry?.policy?.id).toBe('policy_task');
    expect(result.doneEntry?.policyEvents?.[0].decision).toBe('deny');
  });

  it('counts policy events in done-log audit results', () => {
    const decision = evaluateTaskPolicyAction(
      makePolicy(),
      { kind: 'tool', subject: 'functions.apply_patch' },
      { taskId: 'task_policy', timestamp: '2026-05-06T00:00:00Z' }
    );
    const entries: DoneLogEntry[] = [
      {
        taskId: 'task_policy',
        title: 'Run task-scoped policy',
        completedBy: 'codex-hardware',
        commitHash: 'abc1234',
        timestamp: '2026-05-06T00:00:00Z',
        summary: 'Done.',
        policyEvents: [decision.event],
      },
    ];

    const result = auditDoneLog(entries);
    expect(result.policyEvents).toBe(1);
    expect(result.verified).toBe(1);
  });
});
