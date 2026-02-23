'use client';

/**
 * KeyframeEditor — expanded timeline panel: ruler, track lanes, diamond keyframes.
 */

import { useRef, useCallback, useState } from 'react';
import { Timer, X, Play, Pause, Square, Plus, Trash2 } from 'lucide-react';
import { useKeyframes } from '@/hooks/useKeyframes';
import { useSceneStore } from '@/lib/store';

const RULER_W = 480; // px width of timeline
const TRACK_H = 28;  // px height per track lane
const HEADER_W = 120; // px width of track label column

function timeToX(t: number, duration: number) { return (t / duration) * RULER_W; }
function xToTime(x: number, duration: number) { return Math.max(0, (x / RULER_W) * duration); }

interface KeyframeEditorProps { onClose: () => void; }

export function KeyframeEditor({ onClose }: KeyframeEditorProps) {
  const code = useSceneStore((s) => s.code) ?? '';
  const { tracks, currentTime, playState, duration, setDuration, play, pause, stop, scrub, addKeyframe, deleteKeyframe, reload, loading } = useKeyframes();

  const [addForm, setAddForm] = useState<{ open: boolean; obj: string; prop: string; value: string }>({ open: false, obj: '', prop: 'position.x', value: '0' });
  const rulerRef = useRef<HTMLDivElement>(null);

  // Parse object names from code for the add-keyframe form
  const objectNames = [...(code.matchAll(/^object\s+"([^"]+)"/gm))].map((m) => m[1] ?? '').filter(Boolean);

  const handleRulerClick = useCallback((e: React.MouseEvent) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    scrub(xToTime(x, duration));
  }, [scrub, duration]);

  const handleAddKF = async () => {
    if (!addForm.obj || !addForm.prop) return;
    await addKeyframe(addForm.obj, addForm.prop, currentTime, parseFloat(addForm.value) || 0);
    setAddForm((f) => ({ ...f, open: false }));
    reload();
  };

  const tickInterval = duration <= 10 ? 1 : duration <= 30 ? 5 : 10;
  const ticks = Array.from({ length: Math.floor(duration / tickInterval) + 1 }, (_, i) => i * tickInterval);

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Timer className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Animation Keyframes</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Transport + time */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2">
        <button onClick={playState === 'playing' ? pause : play}
          className="flex h-6 w-6 items-center justify-center rounded-lg bg-studio-accent text-white hover:brightness-110">
          {playState === 'playing' ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </button>
        <button onClick={stop} className="flex h-6 w-6 items-center justify-center rounded-lg border border-studio-border text-studio-muted hover:text-studio-text">
          <Square className="h-3 w-3" />
        </button>
        <span className="text-[11px] font-mono text-studio-accent">{currentTime.toFixed(2)}s</span>
        <div className="ml-auto flex items-center gap-1.5 text-[9px] text-studio-muted">
          <span>dur:</span>
          <input type="number" value={duration} onChange={(e) => setDuration(Math.max(1, Number(e.target.value)))}
            className="w-10 rounded border border-studio-border bg-studio-surface px-1 py-0.5 text-[9px] outline-none focus:border-studio-accent" />
          <span>s</span>
        </div>
        <button onClick={() => setAddForm((f) => ({ ...f, open: !f.open }))}
          className="flex items-center gap-1 rounded-lg border border-studio-border px-2 py-0.5 text-[9px] text-studio-muted hover:text-studio-text">
          <Plus className="h-2.5 w-2.5" /> KF
        </button>
      </div>

      {/* Add keyframe form */}
      {addForm.open && (
        <div className="shrink-0 border-b border-studio-border p-2 space-y-1.5 bg-studio-surface/40">
          <p className="text-[9px] text-studio-muted font-semibold">Add Keyframe at {currentTime.toFixed(2)}s</p>
          <div className="flex gap-1.5">
            <select value={addForm.obj} onChange={(e) => setAddForm((f) => ({ ...f, obj: e.target.value }))}
              className="flex-1 rounded border border-studio-border bg-studio-surface px-1.5 py-1 text-[9px] outline-none focus:border-studio-accent text-studio-text">
              <option value="">Object…</option>
              {objectNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={addForm.prop} onChange={(e) => setAddForm((f) => ({ ...f, prop: e.target.value }))}
              className="flex-1 rounded border border-studio-border bg-studio-surface px-1.5 py-1 text-[9px] outline-none focus:border-studio-accent text-studio-text">
              {['position.x', 'position.y', 'position.z', 'rotation.x', 'rotation.y', 'rotation.z', 'scale.x', 'scale.y', 'scale.z', 'opacity'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input type="number" value={addForm.value} onChange={(e) => setAddForm((f) => ({ ...f, value: e.target.value }))}
              className="w-14 rounded border border-studio-border bg-studio-surface px-1.5 py-1 text-[9px] outline-none focus:border-studio-accent text-studio-text" placeholder="val" />
            <button onClick={handleAddKF} className="rounded-lg bg-studio-accent px-2 py-1 text-[9px] font-semibold text-white hover:brightness-110">Add</button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex flex-1 flex-col overflow-auto">
        {/* Ruler row */}
        <div className="flex shrink-0">
          <div className="shrink-0 border-b border-r border-studio-border bg-studio-panel" style={{ width: HEADER_W }} />
          <div ref={rulerRef} className="relative shrink-0 cursor-col-resize border-b border-studio-border bg-studio-surface/60"
            style={{ width: RULER_W, height: 20 }} onClick={handleRulerClick}>
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 flex flex-col items-center" style={{ left: timeToX(t, duration) }}>
                <div className="h-2 w-px bg-studio-border" />
                <span className="text-[6px] text-studio-muted">{t}s</span>
              </div>
            ))}
            {/* Playhead */}
            <div className="pointer-events-none absolute top-0 h-full w-px bg-studio-accent" style={{ left: timeToX(currentTime, duration) }}>
              <div className="absolute -top-0.5 left-0 -translate-x-1/2 h-2 w-2 rounded-full bg-studio-accent" />
            </div>
          </div>
        </div>

        {/* Track lanes */}
        {loading && <p className="py-4 text-center text-[10px] text-studio-muted animate-pulse">Loading…</p>}
        {!loading && tracks.length === 0 && (
          <p className="py-6 text-center text-[10px] text-studio-muted">No tracks yet. Add a keyframe above.</p>
        )}
        {tracks.map((track) => (
          <div key={track.id} className="flex shrink-0 border-b border-studio-border" style={{ height: TRACK_H }}>
            {/* Label */}
            <div className="shrink-0 flex items-center overflow-hidden border-r border-studio-border bg-studio-surface/40 px-2"
              style={{ width: HEADER_W }}>
              <span className="truncate text-[8px] text-studio-text">{track.name}</span>
            </div>
            {/* Lane */}
            <div className="relative flex-1 bg-studio-panel/60" onClick={handleRulerClick} style={{ width: RULER_W }}>
              {track.keyframes.map((kf) => (
                <div key={kf.id}
                  title={`${kf.value} @ ${kf.time.toFixed(2)}s`}
                  style={{ left: timeToX(kf.time, duration) }}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 group">
                  <div className="h-3 w-3 rotate-45 border border-studio-accent bg-studio-accent/60 group-hover:bg-studio-accent transition" />
                  <button onClick={(e) => { e.stopPropagation(); deleteKeyframe(kf.id); }}
                    className="absolute -right-2 -top-2 hidden group-hover:flex h-3 w-3 items-center justify-center rounded-full bg-red-500">
                    <X className="h-2 w-2 text-white" />
                  </button>
                </div>
              ))}
              {/* Playhead line on lane */}
              <div className="pointer-events-none absolute top-0 h-full w-px bg-studio-accent/30"
                style={{ left: timeToX(currentTime, duration) }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
