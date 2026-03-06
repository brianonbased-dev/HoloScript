/**
 * WebGPU utility functions for initializing devices, compiling shaders,
 * and managing GPU resources for neural activity visualization.
 */

import type { WebGPUContext, ColorMap } from './types';

/**
 * Check whether WebGPU is available in the current environment.
 */
export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Request a GPUAdapter and GPUDevice, returning null if unavailable.
 */
export async function requestDevice(): Promise<GPUDevice | null> {
  if (!isWebGPUSupported()) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  return device;
}

/**
 * Initialize WebGPU on a canvas element, returning the full context bundle.
 */
export async function initWebGPU(
  canvas: HTMLCanvasElement,
): Promise<WebGPUContext | null> {
  const device = await requestDevice();
  if (!device) return null;

  const context = canvas.getContext('webgpu');
  if (!context) return null;

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  return { device, context, format, canvas };
}

/**
 * Create a shader module from WGSL source code.
 */
export function createShaderModule(
  device: GPUDevice,
  code: string,
  label?: string,
): GPUShaderModule {
  return device.createShaderModule({ code, label });
}

/**
 * Create a GPU buffer and optionally upload initial data.
 */
export function createBuffer(
  device: GPUDevice,
  size: number,
  usage: GPUBufferUsageFlags,
  data?: ArrayBufferView,
  label?: string,
): GPUBuffer {
  const buffer = device.createBuffer({
    size,
    usage,
    mappedAtCreation: !!data,
    label,
  });
  if (data) {
    const dst = new Float32Array(buffer.getMappedRange());
    dst.set(new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4));
    buffer.unmap();
  }
  return buffer;
}

/**
 * Upload data to an existing GPU buffer.
 */
export function writeBuffer(
  device: GPUDevice,
  buffer: GPUBuffer,
  data: ArrayBufferView,
  offset = 0,
): void {
  device.queue.writeBuffer(buffer, offset, data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Generate a color stop array for a named color map.
 * Returns a flat Float32Array of [r, g, b, a] values for N stops.
 */
export function generateColorMapData(
  colorMap: ColorMap,
  stops = 256,
): Float32Array {
  const data = new Float32Array(stops * 4);
  for (let i = 0; i < stops; i++) {
    const t = i / (stops - 1);
    const [r, g, b] = colorMapLookup(colorMap.name, t);
    data[i * 4 + 0] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 1.0;
  }
  return data;
}

/**
 * Look up a color from a named color map at parameter t in [0, 1].
 * Implements viridis, plasma, and coolwarm as common scientific maps.
 */
export function colorMapLookup(
  name: string,
  t: number,
): [number, number, number] {
  const tc = Math.max(0, Math.min(1, t));

  switch (name) {
    case 'viridis':
      return viridis(tc);
    case 'plasma':
      return plasma(tc);
    case 'coolwarm':
      return coolwarm(tc);
    default:
      return viridis(tc);
  }
}

/** Simplified viridis approximation. */
function viridis(t: number): [number, number, number] {
  const r = Math.max(0, Math.min(1, -0.027 + 0.068 * t + 1.536 * t * t - 0.577 * t * t * t));
  const g = Math.max(0, Math.min(1, 0.004 + 1.514 * t - 1.247 * t * t + 0.729 * t * t * t));
  const b = Math.max(0, Math.min(1, 0.330 + 1.155 * t - 2.592 * t * t + 1.108 * t * t * t));
  return [r, g, b];
}

/** Simplified plasma approximation. */
function plasma(t: number): [number, number, number] {
  const r = Math.max(0, Math.min(1, 0.050 + 2.436 * t - 1.486 * t * t));
  const g = Math.max(0, Math.min(1, -0.065 + 0.131 * t + 1.934 * t * t - 1.0 * t * t * t));
  const b = Math.max(0, Math.min(1, 0.533 + 0.751 * t - 2.784 * t * t + 1.5 * t * t * t));
  return [r, g, b];
}

/** Coolwarm diverging color map: blue -> white -> red. */
function coolwarm(t: number): [number, number, number] {
  if (t < 0.5) {
    const s = t * 2;
    return [s, s, 1.0];
  }
  const s = (t - 0.5) * 2;
  return [1.0, 1.0 - s, 1.0 - s];
}

/**
 * Normalize a voltage value to [0, 1] for color mapping.
 */
export function normalizeVoltage(
  voltage: number,
  minV: number,
  maxV: number,
): number {
  if (maxV === minV) return 0.5;
  return Math.max(0, Math.min(1, (voltage - minV) / (maxV - minV)));
}

/**
 * Clean up GPU resources.
 */
export function destroyWebGPUContext(ctx: WebGPUContext | null): void {
  if (!ctx) return;
  ctx.device.destroy();
}
