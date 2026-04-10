/**
 * Hierarchy Types
 * Sprint 4 Priority 7 - Hierarchical Agent Orchestration
 *
 * Type definitions for agent hierarchies, delegation rules, and supervision.
 */

import type { AgentManifest } from '../agents/AgentManifest';

// =============================================================================
// HIERARCHY STRUCTURES
// =============================================================================

/**
 * Represents a hierarchical relationship between agents
 */
export interface AgentHierarchy {
  /** Unique identifier for this hierarchy */
  id: string;

  /** Name of this hierarchy (e.g., 'content_team', 'render_farm') */
  name: string;

  /** The supervising agent */
  supervisor: AgentManifest;

  /** Agents under this supervisor */
  subordinates: AgentManifest[];

  /** Rules for delegating tasks */
  delegationRules: DelegationRule[];

  /** Path for escalating failures */
  escalationPath: string[];

  /** Hierarchy metadata */
  metadata: HierarchyMetadata;

  /** Creation timestamp */
  createdAt: number;

  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Metadata about a hierarchy
 */
export interface HierarchyMetadata {
  /** Maximum depth of subordinate chains */
  maxDepth: number;

  /** Whether subordinates can have their own subordinates */
  allowNesting: boolean;

  /** Default timeout for delegated tasks */
  defaultTimeout: number;

  /** Whether to auto-escalate on timeout */
  autoEscalate: boolean;

  /** Tags for categorization */
  tags: string[];
}

/**
 * Rule for delegating a specific task type
 */
export interface DelegationRule {
  /** Unique identifier */
  id: string;

  /** Task type this rule applies to */
  taskType: string;

  /** Required capability for delegation */
  targetCapability: string;

  /** Specific agent ID to delegate to (optional) */
  targetAgentId?: string;

  /** Maximum retry attempts */
  maxRetries: number;

  /** Whether to escalate on failure */
  escalateOnFailure: boolean;

  /** Timeout for this task type (ms) */
  timeout: number;

  /** Priority level (higher = more important) */
  priority: number;

  /** Whether supervisor approval is required */
  requiresApproval: boolean;

  /** Conditions for this rule to apply */
  conditions?: DelegationCondition[];
}

/**
 * Condition for delegation rule matching
 */
export interface DelegationCondition {
  /** Field to check */
  field: string;

  /** Comparison operator */
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'matches';

  /** Value to compare against */
  value: unknown;
}

// =============================================================================
// DELEGATION TASK
// =============================================================================

/**
 * A task delegated to a subordinate
 */
export interface DelegatedTask {
  /** Unique task identifier */
  id: string;

  /** Hierarchy this task belongs to */
  hierarchyId: string;

  /** Agent that created/delegated the task */
  delegatorId: string;

  /** Agent assigned to execute the task */
  assigneeId: string;

  /** Type of task */
  taskType: string;

  /** Task payload/parameters */
  payload: Record<string, unknown>;

  /** Expected output schema */
  expectedOutput?: Record<string, unknown>;

  /** Current status */
  status: TaskStatus;

  /** Priority level */
  priority: number;

  /** Creation timestamp */
  createdAt: number;

  /** Start timestamp (when picked up) */
  startedAt?: number;

  /** Completion timestamp */
  completedAt?: number;

  /** Timeout timestamp */
  timeoutAt: number;

  /** Number of retry attempts made */
  retryCount: number;

  /** Maximum retries allowed */
  maxRetries: number;

  /** Result data (if completed) */
  result?: TaskResult;

  /** Error information (if failed) */
  error?: TaskError;

  /** Parent task ID (for nested delegations) */
  parentTaskId?: string;

  /** Subtask IDs (for decomposed tasks) */
  subtaskIds: string[];
}

/**
 * Status of a delegated task
 */
export type TaskStatus =
  | 'pending' // Waiting to be picked up
  | 'assigned' // Assigned to an agent
  | 'in_progress' // Currently being executed
  | 'completed' // Successfully completed
  | 'failed' // Failed after all retries
  | 'escalated' // Escalated to supervisor
  | 'cancelled' // Cancelled by supervisor
  | 'timeout'; // Timed out

/**
 * Result of a completed task
 */
export interface TaskResult {
  /** Output data */
  data: unknown;

  /** Execution duration (ms) */
  duration: number;

  /** Quality metrics (optional) */
  metrics?: Record<string, number>;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Error information for a failed task
 */
export interface TaskError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Stack trace (if available) */
  stack?: string;

  /** Whether this error is recoverable */
  recoverable: boolean;

  /** Suggested retry delay (ms) */
  retryAfter?: number;
}

// =============================================================================
// ESCALATION
// =============================================================================

/**
 * Escalation event
 */
export interface EscalationEvent {
  /** Unique identifier */
  id: string;

  /** Task being escalated */
  taskId: string;

  /** Agent escalating from */
  fromAgentId: string;

  /** Agent escalating to */
  toAgentId: string;

  /** Reason for escalation */
  reason: EscalationReason;

  /** Additional context */
  context?: Record<string, unknown>;

  /** Timestamp */
  timestamp: number;
}

/**
 * Reason for escalation
 */
export type EscalationReason =
  | 'timeout' // Task timed out
  | 'max_retries' // Exceeded retry limit
  | 'capability_mismatch' // Agent lacks capability
  | 'agent_offline' // Assigned agent went offline
  | 'explicit' // Explicitly requested escalation
  | 'deadlock' // Deadlock detected
  | 'resource_constraint'; // Insufficient resources

// =============================================================================
// HIERARCHY EVENTS
// =============================================================================

/**
 * Events emitted by the hierarchy system
 */
export type HierarchyEvent =
  | 'hierarchyCreated'
  | 'hierarchyUpdated'
  | 'hierarchyDeleted'
  | 'subordinateAdded'
  | 'subordinateRemoved'
  | 'taskDelegated'
  | 'taskStarted'
  | 'taskCompleted'
  | 'taskFailed'
  | 'taskEscalated'
  | 'taskCancelled'
  | 'ruleAdded'
  | 'ruleRemoved';

/**
 * Handler for hierarchy events
 */
export type HierarchyEventHandler = (event: HierarchyEvent, data: unknown) => void;

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for the hierarchy system
 */
export interface HierarchyConfig {
  /** Maximum hierarchy depth */
  maxDepth: number;

  /** Default task timeout (ms) */
  defaultTimeout: number;

  /** Default retry count */
  defaultRetries: number;

  /** Health check interval (ms) */
  healthCheckInterval: number;

  /** Enable automatic escalation */
  autoEscalate: boolean;

  /** Enable task decomposition */
  allowDecomposition: boolean;

  /** Metrics collection enabled */
  metricsEnabled: boolean;
}

/**
 * Default hierarchy configuration
 */
export const DEFAULT_HIERARCHY_CONFIG: HierarchyConfig = {
  maxDepth: 5,
  defaultTimeout: 60000,
  defaultRetries: 3,
  healthCheckInterval: 10000,
  autoEscalate: true,
  allowDecomposition: true,
  metricsEnabled: true,
};

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Statistics for a hierarchy
 */
export interface HierarchyStats {
  /** Hierarchy ID */
  hierarchyId: string;

  /** Total tasks delegated */
  totalTasks: number;

  /** Completed tasks */
  completedTasks: number;

  /** Failed tasks */
  failedTasks: number;

  /** Escalated tasks */
  escalatedTasks: number;

  /** Average completion time (ms) */
  avgCompletionTime: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Active subordinates */
  activeSubordinates: number;

  /** Tasks per subordinate */
  tasksPerSubordinate: Record<string, number>;

  /** Last updated */
  updatedAt: number;
}
