'use client';

/**
 * PerformanceOverlay — real-time rendering profiler inside the R3F Canvas
 *
 * Samples every useFrame call:
 *   - FPS (frames per second, rolling 60-sample average)
 *   - Frame time (ms)
 *   - Draw calls  (gl.info.render.calls)
 *   - Triangles   (gl.info.render.triangles)
 *   - Geometries in memory (gl.info.memory.geometries)
 *   - Textures in memory   (gl.info.memory.textures)
 *
 * Renders an HTML overlay via drei's Html (lives inside Canvas).
 * Toggle with P key or via profilerOpen prop.
 *
 * FPS sparkline: 60-sample ring buffer rendered as an inline SVG polyline.
 */

import { useRef, useState, _useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as _THREE from 'three';

// ─── FPS Ring Buffer ──────────────────────────────────────────────────────────

const RING_SIZE = 60;

function useRingBuffer(size: number) {
  const buf = useRef<Float32Array>(new Float32Array(size));
  const head = useRef(0);
  const push = (v: number) => {
    buf.current[head.current % size] = v;
    head.current++;
  };
  const toArray = (): number[] => {
    const arr: number[] = [];
    const start = head.current >= size ? head.current % size : 0;
    const len = Math.min(head.current, size);
    for (let i = 0; i < len; i++) {
      arr.push(buf.current[(start + i) % size]);
    }
    return arr;
  };
  return { push, toArray };
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({
  values,
  width = 120,
  height = 30,
  color = '#6366f1',
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - (v / max) * height}`)
    .join(' ');

  // 60fps target line
  const targetY = height - (60 / max) * height;

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* 60fps guide */}
      <line
        x1={0}
        y1={targetY}
        x2={width}
        y2={targetY}
        stroke="#22c55e"
        strokeWidth={0.5}
        opacity={0.4}
        strokeDasharray="3,2"
      />
      {/* FPS line */}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// ─── Stats HUD (inside Canvas via Html) ──────────────────────────────────────

interface StatsProps {
  open: boolean;
}

export function PerformanceOverlay({ open }: StatsProps) {
  const { gl } = useThree();
  const fps = useRef(0);
  const frameMs = useRef(0);
  const calls = useRef(0);
  const tris = useRef(0);
  const geoms = useRef(0);
  const texs = useRef(0);

  const ring = useRingBuffer(RING_SIZE);
  const [snapshot, setSnapshot] = useState({
    fps: 0,
    frameMs: 0,
    calls: 0,
    tris: 0,
    geoms: 0,
    texs: 0,
    sparkValues: [] as number[],
  });

  const lastTime = useRef(performance.now());
  const frameCount = useRef(0);
  const accumMs = useRef(0);
  const updateTick = useRef(0);

  useFrame(() => {
    if (!open) return;

    const now = performance.now();
    const delta = now - lastTime.current;
    lastTime.current = now;

    frameMs.current = delta;
    accumMs.current += delta;
    frameCount.current++;

    // Update display at ~10fps (every ~100ms)
    updateTick.current++;
    if (updateTick.current % 6 === 0) {
      const measuredFps = frameCount.current / (accumMs.current / 1000);
      fps.current = Math.round(measuredFps);
      ring.push(fps.current);

      calls.current = gl.info.render.calls;
      tris.current = gl.info.render.triangles;
      geoms.current = gl.info.memory.geometries;
      texs.current = gl.info.memory.textures;

      frameCount.current = 0;
      accumMs.current = 0;

      setSnapshot({
        fps: fps.current,
        frameMs: Math.round(frameMs.current * 10) / 10,
        calls: calls.current,
        tris: tris.current,
        geoms: geoms.current,
        texs: texs.current,
        sparkValues: ring.toArray(),
      });
    }

    // Reset render info after reading (prevents accumulation)
    gl.info.reset();
  });

  if (!open) return null;

  const fpsColor = snapshot.fps >= 55 ? '#22c55e' : snapshot.fps >= 30 ? '#f59e0b' : '#ef4444';

  return (
    <Html
      position={[0, 0, 0]}
      style={{
        position: 'fixed',
        top: '3.5rem',
        right: '1rem',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
      prepend
    >
      <div
        style={{
          background: 'rgba(10,10,18,0.88)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 8,
          padding: '8px 10px',
          fontFamily: '"JetBrains Mono", "Fira Mono", monospace',
          fontSize: 11,
          color: '#a0a0b8',
          minWidth: 150,
          backdropFilter: 'blur(8px)',
          userSelect: 'none',
        }}
      >
        {/* FPS */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span>FPS</span>
          <span style={{ color: fpsColor, fontWeight: 700, fontSize: 13 }}>{snapshot.fps}</span>
        </div>

        {/* Sparkline */}
        <Sparkline values={snapshot.sparkValues} />

        {/* Stats grid */}
        <div
          style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}
        >
          <span style={{ color: '#6b7280' }}>Frame</span>
          <span style={{ textAlign: 'right' }}>{snapshot.frameMs}ms</span>

          <span style={{ color: '#6b7280' }}>Draws</span>
          <span style={{ textAlign: 'right' }}>{snapshot.calls}</span>

          <span style={{ color: '#6b7280' }}>Tris</span>
          <span style={{ textAlign: 'right' }}>{snapshot.tris.toLocaleString()}</span>

          <span style={{ color: '#6b7280' }}>Geoms</span>
          <span style={{ textAlign: 'right' }}>{snapshot.geoms}</span>

          <span style={{ color: '#6b7280' }}>Textures</span>
          <span style={{ textAlign: 'right' }}>{snapshot.texs}</span>
        </div>
      </div>
    </Html>
  );
}
