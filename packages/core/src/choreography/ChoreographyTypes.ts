/**
 * @holoscript/core - Choreography Type Definitions
 *
 * Types for multi-agent choreography and orchestration.
 * Part of HoloScript v3.1 Agentic Choreography.
 */

import type { AgentManifest } from '../agents/AgentManifest';

// ============================================================================
// STEP EXECUTION
// ============================================================================

/**
 * Status of a choreography step
 */
export type StepStatus =
  | 'pending'
  | 'waiting' // Waiting for dependencies
  | 'ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

/**
 * Status of a choreography plan
 */
export type ChoreographyStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Step retry strategy
 */
export type RetryStrategy = 'none' | 'immediate' | 'exponential' | 'fixed';

/**
 * Execution constraint types
 */
export type ConstraintType =
  | 'timeout' // Maximum execution time
  | 'order' // Execution order
  | 'concurrency' // Max concurrent steps
  | 'resource' // Resource limits
  | 'spatial' // Spatial constraints
  | 'trust' // Trust level requirements
  | 'custom';

// ============================================================================
// CHOREOGRAPHY STEP
// ============================================================================

/**
 * Retry configuration for a step
 */
export interface RetryConfig {
  /** Retry strategy */
  strategy: RetryStrategy;
  /** Maximum number of retries */
  maxRetries: number;
  /** Delay between retries (ms) */
  delay: number;
  /** Backoff multiplier for exponential strategy */
  backoffMultiplier?: number;
  /** Maximum delay cap */
  maxDelay?: number;
  /** Retry condition (if false, don't retry) */
  condition?: (error: Error, attempt: number) => boolean;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  strategy: 'exponential',
  maxRetries: 3,
  delay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000,
};

/**
 * Step input/output definition
 */
export interface StepIO {
  /** Key name */
  key: string;
  /** Value type */
  type?: string;
  /** Actual value */
  value?: unknown;
  /** Whether required */
  required?: boolean;
  /** Default value */
  default?: unknown;
  /** Source reference (e.g., 'step#generate.outputs.scene') */
  source?: string;
}

/**
 * Single step in a choreography
 */
export interface ChoreographyStep {
  /** Unique step ID */
  id: string;
  /** Human-readable name */
  name?: string;
  /** Description of what this step does */
  description?: string;
  /** Agent ID to execute this step */
  agentId: string;
  /** Action to invoke on the agent */
  action: string;
  /** Input parameters */
  inputs: Record<string, unknown>;
  /** Output definitions */
  outputs: Record<string, StepIO>;
  /** Step IDs this step depends on */
  dependencies: string[];
  /** Current status */
  status: StepStatus;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Retry configuration */
  retry?: Partial<RetryConfig>;
  /** Condition for execution (if false, skip) */
  condition?: string | ((context: StepContext) => boolean);
  /** Whether this is a HITL gate step */
  hitlGate?: boolean;
  /** Started timestamp */
  startedAt?: number;
  /** Completed timestamp */
  completedAt?: number;
  /** Execution duration (ms) */
  duration?: number;
  /** Error if failed */
  error?: string;
  /** Current retry attempt */
  retryAttempt?: number;
  /** ID of step to execute if this step fails */
  fallbackStepId?: string;
  /** Parallel execution group */
  parallelGroup?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Context available during step execution
 */
export interface StepContext {
  /** The choreography plan */
  plan: ChoreographyPlan;
  /** Current step */
  currentStep: ChoreographyStep;
  /** Available agents */
  agents: Map<string, AgentManifest>;
  /** Outputs from completed steps */
  stepOutputs: Map<string, Record<string, unknown>>;
  /** Global variables */
  variables: Record<string, unknown>;
  /** Start time */
  startTime: number;
  /** Elapsed time (ms) */
  elapsedTime: number;
}

// ============================================================================
// EXECUTION CONSTRAINTS
// ============================================================================

/**
 * Execution constraint
 */
export interface ExecutionConstraint {
  /** Constraint type */
  type: ConstraintType;
  /** Constraint value */
  value: unknown;
  /** Human-readable description */
  description?: string;
  /** Whether this is a hard constraint (failure on violation) */
  hard?: boolean;
}

/**
 * Common constraint factories
 */
export const Constraints = {
  timeout(ms: number, hard = true): ExecutionConstraint {
    return { type: 'timeout', value: ms, hard, description: `Max ${ms}ms execution time` };
  },
  concurrency(max: number): ExecutionConstraint {
    return { type: 'concurrency', value: max, description: `Max ${max} concurrent steps` };
  },
  trust(minLevel: string): ExecutionConstraint {
    return { type: 'trust', value: minLevel, hard: true, description: `Min trust: ${minLevel}` };
  },
};

// ============================================================================
// CHOREOGRAPHY PLAN
// ============================================================================

/**
 * Complete choreography plan
 */
export interface ChoreographyPlan {
  /** Unique plan ID */
  id: string;
  /** Human-readable name */
  name?: string;
  /** Goal description */
  goal: string;
  /** Choreography steps */
  steps: ChoreographyStep[];
  /** Participating agents */
  participants: AgentManifest[];
  /** Execution constraints */
  constraints: ExecutionConstraint[];
  /** Fallback plan on failure */
  fallback?: ChoreographyPlan;
  /** Current status */
  status: ChoreographyStatus;
  /** Creation timestamp */
  createdAt: number;
  /** Started timestamp */
  startedAt?: number;
  /** Completed timestamp */
  completedAt?: number;
  /** Total duration (ms) */
  duration?: number;
  /** Initiating agent or user */
  initiator?: string;
  /** Priority (higher = more important) */
  priority?: number;
  /** Tags for categorization */
  tags?: string[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// CHOREOGRAPHY RESULT
// ============================================================================

/**
 * Result of step execution
 */
export interface StepResult {
  /** Step ID */
  stepId: string;
  /** Success status */
  success: boolean;
  /** Outputs produced */
  outputs: Record<string, unknown>;
  /** Duration (ms) */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Number of retries attempted */
  retries?: number;
  /** Whether a fallback step was used */
  usedFallback?: boolean;
  /** Metrics */
  metrics?: {
    tokenUsage?: number;
    computeTime?: number;
    networkLatency?: number;
  };
}

/**
 * Result of complete choreography execution
 */
export interface ChoreographyResult {
  /** Plan ID */
  planId: string;
  /** Overall success */
  success: boolean;
  /** Final status */
  status: ChoreographyStatus;
  /** Individual step results */
  stepResults: StepResult[];
  /** Total duration (ms) */
  duration: number;
  /** Steps completed count */
  stepsCompleted: number;
  /** Steps failed count */
  stepsFailed: number;
  /** Steps skipped count */
  stepsSkipped: number;
  /** Array of completed steps */
  completedSteps?: ChoreographyStep[];
  /** Array of failed steps */
  failedSteps?: ChoreographyStep[];
  /** Error message if failed */
  error?: string;
  /** Final outputs (from terminal steps) */
  finalOutputs: Record<string, unknown>;
  /** Whether fallback was used */
  usedFallback?: boolean;
  /** Aggregate metrics */
  metrics?: {
    totalTokens?: number;
    totalComputeTime?: number;
    peakConcurrency?: number;
  };
}

// ============================================================================
// ENGINE EVENTS
// ============================================================================

/**
 * Events emitted by ChoreographyEngine
 */
export interface ChoreographyEvents {
  'plan:created': (plan: ChoreographyPlan) => void;
  'plan:started': (plan: ChoreographyPlan) => void;
  'plan:completed': (result: ChoreographyResult) => void;
  'plan:failed': (plan: ChoreographyPlan, error: Error) => void;
  'plan:paused': (plan: ChoreographyPlan) => void;
  'plan:resumed': (plan: ChoreographyPlan) => void;
  'plan:cancelled': (plan: ChoreographyPlan) => void;
  'step:started': (step: ChoreographyStep, plan: ChoreographyPlan) => void;
  'step:completed': (result: StepResult, plan: ChoreographyPlan) => void;
  'step:failed': (step: ChoreographyStep, error: Error, plan: ChoreographyPlan) => void;
  'step:retrying': (step: ChoreographyStep, attempt: number, plan: ChoreographyPlan) => void;
  'step:skipped': (step: ChoreographyStep, reason: string, plan: ChoreographyPlan) => void;
  'hitl:required': (step: ChoreographyStep, plan: ChoreographyPlan) => void;
  'hitl:approved': (step: ChoreographyStep, plan: ChoreographyPlan) => void;
  'hitl:rejected': (step: ChoreographyStep, reason: string, plan: ChoreographyPlan) => void;
}
