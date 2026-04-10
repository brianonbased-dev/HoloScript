/**
 * @hololand/react-agent-sdk - useAgentMetrics Hook
 *
 * Real-time agent metrics monitoring
 */

import { useState, useEffect, useCallback } from 'react';
import type { UseAgentMetricsReturn } from '../types';
import { useAgentContext } from '../context/AgentContext';

/**
 * useAgentMetrics Hook
 *
 * Monitor agent metrics in real-time with automatic refresh
 *
 * @param agentName - Name of the agent to monitor
 * @param refreshInterval - Auto-refresh interval in milliseconds (default: 5000)
 * @returns Agent metrics with circuit breaker state, success rate, and latency
 *
 * @example
 * ```tsx
 * const { metrics, loading, error, refresh } = useAgentMetrics('brittney', 5000);
 *
 * if (loading) return <Spinner />;
 * if (error) return <Error message={error.message} />;
 *
 * return (
 *   <div>
 *     <div>Success Rate: {(metrics.successRate * 100).toFixed(2)}%</div>
 *     <div>Avg Latency: {metrics.averageLatency}ms</div>
 *     <div>Circuit State: {metrics.circuitState}</div>
 *   </div>
 * );
 * ```
 */
export function useAgentMetrics(agentName: string, refreshInterval = 5000): UseAgentMetricsReturn {
  const context = useAgentContext();
  const [metrics, setMetrics] = useState<UseAgentMetricsReturn['metrics']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  /**
   * Fetch agent metrics
   */
  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch(`${context.apiUrl}/api/agents/${agentName}/metrics`, {
        headers: {
          ...context.headers,
          ...(context.token && { Authorization: `Bearer ${context.token}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.statusText}`);
      }

      const data = await response.json();
      setMetrics({
        agentName,
        circuitState: data.circuitState || 'closed',
        successRate: data.successRate || 1,
        averageLatency: data.averageLatency || 0,
        requestCount: data.requestCount || 0,
        errorCount: data.errorCount || 0,
        lastError: data.lastError,
        lastUpdated: Date.now(),
        activeTasks: data.activeTasks || 0,
        queuedTasks: data.queuedTasks || 0,
      });
      setError(undefined);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [agentName, context]);

  /**
   * Initial fetch and auto-refresh
   */
  useEffect(() => {
    fetchMetrics();

    const interval = setInterval(() => {
      fetchMetrics();
    }, refreshInterval);

    return () => {
      clearInterval(interval);
    };
  }, [fetchMetrics, refreshInterval]);

  return {
    metrics,
    loading,
    error,
    refresh: fetchMetrics,
  };
}
