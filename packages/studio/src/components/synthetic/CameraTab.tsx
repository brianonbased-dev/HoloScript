import React from 'react';
import type { CameraConfig, CameraPlacement } from './types';
import { PLACEMENT_INFO } from './constants';

interface CameraTabProps {
  camera: CameraConfig;
  setCamera: React.Dispatch<React.SetStateAction<CameraConfig>>;
}

export function CameraTab({ camera, setCamera }: CameraTabProps) {
  return (
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
  );
}
