'use client';

/**
 * Deployment Details Modal
 *
 * Shows deployment details, logs, metrics, and management actions
 */

import { useState } from 'react';
import { X, Trash2, RefreshCw, ExternalLink, Activity, BarChart2, FileText } from 'lucide-react';
import { useDeploy, useExecutionLogs, useDeploymentMetrics } from '@/lib/cloud/hooks';
import type { Deployment } from '@/lib/cloud/types';

interface DeploymentDetailsModalProps {
  deployment: Deployment;
  onClose: () => void;
  onUpdate: () => void;
}

type TabType = 'overview' | 'logs' | 'metrics';

export function DeploymentDetailsModal({
  deployment,
  onClose,
  onUpdate,
}: DeploymentDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const { redeploy, deleteDeployment, deploying } = useDeploy();
  const { logs, loading: logsLoading } = useExecutionLogs(deployment.id, {
    limit: 100,
    autoRefresh: true,
  });
  const { metrics, loading: metricsLoading } = useDeploymentMetrics(deployment.id, true);

  const handleRedeploy = async () => {
    try {
      await redeploy(deployment.id);
      onUpdate();
    } catch (err) {
      // Error handled by hook
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete deployment "${deployment.name}"?`)) {
      return;
    }

    try {
      await deleteDeployment(deployment.id);
      onUpdate();
    } catch (err) {
      // Error handled by hook
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative h-[80vh] w-full max-w-4xl rounded-xl border border-studio-border bg-studio-panel shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-studio-border px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-studio-text">{deployment.name}</h2>
            <p className="text-xs text-studio-muted">
              {deployment.target.provider} • {deployment.endpoint}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRedeploy}
              disabled={deploying}
              className="flex items-center gap-2 rounded-lg bg-sky-500/20 px-3 py-2 text-xs font-medium text-sky-400 transition hover:bg-sky-500/30 disabled:opacity-50"
              title="Redeploy"
            >
              <RefreshCw className={`h-4 w-4 ${deploying ? 'animate-spin' : ''}`} />
              Redeploy
            </button>
            <button
              onClick={handleDelete}
              className="rounded-lg p-2 text-studio-muted transition hover:bg-red-500/20 hover:text-red-400"
              title="Delete deployment"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-studio-border">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'logs', label: 'Logs', icon: FileText },
            { id: 'metrics', label: 'Metrics', icon: BarChart2 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'border-b-2 border-sky-500 text-sky-400'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-studio-muted">Status</p>
                  <p className="mt-1 text-sm text-studio-text capitalize">{deployment.status}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-studio-muted">Version</p>
                  <p className="mt-1 text-sm text-studio-text">v{deployment.version}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-studio-muted">Memory</p>
                  <p className="mt-1 text-sm text-studio-text">{deployment.target.memory}MB</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-studio-muted">Timeout</p>
                  <p className="mt-1 text-sm text-studio-text">{deployment.target.timeout}s</p>
                </div>
              </div>

              {deployment.endpoint && (
                <div>
                  <p className="text-xs font-medium text-studio-muted">Endpoint</p>
                  <div className="mt-1 flex items-center gap-2 rounded bg-studio-surface px-3 py-2">
                    <code className="flex-1 text-xs text-sky-400">{deployment.endpoint}</code>
                    <a
                      href={deployment.endpoint}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-studio-muted hover:text-sky-400 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-2">
              {logsLoading && logs.length === 0 && (
                <div className="flex justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
                </div>
              )}

              {logs.length === 0 && !logsLoading && (
                <p className="text-center text-sm text-studio-muted py-8">No logs available</p>
              )}

              {logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded border border-studio-border bg-studio-surface px-3 py-2 text-xs font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-studio-muted">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={`font-semibold ${
                        log.level === 'error'
                          ? 'text-red-400'
                          : log.level === 'warn'
                            ? 'text-yellow-400'
                            : log.level === 'info'
                              ? 'text-sky-400'
                              : 'text-studio-muted'
                      }`}
                    >
                      [{log.level.toUpperCase()}]
                    </span>
                    <span className="text-studio-text">{log.message}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="space-y-4">
              {metricsLoading && !metrics && (
                <div className="flex justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
                </div>
              )}

              {metrics && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-studio-border bg-studio-surface p-4">
                    <p className="text-xs font-medium text-studio-muted">Total Executions</p>
                    <p className="mt-2 text-2xl font-bold text-studio-text">
                      {metrics.totalExecutions.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-studio-border bg-studio-surface p-4">
                    <p className="text-xs font-medium text-studio-muted">Success Rate</p>
                    <p className="mt-2 text-2xl font-bold text-emerald-400">
                      {metrics.totalExecutions > 0
                        ? ((metrics.successCount / metrics.totalExecutions) * 100).toFixed(1)
                        : 0}
                      %
                    </p>
                  </div>
                  <div className="rounded-lg border border-studio-border bg-studio-surface p-4">
                    <p className="text-xs font-medium text-studio-muted">Avg Duration</p>
                    <p className="mt-2 text-2xl font-bold text-studio-text">
                      {metrics.avgDuration.toFixed(0)}ms
                    </p>
                  </div>
                  <div className="rounded-lg border border-studio-border bg-studio-surface p-4">
                    <p className="text-xs font-medium text-studio-muted">P95 Duration</p>
                    <p className="mt-2 text-2xl font-bold text-studio-text">
                      {metrics.p95Duration.toFixed(0)}ms
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
