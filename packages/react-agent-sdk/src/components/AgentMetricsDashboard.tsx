/**
 * @hololand/react-agent-sdk - AgentMetricsDashboard Component
 *
 * Real-time metrics display
 */

import React from 'react';
import { useAgentMetrics } from '../hooks';
import type { AgentMetricsDashboardProps } from '../types';

/**
 * AgentMetricsDashboard Component
 *
 * Displays comprehensive agent metrics with auto-refresh
 *
 * @example
 * ```tsx
 * <AgentMetricsDashboard
 *   agentName="brittney"
 *   refreshInterval={5000}
 *   showDetailed
 * />
 * ```
 */
export function AgentMetricsDashboard({
  agentName,
  refreshInterval = 5000,
  showDetailed = true,
  className = '',
  style = {},
}: AgentMetricsDashboardProps): JSX.Element {
  const { metrics, loading, error, refresh } = useAgentMetrics(agentName, refreshInterval);

  if (loading && !metrics) {
    return (
      <div className={`metrics-dashboard ${className}`} style={style}>
        <div className="metrics-dashboard__loading">Loading metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`metrics-dashboard ${className}`} style={style}>
        <div className="metrics-dashboard__error">
          <div className="metrics-dashboard__error-message">
            Failed to load metrics: {error.message}
          </div>
          <button className="metrics-dashboard__retry-button" onClick={refresh}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className={`metrics-dashboard ${className}`} style={style}>
        <div className="metrics-dashboard__empty">No metrics available</div>
      </div>
    );
  }

  return (
    <div className={`metrics-dashboard ${className}`} style={style}>
      {/* Header */}
      <div className="metrics-dashboard__header">
        <h3 className="metrics-dashboard__title">{agentName} Metrics</h3>
        <button className="metrics-dashboard__refresh-button" onClick={refresh}>
          Refresh
        </button>
      </div>

      {/* Circuit State */}
      <div className="metrics-dashboard__section">
        <div
          className={`metrics-dashboard__circuit-badge metrics-dashboard__circuit-badge--${metrics.circuitState}`}
        >
          Circuit: {metrics.circuitState.toUpperCase()}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="metrics-dashboard__metrics">
        <div className="metrics-dashboard__metric">
          <div className="metrics-dashboard__metric-label">Success Rate</div>
          <div className="metrics-dashboard__metric-value metrics-dashboard__metric-value--large">
            {(metrics.successRate * 100).toFixed(2)}%
          </div>
        </div>

        <div className="metrics-dashboard__metric">
          <div className="metrics-dashboard__metric-label">Avg Latency</div>
          <div className="metrics-dashboard__metric-value metrics-dashboard__metric-value--large">
            {metrics.averageLatency}ms
          </div>
        </div>

        <div className="metrics-dashboard__metric">
          <div className="metrics-dashboard__metric-label">Requests</div>
          <div className="metrics-dashboard__metric-value metrics-dashboard__metric-value--large">
            {metrics.requestCount}
          </div>
        </div>

        <div className="metrics-dashboard__metric">
          <div className="metrics-dashboard__metric-label">Errors</div>
          <div className="metrics-dashboard__metric-value metrics-dashboard__metric-value--large metrics-dashboard__metric-value--error">
            {metrics.errorCount}
          </div>
        </div>
      </div>

      {/* Detailed Metrics */}
      {showDetailed && (
        <div className="metrics-dashboard__detailed">
          <div className="metrics-dashboard__metric">
            <div className="metrics-dashboard__metric-label">Active Tasks</div>
            <div className="metrics-dashboard__metric-value">{metrics.activeTasks}</div>
          </div>

          <div className="metrics-dashboard__metric">
            <div className="metrics-dashboard__metric-label">Queued Tasks</div>
            <div className="metrics-dashboard__metric-value">{metrics.queuedTasks}</div>
          </div>

          <div className="metrics-dashboard__metric">
            <div className="metrics-dashboard__metric-label">Last Updated</div>
            <div className="metrics-dashboard__metric-value">
              {new Date(metrics.lastUpdated).toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}

      {/* Last Error */}
      {metrics.lastError && (
        <div className="metrics-dashboard__last-error">
          <div className="metrics-dashboard__last-error-label">Last Error:</div>
          <div className="metrics-dashboard__last-error-message">{metrics.lastError.message}</div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .metrics-dashboard {
          padding: 20px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background: #ffffff;
        }

        .metrics-dashboard__loading,
        .metrics-dashboard__empty {
          padding: 40px;
          text-align: center;
          color: #999;
        }

        .metrics-dashboard__error {
          padding: 20px;
          background: #ffebee;
          border-radius: 4px;
          text-align: center;
        }

        .metrics-dashboard__error-message {
          color: #d32f2f;
          margin-bottom: 12px;
        }

        .metrics-dashboard__retry-button {
          padding: 8px 16px;
          background: #d32f2f;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .metrics-dashboard__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .metrics-dashboard__title {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #333;
        }

        .metrics-dashboard__refresh-button {
          padding: 6px 12px;
          background: #1976d2;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .metrics-dashboard__refresh-button:hover {
          background: #1565c0;
        }

        .metrics-dashboard__section {
          margin-bottom: 16px;
        }

        .metrics-dashboard__circuit-badge {
          display: inline-block;
          padding: 6px 16px;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 600;
        }

        .metrics-dashboard__circuit-badge--closed {
          background: #e8f5e9;
          color: #4caf50;
        }

        .metrics-dashboard__circuit-badge--half-open {
          background: #fff3e0;
          color: #ff9800;
        }

        .metrics-dashboard__circuit-badge--open {
          background: #ffebee;
          color: #f44336;
        }

        .metrics-dashboard__metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .metrics-dashboard__metric {
          padding: 16px;
          background: #f5f5f5;
          border-radius: 6px;
        }

        .metrics-dashboard__metric-label {
          font-size: 12px;
          color: #666;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .metrics-dashboard__metric-value {
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .metrics-dashboard__metric-value--large {
          font-size: 24px;
        }

        .metrics-dashboard__metric-value--error {
          color: #f44336;
        }

        .metrics-dashboard__detailed {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
          margin-bottom: 16px;
          padding-top: 16px;
          border-top: 1px solid #e0e0e0;
        }

        .metrics-dashboard__last-error {
          padding: 12px;
          background: #fff3e0;
          border-left: 4px solid #ff9800;
          border-radius: 4px;
        }

        .metrics-dashboard__last-error-label {
          font-size: 12px;
          font-weight: 600;
          color: #f57c00;
          margin-bottom: 4px;
        }

        .metrics-dashboard__last-error-message {
          font-size: 13px;
          color: #333;
          font-family: monospace;
        }
      `,
        }}
      />
    </div>
  );
}
