/**
 * PerfOverlay.tsx
 *
 * @deprecated This component is unused dead code. Use one of the canonical alternatives:
 *   - PerformanceOverlay from '@/components/profiler/PerformanceOverlay' (inside R3F Canvas, rich stats + sparkline)
 *   - ProfilerOverlay from '@/components/profiler/ProfilerOverlay' (HTML overlay outside Canvas, uses useProfiler hook)
 *
 * Performance monitoring overlay for the R3F viewport.
 * Uses r3f-perf when available, falls back to a manual FPS counter.
 * Only shown in development mode or when explicitly enabled.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useEditorStore } from '@/lib/stores';

// ── Manual FPS Counter (no extra dependency needed) ───────────────────────────

interface PerfStats {
  fps: number;
  memory: number | null;
  calls: number;
  triangles: number;
}

function usePerfStats() {
  const [stats, setStats] = useState<PerfStats>({ fps: 0, memory: null, calls: 0, triangles: 0 });
  const frameTimesRef = useRef<number[]>([]);
  const lastTimeRef = useRef<number>(performance.now());

  useFrame(({ gl }) => {
    const now = performance.now();
    const delta = now - lastTimeRef.current;
    lastTimeRef.current = now;

    frameTimesRef.current.push(delta);
    if (frameTimesRef.current.length > 60) {
      frameTimesRef.current.shift();
    }

    // Update every second
    if (frameTimesRef.current.length % 30 === 0) {
      const avg = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
      const fps = Math.round(1000 / avg);

      const info = gl.info;
      setStats({
        fps,
        memory: (performance as any).memory?.usedJSHeapSize
          ? Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024)
          : null,
        calls: info.render.calls,
        triangles: info.render.triangles,
      });
    }
  });

  return stats;
}

// ── PerfDisplay (inside Canvas) ───────────────────────────────────────────────

function PerfDisplay() {
  const stats = usePerfStats();

  const fpsColor = stats.fps >= 55 ? '#4ade80' : stats.fps >= 30 ? '#fbbf24' : '#f87171';

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        borderRadius: 8,
        padding: '8px 12px',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        lineHeight: 1.8,
        pointerEvents: 'none',
        zIndex: 50,
        minWidth: 140,
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div style={{ color: fpsColor, fontWeight: 700, fontSize: 14 }}>
        {stats.fps} <span style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af' }}>FPS</span>
      </div>
      <div style={{ color: '#9ca3af' }}>
        <span style={{ color: '#d1d5db' }}>Calls</span> {stats.calls}
      </div>
      <div style={{ color: '#9ca3af' }}>
        <span style={{ color: '#d1d5db' }}>Tris</span> {Math.round(stats.triangles / 1000)}k
      </div>
      {stats.memory !== null && (
        <div style={{ color: '#9ca3af' }}>
          <span style={{ color: '#d1d5db' }}>Mem</span> {stats.memory}MB
        </div>
      )}
    </div>
  );
}

// ── PerfOverlay (mounts outside canvas, holds the inner display) ──────────────

interface PerfOverlayProps {
  /** If true, shows the overlay. Defaults to process.env.NODE_ENV === 'development' */
  visible?: boolean;
}

export function PerfOverlay({ visible }: PerfOverlayProps) {
  const isDev = process.env.NODE_ENV === 'development';
  const show = visible ?? isDev;

  if (!show) return null;

  // PerfDisplay must live inside a Canvas — so we return it directly
  // and let the viewport wrap it in a <Canvas>-context sibling or overlay div
  return <PerfDisplay />;
}
