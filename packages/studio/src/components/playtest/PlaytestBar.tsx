'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Square, Bot, ChevronDown } from 'lucide-react';

interface PlaytestBarProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export function PlaytestBar({ open, onOpen, onClose }: PlaytestBarProps) {
  const [botCount, setBotCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      setElapsed(0);
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [open]);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (!open) {
    return (
      <div className="flex items-center gap-2 border-t border-studio-border bg-studio-panel px-4 py-2">
        <button
          onClick={onOpen}
          className="flex items-center gap-2 rounded-lg bg-emerald-500/20 px-4 py-1.5 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/30"
        >
          <Play className="h-4 w-4 fill-current" />
          Playtest
        </button>
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
        <span className="text-[11px] text-studio-muted">Test your world with {botCount} bots</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-t-2 border-emerald-500/50 bg-emerald-950/40 px-4 py-2">
      {/* Pulsing indicator */}
      <span className="flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
      </span>

      <span className="text-sm font-semibold text-emerald-400">PLAYTESTING</span>
      <span className="font-mono text-sm text-emerald-300">{fmt(elapsed)}</span>

      {botCount > 0 && (
        <span className="flex items-center gap-1 text-xs text-emerald-400/70">
          <Bot className="h-3 w-3" />
          {botCount} bot{botCount > 1 ? 's' : ''} active
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span className="text-[11px] text-emerald-400/60">WASD to move · Click to interact · ESC to exit</span>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
          Stop
        </button>
      </div>
    </div>
  );
}
