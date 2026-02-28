# Quick Reference Card

## Installation

```bash
npm install @hololand/react-agent-sdk
```

## Setup (1 time)

```tsx
import { AgentProvider } from '@hololand/react-agent-sdk';

<AgentProvider config={{ apiUrl: 'https://api.hololand.ai' }}>
  <App />
</AgentProvider>
```

## Basic Usage (3 lines)

```tsx
import { useAgent, useTask } from '@hololand/react-agent-sdk';

const { agent } = useAgent('brittney');
const { data, loading, error } = useTask(agent, 'myTask');

return loading ? <Spinner /> : <Result data={data} />;
```

## Hooks Quick Reference

### useAgent
```tsx
const { agent, status, error, reconnect } = useAgent('brittney', {
  enableCircuitBreaker: true,
  autoReconnect: true,
});
```

### useTask
```tsx
const { data, loading, error, retry, cancel, progress } = useTask(
  agent,
  'taskName',
  {
    input: {},
    retry: true,
    maxRetries: 3
  }
);
```

### useTaskStatus
```tsx
const { status, progress, estimatedTime, logs, phase } = useTaskStatus(taskId);
```

### useAgentMetrics
```tsx
const { metrics, loading, refresh } = useAgentMetrics('brittney', 5000);
```

### useCircuitBreaker
```tsx
const { state, failureRate, reset } = useCircuitBreaker('myQuery');
```

### useDegradedMode
```tsx
const { isDegraded, affectedServices, recoveryStatus } = useDegradedMode();
```

## Components Quick Reference

### TaskMonitor
```tsx
<TaskMonitor taskId={id} showLogs showProgress showPhase />
```

### CircuitBreakerStatus
```tsx
<CircuitBreakerStatus queryName="agent" showMetrics />
```

### AgentMetricsDashboard
```tsx
<AgentMetricsDashboard agentName="brittney" refreshInterval={5000} />
```

### AgentErrorBoundary
```tsx
<AgentErrorBoundary fallback={(error, reset) => <ErrorUI />}>
  <Component />
</AgentErrorBoundary>
```

### SuspenseTask
```tsx
<SuspenseTask agent={agent} taskName="task" fallback={<Spinner />}>
  {(data) => <Result data={data} />}
</SuspenseTask>
```

## Common Patterns

### With Retry
```tsx
const { data, error, retry } = useTask(agent, 'task', {
  retry: true,
  maxRetries: 5,
  retryDelay: 2000,
});
```

### With TypeScript
```tsx
interface MyData { result: string; }

const { data } = useTask<MyData>(agent, 'task');
// data is MyData | undefined
```

### With Circuit Breaker
```tsx
const { agent } = useAgent('brittney', {
  enableCircuitBreaker: true,
  circuitBreakerThreshold: 0.5,
});
```

### Conditional Execution
```tsx
const { data } = useTask(
  condition ? agent : null,
  'task'
);
```

### SSR (Next.js)
```tsx
const { data } = useTask(
  typeof window !== 'undefined' ? agent : null,
  'task'
);
```

## Task Parameters

```tsx
{
  input: {},                    // Task input
  priority: 'high',             // Priority level
  timeout: 30000,               // Timeout (ms)
  retry: true,                  // Enable retry
  maxRetries: 3,                // Max attempts
  retryDelay: 1000,             // Base delay (ms)
  metadata: {},                 // Extra data
}
```

## Circuit Breaker Config

```tsx
{
  threshold: 0.5,               // Failure rate (0-1)
  timeout: 60000,               // Retry timeout (ms)
  windowSize: 100,              // Request window
  minimumRequests: 10,          // Min before opening
}
```

## Status Values

- `idle` - Not started
- `pending` - Queued
- `running` - Executing
- `success` - Completed
- `error` - Failed
- `cancelled` - Cancelled
- `timeout` - Timed out

## Circuit States

- `closed` - Normal operation
- `open` - Failing fast
- `half-open` - Testing recovery

## Import Paths

```tsx
// Hooks
import { useAgent, useTask, useTaskStatus } from '@hololand/react-agent-sdk';
import { useAgentMetrics, useCircuitBreaker, useDegradedMode } from '@hololand/react-agent-sdk';

// Components
import { AgentProvider, TaskMonitor } from '@hololand/react-agent-sdk';
import { CircuitBreakerStatus, AgentMetricsDashboard } from '@hololand/react-agent-sdk';
import { AgentErrorBoundary, SuspenseTask } from '@hololand/react-agent-sdk';

// Types
import type {
  TaskParams,
  TaskStatus,
  CircuitState,
  AgentMetrics
} from '@hololand/react-agent-sdk';

// Utilities (advanced)
import { CircuitBreaker, ExponentialBackoff } from '@hololand/react-agent-sdk';
```

## Troubleshooting

### Task not executing
- Check agent is connected: `status === 'connected'`
- Check circuit breaker state: `useCircuitBreaker('agent')`
- Check for errors: `error?.message`

### Circuit breaker stuck open
- Check failure rate: `status.failureRate`
- Wait for timeout or manually reset: `reset()`

### SSR errors
- Ensure agent only runs client-side: `typeof window !== 'undefined'`
- Check Next.js config for proper SSR handling

### TypeScript errors
- Add generic type: `useTask<MyType>(agent, 'task')`
- Check type definitions are imported

## Performance Tips

1. **Memoize params:** Use `useMemo` for task params
2. **Conditional execution:** Pass `null` instead of agent to skip
3. **Debounce:** Use `useDebounce` for rapid task calls
4. **Cache:** Results are not cached by default

## Examples Location

See `/examples` directory for 11+ patterns:
- Basic usage
- Task monitoring
- Circuit breaker
- Multi-agent
- SSR
- And more...

## Links

- [Full Documentation](./README.md)
- [Migration Guide](./MIGRATION_GUIDE.md)
- [API Reference](./README.md#api-reference)
- [Examples](./examples)
- [GitHub Issues](https://github.com/brianonbased-dev/Holoscript/issues)
