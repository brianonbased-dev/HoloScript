/**
 * Test setup: Mock WebGPU APIs for Node.js environment.
 *
 * WebGPU is a browser API, so we provide comprehensive mocks that simulate
 * the GPU pipeline creation, buffer management, and compute dispatch cycle.
 */

import { vi } from 'vitest';

// --- Mock GPU Buffer ---

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

// --- Mock Compute Pass Encoder ---

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

// --- Mock Command Encoder ---

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
    size: number,
  ): void {
    const srcData = new Uint8Array(source._getData());
    const copied = srcData.slice(sourceOffset, sourceOffset + size);
    destination._writeData(copied.buffer, destOffset);
  }

  finish(): any {
    return { __type: 'GPUCommandBuffer' };
  }
}

// --- Mock Bind Group Layout ---

class MockBindGroupLayout {
  label: string;
  constructor(label?: string) {
    this.label = label ?? '';
  }
}

// --- Mock Compute Pipeline ---

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

// --- Mock Bind Group ---

class MockBindGroup {
  label: string;
  constructor(descriptor: any) {
    this.label = descriptor.label ?? '';
  }
}

// --- Mock Shader Module ---

class MockShaderModule {
  label: string;
  constructor(descriptor: GPUShaderModuleDescriptor) {
    this.label = descriptor.label ?? '';
  }
}

// --- Mock GPU Device ---

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

// --- Mock GPU Adapter ---

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

// --- Mock navigator.gpu ---

const mockGPU = {
  requestAdapter: vi.fn().mockResolvedValue(new MockGPUAdapter()),
};

// Install mock
if (typeof globalThis.navigator === 'undefined') {
  (globalThis as any).navigator = {};
}
(globalThis.navigator as any).gpu = mockGPU;

// Mock GPUBufferUsage and GPUMapMode constants
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

(globalThis as any).GPUMapMode = {
  READ: 0x0001,
  WRITE: 0x0002,
};

// Mock performance.now if not available
if (typeof performance === 'undefined') {
  (globalThis as any).performance = {
    now: () => Date.now(),
  };
}

export { MockGPUBuffer, MockGPUDevice, MockGPUAdapter, MockCommandEncoder };
