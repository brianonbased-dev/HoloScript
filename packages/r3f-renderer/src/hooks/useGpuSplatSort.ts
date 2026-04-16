/**
 * useGpuSplatSort — R3F hook bridging Three.js camera to engine GaussianSplatSorter.
 *
 * Loads {@link GaussianSplatSorter} from `@holoscript/engine/gpu`, uploads WGSL-aligned
 * raw splat buffers, runs radix sort each frame, and **submits** the WebGPU command
 * buffer so the GPU pipeline actually executes.
 *
 * @see W.035: Radix sort outperforms bitonic for N > 64K splats
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

import type { CameraState, GaussianSplatSorter, WebGPUContext } from '@holoscript/engine/gpu';

export interface GpuSplatSortOptions {
  /** Maximum number of splats. Must match buffer allocation. */
  maxSplats: number;
  /** Enable GPU timestamp profiling. Default: false */
  enableTimestamps?: boolean;
}

/** Raw splat arrays matching engine `SplatRaw` / WGSL layout (64 bytes per splat). */
export interface SplatUploadPayload {
  positions: Float32Array;
  scales: Float32Array;
  rotations: Float32Array;
  colors: Float32Array;
  count: number;
}

export interface GpuSplatSortResult {
  /** Whether WebGPU sort is available and initialized */
  available: boolean;
  /** Sort splats by depth for current camera (submits GPU work). */
  sort: () => Float32Array | null;
  /** Pack and upload raw splat data to GPU (64-byte WGSL layout per splat). */
  uploadSplats: (payload: SplatUploadPayload) => void;
  /** Dispose GPU resources */
  dispose: () => void;
}

/** WGSL `SplatRaw` storage layout: vec3+pad, vec3+pad, vec4, vec4 = 64 bytes. */
function packWgslSplatRaw64(payload: SplatUploadPayload, reuse: Float32Array | null): Float32Array {
  const { positions, scales, rotations, colors, count } = payload;
  const floatsPerSplat = 16; // 64 bytes
  const need = count * floatsPerSplat;
  const buf =
    reuse && reuse.length >= need ? reuse : new Float32Array(Math.max(need, floatsPerSplat * Math.max(count, 1)));

  for (let i = 0; i < count; i++) {
    const o = i * floatsPerSplat;
    buf[o + 0] = positions[i * 3];
    buf[o + 1] = positions[i * 3 + 1];
    buf[o + 2] = positions[i * 3 + 2];
    buf[o + 3] = 0; // pad
    buf[o + 4] = scales[i * 3];
    buf[o + 5] = scales[i * 3 + 1];
    buf[o + 6] = scales[i * 3 + 2];
    buf[o + 7] = 0;
    buf[o + 8] = rotations[i * 4];
    buf[o + 9] = rotations[i * 4 + 1];
    buf[o + 10] = rotations[i * 4 + 2];
    buf[o + 11] = rotations[i * 4 + 3];
    buf[o + 12] = colors[i * 4];
    buf[o + 13] = colors[i * 4 + 1];
    buf[o + 14] = colors[i * 4 + 2];
    buf[o + 15] = colors[i * 4 + 3];
  }
  return buf;
}

export function useGpuSplatSort(options: GpuSplatSortOptions): GpuSplatSortResult {
  const { camera, gl } = useThree();
  const sorterRef = useRef<GaussianSplatSorter | null>(null);
  const deviceRef = useRef<GPUDevice | null>(null);
  const [available, setAvailable] = useState(false);
  const packedRef = useRef<Float32Array | null>(null);
  const countRef = useRef(0);

  const vpMatrixScratch = useRef(new THREE.Matrix4());
  const viewMatrixBuf = useRef(new Float32Array(16));
  const projMatrixBuf = useRef(new Float32Array(16));
  const vpMatrixBuf = useRef(new Float32Array(16));

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) return;

      try {
        const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter();
        if (!adapter || cancelled) return;

        const device = await adapter.requestDevice();
        if (cancelled) {
          device.destroy();
          return;
        }

        const { GaussianSplatSorter } = await import('@holoscript/engine/gpu');
        if (cancelled) {
          device.destroy();
          return;
        }

        const canvas = gl.domElement;
        const gpuContext = { getDevice: () => device } as WebGPUContext;

        const sorter = new GaussianSplatSorter(gpuContext, {
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

        deviceRef.current = device;
        sorterRef.current = sorter;
        setAvailable(true);
      } catch {
        setAvailable(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (sorterRef.current) {
        sorterRef.current.dispose();
        sorterRef.current = null;
      }
      if (deviceRef.current) {
        deviceRef.current = null;
      }
      setAvailable(false);
    };
  }, [options.maxSplats, options.enableTimestamps, gl]);

  const uploadSplats = useCallback((payload: SplatUploadPayload) => {
    const sorter = sorterRef.current;
    if (!sorter) return;

    const packed = packWgslSplatRaw64(payload, packedRef.current);
    packedRef.current = packed;
    countRef.current = payload.count;

    sorter.uploadSplatData(packed, payload.count);
  }, []);

  const sort = useCallback((): Float32Array | null => {
    const sorter = sorterRef.current;
    const device = deviceRef.current;
    if (!sorter || !device || countRef.current === 0) return null;

    try {
      const viewMatrix = viewMatrixBuf.current;
      const projMatrix = projMatrixBuf.current;
      const vpMatrix = vpMatrixBuf.current;

      camera.updateMatrixWorld(true);
      camera.matrixWorldInverse.toArray(viewMatrix);
      camera.projectionMatrix.toArray(projMatrix);
      vpMatrixScratch.current
        .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
        .toArray(vpMatrix);

      const cameraPos = camera.position;
      const w = gl.domElement.width || 1;
      const h = gl.domElement.height || 1;

      const cam: CameraState = {
        viewMatrix,
        projMatrix,
        viewProjectionMatrix: vpMatrix,
        cameraPosition: [cameraPos.x, cameraPos.y, cameraPos.z],
        focalX: (projMatrix[0] * w) / 2,
        focalY: (projMatrix[5] * h) / 2,
      };

      const encoder = sorter.sort(cam);
      device.queue.submit([encoder.finish()]);

      return null;
    } catch {
      return null;
    }
  }, [camera, gl]);

  const dispose = useCallback(() => {
    if (sorterRef.current) {
      sorterRef.current.dispose();
      sorterRef.current = null;
    }
    deviceRef.current = null;
    setAvailable(false);
  }, []);

  return {
    available,
    sort,
    uploadSplats,
    dispose,
  };
}
