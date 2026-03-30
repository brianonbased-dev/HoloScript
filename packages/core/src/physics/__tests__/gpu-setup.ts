/**
 * GPU test setup for physics tests.
 *
 * Prefers live Dawn GPU (via `webgpu` npm package), falls back to mock layer.
 * Set PHYSICS_FORCE_MOCK=1 to force mock mode even when Dawn is present.
 *
 * Adapted from snn-webgpu/src/__tests__/setup.ts
 */

import { vi } from 'vitest';

/** True when tests are running against real GPU hardware. */
export let GPU_LIVE = false;

/** Resolved GPUDevice (real or mock) — set after bootstrap. */
export let testDevice: GPUDevice | null = null;

async function tryDawnGPU(): Promise<boolean> {
  if (process.env.PHYSICS_FORCE_MOCK === '1') return false;

  try {
    const { create } = await import('webgpu');
    if (typeof create !== 'function') return false;

    const gpuInstance = create([]);
    let adapter = await gpuInstance.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) adapter = await gpuInstance.requestAdapter();
    if (!adapter) return false;

    const device = await adapter.requestDevice();
    testDevice = device as unknown as GPUDevice;

    if (typeof globalThis.navigator === 'undefined') {
      (globalThis as any).navigator = {};
    }
    (globalThis.navigator as any).gpu = gpuInstance;

    console.log('[physics] Live GPU detected via Dawn');
    return true;
  } catch {
    return false;
  }
}

// ── Mock classes ────────────────────────────────────────────────────────────

class MockGPUBuffer {
  label: string;
  size: number;
  usage: number;
  private data: ArrayBuffer;

  constructor(descriptor: GPUBufferDescriptor) {
    this.label = descriptor.label ?? '';
    this.size = descriptor.size;
    this.usage = descriptor.usage;
    this.data = new ArrayBuffer(descriptor.size);
  }

  getMappedRange(): ArrayBuffer {
    return this.data.slice(0);
  }
  unmap(): void {}
  async mapAsync(): Promise<void> {}
  destroy(): void {}
  _writeData(data: ArrayBufferLike, offset = 0): void {
    new Uint8Array(this.data).set(new Uint8Array(data), offset);
  }
}

class MockComputePassEncoder {
  setPipeline(): void {}
  setBindGroup(): void {}
  dispatchWorkgroups(): void {}
  end(): void {}
}

class MockCommandEncoder {
  beginComputePass(): MockComputePassEncoder {
    return new MockComputePassEncoder();
  }
  copyBufferToBuffer(): void {}
  finish(): any {
    return {};
  }
}

class MockGPUDevice {
  label = 'mock-device';
  features = new Set<string>();
  limits = {
    maxComputeWorkgroupSizeX: 256,
    maxStorageBufferBindingSize: 128 * 1024 * 1024,
    maxBufferSize: 256 * 1024 * 1024,
  };
  queue = {
    submit: vi.fn(),
    onSubmittedWorkDone: vi.fn().mockResolvedValue(undefined),
    writeBuffer: vi.fn((buffer: MockGPUBuffer, offset: number, data: ArrayBufferView) => {
      const src = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      buffer._writeData(src.buffer, offset);
    }),
  };
  createBuffer(d: GPUBufferDescriptor): MockGPUBuffer {
    return new MockGPUBuffer(d);
  }
  createShaderModule(): any {
    return {};
  }
  createComputePipeline(d: any): any {
    return { label: d?.label ?? '', getBindGroupLayout: () => ({}) };
  }
  createBindGroup(): any {
    return {};
  }
  createCommandEncoder(): MockCommandEncoder {
    return new MockCommandEncoder();
  }
  destroy(): void {}
}

function installMocks(): void {
  console.log('[physics] No Dawn GPU — using mock WebGPU layer');
  testDevice = new MockGPUDevice() as unknown as GPUDevice;
  if (typeof globalThis.navigator === 'undefined') {
    (globalThis as any).navigator = {};
  }
  (globalThis.navigator as any).gpu = {
    requestAdapter: vi.fn().mockResolvedValue({
      requestDevice: vi.fn().mockResolvedValue(testDevice),
    }),
  };
}

function ensureGPUConstants(): void {
  if (typeof (globalThis as any).GPUBufferUsage === 'undefined') {
    (globalThis as any).GPUBufferUsage = {
      MAP_READ: 0x0001,
      MAP_WRITE: 0x0002,
      COPY_SRC: 0x0004,
      COPY_DST: 0x0008,
      INDEX: 0x0010,
      VERTEX: 0x0020,
      UNIFORM: 0x0040,
      STORAGE: 0x0080,
    };
  }
  if (typeof (globalThis as any).GPUMapMode === 'undefined') {
    (globalThis as any).GPUMapMode = { READ: 0x0001, WRITE: 0x0002 };
  }
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

const isLive = await tryDawnGPU();
GPU_LIVE = isLive;

if (!isLive) {
  installMocks();
}

ensureGPUConstants();

export { MockGPUDevice, MockGPUBuffer };
