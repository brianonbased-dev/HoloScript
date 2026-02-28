/**
 * Example 5: Agent Metrics Dashboard
 *
 * Real-time monitoring of agent health and performance
 */

import React from 'react';
import { AgentMetricsDashboard } from '@hololand/react-agent-sdk';

export function MetricsDashboardExample() {
  return (
    <div>
      <h1>Agent Health Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <AgentMetricsDashboard
          agentName="brittney"
          refreshInterval={5000}
          showDetailed
        />

        <AgentMetricsDashboard
          agentName="codeAnalyzer"
          refreshInterval={5000}
          showDetailed
        />
      </div>
    </div>
  );
}
