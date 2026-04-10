import React from 'react';
import { CinematicPreset } from './types';
import { PRESET_ICONS, PRESET_DESCRIPTIONS } from './constants';

interface CameraPresetsTabProps {
  applyPreset: (preset: CinematicPreset) => void;
}

export function CameraPresetsTab({ applyPreset }: CameraPresetsTabProps) {
  return (
    <div className="space-y-1">
      {(Object.keys(PRESET_ICONS) as CinematicPreset[]).map((preset) => (
        <button
          key={preset}
          onClick={() => applyPreset(preset)}
          className="w-full flex items-center gap-2 px-2 py-1.5 bg-studio-panel/30 rounded hover:bg-studio-panel/50 transition text-left"
        >
          <span className="text-base">{PRESET_ICONS[preset]}</span>
          <div>
            <div className="text-studio-text text-[11px] font-medium capitalize">
              {preset.replace(/([A-Z])/g, ' $1')}
            </div>
            <div className="text-studio-muted text-[9px]">{PRESET_DESCRIPTIONS[preset]}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
