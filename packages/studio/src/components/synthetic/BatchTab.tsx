import React from 'react';
import type { BatchConfig, AnnotationFormat } from './types';
import { FORMAT_INFO } from './constants';

interface BatchTabProps {
  batch: BatchConfig;
  setBatch: React.Dispatch<React.SetStateAction<BatchConfig>>;
  splitSummary: { train: number; val: number; test: number; };
}

export function BatchTab({ batch, setBatch, splitSummary }: BatchTabProps) {
  return (
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
  );
}
