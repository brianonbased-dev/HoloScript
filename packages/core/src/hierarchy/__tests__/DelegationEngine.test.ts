import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DelegationEngine } from '../DelegationEngine';
import { HierarchyManager } from '../AgentHierarchy';
import type { AgentManifest, AgentCapability } from '../../agents/AgentManifest';

function makeManifest(
  id: string,
  caps: Partial<AgentCapability>[] = [{ type: 'render', domain: 'spatial' }]
): AgentManifest {
  return {
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    capabilities: caps as AgentCapability[],
    endpoints: [{ protocol: 'local', address: 'localhost' }],
    trustLevel: 'local',
    status: 'online',
  } as AgentManifest;
}

describe('DelegationEngine', () => {
  let mgr: HierarchyManager;
  let engine: DelegationEngine;
  const sup = makeManifest('sup');
  const sub1 = makeManifest('sub1');
  const sub2 = makeManifest('sub2');

  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new HierarchyManager();
    engine = new DelegationEngine({
      hierarchyManager: mgr,
      config: { defaultTimeout: 5000, defaultRetries: 2, autoEscalate: false },
    });
    mgr.createHierarchy({
      id: 'h1',
      name: 'Test',
      supervisor: sup,
      subordinates: [sub1, sub2],
      escalationPath: ['sub1', 'sub2', 'sup'],
    });
  });

  afterEach(() => {
    engine.destroy();
    vi.useRealTimers();
  });

  it('delegates a task to specified assignee', async () => {
    const task = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'render',
      payload: { data: 1 },
      assigneeId: 'sub1',
    });
    expect(task.status).toBe('pending');
    expect(task.assigneeId).toBe('sub1');
    expect(task.taskType).toBe('render');
  });

  it('auto-assigns to least-loaded subordinate', async () => {
    const t1 = await engine.delegate({ hierarchyId: 'h1', taskType: 'render', payload: {} });
    expect(['sub1', 'sub2']).toContain(t1.assigneeId);
  });

  it('throws if no subordinates available', async () => {
    const mgr2 = new HierarchyManager();
    const engine2 = new DelegationEngine({ hierarchyManager: mgr2 });
    mgr2.createHierarchy({ id: 'h2', name: 'Empty', supervisor: makeManifest('solo') });
    await expect(
      engine2.delegate({ hierarchyId: 'h2', taskType: 'x', payload: {} })
    ).rejects.toThrow();
    engine2.destroy();
  });

  it('startTask transitions pending → in_progress', async () => {
    const task = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'x',
      payload: {},
      assigneeId: 'sub1',
    });
    const started = engine.startTask(task.id);
    expect(started.status).toBe('in_progress');
    expect(started.startedAt).toBeDefined();
  });

  it('startTask throws for wrong status', async () => {
    const task = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'x',
      payload: {},
      assigneeId: 'sub1',
    });
    engine.startTask(task.id);
    engine.completeTask(task.id, { success: true, data: {} });
    expect(() => engine.startTask(task.id)).toThrow();
  });

  it('completeTask marks task completed', async () => {
    const task = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'x',
      payload: {},
      assigneeId: 'sub1',
    });
    engine.startTask(task.id);
    const completed = engine.completeTask(task.id, { success: true, data: {} });
    expect(completed.status).toBe('completed');
    expect(completed.result?.success).toBe(true);
  });

  it('failTask marks task failed (non-recoverable)', async () => {
    const task = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'x',
      payload: {},
      assigneeId: 'sub1',
    });
    engine.startTask(task.id);
    const failed = engine.failTask(task.id, { code: 'ERR', message: 'oops', recoverable: false });
    expect(failed.status).toBe('failed');
  });

  it('failTask retries recoverable error', async () => {
    const task = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'x',
      payload: {},
      assigneeId: 'sub1',
    });
    engine.startTask(task.id);
    const retried = engine.failTask(task.id, { code: 'ERR', message: 'oops', recoverable: true });
    expect(retried.status).toBe('pending');
    expect(retried.retryCount).toBe(1);
  });

  it('failTask stops retrying after maxRetries', async () => {
    const task = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'x',
      payload: {},
      assigneeId: 'sub1',
    });
    // Retry twice (maxRetries=2), then fail on 3rd
    engine.startTask(task.id);
    engine.failTask(task.id, { code: 'ERR', message: 'a', recoverable: true }); // retry 1
    engine.startTask(task.id);
    engine.failTask(task.id, { code: 'ERR', message: 'b', recoverable: true }); // retry 2
    engine.startTask(task.id);
    const final = engine.failTask(task.id, { code: 'ERR', message: 'c', recoverable: true });
    expect(final.status).toBe('failed');
    expect(final.retryCount).toBe(2);
  });

  it('cancelTask marks task cancelled', async () => {
    const task = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'x',
      payload: {},
      assigneeId: 'sub1',
    });
    const cancelled = engine.cancelTask(task.id, 'no longer needed');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.error?.code).toBe('CANCELLED');
  });

  it('cancelTask throws for completed task', async () => {
    const task = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'x',
      payload: {},
      assigneeId: 'sub1',
    });
    engine.startTask(task.id);
    engine.completeTask(task.id, { success: true, data: {} });
    expect(() => engine.cancelTask(task.id)).toThrow();
  });

  // Escalation
  it('escalateTask reassigns to next in path', async () => {
    const task = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'x',
      payload: {},
      assigneeId: 'sub1',
    });
    const escalation = engine.escalateTask(task.id, 'manual');
    expect(escalation).not.toBeNull();
    expect(escalation!.toAgentId).toBe('sub2');
    expect(engine.getTask(task.id).status).toBe('escalated');
  });

  it('escalateTask returns null when no more targets', async () => {
    const task = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'x',
      payload: {},
      assigneeId: 'sup',
    });
    // sup is last in path [sub1, sub2, sup]
    const result = engine.escalateTask(task.id, 'manual');
    expect(result).toBeNull();
  });

  it('getEscalationHistory tracks escalations', async () => {
    const task = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'x',
      payload: {},
      assigneeId: 'sub1',
    });
    engine.escalateTask(task.id, 'timeout');
    expect(engine.getEscalationHistory(task.id)).toHaveLength(1);
  });

  // Queries
  it('getTasksByHierarchy returns all tasks', async () => {
    await engine.delegate({ hierarchyId: 'h1', taskType: 'a', payload: {}, assigneeId: 'sub1' });
    await engine.delegate({ hierarchyId: 'h1', taskType: 'b', payload: {}, assigneeId: 'sub2' });
    expect(engine.getTasksByHierarchy('h1')).toHaveLength(2);
  });

  it('getTasksByAgent returns tasks for agent', async () => {
    await engine.delegate({ hierarchyId: 'h1', taskType: 'a', payload: {}, assigneeId: 'sub1' });
    await engine.delegate({ hierarchyId: 'h1', taskType: 'b', payload: {}, assigneeId: 'sub1' });
    expect(engine.getTasksByAgent('sub1')).toHaveLength(2);
  });

  it('getActiveTasks filters by active statuses', async () => {
    const t1 = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'a',
      payload: {},
      assigneeId: 'sub1',
    });
    await engine.delegate({ hierarchyId: 'h1', taskType: 'b', payload: {}, assigneeId: 'sub2' });
    engine.startTask(t1.id);
    engine.completeTask(t1.id, { success: true, data: {} });
    expect(engine.getActiveTasks('h1')).toHaveLength(1); // only t2 is still pending
  });

  it('getTasksByStatus', async () => {
    const t = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'a',
      payload: {},
      assigneeId: 'sub1',
    });
    engine.startTask(t.id);
    expect(engine.getTasksByStatus('in_progress')).toHaveLength(1);
    expect(engine.getTasksByStatus('pending')).toHaveLength(0);
  });

  // Subtasks
  it('createSubtask links parent and child', async () => {
    const parent = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'big',
      payload: {},
      assigneeId: 'sub1',
    });
    const child = await engine.createSubtask(parent.id, {
      taskType: 'small',
      payload: {},
      assigneeId: 'sub2',
    });
    expect(child.parentTaskId).toBe(parent.id);
    expect(engine.getSubtasks(parent.id)).toHaveLength(1);
  });

  it('areSubtasksComplete returns true when all done', async () => {
    const parent = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'big',
      payload: {},
      assigneeId: 'sub1',
    });
    const child = await engine.createSubtask(parent.id, {
      taskType: 'a',
      payload: {},
      assigneeId: 'sub2',
    });
    expect(engine.areSubtasksComplete(parent.id)).toBe(false);
    engine.startTask(child.id);
    engine.completeTask(child.id, { success: true, data: {} });
    expect(engine.areSubtasksComplete(parent.id)).toBe(true);
  });

  // Cleanup
  it('cleanup removes old finished tasks', async () => {
    const t = await engine.delegate({
      hierarchyId: 'h1',
      taskType: 'a',
      payload: {},
      assigneeId: 'sub1',
    });
    engine.startTask(t.id);
    engine.completeTask(t.id, { success: true, data: {} });

    // Advance time past maxAge
    vi.advanceTimersByTime(4000000);
    const cleaned = engine.cleanup(3600000);
    expect(cleaned).toBe(1);
    expect(() => engine.getTask(t.id)).toThrow();
  });

  // Events
  it('emits taskDelegated event', async () => {
    const cb = vi.fn();
    engine.on('taskDelegated', cb);
    await engine.delegate({ hierarchyId: 'h1', taskType: 'x', payload: {}, assigneeId: 'sub1' });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
