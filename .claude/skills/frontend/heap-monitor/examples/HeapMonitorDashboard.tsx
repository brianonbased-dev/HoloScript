/**
 * Heap Monitor Dashboard Component
 *
 * Visual dashboard for real-time heap monitoring and component analysis
 */

import React, { useState, useEffect } from 'react';
import { heapMonitor, HeapMetrics } from '../HeapBudgetMonitor';
import { useHeapMonitor } from '../react/useHeapMonitor';

interface DashboardProps {
  /** Enable auto-refresh */
  autoRefresh?: boolean;
  /** Refresh interval in ms */
  refreshInterval?: number;
}

export function HeapMonitorDashboard({ autoRefresh = true, refreshInterval = 1000 }: DashboardProps) {
  const [metrics, setMetrics] = useState<HeapMetrics | null>(null);
  const [topComponents, setTopComponents] = useState<Array<{ componentName: string; avgStateSize: number }>>([]);
  const [metricsHistory, setMetricsHistory] = useState<HeapMetrics[]>([]);

  const { utilization, isThresholdExceeded } = useHeapMonitor({
    componentName: 'HeapMonitorDashboard',
    trackState: false,
  });

  useEffect(() => {
    const updateDashboard = () => {
      const currentMetrics = heapMonitor.getHeapMetrics();
      setMetrics(currentMetrics);

      const top = heapMonitor.getTopMemoryComponents(10);
      setTopComponents(top);

      const history = heapMonitor.getMetricsHistory();
      setMetricsHistory(history.slice(-50)); // Last 50 entries
    };

    updateDashboard();

    if (autoRefresh) {
      const intervalId = setInterval(updateDashboard, refreshInterval);
      return () => clearInterval(intervalId);
    }
  }, [autoRefresh, refreshInterval]);

  if (!metrics) {
    return (
      <div style={styles.error}>
        <h2>Memory API Not Available</h2>
        <p>Launch Chrome with <code>--enable-precise-memory-info</code> flag</p>
      </div>
    );
  }

  const utilizationColor = utilization >= 80 ? '#ef4444' : utilization >= 70 ? '#f59e0b' : '#10b981';

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1>Heap Budget Monitor</h1>
        <p>Real-time JavaScript heap monitoring</p>
      </header>

      {/* Alert Banner */}
      {isThresholdExceeded && (
        <div style={styles.alert}>
          <strong>⚠️ Memory Threshold Exceeded</strong>
          <p>Current utilization: {utilization.toFixed(2)}% - Consider clearing caches or pruning state</p>
        </div>
      )}

      {/* Main Metrics */}
      <div style={styles.grid}>
        <MetricCard
          title="Heap Utilization"
          value={`${utilization.toFixed(2)}%`}
          color={utilizationColor}
          subtitle={`${formatBytes(metrics.usedJSHeapSize)} / ${formatBytes(metrics.jsHeapSizeLimit)}`}
        />
        <MetricCard
          title="Used Heap"
          value={formatBytes(metrics.usedJSHeapSize)}
          color="#3b82f6"
          subtitle={`Total: ${formatBytes(metrics.totalJSHeapSize)}`}
        />
        <MetricCard
          title="Heap Limit"
          value={formatBytes(metrics.jsHeapSizeLimit)}
          color="#8b5cf6"
          subtitle="Maximum JS heap size"
        />
        <MetricCard
          title="Components Tracked"
          value={topComponents.length.toString()}
          color="#06b6d4"
          subtitle="Active components"
        />
      </div>

      {/* Heap Utilization Bar */}
      <div style={styles.section}>
        <h2>Heap Utilization</h2>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${utilization}%`,
              backgroundColor: utilizationColor,
            }}
          >
            <span style={styles.progressText}>{utilization.toFixed(2)}%</span>
          </div>
        </div>
        <div style={styles.progressLabels}>
          <span>0%</span>
          <span style={{ color: '#f59e0b' }}>70% Threshold</span>
          <span>100%</span>
        </div>
      </div>

      {/* Top Memory Components */}
      <div style={styles.section}>
        <h2>Top Memory Consuming Components</h2>
        {topComponents.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No components tracked yet</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Component</th>
                <th style={styles.th}>Avg State Size</th>
                <th style={styles.th}>Impact</th>
              </tr>
            </thead>
            <tbody>
              {topComponents.map((component, index) => (
                <tr key={component.componentName} style={styles.tr}>
                  <td style={styles.td}>{index + 1}</td>
                  <td style={styles.td}>
                    <code>{component.componentName}</code>
                  </td>
                  <td style={styles.td}>{formatBytes(component.avgStateSize)}</td>
                  <td style={styles.td}>
                    <div style={styles.impactBar}>
                      <div
                        style={{
                          ...styles.impactFill,
                          width: `${Math.min(100, (component.avgStateSize / (1024 * 1024)) * 10)}%`,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Metrics History Chart */}
      <div style={styles.section}>
        <h2>Utilization History (Last 50 Checks)</h2>
        <div style={styles.chart}>
          <svg width="100%" height="200" viewBox="0 0 1000 200">
            {/* Grid lines */}
            {[0, 25, 50, 70, 100].map((y) => (
              <line
                key={y}
                x1="0"
                y1={200 - (y * 2)}
                x2="1000"
                y2={200 - (y * 2)}
                stroke={y === 70 ? '#f59e0b' : '#e5e7eb'}
                strokeWidth={y === 70 ? '2' : '1'}
                strokeDasharray={y === 70 ? '5,5' : undefined}
              />
            ))}

            {/* History line chart */}
            {metricsHistory.length > 1 && (
              <polyline
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                points={metricsHistory
                  .map((m, i) => {
                    const x = (i / (metricsHistory.length - 1)) * 1000;
                    const y = 200 - (m.utilizationPercentage * 2);
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />
            )}

            {/* Y-axis labels */}
            {[0, 25, 50, 70, 100].map((y) => (
              <text key={`label-${y}`} x="5" y={200 - (y * 2) + 5} fontSize="12" fill="#6b7280">
                {y}%
              </text>
            ))}
          </svg>
        </div>
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        <button
          style={styles.button}
          onClick={() => {
            heapMonitor.reset();
            alert('Metrics history cleared');
          }}
        >
          Clear History
        </button>
        <button
          style={{ ...styles.button, backgroundColor: '#ef4444' }}
          onClick={() => {
            if ((window as any).gc) {
              (window as any).gc();
              alert('Garbage collection triggered');
            } else {
              alert('GC not available. Launch Chrome with --js-flags="--expose-gc"');
            }
          }}
        >
          Force GC
        </button>
        <button
          style={{ ...styles.button, backgroundColor: '#f59e0b' }}
          onClick={() => {
            window.dispatchEvent(new CustomEvent('heap-monitor:state-pruning-required'));
            window.dispatchEvent(new CustomEvent('heap-monitor:cache-eviction-required'));
            alert('Cleanup events dispatched');
          }}
        >
          Trigger Cleanup
        </button>
      </div>
    </div>
  );
}

function MetricCard({ title, value, color, subtitle }: any) {
  return (
    <div style={styles.card}>
      <h3 style={{ ...styles.cardTitle, color }}>{title}</h3>
      <div style={{ ...styles.cardValue, color }}>{value}</div>
      <p style={styles.cardSubtitle}>{subtitle}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
    backgroundColor: '#f9fafb',
  },
  header: {
    textAlign: 'center',
    marginBottom: '30px',
  },
  alert: {
    backgroundColor: '#fef2f2',
    border: '2px solid #ef4444',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
  },
  error: {
    textAlign: 'center',
    padding: '40px',
    backgroundColor: '#fef2f2',
    borderRadius: '8px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: '8px',
  },
  cardValue: {
    fontSize: '32px',
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  cardSubtitle: {
    fontSize: '12px',
    color: '#6b7280',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  progressBar: {
    width: '100%',
    height: '40px',
    backgroundColor: '#e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'width 0.3s ease',
  },
  progressText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: '16px',
  },
  progressLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '8px',
    fontSize: '12px',
    color: '#6b7280',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '2px solid #e5e7eb',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#6b7280',
  },
  tr: {
    borderBottom: '1px solid #e5e7eb',
  },
  td: {
    padding: '12px',
  },
  impactBar: {
    width: '100px',
    height: '8px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  impactFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    transition: 'width 0.3s ease',
  },
  chart: {
    width: '100%',
    height: '200px',
    marginTop: '16px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  button: {
    padding: '12px 24px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
};

export default HeapMonitorDashboard;
