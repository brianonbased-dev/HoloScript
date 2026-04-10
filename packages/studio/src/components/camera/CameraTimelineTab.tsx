import React from 'react';
import { CameraKeyframe, InterpolationMode } from './types';

interface CameraTimelineTabProps {
  pathName: string;
  setPathName: React.Dispatch<React.SetStateAction<string>>;
  loop: boolean;
  setLoop: React.Dispatch<React.SetStateAction<boolean>>;
  pathType: InterpolationMode;
  setPathType: React.Dispatch<React.SetStateAction<InterpolationMode>>;
  keyframes: CameraKeyframe[];
  addKeyframe: () => void;
  exportPath: () => void;
  selectedKeyframe: string | null;
  goToKeyframe: (id: string) => void;
  updateKeyframeTime: (id: string, time: number) => void;
  removeKeyframe: (id: string) => void;
  duration: number;
}

export function CameraTimelineTab({
  pathName,
  setPathName,
  loop,
  setLoop,
  pathType,
  setPathType,
  keyframes,
  addKeyframe,
  exportPath,
  selectedKeyframe,
  goToKeyframe,
  updateKeyframeTime,
  removeKeyframe,
  duration,
}: CameraTimelineTabProps) {
  return (
    <div className="space-y-2">
      {/* Path config */}
      <div className="flex gap-1.5 items-center">
        <input
          type="text"
          value={pathName}
          onChange={(e) => setPathName(e.target.value)}
          className="flex-1 bg-studio-panel/30 text-studio-text rounded px-2 py-1 text-[10px] outline-none focus:ring-1 ring-studio-accent/40"
          placeholder="Path name..."
        />
        <button
          onClick={() => setLoop((prev) => !prev)}
          className={`px-2 py-1 rounded text-[10px] transition ${
            loop ? 'bg-studio-accent/20 text-studio-accent' : 'bg-studio-panel text-studio-muted'
          }`}
        >
          {loop ? '↻ Loop' : '→ Once'}
        </button>
      </div>

      {/* Interpolation mode */}
      <div className="flex gap-0.5">
        {(['linear', 'bezier', 'catmull-rom'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setPathType(mode)}
            className={`flex-1 px-1 py-1 rounded text-[10px] transition ${
              pathType === mode
                ? 'bg-studio-accent/20 text-studio-accent'
                : 'bg-studio-panel/40 text-studio-muted hover:text-studio-text'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Add keyframe */}
      <div className="flex gap-1">
        <button
          onClick={addKeyframe}
          className="flex-1 px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          + Add Keyframe
        </button>
        <button
          onClick={exportPath}
          disabled={keyframes.length < 2}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition disabled:opacity-50"
        >
          Export
        </button>
      </div>

      {/* Keyframe list */}
      <div className="space-y-0.5 max-h-[150px] overflow-y-auto">
        {keyframes.length === 0 && (
          <p className="text-studio-muted text-center py-3 text-[10px]">
            Position camera and add keyframes to build a path.
          </p>
        )}
        {keyframes.map((kf, idx) => (
          <div
            key={kf.id}
            onClick={() => goToKeyframe(kf.id)}
            className={`
              flex items-center justify-between rounded px-2 py-1 cursor-pointer transition
              ${selectedKeyframe === kf.id ? 'bg-studio-accent/15 ring-1 ring-studio-accent/30' : 'bg-studio-panel/30 hover:bg-studio-panel/50'}
            `}
          >
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-studio-accent font-mono w-4">{idx + 1}</span>
              <span className="text-studio-muted font-mono">{kf.time.toFixed(1)}s</span>
              <span className="text-studio-text">
                ({kf.camera.position.x.toFixed(1)}, {kf.camera.position.y.toFixed(1)},{' '}
                {kf.camera.position.z.toFixed(1)})
              </span>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={kf.time}
                onChange={(e) => updateKeyframeTime(kf.id, parseFloat(e.target.value) || 0)}
                onClick={(e) => e.stopPropagation()}
                className="w-10 bg-studio-panel/50 text-studio-text rounded px-1 py-0.5 text-[9px] font-mono outline-none"
                step="0.1"
                min="0"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeKeyframe(kf.id);
                }}
                className="text-studio-muted hover:text-red-400 transition text-[10px]"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Duration summary */}
      {keyframes.length > 0 && (
        <div className="text-[10px] text-studio-muted text-center">
          Duration: {duration.toFixed(1)}s · {keyframes.length} keyframes · {pathType}
        </div>
      )}
    </div>
  );
}
