import React from 'react';
import type { LightingConfig, LightingMode } from './types';
import { LIGHTING_INFO } from './constants';

interface LightingTabProps {
  lighting: LightingConfig;
  setLighting: React.Dispatch<React.SetStateAction<LightingConfig>>;
}

export function LightingTab({ lighting, setLighting }: LightingTabProps) {
  return (
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
  );
}
