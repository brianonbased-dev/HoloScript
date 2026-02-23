'use client';

/**
 * ProfilerOverlay — compact heads-up display drawn over the viewport.
 * Shows FPS, frame-ms, dropped frames, and a mini frame-time sparkline.
 */

import { useEffect } from 'react';
import { Activity } from 'lucide-react';
import { useProfiler } from '@/hooks/useProfiler';

interface ProfilerOverlayProps {
  active: boolean;
}

function Sparkline({ history, height = 32 }: { history: number[]; height?: number }) {
  const maxVal = Math.max(...history, 33.33);
  const w = 80;
  const h = height;

  if (history.length < 2) {
    return <div style={{ width: w, height: h }} className="rounded bg-black/20" />;
  }

  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * w;
    const y = h - (v / maxVal) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} className="rounded overflow-hidden">
      <rect width={w} height={h} fill="rgb(0 0 0 / 0.25)" />
      {/* 60fps target line */}
      <line x1={0} y1={h - (16.67 / maxVal) * h} x2={w} y2={h - (16.67 / maxVal) * h} stroke="rgb(74 222 128 / 0.4)" strokeWidth={1} strokeDasharray="2 2" />
      {/* 30fps threshold line */}
      <line x1={0} y1={h - (33.33 / maxVal) * h} x2={w} y2={h - (33.33 / maxVal) * h} stroke="rgb(251 191 36 / 0.4)" strokeWidth={1} strokeDasharray="2 2" />
      <polyline points={pts} fill="none" stroke="rgb(139 92 246 / 0.9)" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

export function ProfilerOverlay({ active }: ProfilerOverlayProps) {
  const { snap, start, stop } = useProfiler();

  useEffect(() => {
    if (active) start();
    else stop();
  }, [active, start, stop]);

  if (!active || !snap.running) return null;

  const fpsColor =
    snap.fps >= 55 ? 'text-green-400' :
    snap.fps >= 30 ? 'text-yellow-400' :
    'text-red-400';

  return (
    <div className="pointer-events-none absolute right-2 top-2 z-30 flex flex-col gap-1 rounded-xl border border-white/10 bg-black/60 p-2 backdrop-blur text-[10px] font-mono text-white shadow-2xl">
      <div className="flex items-center gap-2">
        <Activity className="h-3 w-3 text-violet-400 shrink-0" />
        <span className={`text-[13px] font-bold tabular-nums ${fpsColor}`}>{snap.fps}</span>
        <span className="text-white/40">fps</span>
        <span className="ml-1 text-white/60 tabular-nums">{snap.frameMs}ms</span>
      </div>
      <Sparkline history={snap.history} />
      <div className="flex justify-between text-[9px] text-white/40">
        <span>avg {snap.avgFrameMs}ms</span>
        <span>p95 {snap.p95FrameMs}ms</span>
        {snap.droppedFrames > 0 && (
          <span className="text-yellow-400">⚠ {snap.droppedFrames} drops</span>
        )}
      </div>
    </div>
  );
}
