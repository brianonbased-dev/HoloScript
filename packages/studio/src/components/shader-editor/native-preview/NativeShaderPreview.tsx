/**
 * NativeShaderPreview — GPU-accelerated shader preview via wgpu + Tauri IPC.
 *
 * Renders shaders natively using the wgpu render-to-texture pipeline,
 * bypassing WebGL entirely. Frames are delivered as base64 PNG data URIs
 * and displayed in an <img> element.
 *
 * Falls back to a "not available" message when running outside Tauri
 * (e.g., in a browser-only dev environment).
 *
 * Performance target: 720p @ 30fps with <33ms per-frame budget.
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  useShaderPreview,
  type BenchmarkResult,
} from './useShaderPreview';

// ─── Props ───────────────────────────────────────────────────────────────────

interface NativeShaderPreviewProps {
  /** Initial WGSL fragment shader code. */
  shaderCode?: string;
  /** Preview width (default: 1280). */
  width?: number;
  /** Preview height (default: 720). */
  height?: number;
  /** Auto-start rendering on mount (default: true). */
  autoStart?: boolean;
  /** Called when shader compilation fails. */
  onError?: (error: string) => void;
  /** Called when a frame is rendered with timing data. */
  onFrame?: (frameTime: number, fps: number) => void;
  /** CSS class name for the container. */
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function NativeShaderPreview({
  shaderCode,
  width = 1280,
  height = 720,
  autoStart = true,
  onError,
  onFrame,
  className = '',
}: NativeShaderPreviewProps) {
  const [state, actions] = useShaderPreview(30);
  const [showStats, setShowStats] = useState(true);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [benchmarking, setBenchmarking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevShaderRef = useRef<string | undefined>(undefined);

  // Initialize pipeline on mount
  useEffect(() => {
    if (state.isTauri && !state.ready && !state.initializing) {
      actions.init(width, height, shaderCode).then(() => {
        if (autoStart) {
          actions.start();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isTauri]);

  // Hot-reload shader when shaderCode changes
  useEffect(() => {
    if (state.ready && shaderCode && shaderCode !== prevShaderRef.current) {
      prevShaderRef.current = shaderCode;
      actions.updateShader(shaderCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shaderCode, state.ready]);

  // Propagate errors
  useEffect(() => {
    if (state.error && onError) {
      onError(state.error);
    }
  }, [state.error, onError]);

  // Propagate frame metrics
  useEffect(() => {
    if (state.frameTiming && onFrame) {
      onFrame(state.frameTiming.frame_time_ms, state.fps);
    }
  }, [state.frameTiming, state.fps, onFrame]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      actions.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run benchmark
  const handleBenchmark = useCallback(async () => {
    setBenchmarking(true);
    actions.stop();
    const result = await actions.benchmark(90);
    if (result) {
      setBenchmarkResult(result);
    }
    actions.start();
    setBenchmarking(false);
  }, [actions]);

  // Mouse tracking for shader uniforms
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    // Mouse position is read by the hook via ref
    // We could also pass it to the frame call, but the hook handles it
  }, []);

  // ─── Not in Tauri ─────────────────────────────────────────────────────────

  if (!state.isTauri) {
    return (
      <div className={`native-shader-preview bg-gray-900 border border-gray-700 rounded-lg p-6 flex flex-col items-center justify-center ${className}`}>
        <div className="text-gray-400 text-sm text-center">
          <div className="text-lg font-medium mb-2">Native GPU Preview</div>
          <div className="text-gray-500 mb-4">
            Requires HoloScript Studio Desktop (Tauri) for native wgpu rendering.
          </div>
          <div className="text-xs text-gray-600">
            The native preview renders shaders directly on your GPU via wgpu,<br />
            bypassing WebGL for maximum performance and WGSL compatibility.
          </div>
        </div>
      </div>
    );
  }

  // ─── Initializing ─────────────────────────────────────────────────────────

  if (state.initializing) {
    return (
      <div className={`native-shader-preview bg-gray-900 border border-gray-700 rounded-lg flex items-center justify-center ${className}`}>
        <div className="text-gray-400 text-sm">
          Initializing wgpu pipeline...
        </div>
      </div>
    );
  }

  // ─── Main Render ──────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`native-shader-preview bg-gray-900 border border-gray-700 rounded-lg overflow-hidden flex flex-col ${className}`}
      onMouseMove={handleMouseMove}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-purple-400">wgpu</span>
          <span className="text-xs text-gray-400">
            {width}x{height} @ {state.fps} fps
          </span>
          {state.frameTiming && (
            <span className={`text-xs ${state.frameTiming.within_budget ? 'text-green-400' : 'text-red-400'}`}>
              {state.frameTiming.frame_time_ms.toFixed(1)}ms
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStats(!showStats)}
            className={`px-2 py-0.5 text-xs rounded ${showStats ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
          >
            Stats
          </button>
          <button
            onClick={handleBenchmark}
            disabled={benchmarking || !state.ready}
            className="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50"
          >
            {benchmarking ? 'Running...' : 'Benchmark'}
          </button>
        </div>
      </div>

      {/* Preview Image */}
      <div className="flex-1 relative bg-black flex items-center justify-center">
        {state.frameDataUri ? (
          <img
            src={state.frameDataUri}
            alt="Shader Preview"
            className="max-w-full max-h-full object-contain"
            style={{ imageRendering: 'auto' }}
          />
        ) : (
          <div className="text-gray-600 text-sm">No frame rendered</div>
        )}

        {/* Error overlay */}
        {state.error && (
          <div className="absolute inset-x-0 bottom-0 mx-2 mb-2 rounded border border-red-500/60 bg-red-950/90 p-2 backdrop-blur-sm">
            <pre className="text-[10px] text-red-300 whitespace-pre-wrap overflow-auto max-h-24">
              {state.error}
            </pre>
          </div>
        )}
      </div>

      {/* Stats Panel */}
      {showStats && state.frameTiming && (
        <div className="px-3 py-2 border-t border-gray-700 bg-gray-800/80 text-[10px] text-gray-400 font-mono">
          <div className="grid grid-cols-4 gap-x-4 gap-y-0.5">
            <div>Frame: {state.frameTiming.frame_time_ms.toFixed(2)}ms</div>
            <div>Render: {state.frameTiming.render_time_ms.toFixed(2)}ms</div>
            <div>Readback: {state.frameTiming.readback_time_ms.toFixed(2)}ms</div>
            <div>Encode: {state.frameTiming.encode_time_ms.toFixed(2)}ms</div>
            <div>Frame #{state.frameTiming.frame_number}</div>
            <div>PNG: {(state.frameTiming.png_byte_length / 1024).toFixed(0)}KB</div>
            <div>Budget: {state.frameTiming.within_budget ? 'OK' : 'OVER'}</div>
            <div>FPS: {state.fps}</div>
          </div>

          {/* Init timings */}
          {state.initTimings && (
            <div className="mt-1 pt-1 border-t border-gray-700/50">
              Init: {state.initTimings.total_init_ms.toFixed(0)}ms
              (device: {state.initTimings.init_device_ms.toFixed(0)}ms,
              pipeline: {state.initTimings.create_pipeline_ms.toFixed(0)}ms)
            </div>
          )}

          {/* Benchmark results */}
          {benchmarkResult && (
            <div className="mt-1 pt-1 border-t border-gray-700/50 text-yellow-400">
              Benchmark ({benchmarkResult.frame_count} frames):
              avg={benchmarkResult.avg_frame_ms.toFixed(2)}ms
              p95={benchmarkResult.p95_frame_ms.toFixed(2)}ms
              fps={benchmarkResult.effective_fps.toFixed(1)}
              budget={((benchmarkResult.budget_hit_rate * 100).toFixed(1))}%
              {benchmarkResult.budget_hit_rate >= 0.95 ? ' PASS' : ' FAIL'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
