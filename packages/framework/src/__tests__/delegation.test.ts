import { describe, it, expect, beforeEach } from 'vitest';
import {
  DelegationManager,
  InProcessBoardAdapter,
} from '../delegation';
import type { TaskDef } from '../types';

function makeTask(overrides: Partial<TaskDef> = {}): TaskDef {
  return {
    id: 'task-1',
    title: 'Fix the parser bug',
    description: 'Parser fails on nested objects',
    status: 'open',
    priority: 3,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('DelegationManager', () => {
  let adapter: InProcessBoardAdapter;
  let managerA: DelegationManager;

  beforeEach(() => {
    adapter = new InProcessBoardAdapter();

    // Register team-b's addTasks
    adapter.registerTeam('team-b', async (tasks) => {
      return tasks.map((t, i) => ({
        id: `tb-${i}`,
        title: t.title,
        description: t.description ?? '',
        status: 'open' as const,
        priority: t.priority ?? 5,
        role: t.role,
        source: t.source,
        createdAt: new Date().toISOString(),
      }));
    });

    managerA = new DelegationManager('team-a', adapter);
  });

  it('delegates a task to another team', async () => {
    const task = makeTask();
    const result = await managerA.delegate(task, 'team-b');
    expect(result.success).toBe(true);
    expect(result.fromTeam).toBe('team-a');
    expect(result.toTeam).toBe('team-b');
    expect(result.chain).toEqual(['team-a']);
  });

  it('rejects self-delegation', async () => {
    const task = makeTask();
    const result = await managerA.delegate(task, 'team-a');
    expect(result.success).toBe(false);
    expect(result.reason).toContain('Cannot delegate to self');
  });

  it('detects cycles in delegation chain', async () => {
    const task = makeTask();
    // Simulate: team-b already delegated to team-a, now team-a tries to delegate back
    const result = await managerA.delegate(task, 'team-b', ['team-b']);
    // Chain becomes ['team-b', 'team-a'], and target is 'team-b' which is in the chain
    expect(result.success).toBe(false);
    expect(result.reason).toContain('Cycle detected');
  });

  it('enforces max chain length', async () => {
    const manager = new DelegationManager('team-a', adapter, { maxChainLength: 3 });
    const task = makeTask();
    // Existing chain of 3 means we're at the limit
    const result = await manager.delegate(task, 'team-b', ['team-x', 'team-y', 'team-z']);
    // Chain becomes ['team-x', 'team-y', 'team-z', 'team-a'] = length 4 >= max 3
    expect(result.success).toBe(false);
    expect(result.reason).toContain('chain too long');
  });

  it('fails when target team not found', async () => {
    const task = makeTask();
    const result = await managerA.delegate(task, 'team-unknown');
    expect(result.success).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('tracks outbound delegations', async () => {
    const task1 = makeTask({ id: 'task-1' });
    const task2 = makeTask({ id: 'task-2', title: 'Another task' });
    await managerA.delegate(task1, 'team-b');
    await managerA.delegate(task2, 'team-b');
    const outbound = managerA.getOutboundDelegations();
    expect(outbound).toHaveLength(2);
  });

  it('marks delegation as completed', async () => {
    const task = makeTask();
    await managerA.delegate(task, 'team-b');
    const completed = await managerA.completeDelegation('task-1', 'team-b', 'Done!');
    expect(completed).toBe(true);
    expect(managerA.getPendingDelegations()).toHaveLength(0);
  });

  it('returns false for unknown completion', async () => {
    const completed = await managerA.completeDelegation('nonexistent', 'team-b', 'Done!');
    expect(completed).toBe(false);
  });
});

describe('InProcessBoardAdapter', () => {
  it('sends tasks to registered teams', async () => {
    const adapter = new InProcessBoardAdapter();
    const received: unknown[] = [];
    adapter.registerTeam('team-b', async (tasks) => {
      received.push(...tasks);
      return tasks.map((t, i) => ({
        id: `t-${i}`,
        title: t.title,
        description: t.description ?? '',
        status: 'open' as const,
        priority: t.priority ?? 5,
        createdAt: new Date().toISOString(),
      }));
    });

    const result = await adapter.sendTask('team-b', {
      title: 'Test task',
      description: 'Desc',
      priority: 3,
    });

    expect(result.accepted).toBe(true);
    expect(received).toHaveLength(1);
  });

  it('rejects tasks for unregistered teams', async () => {
    const adapter = new InProcessBoardAdapter();
    const result = await adapter.sendTask('nonexistent', {
      title: 'Test',
      description: 'Desc',
      priority: 3,
    });
    expect(result.accepted).toBe(false);
  });
});
