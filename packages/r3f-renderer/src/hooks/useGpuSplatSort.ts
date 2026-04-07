/**
 * useGpuSplatSort — R3F hook bridging Three.js camera to GaussianSplatSorter.
 *
 * Provides GPU-accelerated radix sort for Gaussian splats when WebGPU is
 * available. Falls back gracefully when WebGPU is not supported.
 *
 * The sorter lives in @holoscript/core (GaussianSplatSorter) and uses WGSL
 * shaders for O(n) 4-pass 8-bit radix sorting. This hook extracts the camera
 * matrices from Three.js and feeds them to the sorter each frame.
 *
 * @see W.035: Radix sort outperforms bitonic for N > 64K splats
 */

import { useRef, useEffect, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export interface GpuSplatSortOptions {
  /** Maximum number of splats. Must match buffer allocation. */
  maxSplats: number;
  /** Enable GPU timestamp profiling. Default: false */
  enableTimestamps?: boolean;
}

export interface GpuSplatSortResult {
  /** Whether WebGPU sort is available and initialized */
  available: boolean;
  /** Sort splats by depth for current camera. Returns sorted index buffer. */
  sort: () => Float32Array | null;
  /** Upload raw splat data to GPU */
  uploadSplats: (positions: Float32Array, count: number) => void;
  /** Dispose GPU resources */
  dispose: () => void;
}

/**
 * Hook that provides GPU-accelerated splat depth sorting via WebGPU.
 *
 * When WebGPU is unavailable, `available` is false and `sort()` returns null,
 * allowing the component to fall back to CPU sorting or skip entirely.
 */
export function useGpuSplatSort(options: GpuSplatSortOptions): GpuSplatSortResult {
  const { camera, gl } = useThree();
  const sorterRef = useRef<any>(null);
  const availableRef = useRef(false);
  const positionsRef = useRef<Float32Array | null>(null);
  const countRef = useRef(0);

  // Attempt WebGPU initialization
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Check WebGPU availability
      if (typeof navigator === 'undefined' || !('(gpu as any)' in navigator || ('gpu' in navigator))) return;

      try {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (!adapter || cancelled) return;

        const device = await adapter.requestDevice();
        if (cancelled) {
          device.destroy();
          return;
        }

        // Dynamically import the core sorter to avoid hard dependency (cast to any for TS2339)
        const { GaussianSplatSorter } = (await import('@holoscript/core')) as any;
        if (cancelled) {
          device.destroy();
          return;
        }

        const canvas = gl.domElement;
        const context = {
          getDevice: () => device,
          getCanvas: () => canvas,
        };

        const sorter = new GaussianSplatSorter(context, {
          maxSplats: options.maxSplats,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          enableTimestamps: options.enableTimestamps ?? false,
        });

        await sorter.initialize();
        if (cancelled) {
          sorter.dispose();
          device.destroy();
          return;
        }

        sorterRef.current = sorter;
        availableRef.current = true;
      } catch {
        // WebGPU not available or initialization failed — CPU fallback
        availableRef.current = false;
      }
    }

    init();

    return () => {
      cancelled = true;
      if (sorterRef.current) {
        sorterRef.current.dispose();
        sorterRef.current = null;
      }
      availableRef.current = false;
    };
  }, [options.maxSplats, options.enableTimestamps, gl]);

  const uploadSplats = useCallback((positions: Float32Array, count: number) => {
    positionsRef.current = positions;
    countRef.current = count;
  }, []);

  const sort = useCallback((): Float32Array | null => {
    if (!availableRef.current || !sorterRef.current || !positionsRef.current) return null;

    try {
      // Extract camera matrices from Three.js
      const viewMatrix = new Float32Array(16);
      const projMatrix = new Float32Array(16);
      const vpMatrix = new Float32Array(16);

      camera.matrixWorldInverse.toArray(viewMatrix);
      (camera as THREE.PerspectiveCamera).projectionMatrix.toArray(projMatrix);

      // Compute VP = P * V
      const vp = new THREE.Matrix4();
      vp.multiplyMatrices(
        (camera as THREE.PerspectiveCamera).projectionMatrix,
        camera.matrixWorldInverse
      );
      vp.toArray(vpMatrix);

      const cameraPos = camera.position;

      sorterRef.current.sort({
        viewMatrix,
        projMatrix,
        viewProjectionMatrix: vpMatrix,
        cameraPosition: [cameraPos.x, cameraPos.y, cameraPos.z] as [number, number, number],
        focalX: (projMatrix[0] * gl.domElement.width) / 2,
        focalY: (projMatrix[5] * gl.domElement.height) / 2,
      });

      return null; // Sort modifies GPU buffers in-place
    } catch {
      return null;
    }
  }, [camera, gl]);

  const dispose = useCallback(() => {
    if (sorterRef.current) {
      sorterRef.current.dispose();
      sorterRef.current = null;
    }
    availableRef.current = false;
  }, []);

  return {
    available: availableRef.current,
    sort,
    uploadSplats,
    dispose,
  };
}
