'use client';

/**
 * FilmStudioPanel — Film storyboard with shot types, camera angles, and scene timeline.
 */

import { useState, useCallback } from 'react';
import { Film, Camera, Clock, Plus, Trash2, ChevronLeft, ChevronRight, Eye } from 'lucide-react';

export type ShotType =
  | 'wide'
  | 'medium'
  | 'close-up'
  | 'extreme-close'
  | 'over-shoulder'
  | 'pov'
  | 'aerial'
  | 'tracking';
export type CameraMove = 'static' | 'pan' | 'tilt' | 'dolly' | 'crane' | 'handheld' | 'steadicam';

export interface Shot {
  id: string;
  number: number;
  description: string;
  shotType: ShotType;
  camera: CameraMove;
  duration: number; // seconds
  dialogue: string;
  action: string;
  notes: string;
  transition: 'cut' | 'dissolve' | 'fade' | 'wipe';
}

export interface Scene {
  id: string;
  name: string;
  location: string;
  timeOfDay: string;
  shots: Shot[];
}

const SHOT_COLORS: Record<ShotType, string> = {
  wide: '#3b82f6',
  medium: '#22c55e',
  'close-up': '#f59e0b',
  'extreme-close': '#ef4444',
  'over-shoulder': '#8b5cf6',
  pov: '#ec4899',
  aerial: '#06b6d4',
  tracking: '#14b8a6',
};

const DEMO_SCENE: Scene = {
  id: '1',
  name: 'The Confrontation',
  location: 'Rooftop — Night',
  timeOfDay: 'Night',
  shots: [
    {
      id: 's1',
      number: 1,
      description: 'City skyline establishing shot',
      shotType: 'wide',
      camera: 'crane',
      duration: 4,
      dialogue: '',
      action: 'Camera descends to rooftop',
      notes: 'Score builds',
      transition: 'cut',
    },
    {
      id: 's2',
      number: 2,
      description: 'Hero steps through door',
      shotType: 'medium',
      camera: 'steadicam',
      duration: 3,
      dialogue: '',
      action: 'Door opens, hero silhouette',
      notes: 'Dramatic lighting',
      transition: 'cut',
    },
    {
      id: 's3',
      number: 3,
      description: 'Villain turns around',
      shotType: 'over-shoulder',
      camera: 'static',
      duration: 2,
      dialogue: '"I\'ve been waiting."',
      action: 'Slow turn',
      notes: 'Rack focus',
      transition: 'cut',
    },
    {
      id: 's4',
      number: 4,
      description: 'Hero reaction',
      shotType: 'close-up',
      camera: 'static',
      duration: 1.5,
      dialogue: '',
      action: 'Expression shifts',
      notes: '',
      transition: 'cut',
    },
    {
      id: 's5',
      number: 5,
      description: 'Wide two-shot standoff',
      shotType: 'wide',
      camera: 'dolly',
      duration: 5,
      dialogue: '"This ends tonight."',
      action: 'Slow dolly in',
      notes: 'Music drops',
      transition: 'dissolve',
    },
  ],
};

export function FilmStudioPanel() {
  const [scene, _setScene] = useState<Scene>(DEMO_SCENE);
  const [selectedShot, setSelectedShot] = useState<number>(0);

  const shot = scene.shots[selectedShot];
  const totalDuration = scene.shots.reduce((s, sh) => s + sh.duration, 0);

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <Film className="h-4 w-4 text-rose-400" />
        <span className="text-sm font-semibold text-studio-text">Storyboard</span>
      </div>

      {/* Scene Info */}
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-1.5">
        <span className="text-xs text-studio-text">{scene.name}</span>
        <span className="text-[10px] text-studio-muted">
          {scene.location} · {scene.shots.length} shots · {totalDuration.toFixed(1)}s
        </span>
      </div>

      {/* Shot Timeline */}
      <div className="flex border-b border-studio-border">
        {scene.shots.map((sh, i) => (
          <button
            key={sh.id}
            onClick={() => setSelectedShot(i)}
            className={`flex-none relative transition ${selectedShot === i ? 'ring-2 ring-rose-400' : ''}`}
            style={{ width: `${(sh.duration / totalDuration) * 100}%`, minWidth: 20 }}
          >
            <div
              className="h-6"
              style={{ background: SHOT_COLORS[sh.shotType] + (selectedShot === i ? 'cc' : '66') }}
            />
            <div className="text-[7px] text-center text-studio-muted truncate px-0.5">
              {sh.number}
            </div>
          </button>
        ))}
      </div>

      {/* Shot Navigation */}
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-1">
        <button
          onClick={() => setSelectedShot(Math.max(0, selectedShot - 1))}
          disabled={selectedShot === 0}
          className="text-studio-muted disabled:opacity-20"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[10px] text-studio-muted">
          Shot {selectedShot + 1} / {scene.shots.length}
        </span>
        <button
          onClick={() => setSelectedShot(Math.min(scene.shots.length - 1, selectedShot + 1))}
          disabled={selectedShot >= scene.shots.length - 1}
          className="text-studio-muted disabled:opacity-20"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Shot Detail */}
      {shot && (
        <div className="flex flex-col gap-2 px-3 py-2">
          <div className="text-xs font-semibold text-studio-text">
            #{shot.number}: {shot.description}
          </div>
          <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
            <div
              className="rounded p-1"
              style={{
                background: SHOT_COLORS[shot.shotType] + '20',
                color: SHOT_COLORS[shot.shotType],
              }}
            >
              {shot.shotType}
            </div>
            <div className="rounded bg-studio-panel p-1 text-studio-muted">{shot.camera}</div>
            <div className="rounded bg-studio-panel p-1 text-studio-muted">{shot.duration}s</div>
          </div>
          {shot.action && (
            <div className="text-[11px] text-studio-muted">
              <span className="text-studio-muted/50">Action:</span> {shot.action}
            </div>
          )}
          {shot.dialogue && (
            <div className="text-[11px] text-amber-400 italic">"{shot.dialogue}"</div>
          )}
          {shot.notes && <div className="text-[10px] text-studio-muted/50">📝 {shot.notes}</div>}
          <div className="text-[10px] text-studio-muted/30">→ {shot.transition}</div>
        </div>
      )}

      {/* Shot Type Legend */}
      <div className="border-t border-studio-border px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {Object.entries(SHOT_COLORS).map(([type, color]) => (
            <span key={type} className="flex items-center gap-0.5 text-[8px] text-studio-muted">
              <span className="h-2 w-2 rounded" style={{ background: color }} />
              {type}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default FilmStudioPanel;
