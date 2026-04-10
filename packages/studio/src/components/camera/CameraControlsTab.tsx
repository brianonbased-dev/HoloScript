import React from 'react';
import { CameraState } from './types';
import { MOVE_STEP, ROTATE_STEP } from './constants';

interface CameraControlsTabProps {
  camera: CameraState;
  moveCamera: (axis: 'x' | 'y' | 'z', delta: number) => void;
  rotateCamera: (direction: 'pan' | 'tilt', delta: number) => void;
  adjustZoom: (delta: number) => void;
  adjustFov: (delta: number) => void;
  resetCamera: () => void;
}

export function CameraControlsTab({
  camera,
  moveCamera,
  rotateCamera,
  adjustZoom,
  adjustFov,
  resetCamera,
}: CameraControlsTabProps) {
  return (
    <div className="space-y-2">
      {/* Position display */}
      <div className="bg-studio-panel/30 rounded-lg p-2">
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div key={axis}>
              <span className="text-studio-muted">{axis.toUpperCase()}</span>
              <br />
              <span className="text-studio-text font-mono">{camera.position[axis].toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dolly / Truck / Pedestal */}
      <div className="space-y-1">
        <div className="text-[10px] text-studio-muted">Dolly (Z)</div>
        <div className="flex gap-1">
          <button
            onClick={() => moveCamera('z', -MOVE_STEP)}
            className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          >
            ← In
          </button>
          <button
            onClick={() => moveCamera('z', MOVE_STEP)}
            className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          >
            Out →
          </button>
        </div>

        <div className="text-[10px] text-studio-muted">Truck (X)</div>
        <div className="flex gap-1">
          <button
            onClick={() => moveCamera('x', -MOVE_STEP)}
            className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          >
            ← Left
          </button>
          <button
            onClick={() => moveCamera('x', MOVE_STEP)}
            className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          >
            Right →
          </button>
        </div>

        <div className="text-[10px] text-studio-muted">Pedestal (Y)</div>
        <div className="flex gap-1">
          <button
            onClick={() => moveCamera('y', -MOVE_STEP)}
            className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          >
            ↓ Down
          </button>
          <button
            onClick={() => moveCamera('y', MOVE_STEP)}
            className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          >
            ↑ Up
          </button>
        </div>
      </div>

      {/* Pan / Tilt */}
      <div className="space-y-1">
        <div className="text-[10px] text-studio-muted">Pan / Tilt</div>
        <div className="flex gap-1">
          <button
            onClick={() => rotateCamera('pan', -ROTATE_STEP)}
            className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          >
            ↻ Pan L
          </button>
          <button
            onClick={() => rotateCamera('pan', ROTATE_STEP)}
            className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          >
            Pan R ↺
          </button>
          <button
            onClick={() => rotateCamera('tilt', ROTATE_STEP)}
            className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          >
            ↑ Tilt
          </button>
          <button
            onClick={() => rotateCamera('tilt', -ROTATE_STEP)}
            className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          >
            ↓ Tilt
          </button>
        </div>
      </div>

      {/* Zoom / FOV */}
      <div className="flex gap-1">
        <button
          onClick={() => adjustZoom(0.1)}
          className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          + Zoom
        </button>
        <button
          onClick={() => adjustZoom(-0.1)}
          className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          - Zoom
        </button>
        <button
          onClick={() => adjustFov(-5)}
          className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          + FOV
        </button>
        <button
          onClick={() => adjustFov(5)}
          className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          - FOV
        </button>
      </div>

      <button
        onClick={resetCamera}
        className="w-full px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
      >
        ↺ Reset Camera
      </button>
    </div>
  );
}
