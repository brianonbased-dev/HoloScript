'use client';
/**
 * SyntheticDataDashboard — Configuration UI for synthetic training data generation
 *
 * Features:
 * - Camera placement configuration
 * - Lighting randomization settings
 * - Annotation format selection
 * - Batch generation settings
 * - Scene augmentation controls
 * - Export configuration and generation progress tracking
 *
 * @version 1.0.0
 */
import React from 'react';
import type { SyntheticDataConfig } from './types';
import { useSyntheticData } from './useSyntheticData';
import { formatDuration } from './helpers';
import { CameraTab } from './CameraTab';
import { LightingTab } from './LightingTab';
import { AugmentationTab } from './AugmentationTab';
import { BatchTab } from './BatchTab';

export interface SyntheticDataDashboardProps {
  onGenerate?: (config: SyntheticDataConfig) => void;
  onExportConfig?: (config: SyntheticDataConfig) => void;
  className?: string;
}

export function SyntheticDataDashboard({
  onGenerate,
  onExportConfig,
  className = '',
}: SyntheticDataDashboardProps) {
  const {
    camera, setCamera,
    lighting, setLighting,
    augmentation, setAugmentation,
    batch, setBatch,
    progress,
    activeTab, setActiveTab,
    splitSummary,
    estimatedSize,
    handleGenerate,
    handleExport,
    toggleAugType
  } = useSyntheticData(onGenerate, onExportConfig);

  const tabs = ['camera', 'lighting', 'augmentation', 'batch'] as const;

  return (
    <div className={`p-3 space-y-3 text-xs ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🧪 Synthetic Data</h3>
        <span className="text-[10px] text-studio-muted">
          {batch.totalImages.toLocaleString()} images · {estimatedSize}
        </span>
      </div>

      {/* Tab selector */}
      <div className="flex gap-0.5">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-2 py-1 rounded text-[10px] capitalize transition ${
              activeTab === tab
                ? 'bg-studio-accent/20 text-studio-accent'
                : 'bg-studio-panel/40 text-studio-muted hover:text-studio-text'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'camera' && (
        <CameraTab camera={camera} setCamera={setCamera} />
      )}

      {activeTab === 'lighting' && (
        <LightingTab lighting={lighting} setLighting={setLighting} />
      )}

      {activeTab === 'augmentation' && (
        <AugmentationTab augmentation={augmentation} setAugmentation={setAugmentation} toggleAugType={toggleAugType} />
      )}

      {activeTab === 'batch' && (
        <BatchTab batch={batch} setBatch={setBatch} splitSummary={splitSummary} />
      )}

      {/* Progress bar */}
      {progress.status === 'generating' && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-studio-accent animate-pulse">Generating...</span>
            <span className="text-studio-muted">
              {progress.current}/{progress.total} · ~{formatDuration(progress.estimatedRemainingMs)}{' '}
              remaining
            </span>
          </div>
          <div className="h-1.5 bg-studio-panel/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-studio-accent rounded-full transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {progress.status === 'complete' && (
        <div className="bg-emerald-500/10 rounded px-2 py-1.5 text-[10px] text-emerald-400">
          Generation complete: {progress.total.toLocaleString()} images in{' '}
          {formatDuration(progress.elapsedMs)}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-1.5">
        <button
          onClick={handleGenerate}
          disabled={progress.status === 'generating'}
          className="flex-1 px-2 py-1.5 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition disabled:opacity-50"
        >
          {progress.status === 'generating' ? 'Generating...' : 'Generate Dataset'}
        </button>
        <button
          onClick={handleExport}
          className="px-2 py-1.5 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          Export Config
        </button>
      </div>
    </div>
  );
}

export default SyntheticDataDashboard;
