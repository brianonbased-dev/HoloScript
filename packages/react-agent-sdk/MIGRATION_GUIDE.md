# Migration Guide: From Imperative to Declarative Agent Usage

This guide helps you migrate from imperative agent usage to the declarative React SDK.

## Before: Imperative Approach

```tsx
import { AgentRegistry } from '@holoscript/core/agents';

function MyComponent() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const registry = getDefaultRegistry();
        const agent = await registry.findBest({
          capability: 'code-generation',
        });

        if (!agent) {
          throw new Error('Agent not found');
        }

        const response = await fetch(`/api/agents/${agent.id}/execute`, {
          method: 'POST',
          body: JSON.stringify({ task: 'generateComponent', input: {} }),
        });

        if (!response.ok) {
          throw new Error('Request failed');
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>Result: {JSON.stringify(data)}</div>;
}
```

**Problems:**

- Verbose (30+ lines)
- Manual state management
- No retry logic
- No circuit breaker
- No progress tracking
- Error handling is basic
- No SSR support

## After: Declarative Approach

```tsx
import { useAgent, useTask } from '@hololand/react-agent-sdk';

function MyComponent() {
  const { agent } = useAgent('brittney');
  const { data, loading, error } = useTask(agent, 'generateComponent', {
    input: {},
    retry: true,
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>Result: {JSON.stringify(data)}</div>;
}
```

**Benefits:**

- Concise (9 lines vs 30+)
- Automatic state management
- Built-in retry with exponential backoff
- Circuit breaker support
- Progress tracking available
- Better error handling
- SSR compatible

## Migration Steps

### Step 1: Install SDK

```bash
npm install @hololand/react-agent-sdk
```

### Step 2: Add Provider

Wrap your app with `AgentProvider`:

```tsx
// Before
function App() {
  return <YourApp />;
}

// After
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

### Step 3: Replace Manual Calls with Hooks

#### Example 1: Basic Task Execution

**Before:**

```tsx
useEffect(() => {
  const execute = async () => {
    const response = await fetch('/api/agents/execute', {
      method: 'POST',
      body: JSON.stringify({ agent: 'brittney', task: 'analyze' }),
    });
    const data = await response.json();
    setData(data);
  };
  execute();
}, []);
```

**After:**

```tsx
const { agent } = useAgent('brittney');
const { data } = useTask(agent, 'analyze');
```

#### Example 2: Manual Retry Logic

**Before:**

```tsx
const retry = async (fn, maxAttempts = 3) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxAttempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
};

useEffect(() => {
  retry(async () => {
    const response = await fetch('/api/task');
    return response.json();
  })
    .then(setData)
    .catch(setError);
}, []);
```

**After:**

```tsx
const { agent } = useAgent('brittney');
const { data } = useTask(agent, 'myTask', {
  retry: true,
  maxRetries: 3,
});
```

#### Example 3: Circuit Breaker

**Before:**

```tsx
// Manual circuit breaker implementation (50+ lines)
class CircuitBreaker {
  // ... complex implementation
}

const breaker = new CircuitBreaker();

useEffect(() => {
  breaker
    .execute(async () => {
      const response = await fetch('/api/task');
      return response.json();
    })
    .then(setData)
    .catch(setError);
}, []);
```

**After:**

```tsx
const { agent } = useAgent('brittney', {
  enableCircuitBreaker: true,
});
const { data } = useTask(agent, 'myTask');
```

#### Example 4: Progress Tracking

**Before:**

```tsx
const pollProgress = async (taskId) => {
  const interval = setInterval(async () => {
    const response = await fetch(`/api/tasks/${taskId}/progress`);
    const progress = await response.json();
    setProgress(progress);

    if (progress.status === 'complete') {
      clearInterval(interval);
    }
  }, 1000);
};
```

**After:**

```tsx
const { status, progress, logs } = useTaskStatus(taskId);
```

### Step 4: Add Error Boundaries

**Before:**

```tsx
function MyComponent() {
  const [error, setError] = useState(null);

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  // Component code
}
```

**After:**

```tsx
import { AgentErrorBoundary } from '@hololand/react-agent-sdk';

<AgentErrorBoundary
  fallback={(error, reset) => (
    <div>
      <h2>Error: {error.message}</h2>
      <button onClick={reset}>Retry</button>
    </div>
  )}
>
  <MyComponent />
</AgentErrorBoundary>;
```

### Step 5: Use Suspense (Optional)

If you're using React Suspense:

**Before:**

```tsx
function MyComponent() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchData().then(setData);
  }, []);

  if (!data) return <Spinner />;
  return <Result data={data} />;
}
```

**After:**

```tsx
import { SuspenseTask } from '@hololand/react-agent-sdk';

function MyComponent() {
  const { agent } = useAgent('brittney');

  return (
    <SuspenseTask agent={agent} taskName="fetchData" fallback={<Spinner />}>
      {(data) => <Result data={data} />}
    </SuspenseTask>
  );
}
```

## Common Patterns

### Pattern 1: Sequential Tasks

**Before:**

```tsx
useEffect(() => {
  const run = async () => {
    const result1 = await task1();
    const result2 = await task2(result1);
    const result3 = await task3(result2);
    setData(result3);
  };
  run();
}, []);
```

**After:**

```tsx
const { agent } = useAgent('brittney');
const step1 = useTask(agent, 'task1');
const step2 = useTask(agent, 'task2', { input: step1.data });
const step3 = useTask(agent, 'task3', { input: step2.data });
```

### Pattern 2: Parallel Tasks

**Before:**

```tsx
useEffect(() => {
  Promise.all([fetch('/api/task1'), fetch('/api/task2'), fetch('/api/task3')]).then(
    ([r1, r2, r3]) => {
      setData({ r1, r2, r3 });
    }
  );
}, []);
```

**After:**

```tsx
const { agent } = useAgent('brittney');
const task1 = useTask(agent, 'task1');
const task2 = useTask(agent, 'task2');
const task3 = useTask(agent, 'task3');

const allData = {
  task1: task1.data,
  task2: task2.data,
  task3: task3.data,
};
```

### Pattern 3: Conditional Execution

**Before:**

```tsx
useEffect(() => {
  if (condition) {
    fetchData().then(setData);
  }
}, [condition]);
```

**After:**

```tsx
const { agent } = useAgent('brittney');
const { data } = useTask(condition ? agent : null, 'fetchData');
```

## TypeScript Migration

### Before: Manual Types

```tsx
interface TaskResponse {
  data: unknown;
  error?: string;
}

const [data, setData] = useState<TaskResponse | null>(null);
```

### After: Automatic Type Inference

```tsx
interface MyData {
  result: string;
  metadata: { version: number };
}

const { data } = useTask<MyData>(agent, 'myTask');
// data is typed as MyData | undefined
```

## SSR Migration (Next.js)

### Before: Client-Only

```tsx
function MyComponent() {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      fetchData().then(setData);
    }
  }, []);

  return <div>{data}</div>;
}
```

### After: SSR Compatible

```tsx
function MyComponent() {
  const { agent } = useAgent('brittney');
  const { data } = useTask(typeof window !== 'undefined' ? agent : null, 'fetchData');

  return <div>{data}</div>;
}
```

## Testing Migration

### Before: Complex Mocking

```tsx
jest.mock('@holoscript/core/agents');

test('component', () => {
  const mockAgent = { execute: jest.fn() };
  (getDefaultRegistry as jest.Mock).mockReturnValue({
    findBest: () => mockAgent,
  });

  render(<MyComponent />);
  // ...
});
```

### After: Simple Mocking

```tsx
import { AgentProvider } from '@hololand/react-agent-sdk';

test('component', () => {
  render(
    <AgentProvider config={{ apiUrl: 'http://localhost:3000' }}>
      <MyComponent />
    </AgentProvider>
  );
  // ...
});
```

## Checklist

- [ ] Install `@hololand/react-agent-sdk`
- [ ] Add `AgentProvider` at app root
- [ ] Replace manual agent calls with `useAgent` + `useTask`
- [ ] Remove manual retry logic (use `retry` param)
- [ ] Remove manual circuit breaker (use `enableCircuitBreaker`)
- [ ] Replace manual progress polling with `useTaskStatus`
- [ ] Add `AgentErrorBoundary` for error handling
- [ ] Update TypeScript types to use SDK types
- [ ] Test SSR compatibility (if using Next.js/Remix)
- [ ] Update tests to use SDK test utilities

## Gradual Migration

You can migrate gradually by running both approaches side-by-side:

```tsx
// Old code still works
const [oldData, setOldData] = useState(null);
useEffect(() => {
  fetchDataOldWay().then(setOldData);
}, []);

// New code
const { agent } = useAgent('brittney');
const { data: newData } = useTask(agent, 'fetchData');

// Use oldData || newData during migration
```

## Need Help?

- [Examples](./examples) - 11+ comprehensive examples
- [API Documentation](./README.md) - Complete API reference
- [GitHub Issues](https://github.com/brianonbased-dev/HoloScript/issues)
- [Discord Community](https://discord.gg/holoscript)
