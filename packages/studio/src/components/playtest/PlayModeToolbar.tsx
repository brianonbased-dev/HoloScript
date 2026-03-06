'use client';

/**
 * PlayModeToolbar — Central play/pause/stop toolbar for the Studio.
 *
 * Replaces the old PlaytestBar with full Play Mode controls:
 *  - ▶ Play: snapshots scene, starts game loop
 *  - ⏸ Pause: freezes game loop, keeps state
 *  - ⏹ Stop: stops loop, reverts scene to snapshot
 *  - Timer display, FPS counter, bot count
 *
 * Color scheme:
 *  - Editing: neutral (studio-panel)
 *  - Playing: emerald glow with pulse
 *  - Paused: amber glow
 */

import { useCallback } from 'react';
import { Play, Pause, Square, RotateCcw, Bot, ChevronDown, Monitor, Eye, EyeOff } from 'lucide-react';
import { usePlayMode } from '@/lib/stores/playModeStore';
import { useSceneStore } from '@/lib/store';

export function PlayModeToolbar() {
  const playState = usePlayMode((s) => s.playState);
  const elapsed = usePlayMode((s) => s.elapsed);
  const fps = usePlayMode((s) => s.fps);
  const botCount = usePlayMode((s) => s.botCount);
  const showHUD = usePlayMode((s) => s.showHUD);
  const showFPS = usePlayMode((s) => s.showFPS);
  const play = usePlayMode((s) => s.play);
  const pause = usePlayMode((s) => s.pause);
  const resume = usePlayMode((s) => s.resume);
  const stop = usePlayMode((s) => s.stop);
  const reset = usePlayMode((s) => s.reset);
  const setBotCount = usePlayMode((s) => s.setBotCount);
  const setShowHUD = usePlayMode((s) => s.setShowHUD);
  const setShowFPS = usePlayMode((s) => s.setShowFPS);

  const code = useSceneStore((s) => s.code);
  const setCode = useSceneStore((s) => s.setCode);

  const handlePlay = useCallback(() => {
    if (playState === 'paused') {
      resume();
    } else {
      play(code);
    }
  }, [playState, play, resume, code]);

  const handleStop = useCallback(() => {
    const snapshot = stop();
    if (snapshot) {
      setCode(snapshot);
    }
  }, [stop, setCode]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ── Editing State ──
  if (playState === 'editing') {
    return (
      <div className="flex items-center gap-3 border-t border-studio-border bg-studio-panel px-4 py-2">
        {/* Play button */}
        <button
          onClick={handlePlay}
          className="flex items-center gap-2 rounded-lg bg-emerald-500/20 px-4 py-1.5 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/10"
          title="Play (F5)"
        >
          <Play className="h-4 w-4 fill-current" />
          Play
        </button>

        {/* Bot count */}
        <div className="flex items-center gap-1.5 text-xs text-studio-muted">
          <Bot className="h-3.5 w-3.5" />
          <span>Bots:</span>
          <select
            value={botCount}
            onChange={(e) => setBotCount(Number(e.target.value))}
            className="bg-transparent text-studio-muted outline-none cursor-pointer"
          >
            {[0, 1, 2, 3, 5, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <ChevronDown className="h-3 w-3" />
        </div>

        {/* HUD toggle */}
        <button
          onClick={() => setShowHUD(!showHUD)}
          className={`flex items-center gap-1 text-xs transition ${showHUD ? 'text-studio-accent' : 'text-studio-muted'}`}
          title={showHUD ? 'HUD ON' : 'HUD OFF'}
        >
          {showHUD ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          HUD
        </button>

        <span className="ml-auto text-[11px] text-studio-muted">
          Press F5 to playtest · WASD to move · ESC to stop
        </span>
      </div>
    );
  }

  // ── Playing / Paused State ──
  const isPlaying = playState === 'playing';
  const borderColor = isPlaying ? 'border-emerald-500/50' : 'border-amber-500/50';
  const bgColor = isPlaying ? 'bg-emerald-950/40' : 'bg-amber-950/40';
  const accentColor = isPlaying ? 'text-emerald-400' : 'text-amber-400';
  const dotColor = isPlaying ? 'bg-emerald-400' : 'bg-amber-400';

  return (
    <div className={`flex items-center gap-3 border-t-2 ${borderColor} ${bgColor} px-4 py-2`}>
      {/* Pulsing/static indicator */}
      <span className="flex h-2.5 w-2.5 shrink-0">
        {isPlaying && (
          <span className={`absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full ${dotColor} opacity-75`} />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotColor}`} />
      </span>

      <span className={`text-sm font-semibold ${accentColor}`}>
        {isPlaying ? 'PLAYING' : 'PAUSED'}
      </span>

      {/* Timer */}
      <span className={`font-mono text-sm ${isPlaying ? 'text-emerald-300' : 'text-amber-300'}`}>
        {fmt(elapsed)}
      </span>

      {/* FPS */}
      {showFPS && (
        <span
          className={`font-mono text-xs ${fps > 50 ? 'text-emerald-400/60' : fps > 30 ? 'text-amber-400/60' : 'text-red-400/60'}`}
          title="Frames per second"
        >
          {fps} FPS
        </span>
      )}

      {/* Bots */}
      {botCount > 0 && (
        <span className={`flex items-center gap-1 text-xs ${accentColor} opacity-70`}>
          <Bot className="h-3 w-3" />
          {botCount} bot{botCount > 1 ? 's' : ''}
        </span>
      )}

      {/* Controls */}
      <div className="ml-auto flex items-center gap-2">
        {/* Play / Pause toggle */}
        {isPlaying ? (
          <button
            onClick={pause}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400 transition hover:bg-amber-500/20"
            title="Pause (F6)"
          >
            <Pause className="h-3.5 w-3.5" />
            Pause
          </button>
        ) : (
          <button
            onClick={resume}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
            title="Resume (F5)"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Resume
          </button>
        )}

        {/* Reset game state */}
        <button
          onClick={reset}
          className="flex items-center gap-1 rounded-lg border border-studio-border bg-studio-panel/50 px-2 py-1 text-xs text-studio-muted transition hover:text-studio-text"
          title="Reset game state"
        >
          <RotateCcw className="h-3 w-3" />
        </button>

        {/* FPS toggle */}
        <button
          onClick={() => setShowFPS(!showFPS)}
          className={`flex items-center gap-1 rounded-lg border border-studio-border bg-studio-panel/50 px-2 py-1 text-xs transition ${showFPS ? 'text-studio-accent' : 'text-studio-muted'}`}
          title={showFPS ? 'Hide FPS' : 'Show FPS'}
        >
          <Monitor className="h-3 w-3" />
        </button>

        {/* Stop button */}
        <button
          onClick={handleStop}
          className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
          title="Stop (ESC)"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
          Stop
        </button>
      </div>
    </div>
  );
}
