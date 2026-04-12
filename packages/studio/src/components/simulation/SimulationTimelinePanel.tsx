'use client';

/**
 * SimulationTimelinePanel — Transport controls + scrubber for simulation playback.
 *
 * Scientists record a transient simulation, then scrub through the time
 * history like a video. Play/pause/reverse/speed control/frame stepping.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Circle, Play, Pause, SkipBack, SkipForward, Square,
  Rewind, FastForward, X,
} from 'lucide-react';

type PlaybackState = 'idle' | 'recording' | 'paused' | 'playing';

interface SimulationTimelinePanelProps {
  state: PlaybackState;
  currentTime: number;
  totalFrames: number;
  progress: number;
  memoryMB: number;
  speed: number;
  onRecord?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onStepForward?: () => void;
  onStepBackward?: () => void;
  onSeek?: (progress: number) => void;
  onSpeedChange?: (speed: number) => void;
  onClose?: () => void;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export function SimulationTimelinePanel({
  state,
  currentTime,
  totalFrames,
  progress,
  memoryMB,
  speed,
  onRecord,
  onPlay,
  onPause,
  onStop,
  onStepForward,
  onStepBackward,
  onSeek,
  onSpeedChange,
  onClose,
}: SimulationTimelinePanelProps) {
  const scrubberRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleScrub = useCallback((clientX: number) => {
    if (!scrubberRef.current || !onSeek) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(p);
  }, [onSeek]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true);
    handleScrub(e.clientX);
  }, [handleScrub]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => handleScrub(e.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, handleScrub]);

  const currentFrame = Math.round(progress * totalFrames);

  return (
    <div className="flex flex-col bg-studio-panel text-studio-text border-t border-studio-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-studio-border">
        <span className="text-[11px] font-semibold text-studio-muted uppercase tracking-wider">
          Simulation Timeline
        </span>
        <span className="text-[10px] text-studio-muted ml-auto">
          Frame {currentFrame}/{totalFrames}
        </span>
        <span className="text-[10px] text-studio-muted">
          t = {currentTime.toFixed(4)}s
        </span>
        <span className="text-[10px] text-studio-muted">
          {memoryMB.toFixed(1)}MB
        </span>
        {state === 'recording' && (
          <span className="text-[10px] text-red-400 animate-pulse font-semibold">REC</span>
        )}
        {onClose && (
          <button onClick={onClose} className="p-0.5 rounded hover:bg-studio-surface">
            <X className="h-3 w-3 text-studio-muted" />
          </button>
        )}
      </div>

      {/* Scrubber Bar */}
      <div className="px-3 py-2">
        <div
          ref={scrubberRef}
          className="relative h-2 bg-studio-surface rounded-full cursor-pointer"
          onMouseDown={handleMouseDown}
        >
          {/* Filled portion */}
          <div
            className="absolute top-0 left-0 h-full rounded-full bg-studio-accent"
            style={{ width: `${progress * 100}%` }}
          />
          {/* Playhead */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-studio-accent shadow-sm"
            style={{ left: `calc(${progress * 100}% - 6px)` }}
          />
        </div>
      </div>

      {/* Transport Controls */}
      <div className="flex items-center justify-center gap-1 px-3 pb-2">
        {/* Record */}
        <TransportBtn
          onClick={onRecord}
          active={state === 'recording'}
          title="Record"
        >
          <Circle className={`h-3.5 w-3.5 ${state === 'recording' ? 'fill-red-500 text-red-500' : ''}`} />
        </TransportBtn>

        {/* Stop */}
        <TransportBtn onClick={onStop} title="Stop">
          <Square className="h-3.5 w-3.5" />
        </TransportBtn>

        {/* Step Back */}
        <TransportBtn onClick={onStepBackward} disabled={state === 'recording'} title="Step Back">
          <SkipBack className="h-3.5 w-3.5" />
        </TransportBtn>

        {/* Play / Pause */}
        <TransportBtn
          onClick={state === 'playing' ? onPause : onPlay}
          disabled={state === 'recording' || totalFrames === 0}
          active={state === 'playing'}
          title={state === 'playing' ? 'Pause' : 'Play'}
          primary
        >
          {state === 'playing'
            ? <Pause className="h-4 w-4" />
            : <Play className="h-4 w-4" />
          }
        </TransportBtn>

        {/* Step Forward */}
        <TransportBtn onClick={onStepForward} disabled={state === 'recording'} title="Step Forward">
          <SkipForward className="h-3.5 w-3.5" />
        </TransportBtn>

        {/* Speed */}
        <div className="flex items-center gap-1 ml-3">
          <Rewind className="h-3 w-3 text-studio-muted" />
          <select
            value={speed}
            onChange={(e) => onSpeedChange?.(Number(e.target.value))}
            className="bg-studio-surface border border-studio-border rounded px-1 py-0.5 text-[10px] text-studio-text"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>
          <FastForward className="h-3 w-3 text-studio-muted" />
        </div>
      </div>
    </div>
  );
}

function TransportBtn({
  children, onClick, disabled, active, title, primary,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        rounded p-1.5 transition
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-studio-surface'}
        ${active ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-text'}
        ${primary ? 'bg-studio-accent/10' : ''}
      `}
    >
      {children}
    </button>
  );
}
