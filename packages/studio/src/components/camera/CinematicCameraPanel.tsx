'use client';
/**
 * CinematicCameraPanel — Cinematic camera control panel for scene capture
 *
 * TODO-058: Cinematic Camera Control Panel
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

// =============================================================================
// TYPES
// =============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraState {
  position: Vec3;
  target: Vec3;
  fov: number;
  zoom: number;
  roll: number; // degrees
}

export interface DepthOfFieldSettings {
  enabled: boolean;
  aperture: number; // f-stop (1.4 - 22)
  focusDistance: number; // meters
  focalLength: number; // mm (18 - 200)
  bokehScale: number; // 0-5
  bokehShape: 'circle' | 'hexagon' | 'octagon';
}

export type InterpolationMode = 'linear' | 'bezier' | 'catmull-rom' | 'step';

export interface CameraKeyframe {
  id: string;
  time: number; // seconds
  camera: CameraState;
  dof: DepthOfFieldSettings;
  interpolation: InterpolationMode;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export type CinematicPreset = 'crane' | 'steadicam' | 'orbit' | 'flythrough' | 'dollyZoom' | 'whipPan';

export interface CameraPath {
  name: string;
  keyframes: CameraKeyframe[];
  duration: number;
  loop: boolean;
  pathType: InterpolationMode;
}

export interface CinematicCameraPanelProps {
  onCameraUpdate?: (state: CameraState) => void;
  onPathExport?: (path: CameraPath) => void;
  className?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MOVE_STEP = 0.5;
const ROTATE_STEP = 5; // degrees

const PRESET_ICONS: Record<CinematicPreset, string> = {
  crane: '🏗️',
  steadicam: '🎥',
  orbit: '🔄',
  flythrough: '🛩️',
  dollyZoom: '🔍',
  whipPan: '💨',
};

const PRESET_DESCRIPTIONS: Record<CinematicPreset, string> = {
  crane: 'Vertical sweep with smooth arc',
  steadicam: 'Smooth forward tracking shot',
  orbit: '360° orbit around target',
  flythrough: 'Through-space camera flight',
  dollyZoom: 'Hitchcock vertigo effect',
  whipPan: 'Fast horizontal snap',
};

const DEFAULT_CAMERA: CameraState = {
  position: { x: 0, y: 2, z: 5 },
  target: { x: 0, y: 0, z: 0 },
  fov: 50,
  zoom: 1,
  roll: 0,
};

const DEFAULT_DOF: DepthOfFieldSettings = {
  enabled: false,
  aperture: 2.8,
  focusDistance: 5,
  focalLength: 50,
  bokehScale: 1,
  bokehShape: 'circle',
};

// =============================================================================
// HELPERS
// =============================================================================

function generateId(): string {
  return `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function generatePresetKeyframes(preset: CinematicPreset, camera: CameraState): CameraKeyframe[] {
  const base = { ...camera };
  const dof = { ...DEFAULT_DOF };

  switch (preset) {
    case 'crane':
      return [
        { id: generateId(), time: 0, camera: { ...base, position: { ...base.position, y: 0.5 } }, dof, interpolation: 'bezier', easing: 'ease-in-out' },
        { id: generateId(), time: 2, camera: { ...base, position: { ...base.position, y: 4 } }, dof, interpolation: 'bezier', easing: 'ease-in-out' },
        { id: generateId(), time: 4, camera: { ...base, position: { ...base.position, y: 8, z: base.position.z - 2 } }, dof, interpolation: 'bezier', easing: 'ease-out' },
      ];

    case 'steadicam':
      return [
        { id: generateId(), time: 0, camera: { ...base }, dof, interpolation: 'catmull-rom', easing: 'linear' },
        { id: generateId(), time: 1.5, camera: { ...base, position: { ...base.position, z: base.position.z - 2 } }, dof, interpolation: 'catmull-rom', easing: 'linear' },
        { id: generateId(), time: 3, camera: { ...base, position: { ...base.position, z: base.position.z - 4 } }, dof, interpolation: 'catmull-rom', easing: 'linear' },
        { id: generateId(), time: 4.5, camera: { ...base, position: { ...base.position, z: base.position.z - 6 } }, dof, interpolation: 'catmull-rom', easing: 'ease-out' },
      ];

    case 'orbit':
      return Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const radius = Math.sqrt(base.position.x ** 2 + base.position.z ** 2) || 5;
        return {
          id: generateId(),
          time: i * 0.75,
          camera: {
            ...base,
            position: {
              x: Math.sin(angle) * radius,
              y: base.position.y,
              z: Math.cos(angle) * radius,
            },
          },
          dof,
          interpolation: 'catmull-rom' as InterpolationMode,
          easing: 'linear' as const,
        };
      });

    case 'flythrough':
      return [
        { id: generateId(), time: 0, camera: { ...base, position: { x: -10, y: 3, z: 10 }, fov: 65 }, dof, interpolation: 'bezier', easing: 'ease-in' },
        { id: generateId(), time: 1.5, camera: { ...base, position: { x: -3, y: 2, z: 3 }, fov: 55 }, dof, interpolation: 'bezier', easing: 'linear' },
        { id: generateId(), time: 3, camera: { ...base, position: { x: 0, y: 1.5, z: 0.5 }, fov: 40 }, dof, interpolation: 'bezier', easing: 'linear' },
        { id: generateId(), time: 4.5, camera: { ...base, position: { x: 5, y: 3, z: -5 }, fov: 50 }, dof, interpolation: 'bezier', easing: 'ease-out' },
      ];

    case 'dollyZoom':
      return [
        { id: generateId(), time: 0, camera: { ...base, position: { ...base.position, z: 10 }, fov: 20 }, dof: { ...dof, enabled: true, focusDistance: 10 }, interpolation: 'linear', easing: 'linear' },
        { id: generateId(), time: 3, camera: { ...base, position: { ...base.position, z: 2 }, fov: 80 }, dof: { ...dof, enabled: true, focusDistance: 2 }, interpolation: 'linear', easing: 'linear' },
      ];

    case 'whipPan':
      return [
        { id: generateId(), time: 0, camera: { ...base, target: { x: -5, y: 0, z: 0 } }, dof, interpolation: 'bezier', easing: 'ease-in' },
        { id: generateId(), time: 0.3, camera: { ...base, target: { x: 5, y: 0, z: 0 } }, dof, interpolation: 'bezier', easing: 'ease-out' },
      ];

    default:
      return [];
  }
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
  const [activeTab, setActiveTab] = useState<'controls' | 'dof' | 'timeline' | 'presets'>('controls');

  // ─── Camera Movement ──────────────────────────────────────────────────

  const moveCamera = useCallback(
    (axis: 'x' | 'y' | 'z', delta: number) => {
      setCamera((prev) => {
        const next = { ...prev, position: { ...prev.position, [axis]: prev.position[axis] + delta } };
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
      prev.map((kf) => (kf.id === id ? { ...kf, time: Math.max(0, time) } : kf)).sort((a, b) => a.time - b.time)
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
              <button onClick={() => moveCamera('z', -MOVE_STEP)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">
                ← In
              </button>
              <button onClick={() => moveCamera('z', MOVE_STEP)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">
                Out →
              </button>
            </div>

            <div className="text-[10px] text-studio-muted">Truck (X)</div>
            <div className="flex gap-1">
              <button onClick={() => moveCamera('x', -MOVE_STEP)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">
                ← Left
              </button>
              <button onClick={() => moveCamera('x', MOVE_STEP)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">
                Right →
              </button>
            </div>

            <div className="text-[10px] text-studio-muted">Pedestal (Y)</div>
            <div className="flex gap-1">
              <button onClick={() => moveCamera('y', -MOVE_STEP)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">
                ↓ Down
              </button>
              <button onClick={() => moveCamera('y', MOVE_STEP)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">
                ↑ Up
              </button>
            </div>
          </div>

          {/* Pan / Tilt */}
          <div className="space-y-1">
            <div className="text-[10px] text-studio-muted">Pan / Tilt</div>
            <div className="flex gap-1">
              <button onClick={() => rotateCamera('pan', -ROTATE_STEP)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">
                ↻ Pan L
              </button>
              <button onClick={() => rotateCamera('pan', ROTATE_STEP)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">
                Pan R ↺
              </button>
              <button onClick={() => rotateCamera('tilt', ROTATE_STEP)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">
                ↑ Tilt
              </button>
              <button onClick={() => rotateCamera('tilt', -ROTATE_STEP)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">
                ↓ Tilt
              </button>
            </div>
          </div>

          {/* Zoom / FOV */}
          <div className="flex gap-1">
            <button onClick={() => adjustZoom(0.1)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">
              + Zoom
            </button>
            <button onClick={() => adjustZoom(-0.1)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">
              - Zoom
            </button>
            <button onClick={() => adjustFov(-5)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">
              + FOV
            </button>
            <button onClick={() => adjustFov(5)} className="flex-1 px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">
              - FOV
            </button>
          </div>

          <button onClick={resetCamera} className="w-full px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition">
            ↺ Reset Camera
          </button>
        </div>
      )}

      {/* Depth of Field Tab */}
      {activeTab === 'dof' && (
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
                    type="range" min="1.4" max="22" step="0.1"
                    value={dof.aperture}
                    onChange={(e) => setDof((prev) => ({ ...prev, aperture: parseFloat(e.target.value) }))}
                    className="w-full accent-studio-accent h-1"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-studio-muted">Focus Distance</span>
                    <span className="text-studio-text font-mono">{dof.focusDistance.toFixed(1)}m</span>
                  </div>
                  <input
                    type="range" min="0.1" max="100" step="0.1"
                    value={dof.focusDistance}
                    onChange={(e) => setDof((prev) => ({ ...prev, focusDistance: parseFloat(e.target.value) }))}
                    className="w-full accent-studio-accent h-1"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-studio-muted">Focal Length</span>
                    <span className="text-studio-text font-mono">{dof.focalLength}mm</span>
                  </div>
                  <input
                    type="range" min="18" max="200" step="1"
                    value={dof.focalLength}
                    onChange={(e) => setDof((prev) => ({ ...prev, focalLength: parseInt(e.target.value) }))}
                    className="w-full accent-studio-accent h-1"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-studio-muted">Bokeh Scale</span>
                    <span className="text-studio-text font-mono">{dof.bokehScale.toFixed(1)}</span>
                  </div>
                  <input
                    type="range" min="0" max="5" step="0.1"
                    value={dof.bokehScale}
                    onChange={(e) => setDof((prev) => ({ ...prev, bokehScale: parseFloat(e.target.value) }))}
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
      )}

      {/* Timeline Tab */}
      {activeTab === 'timeline' && (
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
                    ({kf.camera.position.x.toFixed(1)}, {kf.camera.position.y.toFixed(1)}, {kf.camera.position.z.toFixed(1)})
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
                    onClick={(e) => { e.stopPropagation(); removeKeyframe(kf.id); }}
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
      )}

      {/* Presets Tab */}
      {activeTab === 'presets' && (
        <div className="space-y-1">
          {(Object.keys(PRESET_ICONS) as CinematicPreset[]).map((preset) => (
            <button
              key={preset}
              onClick={() => applyPreset(preset)}
              className="w-full flex items-center gap-2 px-2 py-1.5 bg-studio-panel/30 rounded hover:bg-studio-panel/50 transition text-left"
            >
              <span className="text-base">{PRESET_ICONS[preset]}</span>
              <div>
                <div className="text-studio-text text-[11px] font-medium capitalize">{preset.replace(/([A-Z])/g, ' $1')}</div>
                <div className="text-studio-muted text-[9px]">{PRESET_DESCRIPTIONS[preset]}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default CinematicCameraPanel;
