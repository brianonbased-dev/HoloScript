/**
 * Example 10: Custom Retry Logic
 *
 * Fine-tune retry behavior with exponential backoff
 */

import React from 'react';
import { useAgent, useTask } from '@hololand/react-agent-sdk';

export function CustomRetryExample() {
  const { agent } = useAgent('brittney', {
    enableCircuitBreaker: true,
    autoReconnect: true,
    reconnectDelay: 2000,
    maxReconnectAttempts: 5,
  });

  const { data, loading, error, retry, status } = useTask(agent, 'unstableOperation', {
    input: { data: 'test' },
    retry: true,
    maxRetries: 5,
    retryDelay: 2000,
    timeout: 30000,
    priority: 'high',
  });

  return (
    <div>
      <h2>Custom Retry Logic</h2>

      <div>
        <strong>Status:</strong> {status}
      </div>

      {loading && (
        <div>
          <div>Processing...</div>
          <div>This may take multiple attempts</div>
        </div>
      )}

      {error && (
        <div style={{ padding: '16px', background: '#ffebee' }}>
          <div>Error: {error.message}</div>
          <button onClick={retry}>Manual Retry</button>
        </div>
      )}

      {data && (
        <div style={{ padding: '16px', background: '#e8f5e9' }}>
          <div>Success!</div>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
