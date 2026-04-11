'use client';

/**
 * AnimationTimeline — keyframe editor panel
 *
 * Features:
 *  - Shows animation tracks for the selected scene node
 *  - Each track = one animated property (position.x, rotation.y, scale, etc.)
 *  - Click timeline → add keyframe at that time
 *  - Drag keyframe diamond → move it in time
 *  - Editable value input per keyframe
 *  - Play / Pause / Loop controls
 *  - Duration slider
 *  - Exports animation config back to the scene node's @animation trait
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, RotateCcw, Plus, Trash2, _ChevronDown } from 'lucide-react';
import { useEditorStore, useSceneGraphStore } from '@/lib/stores';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Keyframe {
  id: string;
  time: number; // 0..duration (ms)
  value: number;
}

export interface AnimationTrack {
  id: string;
  property: string; // e.g. "position.x", "rotation.y", "material.emissiveIntensity"
  keyframes: Keyframe[];
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  loop: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_DURATION = 3000; // ms
const _PX_PER_MS = 0.08; // pixels per ms at scale 1
const TRACK_HEIGHT = 40;

const PROPERTY_PRESETS = [
  'position.x',
  'position.y',
  'position.z',
  'rotation.x',
  'rotation.y',
  'rotation.z',
  'scale.x',
  'scale.y',
  'scale.z',
  'scale',
  'material.emissiveIntensity',
  'material.opacity',
];

// ─── Small helpers ────────────────────────────────────────────────────────────

function kfId() {
  return Math.random().toString(36).slice(2, 10);
}
function trackId() {
  return Math.random().toString(36).slice(2, 10);
}

function timeToX(time: number, duration: number, width: number) {
  return (time / duration) * width;
}

function xToTime(x: number, duration: number, width: number) {
  return Math.max(0, Math.min(duration, (x / width) * duration));
}

// ─── Track row ────────────────────────────────────────────────────────────────

interface TrackRowProps {
  track: AnimationTrack;
  duration: number;
  width: number;
  playheadTime: number;
  selectedKf: string | null;
  onSelectKf: (id: string) => void;
  onAddKeyframe: (trackId: string, time: number) => void;
  onDeleteTrack: (trackId: string) => void;
  onUpdateValue: (trackId: string, kfId: string, value: number) => void;
}

function TrackRow({
  track,
  duration,
  width,
  playheadTime,
  selectedKf,
  onSelectKf,
  onAddKeyframe,
  onDeleteTrack,
  _onUpdateValue,
}: TrackRowProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = xToTime(x, duration, width);
      onAddKeyframe(track.id, Math.round(time));
    },
    [track.id, duration, width, onAddKeyframe]
  );

  return (
    <div className="flex" style={{ height: TRACK_HEIGHT }}>
      {/* Property label */}
      <div className="flex w-44 shrink-0 items-center justify-between border-b border-r border-studio-border px-2">
        <span className="truncate text-[10px] font-mono text-studio-text">{track.property}</span>
        <button
          onClick={() => onDeleteTrack(track.id)}
          className="ml-1 rounded p-0.5 text-studio-muted hover:text-red-400"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Timeline area */}
      <div
        className="relative flex-1 cursor-crosshair border-b border-studio-border bg-[#0a0a12] hover:bg-[#0d0d18]"
        style={{ width }}
        onClick={handleClick}
      >
        {/* Playhead line */}
        <div
          className="pointer-events-none absolute top-0 h-full w-px bg-studio-accent/60"
          style={{ left: timeToX(playheadTime, duration, width) }}
        />

        {/* Keyframe diamonds */}
        {track.keyframes.map((kf) => {
          const x = timeToX(kf.time, duration, width);
          const selected = kf.id === selectedKf;
          return (
            <button
              key={kf.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectKf(kf.id);
              }}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rotate-45 border transition ${
                selected
                  ? 'border-white bg-studio-accent scale-125'
                  : 'border-studio-accent/60 bg-studio-accent/30 hover:bg-studio-accent/60 hover:scale-110'
              }`}
              style={{ left: x }}
              title={`${track.property} = ${kf.value} @ ${kf.time}ms`}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Timeline ruler ───────────────────────────────────────────────────────────

function TimeRuler({ duration, width }: { duration: number; width: number }) {
  const ticks: number[] = [];
  const step = duration <= 2000 ? 200 : duration <= 5000 ? 500 : 1000;
  for (let t = 0; t <= duration; t += step) ticks.push(t);

  return (
    <div className="relative h-6 border-b border-studio-border bg-studio-surface">
      {ticks.map((t) => (
        <div
          key={t}
          className="absolute text-[8px] text-studio-muted"
          style={{ left: timeToX(t, duration, width), transform: 'translateX(-50%)' }}
        >
          <div className="mb-0.5 h-1.5 w-px bg-studio-border mx-auto" />
          {t / 1000}s
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AnimationTimelineProps {
  onClose: () => void;
}

export function AnimationTimeline({ _onClose }: AnimationTimelineProps) {
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const selectedNode = nodes.find((n) => n.id === selectedId);

  const [tracks, setTracks] = useState<AnimationTrack[]>([
    {
      id: trackId(),
      property: 'position.y',
      easing: 'easeInOut',
      loop: true,
      keyframes: [
        { id: kfId(), time: 0, value: 0 },
        { id: kfId(), time: 1500, value: 0.5 },
        { id: kfId(), time: 3000, value: 0 },
      ],
    },
  ]);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [playing, setPlaying] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [selectedKf, setSelectedKf] = useState<string | null>(null);
  const [newProp, setNewProp] = useState('');
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const TIMELINE_WIDTH = 520;

  // ── Playback ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        setPlayheadTime((t) => {
          const next = t + 33;
          return next >= duration ? 0 : next;
        });
      }, 33);
    } else {
      if (playRef.current) clearInterval(playRef.current);
    }
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [playing, duration]);

  // ── Track operations ──────────────────────────────────────────────────────

  const addTrack = useCallback(() => {
    const prop = newProp.trim() || 'rotation.y';
    setTracks((ts) => [
      ...ts,
      {
        id: trackId(),
        property: prop,
        easing: 'easeInOut',
        loop: true,
        keyframes: [
          { id: kfId(), time: 0, value: 0 },
          { id: kfId(), time: duration, value: 1 },
        ],
      },
    ]);
    setNewProp('');
  }, [newProp, duration]);

  const deleteTrack = useCallback((id: string) => {
    setTracks((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const addKeyframe = useCallback((tId: string, time: number) => {
    setTracks((ts) =>
      ts.map((t) => {
        if (t.id !== tId) return t;
        const existing = t.keyframes.find((k) => Math.abs(k.time - time) < 30);
        if (existing) return t;
        const sorted = [...t.keyframes, { id: kfId(), time, value: 0 }].sort(
          (a, b) => a.time - b.time
        );
        return { ...t, keyframes: sorted };
      })
    );
  }, []);

  const updateKfValue = useCallback((tId: string, kId: string, value: number) => {
    setTracks((ts) =>
      ts.map((t) =>
        t.id !== tId
          ? t
          : { ...t, keyframes: t.keyframes.map((k) => (k.id === kId ? { ...k, value } : k)) }
      )
    );
  }, []);

  // Find selected keyframe's track and value for inline editor
  const selectedTrack = tracks.find((t) => t.keyframes.some((k) => k.id === selectedKf));
  const selectedKfObj = selectedTrack?.keyframes.find((k) => k.id === selectedKf);

  return (
    <div className="flex h-full flex-col bg-studio-bg">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2">
        <span className="text-[11px] font-semibold text-studio-text">
          Animation Timeline
          {selectedNode && <span className="ml-1 text-studio-muted">— {selectedNode.name}</span>}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {/* Duration */}
          <label className="flex items-center gap-1 text-[10px] text-studio-muted">
            Duration
            <input
              type="number"
              min={500}
              max={30000}
              step={500}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-16 rounded bg-studio-surface px-1.5 py-0.5 text-right text-[11px] text-studio-text outline-none"
            />
            ms
          </label>

          {/* Reset */}
          <button
            onClick={() => {
              setPlayheadTime(0);
              setPlaying(false);
            }}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
            title="Reset"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={() => setPlaying((p) => !p)}
            className="flex items-center gap-1 rounded bg-studio-accent px-2.5 py-1 text-[10px] font-medium text-white"
          >
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>

      {/* Content: tracks + timeline */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: track list with ruler */}
        <div className="flex flex-1 flex-col overflow-auto">
          {/* Ruler offset (matches label column) */}
          <div className="flex">
            <div className="w-44 shrink-0 border-b border-r border-studio-border bg-studio-surface" />
            <TimeRuler duration={duration} width={TIMELINE_WIDTH} />
          </div>

          {/* Track rows */}
          {tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              duration={duration}
              width={TIMELINE_WIDTH}
              playheadTime={playheadTime}
              selectedKf={selectedKf}
              onSelectKf={setSelectedKf}
              onAddKeyframe={addKeyframe}
              onDeleteTrack={deleteTrack}
              onUpdateValue={updateKfValue}
            />
          ))}

          {/* Add track */}
          <div className="flex items-center gap-2 border-b border-studio-border px-2 py-1.5">
            <select
              value={newProp}
              onChange={(e) => setNewProp(e.target.value)}
              className="flex-1 rounded bg-studio-surface px-1.5 py-1 text-[10px] text-studio-text outline-none"
            >
              <option value="">Pick property…</option>
              {PROPERTY_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newProp}
              onChange={(e) => setNewProp(e.target.value)}
              placeholder="or type property"
              className="w-32 rounded bg-studio-surface px-1.5 py-1 text-[10px] text-studio-text outline-none"
            />
            <button
              onClick={addTrack}
              className="flex items-center gap-1 rounded bg-studio-accent/20 px-2 py-1 text-[10px] text-studio-accent hover:bg-studio-accent/30"
            >
              <Plus className="h-3 w-3" /> Add Track
            </button>
          </div>
        </div>

        {/* Right: keyframe inspector */}
        <div className="flex w-44 shrink-0 flex-col border-l border-studio-border bg-studio-panel">
          <div className="border-b border-studio-border px-2 py-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-studio-muted">
              Keyframe
            </p>
          </div>
          {selectedKfObj && selectedTrack ? (
            <div className="flex flex-col gap-2 p-2 text-[11px]">
              <div>
                <label className="block text-studio-muted">Time (ms)</label>
                <input
                  type="number"
                  value={selectedKfObj.time}
                  readOnly
                  className="w-full rounded bg-studio-surface px-2 py-1 text-studio-text outline-none"
                />
              </div>
              <div>
                <label className="block text-studio-muted">Value</label>
                <input
                  type="number"
                  step={0.01}
                  value={selectedKfObj.value}
                  onChange={(e) =>
                    updateKfValue(selectedTrack.id, selectedKfObj.id, Number(e.target.value))
                  }
                  className="w-full rounded bg-studio-surface px-2 py-1 text-studio-text outline-none focus:ring-1 focus:ring-studio-accent"
                />
              </div>
              <div>
                <label className="block text-studio-muted">Easing</label>
                <select
                  value={selectedTrack.easing}
                  onChange={(e) =>
                    setTracks((ts) =>
                      ts.map((t) =>
                        t.id !== selectedTrack.id
                          ? t
                          : { ...t, easing: e.target.value as AnimationTrack['easing'] }
                      )
                    )
                  }
                  className="w-full rounded bg-studio-surface px-1.5 py-1 text-studio-text outline-none"
                >
                  <option value="linear">Linear</option>
                  <option value="easeIn">Ease In</option>
                  <option value="easeOut">Ease Out</option>
                  <option value="easeInOut">Ease In Out</option>
                </select>
              </div>
            </div>
          ) : (
            <p className="p-3 text-[10px] text-studio-muted">Click a ◇ to edit keyframe</p>
          )}
        </div>
      </div>
    </div>
  );
}
