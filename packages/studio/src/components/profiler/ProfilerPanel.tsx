'use client';

/**
 * ProfilerPanel — right-rail deep performance panel.
 * Shows detailed frame-time waterfall, stats table, and controls.
 */

import { useEffect } from 'react';
import { Activity, X, Play, Pause, RotateCcw, TrendingUp, AlertTriangle } from 'lucide-react';
import { useProfiler } from '@/hooks/useProfiler';

interface ProfilerPanelProps {
  onClose: () => void;
}

const BAR_W = 220;

function WaterfallBar({ frameMs, maxMs }: { frameMs: number; maxMs: number }) {
  const pct = Math.min((frameMs / maxMs) * 100, 100);
  const color =
    frameMs <= 16.67 ? '#4ade80' :
    frameMs <= 33.33 ? '#facc15' :
    '#f87171';
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2.5 rounded-sm shrink-0"
        style={{ width: `${pct}%`, maxWidth: BAR_W, backgroundColor: color, minWidth: 2 }}
      />
      <span className="tabular-nums text-[9px] text-studio-muted">{frameMs.toFixed(1)}ms</span>
    </div>
  );
}

export function ProfilerPanel({ onClose }: ProfilerPanelProps) {
  const { snap, start, stop, reset } = useProfiler();

  // Auto-start when panel opens
  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  const maxMs = Math.max(...snap.history, 33.33);
  // Show last 40 frames as waterfall
  const waterfall = snap.history.slice(-40);

  const buckets = { good: 0, fair: 0, poor: 0 };
  for (const f of snap.history) {
    if (f <= 16.67) buckets.good++;
    else if (f <= 33.33) buckets.fair++;
    else buckets.poor++;
  }

  const totalFrames = snap.history.length || 1;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Activity className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Performance Profiler</span>
        <div className="ml-auto flex items-center gap-1">
          {snap.running ? (
            <button onClick={stop} className="rounded p-1 text-yellow-400 hover:text-yellow-300">
              <Pause className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button onClick={start} className="rounded p-1 text-green-400 hover:text-green-300">
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={reset} className="rounded p-1 text-studio-muted hover:text-studio-text">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className="rounded p-1 text-studio-muted hover:text-studio-text">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'FPS', value: `${snap.fps}`, color: snap.fps >= 55 ? 'text-green-400' : snap.fps >= 30 ? 'text-yellow-400' : 'text-red-400' },
            { label: 'Frame', value: `${snap.frameMs}ms`, color: 'text-studio-text' },
            { label: 'Avg', value: `${snap.avgFrameMs}ms`, color: 'text-studio-text' },
            { label: 'p95', value: `${snap.p95FrameMs}ms`, color: snap.p95FrameMs > 33 ? 'text-red-400' : snap.p95FrameMs > 16.67 ? 'text-yellow-400' : 'text-green-400' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-studio-border bg-studio-surface p-2 text-center">
              <p className={`text-[15px] font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-studio-muted">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Dropped frames alert */}
        {snap.droppedFrames > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/8 p-2.5 text-[10px] text-yellow-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {snap.droppedFrames} dropped frame{snap.droppedFrames !== 1 ? 's' : ''} (&gt;33ms)
          </div>
        )}

        {/* Frame quality distribution */}
        <div className="rounded-xl border border-studio-border bg-studio-surface p-3">
          <p className="mb-2 text-[10px] font-semibold text-studio-text">Frame Quality Distribution</p>
          <div className="space-y-1.5">
            {[
              { label: '≤16ms (60fps+)', count: buckets.good, color: 'bg-green-400' },
              { label: '16–33ms (30–60fps)', count: buckets.fair, color: 'bg-yellow-400' },
              { label: '>33ms (&lt;30fps)', count: buckets.poor, color: 'bg-red-400' },
            ].map((b) => (
              <div key={b.label} className="flex items-center gap-2">
                <div className="w-[120px] shrink-0 overflow-hidden rounded-full bg-studio-border h-1.5">
                  <div
                    className={`h-full rounded-full ${b.color}`}
                    style={{ width: `${(b.count / totalFrames) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] text-studio-muted">{b.label}</span>
                <span className="ml-auto text-[9px] tabular-nums text-studio-text">{b.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Frame waterfall */}
        <div className="rounded-xl border border-studio-border bg-studio-surface p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-semibold text-studio-text">Frame Waterfall (last 40)</p>
            <div className="flex items-center gap-2 text-[9px] text-studio-muted">
              <span className="flex items-center gap-0.5"><span className="inline-block h-1.5 w-3 rounded-full bg-green-400" /> &lt;17ms</span>
              <span className="flex items-center gap-0.5"><span className="inline-block h-1.5 w-3 rounded-full bg-yellow-400" /> &lt;33ms</span>
              <span className="flex items-center gap-0.5"><span className="inline-block h-1.5 w-3 rounded-full bg-red-400" /> slow</span>
            </div>
          </div>
          <div className="space-y-0.5">
            {waterfall.map((ms, i) => (
              <WaterfallBar key={i} frameMs={Math.round(ms * 10) / 10} maxMs={maxMs} />
            ))}
            {waterfall.length === 0 && (
              <p className="py-2 text-center text-[10px] text-studio-muted">
                {snap.running ? 'Collecting frames…' : 'Press ▶ to start profiling'}
              </p>
            )}
          </div>
        </div>

        {/* Tip */}
        <div className="rounded-xl border border-studio-border bg-studio-surface/50 p-3 text-[10px] text-studio-muted space-y-1">
          <p className="flex items-center gap-1.5 font-semibold text-studio-text"><TrendingUp className="h-3 w-3" /> Tips</p>
          <p>· Target &lt;16ms per frame for smooth 60fps</p>
          <p>· p95 &gt;33ms indicates periodic stutters</p>
          <p>· The overlay (top-right of viewport) updates in real time</p>
        </div>
      </div>
    </div>
  );
}
