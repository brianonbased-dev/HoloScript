/**
 * ActiveTaskState - OR-Set + LWW-Register CRDT hybrid
 *
 * Tracks current active tasks and their execution state.
 * Uses OR-Set for task collection + LWW-Register for task status.
 *
 * Target: <2KB compressed
 * @version 1.0.0
 */

/**
 * Task execution status
 */
export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';

/**
 * Task priority level
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Single task entry
 */
export interface TaskEntry {
  /** Unique task ID (UUID v4) */
  id: string;

  /** Task title/description (max 150 chars) */
  title: string;

  /** Current task status */
  status: TaskStatus;

  /** Task priority */
  priority: TaskPriority;

  /** Creation timestamp */
  createdAt: number;

  /** Last status update timestamp */
  updatedAt: number;

  /** Optional: Agent DID assigned to this task */
  assignedTo?: string;

  /** Optional: Parent task ID for subtasks */
  parentTaskId?: string;

  /** Optional: Estimated completion time (milliseconds) */
  estimatedDuration?: number;

  /** Optional: Actual time spent (milliseconds) */
  actualDuration?: number;

  /** Optional: Blocking reason if status is 'blocked' */
  blockingReason?: string;
}

/**
 * Task status update with LWW metadata
 */
export interface TaskStatusUpdate {
  /** Task ID */
  taskId: string;

  /** New status */
  status: TaskStatus;

  /** Update timestamp */
  timestamp: number;

  /** Agent DID that made the update */
  actorDid: string;

  /** Operation ID for deduplication */
  operationId: string;
}

/**
 * ActiveTaskState CRDT (OR-Set + LWW-Register hybrid)
 *
 * Uses OR-Set for task collection:
 * - Tasks can be added/removed
 * - Concurrent adds preserved
 * - Remove-wins for observed adds
 *
 * Uses LWW-Register for each task's status:
 * - Concurrent status updates resolved by timestamp
 * - Last write wins conflict resolution
 */
export interface ActiveTaskState {
  /** CRDT type identifier */
  crdtType: 'or-set+lww';

  /** Unique CRDT instance ID */
  crdtId: string;

  /** Active task entries (OR-Set) */
  tasks: TaskEntry[];

  /** OR-Set add/remove tags for each task */
  taskTags: Record<string, {
    addTags: string[];
    removeTags: string[];
  }>;

  /** LWW status registers for each task */
  statusRegisters: Record<string, TaskStatusUpdate>;

  /** Vector clock for causality tracking */
  vectorClock: Record<string, number>;

  /** Last update timestamp */
  lastUpdated: number;
}

/**
 * ActiveTaskState metadata
 */
export interface ActiveTaskStateMetadata {
  /** Total number of active tasks */
  totalTasks: number;

  /** Tasks by status */
  statusDistribution: Record<TaskStatus, number>;

  /** Tasks by priority */
  priorityDistribution: Record<TaskPriority, number>;

  /** Assigned agent DIDs */
  assignedAgents: string[];

  /** Average task duration (if available) */
  averageDuration?: number;
}
