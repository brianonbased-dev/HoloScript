/**
 * Hook for managing WebGPU device initialization and lifecycle.
 * Handles adapter/device request, canvas configuration, and cleanup.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WebGPUContext } from '../types';
import { initWebGPU, destroyWebGPUContext } from '../webgpu-utils';

export interface UseWebGPUResult {
  /** The WebGPU context bundle, null until initialized. */
  gpuContext: WebGPUContext | null;
  /** Ref to attach to the canvas element. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Whether WebGPU is supported in the current browser. */
  isSupported: boolean;
  /** Error message if initialization failed. */
  error: string | null;
  /** Whether initialization is in progress. */
  isLoading: boolean;
}

export function useWebGPU(
  width: number,
  height: number,
): UseWebGPUResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gpuContext, setGpuContext] = useState<WebGPUContext | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const contextRef = useRef<WebGPUContext | null>(null);

  const initialize = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setError('Canvas element not available');
      setIsLoading(false);
      return;
    }

    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      setIsSupported(false);
      setError('WebGPU is not supported in this browser');
      setIsLoading(false);
      return;
    }

    try {
      canvas.width = width;
      canvas.height = height;

      const ctx = await initWebGPU(canvas);
      if (!ctx) {
        setIsSupported(false);
        setError('Failed to initialize WebGPU');
        setIsLoading(false);
        return;
      }

      contextRef.current = ctx;
      setGpuContext(ctx);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown WebGPU error');
      setIsLoading(false);
    }
  }, [width, height]);

  useEffect(() => {
    initialize();

    return () => {
      destroyWebGPUContext(contextRef.current);
      contextRef.current = null;
      setGpuContext(null);
    };
  }, [initialize]);

  return { gpuContext, canvasRef, isSupported, error, isLoading };
}
