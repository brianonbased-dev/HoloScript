/**
 * @holoscript/core/agents
 *
 * Canonical agent protocol types for HoloScript Core.
 * Consumed by @hololand/react-agent-sdk and other downstream packages.
 *
 * RULE: Do not define local stubs in downstream packages.
 * Import from '@holoscript/core/agents' directly.
 */

// ============================================================================
// PHASES
// ============================================================================

export type AgentPhase =
  | 'intake'
  | 'reflect'
  | 'execute'
  | 'compress'
  | 'reintake'
  | 'grow'
  | 'evolve'
  | 'autonomize';

export const PHASE_ORDER: readonly AgentPhase[] = [
  'intake',
  'reflect',
  'execute',
  'compress',
  'reintake',
  'grow',
  'evolve',
  'autonomize',
];

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface AgentConfig {
  name: string;
  endpoint?: string;
  timeout?: number;
  [key: string]: unknown;
}

// ============================================================================
// MESSAGING
// ============================================================================

export interface AgentMessage {
  action: string;
  payload: unknown;
  timestamp: number;
}

export interface AgentResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============================================================================
// CYCLES
// ============================================================================

export interface CycleResult {
  success: boolean;
  phase: AgentPhase;
  data?: unknown;
  error?: Error;
}

// ============================================================================
// TASKS
// ============================================================================

export type TaskStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled'
  | 'timeout';

export interface TaskParams {
  input?: Record<string, unknown>;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  timeout?: number;
  retry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskResult<T = unknown> {
  taskId: string;
  status: TaskStatus;
  data?: T;
  error?: Error;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  retryCount: number;
}

export interface TaskLog {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: unknown;
}

export interface TaskProgress {
  progress: number;
  phase?: AgentPhase;
  estimatedTime?: number;
  logs: TaskLog[];
  status: TaskStatus;
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  threshold: number;
  timeout: number;
  windowSize: number;
  minimumRequests: number;
}

export interface CircuitBreakerStatus {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  failureRate: number;
  lastError?: Error;
  timeUntilClose?: number;
  nextRetryTime?: number;
}

// ============================================================================
// DEGRADED MODE
// ============================================================================

export interface DegradedModeStatus {
  isDegraded: boolean;
  affectedServices: string[];
  recoveryStatus: {
    inProgress: boolean;
    progress: number;
    estimatedTime?: number;
  };
  degradedSince?: number;
}

// ============================================================================
// METRICS
// ============================================================================

export interface AgentMetrics {
  agentName: string;
  circuitState: CircuitState;
  successRate: number;
  averageLatency: number;
  requestCount: number;
  errorCount: number;
  lastError?: Error;
  lastUpdated: number;
  activeTasks: number;
  queuedTasks: number;
}
