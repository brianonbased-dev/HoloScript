'use client';

/**
 * StudioOperationsHub — Centralized operations dashboard for HoloScript Studio
 *
 * Combines build status, deployment pipeline, and error log viewer into one
 * unified panel. Provides real-time visibility into the full build-deploy-debug
 * lifecycle from a single location.
 *
 * Sub-components:
 *   - BuildStatusPanel: Live build progress, target status, artifact sizes
 *   - DeploymentPipeline: Multi-stage deployment visualization and control
 *   - ErrorLogViewer: Filterable, searchable error/warning log stream
 *
 * @version 1.0.0
 */

import React, { useState } from 'react';
import { StudioOperationsHubProps } from './types';
import { useBuildStatus, useDeploymentPipeline, useErrorLogs } from './hooks';
import { BuildStatusPanel } from './BuildStatusPanel';
import { DeploymentPipeline } from './DeploymentPipeline';
import { ErrorLogViewer } from './ErrorLogViewer';

export function StudioOperationsHub({ onClose, initialTab = 'build' }: StudioOperationsHubProps) {
  const [activeTab, setActiveTab] = useState<'build' | 'deploy' | 'logs'>(initialTab);
  const build = useBuildStatus();
  const deploy = useDeploymentPipeline();
  const errorLogs = useErrorLogs();

  const tabs = [
    {
      id: 'build' as const,
      label: 'Build',
      badge: build.targets.filter((t) => t.status === 'failed').length || undefined,
    },
    {
      id: 'deploy' as const,
      label: 'Deploy',
      badge: deploy.pipelines.filter((p) => p.status === 'running').length || undefined,
    },
    {
      id: 'logs' as const,
      label: 'Logs',
      badge: errorLogs.counts.error || undefined,
    },
  ];

  return (
    <div className="flex flex-col bg-studio-surface rounded-lg border border-studio-border shadow-xl overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-studio-border bg-studio-panel/50">
        <h2 className="text-sm font-bold text-studio-text">Operations Hub</h2>
        <div className="flex items-center gap-2">
          {/* Tab buttons */}
          <div className="flex bg-studio-panel rounded-md p-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-3 py-1 text-[11px] rounded transition ${
                  activeTab === tab.id
                    ? 'bg-studio-accent/20 text-studio-accent font-semibold'
                    : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-studio-muted hover:text-studio-text transition p-1"
              title="Close"
            >
              X
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="p-4 min-h-[320px]">
        {activeTab === 'build' && (
          <BuildStatusPanel
            targets={build.targets}
            isBuilding={build.isBuilding}
            onStartBuild={build.startBuild}
            onCancel={build.cancelBuild}
            onReset={build.resetAll}
          />
        )}
        {activeTab === 'deploy' && (
          <DeploymentPipeline
            pipelines={deploy.pipelines}
            onTrigger={deploy.triggerDeploy}
            onCancel={deploy.cancelPipeline}
          />
        )}
        {activeTab === 'logs' && (
          <ErrorLogViewer
            logs={errorLogs.logs}
            filter={errorLogs.filter}
            onFilterChange={errorLogs.setFilter}
            searchQuery={errorLogs.searchQuery}
            onSearchChange={errorLogs.setSearchQuery}
            onClear={errorLogs.clearLogs}
            counts={errorLogs.counts}
          />
        )}
      </div>
    </div>
  );
}

export default StudioOperationsHub;
