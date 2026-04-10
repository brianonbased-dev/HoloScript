/**
 * Hierarchy Module Tests
 * Sprint 4 Priority 7 - Hierarchical Agent Orchestration
 *
 * Tests for HierarchyManager and DelegationEngine.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HierarchyManager,
  getHierarchyManager,
  resetHierarchyManager,
  CreateHierarchyOptions,
} from '../AgentHierarchy';
import {
  DelegationEngine,
  getDelegationEngine,
  resetDelegationEngine,
  DelegateTaskOptions,
} from '../DelegationEngine';
import type { AgentManifest, AgentCapability } from '../../agents/AgentTypes';
import type { DelegationRule, TaskError } from '../HierarchyTypes';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestManifest(
  id: string,
  capabilities: Array<{ type: string; domain: string }> = []
): AgentManifest {
  return {
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    capabilities: capabilities.map((c) => ({
      type: c.type,
      domain: c.domain,
    })),
    endpoints: [{ protocol: 'local', address: 'internal' }],
    trustLevel: 'local',
  } as AgentManifest;
}

function createTestRule(
  taskType: string,
  overrides: Partial<DelegationRule> = {}
): Omit<DelegationRule, 'id'> {
  return {
    taskType,
    targetCapability: 'general',
    maxRetries: 3,
    escalateOnFailure: true,
    timeout: 5000,
    priority: 0,
    requiresApproval: false,
    ...overrides,
  };
}

// =============================================================================
// HIERARCHY MANAGER TESTS
// =============================================================================

describe('HierarchyManager', () => {
  let manager: HierarchyManager;

  beforeEach(() => {
    manager = new HierarchyManager();
  });

  afterEach(() => {
    resetHierarchyManager();
  });

  describe('Singleton', () => {
    it('should get default manager instance', () => {
      const m1 = getHierarchyManager();
      const m2 = getHierarchyManager();
      expect(m1).toBe(m2);
    });

    it('should reset manager', () => {
      const m1 = getHierarchyManager();
      resetHierarchyManager();
      const m2 = getHierarchyManager();
      expect(m1).not.toBe(m2);
    });
  });

  describe('Hierarchy CRUD', () => {
    it('should create a hierarchy', () => {
      const supervisor = createTestManifest('supervisor-1');
      const subordinates = [createTestManifest('worker-1'), createTestManifest('worker-2')];

      const hierarchy = manager.createHierarchy({
        name: 'test-team',
        supervisor,
        subordinates,
      });

      expect(hierarchy.id).toBeDefined();
      expect(hierarchy.name).toBe('test-team');
      expect(hierarchy.supervisor.id).toBe('supervisor-1');
      expect(hierarchy.subordinates).toHaveLength(2);
    });

    it('should reject duplicate hierarchy ID', () => {
      const supervisor1 = createTestManifest('sup-1');
      const supervisor2 = createTestManifest('sup-2');

      manager.createHierarchy({ id: 'hier-1', name: 'team-1', supervisor: supervisor1 });

      expect(() =>
        manager.createHierarchy({ id: 'hier-1', name: 'team-2', supervisor: supervisor2 })
      ).toThrow('already exists');
    });

    it('should reject supervisor already in hierarchy', () => {
      const supervisor = createTestManifest('sup-shared');

      manager.createHierarchy({ name: 'team-1', supervisor });

      expect(() => manager.createHierarchy({ name: 'team-2', supervisor })).toThrow(
        'already in a hierarchy'
      );
    });

    it('should get hierarchy by ID', () => {
      const supervisor = createTestManifest('sup');
      const created = manager.createHierarchy({ name: 'test', supervisor });

      const retrieved = manager.getHierarchy(created.id);
      expect(retrieved.id).toBe(created.id);
    });

    it('should throw for non-existent hierarchy', () => {
      expect(() => manager.getHierarchy('non-existent')).toThrow('not found');
    });

    it('should list all hierarchies', () => {
      manager.createHierarchy({ name: 'team-1', supervisor: createTestManifest('s1') });
      manager.createHierarchy({ name: 'team-2', supervisor: createTestManifest('s2') });

      const list = manager.listHierarchies();
      expect(list).toHaveLength(2);
    });

    it('should update hierarchy metadata', () => {
      const supervisor = createTestManifest('sup');
      const hierarchy = manager.createHierarchy({ name: 'original', supervisor });

      const updated = manager.updateHierarchy(hierarchy.id, {
        name: 'renamed',
        metadata: { tags: ['updated'] },
      });

      expect(updated.name).toBe('renamed');
      expect(updated.metadata.tags).toContain('updated');
    });

    it('should delete hierarchy', () => {
      const supervisor = createTestManifest('sup');
      const hierarchy = manager.createHierarchy({ name: 'to-delete', supervisor });

      manager.deleteHierarchy(hierarchy.id);

      expect(() => manager.getHierarchy(hierarchy.id)).toThrow('not found');
    });
  });

  describe('Subordinate Management', () => {
    it('should add subordinate to hierarchy', () => {
      const supervisor = createTestManifest('sup');
      const hierarchy = manager.createHierarchy({ name: 'team', supervisor });
      const worker = createTestManifest('worker');

      manager.addSubordinate(hierarchy.id, worker);

      expect(manager.getHierarchy(hierarchy.id).subordinates).toHaveLength(1);
    });

    it('should remove subordinate from hierarchy', () => {
      const supervisor = createTestManifest('sup');
      const worker = createTestManifest('worker');
      const hierarchy = manager.createHierarchy({
        name: 'team',
        supervisor,
        subordinates: [worker],
      });

      manager.removeSubordinate(hierarchy.id, 'worker');

      expect(manager.getHierarchy(hierarchy.id).subordinates).toHaveLength(0);
    });

    it('should get subordinates of supervisor', () => {
      const supervisor = createTestManifest('sup');
      const workers = [createTestManifest('w1'), createTestManifest('w2')];
      manager.createHierarchy({ name: 'team', supervisor, subordinates: workers });

      const subs = manager.getSubordinates('sup');
      expect(subs).toHaveLength(2);
    });

    it('should get supervisor of subordinate', () => {
      const supervisor = createTestManifest('sup');
      const worker = createTestManifest('worker');
      manager.createHierarchy({ name: 'team', supervisor, subordinates: [worker] });

      const sup = manager.getSupervisor('worker');
      expect(sup?.id).toBe('sup');
    });

    it('should check if agent is supervisor', () => {
      const supervisor = createTestManifest('sup');
      const worker = createTestManifest('worker');
      manager.createHierarchy({ name: 'team', supervisor, subordinates: [worker] });

      expect(manager.isSupervisor('sup')).toBe(true);
      expect(manager.isSupervisor('worker')).toBe(false);
    });

    it('should check if agent is subordinate', () => {
      const supervisor = createTestManifest('sup');
      const worker = createTestManifest('worker');
      manager.createHierarchy({ name: 'team', supervisor, subordinates: [worker] });

      expect(manager.isSubordinate('worker')).toBe(true);
      expect(manager.isSubordinate('sup')).toBe(false);
    });
  });

  describe('Delegation Rules', () => {
    it('should add delegation rule', () => {
      const supervisor = createTestManifest('sup');
      const hierarchy = manager.createHierarchy({ name: 'team', supervisor });

      const rule = manager.addDelegationRule(hierarchy.id, createTestRule('write'));

      expect(rule.id).toBeDefined();
      expect(rule.taskType).toBe('write');
    });

    it('should remove delegation rule', () => {
      const supervisor = createTestManifest('sup');
      const hierarchy = manager.createHierarchy({ name: 'team', supervisor });
      const rule = manager.addDelegationRule(hierarchy.id, createTestRule('write'));

      manager.removeDelegationRule(hierarchy.id, rule.id);

      expect(manager.findDelegationRule(hierarchy.id, 'write')).toBeUndefined();
    });

    it('should find matching delegation rule', () => {
      const supervisor = createTestManifest('sup');
      const hierarchy = manager.createHierarchy({ name: 'team', supervisor });
      manager.addDelegationRule(hierarchy.id, createTestRule('write', { priority: 1 }));
      manager.addDelegationRule(hierarchy.id, createTestRule('write', { priority: 10 }));

      const found = manager.findDelegationRule(hierarchy.id, 'write');
      expect(found?.priority).toBe(10); // Higher priority
    });

    it('should find subordinate by capability', () => {
      const supervisor = createTestManifest('sup');
      const writer = createTestManifest('writer', [{ type: 'generate', domain: 'nlp' }]);
      const hierarchy = manager.createHierarchy({
        name: 'team',
        supervisor,
        subordinates: [writer],
      });

      const found = manager.findSubordinateByCapability(hierarchy.id, 'generate');
      expect(found?.id).toBe('writer');
    });
  });

  describe('Escalation', () => {
    it('should get escalation path', () => {
      const supervisor = createTestManifest('sup');
      const hierarchy = manager.createHierarchy({
        name: 'team',
        supervisor,
        escalationPath: ['sup', 'manager', 'director'],
      });

      const path = manager.getEscalationPath(hierarchy.id);
      expect(path).toEqual(['sup', 'manager', 'director']);
    });

    it('should get next escalation target', () => {
      const supervisor = createTestManifest('sup');
      const hierarchy = manager.createHierarchy({
        name: 'team',
        supervisor,
        escalationPath: ['worker', 'sup', 'manager'],
      });

      expect(manager.getNextEscalationTarget(hierarchy.id, 'worker')).toBe('sup');
      expect(manager.getNextEscalationTarget(hierarchy.id, 'sup')).toBe('manager');
      expect(manager.getNextEscalationTarget(hierarchy.id, 'manager')).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    it('should get hierarchy stats', () => {
      const supervisor = createTestManifest('sup');
      const worker = createTestManifest('worker');
      const hierarchy = manager.createHierarchy({
        name: 'team',
        supervisor,
        subordinates: [worker],
      });

      const stats = manager.getStats(hierarchy.id);
      expect(stats.hierarchyId).toBe(hierarchy.id);
      expect(stats.activeSubordinates).toBe(1);
    });

    it('should record task completion', () => {
      const supervisor = createTestManifest('sup');
      const worker = createTestManifest('worker');
      const hierarchy = manager.createHierarchy({
        name: 'team',
        supervisor,
        subordinates: [worker],
      });

      manager.recordTaskCompletion(hierarchy.id, 'worker', true, 1000);
      manager.recordTaskCompletion(hierarchy.id, 'worker', false, 500);

      const stats = manager.getStats(hierarchy.id);
      expect(stats.totalTasks).toBe(2);
      expect(stats.completedTasks).toBe(1);
      expect(stats.failedTasks).toBe(1);
      expect(stats.successRate).toBe(0.5);
    });
  });

  describe('Events', () => {
    it('should emit hierarchyCreated event', () => {
      const handler = vi.fn();
      manager.on('hierarchyCreated', handler);

      manager.createHierarchy({ name: 'team', supervisor: createTestManifest('sup') });

      expect(handler).toHaveBeenCalled();
    });

    it('should emit subordinateAdded event', () => {
      const handler = vi.fn();
      manager.on('subordinateAdded', handler);

      const hierarchy = manager.createHierarchy({
        name: 'team',
        supervisor: createTestManifest('sup'),
      });
      manager.addSubordinate(hierarchy.id, createTestManifest('worker'));

      expect(handler).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// DELEGATION ENGINE TESTS
// =============================================================================

describe('DelegationEngine', () => {
  let manager: HierarchyManager;
  let engine: DelegationEngine;
  let hierarchyId: string;

  beforeEach(() => {
    manager = new HierarchyManager();
    engine = new DelegationEngine({ hierarchyManager: manager });

    const supervisor = createTestManifest('supervisor');
    const workers = [
      createTestManifest('worker-1', [{ type: 'generate', domain: 'nlp' }]),
      createTestManifest('worker-2', [{ type: 'analyze', domain: 'vision' }]),
    ];

    const hierarchy = manager.createHierarchy({
      name: 'test-team',
      supervisor,
      subordinates: workers,
      escalationPath: ['worker-1', 'worker-2', 'supervisor'],
    });
    hierarchyId = hierarchy.id;
  });

  afterEach(() => {
    engine.destroy();
    resetDelegationEngine();
    resetHierarchyManager();
  });

  describe('Singleton', () => {
    it('should get default engine instance', () => {
      const e1 = getDelegationEngine();
      const e2 = getDelegationEngine();
      expect(e1).toBe(e2);
    });

    it('should reset engine', () => {
      const e1 = getDelegationEngine();
      resetDelegationEngine();
      const e2 = getDelegationEngine();
      expect(e1).not.toBe(e2);
    });
  });

  describe('Task Delegation', () => {
    it('should delegate task to specific agent', async () => {
      const task = await engine.delegate({
        hierarchyId,
        taskType: 'write',
        payload: { content: 'test' },
        assigneeId: 'worker-1',
      });

      expect(task.id).toBeDefined();
      expect(task.assigneeId).toBe('worker-1');
      expect(task.status).toBe('pending');
    });

    it('should auto-assign to least loaded subordinate', async () => {
      const task = await engine.delegate({
        hierarchyId,
        taskType: 'generic',
        payload: {},
      });

      expect(task.assigneeId).toBeDefined();
      expect(['worker-1', 'worker-2']).toContain(task.assigneeId);
    });

    it('should throw if no subordinate available', async () => {
      const emptyHierarchy = manager.createHierarchy({
        name: 'empty',
        supervisor: createTestManifest('lonely-sup'),
      });

      await expect(
        engine.delegate({
          hierarchyId: emptyHierarchy.id,
          taskType: 'task',
          payload: {},
        })
      ).rejects.toThrow('No available subordinate');
    });

    it('should emit taskDelegated event', async () => {
      const handler = vi.fn();
      engine.on('taskDelegated', handler);

      await engine.delegate({
        hierarchyId,
        taskType: 'test',
        payload: {},
        assigneeId: 'worker-1',
      });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Task Lifecycle', () => {
    it('should start a pending task', async () => {
      const task = await engine.delegate({
        hierarchyId,
        taskType: 'work',
        payload: {},
        assigneeId: 'worker-1',
      });

      const started = engine.startTask(task.id);

      expect(started.status).toBe('in_progress');
      expect(started.startedAt).toBeDefined();
    });

    it('should complete a task', async () => {
      const task = await engine.delegate({
        hierarchyId,
        taskType: 'work',
        payload: {},
        assigneeId: 'worker-1',
      });
      engine.startTask(task.id);

      const completed = engine.completeTask(task.id, {
        data: { result: 'success' },
      });

      expect(completed.status).toBe('completed');
      expect(completed.result?.data).toEqual({ result: 'success' });
      expect(completed.result?.duration).toBeGreaterThanOrEqual(0);
    });

    it('should fail a task', async () => {
      // Assign to supervisor so there's no escalation path (supervisor is last in path)
      const task = await engine.delegate({
        hierarchyId,
        taskType: 'work',
        payload: {},
        assigneeId: 'supervisor', // Supervisor is at end of escalation path
        timeout: 60000,
      });
      engine.startTask(task.id);

      const error: TaskError = {
        code: 'ERROR',
        message: 'Something went wrong',
        recoverable: false,
      };

      const failed = engine.failTask(task.id, error);

      expect(failed.status).toBe('failed');
      expect(failed.error?.code).toBe('ERROR');
    });

    it('should retry recoverable errors', async () => {
      const task = await engine.delegate({
        hierarchyId,
        taskType: 'work',
        payload: {},
        assigneeId: 'worker-1',
        timeout: 60000,
      });
      engine.startTask(task.id);

      const error: TaskError = {
        code: 'RETRY',
        message: 'Temporary failure',
        recoverable: true,
        retryAfter: 100,
      };

      const retried = engine.failTask(task.id, error);

      expect(retried.status).toBe('pending');
      expect(retried.retryCount).toBe(1);
    });

    it('should cancel a task', async () => {
      const task = await engine.delegate({
        hierarchyId,
        taskType: 'work',
        payload: {},
        assigneeId: 'worker-1',
      });

      const cancelled = engine.cancelTask(task.id, 'No longer needed');

      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.error?.code).toBe('CANCELLED');
    });
  });

  describe('Task Queries', () => {
    it('should get task by ID', async () => {
      const created = await engine.delegate({
        hierarchyId,
        taskType: 'work',
        payload: {},
        assigneeId: 'worker-1',
      });

      const retrieved = engine.getTask(created.id);
      expect(retrieved.id).toBe(created.id);
    });

    it('should throw for non-existent task', () => {
      expect(() => engine.getTask('non-existent')).toThrow('not found');
    });

    it('should get tasks by hierarchy', async () => {
      await engine.delegate({ hierarchyId, taskType: 't1', payload: {}, assigneeId: 'worker-1' });
      await engine.delegate({ hierarchyId, taskType: 't2', payload: {}, assigneeId: 'worker-2' });

      const tasks = engine.getTasksByHierarchy(hierarchyId);
      expect(tasks).toHaveLength(2);
    });

    it('should get tasks by agent', async () => {
      await engine.delegate({ hierarchyId, taskType: 't1', payload: {}, assigneeId: 'worker-1' });
      await engine.delegate({ hierarchyId, taskType: 't2', payload: {}, assigneeId: 'worker-1' });
      await engine.delegate({ hierarchyId, taskType: 't3', payload: {}, assigneeId: 'worker-2' });

      const tasks = engine.getTasksByAgent('worker-1');
      expect(tasks).toHaveLength(2);
    });

    it('should get active tasks', async () => {
      const t1 = await engine.delegate({
        hierarchyId,
        taskType: 't1',
        payload: {},
        assigneeId: 'worker-1',
      });
      await engine.delegate({ hierarchyId, taskType: 't2', payload: {}, assigneeId: 'worker-2' });

      engine.startTask(t1.id);
      engine.completeTask(t1.id, { data: {} });

      const active = engine.getActiveTasks(hierarchyId);
      expect(active).toHaveLength(1);
    });
  });

  describe('Escalation', () => {
    it('should escalate task to next in path', async () => {
      const task = await engine.delegate({
        hierarchyId,
        taskType: 'work',
        payload: {},
        assigneeId: 'worker-1',
      });

      const escalation = engine.escalateTask(task.id, 'explicit');

      expect(escalation).not.toBeNull();
      expect(escalation?.fromAgentId).toBe('worker-1');
      expect(escalation?.toAgentId).toBe('worker-2');
    });

    it('should return null when no escalation target', async () => {
      const task = await engine.delegate({
        hierarchyId,
        taskType: 'work',
        payload: {},
        assigneeId: 'supervisor',
      });

      const escalation = engine.escalateTask(task.id, 'explicit');

      expect(escalation).toBeNull();
    });

    it('should get escalation history', async () => {
      const task = await engine.delegate({
        hierarchyId,
        taskType: 'work',
        payload: {},
        assigneeId: 'worker-1',
      });

      engine.escalateTask(task.id, 'timeout');
      engine.escalateTask(task.id, 'capability_mismatch');

      const history = engine.getEscalationHistory(task.id);
      expect(history).toHaveLength(2);
    });
  });

  describe('Subtasks', () => {
    it('should create subtask', async () => {
      const parent = await engine.delegate({
        hierarchyId,
        taskType: 'complex',
        payload: {},
        assigneeId: 'worker-1',
      });

      const subtask = await engine.createSubtask(parent.id, {
        taskType: 'simple',
        payload: {},
        assigneeId: 'worker-2',
      });

      expect(subtask.parentTaskId).toBe(parent.id);
      expect(engine.getTask(parent.id).subtaskIds).toContain(subtask.id);
    });

    it('should get subtasks of parent', async () => {
      const parent = await engine.delegate({
        hierarchyId,
        taskType: 'complex',
        payload: {},
        assigneeId: 'worker-1',
      });

      await engine.createSubtask(parent.id, {
        taskType: 's1',
        payload: {},
        assigneeId: 'worker-2',
      });
      await engine.createSubtask(parent.id, {
        taskType: 's2',
        payload: {},
        assigneeId: 'worker-2',
      });

      const subtasks = engine.getSubtasks(parent.id);
      expect(subtasks).toHaveLength(2);
    });

    it('should check if subtasks are complete', async () => {
      const parent = await engine.delegate({
        hierarchyId,
        taskType: 'complex',
        payload: {},
        assigneeId: 'worker-1',
      });

      const sub = await engine.createSubtask(parent.id, {
        taskType: 'sub',
        payload: {},
        assigneeId: 'worker-2',
      });

      expect(engine.areSubtasksComplete(parent.id)).toBe(false);

      engine.startTask(sub.id);
      engine.completeTask(sub.id, { data: {} });

      expect(engine.areSubtasksComplete(parent.id)).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should clean up old completed tasks', async () => {
      const task = await engine.delegate({
        hierarchyId,
        taskType: 'work',
        payload: {},
        assigneeId: 'worker-1',
      });
      engine.startTask(task.id);
      engine.completeTask(task.id, { data: {} });

      // Manually set completedAt to old time
      const t = engine.getTask(task.id);
      t.completedAt = Date.now() - 7200000; // 2 hours ago

      const cleaned = engine.cleanup(3600000); // 1 hour max age
      expect(cleaned).toBe(1);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Hierarchy Integration', () => {
  it('should run complete delegation workflow', async () => {
    const manager = new HierarchyManager();
    const engine = new DelegationEngine({ hierarchyManager: manager });

    // Create hierarchy
    const hierarchy = manager.createHierarchy({
      name: 'content-team',
      supervisor: createTestManifest('lead'),
      subordinates: [
        createTestManifest('writer', [{ type: 'generate', domain: 'nlp' }]),
        createTestManifest('reviewer', [{ type: 'analyze', domain: 'nlp' }]),
      ],
      escalationPath: ['writer', 'reviewer', 'lead'],
    });

    // Add delegation rules
    manager.addDelegationRule(hierarchy.id, {
      taskType: 'write',
      targetCapability: 'generate',
      maxRetries: 2,
      escalateOnFailure: true,
      timeout: 5000,
      priority: 1,
      requiresApproval: false,
    });

    // Delegate a task
    const task = await engine.delegate({
      hierarchyId: hierarchy.id,
      taskType: 'write',
      payload: { topic: 'AI agents' },
    });

    expect(task.assigneeId).toBe('writer');

    // Start and complete
    engine.startTask(task.id);
    engine.completeTask(task.id, { data: { article: 'content...' } });

    // Check stats
    const stats = manager.getStats(hierarchy.id);
    expect(stats.completedTasks).toBe(1);
    expect(stats.successRate).toBe(1);

    engine.destroy();
  });
});
