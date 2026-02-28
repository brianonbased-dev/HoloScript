/**
 * Example 6: Error Boundary
 *
 * Handle agent errors with custom error UI
 */

import React from 'react';
import {
  AgentErrorBoundary,
  useAgent,
  useTask,
} from '@hololand/react-agent-sdk';

function RiskyAgentComponent() {
  const { agent } = useAgent('brittney');
  const { data } = useTask(agent, 'riskyOperation', {
    input: { throwError: true },
  });

  return <div>{data}</div>;
}

export function ErrorBoundaryExample() {
  return (
    <AgentErrorBoundary
      fallback={(error, reset) => (
        <div style={{ padding: '20px', background: '#ffebee', borderRadius: '8px' }}>
          <h2>Agent Error</h2>
          <p>Something went wrong: {error.message}</p>
          <button onClick={reset}>Try Again</button>
        </div>
      )}
      onError={(error) => {
        console.error('Agent error:', error);
        // Send to error tracking service
      }}
    >
      <RiskyAgentComponent />
    </AgentErrorBoundary>
  );
}
