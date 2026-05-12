import { describe, expect, it } from 'vitest';
import {
  addTasksToBoard,
  claimTask,
  completeTask,
  hasDefinitionOfDone,
  type TeamTask,
} from '../board';

function task(overrides: Partial<TeamTask> = {}): TeamTask {
  return {
    id: 'task_dod',
    title: 'Ship with closure criteria',
    description: 'Implement the board discipline.',
    status: 'open',
    priority: 1,
    createdAt: '2026-05-12T00:00:00.000Z',
    ...overrides,
  };
}

describe('board Definition-of-Done discipline', () => {
  it('adds a Done when block to newly created tasks', () => {
    const { added } = addTasksToBoard([], [], [
      { title: 'Template task', description: 'Do the thing.', priority: 2 },
    ]);

    expect(added).toHaveLength(1);
    expect(hasDefinitionOfDone(added[0].description)).toBe(true);
    expect(added[0].description).toContain('## Done when:');
  });

  it('preserves Done when criteria when long descriptions are truncated', () => {
    const longPrefix = 'x'.repeat(2100);
    const { added } = addTasksToBoard([], [], [
      {
        title: 'Long template task',
        description: `${longPrefix}\n\n## Done when:\n- The intended proof still survives truncation.`,
        priority: 2,
      },
    ]);

    expect(added[0].description.length).toBeLessThanOrEqual(2000);
    expect(hasDefinitionOfDone(added[0].description)).toBe(true);
  });

  it('rejects claims for pre-existing tasks without Done when criteria', () => {
    const result = claimTask([task()], 'task_dod', 'agent-1', 'codex-hardware');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Definition-of-Done required');
  });

  it('records verification evidence in task and done-log entry', () => {
    const board = [
      task({
        description: 'Implement the board discipline.\n\n## Done when:\n- Targeted tests pass.',
      }),
    ];

    const { result } = completeTask(board, 'task_dod', 'codex-hardware', {
      commit: 'abc1234',
      summary: 'Closed with evidence.',
      verificationEvidence: 'pnpm vitest board-definition-of-done.test.ts passed',
    });

    expect(result.success).toBe(true);
    expect(result.task?.verificationEvidence).toBe('pnpm vitest board-definition-of-done.test.ts passed');
    expect(result.doneEntry?.verificationEvidence).toBe('pnpm vitest board-definition-of-done.test.ts passed');
  });
});
