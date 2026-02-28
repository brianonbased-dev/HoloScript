/**
 * Example 1: Basic Agent Usage
 *
 * The simplest way to use an agent - 3 lines of code
 */

import React from 'react';
import { useAgent, useTask } from '@hololand/react-agent-sdk';

export function BasicUsageExample() {
  // 1. Import hook
  const { agent } = useAgent('brittney');

  // 2. Call hook
  const { data, loading, error } = useTask(agent, 'analyzeCode', {
    input: { file: 'example.ts' },
  });

  // 3. Render result
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>Result: {JSON.stringify(data)}</div>;
}
