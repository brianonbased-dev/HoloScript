/**
 * DelegationEngine.prod.test.ts — Sprint CLXVIII
 *
 * Production tests for DelegationEngine.
 * Uses in-memory HierarchyManager with constructed hierarchies.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DelegationEngine } from '../DelegationEngine';
import { HierarchyManager } from '../AgentHierarchy';
import type { AgentManifest } from '../../agents/AgentManifest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManifest(id: string, capabilities: string[] = []): AgentManifest {
  return {
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    description: 'Test agent',
    capabilities: capabilities.map((type) => ({
      type,
      description: `Can do ${type}`,
      inputSchema: {},
      outputSchema: {},
    })),
    endpoints: {},
    metadata: {},
  } as unknown as AgentManifest;
}

const HIERARCHY_ID = 'test-h';
const SUPERVISOR_ID = 'sup';
const SUB_A_ID = 'sub-a';
const SUB_B_ID = 'sub-b';

let hierarchyManager: HierarchyManager;
let engine: DelegationEngine;

beforeEach(() => {
  hierarchyManager = new HierarchyManager();
  hierarchyManager.createHierarchy({
    id: HIERARCHY_ID,
    name: 'Test Hierarchy',
    supervisor: makeManifest(SUPERVISOR_ID),
    subordinates: [
      makeManifest(SUB_A_ID, ['render', 'data']),
      makeManifest(SUB_B_ID, ['animation']),
    ],
  });

  engine = new DelegationEngine({
    hierarchyManager,
    config: {
      defaultTimeout: 60000,
      defaultRetries: 2,
      autoEscalate: false,  // off so failTask tests are predictable
      maxDepth: 5,
      healthCheckInterval: 10000,
      allowDecomposition: true,
      metricsEnabled: true,
    },
  });
});

afterEach(() => {
  engine.destroy();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// delegate()
// ---------------------------------------------------------------------------

describe('DelegationEngine', () => {
  describe('delegate()', () => {
    it('creates pending task with correct fields', async () => {
      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        payload: { scene: 'forest' },
        assigneeId: SUB_A_ID,
      });

      expect(task.id).toBeTruthy();
      expect(task.status).toBe('pending');
      expect(task.hierarchyId).toBe(HIERARCHY_ID);
      expect(task.delegatorId).toBe(SUPERVISOR_ID);
      expect(task.assigneeId).toBe(SUB_A_ID);
      expect(task.taskType).toBe('render');
      expect(task.payload).toEqual({ scene: 'forest' });
      expect(task.retryCount).toBe(0);
    });

    it('auto-assigns to subordinate when no assigneeId provided', async () => {
      hierarchyManager.addDelegationRule(HIERARCHY_ID, {
        taskType: 'animation',
        targetCapability: 'animation',
        maxRetries: 1,
        escalateOnFailure: false,
        timeout: 30000,
        priority: 10,
        requiresApproval: false,
      });

      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'animation',
        payload: {},
      });

      expect(task.assigneeId).toBe(SUB_B_ID); // only sub-b has 'animation'
    });

    it('auto-assigns via targetAgentId in rule', async () => {
      hierarchyManager.addDelegationRule(HIERARCHY_ID, {
        taskType: 'data',
        targetCapability: 'data',
        targetAgentId: SUB_A_ID,
        maxRetries: 1,
        escalateOnFailure: false,
        timeout: 10000,
        priority: 5,
        requiresApproval: false,
      });

      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'data',
        payload: {},
      });

      expect(task.assigneeId).toBe(SUB_A_ID);
    });

    it('falls back to least-loaded subordinate when no rule', async () => {
      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'unknown-task',
        payload: {},
      });
      expect([SUB_A_ID, SUB_B_ID]).toContain(task.assigneeId);
    });

    it('uses rule maxRetries', async () => {
      hierarchyManager.addDelegationRule(HIERARCHY_ID, {
        taskType: 'render',
        targetCapability: 'render',
        maxRetries: 5,
        escalateOnFailure: false,
        timeout: 30000,
        priority: 10,
        requiresApproval: false,
      });

      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });

      expect(task.maxRetries).toBe(5);
    });

    it('emits taskDelegated event', async () => {
      const handler = vi.fn();
      engine.on('taskDelegated', handler);

      await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('throws when hierarchyId is invalid', async () => {
      await expect(
        engine.delegate({ hierarchyId: 'nope', taskType: 'render', payload: {} }),
      ).rejects.toThrow(/not found/i);
    });
  });

  // -------------------------------------------------------------------------
  // startTask()
  // -------------------------------------------------------------------------

  describe('startTask()', () => {
    it('transitions to in_progress and sets startedAt', async () => {
      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });

      const started = engine.startTask(task.id);
      expect(started.status).toBe('in_progress');
      expect(started.startedAt).toBeTruthy();
    });

    it('emits taskStarted event', async () => {
      const handler = vi.fn();
      engine.on('taskStarted', handler);

      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });
      engine.startTask(task.id);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('throws for unknown task ID', () => {
      expect(() => engine.startTask('bad-id')).toThrow(/not found/i);
    });

    it('throws when task is not in pending/assigned status', async () => {
      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });
      engine.startTask(task.id);
      // Already in_progress — can't start again
      expect(() => engine.startTask(task.id)).toThrow(/Cannot start task/i);
    });
  });

  // -------------------------------------------------------------------------
  // completeTask()
  // -------------------------------------------------------------------------

  describe('completeTask()', () => {
    it('marks task completed with result', async () => {
      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });
      engine.startTask(task.id);

      const completed = engine.completeTask(task.id, { data: { frames: 120 } });
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBeTruthy();
      expect(completed.result?.data).toEqual({ frames: 120 });
    });

    it('emits taskCompleted event', async () => {
      const handler = vi.fn();
      engine.on('taskCompleted', handler);

      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });
      engine.startTask(task.id);
      engine.completeTask(task.id, { data: 'ok' });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('throws for unknown task', () => {
      expect(() => engine.completeTask('bad-id', { data: null })).toThrow(/not found/i);
    });

    it('throws when task is not in_progress', async () => {
      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });
      // Still pending — cannot complete
      expect(() => engine.completeTask(task.id, { data: null })).toThrow(/Cannot complete/i);
    });
  });

  // -------------------------------------------------------------------------
  // failTask() and retry logic
  // -------------------------------------------------------------------------

  describe('failTask() and retry logic', () => {
    it('retries when retryCount < maxRetries (recoverable error)', async () => {
      hierarchyManager.addDelegationRule(HIERARCHY_ID, {
        taskType: 'render',
        targetCapability: 'render',
        maxRetries: 2,
        escalateOnFailure: false,
        timeout: 60000,
        priority: 5,
        requiresApproval: false,
      });
      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });
      engine.startTask(task.id);

      const result = engine.failTask(task.id, {
        code: 'ERR_RENDER',
        message: 'GPU crash',
        recoverable: true,
      });

      expect(result.status).toBe('pending'); // retrying
      expect(result.retryCount).toBe(1);
    });

    it('marks failed permanently when retries exhausted', async () => {
      hierarchyManager.addDelegationRule(HIERARCHY_ID, {
        taskType: 'render',
        targetCapability: 'render',
        maxRetries: 1,
        escalateOnFailure: false,
        timeout: 60000,
        priority: 5,
        requiresApproval: false,
      });
      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });

      engine.startTask(task.id);
      // First failure: retry
      const after1 = engine.failTask(task.id, { code: 'E', message: 'err', recoverable: true });
      expect(after1.status).toBe('pending');

      // Second failure: exhausted (retryCount=1 >= maxRetries=1)
      engine.startTask(task.id);
      const after2 = engine.failTask(task.id, { code: 'E', message: 'err', recoverable: true });
      expect(after2.status).toBe('failed');
    });

    it('non-recoverable error skips retry immediately', async () => {
      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });
      engine.startTask(task.id);
      const result = engine.failTask(task.id, { code: 'FATAL', message: 'fatal', recoverable: false });
      expect(result.status).toBe('failed');
      expect(result.retryCount).toBe(0);
    });

    it('emits taskFailed when permanently failed', async () => {
      const handler = vi.fn();
      engine.on('taskFailed', handler);

      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });
      engine.startTask(task.id);
      engine.failTask(task.id, { code: 'E', message: 'err', recoverable: false });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('escalates when rule has escalateOnFailure flag', async () => {
      // Enable autoEscalate for this specific test via a fresh engine
      const eng2 = new DelegationEngine({
        hierarchyManager,
        config: {
          defaultTimeout: 60000,
          defaultRetries: 0,
          autoEscalate: false,
          maxDepth: 5,
          healthCheckInterval: 10000,
          allowDecomposition: true,
          metricsEnabled: true,
        },
      });

      hierarchyManager.addDelegationRule(HIERARCHY_ID, {
        taskType: 'critical',
        targetCapability: 'render',
        maxRetries: 0,
        escalateOnFailure: true,
        timeout: 30000,
        priority: 10,
        requiresApproval: false,
      });

      const escalationHandler = vi.fn();
      eng2.on('taskEscalated', escalationHandler);

      const task = await eng2.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'critical',
        assigneeId: SUB_A_ID,
        payload: {},
      });
      eng2.startTask(task.id);
      eng2.failTask(task.id, { code: 'E', message: 'fail', recoverable: false });

      expect(escalationHandler).toHaveBeenCalledTimes(1);
      eng2.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // cancelTask()
  // -------------------------------------------------------------------------

  describe('cancelTask()', () => {
    it('cancels a pending task', async () => {
      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });

      const cancelled = engine.cancelTask(task.id, 'Not needed');
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.error?.message).toBe('Not needed');
    });

    it('emits taskCancelled event', async () => {
      const handler = vi.fn();
      engine.on('taskCancelled', handler);

      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });
      engine.cancelTask(task.id);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('throws for unknown task', () => {
      expect(() => engine.cancelTask('nope')).toThrow(/not found/i);
    });

    it('throws when trying to cancel already-completed task', async () => {
      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });
      engine.startTask(task.id);
      engine.completeTask(task.id, { data: null });
      expect(() => engine.cancelTask(task.id)).toThrow(/Cannot cancel/i);
    });
  });

  // -------------------------------------------------------------------------
  // Task queries
  // -------------------------------------------------------------------------

  describe('task queries', () => {
    it('getTask returns task by ID', async () => {
      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });

      expect(engine.getTask(task.id).id).toBe(task.id);
    });

    it('getTask throws for unknown ID', () => {
      expect(() => engine.getTask('unknown')).toThrow(/not found/i);
    });

    it('getTasksByAgent returns tasks for given agent', async () => {
      await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });
      await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'animation',
        assigneeId: SUB_B_ID,
        payload: {},
      });

      const tasksA = engine.getTasksByAgent(SUB_A_ID);
      expect(tasksA).toHaveLength(1);
      expect(tasksA[0].assigneeId).toBe(SUB_A_ID);
    });

    it('getTasksByHierarchy returns all tasks for hierarchy', async () => {
      await engine.delegate({ hierarchyId: HIERARCHY_ID, taskType: 'render', assigneeId: SUB_A_ID, payload: {} });
      await engine.delegate({ hierarchyId: HIERARCHY_ID, taskType: 'animation', assigneeId: SUB_B_ID, payload: {} });

      expect(engine.getTasksByHierarchy(HIERARCHY_ID)).toHaveLength(2);
    });

    it('getActiveTasks returns only active tasks', async () => {
      const t1 = await engine.delegate({ hierarchyId: HIERARCHY_ID, taskType: 'render', assigneeId: SUB_A_ID, payload: {} });
      await engine.delegate({ hierarchyId: HIERARCHY_ID, taskType: 'animation', assigneeId: SUB_B_ID, payload: {} });

      engine.startTask(t1.id);
      // t2 stays pending (active too)

      const active = engine.getActiveTasks();
      expect(active.length).toBeGreaterThanOrEqual(1);
      expect(active.some((t) => t.id === t1.id)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Load balancing
  // -------------------------------------------------------------------------

  describe('load balancing', () => {
    it('assigns to least-loaded subordinate', async () => {
      // Give sub-a 2 tasks
      await engine.delegate({ hierarchyId: HIERARCHY_ID, taskType: 'render', assigneeId: SUB_A_ID, payload: {} });
      await engine.delegate({ hierarchyId: HIERARCHY_ID, taskType: 'render', assigneeId: SUB_A_ID, payload: {} });

      // Next auto-assigned task should go to sub-b (0 tasks)
      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'animation',
        payload: {},
      });
      expect(task.assigneeId).toBe(SUB_B_ID);
    });
  });

  // -------------------------------------------------------------------------
  // Subtask creation
  // -------------------------------------------------------------------------

  describe('createSubtask()', () => {
    it('creates a subtask linked to parent', async () => {
      const parent = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });

      const subtask = await engine.createSubtask(parent.id, {
        taskType: 'data',
        assigneeId: SUB_B_ID,
        payload: { chunk: 1 },
      });

      expect(subtask.parentTaskId).toBe(parent.id);
      expect(engine.getTask(parent.id).subtaskIds).toContain(subtask.id);
    });

    it('throws when parent task is unknown', async () => {
      await expect(
        engine.createSubtask('nonexistent', { taskType: 'render', payload: {} }),
      ).rejects.toThrow(/not found/i);
    });
  });

  // -------------------------------------------------------------------------
  // cleanup()
  // -------------------------------------------------------------------------

  describe('cleanup()', () => {
    it('removes old completed tasks', async () => {
      const task = await engine.delegate({
        hierarchyId: HIERARCHY_ID,
        taskType: 'render',
        assigneeId: SUB_A_ID,
        payload: {},
      });
      engine.startTask(task.id);
      const completed = engine.completeTask(task.id, { data: null });

      // Force old timestamp
      (completed as any).completedAt = Date.now() - 7200001;

      const removed = engine.cleanup(3600000); // 1 hour max age
      expect(removed).toBe(1);
    });
  });
});
