'use client';

/**
 * PipelineConfig — Modal for editing layer configurations.
 * Budget sliders, review gate toggles, enable/disable per layer.
 */

import React from 'react';
import type { LayerId, LayerConfig } from '@/lib/recursive';

interface PipelineConfigProps {
  configs: Record<LayerId, LayerConfig>;
  onUpdate: (layerId: LayerId, patch: Partial<LayerConfig>) => void;
  onReset: () => void;
  onClose: () => void;
}

function LayerConfigEditor({
  config,
  onUpdate,
}: {
  config: LayerConfig;
  onUpdate: (patch: Partial<LayerConfig>) => void;
}) {
  return (
    <div className="border border-studio-border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-studio-text text-sm">
          L{config.id}: {config.name}
        </h4>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onUpdate({ enabled: e.target.checked })}
            className="rounded"
          />
          <span className="text-studio-muted">Enabled</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-studio-muted block mb-1">Max Cost (USD)</label>
          <input
            type="number"
            min={0.1}
            max={10.0}
            step={0.1}
            value={config.budget.maxCostUSD}
            onChange={(e) =>
              onUpdate({
                budget: { ...config.budget, maxCostUSD: parseFloat(e.target.value) || 1.0 },
              })
            }
            className="w-full px-2 py-1 text-sm bg-studio-bg border border-studio-border rounded text-studio-text"
          />
        </div>
        <div>
          <label className="text-xs text-studio-muted block mb-1">Max Cycles</label>
          <input
            type="number"
            min={1}
            max={10}
            value={config.budget.maxCycles}
            onChange={(e) =>
              onUpdate({
                budget: { ...config.budget, maxCycles: parseInt(e.target.value) || 1 },
              })
            }
            className="w-full px-2 py-1 text-sm bg-studio-bg border border-studio-border rounded text-studio-text"
          />
        </div>
      </div>

      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={config.requiresHumanReview}
          onChange={(e) => onUpdate({ requiresHumanReview: e.target.checked })}
          className="rounded"
        />
        <span className="text-studio-muted">Require human review before applying</span>
      </label>

      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={config.autoEscalate}
          onChange={(e) => onUpdate({ autoEscalate: e.target.checked })}
          className="rounded"
        />
        <span className="text-studio-muted">Auto-escalate on failure</span>
      </label>
    </div>
  );
}

export function PipelineConfig({ configs, onUpdate, onReset, onClose }: PipelineConfigProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-studio-panel border border-studio-border rounded-xl w-full max-w-lg p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-studio-text">Pipeline Configuration</h3>
          <button onClick={onClose} className="text-studio-muted hover:text-studio-text text-xl">
            &times;
          </button>
        </div>

        <div className="space-y-3 mb-4">
          {([0, 1, 2] as LayerId[]).map((id) => (
            <LayerConfigEditor
              key={id}
              config={configs[id]}
              onUpdate={(patch) => onUpdate(id, patch)}
            />
          ))}
        </div>

        <div className="flex justify-between">
          <button
            onClick={onReset}
            className="px-3 py-1.5 text-sm text-studio-muted hover:text-studio-text border border-studio-border rounded transition-colors"
          >
            Reset to Defaults
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
