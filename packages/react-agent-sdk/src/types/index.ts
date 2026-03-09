/**
 * @hololand/react-agent-sdk - Type Definitions
 *
 * TypeScript types for the React Agent SDK
 */

// ── Local stubs for @holoscript/core/agents (not yet a published subpath) ──

export interface AgentConfig {
  name: string;
  endpoint?: string;
  timeout?: number;
  [key: string]: unknown;
}

export type AgentPhase =
  | 'intake'
  | 'reflect'
  | 'execute'
  | 'compress'
  | 'reintake'
  | 'grow'
  | 'evolve'
  | 'autonomize';

export interface CycleResult {
  success: boolean;
  phase: AgentPhase;
  data?: unknown;
  error?: Error;
}

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
// AGENT CONFIGURATION
// ============================================================================

/**
 * Agent initialization config for React hooks
 */
export interface UseAgentConfig extends Partial<AgentConfig> {
  /** Enable automatic reconnection */
  autoReconnect?: boolean;
  /** Reconnection retry delay (ms) */
  reconnectDelay?: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Enable circuit breaker */
  enableCircuitBreaker?: boolean;
  /** Circuit breaker threshold (failure rate) */
  circuitBreakerThreshold?: number;
  /** Circuit breaker timeout (ms) */
  circuitBreakerTimeout?: number;
}

// ============================================================================
// TASK EXECUTION
// ============================================================================

/**
 * Task execution parameters
 */
export interface TaskParams {
  /** Task input data */
  input?: Record<string, unknown>;
  /** Task priority */
  priority?: 'low' | 'medium' | 'high' | 'critical';
  /** Task timeout (ms) */
  timeout?: number;
  /** Enable automatic retry on failure */
  retry?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Retry delay (ms) */
  retryDelay?: number;
  /** Task metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Task execution result
 */
export interface TaskResult<T = unknown> {
  /** Task ID */
  taskId: string;
  /** Task status */
  status: TaskStatus;
  /** Result data */
  data?: T;
  /** Error if task failed */
  error?: Error;
  /** Task start time */
  startedAt: number;
  /** Task end time */
  completedAt?: number;
  /** Task duration (ms) */
  duration?: number;
  /** Retry count */
  retryCount: number;
}

/**
 * Task status
 */
export type TaskStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled'
  | 'timeout';

/**
 * Task progress information
 */
export interface TaskProgress {
  /** Current progress (0-100) */
  progress: number;
  /** Current phase */
  phase?: AgentPhase;
  /** Estimated time remaining (ms) */
  estimatedTime?: number;
  /** Task logs */
  logs: TaskLog[];
  /** Detailed status */
  status: TaskStatus;
}

/**
 * Task log entry
 */
export interface TaskLog {
  /** Timestamp */
  timestamp: number;
  /** Log level */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** Log message */
  message: string;
  /** Log data */
  data?: unknown;
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker status
 */
export interface CircuitBreakerStatus {
  /** Current state */
  state: CircuitState;
  /** Failure count */
  failureCount: number;
  /** Success count */
  successCount: number;
  /** Failure rate (0-1) */
  failureRate: number;
  /** Last error */
  lastError?: Error;
  /** Time until circuit closes (ms) */
  timeUntilClose?: number;
  /** Next retry time */
  nextRetryTime?: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Failure threshold (0-1) */
  threshold: number;
  /** Timeout before attempting half-open (ms) */
  timeout: number;
  /** Window size for failure rate calculation */
  windowSize: number;
  /** Minimum requests before opening circuit */
  minimumRequests: number;
}

// ============================================================================
// DEGRADED MODE
// ============================================================================

/**
 * Degraded mode status
 */
export interface DegradedModeStatus {
  /** Is system in degraded mode */
  isDegraded: boolean;
  /** Affected services */
  affectedServices: string[];
  /** Recovery status */
  recoveryStatus: {
    /** Is recovery in progress */
    inProgress: boolean;
    /** Recovery progress (0-100) */
    progress: number;
    /** Estimated recovery time (ms) */
    estimatedTime?: number;
  };
  /** Degraded since */
  degradedSince?: number;
}

// ============================================================================
// AGENT METRICS
// ============================================================================

/**
 * Agent metrics
 */
export interface AgentMetrics {
  /** Agent name */
  agentName: string;
  /** Circuit breaker state */
  circuitState: CircuitState;
  /** Request success rate (0-1) */
  successRate: number;
  /** Average latency (ms) */
  averageLatency: number;
  /** Request count (last window) */
  requestCount: number;
  /** Error count (last window) */
  errorCount: number;
  /** Last error */
  lastError?: Error;
  /** Last updated */
  lastUpdated: number;
  /** Active tasks */
  activeTasks: number;
  /** Queued tasks */
  queuedTasks: number;
}

// ============================================================================
// HOOK RETURN TYPES
// ============================================================================

/**
 * useAgent hook return type
 */
export interface UseAgentReturn {
  /** Agent instance */
  agent: {
    /** Send message to agent */
    sendMessage: (action: string, payload: unknown) => Promise<AgentResponse>;
    /** Execute task */
    executeTask: <T = unknown>(taskName: string, params?: TaskParams) => Promise<TaskResult<T>>;
    /** Get agent state */
    getState: () => unknown;
    /** Subscribe to agent events */
    on: (event: string, handler: (...args: unknown[]) => void) => () => void;
  };
  /** Agent connection status */
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  /** Connection error */
  error?: Error;
  /** Reconnect function */
  reconnect: () => void;
}

/**
 * useTask hook return type
 */
export interface UseTaskReturn<T = unknown> {
  /** Task result data */
  data?: T;
  /** Task is loading */
  loading: boolean;
  /** Task error */
  error?: Error;
  /** Task status */
  status: TaskStatus;
  /** Retry task */
  retry: () => void;
  /** Cancel task */
  cancel: () => void;
  /** Task progress */
  progress?: number;
}

/**
 * useTaskStatus hook return type
 */
export interface UseTaskStatusReturn {
  /** Task status */
  status: TaskStatus;
  /** Task progress (0-100) */
  progress: number;
  /** Estimated time remaining (ms) */
  estimatedTime?: number;
  /** Task logs */
  logs: TaskLog[];
  /** Current phase */
  phase?: AgentPhase;
}

/**
 * useAgentMetrics hook return type
 */
export interface UseAgentMetricsReturn {
  /** Agent metrics */
  metrics: AgentMetrics | null;
  /** Metrics are loading */
  loading: boolean;
  /** Metrics error */
  error?: Error;
  /** Refresh metrics */
  refresh: () => void;
}

/**
 * useCircuitBreaker hook return type
 */
export interface UseCircuitBreakerReturn {
  /** Circuit breaker state */
  state: CircuitState;
  /** Failure rate (0-1) */
  failureRate: number;
  /** Last error */
  lastError?: Error;
  /** Reset circuit breaker */
  reset: () => void;
  /** Full status */
  status: CircuitBreakerStatus;
}

/**
 * useDegradedMode hook return type
 */
export interface UseDegradedModeReturn {
  /** Is system in degraded mode */
  isDegraded: boolean;
  /** Affected services */
  affectedServices: string[];
  /** Recovery status */
  recoveryStatus: DegradedModeStatus['recoveryStatus'];
  /** Full status */
  status: DegradedModeStatus;
}

// ============================================================================
// AGENT CONTEXT
// ============================================================================

/**
 * Agent context value
 */
export interface AgentContextValue {
  /** Base API URL */
  apiUrl?: string;
  /** Default timeout */
  defaultTimeout?: number;
  /** Global circuit breaker config */
  circuitBreaker?: CircuitBreakerConfig;
  /** Enable degraded mode */
  enableDegradedMode?: boolean;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Authentication token */
  token?: string;
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

/**
 * AgentProvider props
 */
export interface AgentProviderProps {
  children: React.ReactNode;
  config?: AgentContextValue;
}

/**
 * TaskMonitor props
 */
export interface TaskMonitorProps {
  /** Task ID to monitor */
  taskId: string;
  /** Show logs */
  showLogs?: boolean;
  /** Show progress bar */
  showProgress?: boolean;
  /** Show phase information */
  showPhase?: boolean;
  /** Custom className */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
}

/**
 * CircuitBreakerStatus props
 */
export interface CircuitBreakerStatusProps {
  /** Query name or agent name */
  queryName: string;
  /** Show detailed metrics */
  showMetrics?: boolean;
  /** Custom className */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
}

/**
 * AgentMetricsDashboard props
 */
export interface AgentMetricsDashboardProps {
  /** Agent name */
  agentName: string;
  /** Auto-refresh interval (ms) */
  refreshInterval?: number;
  /** Show detailed metrics */
  showDetailed?: boolean;
  /** Custom className */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
}
