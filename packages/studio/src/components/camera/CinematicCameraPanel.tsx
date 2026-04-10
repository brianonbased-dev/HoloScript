'use client';
/**
 * CinematicCameraPanel — Cinematic camera control panel for scene capture
 *
 *
 * Features:
 * - Dolly, truck, pedestal, pan, tilt, zoom controls
 * - Keyframe timeline with add/remove/interpolation
 * - Camera path visualization data (bezier, linear, catmull-rom)
 * - Depth of field controls (aperture, focus distance, bokeh)
 * - Preset cinematic moves (crane, steadicam, orbit, flythrough)
 * - Export camera path as JSON for R3F / Three.js consumption
 *
 * @version 1.0.0
 */
import React, { useState, useCallback, useMemo } from 'react';

import {
  CameraState,
  DepthOfFieldSettings,
  InterpolationMode,
  CameraKeyframe,
  CinematicPreset,
  CameraPath,
} from './types';
import { DEFAULT_CAMERA, DEFAULT_DOF } from './constants';
import { generateId, generatePresetKeyframes, clamp } from './presetUtils';
import { CameraControlsTab } from './CameraControlsTab';
import { DofControlsTab } from './DofControlsTab';
import { CameraTimelineTab } from './CameraTimelineTab';
import { CameraPresetsTab } from './CameraPresetsTab';

export interface CinematicCameraPanelProps {
  onCameraUpdate?: (state: CameraState) => void;
  onPathExport?: (path: CameraPath) => void;
  className?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CinematicCameraPanel({
  onCameraUpdate,
  onPathExport,
  className = '',
}: CinematicCameraPanelProps) {
  const [camera, setCamera] = useState<CameraState>(DEFAULT_CAMERA);
  const [dof, setDof] = useState<DepthOfFieldSettings>(DEFAULT_DOF);
  const [keyframes, setKeyframes] = useState<CameraKeyframe[]>([]);
  const [selectedKeyframe, setSelectedKeyframe] = useState<string | null>(null);
  const [pathName, setPathName] = useState('Untitled Path');
  const [loop, setLoop] = useState(false);
  const [pathType, setPathType] = useState<InterpolationMode>('catmull-rom');
  const [activeTab, setActiveTab] = useState<'controls' | 'dof' | 'timeline' | 'presets'>(
    'controls'
  );

  // ─── Camera Movement ──────────────────────────────────────────────────

  const moveCamera = useCallback(
    (axis: 'x' | 'y' | 'z', delta: number) => {
      setCamera((prev) => {
        const next = {
          ...prev,
          position: { ...prev.position, [axis]: prev.position[axis] + delta },
        };
        onCameraUpdate?.(next);
        return next;
      });
    },
    [onCameraUpdate]
  );

  const rotateCamera = useCallback(
    (direction: 'pan' | 'tilt', delta: number) => {
      setCamera((prev) => {
        const next = { ...prev };
        if (direction === 'pan') {
          // Rotate target around Y axis
          const dx = next.target.x - next.position.x;
          const dz = next.target.z - next.position.z;
          const rad = (delta * Math.PI) / 180;
          next.target = {
            ...next.target,
            x: next.position.x + dx * Math.cos(rad) - dz * Math.sin(rad),
            z: next.position.z + dx * Math.sin(rad) + dz * Math.cos(rad),
          };
        } else {
          next.target = { ...next.target, y: next.target.y + delta * 0.05 };
        }
        onCameraUpdate?.(next);
        return next;
      });
    },
    [onCameraUpdate]
  );

  const adjustFov = useCallback(
    (delta: number) => {
      setCamera((prev) => {
        const next = { ...prev, fov: clamp(prev.fov + delta, 10, 150) };
        onCameraUpdate?.(next);
        return next;
      });
    },
    [onCameraUpdate]
  );

  const adjustZoom = useCallback(
    (delta: number) => {
      setCamera((prev) => {
        const next = { ...prev, zoom: clamp(prev.zoom + delta, 0.1, 10) };
        onCameraUpdate?.(next);
        return next;
      });
    },
    [onCameraUpdate]
  );

  // ─── Keyframe Management ─────────────────────────────────────────────

  const addKeyframe = useCallback(() => {
    const lastTime = keyframes.length > 0 ? keyframes[keyframes.length - 1].time : -1;
    const kf: CameraKeyframe = {
      id: generateId(),
      time: lastTime + 1,
      camera: { ...camera },
      dof: { ...dof },
      interpolation: pathType,
      easing: 'ease-in-out',
    };
    setKeyframes((prev) => [...prev, kf].sort((a, b) => a.time - b.time));
  }, [camera, dof, keyframes, pathType]);

  const removeKeyframe = useCallback((id: string) => {
    setKeyframes((prev) => prev.filter((kf) => kf.id !== id));
    setSelectedKeyframe((prev) => (prev === id ? null : prev));
  }, []);

  const updateKeyframeTime = useCallback((id: string, time: number) => {
    setKeyframes((prev) =>
      prev
        .map((kf) => (kf.id === id ? { ...kf, time: Math.max(0, time) } : kf))
        .sort((a, b) => a.time - b.time)
    );
  }, []);

  const goToKeyframe = useCallback(
    (id: string) => {
      const kf = keyframes.find((k) => k.id === id);
      if (kf) {
        setCamera(kf.camera);
        setDof(kf.dof);
        setSelectedKeyframe(id);
        onCameraUpdate?.(kf.camera);
      }
    },
    [keyframes, onCameraUpdate]
  );

  // ─── Presets ──────────────────────────────────────────────────────────

  const applyPreset = useCallback(
    (preset: CinematicPreset) => {
      const kfs = generatePresetKeyframes(preset, camera);
      setKeyframes(kfs);
    },
    [camera]
  );

  // ─── Export ───────────────────────────────────────────────────────────

  const duration = useMemo(() => {
    if (keyframes.length === 0) return 0;
    return keyframes[keyframes.length - 1].time;
  }, [keyframes]);

  const exportPath = useCallback(() => {
    const path: CameraPath = {
      name: pathName,
      keyframes,
      duration,
      loop,
      pathType,
    };
    onPathExport?.(path);
  }, [pathName, keyframes, duration, loop, pathType, onPathExport]);

  const resetCamera = useCallback(() => {
    setCamera(DEFAULT_CAMERA);
    setDof(DEFAULT_DOF);
    setKeyframes([]);
    setSelectedKeyframe(null);
    onCameraUpdate?.(DEFAULT_CAMERA);
  }, [onCameraUpdate]);

  // ─── Render ───────────────────────────────────────────────────────────

  const tabs = ['controls', 'dof', 'timeline', 'presets'] as const;

  return (
    <div className={`p-3 space-y-3 text-xs ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🎬 Cinematic Camera</h3>
        <span className="text-[10px] text-studio-muted">
          FOV {camera.fov.toFixed(0)}° · {keyframes.length} keyframes
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
            {tab === 'dof' ? 'DoF' : tab}
          </button>
        ))}
      </div>

      {/* Controls Tab */}
      {activeTab === 'controls' && (
        <CameraControlsTab
          camera={camera}
          moveCamera={moveCamera}
          rotateCamera={rotateCamera}
          adjustZoom={adjustZoom}
          adjustFov={adjustFov}
          resetCamera={resetCamera}
        />
      )}

      {/* Depth of Field Tab */}
      {activeTab === 'dof' && (
        <DofControlsTab dof={dof} setDof={setDof} />
      )}

      {/* Timeline Tab */}
      {activeTab === 'timeline' && (
        <CameraTimelineTab
          pathName={pathName}
          setPathName={setPathName}
          loop={loop}
          setLoop={setLoop}
          pathType={pathType}
          setPathType={setPathType}
          keyframes={keyframes}
          addKeyframe={addKeyframe}
          exportPath={exportPath}
          selectedKeyframe={selectedKeyframe}
          goToKeyframe={goToKeyframe}
          updateKeyframeTime={updateKeyframeTime}
          removeKeyframe={removeKeyframe}
          duration={duration}
        />
      )}

      {/* Presets Tab */}
      {activeTab === 'presets' && <CameraPresetsTab applyPreset={applyPreset} />}
    </div>
  );
}

export default CinematicCameraPanel;
