/**
 * BenchmarkScene.tsx
 *
 * Performance benchmark scene for HoloScript Studio.
 * Renders configurable N objects and tracks sustained FPS.
 *
 * Purpose: Week 1-2 launch prep — validate 60fps @ 1000 objects target.
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the R3F canvas to avoid SSR issues
const BenchmarkCanvas = dynamic(() => import('./BenchmarkCanvas'), { ssr: false });

// ── Preset sizes ──────────────────────────────────────────────────────────────

const PRESETS = [
  { label: '100', count: 100 },
  { label: '500', count: 500 },
  { label: '1000', count: 1000 },
  { label: '2000', count: 2000 },
] as const;

// ── Benchmark Results ─────────────────────────────────────────────────────────

interface BenchmarkResult {
  count: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  status: 'pass' | 'warn' | 'fail';
  timestamp: number;
}

function statusColor(s: BenchmarkResult['status']) {
  return s === 'pass' ? '#4ade80' : s === 'warn' ? '#fbbf24' : '#f87171';
}

function statusLabel(avg: number): BenchmarkResult['status'] {
  if (avg >= 55) return 'pass';
  if (avg >= 30) return 'warn';
  return 'fail';
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function BenchmarkScene() {
  const [objectCount, setObjectCount] = useState(100);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [currentFps, setCurrentFps] = useState(0);
  const [geometry, setGeometry] = useState<'box' | 'sphere' | 'torus'>('box');
  const [animated, setAnimated] = useState(true);
  const collectedFps = useRef<number[]>([]);
  const runTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFpsUpdate = useCallback(
    (fps: number) => {
      setCurrentFps(fps);
      if (isRunning) {
        collectedFps.current.push(fps);
      }
    },
    [isRunning]
  );

  const startBenchmark = useCallback(() => {
    collectedFps.current = [];
    setIsRunning(true);

    // Run for 5 seconds, then collect results
    runTimeoutRef.current = setTimeout(() => {
      const samples = collectedFps.current;
      if (samples.length > 0) {
        const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
        const min = Math.min(...samples);
        const max = Math.max(...samples);
        setResults((prev) => [
          {
            count: objectCount,
            avgFps: avg,
            minFps: min,
            maxFps: max,
            status: statusLabel(avg),
            timestamp: Date.now(),
          },
          ...prev.slice(0, 9), // keep last 10
        ]);
      }
      setIsRunning(false);
    }, 5000);
  }, [objectCount]);

  const runAllPresets = useCallback(async () => {
    for (const preset of PRESETS) {
      setObjectCount(preset.count);
      await new Promise((r) => setTimeout(r, 200)); // let React re-render
      startBenchmark();
      await new Promise((r) => setTimeout(r, 5500)); // wait for benchmark + buffer
    }
  }, [startBenchmark]);

  useEffect(() => {
    return () => {
      if (runTimeoutRef.current) clearTimeout(runTimeoutRef.current);
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-studio-bg text-studio-text">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">⚡ Performance Benchmark</span>
          <span className="rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
            Target: 60fps @ 1000 objects
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-lg font-bold"
            style={{
              color: currentFps >= 55 ? '#4ade80' : currentFps >= 30 ? '#fbbf24' : '#f87171',
            }}
          >
            {currentFps} FPS
          </span>
          {isRunning && <span className="animate-pulse text-xs text-amber-400">● Recording…</span>}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Controls sidebar */}
        <div className="flex w-64 flex-col gap-4 border-r border-studio-border p-4 text-sm overflow-y-auto">
          {/* Object count */}
          <div>
            <label className="mb-2 block font-medium text-studio-muted">Object Count</label>
            <div className="mb-2 flex gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.count}
                  onClick={() => setObjectCount(p.count)}
                  className={`rounded px-2 py-1 text-xs transition-colors ${
                    objectCount === p.count
                      ? 'bg-blue-500 text-white'
                      : 'bg-studio-panel text-studio-muted hover:text-studio-text'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={10}
              max={3000}
              step={10}
              value={objectCount}
              onChange={(e) => setObjectCount(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="mt-1 text-center font-mono text-xs text-studio-muted">
              {objectCount} objects
            </div>
          </div>

          {/* Geometry */}
          <div>
            <label className="mb-2 block font-medium text-studio-muted">Geometry</label>
            <div className="flex gap-1">
              {(['box', 'sphere', 'torus'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGeometry(g)}
                  className={`rounded px-2 py-1 text-xs capitalize transition-colors ${
                    geometry === g
                      ? 'bg-purple-500 text-white'
                      : 'bg-studio-panel text-studio-muted hover:text-studio-text'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Animation */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="animated"
              checked={animated}
              onChange={(e) => setAnimated(e.target.checked)}
              className="accent-blue-500"
            />
            <label htmlFor="animated" className="text-studio-muted">
              Animate objects
            </label>
          </div>

          {/* Run buttons */}
          <div className="flex flex-col gap-2">
            <button
              onClick={startBenchmark}
              disabled={isRunning}
              className="rounded bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-blue-400 disabled:opacity-40"
            >
              {isRunning ? '⏱ Running (5s)…' : '▶ Run Benchmark'}
            </button>
            <button
              onClick={runAllPresets}
              disabled={isRunning}
              className="rounded bg-studio-panel px-3 py-2 text-xs text-studio-muted transition-all hover:text-studio-text disabled:opacity-40"
            >
              Run All Presets
            </button>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div>
              <div className="mb-2 font-medium text-studio-muted">Results</div>
              <div className="space-y-1">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded bg-studio-panel px-2 py-1 text-xs"
                  >
                    <span className="text-studio-muted">{r.count} obj</span>
                    <span style={{ color: statusColor(r.status) }} className="font-mono font-bold">
                      {r.avgFps} fps
                    </span>
                    <span className="text-studio-muted">
                      {r.minFps}–{r.maxFps}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  const csv = [
                    'count,avg_fps,min_fps,max_fps,status,timestamp',
                    ...results.map(
                      (r) =>
                        `${r.count},${r.avgFps},${r.minFps},${r.maxFps},${r.status},${new Date(r.timestamp).toISOString()}`
                    ),
                  ].join('\n');
                  const a = document.createElement('a');
                  a.href = `data:text/csv,${encodeURIComponent(csv)}`;
                  a.download = `holoscript-benchmark-${Date.now()}.csv`;
                  a.click();
                }}
                className="mt-2 w-full rounded bg-studio-panel px-2 py-1 text-xs text-studio-muted hover:text-studio-text"
              >
                ↓ Export CSV
              </button>
            </div>
          )}
        </div>

        {/* Viewport */}
        <div className="relative flex-1">
          <BenchmarkCanvas
            objectCount={objectCount}
            geometry={geometry}
            animated={animated}
            onFpsUpdate={handleFpsUpdate}
          />
          {/* Overlay hint */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/50 px-2 py-1 font-mono text-xs text-white/50">
            {objectCount} × {geometry} mesh{animated ? ' (animated)' : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
