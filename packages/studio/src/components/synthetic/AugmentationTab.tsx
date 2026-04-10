import React from 'react';
import type { AugmentationConfig, AugmentationType } from './types';

interface AugmentationTabProps {
  augmentation: AugmentationConfig;
  setAugmentation: React.Dispatch<React.SetStateAction<AugmentationConfig>>;
  toggleAugType: (type: AugmentationType) => void;
}

export function AugmentationTab({ augmentation, setAugmentation, toggleAugType }: AugmentationTabProps) {
  return (
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
  );
}
