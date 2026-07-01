/**
 * NativeShaderPreview - compatibility wrapper for the browser shader preview.
 *
 * The exported name stays stable for older imports, but the implementation is
 * browser-first: Three/WebGL when available, deterministic SVG frames in tests
 * and non-WebGL environments.
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  useShaderPreview,
  type BenchmarkResult,
  type ShaderPreviewBackend,
} from './useShaderPreview';

interface NativeShaderPreviewProps {
  /** Initial fragment shader code. GLSL is rendered directly; other formats get a live fallback. */
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

function backendLabel(backend: ShaderPreviewBackend): string {
  return backend === 'three-webgl' ? 'Three/WebGL' : 'SVG fallback';
}

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
  const bootedRef = useRef(false);
  const prevShaderRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    prevShaderRef.current = shaderCode;

    actions.init(width, height, shaderCode).then(() => {
      if (autoStart) {
        actions.start();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!state.ready || shaderCode === prevShaderRef.current) return;
    prevShaderRef.current = shaderCode;
    actions.updateShader(shaderCode ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shaderCode, state.ready]);

  useEffect(() => {
    if (!state.ready) return;
    actions.resize(width, height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, state.ready]);

  useEffect(() => {
    if (state.error && onError) {
      onError(state.error);
    }
  }, [state.error, onError]);

  useEffect(() => {
    if (state.frameTiming && onFrame) {
      onFrame(state.frameTiming.frame_time_ms, state.fps);
    }
  }, [state.frameTiming, state.fps, onFrame]);

  useEffect(() => {
    return () => {
      actions.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Keep the pointer math here for future shader uniform wiring. The hook
    // currently renders a centered preview when no pointer channel is exposed.
    const rect = e.currentTarget.getBoundingClientRect();
    void ((e.clientX - rect.left) / Math.max(rect.width, 1));
    void ((e.clientY - rect.top) / Math.max(rect.height, 1));
  }, []);

  return (
    <div
      ref={containerRef}
      className={`native-shader-preview bg-gray-900 border border-gray-700 rounded-lg overflow-hidden flex flex-col ${className}`}
      onMouseMove={handleMouseMove}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-cyan-300">Browser Shader Preview</span>
          <span className="text-xs text-gray-400">{backendLabel(state.backend)}</span>
          <span className="text-xs text-gray-400">
            {width}x{height} @ {state.fps} fps
          </span>
          {state.frameTiming && (
            <span
              className={`text-xs ${state.frameTiming.within_budget ? 'text-green-400' : 'text-yellow-300'}`}
            >
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

      <div className="flex-1 relative bg-black flex items-center justify-center">
        {state.frameDataUri ? (
          <img
            src={state.frameDataUri}
            alt="Shader Preview"
            className="max-w-full max-h-full object-contain"
            style={{ imageRendering: 'auto' }}
          />
        ) : state.initializing ? (
          <div className="text-gray-500 text-sm">Initializing browser preview...</div>
        ) : (
          <div className="text-gray-600 text-sm">No frame rendered</div>
        )}

        {state.error && (
          <div className="absolute inset-x-0 bottom-0 mx-2 mb-2 rounded border border-red-500/60 bg-red-950/90 p-2 backdrop-blur-sm">
            <pre className="text-[10px] text-red-300 whitespace-pre-wrap overflow-auto max-h-24">
              {state.error}
            </pre>
          </div>
        )}
      </div>

      {showStats && state.frameTiming && (
        <div className="px-3 py-2 border-t border-gray-700 bg-gray-800/80 text-[10px] text-gray-400 font-mono">
          <div className="grid grid-cols-4 gap-x-4 gap-y-0.5">
            <div>Frame: {state.frameTiming.frame_time_ms.toFixed(2)}ms</div>
            <div>Render: {state.frameTiming.render_time_ms.toFixed(2)}ms</div>
            <div>Readback: {state.frameTiming.readback_time_ms.toFixed(2)}ms</div>
            <div>Encode: {state.frameTiming.encode_time_ms.toFixed(2)}ms</div>
            <div>Frame #{state.frameTiming.frame_number}</div>
            <div>Payload: {(state.frameTiming.png_byte_length / 1024).toFixed(0)}KB</div>
            <div>Budget: {state.frameTiming.within_budget ? 'OK' : 'OVER'}</div>
            <div>Backend: {backendLabel(state.backend)}</div>
          </div>

          {state.initTimings && (
            <div className="mt-1 pt-1 border-t border-gray-700/50">
              Init: {state.initTimings.total_init_ms.toFixed(0)}ms (pipeline:{' '}
              {state.initTimings.create_pipeline_ms.toFixed(0)}ms)
            </div>
          )}

          {benchmarkResult && (
            <div className="mt-1 pt-1 border-t border-gray-700/50 text-yellow-400">
              Benchmark ({benchmarkResult.frame_count} frames): avg=
              {benchmarkResult.avg_frame_ms.toFixed(2)}ms p95=
              {benchmarkResult.p95_frame_ms.toFixed(2)}ms fps=
              {benchmarkResult.effective_fps.toFixed(1)}
              budget={(benchmarkResult.budget_hit_rate * 100).toFixed(1)}%
              {benchmarkResult.budget_hit_rate >= 0.95 ? ' PASS' : ' REVIEW'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
