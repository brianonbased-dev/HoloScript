# GraphQL Circuit Breaker with Jittered Exponential Backoff

A robust circuit breaker implementation for GraphQL clients with comprehensive failure handling, retry logic, and degraded mode support.

## Features

- **Per-Query Granular Circuit Tracking** - Independent circuit breakers for each GraphQL operation
- **Smart Failure Detection** - Opens circuit on 50% failure rate over 10 requests OR 5 consecutive timeouts
- **Jittered Exponential Backoff** - Prevents thundering herd with full jitter (0-100% random delay)
- **Cache Fallback** - Serves cached responses when circuit is open (Apollo/URQL compatible)
- **Degraded Mode UI** - User-friendly banner with automatic recovery status
- **Comprehensive Metrics** - Circuit state, failure rates, cache hits, retry histograms
- **Health Check Recovery** - Automatic circuit testing and closure after 30-second timeout

## Installation

```bash
npm install @holoscript/circuit-breaker
```

## Quick Start

### Basic Usage

```typescript
import { GraphQLCircuitBreakerClient } from '@holoscript/circuit-breaker';

// Create client
const client = new GraphQLCircuitBreakerClient({
  endpoint: 'https://api.example.com/graphql',
  enableCacheFallback: true,
  maxRetries: 3
});

// Execute query
const result = await client.query({
  query: `
    query GetUser($id: ID!) {
      user(id: $id) {
        id
        name
        email
      }
    }
  `,
  variables: { id: '123' },
  operationName: 'GetUser'
});

if (result.success) {
  console.log('User data:', result.data);
} else {
  console.error('Query failed:', result.error);
  if (result.fromCache) {
    console.log('Serving from cache (degraded mode)');
  }
}
```

### With React Component

```tsx
import React, { useEffect, useState } from 'react';
import { GraphQLCircuitBreakerClient } from '@holoscript/circuit-breaker';
import { DegradedModeBanner, useDegradedMode } from '@holoscript/circuit-breaker/ui';

const client = new GraphQLCircuitBreakerClient({
  endpoint: 'https://api.example.com/graphql',
  enableCacheFallback: true
});

function App() {
  const { isDegraded, openCircuits } = useDegradedMode(client);

  return (
    <div>
      <DegradedModeBanner client={client} position="top" />

      {isDegraded && (
        <div className="warning">
          System in degraded mode: {openCircuits.join(', ')}
        </div>
      )}

      {/* Your app content */}
    </div>
  );
}
```

## Configuration

### Circuit Breaker Configuration

```typescript
const client = new GraphQLCircuitBreakerClient({
  endpoint: 'https://api.example.com/graphql',
  timeout: 10000, // Request timeout (ms)
  maxRetries: 3,  // Maximum retry attempts
  enableCacheFallback: true,

  circuitBreakerConfig: {
    // Open circuit when 50% failure rate over 10 requests
    failureRateThreshold: 0.5,
    minimumRequests: 10,

    // OR open circuit on 5 consecutive timeouts
    consecutiveTimeoutThreshold: 5,

    // Wait 30 seconds before attempting recovery
    openStateTimeout: 30000,

    // Test with 5 health check queries in half-open state
    healthCheckCount: 5,

    // Need 3 successful health checks to close circuit
    successThreshold: 3,

    // Retry delays: 1s, 2s, 4s, 8s, max 30s
    baseRetryDelay: 1000,
    maxRetryDelay: 30000
  }
});
```

## Fallback Data

Register fallback data to serve when circuit is open and cache is unavailable:

```typescript
import { FallbackDataProvider } from '@holoscript/circuit-breaker';

// Register fallback for specific operation
FallbackDataProvider.register('GetUsers', {
  data: {
    users: [] // Empty array for degraded mode
  }
});

FallbackDataProvider.register('GetDashboard', {
  data: {
    widgets: [],
    metrics: { loading: true }
  }
});
```

## Metrics and Monitoring

### Dashboard View

```typescript
import { CircuitBreakerMetrics, MetricsMonitor } from '@holoscript/circuit-breaker/metrics';

// Start monitoring
const monitor = new MetricsMonitor(client, 10000); // Capture every 10 seconds
monitor.start();

// Get metrics
const metrics = monitor.getMetrics();

// Generate dashboard
console.log(metrics.generateDashboard());
```

Example dashboard output:

```
╔════════════════════════════════════════════════════════════════╗
║           Circuit Breaker Metrics Dashboard                    ║
╚════════════════════════════════════════════════════════════════╝

📊 System Health: HEALTHY (92/100)

Circuit Health:        95/100
Failure Rate Health:   88/100
Cache Effectiveness:   90/100

🔌 Circuit States:
  Closed (Healthy):    8
  Half-Open (Testing): 1
  Open (Failed):       1

📈 Aggregate Metrics:
  Total Circuits:      10
  Total Requests:      1523
  Overall Failure Rate: 3.24%
  Cache Hits:          42

⏱️  Retry Delays (seconds):
  Average:             2.34s
  P50 (Median):        1.89s
  P95:                 8.45s
  P99:                 15.23s
```

### Export Metrics

```typescript
// Export as JSON
const json = metrics.export({ format: 'json', includeHistograms: true });

// Export as Prometheus
const prometheus = metrics.export({ format: 'prometheus' });

// Export as CSV
const csv = metrics.export({ format: 'csv' });
```

### Programmatic Access

```typescript
// Get all circuit stats
const stats = client.getCircuitStats();

stats.forEach(stat => {
  console.log(`${stat.operationName}:`, {
    state: stat.state,
    failureRate: (stat.failureRate * 100).toFixed(2) + '%',
    requests: stat.totalRequests,
    cacheHits: stat.cacheHits
  });
});

// Get system health
const health = client.getSystemHealth();

if (health.degradedMode) {
  console.warn(`System degraded: ${health.circuits.byState.open} circuits open`);
}
```

## UI Components

### DegradedModeBanner (React)

```tsx
import { DegradedModeBanner } from '@holoscript/circuit-breaker/ui';

<DegradedModeBanner
  client={client}
  position="top"          // or "bottom"
  refreshInterval={5000}  // Check every 5 seconds
  autoDismiss={true}      // Auto-dismiss when recovered
  className="custom-banner"
/>
```

### Vanilla JavaScript Indicator

```typescript
import { DegradedModeIndicator } from '@holoscript/circuit-breaker/ui';

const indicator = new DegradedModeIndicator(client);
indicator.startMonitoring(5000); // Check every 5 seconds
```

## Integration with Apollo Client

```typescript
import { ApolloClient, InMemoryCache, ApolloLink } from '@apollo/client';
import { GraphQLCircuitBreakerClient } from '@holoscript/circuit-breaker';

const circuitClient = new GraphQLCircuitBreakerClient({
  endpoint: 'https://api.example.com/graphql',
  enableCacheFallback: true
});

// Custom link that uses circuit breaker
const circuitBreakerLink = new ApolloLink((operation, forward) => {
  return new Observable(observer => {
    circuitClient.query({
      query: operation.query.loc?.source.body || '',
      variables: operation.variables,
      operationName: operation.operationName
    }).then(result => {
      if (result.success) {
        observer.next({ data: result.data });
        observer.complete();
      } else {
        observer.error(result.error);
      }
    });
  });
});

const apolloClient = new ApolloClient({
  link: circuitBreakerLink,
  cache: new InMemoryCache()
});
```

## Integration with URQL

```typescript
import { createClient, fetchExchange } from 'urql';
import { GraphQLCircuitBreakerClient } from '@holoscript/circuit-breaker';

const circuitClient = new GraphQLCircuitBreakerClient({
  endpoint: 'https://api.example.com/graphql',
  enableCacheFallback: true
});

// Custom exchange that uses circuit breaker
const circuitBreakerExchange = ({ forward }) => ops$ => {
  return pipe(
    ops$,
    mergeMap(operation => {
      return fromPromise(
        circuitClient.query({
          query: operation.query.loc?.source.body || '',
          variables: operation.variables,
          operationName: operation.operationName
        }).then(result => ({
          operation,
          data: result.data,
          error: result.error
        }))
      );
    })
  );
};

const urqlClient = createClient({
  url: 'https://api.example.com/graphql',
  exchanges: [circuitBreakerExchange, fetchExchange]
});
```

## Agent Identity RBAC Integration

For testing agents with special privileges:

```typescript
import { GraphQLCircuitBreakerClient } from '@holoscript/circuit-breaker';

const client = new GraphQLCircuitBreakerClient({
  endpoint: 'https://api.example.com/graphql',
  headers: {
    'X-Agent-ID': process.env.AGENT_ID,
    'X-Agent-Role': 'testing-agent',
    Authorization: `Bearer ${process.env.AGENT_TOKEN}`
  },
  enableCacheFallback: true
});

// Testing agent uses circuit breaker during test execution
async function runTests() {
  const result = await client.query({
    query: `query HealthCheck { ping }`,
    operationName: 'HealthCheck'
  });

  if (result.success) {
    // Proceed with tests
  } else {
    // Handle degraded mode in tests
    console.warn('Testing in degraded mode - using fallback data');
  }
}
```

## Advanced Patterns

### Custom Retry Logic

```typescript
class CustomCircuitBreakerClient extends GraphQLCircuitBreakerClient {
  protected isRetriableError(errors: any[]): boolean {
    // Custom retry logic
    return errors.some(error => {
      const code = error.extensions?.code;
      return ['CUSTOM_RETRY_CODE', 'ANOTHER_RETRY_CODE'].includes(code);
    });
  }
}
```

### Circuit State Listeners

```typescript
// Monitor circuit state changes
setInterval(() => {
  const stats = client.getCircuitStats();

  stats.forEach(stat => {
    if (stat.state === CircuitState.OPEN) {
      // Alert on circuit open
      sendAlert(`Circuit ${stat.operationName} is open!`);
    }
  });
}, 10000);
```

### Dynamic Configuration

```typescript
// Adjust configuration based on time of day
const isDuringPeakHours = new Date().getHours() >= 9 && new Date().getHours() <= 17;

const client = new GraphQLCircuitBreakerClient({
  endpoint: 'https://api.example.com/graphql',
  circuitBreakerConfig: {
    failureRateThreshold: isDuringPeakHours ? 0.3 : 0.5, // Stricter during peak
    consecutiveTimeoutThreshold: isDuringPeakHours ? 3 : 5,
    baseRetryDelay: isDuringPeakHours ? 2000 : 1000
  }
});
```

## Expected Results

Based on the requirements, this implementation should achieve:

- **80% reduction in backend overload** - Jittered delays prevent thundering herd, circuits fail fast when open
- **60% reduction in false-negative test failures** - Retry logic handles transient failures, degraded mode allows tests to continue with cached/fallback data
- **Granular failure tracking** - Per-query circuits isolate problems to specific operations
- **User-friendly degraded mode** - Banner clearly communicates service status and expected recovery time

## Testing

Run the test suite:

```bash
# Unit tests
npm test CircuitBreaker.test.ts

# Integration tests
npm test GraphQLCircuitBreakerClient.test.ts

# All tests with coverage
npm test -- --coverage
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   GraphQL Query Request                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           CircuitBreakerManager.getCircuit()                │
│         (per-query granular circuit selection)              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │ Circuit.     │
                  │ canExecute() │
                  └──────┬───────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
      CLOSED/                        OPEN
    HALF-OPEN                           │
          │                             │
          ▼                             ▼
┌──────────────────────┐      ┌─────────────────────┐
│  Execute Request     │      │   Cache Fallback    │
│  with Retries        │      │   or Fallback Data  │
└──────────┬───────────┘      └─────────────────────┘
           │
           ▼
    ┌─────────────┐
    │  Success?   │
    └──────┬──────┘
           │
    ┌──────┴──────┐
    │             │
  YES             NO
    │             │
    ▼             ▼
recordSuccess()  recordFailure()
    │             │
    │             ├─► Check failure rate (50% over 10 reqs)
    │             ├─► Check consecutive timeouts (5)
    │             └─► Open circuit if threshold exceeded
    │
    └─► Update metrics, cache response
```

## Timeline

- **Week 1:** Core circuit breaker + retry logic
- **Week 2:** GraphQL client integration + caching
- **Week 3:** UI components + metrics system + testing

## License

MIT

## Support

For issues or questions, please open a GitHub issue or contact the HoloScript team.
