/**
 * Example 8: Degraded Mode Handling
 *
 * Gracefully handle system degradation
 */

import React from 'react';
import { useDegradedMode, useAgent, useTask } from '@hololand/react-agent-sdk';

export function DegradedModeExample() {
  const { isDegraded, affectedServices, recoveryStatus } = useDegradedMode();
  const { agent } = useAgent('brittney');
  const { data, loading } = useTask(agent, 'search', {
    input: { query: 'example' },
  });

  if (isDegraded) {
    return (
      <div style={{ padding: '20px', background: '#fff3e0', borderRadius: '8px' }}>
        <h2>System Degraded</h2>
        <p>Some services are currently unavailable:</p>
        <ul>
          {affectedServices.map((service) => (
            <li key={service}>{service}</li>
          ))}
        </ul>
        {recoveryStatus.inProgress && (
          <div>
            <p>Recovery in progress: {recoveryStatus.progress}%</p>
            {recoveryStatus.estimatedTime && (
              <p>ETA: {Math.ceil(recoveryStatus.estimatedTime / 1000)}s</p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (loading) return <div>Loading...</div>;
  return <div>Results: {JSON.stringify(data)}</div>;
}
