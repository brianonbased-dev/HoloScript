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

  it('returns skipped duplicate titles so batch clients can reconcile IDs vs server truth', () => {
    const { added: first, updatedBoard: b1, skipped: s0 } = addTasksToBoard([], [], [
      { title: 'Unique A', description: '', source: 't', priority: 1 },
      { title: 'Unique B', description: '', source: 't', priority: 1 },
    ]);
    expect(s0).toHaveLength(0);
    expect(first).toHaveLength(2);

    const { added, skipped } = addTasksToBoard(b1, [], [
      { title: 'Unique A', description: 'dup', source: 't', priority: 1 },
      { title: 'Unique C', description: '', source: 't', priority: 1 },
    ]);
    expect(added).toHaveLength(1);
    expect(added[0].title).toBe('Unique C');
    expect(skipped).toEqual([{ title: 'Unique A', reason: 'duplicate' }]);
  });

  it('records empty_title when title is missing', () => {
    const { added, skipped } = addTasksToBoard([], [], [
      { title: '', description: 'x', source: 't', priority: 1 } as any,
    ]);
    expect(added).toHaveLength(0);
    expect(skipped).toEqual([{ title: '', reason: 'empty_title' }]);
  });

  it('emits warning when description is truncated', () => {
    const longDescription = 'x'.repeat(1300);
    const { added, warnings } = addTasksToBoard([], [], [
      { title: 'Long desc task', description: longDescription, source: 't', priority: 1 },
    ]);

    expect(added).toHaveLength(1);
    expect(added[0].description).toHaveLength(1000);
    expect(warnings).toEqual([
      {
        title: 'Long desc task',
        reason: 'description_truncated',
        originalLength: 1300,
        keptLength: 1000,
      },
    ]);
  });
});
