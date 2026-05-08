/**
 * @hololand/react-agent-sdk - Type Definitions
 *
 * TypeScript types for the React Agent SDK
 *
 * PROTOCOL SHAPES are re-exported from @holoscript/core/agents.
 * Do NOT define local stubs for these — add them to core first.
 * The drift-guard.ts file will fail typecheck if shapes diverge.
 */

// ── Canonical agent protocol shapes (source of truth: @holoscript/core/agents) ──
import type {
  AgentConfig,
  AgentPhase,
  AgentMessage,
  AgentResponse,
  CycleResult,
  TaskParams,
  TaskResult,
  TaskStatus,
  TaskProgress,
  TaskLog,
  CircuitState,
  CircuitBreakerStatus,
  CircuitBreakerConfig,
  DegradedModeStatus,
  AgentMetrics,
} from '@holoscript/core/agents';

export type {
  AgentConfig,
  AgentPhase,
  AgentMessage,
  AgentResponse,
  CycleResult,
  TaskParams,
  TaskResult,
  TaskStatus,
  TaskProgress,
  TaskLog,
  CircuitState,
  CircuitBreakerStatus,
  CircuitBreakerConfig,
  DegradedModeStatus,
  AgentMetrics,
} from '@holoscript/core/agents';

// ============================================================================
// AGENT CONFIGURATION (SDK-specific extensions)
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
