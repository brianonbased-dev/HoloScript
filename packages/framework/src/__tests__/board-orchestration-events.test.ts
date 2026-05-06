import { describe, expect, it } from 'vitest';
import {
  TASK_ORCHESTRATION_AGENT_SURFACES,
  TASK_ORCHESTRATION_EVENT_TYPES,
  addTasksToBoard,
  attachTaskDecomposition,
  auditDoneLog,
  completeTask,
  recordSubagentEvent,
  replayTaskCoordination,
  validateSubagentEvent,
  validateTaskDecompositionPlan,
  type DoneLogEntry,
  type SubagentEvent,
  type TaskDecompositionPlan,
  type TaskOrchestrationAgentRef,
  type TeamTask,
} from '../board';

const codex: TaskOrchestrationAgentRef = {
  surface: 'codex',
  agentId: 'agent_codex',
  agentName: 'codex-hardware',
  handle: 'codex1',
};

const claude: TaskOrchestrationAgentRef = {
  surface: 'claude',
  agentId: 'agent_claude',
  agentName: 'claude-code',
  handle: 'claude1',
};

function makeTask(overrides: Partial<TeamTask> = {}): TeamTask {
  return {
    id: 'task_parent',
    title: 'Coordinate implementation',
    description: 'Break work into parallel agent waves.',
    status: 'open',
    priority: 6,
    createdAt: '2026-05-06T00:00:00Z',
    ...overrides,
  };
}

function makePlan(overrides: Partial<TaskDecompositionPlan> = {}): TaskDecompositionPlan {
  return {
    id: 'decomp_parent',
    parentTaskId: 'task_parent',
    strategy: 'hybrid',
    createdAt: '2026-05-06T01:00:00Z',
    createdBy: codex,
    children: [
      {
        id: 'phase_api',
        taskId: 'task_child_api',
        title: 'Persist API contract',
        dependencies: [],
        wave: 0,
        requiredCapabilities: ['coding'],
        assignedAgent: codex,
        status: 'pending',
      },
      {
        id: 'phase_verify',
        taskId: 'task_child_verify',
        title: 'Verify replay contract',
        dependencies: ['phase_api'],
        wave: 1,
        requiredCapabilities: ['testing'],
        assignedAgent: claude,
        status: 'pending',
      },
    ],
    waves: [
      { index: 0, childIds: ['phase_api'] },
      { index: 1, childIds: ['phase_verify'], dependsOnWaves: [0] },
    ],
    ...overrides,
  };
}

function makeEvent(overrides: Partial<SubagentEvent> = {}): SubagentEvent {
  return {
    id: 'event_delegate',
    type: 'delegate',
    taskId: 'task_parent',
    childTaskId: 'task_child_api',
    phaseId: 'phase_api',
    wave: 0,
    actor: codex,
    target: claude,
    timestamp: '2026-05-06T01:01:00Z',
    status: 'pending',
    dependencies: [],
    summary: 'Delegated API phase.',
    ...overrides,
  };
}

describe('board orchestration events', () => {
  it('declares the managed-agent event and surface vocabulary', () => {
    expect(TASK_ORCHESTRATION_EVENT_TYPES).toEqual([
      'decompose',
      'delegate',
      'subtask_started',
      'subtask_blocked',
      'subtask_done',
      'synthesize',
      'verify',
    ]);
    expect(TASK_ORCHESTRATION_AGENT_SURFACES).toEqual(
      expect.arrayContaining(['claude', 'codex', 'gemini', 'copilot', 'headless'])
    );
  });

  it('validates child dependencies, wave ordering, and agent surfaces', () => {
    expect(validateTaskDecompositionPlan(makePlan())).toEqual([]);

    const invalid = makePlan({
      children: [
        {
          id: 'phase_verify',
          dependencies: ['missing_phase'],
          wave: 1,
          assignedAgent: { surface: 'unknown' as never },
        },
      ],
      waves: [{ index: 0, childIds: ['phase_verify'] }],
    });

    expect(validateTaskDecompositionPlan(invalid)).toEqual(
      expect.arrayContaining([
        'TaskDecompositionPlan child phase_verify depends on unknown child missing_phase.',
        'TaskDecompositionPlan child phase_verify.assignedAgent.surface is unsupported: unknown.',
        'TaskDecompositionPlan child phase_verify.assignedAgent needs agentId, agentName, or handle.',
        'TaskDecompositionPlan child phase_verify is not listed in its declared wave 1.',
      ])
    );
  });

  it('attaches decomposition plans and retains parent child ids', () => {
    const plan = makePlan();
    const board = [makeTask()];
    const result = attachTaskDecomposition(board, 'task_parent', plan);

    expect(result.success).toBe(true);
    expect(result.task?.childTaskIds).toEqual(['task_child_api', 'task_child_verify']);

    plan.children[0].taskId = 'mutated';
    expect(result.task?.decomposition?.children[0].taskId).toBe('task_child_api');
  });

  it('records and validates replayable subagent events', () => {
    const board = [makeTask()];
    const invalid = makeEvent({
      type: 'telepathy' as never,
      actor: { surface: 'gemini' },
    });
    expect(validateSubagentEvent(invalid)).toEqual(
      expect.arrayContaining([
        'SubagentEvent.type is unsupported: telepathy.',
        'SubagentEvent.actor needs agentId, agentName, or handle.',
      ])
    );

    const result = recordSubagentEvent(board, 'task_parent', makeEvent());
    expect(result.success).toBe(true);
    expect(result.task?.subagentEvents?.[0]).toMatchObject({
      type: 'delegate',
      childTaskId: 'task_child_api',
      target: { surface: 'claude' },
    });
  });

  it('replays coordination timelines without chat prose', () => {
    const board = [makeTask()];
    attachTaskDecomposition(board, 'task_parent', makePlan());
    recordSubagentEvent(
      board,
      'task_parent',
      makeEvent({
        id: 'event_verify',
        type: 'verify',
        timestamp: '2026-05-06T01:03:00Z',
        childTaskId: 'task_child_verify',
        phaseId: 'phase_verify',
        wave: 1,
      })
    );
    recordSubagentEvent(
      board,
      'task_parent',
      makeEvent({
        id: 'event_decompose',
        type: 'decompose',
        timestamp: '2026-05-06T01:00:30Z',
        childTaskId: undefined,
        phaseId: undefined,
      })
    );

    const timeline = replayTaskCoordination(board[0]);

    expect(timeline.taskId).toBe('task_parent');
    expect(timeline.childTaskIds).toEqual(['task_child_api', 'task_child_verify']);
    expect(timeline.waves.map((wave) => wave.childIds)).toEqual([
      ['phase_api'],
      ['phase_verify'],
    ]);
    expect(timeline.events.map((event) => event.type)).toEqual(['decompose', 'verify']);
  });

  it('carries plans and events into done logs and audit counts', () => {
    const board = [makeTask()];
    attachTaskDecomposition(board, 'task_parent', makePlan());
    recordSubagentEvent(board, 'task_parent', makeEvent());

    const { result } = completeTask(board, 'task_parent', 'codex-hardware', {
      commit: 'abc1234',
      summary: 'Persisted coordination timeline.',
    });

    expect(result.success).toBe(true);
    expect(result.doneEntry?.decomposition?.waves[1].dependsOnWaves).toEqual([0]);
    expect(result.doneEntry?.subagentEvents?.[0].type).toBe('delegate');

    const audit = auditDoneLog([result.doneEntry as DoneLogEntry]);
    expect(audit.decompositionPlans).toBe(1);
    expect(audit.subagentEvents).toBe(1);
    expect(audit.verified).toBe(1);
  });

  it('rejects malformed orchestration during batch task creation', () => {
    const { added, skipped } = addTasksToBoard(
      [],
      [],
      [
        {
          title: 'Malformed orchestration task',
          description: 'Invalid plan.',
          priority: 6,
          decomposition: makePlan({
            parentTaskId: '',
          }),
        },
      ],
      { dedupMode: 'exact' }
    );

    expect(added).toHaveLength(0);
    expect(skipped).toEqual([
      { title: 'Malformed orchestration task', reason: 'invalid_orchestration' },
    ]);
  });
});
