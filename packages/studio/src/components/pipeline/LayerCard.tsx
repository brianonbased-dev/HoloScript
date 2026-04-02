'use client';

/**
 * LayerCard — Renders a single layer's status in the pipeline dashboard.
 * Shows status indicator, cycle count, budget usage, quality metrics,
 * and review action buttons.
 */

import React from 'react';
import type { LayerState, LayerId, LayerStatus } from '@/lib/recursive';

interface LayerCardProps {
  layerId: LayerId;
  state: LayerState;
  onApprove?: (layerId: LayerId) => void;
  onReject?: (layerId: LayerId) => void;
}

const LAYER_COLORS: Record<LayerId, string> = {
  0: 'blue',
  1: 'amber',
  2: 'purple',
};

const LAYER_ICONS: Record<LayerId, string> = {
  0: '\u2699\uFE0F', // gear
  1: '\uD83C\uDFAF', // target
  2: '\uD83E\uDDE0', // brain
};

const STATUS_COLORS: Record<LayerStatus, string> = {
  idle: 'bg-gray-400',
  scheduled: 'bg-cyan-400',
  running: 'bg-green-500 animate-pulse',
  awaiting_review: 'bg-yellow-500 animate-pulse',
  completed: 'bg-green-600',
  failed: 'bg-red-500',
  paused: 'bg-orange-400',
};

export function LayerCard({ layerId, state, onApprove, onReject }: LayerCardProps) {
  const { config, status, cyclesCompleted, history, lastOutput } = state;
  const color = LAYER_COLORS[layerId];
  const totalSpent = history.reduce((sum, r) => sum + r.costUSD, 0);
  const budgetPercent =
    config.budget.maxCostUSD > 0
      ? Math.min(100, Math.round((totalSpent / config.budget.maxCostUSD) * 100))
      : 0;
  const lastResult = history[history.length - 1];

  return (
    <div className={`border border-studio-border rounded-lg bg-studio-panel p-4`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{LAYER_ICONS[layerId]}</span>
          <div>
            <h3 className="font-semibold text-studio-text text-sm">
              L{layerId}: {config.name}
            </h3>
            <p className="text-xs text-studio-muted">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status]}`} />
          <span className="text-xs text-studio-muted capitalize">{status.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <div className="text-lg font-mono text-studio-text">
            {cyclesCompleted}/{config.budget.maxCycles}
          </div>
          <div className="text-xs text-studio-muted">Cycles</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-mono text-studio-text">${totalSpent.toFixed(2)}</div>
          <div className="text-xs text-studio-muted">/ ${config.budget.maxCostUSD.toFixed(2)}</div>
        </div>
        {lastResult && (
          <div className="text-center">
            <div
              className={`text-lg font-mono ${
                lastResult.qualityDelta > 0
                  ? 'text-green-500'
                  : lastResult.qualityDelta < 0
                    ? 'text-red-500'
                    : 'text-studio-muted'
              }`}
            >
              {lastResult.qualityDelta > 0 ? '+' : ''}
              {lastResult.qualityDelta.toFixed(4)}
            </div>
            <div className="text-xs text-studio-muted">Quality Delta</div>
          </div>
        )}
      </div>

      {/* Budget Bar */}
      <div className="w-full bg-studio-bg rounded-full h-1.5 mb-3">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${
            budgetPercent > 80 ? 'bg-red-500' : `bg-${color}-500`
          }`}
          style={{ width: `${budgetPercent}%` }}
        />
      </div>

      {/* Last Output Summary */}
      {lastOutput && (
        <div className="text-xs text-studio-muted bg-studio-bg rounded p-2 mb-3">
          {lastOutput.kind === 'code_patches' && (
            <span>
              {lastOutput.patches.length} patches, {lastOutput.filesChanged} files changed
            </span>
          )}
          {lastOutput.kind === 'strategy_adjustment' && (
            <span>Strategy: {lastOutput.rationale?.slice(0, 120)}...</span>
          )}
          {lastOutput.kind === 'evolution' && (
            <span>
              {lastOutput.newSkills.length} skills generated, {lastOutput.wisdomEntries.length}{' '}
              wisdom entries
            </span>
          )}
        </div>
      )}

      {/* Review Actions */}
      {status === 'awaiting_review' && (
        <div className="flex gap-2">
          <button
            onClick={() => onApprove?.(layerId)}
            className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => onReject?.(layerId)}
            className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
