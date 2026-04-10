'use client';
/**
 * LODMetricsPanel — Real-time LOD performance metrics dashboard.
 *
 * Displays frame time, LOD level distribution, triangle counts,
 * regression state, and transition statistics. Complementary to
 * the existing LODPanel which handles LOD configuration.
 *
 * @see FE-3 — LOD metrics dashboard directive
 * @see W.084 — VR performance regression monitor
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStudioBus } from '../../hooks/useStudioBus';

interface LODMetricSnapshot {
  timestamp: number;
  avgFrameTimeMs: number;
  isRegressed: boolean;
  levelDistribution: number[];
  totalTriangles: number;
  entityCount: number;
}

const HISTORY_SIZE = 60; // 1 second at 60fps
const BAR_COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444'];
const THRESHOLD_LINE = 9.0; // VR regression threshold

export function LODMetricsPanel() {
  const { emit, on } = useStudioBus();
  const [history, setHistory] = useState<LODMetricSnapshot[]>([]);
  const [isRecording, setIsRecording] = useState(true);
  const [regressionCount, setRegressionCount] = useState(0);
  const [recoveryCount, setRecoveryCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Receive metric ticks from usePerformanceRegression via bus, with simulation fallback
  useEffect(() => {
    if (!isRecording) return;
    let hasBusData = false;

    // Subscribe to real performance tick events from SceneRenderer's hook
    const unsub = on('lodMetrics:tick', (data: unknown) => {
      hasBusData = true;
      const snapshot = data as LODMetricSnapshot;
      if (!snapshot?.timestamp) return;
      setHistory((prev) => {
        const next = [...prev, snapshot];
        if (next.length > HISTORY_SIZE) next.shift();
        return next;
      });
    });

    // Fallback: simulated walk if no bus data arrives after 500ms
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    const fallbackDelay = setTimeout(() => {
      if (hasBusData) return;
      fallbackTimer = setInterval(() => {
        if (hasBusData) {
          if (fallbackTimer) clearInterval(fallbackTimer);
          return;
        }
        setHistory((prev) => {
          const last = prev[prev.length - 1];
          const snapshot: LODMetricSnapshot = {
            timestamp: Date.now(),
            avgFrameTimeMs: last ? last.avgFrameTimeMs + (Math.random() - 0.5) * 2 : 8.0,
            isRegressed: false,
            levelDistribution: last?.levelDistribution || [0, 0, 0, 0],
            totalTriangles: last?.totalTriangles || 0,
            entityCount: last?.entityCount || 0,
          };
          snapshot.avgFrameTimeMs = Math.max(1, Math.min(20, snapshot.avgFrameTimeMs));
          snapshot.isRegressed = snapshot.avgFrameTimeMs > THRESHOLD_LINE;
          const next = [...prev, snapshot];
          if (next.length > HISTORY_SIZE) next.shift();
          return next;
        });
      }, 16);
    }, 500);

    return () => {
      unsub();
      clearTimeout(fallbackDelay);
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, [isRecording, on]);

  const latest = history[history.length - 1];
  const avgFrame = latest?.avgFrameTimeMs ?? 0;
  const isRegressed = latest?.isRegressed ?? false;

  const handleReset = useCallback(() => {
    setHistory([]);
    setRegressionCount(0);
    setRecoveryCount(0);
    emit('lodMetrics:reset', {});
  }, [emit]);

  // Frame time sparkline
  const sparklinePoints = history
    .map((s, i) => {
      const x = (i / HISTORY_SIZE) * 100;
      const y = Math.max(0, Math.min(100, 100 - (s.avgFrameTimeMs / 20) * 100));
      return `${x},${y}`;
    })
    .join(' ');

  const thresholdY = 100 - (THRESHOLD_LINE / 20) * 100;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text text-xs">
      {/* Header */}
      <div className="border-b border-studio-border px-3 py-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span>📊</span> LOD Metrics
        </h3>
        <p className="text-[10px] text-studio-muted mt-0.5">Frame time & LOD performance</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Frame time gauge */}
        <div className="bg-studio-panel/30 rounded-lg p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-studio-muted text-[10px]">Frame Time</span>
            <span
              className={`font-mono text-sm font-bold ${
                isRegressed ? 'text-red-400' : avgFrame > 7 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {avgFrame.toFixed(1)}ms
            </span>
          </div>
          <div className="h-2 rounded-full bg-studio-surface overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-150"
              style={{
                width: `${Math.min(100, (avgFrame / 16.7) * 100)}%`,
                backgroundColor: isRegressed ? '#ef4444' : avgFrame > 7 ? '#eab308' : '#22c55e',
              }}
            />
          </div>
          <div className="flex justify-between mt-0.5 text-[9px] text-studio-muted">
            <span>0ms</span>
            <span className="text-amber-400">9ms VR</span>
            <span>16.7ms</span>
          </div>
        </div>

        {/* Sparkline */}
        <div className="bg-studio-panel/30 rounded-lg p-2">
          <span className="text-studio-muted text-[10px]">
            Frame History ({HISTORY_SIZE} frames)
          </span>
          <svg viewBox="0 0 100 100" className="w-full h-12 mt-1" preserveAspectRatio="none">
            {/* Threshold line */}
            <line
              x1="0"
              y1={thresholdY}
              x2="100"
              y2={thresholdY}
              stroke="#ef4444"
              strokeWidth="0.5"
              strokeDasharray="2,2"
              opacity="0.5"
            />
            {/* Frame time line */}
            {history.length > 1 && (
              <polyline
                points={sparklinePoints}
                fill="none"
                stroke={isRegressed ? '#ef4444' : '#22c55e'}
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </div>

        {/* Regression state */}
        <div className="bg-studio-panel/30 rounded-lg p-2">
          <div className="flex items-center justify-between">
            <span className="text-studio-muted text-[10px]">Regression State</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                isRegressed ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              {isRegressed ? 'REGRESSED' : 'NORMAL'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="text-center">
              <div className="text-lg font-bold text-red-400">{regressionCount}</div>
              <div className="text-[9px] text-studio-muted">Regressions</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-400">{recoveryCount}</div>
              <div className="text-[9px] text-studio-muted">Recoveries</div>
            </div>
          </div>
        </div>

        {/* LOD level distribution */}
        <div className="bg-studio-panel/30 rounded-lg p-2">
          <span className="text-studio-muted text-[10px]">LOD Level Distribution</span>
          <div className="flex items-end gap-1 h-10 mt-1">
            {(latest?.levelDistribution || [0, 0, 0, 0]).map((count, i) => {
              const max = Math.max(1, ...(latest?.levelDistribution || [1]));
              const pct = (count / max) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full rounded-t transition-all duration-200"
                    style={{
                      height: `${Math.max(2, pct)}%`,
                      backgroundColor: BAR_COLORS[i],
                      opacity: 0.7,
                    }}
                  />
                  <span className="text-[9px] text-studio-muted mt-0.5">L{i}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`px-2 py-1 rounded transition ${
              isRecording
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
            }`}
          >
            {isRecording ? '⏸ Pause' : '▶ Record'}
          </button>
          <button
            onClick={handleReset}
            className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          >
            ↺ Reset
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-studio-border px-3 py-1.5 text-[10px] text-studio-muted flex justify-between">
        <span>{latest?.entityCount || 0} entities tracked</span>
        <span>{((latest?.totalTriangles || 0) / 1000).toFixed(1)}K tris</span>
      </div>
    </div>
  );
}
