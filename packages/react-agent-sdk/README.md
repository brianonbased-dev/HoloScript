# @hololand/react-agent-sdk

**React SDK for declarative agent usage** - Build agent-powered UIs with just 3 lines of code.

[![npm version](https://badge.fury.io/js/@hololand%2Freact-agent-sdk.svg)](https://www.npmjs.com/package/@hololand/react-agent-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Declarative API** - Use agents like any other React hook
- **Circuit Breaker** - Built-in resilience with automatic retry and exponential backoff
- **Real-time Monitoring** - Track agent metrics, circuit breaker state, and task progress
- **TypeScript First** - Full type safety with automatic type inference
- **React Suspense** - Seamless integration with React's async rendering
- **Error Boundaries** - Graceful error handling for agent failures
- **SSR Compatible** - Works with Next.js, Remix, and other SSR frameworks
- **Degraded Mode** - Automatic detection and handling of system degradation

## Installation

```bash
npm install @hololand/react-agent-sdk
# or
yarn add @hololand/react-agent-sdk
# or
pnpm add @hololand/react-agent-sdk
```

## Quick Start

### 1. Wrap your app with `AgentProvider`

```tsx
import { AgentProvider } from '@hololand/react-agent-sdk';

function App() {
  return (
    <AgentProvider
      config={{
        apiUrl: 'https://api.hololand.ai',
        token: process.env.REACT_APP_API_TOKEN,
      }}
    >
      <YourApp />
    </AgentProvider>
  );
}
```

### 2. Use agents in your components (3 lines!)

```tsx
import { useAgent, useTask } from '@hololand/react-agent-sdk';

function MyComponent() {
  const { agent } = useAgent('brittney');                    // 1. Import hook
  const { data, loading, error } = useTask(                   // 2. Call hook
    agent,
    'generateComponent',
    { input: { componentName: 'Button' } }
  );

  if (loading) return <Spinner />;                            // 3. Render result
  if (error) return <Error message={error.message} />;
  return <ComponentPreview data={data} />;
}
```

That's it! You're now using agents declaratively.

## Core Hooks

### `useAgent(agentName, config)`

Initialize an agent instance with identity and RBAC.

```tsx
const { agent, status, error, reconnect } = useAgent('brittney', {
  enableCircuitBreaker: true,
  autoReconnect: true,
  maxReconnectAttempts: 5,
});
```

**Returns:**
- `agent` - Agent instance with methods (`sendMessage`, `executeTask`, `getState`, `on`)
- `status` - Connection status (`connecting`, `connected`, `disconnected`, `error`)
- `error` - Connection error (if any)
- `reconnect` - Function to manually reconnect

### `useTask(agent, taskName, params)`

Execute an agent task with automatic retry and cancellation.

```tsx
const { data, loading, error, status, retry, cancel, progress } = useTask(
  agent,
  'generateComponent',
  {
    input: { componentName: 'Button' },
    retry: true,
    maxRetries: 3,
    timeout: 30000,
  }
);
```

**Returns:**
- `data` - Task result
- `loading` - Loading state
- `error` - Task error (if any)
- `status` - Task status (`idle`, `pending`, `running`, `success`, `error`, `cancelled`)
- `retry` - Function to retry task
- `cancel` - Function to cancel task
- `progress` - Task progress (0-100)

### `useTaskStatus(taskId, pollInterval?)`

Monitor long-running task progress.

```tsx
const { status, progress, estimatedTime, logs, phase } = useTaskStatus(taskId);
```

**Returns:**
- `status` - Current task status
- `progress` - Progress percentage (0-100)
- `estimatedTime` - Estimated time remaining (ms)
- `logs` - Task logs array
- `phase` - Current agent phase (from uAA2++ protocol)

### `useAgentMetrics(agentName, refreshInterval?)`

Monitor agent metrics in real-time.

```tsx
const { metrics, loading, error, refresh } = useAgentMetrics('brittney', 5000);

// metrics contains:
// - circuitState: 'closed' | 'open' | 'half-open'
// - successRate: number (0-1)
// - averageLatency: number (ms)
// - requestCount: number
// - errorCount: number
// - activeTasks: number
// - queuedTasks: number
```

### `useCircuitBreaker(queryName, pollInterval?)`

Access circuit breaker state from Phase 2.

```tsx
const { state, failureRate, lastError, reset, status } = useCircuitBreaker('myQuery');
```

**Returns:**
- `state` - Circuit state (`closed`, `open`, `half-open`)
- `failureRate` - Failure rate (0-1)
- `lastError` - Last error encountered
- `reset` - Function to reset circuit breaker
- `status` - Full circuit breaker status object

### `useDegradedMode(pollInterval?)`

Monitor global degraded mode status.

```tsx
const { isDegraded, affectedServices, recoveryStatus } = useDegradedMode();
```

**Returns:**
- `isDegraded` - Is system in degraded mode
- `affectedServices` - List of affected services
- `recoveryStatus` - Recovery progress and ETA

## Components

### `<AgentProvider>`

Context provider for agent configuration.

```tsx
<AgentProvider config={{
  apiUrl: 'https://api.hololand.ai',
  token: 'your-auth-token',
  circuitBreaker: {
    threshold: 0.5,
    timeout: 60000,
  },
}}>
  <App />
</AgentProvider>
```

### `<TaskMonitor>`

Visual task progress indicator.

```tsx
<TaskMonitor
  taskId={taskId}
  showLogs
  showProgress
  showPhase
/>
```

### `<CircuitBreakerStatus>`

Circuit state visualization.

```tsx
<CircuitBreakerStatus
  queryName="myAgent"
  showMetrics
/>
```

### `<AgentMetricsDashboard>`

Real-time metrics display.

```tsx
<AgentMetricsDashboard
  agentName="brittney"
  refreshInterval={5000}
  showDetailed
/>
```

### `<AgentErrorBoundary>`

Error boundary for agent failures.

```tsx
<AgentErrorBoundary
  fallback={(error, reset) => (
    <div>
      <h2>Agent Error</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )}
  onError={(error) => console.error('Agent error:', error)}
>
  <MyAgentComponent />
</AgentErrorBoundary>
```

### `<SuspenseTask>`

React Suspense integration for async tasks.

```tsx
<SuspenseTask
  agent={agent}
  taskName="generateComponent"
  params={{ input: { name: 'Button' } }}
  fallback={<Spinner />}
>
  {(data) => <ComponentPreview data={data} />}
</SuspenseTask>
```

## Examples

See the [examples](./examples) directory for 11+ comprehensive usage patterns:

1. **Basic Usage** - Simplest 3-line implementation
2. **With Provider** - Global configuration
3. **Task Monitoring** - Long-running task progress
4. **Circuit Breaker** - Resilient error handling
5. **Metrics Dashboard** - Real-time monitoring
6. **Error Boundary** - Custom error UI
7. **Suspense Integration** - Async rendering
8. **Degraded Mode** - System degradation handling
9. **Multi-Agent** - Coordinating multiple agents
10. **Custom Retry** - Fine-tuned retry logic
11. **Next.js SSR** - Server-side rendering

## Circuit Breaker

The SDK includes a built-in circuit breaker that prevents cascading failures:

- **Threshold** - Failure rate (0-1) before opening circuit (default: 0.5)
- **Timeout** - Time to wait before attempting half-open (default: 60s)
- **Window Size** - Number of requests to track (default: 100)
- **Minimum Requests** - Min requests before opening circuit (default: 10)

States:
- **Closed** - Normal operation
- **Open** - Circuit is open, requests fail fast
- **Half-Open** - Testing if service recovered

## Exponential Backoff

Automatic retry with exponential backoff:

```tsx
const { data, error, retry } = useTask(agent, 'unstableOperation', {
  retry: true,
  maxRetries: 5,
  retryDelay: 2000, // Base delay: 2s → 4s → 8s → 16s → 32s
});
```

## TypeScript Support

Full TypeScript support with automatic type inference:

```tsx
interface ComponentData {
  code: string;
  metadata: { author: string };
}

const { data } = useTask<ComponentData>(
  agent,
  'generateComponent',
  { input: { name: 'Button' } }
);

// data is typed as ComponentData | undefined
console.log(data?.metadata.author);
```

## SSR Compatibility

Works seamlessly with Next.js, Remix, and other SSR frameworks:

```tsx
// Next.js example
function DataComponent() {
  const { agent } = useAgent('brittney');

  // Only execute on client-side
  const { data } = useTask(
    typeof window !== 'undefined' ? agent : null,
    'fetchData'
  );

  return <div>{data}</div>;
}
```

## API Reference

### Configuration

```typescript
interface AgentContextValue {
  apiUrl?: string;                    // Base API URL
  defaultTimeout?: number;             // Default timeout (ms)
  circuitBreaker?: CircuitBreakerConfig;
  enableDegradedMode?: boolean;        // Enable degraded mode monitoring
  headers?: Record<string, string>;    // Custom headers
  token?: string;                      // Auth token
}
```

### Task Parameters

```typescript
interface TaskParams {
  input?: Record<string, unknown>;     // Task input data
  priority?: 'low' | 'medium' | 'high' | 'critical';
  timeout?: number;                    // Task timeout (ms)
  retry?: boolean;                     // Enable automatic retry
  maxRetries?: number;                 // Max retry attempts
  retryDelay?: number;                 // Base retry delay (ms)
  metadata?: Record<string, unknown>;  // Task metadata
}
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

MIT © [Brian X Base Team](https://github.com/brianonbased-dev)

## Support

- Documentation: [https://docs.hololand.ai/react-agent-sdk](https://docs.hololand.ai/react-agent-sdk)
- Issues: [GitHub Issues](https://github.com/brianonbased-dev/Holoscript/issues)
- Discord: [HoloScript Community](https://discord.gg/holoscript)

## Related Packages

- [@holoscript/core](../core) - Core HoloScript runtime and agent framework
- [@holoscript/mcp-server](../mcp-server) - Model Context Protocol server
- [@hololand/agent-cli](../agent-cli) - CLI for agent development
