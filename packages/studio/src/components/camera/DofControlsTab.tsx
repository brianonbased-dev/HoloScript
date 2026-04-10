import React from 'react';
import { DepthOfFieldSettings } from './types';

interface DofControlsTabProps {
  dof: DepthOfFieldSettings;
  setDof: React.Dispatch<React.SetStateAction<DepthOfFieldSettings>>;
}

export function DofControlsTab({ dof, setDof }: DofControlsTabProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-studio-muted">Enable DoF</span>
        <button
          onClick={() => setDof((prev) => ({ ...prev, enabled: !prev.enabled }))}
          className={`px-2 py-0.5 rounded text-[10px] transition ${
            dof.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-studio-panel text-studio-muted'
          }`}
        >
          {dof.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {dof.enabled && (
        <>
          <div className="space-y-1.5">
            <div>
              <div className="flex justify-between text-[10px]">
                <span className="text-studio-muted">Aperture (f-stop)</span>
                <span className="text-studio-text font-mono">f/{dof.aperture.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="1.4"
                max="22"
                step="0.1"
                value={dof.aperture}
                onChange={(e) =>
                  setDof((prev) => ({ ...prev, aperture: parseFloat(e.target.value) }))
                }
                className="w-full accent-studio-accent h-1"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px]">
                <span className="text-studio-muted">Focus Distance</span>
                <span className="text-studio-text font-mono">{dof.focusDistance.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="100"
                step="0.1"
                value={dof.focusDistance}
                onChange={(e) =>
                  setDof((prev) => ({ ...prev, focusDistance: parseFloat(e.target.value) }))
                }
                className="w-full accent-studio-accent h-1"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px]">
                <span className="text-studio-muted">Focal Length</span>
                <span className="text-studio-text font-mono">{dof.focalLength}mm</span>
              </div>
              <input
                type="range"
                min="18"
                max="200"
                step="1"
                value={dof.focalLength}
                onChange={(e) =>
                  setDof((prev) => ({ ...prev, focalLength: parseInt(e.target.value) }))
                }
                className="w-full accent-studio-accent h-1"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px]">
                <span className="text-studio-muted">Bokeh Scale</span>
                <span className="text-studio-text font-mono">{dof.bokehScale.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={dof.bokehScale}
                onChange={(e) =>
                  setDof((prev) => ({ ...prev, bokehScale: parseFloat(e.target.value) }))
                }
                className="w-full accent-studio-accent h-1"
              />
            </div>

            <div>
              <div className="text-[10px] text-studio-muted mb-1">Bokeh Shape</div>
              <div className="flex gap-1">
                {(['circle', 'hexagon', 'octagon'] as const).map((shape) => (
                  <button
                    key={shape}
                    onClick={() => setDof((prev) => ({ ...prev, bokehShape: shape }))}
                    className={`flex-1 px-2 py-1 rounded text-[10px] capitalize transition ${
                      dof.bokehShape === shape
                        ? 'bg-studio-accent/20 text-studio-accent'
                        : 'bg-studio-panel text-studio-muted hover:text-studio-text'
                    }`}
                  >
                    {shape}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
