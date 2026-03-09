/**
 * Example 11: Next.js SSR Compatibility
 *
 * Use agents with Next.js server-side rendering
 */

import React from 'react';
import { AgentProvider, useAgent, useTask } from '@hololand/react-agent-sdk';

// This component works with Next.js SSR/SSG
function DataFetchingComponent() {
  const { agent, status } = useAgent('brittney');

  // Only execute task on client-side
  const { data, loading } = useTask(typeof window !== 'undefined' ? agent : null, 'fetchData', {
    input: { source: 'api' },
  });

  if (status === 'connecting') {
    return <div>Connecting to agent...</div>;
  }

  if (loading) {
    return <div>Loading data...</div>;
  }

  return <div>Data: {JSON.stringify(data)}</div>;
}

// Next.js page component
export default function Page() {
  return (
    <AgentProvider
      config={{
        apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
        token: process.env.NEXT_PUBLIC_API_TOKEN,
      }}
    >
      <div>
        <h1>Next.js SSR Example</h1>
        <DataFetchingComponent />
      </div>
    </AgentProvider>
  );
}
