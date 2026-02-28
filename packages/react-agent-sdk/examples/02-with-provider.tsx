/**
 * Example 2: Using AgentProvider for Configuration
 *
 * Configure global agent settings with provider
 */

import React from 'react';
import { AgentProvider, useAgent, useTask } from '@hololand/react-agent-sdk';

function ComponentGeneratorApp() {
  const { agent } = useAgent('brittney');
  const { data, loading, retry } = useTask(agent, 'generateComponent', {
    input: { componentName: 'Button', variant: 'primary' },
    retry: true,
    maxRetries: 3,
  });

  if (loading) return <div>Generating component...</div>;
  if (!data) return <button onClick={retry}>Generate</button>;

  return (
    <div>
      <h2>Generated Component</h2>
      <pre>{data}</pre>
    </div>
  );
}

export function WithProviderExample() {
  return (
    <AgentProvider
      config={{
        apiUrl: 'https://api.hololand.ai',
        token: process.env.REACT_APP_API_TOKEN,
        circuitBreaker: {
          threshold: 0.5,
          timeout: 60000,
          windowSize: 100,
          minimumRequests: 10,
        },
      }}
    >
      <ComponentGeneratorApp />
    </AgentProvider>
  );
}
