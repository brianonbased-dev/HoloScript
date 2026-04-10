import React, { useState } from 'react';
import { BuildTarget, BuildTargetStatus } from './types';
import { TARGET_ICONS, STATUS_COLORS, formatBytes, formatDuration } from './hooks';

export interface BuildStatusPanelProps {
  targets: BuildTargetStatus[];
  isBuilding: boolean;
  onStartBuild: (targets: BuildTarget[]) => void;
  onCancel: () => void;
  onReset: () => void;
}

export function BuildStatusPanel({
  targets,
  isBuilding,
  onStartBuild,
  onCancel,
  onReset,
}: BuildStatusPanelProps) {
  const [selectedTargets, setSelectedTargets] = useState<Set<BuildTarget>>(
    new Set(['web', 'wasm'])
  );

  const toggleTarget = (target: BuildTarget) => {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(target)) next.delete(target);
      else next.add(target);
      return next;
    });
  };

  const successCount = targets.filter((t) => t.status === 'success').length;
  const failedCount = targets.filter((t) => t.status === 'failed').length;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-studio-text">Build Status</span>
          {(successCount > 0 || failedCount > 0) && (
            <span className="text-[10px] text-studio-muted">
              {successCount} passed / {failedCount} failed
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => onStartBuild(Array.from(selectedTargets))}
            disabled={isBuilding || selectedTargets.size === 0}
            className="px-2 py-1 text-[11px] bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition disabled:opacity-50"
          >
            {isBuilding ? 'Building...' : 'Build'}
          </button>
          {isBuilding && (
            <button
              onClick={onCancel}
              className="px-2 py-1 text-[11px] bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onReset}
            className="px-2 py-1 text-[11px] bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Target selector grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {targets.map((t) => {
          const isSelected = selectedTargets.has(t.target);
          return (
            <button
              key={t.target}
              onClick={() => toggleTarget(t.target)}
              disabled={isBuilding}
              className={`relative px-2 py-2 rounded text-[10px] text-center transition-all ${
                isSelected
                  ? 'ring-1 ring-studio-accent/40 bg-studio-accent/10 text-studio-accent'
                  : 'bg-studio-panel/40 text-studio-muted hover:text-studio-text'
              } disabled:cursor-not-allowed`}
            >
              <div className="font-mono font-bold text-xs">{TARGET_ICONS[t.target]}</div>
              <div className="mt-0.5">{t.target}</div>

              {/* Status badge */}
              {t.status !== 'idle' && (
                <div
                  className={`absolute top-0.5 right-0.5 px-1 rounded text-[8px] ${STATUS_COLORS[t.status]}`}
                >
                  {t.status === 'building' ? `${Math.round(t.progress)}%` : t.status}
                </div>
              )}

              {/* Progress bar */}
              {t.status === 'building' && (
                <div className="mt-1 h-0.5 bg-gray-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-400 transition-all duration-300"
                    style={{ width: `${t.progress}%` }}
                  />
                </div>
              )}

              {/* Artifact size */}
              {t.artifactSize != null && t.status === 'success' && (
                <div className="text-[8px] text-studio-muted mt-0.5">
                  {formatBytes(t.artifactSize)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Completed build summary */}
      {targets.some((t) => t.completedAt && t.startedAt) && (
        <div className="flex gap-2 flex-wrap">
          {targets
            .filter((t) => t.completedAt && t.startedAt)
            .map((t) => (
              <div
                key={t.target}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${STATUS_COLORS[t.status]}`}
              >
                <span className="font-mono">{t.target}</span>
                <span>{formatDuration(t.completedAt! - t.startedAt!)}</span>
                {t.errorCount > 0 && <span className="text-red-400">{t.errorCount}E</span>}
                {t.warningCount > 0 && <span className="text-yellow-400">{t.warningCount}W</span>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
