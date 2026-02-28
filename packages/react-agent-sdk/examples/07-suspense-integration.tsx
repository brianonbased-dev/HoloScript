/**
 * Example 7: React Suspense Integration
 *
 * Use agents with React Suspense for async rendering
 */

import React from 'react';
import { useAgent, SuspenseTask } from '@hololand/react-agent-sdk';

function Spinner() {
  return <div>Loading...</div>;
}

export function SuspenseIntegrationExample() {
  const { agent } = useAgent('brittney');

  return (
    <div>
      <h1>Component Generator</h1>

      <SuspenseTask
        agent={agent}
        taskName="generateComponent"
        params={{
          input: { componentName: 'Card', variant: 'outlined' },
        }}
        fallback={<Spinner />}
        onError={(error) => (
          <div>Failed to generate: {error.message}</div>
        )}
      >
        {(data) => (
          <div>
            <h2>Generated Component</h2>
            <pre style={{ background: '#f5f5f5', padding: '16px' }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </SuspenseTask>
    </div>
  );
}
