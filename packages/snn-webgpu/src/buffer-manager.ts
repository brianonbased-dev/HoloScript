/**
 * @holoscript/snn-webgpu - GPU Buffer Manager
 *
 * Manages GPU buffer allocation, data transfer, and async readback.
 * Provides a pool-based approach to minimize allocation overhead.
 */

import type { GPUBufferHandle, ReadbackResult } from './types.js';

/** Buffer creation options. */
export interface BufferCreateOptions {
  /** Size in bytes. */
  size: number;
  /** GPUBufferUsage flags. */
  usage: GPUBufferUsageFlags;
  /** Human-readable label. */
  label?: string;
  /** Initial data to write. */
  initialData?: Float32Array | Uint32Array;
  /** Whether this buffer will be mapped at creation. Default: false */
  mappedAtCreation?: boolean;
}

/**
 * Manages GPU buffer lifecycle including creation, data upload,
 * async readback, and cleanup.
 */
export class BufferManager {
  private device: GPUDevice;
  private buffers: Map<string, GPUBufferHandle> = new Map();
  private stagingBuffers: GPUBuffer[] = [];

  constructor(device: GPUDevice) {
    this.device = device;
  }

  /**
   * Create a GPU buffer and register it with the manager.
   */
  createBuffer(options: BufferCreateOptions): GPUBufferHandle {
    const { size, usage, label, initialData, mappedAtCreation } = options;

    // Ensure 4-byte alignment for storage buffers
    const alignedSize = Math.ceil(size / 4) * 4;

    const buffer = this.device.createBuffer({
      label: label ?? `snn-buffer-${this.buffers.size}`,
      size: alignedSize,
      usage,
      mappedAtCreation: mappedAtCreation ?? !!initialData,
    });

    if (initialData) {
      const mapped = new Float32Array(buffer.getMappedRange());
      mapped.set(initialData instanceof Float32Array ? initialData : new Float32Array(initialData.buffer));
      buffer.unmap();
    }

    const handle: GPUBufferHandle = {
      buffer,
      size: alignedSize,
      label: label ?? `snn-buffer-${this.buffers.size}`,
    };

    if (label) {
      this.buffers.set(label, handle);
    }

    return handle;
  }

  /**
   * Create a uniform buffer with initial data.
   */
  createUniformBuffer(data: ArrayBuffer, label?: string): GPUBufferHandle {
    const alignedSize = Math.ceil(data.byteLength / 16) * 16; // Uniform buffers need 16-byte alignment
    return this.createBuffer({
      size: alignedSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: label ?? 'uniform-buffer',
      initialData: new Float32Array(data),
    });
  }

  /**
   * Create a storage buffer (read/write).
   */
  createStorageBuffer(
    sizeOrData: number | Float32Array,
    label?: string,
    readOnly: boolean = false,
  ): GPUBufferHandle {
    const isData = sizeOrData instanceof Float32Array;
    const size = isData ? sizeOrData.byteLength : sizeOrData;

    return this.createBuffer({
      size,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
      label: label ?? 'storage-buffer',
      initialData: isData ? sizeOrData : undefined,
      mappedAtCreation: isData,
    });
  }

  /**
   * Create a zero-initialized storage buffer.
   */
  createZeroBuffer(elementCount: number, label?: string): GPUBufferHandle {
    const data = new Float32Array(elementCount);
    return this.createStorageBuffer(data, label);
  }

  /**
   * Write data to an existing buffer via queue.writeBuffer.
   */
  writeBuffer(handle: GPUBufferHandle, data: Float32Array | Uint32Array, offset: number = 0): void {
    this.device.queue.writeBuffer(
      handle.buffer,
      offset,
      data.buffer as ArrayBuffer,
      data.byteOffset,
      data.byteLength,
    );
  }

  /**
   * Async readback: copy GPU buffer contents to CPU.
   * Creates a staging buffer, copies, maps, and reads.
   */
  async readBuffer(handle: GPUBufferHandle, byteOffset: number = 0, byteLength?: number): Promise<ReadbackResult> {
    const readSize = byteLength ?? handle.size;
    const start = performance.now();

    // Create a staging (MAP_READ) buffer
    const staging = this.device.createBuffer({
      label: `staging-${handle.label}`,
      size: readSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this.stagingBuffers.push(staging);

    // Copy from source to staging
    const encoder = this.device.createCommandEncoder({
      label: `readback-${handle.label}`,
    });
    encoder.copyBufferToBuffer(handle.buffer, byteOffset, staging, 0, readSize);
    this.device.queue.submit([encoder.finish()]);

    // Map and read
    await staging.mapAsync(GPUMapMode.READ);
    const mappedRange = staging.getMappedRange();
    const data = new Float32Array(mappedRange.slice(0));
    staging.unmap();

    const readbackTimeMs = performance.now() - start;

    return { data, readbackTimeMs };
  }

  /**
   * Get a previously created buffer by label.
   */
  getBuffer(label: string): GPUBufferHandle | undefined {
    return this.buffers.get(label);
  }

  /**
   * Check if a buffer exists with the given label.
   */
  hasBuffer(label: string): boolean {
    return this.buffers.has(label);
  }

  /**
   * Destroy a single buffer.
   */
  destroyBuffer(label: string): void {
    const handle = this.buffers.get(label);
    if (handle) {
      handle.buffer.destroy();
      this.buffers.delete(label);
    }
  }

  /**
   * Destroy all managed buffers and staging buffers.
   */
  destroyAll(): void {
    for (const handle of this.buffers.values()) {
      handle.buffer.destroy();
    }
    this.buffers.clear();

    for (const staging of this.stagingBuffers) {
      staging.destroy();
    }
    this.stagingBuffers = [];
  }

  /**
   * Get total allocated GPU memory in bytes.
   */
  getTotalAllocatedBytes(): number {
    let total = 0;
    for (const handle of this.buffers.values()) {
      total += handle.size;
    }
    for (const staging of this.stagingBuffers) {
      total += staging.size;
    }
    return total;
  }

  /**
   * Get the number of managed buffers.
   */
  get bufferCount(): number {
    return this.buffers.size;
  }
}
