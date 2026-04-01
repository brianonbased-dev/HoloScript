'use client';
/**
 * SyntheticDataDashboard — Configuration UI for synthetic training data generation
 *
 *
 * Features:
 * - Camera placement configuration (grid, random, hemisphere)
 * - Lighting randomization settings (intensity, color, direction ranges)
 * - Annotation format selection (COCO, YOLO, Pascal VOC)
 * - Batch generation settings (count, resolution, splits)
 * - Scene augmentation controls (noise, blur, occlusion)
 * - Export configuration and generation progress tracking
 *
 * @version 1.0.0
 */
import React, { useState, useCallback, useMemo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export type AnnotationFormat = 'coco' | 'yolo' | 'pascal-voc';
export type CameraPlacement = 'grid' | 'random' | 'hemisphere' | 'orbital' | 'custom';
export type LightingMode = 'fixed' | 'randomized' | 'hdri-sweep' | 'time-of-day';
export type AugmentationType = 'noise' | 'blur' | 'occlusion' | 'colorJitter' | 'cropResize';

export interface CameraConfig {
  placement: CameraPlacement;
  count: number;
  minDistance: number;
  maxDistance: number;
  minHeight: number;
  maxHeight: number;
  fovRange: [number, number];
  lookAtJitter: number; // randomized offset from center (meters)
}

export interface LightingConfig {
  mode: LightingMode;
  intensityRange: [number, number];
  colorTemperatureRange: [number, number]; // Kelvin
  directionalCount: number;
  ambientRange: [number, number];
  shadowsEnabled: boolean;
  hdriPaths?: string[];
}

export interface AugmentationConfig {
  enabled: boolean;
  types: AugmentationType[];
  noiseStddev: number; // 0-0.1
  blurRadius: number; // 0-5
  occlusionProbability: number; // 0-1
  colorJitterRange: number; // 0-0.5
  randomCropScale: [number, number]; // e.g. [0.8, 1.0]
}

export interface BatchConfig {
  totalImages: number;
  resolution: [number, number];
  trainSplit: number; // 0-1
  valSplit: number;
  testSplit: number;
  seed: number;
  format: AnnotationFormat;
  outputDir: string;
  includeDepth: boolean;
  includeNormals: boolean;
  includeSegmentation: boolean;
}

export interface GenerationProgress {
  status: 'idle' | 'generating' | 'complete' | 'error';
  current: number;
  total: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
  errors: string[];
}

export interface SyntheticDataDashboardProps {
  onGenerate?: (config: SyntheticDataConfig) => void;
  onExportConfig?: (config: SyntheticDataConfig) => void;
  className?: string;
}

export interface SyntheticDataConfig {
  camera: CameraConfig;
  lighting: LightingConfig;
  augmentation: AugmentationConfig;
  batch: BatchConfig;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const FORMAT_INFO: Record<AnnotationFormat, { label: string; icon: string; desc: string }> = {
  coco: { label: 'COCO', icon: '🎯', desc: 'JSON annotations, instance segmentation' },
  yolo: { label: 'YOLO', icon: '⚡', desc: 'TXT labels, bounding boxes per image' },
  'pascal-voc': { label: 'Pascal VOC', icon: '📋', desc: 'XML annotations, per-image files' },
};

const PLACEMENT_INFO: Record<CameraPlacement, { label: string; icon: string }> = {
  grid: { label: 'Grid', icon: '▦' },
  random: { label: 'Random', icon: '🎲' },
  hemisphere: { label: 'Hemisphere', icon: '🌐' },
  orbital: { label: 'Orbital', icon: '🔄' },
  custom: { label: 'Custom', icon: '📐' },
};

const LIGHTING_INFO: Record<LightingMode, { label: string; icon: string }> = {
  fixed: { label: 'Fixed', icon: '💡' },
  randomized: { label: 'Randomized', icon: '🎲' },
  'hdri-sweep': { label: 'HDRI Sweep', icon: '🌅' },
  'time-of-day': { label: 'Time of Day', icon: '🕐' },
};

const DEFAULT_CAMERA: CameraConfig = {
  placement: 'hemisphere',
  count: 50,
  minDistance: 2,
  maxDistance: 8,
  minHeight: 0.5,
  maxHeight: 4,
  fovRange: [40, 70],
  lookAtJitter: 0.2,
};

const DEFAULT_LIGHTING: LightingConfig = {
  mode: 'randomized',
  intensityRange: [0.5, 2.0],
  colorTemperatureRange: [3500, 6500],
  directionalCount: 2,
  ambientRange: [0.1, 0.5],
  shadowsEnabled: true,
};

const DEFAULT_AUGMENTATION: AugmentationConfig = {
  enabled: true,
  types: ['noise', 'colorJitter'],
  noiseStddev: 0.02,
  blurRadius: 0,
  occlusionProbability: 0,
  colorJitterRange: 0.15,
  randomCropScale: [0.85, 1.0],
};

const DEFAULT_BATCH: BatchConfig = {
  totalImages: 1000,
  resolution: [1024, 1024],
  trainSplit: 0.8,
  valSplit: 0.1,
  testSplit: 0.1,
  seed: 42,
  format: 'coco',
  outputDir: './synthetic-data',
  includeDepth: false,
  includeNormals: false,
  includeSegmentation: true,
};

// =============================================================================
// HELPERS
// =============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function SyntheticDataDashboard({
  onGenerate,
  onExportConfig,
  className = '',
}: SyntheticDataDashboardProps) {
  const [camera, setCamera] = useState<CameraConfig>(DEFAULT_CAMERA);
  const [lighting, setLighting] = useState<LightingConfig>(DEFAULT_LIGHTING);
  const [augmentation, setAugmentation] = useState<AugmentationConfig>(DEFAULT_AUGMENTATION);
  const [batch, setBatch] = useState<BatchConfig>(DEFAULT_BATCH);
  const [progress, setProgress] = useState<GenerationProgress>({
    status: 'idle',
    current: 0,
    total: 0,
    elapsedMs: 0,
    estimatedRemainingMs: 0,
    errors: [],
  });
  const [activeTab, setActiveTab] = useState<'camera' | 'lighting' | 'augmentation' | 'batch'>(
    'camera'
  );

  // ─── Config assembly ──────────────────────────────────────────────────

  const config = useMemo<SyntheticDataConfig>(
    () => ({ camera, lighting, augmentation, batch }),
    [camera, lighting, augmentation, batch]
  );

  // ─── Computed ─────────────────────────────────────────────────────────

  const splitSummary = useMemo(() => {
    const total = batch.totalImages;
    return {
      train: Math.round(total * batch.trainSplit),
      val: Math.round(total * batch.valSplit),
      test: Math.round(total * batch.testSplit),
    };
  }, [batch]);

  const estimatedSize = useMemo(() => {
    const [w, h] = batch.resolution;
    const bytesPerImage = w * h * 3; // RGB
    const totalBytes = bytesPerImage * batch.totalImages;
    const withAnnotations = totalBytes * 1.15; // ~15% overhead for annotations
    const multiplier =
      1 +
      (batch.includeDepth ? 0.33 : 0) +
      (batch.includeNormals ? 0.33 : 0) +
      (batch.includeSegmentation ? 0.15 : 0);
    const total = withAnnotations * multiplier;
    if (total >= 1_073_741_824) return `${(total / 1_073_741_824).toFixed(1)} GB`;
    return `${(total / 1_048_576).toFixed(0)} MB`;
  }, [batch]);

  // ─── Generation simulation ────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    if (progress.status === 'generating') return;

    setProgress({
      status: 'generating',
      current: 0,
      total: batch.totalImages,
      elapsedMs: 0,
      estimatedRemainingMs: batch.totalImages * 50,
      errors: [],
    });

    onGenerate?.(config);

    // Simulated progress
    const start = Date.now();
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev.current + Math.ceil(batch.totalImages / 20);
        if (next >= batch.totalImages) {
          clearInterval(interval);
          return {
            ...prev,
            status: 'complete',
            current: batch.totalImages,
            elapsedMs: Date.now() - start,
            estimatedRemainingMs: 0,
          };
        }
        const elapsed = Date.now() - start;
        const rate = next / elapsed;
        return {
          ...prev,
          current: next,
          elapsedMs: elapsed,
          estimatedRemainingMs: Math.round((batch.totalImages - next) / rate),
        };
      });
    }, 250);
  }, [batch.totalImages, config, onGenerate, progress.status]);

  const handleExport = useCallback(() => {
    onExportConfig?.(config);
  }, [config, onExportConfig]);

  // ─── Augmentation toggles ─────────────────────────────────────────────

  const toggleAugType = useCallback((type: AugmentationType) => {
    setAugmentation((prev) => ({
      ...prev,
      types: prev.types.includes(type)
        ? prev.types.filter((t) => t !== type)
        : [...prev.types, type],
    }));
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────

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

      {/* Camera Tab */}
      {activeTab === 'camera' && (
        <div className="space-y-2">
          <div className="text-[10px] text-studio-muted">Placement Strategy</div>
          <div className="grid grid-cols-5 gap-1">
            {(Object.keys(PLACEMENT_INFO) as CameraPlacement[]).map((p) => (
              <button
                key={p}
                onClick={() => setCamera((prev) => ({ ...prev, placement: p }))}
                className={`flex flex-col items-center gap-0.5 px-1 py-1.5 rounded text-[10px] transition ${
                  camera.placement === p
                    ? 'bg-studio-accent/20 text-studio-accent'
                    : 'bg-studio-panel/40 text-studio-muted hover:text-studio-text'
                }`}
              >
                <span>{PLACEMENT_INFO[p].icon}</span>
                <span>{PLACEMENT_INFO[p].label}</span>
              </button>
            ))}
          </div>

          <div>
            <div className="flex justify-between text-[10px]">
              <span className="text-studio-muted">Camera Count</span>
              <span className="text-studio-text font-mono">{camera.count}</span>
            </div>
            <input
              type="range"
              min="5"
              max="500"
              step="5"
              value={camera.count}
              onChange={(e) => setCamera((prev) => ({ ...prev, count: parseInt(e.target.value) }))}
              className="w-full accent-studio-accent h-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-studio-muted">Min Distance</div>
              <input
                type="number"
                min="0.5"
                max="50"
                step="0.5"
                value={camera.minDistance}
                onChange={(e) =>
                  setCamera((prev) => ({ ...prev, minDistance: parseFloat(e.target.value) || 1 }))
                }
                className="w-full bg-studio-panel/30 text-studio-text rounded px-2 py-1 text-[10px] outline-none"
              />
            </div>
            <div>
              <div className="text-[10px] text-studio-muted">Max Distance</div>
              <input
                type="number"
                min="1"
                max="100"
                step="0.5"
                value={camera.maxDistance}
                onChange={(e) =>
                  setCamera((prev) => ({ ...prev, maxDistance: parseFloat(e.target.value) || 5 }))
                }
                className="w-full bg-studio-panel/30 text-studio-text rounded px-2 py-1 text-[10px] outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-studio-muted">Height Range</div>
              <span className="text-[9px] text-studio-text font-mono">
                {camera.minHeight.toFixed(1)}m - {camera.maxHeight.toFixed(1)}m
              </span>
            </div>
            <div>
              <div className="text-[10px] text-studio-muted">FOV Range</div>
              <span className="text-[9px] text-studio-text font-mono">
                {camera.fovRange[0]}° - {camera.fovRange[1]}°
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Lighting Tab */}
      {activeTab === 'lighting' && (
        <div className="space-y-2">
          <div className="text-[10px] text-studio-muted">Lighting Mode</div>
          <div className="grid grid-cols-2 gap-1">
            {(Object.keys(LIGHTING_INFO) as LightingMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setLighting((prev) => ({ ...prev, mode }))}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] transition ${
                  lighting.mode === mode
                    ? 'bg-studio-accent/20 text-studio-accent'
                    : 'bg-studio-panel/40 text-studio-muted hover:text-studio-text'
                }`}
              >
                <span>{LIGHTING_INFO[mode].icon}</span>
                <span>{LIGHTING_INFO[mode].label}</span>
              </button>
            ))}
          </div>

          <div>
            <div className="flex justify-between text-[10px]">
              <span className="text-studio-muted">Intensity Range</span>
              <span className="text-studio-text font-mono">
                {lighting.intensityRange[0].toFixed(1)} - {lighting.intensityRange[1].toFixed(1)}
              </span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[10px]">
              <span className="text-studio-muted">Color Temperature (K)</span>
              <span className="text-studio-text font-mono">
                {lighting.colorTemperatureRange[0]}K - {lighting.colorTemperatureRange[1]}K
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-studio-muted">Shadows</span>
            <button
              onClick={() =>
                setLighting((prev) => ({ ...prev, shadowsEnabled: !prev.shadowsEnabled }))
              }
              className={`px-2 py-0.5 rounded text-[10px] transition ${
                lighting.shadowsEnabled
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-studio-panel text-studio-muted'
              }`}
            >
              {lighting.shadowsEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div>
            <div className="flex justify-between text-[10px]">
              <span className="text-studio-muted">Directional Lights</span>
              <span className="text-studio-text font-mono">{lighting.directionalCount}</span>
            </div>
            <input
              type="range"
              min="1"
              max="6"
              step="1"
              value={lighting.directionalCount}
              onChange={(e) =>
                setLighting((prev) => ({ ...prev, directionalCount: parseInt(e.target.value) }))
              }
              className="w-full accent-studio-accent h-1"
            />
          </div>
        </div>
      )}

      {/* Augmentation Tab */}
      {activeTab === 'augmentation' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-studio-muted">Enable Augmentation</span>
            <button
              onClick={() => setAugmentation((prev) => ({ ...prev, enabled: !prev.enabled }))}
              className={`px-2 py-0.5 rounded text-[10px] transition ${
                augmentation.enabled
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-studio-panel text-studio-muted'
              }`}
            >
              {augmentation.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {augmentation.enabled && (
            <>
              <div className="text-[10px] text-studio-muted">Augmentation Types</div>
              <div className="grid grid-cols-3 gap-1">
                {(
                  ['noise', 'blur', 'occlusion', 'colorJitter', 'cropResize'] as AugmentationType[]
                ).map((type) => (
                  <button
                    key={type}
                    onClick={() => toggleAugType(type)}
                    className={`px-1.5 py-1 rounded text-[10px] transition capitalize ${
                      augmentation.types.includes(type)
                        ? 'bg-studio-accent/20 text-studio-accent ring-1 ring-studio-accent/30'
                        : 'bg-studio-panel/30 text-studio-muted hover:text-studio-text'
                    }`}
                  >
                    {type.replace(/([A-Z])/g, ' $1')}
                  </button>
                ))}
              </div>

              {augmentation.types.includes('noise') && (
                <div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-studio-muted">Noise Std Dev</span>
                    <span className="text-studio-text font-mono">
                      {augmentation.noiseStddev.toFixed(3)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.1"
                    step="0.005"
                    value={augmentation.noiseStddev}
                    onChange={(e) =>
                      setAugmentation((prev) => ({
                        ...prev,
                        noiseStddev: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full accent-studio-accent h-1"
                  />
                </div>
              )}

              {augmentation.types.includes('blur') && (
                <div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-studio-muted">Blur Radius</span>
                    <span className="text-studio-text font-mono">
                      {augmentation.blurRadius.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={augmentation.blurRadius}
                    onChange={(e) =>
                      setAugmentation((prev) => ({
                        ...prev,
                        blurRadius: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full accent-studio-accent h-1"
                  />
                </div>
              )}

              {augmentation.types.includes('colorJitter') && (
                <div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-studio-muted">Color Jitter</span>
                    <span className="text-studio-text font-mono">
                      {augmentation.colorJitterRange.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.01"
                    value={augmentation.colorJitterRange}
                    onChange={(e) =>
                      setAugmentation((prev) => ({
                        ...prev,
                        colorJitterRange: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full accent-studio-accent h-1"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Batch Tab */}
      {activeTab === 'batch' && (
        <div className="space-y-2">
          {/* Annotation format */}
          <div className="text-[10px] text-studio-muted">Annotation Format</div>
          <div className="space-y-0.5">
            {(Object.keys(FORMAT_INFO) as AnnotationFormat[]).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setBatch((prev) => ({ ...prev, format: fmt }))}
                className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left transition ${
                  batch.format === fmt
                    ? 'bg-studio-accent/15 ring-1 ring-studio-accent/30'
                    : 'bg-studio-panel/30 hover:bg-studio-panel/50'
                }`}
              >
                <span>{FORMAT_INFO[fmt].icon}</span>
                <div>
                  <div className="text-studio-text text-[10px] font-medium">
                    {FORMAT_INFO[fmt].label}
                  </div>
                  <div className="text-studio-muted text-[9px]">{FORMAT_INFO[fmt].desc}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Total images */}
          <div>
            <div className="flex justify-between text-[10px]">
              <span className="text-studio-muted">Total Images</span>
              <span className="text-studio-text font-mono">
                {batch.totalImages.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min="100"
              max="50000"
              step="100"
              value={batch.totalImages}
              onChange={(e) =>
                setBatch((prev) => ({ ...prev, totalImages: parseInt(e.target.value) }))
              }
              className="w-full accent-studio-accent h-1"
            />
          </div>

          {/* Resolution */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-studio-muted">Width</div>
              <input
                type="number"
                min="256"
                max="4096"
                step="256"
                value={batch.resolution[0]}
                onChange={(e) =>
                  setBatch((prev) => ({
                    ...prev,
                    resolution: [parseInt(e.target.value) || 1024, prev.resolution[1]],
                  }))
                }
                className="w-full bg-studio-panel/30 text-studio-text rounded px-2 py-1 text-[10px] outline-none"
              />
            </div>
            <div>
              <div className="text-[10px] text-studio-muted">Height</div>
              <input
                type="number"
                min="256"
                max="4096"
                step="256"
                value={batch.resolution[1]}
                onChange={(e) =>
                  setBatch((prev) => ({
                    ...prev,
                    resolution: [prev.resolution[0], parseInt(e.target.value) || 1024],
                  }))
                }
                className="w-full bg-studio-panel/30 text-studio-text rounded px-2 py-1 text-[10px] outline-none"
              />
            </div>
          </div>

          {/* Splits */}
          <div className="bg-studio-panel/30 rounded-lg p-2">
            <div className="text-[10px] text-studio-muted mb-1">Data Splits</div>
            <div className="grid grid-cols-3 gap-1 text-[10px]">
              <div className="text-center">
                <div className="text-emerald-400 font-mono">
                  {(batch.trainSplit * 100).toFixed(0)}%
                </div>
                <div className="text-studio-muted">Train ({splitSummary.train})</div>
              </div>
              <div className="text-center">
                <div className="text-amber-400 font-mono">{(batch.valSplit * 100).toFixed(0)}%</div>
                <div className="text-studio-muted">Val ({splitSummary.val})</div>
              </div>
              <div className="text-center">
                <div className="text-blue-400 font-mono">{(batch.testSplit * 100).toFixed(0)}%</div>
                <div className="text-studio-muted">Test ({splitSummary.test})</div>
              </div>
            </div>
          </div>

          {/* Extra channels */}
          <div className="flex gap-1.5 flex-wrap">
            {[
              { key: 'includeDepth' as const, label: 'Depth' },
              { key: 'includeNormals' as const, label: 'Normals' },
              { key: 'includeSegmentation' as const, label: 'Segmentation' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setBatch((prev) => ({ ...prev, [key]: !prev[key] }))}
                className={`px-2 py-1 rounded text-[10px] transition ${
                  batch[key]
                    ? 'bg-studio-accent/20 text-studio-accent ring-1 ring-studio-accent/30'
                    : 'bg-studio-panel/30 text-studio-muted hover:text-studio-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Seed */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-studio-muted">Seed</span>
            <input
              type="number"
              value={batch.seed}
              onChange={(e) =>
                setBatch((prev) => ({ ...prev, seed: parseInt(e.target.value) || 0 }))
              }
              className="w-20 bg-studio-panel/30 text-studio-text rounded px-2 py-1 text-[10px] outline-none font-mono"
            />
          </div>
        </div>
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
