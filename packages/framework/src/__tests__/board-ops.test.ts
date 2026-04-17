import { describe, it, expect } from 'vitest';
import { addTasksToBoard } from '../board/board-ops';

describe('addTasksToBoard', () => {
  it('preserves dependsOn, unblocks, tags, metadata, onComplete from input', () => {
    const { added: first, updatedBoard: b1 } = addTasksToBoard([], [], [
      {
        title: 'Root task',
        description: 'r',
        source: 'test',
        priority: 1,
      },
    ]);
    const rootId = first[0].id;

    const { added } = addTasksToBoard(b1, [], [
      {
        title: 'Dependent task',
        description: 'd',
        source: 'test',
        priority: 2,
        dependsOn: [rootId],
        unblocks: ['task_future'],
        tags: ['chain:test'],
        metadata: { step: 2 },
        onComplete: [{ type: 'notify', label: 'x' }],
      },
    ]);

    expect(added).toHaveLength(1);
    expect(added[0].dependsOn).toEqual([rootId]);
    expect(added[0].unblocks).toEqual(['task_future']);
    expect(added[0].tags).toEqual(['chain:test']);
    expect(added[0].metadata).toEqual({ step: 2 });
    expect(added[0].onComplete).toEqual([{ type: 'notify', label: 'x' }]);
  });
});
