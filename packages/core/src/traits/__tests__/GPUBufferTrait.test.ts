import { describe, it, expect, beforeEach } from 'vitest';
import { gpuBufferHandler } from '../GPUBufferTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount, getLastEvent } from './traitTestHelpers';

describe('GPUBufferTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    size: 1024,
    usage: 'storage' as const,
    initial_data: '',
    shared: false,
    label: 'test-buf',
    mapped_at_creation: false,
  };

  beforeEach(() => {
    node = createMockNode('buf');
    ctx = createMockContext();
    attachTrait(gpuBufferHandler, node, cfg, ctx);
  });

  it('emits gpu_buffer_create on attach', () => {
    expect(getEventCount(ctx, 'gpu_buffer_create')).toBe(1);
    expect((node as any).__gpuBufferState.isAllocated).toBe(false);
  });

  it('gpu_buffer_created allocates and signals ready', () => {
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'gpu_buffer_created', buffer: 'handle', size: 1024 });
    expect((node as any).__gpuBufferState.isAllocated).toBe(true);
    expect(getEventCount(ctx, 'on_buffer_ready')).toBe(1);
  });

  it('initial_data triggers write on creation', () => {
    const dataCfg = { ...cfg, initial_data: 'hello' };
    const n2 = createMockNode('d');
    const c2 = createMockContext();
    attachTrait(gpuBufferHandler, n2, dataCfg, c2);
    sendEvent(gpuBufferHandler, n2, dataCfg, c2, { type: 'gpu_buffer_created', buffer: 'h', size: 1024 });
    expect(getEventCount(c2, 'gpu_buffer_write')).toBe(1);
  });

  it('buffer_write emits gpu_buffer_write', () => {
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'gpu_buffer_created', buffer: 'h', size: 1024 });
    const data = new ArrayBuffer(16);
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'buffer_write', offset: 0, data });
    expect(getEventCount(ctx, 'gpu_buffer_write')).toBe(1);
  });

  it('buffer_write queues when mapped', () => {
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'gpu_buffer_created', buffer: 'h', size: 1024 });
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'buffer_map', mode: 'read' });
    expect((node as any).__gpuBufferState.isMapped).toBe(true);
    const data = new ArrayBuffer(8);
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'buffer_write', offset: 0, data });
    expect((node as any).__gpuBufferState.pendingWrites).toHaveLength(1);
  });

  it('pending writes flushed on update when unmapped', () => {
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'gpu_buffer_created', buffer: 'h', size: 1024 });
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'buffer_map', mode: 'read' });
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'buffer_write', offset: 0, data: new ArrayBuffer(8) });
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'buffer_unmap' });
    updateTrait(gpuBufferHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'gpu_buffer_write')).toBe(1);
  });

  it('buffer_read emits read request', () => {
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'gpu_buffer_created', buffer: 'h', size: 1024 });
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'buffer_read', offset: 0, size: 64, callbackId: 'r1' });
    expect(getEventCount(ctx, 'gpu_buffer_read')).toBe(1);
  });

  it('buffer_resize emits resize', () => {
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'buffer_resize', size: 2048, preserveData: true });
    expect(getEventCount(ctx, 'gpu_buffer_resize')).toBe(1);
  });

  it('query returns state', () => {
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'buffer_query', queryId: 'q1' });
    const info = getLastEvent(ctx, 'buffer_info') as any;
    expect(info.queryId).toBe('q1');
    expect(info.size).toBe(1024);
  });

  it('detach destroys allocated buffer', () => {
    sendEvent(gpuBufferHandler, node, cfg, ctx, { type: 'gpu_buffer_created', buffer: 'h', size: 1024 });
    gpuBufferHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__gpuBufferState).toBeUndefined();
    expect(getEventCount(ctx, 'gpu_buffer_destroy')).toBe(1);
  });
});
