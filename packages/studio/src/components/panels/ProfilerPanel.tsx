'use client';
/** ProfilerPanel — Runtime performance profiler */
import React from 'react';
import { useProfiler } from '../../hooks/useProfiler';

export function ProfilerPanel() {
  const { fps, frameCount, summaries, slowest, memory, enabled, simulateFrames, takeSnapshot, toggleEnabled, reset } = useProfiler();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">📊 Profiler</h3>
        <span className={`text-[10px] font-mono ${fps > 55 ? 'text-emerald-400' : fps > 30 ? 'text-amber-400' : 'text-red-400'}`}>
          {fps > 0 ? `${fps.toFixed(0)} FPS` : '— FPS'} · {frameCount} frames
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => simulateFrames(30)} className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition">⚡ Sim 30</button>
        <button onClick={() => takeSnapshot()} className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition">📸 Snap</button>
        <button onClick={toggleEnabled} className={`px-2 py-1 rounded transition ${enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {enabled ? '● On' : '○ Off'}
        </button>
        <button onClick={reset} className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition">↺</button>
      </div>

      {/* Slowest scopes */}
      {slowest.length > 0 && (
        <div>
          <h4 className="text-studio-muted font-medium mb-1">🔥 Hotspots</h4>
          <div className="space-y-0.5">
            {slowest.map(s => (
              <div key={s.name} className="flex items-center gap-1.5 bg-studio-panel/30 rounded px-2 py-0.5">
                <span className="text-studio-text font-mono text-[10px] w-16 truncate">{s.name}</span>
                <div className="flex-1 bg-studio-panel rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${s.maxTime > 5 ? 'bg-red-400' : s.maxTime > 2 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ width: `${Math.min(100, (s.avgTime / (slowest[0]?.maxTime || 1)) * 100)}%` }} />
                </div>
                <span className="text-studio-muted text-[10px] font-mono w-14 text-right">{s.avgTime.toFixed(2)}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memory snapshots */}
      {memory.length > 0 && (
        <div>
          <h4 className="text-studio-muted font-medium mb-1">🧠 Memory</h4>
          <div className="space-y-0.5 max-h-[60px] overflow-y-auto">
            {memory.map((m, i) => (
              <div key={i} className="flex items-center justify-between bg-studio-panel/20 rounded px-2 py-0.5 text-[10px]">
                <span className="text-studio-text">{m.label || `Snap ${i}`}</span>
                <span className="font-mono text-studio-muted">{(m.heapUsed / 1024 / 1024).toFixed(1)}MB</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {summaries.length === 0 && <p className="text-studio-muted text-center py-2">Simulate frames to collect profiling data.</p>}
    </div>
  );
}
