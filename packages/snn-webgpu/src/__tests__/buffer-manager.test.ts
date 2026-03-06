/**
 * Tests for BufferManager - GPU buffer lifecycle management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GPUContext } from '../gpu-context.js';
import { BufferManager } from '../buffer-manager.js';

describe('BufferManager', () => {
  let ctx: GPUContext;
  let manager: BufferManager;

  beforeEach(async () => {
    ctx = new GPUContext();
    await ctx.initialize();
    manager = new BufferManager(ctx.device);
  });

  afterEach(() => {
    manager.destroyAll();
    ctx.destroy();
  });

  describe('createBuffer', () => {
    it('should create a buffer with specified size', () => {
      const handle = manager.createBuffer({
        size: 1024,
        usage: GPUBufferUsage.STORAGE,
        label: 'test-buffer',
      });

      expect(handle.buffer).toBeDefined();
      expect(handle.size).toBe(1024);
      expect(handle.label).toBe('test-buffer');
    });

    it('should align buffer size to 4 bytes', () => {
      const handle = manager.createBuffer({
        size: 7,
        usage: GPUBufferUsage.STORAGE,
        label: 'unaligned',
      });

      expect(handle.size).toBe(8); // ceil(7/4)*4 = 8
    });

    it('should accept initial data', () => {
      const data = new Float32Array([1.0, 2.0, 3.0, 4.0]);
      const handle = manager.createBuffer({
        size: data.byteLength,
        usage: GPUBufferUsage.STORAGE,
        label: 'with-data',
        initialData: data,
      });

      expect(handle.buffer).toBeDefined();
      expect(handle.size).toBe(16);
    });

    it('should register labeled buffers', () => {
      manager.createBuffer({
        size: 64,
        usage: GPUBufferUsage.STORAGE,
        label: 'registered',
      });

      expect(manager.hasBuffer('registered')).toBe(true);
      expect(manager.getBuffer('registered')).toBeDefined();
    });
  });

  describe('createStorageBuffer', () => {
    it('should create from Float32Array', () => {
      const data = new Float32Array([1.0, 2.0, 3.0]);
      const handle = manager.createStorageBuffer(data, 'storage');

      expect(handle.buffer).toBeDefined();
      expect(handle.size).toBe(12);
    });

    it('should create from byte count', () => {
      const handle = manager.createStorageBuffer(256, 'storage-bytes');

      expect(handle.buffer).toBeDefined();
      expect(handle.size).toBe(256);
    });
  });

  describe('createZeroBuffer', () => {
    it('should create zero-initialized buffer', () => {
      const handle = manager.createZeroBuffer(100, 'zeros');

      expect(handle.buffer).toBeDefined();
      expect(handle.size).toBe(400); // 100 * 4 bytes
    });
  });

  describe('writeBuffer', () => {
    it('should write data to buffer', () => {
      const handle = manager.createBuffer({
        size: 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        label: 'writable',
      });

      const data = new Float32Array([1.0, 2.0, 3.0, 4.0]);
      manager.writeBuffer(handle, data);

      expect(ctx.device.queue.writeBuffer).toHaveBeenCalledWith(
        handle.buffer,
        0,
        data.buffer,
        data.byteOffset,
        data.byteLength,
      );
    });

    it('should write data at specified offset', () => {
      const handle = manager.createBuffer({
        size: 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        label: 'offset-write',
      });

      const data = new Float32Array([5.0, 6.0]);
      manager.writeBuffer(handle, data, 8);

      expect(ctx.device.queue.writeBuffer).toHaveBeenCalledWith(
        handle.buffer,
        8,
        data.buffer,
        data.byteOffset,
        data.byteLength,
      );
    });
  });

  describe('readBuffer', () => {
    it('should read buffer data back to CPU', async () => {
      const initData = new Float32Array([1.0, 2.0, 3.0, 4.0]);
      const handle = manager.createBuffer({
        size: initData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        label: 'readable',
        initialData: initData,
      });

      const result = await manager.readBuffer(handle);

      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(4);
      expect(result.readbackTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('destroyBuffer', () => {
    it('should destroy a specific buffer', () => {
      manager.createBuffer({
        size: 64,
        usage: GPUBufferUsage.STORAGE,
        label: 'to-destroy',
      });

      expect(manager.hasBuffer('to-destroy')).toBe(true);
      manager.destroyBuffer('to-destroy');
      expect(manager.hasBuffer('to-destroy')).toBe(false);
    });

    it('should be safe to destroy non-existent buffer', () => {
      manager.destroyBuffer('nonexistent'); // Should not throw
    });
  });

  describe('destroyAll', () => {
    it('should destroy all buffers', () => {
      manager.createBuffer({ size: 64, usage: GPUBufferUsage.STORAGE, label: 'a' });
      manager.createBuffer({ size: 64, usage: GPUBufferUsage.STORAGE, label: 'b' });
      manager.createBuffer({ size: 64, usage: GPUBufferUsage.STORAGE, label: 'c' });

      expect(manager.bufferCount).toBe(3);
      manager.destroyAll();
      expect(manager.bufferCount).toBe(0);
    });
  });

  describe('getTotalAllocatedBytes', () => {
    it('should track total allocated memory', () => {
      manager.createBuffer({ size: 100, usage: GPUBufferUsage.STORAGE, label: 'a' });
      manager.createBuffer({ size: 200, usage: GPUBufferUsage.STORAGE, label: 'b' });

      expect(manager.getTotalAllocatedBytes()).toBe(300);
    });
  });

  describe('bufferCount', () => {
    it('should track number of managed buffers', () => {
      expect(manager.bufferCount).toBe(0);

      manager.createBuffer({ size: 64, usage: GPUBufferUsage.STORAGE, label: 'a' });
      expect(manager.bufferCount).toBe(1);

      manager.createBuffer({ size: 64, usage: GPUBufferUsage.STORAGE, label: 'b' });
      expect(manager.bufferCount).toBe(2);
    });
  });
});
