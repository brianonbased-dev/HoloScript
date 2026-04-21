/**
 * Test setup: Prefer live Dawn GPU, fall back to mocks.
 *
 * When the `webgpu` (Dawn) npm package is installed, this setup will
 * initialise a real GPUAdapter/GPUDevice backed by your local GPU.
 * If Dawn is not available (CI, no GPU), it installs comprehensive
 * mocks that simulate the pipeline.
 *
 * Set SNN_FORCE_MOCK=1 to force mock mode even when Dawn is present.
 */

import { vi } from 'vitest';

// ── Global state ───────────────────────────────────────────────────────────

/** True when tests are running against real GPU hardware. */
export let GPU_LIVE = false;

// ── Attempt Dawn initialisation ────────────────────────────────────────────

async function tryDawnGPU(): Promise<boolean> {
  if (process.env.SNN_FORCE_MOCK === '1') return false;

  try {
    // The `webgpu` npm package v0.3.x exports { create, globals }
    // `globals` is an object (not a function), `create()` returns a GPU instance.
    const { create } = await import('webgpu');

    if (typeof create !== 'function') return false;

    // Create a GPU instance backed by Dawn (local hardware GPU)
    const gpuInstance = create([]);

    // Prefer the discrete (high-performance) GPU on dual-GPU systems.
    // Falls back to any available adapter if no high-perf adapter is found.
    let adapter = await gpuInstance.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      adapter = await gpuInstance.requestAdapter();
    }
    if (!adapter) return false;

    // Install navigator.gpu globally so downstream code works transparently
    if (typeof globalThis.navigator === 'undefined') {
      (globalThis as any).navigator = {};
    }
    (globalThis.navigator as any).gpu = gpuInstance;

    console.log('[snn-webgpu] ✅ Live GPU detected via Dawn');
    const info = (adapter as any).info ?? { vendor: 'unknown', architecture: 'unknown' };
    console.log(`[snn-webgpu]    Vendor: ${info.vendor}, Arch: ${info.architecture}`);
    console.log(
      `[snn-webgpu]    maxBufferSize: ${(adapter as any).limits?.maxBufferSize ?? 'unknown'}`
    );
    return true;
  } catch (e: any) {
    // Dawn not installed or failed — fall through to mocks
    console.log(`[snn-webgpu] Dawn init error: ${e.message}`);
  }
  return false;
}

// ── Mock classes (only used when no real GPU) ──────────────────────────────

class MockGPUBuffer {
  label: string;
  size: number;
  usage: number;
  private data: ArrayBuffer;
  private mapped = false;
  private destroyed = false;

  constructor(descriptor: GPUBufferDescriptor) {
    this.label = descriptor.label ?? '';
    this.size = descriptor.size;
    this.usage = descriptor.usage;
    this.data = new ArrayBuffer(descriptor.size);
    if (descriptor.mappedAtCreation) {
      this.mapped = true;
    }
  }

  getMappedRange(offset?: number, size?: number): ArrayBuffer {
    if (!this.mapped) throw new Error('Buffer is not mapped');
    const off = offset ?? 0;
    const sz = size ?? this.size - off;
    return this.data.slice(off, off + sz);
  }

  unmap(): void {
    this.mapped = false;
  }

  async mapAsync(mode: number): Promise<void> {
    this.mapped = true;
  }

  destroy(): void {
    this.destroyed = true;
  }

  // Test helper: write data directly into the buffer
  _writeData(data: ArrayBufferLike, offset: number = 0): void {
    const src = new Uint8Array(data);
    const dst = new Uint8Array(this.data);
    dst.set(src, offset);
  }

  _getData(): ArrayBuffer {
    return this.data.slice(0);
  }
}

class MockComputePassEncoder {
  private pipeline: any = null;
  private bindGroups: Map<number, any> = new Map();

  setPipeline(pipeline: any): void {
    this.pipeline = pipeline;
  }

  setBindGroup(index: number, bindGroup: any): void {
    this.bindGroups.set(index, bindGroup);
  }

  dispatchWorkgroups(x: number, y?: number, z?: number): void {
    // No-op in mock - real GPU would execute compute shader
  }

  end(): void {
    // No-op
  }
}

class MockCommandEncoder {
  label: string;

  constructor(descriptor?: GPUCommandEncoderDescriptor) {
    this.label = descriptor?.label ?? '';
  }

  beginComputePass(descriptor?: GPUComputePassDescriptor): MockComputePassEncoder {
    return new MockComputePassEncoder();
  }

  copyBufferToBuffer(
    source: MockGPUBuffer,
    sourceOffset: number,
    destination: MockGPUBuffer,
    destOffset: number,
    size: number
  ): void {
    const srcData = new Uint8Array(source._getData());
    const copied = srcData.slice(sourceOffset, sourceOffset + size);
    destination._writeData(copied.buffer, destOffset);
  }

  finish(): any {
    return { __type: 'GPUCommandBuffer' };
  }
}

class MockBindGroupLayout {
  label: string;
  constructor(label?: string) {
    this.label = label ?? '';
  }
}

class MockComputePipeline {
  label: string;
  private layout: MockBindGroupLayout;

  constructor(descriptor: any) {
    this.label = descriptor.label ?? '';
    this.layout = new MockBindGroupLayout(descriptor.label);
  }

  getBindGroupLayout(index: number): MockBindGroupLayout {
    return this.layout;
  }
}

class MockBindGroup {
  label: string;
  constructor(descriptor: any) {
    this.label = descriptor.label ?? '';
  }
}

class MockShaderModule {
  label: string;
  constructor(descriptor: GPUShaderModuleDescriptor) {
    this.label = descriptor.label ?? '';
  }

  async getCompilationInfo(): Promise<GPUCompilationInfo> {
    return { messages: [] } as unknown as GPUCompilationInfo;
  }
}

class MockGPUDevice {
  label: string = 'mock-device';
  features = new Set<string>();
  limits = {
    maxComputeWorkgroupSizeX: 256,
    maxComputeWorkgroupSizeY: 256,
    maxComputeWorkgroupSizeZ: 64,
    maxComputeWorkgroupsPerDimension: 65535,
    maxStorageBufferBindingSize: 128 * 1024 * 1024,
    maxBufferSize: 256 * 1024 * 1024,
    maxComputeInvocationsPerWorkgroup: 256,
  };
  lost = Promise.resolve({ message: '', reason: 'destroyed' as const });

  queue = {
    submit: vi.fn(),
    onSubmittedWorkDone: vi.fn().mockResolvedValue(undefined),
    writeBuffer: vi.fn((buffer: MockGPUBuffer, offset: number, data: ArrayBufferView) => {
      const src = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      buffer._writeData(src.buffer, offset);
    }),
  };

  createBuffer(descriptor: GPUBufferDescriptor): MockGPUBuffer {
    return new MockGPUBuffer(descriptor);
  }

  createShaderModule(descriptor: GPUShaderModuleDescriptor): MockShaderModule {
    return new MockShaderModule(descriptor);
  }

  createComputePipeline(descriptor: any): MockComputePipeline {
    return new MockComputePipeline(descriptor);
  }

  async createComputePipelineAsync(descriptor: any): Promise<MockComputePipeline> {
    return new MockComputePipeline(descriptor);
  }

  createBindGroup(descriptor: any): MockBindGroup {
    return new MockBindGroup(descriptor);
  }

  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): MockCommandEncoder {
    return new MockCommandEncoder(descriptor);
  }

  destroy(): void {
    // No-op
  }
}

class MockGPUAdapter {
  features = new Set<string>();
  limits = {
    maxBufferSize: 256 * 1024 * 1024,
    maxStorageBufferBindingSize: 128 * 1024 * 1024,
  };

  async requestDevice(descriptor?: any): Promise<MockGPUDevice> {
    const device = new MockGPUDevice();
    device.label = descriptor?.label ?? 'mock-device';

    // Override the lost promise to never resolve during tests
    device.lost = new Promise(() => {});

    return device as any;
  }

  async requestAdapterInfo(): Promise<any> {
    return {
      vendor: 'mock-vendor',
      architecture: 'mock-arch',
    };
  }
}

// ── Install mocks ──────────────────────────────────────────────────────────

function installMocks(): void {
  console.log('[snn-webgpu] 🔶 No Dawn GPU — using mock WebGPU layer');

  const mockGPU = {
    requestAdapter: vi.fn().mockResolvedValue(new MockGPUAdapter()),
  };

  if (typeof globalThis.navigator === 'undefined') {
    (globalThis as any).navigator = {};
  }
  (globalThis.navigator as any).gpu = mockGPU;
}

// ── Ensure GPU constants exist ─────────────────────────────────────────────

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
      INDIRECT: 0x0100,
      QUERY_RESOLVE: 0x0200,
    };
  }

  if (typeof (globalThis as any).GPUMapMode === 'undefined') {
    (globalThis as any).GPUMapMode = {
      READ: 0x0001,
      WRITE: 0x0002,
    };
  }

  if (typeof performance === 'undefined') {
    (globalThis as any).performance = {
      now: () => Date.now(),
    };
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

const isLive = await tryDawnGPU();
GPU_LIVE = isLive;

if (!isLive) {
  installMocks();
}

ensureGPUConstants();

export { MockGPUBuffer, MockGPUDevice, MockGPUAdapter, MockCommandEncoder };
