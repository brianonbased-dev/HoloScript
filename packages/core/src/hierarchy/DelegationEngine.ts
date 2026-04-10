/**
 * Delegation Engine
 * Sprint 4 Priority 7 - Hierarchical Agent Orchestration
 *
 * Handles task delegation from supervisors to subordinates,
 * including retry logic, escalation, and tracking.
 */

import { EventEmitter } from 'events';
import { HierarchyManager, getHierarchyManager } from './AgentHierarchy';
import {
  DelegatedTask,
  TaskStatus,
  TaskResult,
  TaskError,
  EscalationEvent,
  EscalationReason,
  HierarchyConfig,
  DEFAULT_HIERARCHY_CONFIG,
} from './HierarchyTypes';

// =============================================================================
// DELEGATION ENGINE
// =============================================================================

/**
 * Engine for delegating and tracking tasks within hierarchies
 */
export class DelegationEngine extends EventEmitter {
  private tasks: Map<string, DelegatedTask> = new Map();
  private tasksByHierarchy: Map<string, Set<string>> = new Map();
  private tasksByAgent: Map<string, Set<string>> = new Map();
  private escalations: EscalationEvent[] = [];
  private timeoutHandles: Map<string, NodeJS.Timeout> = new Map();
  private config: HierarchyConfig;
  private hierarchyManager: HierarchyManager;

  constructor(options: DelegationEngineOptions = {}) {
    super();
    this.config = { ...DEFAULT_HIERARCHY_CONFIG, ...options.config };
    this.hierarchyManager = options.hierarchyManager || getHierarchyManager();
  }

  // ===========================================================================
  // TASK DELEGATION
  // ===========================================================================

  /**
   * Delegate a task to a subordinate
   */
  async delegate(options: DelegateTaskOptions): Promise<DelegatedTask> {
    const { hierarchyId, taskType, payload, priority = 0, timeout, parentTaskId } = options;

    // Get hierarchy and find appropriate subordinate
    const hierarchy = this.hierarchyManager.getHierarchy(hierarchyId);

    // Find delegation rule
    const rule = this.hierarchyManager.findDelegationRule(hierarchyId, taskType);
    const taskTimeout = timeout ?? rule?.timeout ?? this.config.defaultTimeout;
    const maxRetries = rule?.maxRetries ?? this.config.defaultRetries;

    // Find assignee
    let assigneeId = options.assigneeId;
    if (!assigneeId) {
      if (rule?.targetAgentId) {
        assigneeId = rule.targetAgentId;
      } else if (rule?.targetCapability) {
        const subordinate = this.hierarchyManager.findSubordinateByCapability(
          hierarchyId,
          rule.targetCapability
        );
        assigneeId = subordinate?.id;
      }
    }

    // If no specific assignee found, use first available subordinate
    if (!assigneeId && hierarchy.subordinates.length > 0) {
      assigneeId = this.findLeastLoadedSubordinate(hierarchyId);
    }

    if (!assigneeId) {
      throw new Error(`No available subordinate for task type: ${taskType}`);
    }

    // Create task
    const task: DelegatedTask = {
      id: this.generateId(),
      hierarchyId,
      delegatorId: hierarchy.supervisor.id,
      assigneeId,
      taskType,
      payload,
      status: 'pending',
      priority,
      createdAt: Date.now(),
      timeoutAt: Date.now() + taskTimeout,
      retryCount: 0,
      maxRetries,
      subtaskIds: [],
      parentTaskId,
    };

    // Store task
    this.tasks.set(task.id, task);
    this.indexTask(task);

    // Set up timeout
    this.scheduleTimeout(task.id, taskTimeout);

    this.emit('taskDelegated', { task });

    return task;
  }

  /**
   * Find the subordinate with the fewest active tasks
   */
  private findLeastLoadedSubordinate(hierarchyId: string): string | undefined {
    const hierarchy = this.hierarchyManager.getHierarchy(hierarchyId);

    let minTasks = Infinity;
    let selectedId: string | undefined;

    for (const sub of hierarchy.subordinates) {
      const tasks = this.tasksByAgent.get(sub.id);
      const activeCount = tasks
        ? Array.from(tasks).filter((id) => {
            const t = this.tasks.get(id);
            return t && ['pending', 'assigned', 'in_progress'].includes(t.status);
          }).length
        : 0;

      if (activeCount < minTasks) {
        minTasks = activeCount;
        selectedId = sub.id;
      }
    }

    return selectedId;
  }

  // ===========================================================================
  // TASK LIFECYCLE
  // ===========================================================================

  /**
   * Mark a task as started
   */
  startTask(taskId: string): DelegatedTask {
    const task = this.getTask(taskId);

    if (task.status !== 'pending' && task.status !== 'assigned') {
      throw new Error(`Cannot start task in status: ${task.status}`);
    }

    task.status = 'in_progress';
    task.startedAt = Date.now();

    this.emit('taskStarted', { task });

    return task;
  }

  /**
   * Complete a task successfully
   */
  completeTask(taskId: string, result: Omit<TaskResult, 'duration'>): DelegatedTask {
    const task = this.getTask(taskId);

    if (task.status !== 'in_progress') {
      throw new Error(`Cannot complete task in status: ${task.status}`);
    }

    task.status = 'completed';
    task.completedAt = Date.now();
    task.result = {
      ...result,
      duration: task.completedAt - (task.startedAt || task.createdAt),
    };

    // Clear timeout
    this.clearTaskTimeout(taskId);

    // Record stats
    this.hierarchyManager.recordTaskCompletion(
      task.hierarchyId,
      task.assigneeId,
      true,
      task.result.duration
    );

    this.emit('taskCompleted', { task });

    return task;
  }

  /**
   * Fail a task
   */
  failTask(taskId: string, error: TaskError): DelegatedTask {
    const task = this.getTask(taskId);

    if (task.status === 'completed' || task.status === 'cancelled') {
      throw new Error(`Cannot fail task in status: ${task.status}`);
    }

    // Check if we should retry
    if (error.recoverable && task.retryCount < task.maxRetries) {
      return this.retryTask(taskId, error);
    }

    task.status = 'failed';
    task.completedAt = Date.now();
    task.error = error;

    // Clear timeout
    this.clearTaskTimeout(taskId);

    // Record stats
    const duration = task.completedAt - (task.startedAt || task.createdAt);
    this.hierarchyManager.recordTaskCompletion(task.hierarchyId, task.assigneeId, false, duration);

    this.emit('taskFailed', { task });

    // Check if we should escalate
    const rule = this.hierarchyManager.findDelegationRule(task.hierarchyId, task.taskType);
    if (rule?.escalateOnFailure || this.config.autoEscalate) {
      this.escalateTask(taskId, 'max_retries');
    }

    return task;
  }

  /**
   * Retry a task
   */
  private retryTask(taskId: string, previousError: TaskError): DelegatedTask {
    const task = this.getTask(taskId);

    task.retryCount++;
    task.status = 'pending';
    task.startedAt = undefined;
    task.error = undefined;

    // Extend timeout with backoff
    const backoff = Math.min(
      previousError.retryAfter || 1000 * Math.pow(2, task.retryCount),
      30000
    );
    task.timeoutAt = Date.now() + backoff + this.config.defaultTimeout;

    // Reschedule timeout
    this.clearTaskTimeout(taskId);
    this.scheduleTimeout(taskId, task.timeoutAt - Date.now());

    this.emit('taskRetrying', { task, attempt: task.retryCount, previousError });

    return task;
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string, reason?: string): DelegatedTask {
    const task = this.getTask(taskId);

    if (task.status === 'completed' || task.status === 'cancelled') {
      throw new Error(`Cannot cancel task in status: ${task.status}`);
    }

    task.status = 'cancelled';
    task.completedAt = Date.now();
    task.error = {
      code: 'CANCELLED',
      message: reason || 'Task cancelled by supervisor',
      recoverable: false,
    };

    // Clear timeout
    this.clearTaskTimeout(taskId);

    this.emit('taskCancelled', { task, reason });

    return task;
  }

  // ===========================================================================
  // ESCALATION
  // ===========================================================================

  /**
   * Escalate a task to the next agent in the escalation path
   */
  escalateTask(taskId: string, reason: EscalationReason): EscalationEvent | null {
    const task = this.getTask(taskId);

    // Find next escalation target
    const nextTarget = this.hierarchyManager.getNextEscalationTarget(
      task.hierarchyId,
      task.assigneeId
    );

    if (!nextTarget) {
      // No more escalation targets
      this.emit('escalationFailed', { task, reason: 'No escalation targets available' });
      return null;
    }

    const escalation: EscalationEvent = {
      id: this.generateId(),
      taskId,
      fromAgentId: task.assigneeId,
      toAgentId: nextTarget,
      reason,
      context: {
        retryCount: task.retryCount,
        error: task.error,
      },
      timestamp: Date.now(),
    };

    // Update task
    task.status = 'escalated';
    task.assigneeId = nextTarget;

    // Record escalation
    this.escalations.push(escalation);
    this.hierarchyManager.recordEscalation(task.hierarchyId);

    this.emit('taskEscalated', { task, escalation });

    return escalation;
  }

  /**
   * Get escalation history for a task
   */
  getEscalationHistory(taskId: string): EscalationEvent[] {
    return this.escalations.filter((e) => e.taskId === taskId);
  }

  // ===========================================================================
  // TASK QUERIES
  // ===========================================================================

  /**
   * Get a task by ID
   */
  getTask(taskId: string): DelegatedTask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  /**
   * Get tasks for a hierarchy
   */
  getTasksByHierarchy(hierarchyId: string): DelegatedTask[] {
    const taskIds = this.tasksByHierarchy.get(hierarchyId);
    if (!taskIds) return [];
    return Array.from(taskIds)
      .map((id) => this.tasks.get(id))
      .filter((t): t is DelegatedTask => t !== undefined);
  }

  /**
   * Get tasks assigned to an agent
   */
  getTasksByAgent(agentId: string): DelegatedTask[] {
    const taskIds = this.tasksByAgent.get(agentId);
    if (!taskIds) return [];
    return Array.from(taskIds)
      .map((id) => this.tasks.get(id))
      .filter((t): t is DelegatedTask => t !== undefined);
  }

  /**
   * Get active tasks (pending, assigned, in_progress)
   */
  getActiveTasks(hierarchyId?: string): DelegatedTask[] {
    const activeStatuses: TaskStatus[] = ['pending', 'assigned', 'in_progress'];
    const tasks = hierarchyId
      ? this.getTasksByHierarchy(hierarchyId)
      : Array.from(this.tasks.values());

    return tasks.filter((t) => activeStatuses.includes(t.status));
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: TaskStatus, hierarchyId?: string): DelegatedTask[] {
    const tasks = hierarchyId
      ? this.getTasksByHierarchy(hierarchyId)
      : Array.from(this.tasks.values());

    return tasks.filter((t) => t.status === status);
  }

  // ===========================================================================
  // SUBTASKS
  // ===========================================================================

  /**
   * Create a subtask for task decomposition
   */
  async createSubtask(
    parentTaskId: string,
    options: Omit<DelegateTaskOptions, 'hierarchyId' | 'parentTaskId'>
  ): Promise<DelegatedTask> {
    const parent = this.getTask(parentTaskId);

    const subtask = await this.delegate({
      ...options,
      hierarchyId: parent.hierarchyId,
      parentTaskId,
    });

    parent.subtaskIds.push(subtask.id);

    this.emit('subtaskCreated', { parent, subtask });

    return subtask;
  }

  /**
   * Get subtasks of a task
   */
  getSubtasks(taskId: string): DelegatedTask[] {
    const task = this.getTask(taskId);
    return task.subtaskIds
      .map((id) => this.tasks.get(id))
      .filter((t): t is DelegatedTask => t !== undefined);
  }

  /**
   * Check if all subtasks are complete
   */
  areSubtasksComplete(taskId: string): boolean {
    const subtasks = this.getSubtasks(taskId);
    return subtasks.every((t) => t.status === 'completed');
  }

  // ===========================================================================
  // TIMEOUT HANDLING
  // ===========================================================================

  private scheduleTimeout(taskId: string, timeout: number): void {
    const handle = setTimeout(() => {
      this.handleTimeout(taskId);
    }, timeout);

    this.timeoutHandles.set(taskId, handle);
  }

  private clearTaskTimeout(taskId: string): void {
    const handle = this.timeoutHandles.get(taskId);
    if (handle) {
      clearTimeout(handle);
      this.timeoutHandles.delete(taskId);
    }
  }

  private handleTimeout(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    if (task.status === 'pending' || task.status === 'in_progress') {
      task.status = 'timeout';
      task.completedAt = Date.now();
      task.error = {
        code: 'TIMEOUT',
        message: 'Task exceeded timeout',
        recoverable: true,
        retryAfter: 5000,
      };

      this.emit('taskTimeout', { task });

      // Attempt escalation
      if (this.config.autoEscalate) {
        this.escalateTask(taskId, 'timeout');
      }
    }
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  /**
   * Clean up completed/failed tasks older than specified age
   */
  cleanup(maxAge: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [taskId, task] of this.tasks) {
      if (
        ['completed', 'failed', 'cancelled', 'timeout'].includes(task.status) &&
        task.completedAt &&
        now - task.completedAt > maxAge
      ) {
        this.tasks.delete(taskId);
        this.unindexTask(task);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clear all timeouts (for cleanup)
   */
  destroy(): void {
    for (const handle of this.timeoutHandles.values()) {
      clearTimeout(handle);
    }
    this.timeoutHandles.clear();
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private indexTask(task: DelegatedTask): void {
    // Index by hierarchy
    let hierarchyTasks = this.tasksByHierarchy.get(task.hierarchyId);
    if (!hierarchyTasks) {
      hierarchyTasks = new Set();
      this.tasksByHierarchy.set(task.hierarchyId, hierarchyTasks);
    }
    hierarchyTasks.add(task.id);

    // Index by agent
    let agentTasks = this.tasksByAgent.get(task.assigneeId);
    if (!agentTasks) {
      agentTasks = new Set();
      this.tasksByAgent.set(task.assigneeId, agentTasks);
    }
    agentTasks.add(task.id);
  }

  private unindexTask(task: DelegatedTask): void {
    this.tasksByHierarchy.get(task.hierarchyId)?.delete(task.id);
    this.tasksByAgent.get(task.assigneeId)?.delete(task.id);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let defaultEngine: DelegationEngine | null = null;

/**
 * Get the default delegation engine
 */
export function getDelegationEngine(): DelegationEngine {
  if (!defaultEngine) {
    defaultEngine = new DelegationEngine();
  }
  return defaultEngine;
}

/**
 * Reset the default delegation engine (for testing)
 */
export function resetDelegationEngine(): void {
  if (defaultEngine) {
    defaultEngine.destroy();
  }
  defaultEngine = null;
}

// =============================================================================
// OPTIONS
// =============================================================================

/**
 * Options for creating a delegation engine
 */
export interface DelegationEngineOptions {
  /** Configuration overrides */
  config?: Partial<HierarchyConfig>;

  /** Hierarchy manager to use */
  hierarchyManager?: HierarchyManager;
}

/**
 * Options for delegating a task
 */
export interface DelegateTaskOptions {
  /** Hierarchy ID */
  hierarchyId: string;

  /** Type of task */
  taskType: string;

  /** Task payload */
  payload: Record<string, unknown>;

  /** Specific agent to assign to (optional) */
  assigneeId?: string;

  /** Priority (higher = more important) */
  priority?: number;

  /** Custom timeout (ms) */
  timeout?: number;

  /** Parent task ID (for subtasks) */
  parentTaskId?: string;
}
