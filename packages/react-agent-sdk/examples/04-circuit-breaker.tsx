/**
 * Example 4: Circuit Breaker Integration
 *
 * Handle service failures gracefully with circuit breaker
 */

import React from 'react';
import {
  useAgent,
  useTask,
  CircuitBreakerStatus,
} from '@hololand/react-agent-sdk';

export function CircuitBreakerExample() {
  const { agent } = useAgent('brittney', {
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 0.5,
    circuitBreakerTimeout: 60000,
  });

  const { data, loading, error, retry } = useTask(agent, 'processData', {
    input: { dataset: 'large' },
    retry: true,
    maxRetries: 3,
  });

  return (
    <div>
      <h2>Data Processing</h2>

      <CircuitBreakerStatus queryName="brittney" showMetrics />

      <div style={{ marginTop: '20px' }}>
        {loading && <div>Processing...</div>}
        {error && (
          <div>
            <div>Error: {error.message}</div>
            <button onClick={retry}>Retry</button>
          </div>
        )}
        {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
      </div>
    </div>
  );
}
