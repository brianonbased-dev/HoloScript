/**
 * useShaderPreview — React hook for wgpu native shader preview via Tauri IPC.
 *
 * Manages the lifecycle of the shader-preview-wgpu Rust pipeline:
 *   init -> frame loop -> update (hot reload) -> resize -> destroy
 *
 * The rendered frame is returned as a base64 PNG data URI for display in an <img> tag.
 * This avoids WebGL entirely — rendering happens on the native GPU via wgpu.
 *
 * ## Architecture
 *
 * ```
 * React Component
 *   |
 *   v
 * useShaderPreview hook
 *   |-- Tauri invoke('shader_preview_init')    -> initializes wgpu headless
 *   |-- Tauri invoke('shader_preview_frame')   -> renders one frame, returns base64 PNG
 *   |-- Tauri invoke('shader_preview_update')  -> hot-reloads shader source
 *   |-- Tauri invoke('shader_preview_resize')  -> resizes render target
 *   |-- Tauri invoke('shader_preview_destroy') -> frees GPU resources
 *   v
 * <img src={frame.data_uri} />  <- zero-copy display
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FrameResult {
  data_uri: string | null;
  png_byte_length: number;
  frame_time_ms: number;
  render_time_ms: number;
  readback_time_ms: number;
  encode_time_ms: number;
  within_budget: boolean;
  frame_number: number;
  width: number;
  height: number;
}

export interface PipelineTimings {
  init_device_ms: number;
  create_pipeline_ms: number;
  total_init_ms: number;
}

export interface BenchmarkResult {
  frame_count: number;
  total_time_ms: number;
  avg_frame_ms: number;
  min_frame_ms: number;
  max_frame_ms: number;
  p50_frame_ms: number;
  p95_frame_ms: number;
  p99_frame_ms: number;
  avg_render_ms: number;
  avg_readback_ms: number;
  avg_encode_ms: number;
  frames_in_budget: number;
  budget_hit_rate: number;
  effective_fps: number;
  target_fps: number;
  resolution: [number, number];
}

export interface ShaderPreviewState {
  /** Whether the pipeline is initialized and ready to render. */
  ready: boolean;
  /** Whether the pipeline is currently initializing. */
  initializing: boolean;
  /** Current frame data URI (base64 PNG). */
  frameDataUri: string | null;
  /** Latest frame timing metrics. */
  frameTiming: FrameResult | null;
  /** Pipeline initialization timings. */
  initTimings: PipelineTimings | null;
  /** Error message if something went wrong. */
  error: string | null;
  /** Whether we're running in Tauri (vs browser-only). */
  isTauri: boolean;
  /** Running FPS counter. */
  fps: number;
}

export interface ShaderPreviewActions {
  /** Initialize the wgpu pipeline. */
  init: (width?: number, height?: number, shaderCode?: string) => Promise<void>;
  /** Start the render loop. */
  start: () => void;
  /** Stop the render loop. */
  stop: () => void;
  /** Hot-reload shader source. */
  updateShader: (wgslCode: string) => Promise<void>;
  /** Resize the render target. */
  resize: (width: number, height: number) => Promise<void>;
  /** Run benchmark and return results. */
  benchmark: (frameCount?: number) => Promise<BenchmarkResult | null>;
  /** Destroy the pipeline and free GPU resources. */
  destroy: () => Promise<void>;
}

// ─── Tauri Invoke Helper ─────────────────────────────────────────────────────

/** Dynamically import Tauri invoke — returns null if not in Tauri context. */
async function getTauriInvoke(): Promise<((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke as (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  } catch {
    return null;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Hook for managing the wgpu shader preview pipeline.
 *
 * @param targetFps - Target frame rate (default: 30)
 */
export function useShaderPreview(targetFps: number = 30): [ShaderPreviewState, ShaderPreviewActions] {
  const [state, setState] = useState<ShaderPreviewState>({
    ready: false,
    initializing: false,
    frameDataUri: null,
    frameTiming: null,
    initTimings: null,
    error: null,
    isTauri: false,
    fps: 0,
  });

  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const invokeRef = useRef<((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null>(null);
  const lastTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const fpsTimerRef = useRef(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  // Check if Tauri is available
  useEffect(() => {
    getTauriInvoke().then((invoke) => {
      invokeRef.current = invoke;
      setState((s) => ({ ...s, isTauri: invoke !== null }));
    });
  }, []);

  // FPS counter
  const updateFps = useCallback(() => {
    const now = performance.now();
    frameCountRef.current++;
    if (now - fpsTimerRef.current >= 1000) {
      setState((s) => ({ ...s, fps: frameCountRef.current }));
      frameCountRef.current = 0;
      fpsTimerRef.current = now;
    }
  }, []);

  // Frame loop
  const frameLoop = useCallback(async () => {
    if (!runningRef.current || !invokeRef.current) return;

    const now = performance.now();
    const elapsed = now - lastTimeRef.current;
    const frameInterval = 1000 / targetFps;

    if (elapsed >= frameInterval) {
      lastTimeRef.current = now - (elapsed % frameInterval);

      try {
        const result = await invokeRef.current('shader_preview_frame', {
          mouse_x: mouseRef.current.x,
          mouse_y: mouseRef.current.y,
        }) as FrameResult;

        setState((s) => ({
          ...s,
          frameDataUri: result.data_uri,
          frameTiming: result,
          error: null,
        }));

        updateFps();
      } catch (err) {
        setState((s) => ({ ...s, error: String(err) }));
      }
    }

    if (runningRef.current) {
      rafRef.current = requestAnimationFrame(frameLoop);
    }
  }, [targetFps, updateFps]);

  // Actions
  const actions: ShaderPreviewActions = {
    init: async (width = 1280, height = 720, shaderCode?: string) => {
      const invoke = invokeRef.current;
      if (!invoke) {
        setState((s) => ({ ...s, error: 'Not running in Tauri — native GPU preview unavailable' }));
        return;
      }

      setState((s) => ({ ...s, initializing: true, error: null }));

      try {
        const timingsJson = await invoke('shader_preview_init', {
          width,
          height,
          shader_code: shaderCode ?? null,
        }) as string;

        const timings: PipelineTimings = JSON.parse(timingsJson);

        setState((s) => ({
          ...s,
          ready: true,
          initializing: false,
          initTimings: timings,
          error: null,
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          ready: false,
          initializing: false,
          error: `Init failed: ${err}`,
        }));
      }
    },

    start: () => {
      runningRef.current = true;
      lastTimeRef.current = performance.now();
      fpsTimerRef.current = performance.now();
      frameCountRef.current = 0;
      rafRef.current = requestAnimationFrame(frameLoop);
    },

    stop: () => {
      runningRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },

    updateShader: async (wgslCode: string) => {
      const invoke = invokeRef.current;
      if (!invoke) return;

      try {
        const timingsJson = await invoke('shader_preview_update', {
          shader_code: wgslCode,
        }) as string;

        const timings: PipelineTimings = JSON.parse(timingsJson);
        setState((s) => ({ ...s, initTimings: timings, error: null }));
      } catch (err) {
        setState((s) => ({ ...s, error: `Shader update failed: ${err}` }));
      }
    },

    resize: async (width: number, height: number) => {
      const invoke = invokeRef.current;
      if (!invoke) return;

      try {
        await invoke('shader_preview_resize', { width, height });
      } catch (err) {
        setState((s) => ({ ...s, error: `Resize failed: ${err}` }));
      }
    },

    benchmark: async (frameCount = 90) => {
      const invoke = invokeRef.current;
      if (!invoke) return null;

      try {
        const resultJson = await invoke('shader_preview_benchmark', {
          frame_count: frameCount,
        }) as string;

        return JSON.parse(resultJson) as BenchmarkResult;
      } catch (err) {
        setState((s) => ({ ...s, error: `Benchmark failed: ${err}` }));
        return null;
      }
    },

    destroy: async () => {
      actions.stop();
      const invoke = invokeRef.current;
      if (!invoke) return;

      try {
        await invoke('shader_preview_destroy');
        setState((s) => ({
          ...s,
          ready: false,
          frameDataUri: null,
          frameTiming: null,
        }));
      } catch (err) {
        setState((s) => ({ ...s, error: `Destroy failed: ${err}` }));
      }
    },
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      // Best-effort cleanup — don't await
      if (invokeRef.current) {
        invokeRef.current('shader_preview_destroy').catch(() => {});
      }
    };
  }, []);

  return [state, actions];
}
