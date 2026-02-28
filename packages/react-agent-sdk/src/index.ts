/**
 * @hololand/react-agent-sdk
 *
 * React SDK for declarative agent usage
 * Enables frontend developers to use agents with 3 lines of code
 */

// Hooks
export {
  useAgent,
  useTask,
  useTaskStatus,
  useAgentMetrics,
  useCircuitBreaker,
  useDegradedMode,
} from './hooks';

export type {
  UseAgentReturn,
  UseTaskReturn,
  UseTaskStatusReturn,
  UseAgentMetricsReturn,
  UseCircuitBreakerReturn,
  UseDegradedModeReturn,
} from './hooks';

// Components
export {
  AgentProvider,
  TaskMonitor,
  CircuitBreakerStatus,
  AgentMetricsDashboard,
  AgentErrorBoundary,
  SuspenseTask,
} from './components';

export type {
  AgentProviderProps,
  TaskMonitorProps,
  CircuitBreakerStatusProps,
  AgentMetricsDashboardProps,
} from './components';

// Types
export type {
  UseAgentConfig,
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
  AgentContextValue,
} from './types';

// Context
export { useAgentContext } from './context/AgentContext';

// Utilities
export { CircuitBreaker, ExponentialBackoff } from './utils';
