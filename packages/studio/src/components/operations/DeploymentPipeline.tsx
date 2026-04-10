import React, { useState } from 'react';
import { DeployPipelineState, DeployStageStatus } from './types';
import { STAGE_LABELS } from './hooks';

export interface DeploymentPipelineProps {
  pipelines: DeployPipelineState[];
  onTrigger: (name: string, env: 'staging' | 'production' | 'preview') => void;
  onCancel: (id: string) => void;
}

export function DeploymentPipeline({ pipelines, onTrigger, onCancel }: DeploymentPipelineProps) {
  const [selectedEnv, setSelectedEnv] = useState<'staging' | 'production' | 'preview'>('staging');

  const stageStatusIcon = (status: DeployStageStatus): string => {
    switch (status) {
      case 'pending':
        return '-';
      case 'running':
        return '~';
      case 'passed':
        return '+';
      case 'failed':
        return 'x';
      case 'skipped':
        return '/';
    }
  };

  const stageStatusColor = (status: DeployStageStatus): string => {
    switch (status) {
      case 'pending':
        return 'bg-gray-500/20 text-gray-400';
      case 'running':
        return 'bg-blue-500/20 text-blue-400 animate-pulse';
      case 'passed':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'failed':
        return 'bg-red-500/20 text-red-400';
      case 'skipped':
        return 'bg-gray-500/10 text-gray-500';
    }
  };

  return (
    <div className="space-y-3">
      {/* Header + trigger */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-studio-text">Deployment Pipeline</span>
        <div className="flex items-center gap-1.5">
          <select
            value={selectedEnv}
            onChange={(e) => setSelectedEnv(e.target.value as 'staging' | 'production' | 'preview')}
            className="px-2 py-1 text-[10px] bg-studio-panel border border-studio-border rounded text-studio-text"
          >
            <option value="preview">Preview</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </select>
          <button
            onClick={() => onTrigger(`deploy-${Date.now()}`, selectedEnv)}
            className="px-2 py-1 text-[11px] bg-sky-500/20 text-sky-400 rounded hover:bg-sky-500/30 transition"
          >
            Deploy
          </button>
        </div>
      </div>

      {/* Pipeline list */}
      {pipelines.length === 0 && (
        <div className="text-center text-studio-muted text-[11px] py-6">
          No deployments yet. Trigger a deployment above.
        </div>
      )}

      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {pipelines.map((pipeline) => (
          <div
            key={pipeline.id}
            className="bg-studio-panel/50 rounded-lg border border-studio-border/50 p-2.5"
          >
            {/* Pipeline header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                    pipeline.environment === 'production'
                      ? 'bg-red-500/20 text-red-400'
                      : pipeline.environment === 'staging'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-blue-500/20 text-blue-400'
                  }`}
                >
                  {pipeline.environment.toUpperCase()}
                </span>
                <span className="text-[10px] font-mono text-studio-muted">
                  {pipeline.commitHash}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded ${
                    pipeline.status === 'running'
                      ? 'bg-blue-500/20 text-blue-400'
                      : pipeline.status === 'succeeded'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : pipeline.status === 'failed'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {pipeline.status}
                </span>
                {pipeline.status === 'running' && (
                  <button
                    onClick={() => onCancel(pipeline.id)}
                    className="text-[9px] px-1 py-0.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Stages visualization */}
            <div className="flex gap-0.5 items-center">
              {pipeline.stages.map((s, idx) => (
                <React.Fragment key={s.stage}>
                  <div
                    className={`flex-1 px-1 py-1 rounded text-center text-[8px] ${stageStatusColor(s.status)}`}
                    title={`${STAGE_LABELS[s.stage]}: ${s.status}`}
                  >
                    <div className="font-mono font-bold">{stageStatusIcon(s.status)}</div>
                    <div className="truncate">{STAGE_LABELS[s.stage]}</div>
                  </div>
                  {idx < pipeline.stages.length - 1 && (
                    <div className="text-studio-muted text-[8px]">&rarr;</div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
