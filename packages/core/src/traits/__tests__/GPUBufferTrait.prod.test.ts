/**
 * GPUBufferTrait — Production Test Suite
 *
 * gpuBufferHandler stores state on node.__gpuBufferState.
 *
 * Key behaviours:
 * 1. defaultConfig — all 6 fields
 * 2. onAttach — state init (isAllocated=false, pendingWrites=[], etc.),
 *              emits gpu_buffer_create with label fallback
 * 3. onDetach — emits gpu_buffer_destroy when isAllocated; removes state
 * 4. onUpdate — no-op when !isAllocated; no-op when isMapped;
 *               flushes pendingWrites via gpu_buffer_write events when not mapped
 * 5. onEvent — gpu_buffer_created: sets isAllocated, writes initial_data, emits on_buffer_ready;
 *              gpu_buffer_error: emits on_gpu_error;
 *              buffer_write: queues when isMapped, immediate emit when not;
 *              buffer_read: emits gpu_buffer_read;
 *              buffer_read_complete: emits on_buffer_read;
 *              buffer_map/unmap: sets isMapped flag;
 *              buffer_resize: emits gpu_buffer_resize;
 *              buffer_clear: emits gpu_buffer_clear;
 *              buffer_query: emits buffer_info snapshot
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gpuBufferHandler } from '../GPUBufferTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'gpu_node', properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof gpuBufferHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...gpuBufferHandler.defaultConfig!, ...cfg };
  gpuBufferHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('gpuBufferHandler.defaultConfig', () => {
  const d = gpuBufferHandler.defaultConfig!;
  it('size=1024', () => expect(d.size).toBe(1024));
  it('usage=storage', () => expect(d.usage).toBe('storage'));
  it('initial_data=""', () => expect(d.initial_data).toBe(''));
  it('shared=false', () => expect(d.shared).toBe(false));
  it('label=""', () => expect(d.label).toBe(''));
  it('mapped_at_creation=false', () => expect(d.mapped_at_creation).toBe(false));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('gpuBufferHandler.onAttach', () => {
  it('initialises __gpuBufferState with isAllocated=false', () => {
    const { node } = attach();
    expect((node as any).__gpuBufferState.isAllocated).toBe(false);
  });

  it('pendingWrites starts empty', () => {
    const { node } = attach();
    expect((node as any).__gpuBufferState.pendingWrites).toEqual([]);
  });

  it('size seeded from config.size', () => {
    const { node } = attach({ size: 4096 });
    expect((node as any).__gpuBufferState.size).toBe(4096);
  });

  it('emits gpu_buffer_create with usage and config label', () => {
    const { ctx } = attach({ size: 512, usage: 'vertex', label: 'verts' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_buffer_create',
      expect.objectContaining({ size: 512, usage: 'vertex', label: 'verts' })
    );
  });

  it('uses fallback label buffer_<timestamp> when label is empty', () => {
    const { ctx } = attach({ label: '' });
    const call = ctx.emit.mock.calls.find(([ev]: string[]) => ev === 'gpu_buffer_create');
    expect(call).toBeDefined();
    expect(call![1].label).toMatch(/^buffer_\d+$/);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('gpuBufferHandler.onDetach', () => {
  it('emits gpu_buffer_destroy when isAllocated=true', () => {
    const { node, ctx, config } = attach();
    (node as any).__gpuBufferState.isAllocated = true;
    gpuBufferHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('gpu_buffer_destroy', expect.objectContaining({ node }));
  });

  it('does NOT emit gpu_buffer_destroy when isAllocated=false', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gpuBufferHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('gpu_buffer_destroy', expect.anything());
  });

  it('removes __gpuBufferState', () => {
    const { node, ctx, config } = attach();
    gpuBufferHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__gpuBufferState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('gpuBufferHandler.onUpdate', () => {
  it('no-op when isAllocated=false', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gpuBufferHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('no-op when isMapped=true (writes stay queued)', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__gpuBufferState;
    state.isAllocated = true;
    state.isMapped = true;
    state.pendingWrites.push({ offset: 0, data: new ArrayBuffer(4) });
    ctx.emit.mockClear();
    gpuBufferHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('gpu_buffer_write', expect.anything());
    expect(state.pendingWrites.length).toBe(1); // still queued
  });

  it('flushes pendingWrites via gpu_buffer_write when not mapped', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__gpuBufferState;
    state.isAllocated = true;
    state.isMapped = false;
    const buf1 = new ArrayBuffer(8);
    const buf2 = new ArrayBuffer(4);
    state.pendingWrites.push({ offset: 0, data: buf1 }, { offset: 8, data: buf2 });
    ctx.emit.mockClear();
    gpuBufferHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledTimes(2);
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_buffer_write',
      expect.objectContaining({ offset: 0, data: buf1 })
    );
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_buffer_write',
      expect.objectContaining({ offset: 8, data: buf2 })
    );
    expect(state.pendingWrites).toHaveLength(0);
  });
});

// ─── onEvent — gpu_buffer_created ────────────────────────────────────────────

describe('gpuBufferHandler.onEvent — gpu_buffer_created', () => {
  it('sets isAllocated=true', () => {
    const { node, ctx, config } = attach();
    gpuBufferHandler.onEvent!(node as any, config, ctx as any, {
      type: 'gpu_buffer_created',
      buffer: {},
      size: 1024,
      accuracy: 1,
    });
    expect((node as any).__gpuBufferState.isAllocated).toBe(true);
  });

  it('emits on_buffer_ready', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gpuBufferHandler.onEvent!(node as any, config, ctx as any, {
      type: 'gpu_buffer_created',
      buffer: {},
      size: 2048,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_buffer_ready',
      expect.objectContaining({ size: 2048 })
    );
  });

  it('writes initial_data string as encoded bytes', () => {
    const { node, ctx, config } = attach({ initial_data: 'hello' });
    ctx.emit.mockClear();
    gpuBufferHandler.onEvent!(node as any, config, ctx as any, {
      type: 'gpu_buffer_created',
      buffer: {},
      size: 1024,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_buffer_write',
      expect.objectContaining({ offset: 0 })
    );
  });

  it('does NOT emit gpu_buffer_write when initial_data is empty', () => {
    const { node, ctx, config } = attach({ initial_data: '' });
    ctx.emit.mockClear();
    gpuBufferHandler.onEvent!(node as any, config, ctx as any, {
      type: 'gpu_buffer_created',
      buffer: {},
      size: 1024,
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('gpu_buffer_write', expect.anything());
  });
});

// ─── onEvent — gpu_buffer_error ──────────────────────────────────────────────

describe('gpuBufferHandler.onEvent — gpu_buffer_error', () => {
  it('emits on_gpu_error with the error', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gpuBufferHandler.onEvent!(node as any, config, ctx as any, {
      type: 'gpu_buffer_error',
      error: 'OOM',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_gpu_error',
      expect.objectContaining({ error: 'OOM' })
    );
  });
});

// ─── onEvent — buffer_write ───────────────────────────────────────────────────

describe('gpuBufferHandler.onEvent — buffer_write', () => {
  it('emits gpu_buffer_write immediately when not mapped', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__gpuBufferState;
    state.isMapped = false;
    const buf = new ArrayBuffer(8);
    ctx.emit.mockClear();
    gpuBufferHandler.onEvent!(node as any, config, ctx as any, {
      type: 'buffer_write',
      offset: 16,
      data: buf,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_buffer_write',
      expect.objectContaining({ offset: 16, data: buf })
    );
  });

  it('updates lastWriteTime on immediate write', () => {
    const { node, ctx, config } = attach();
    (node as any).__gpuBufferState.isMapped = false;
    const before = Date.now();
    gpuBufferHandler.onEvent!(node as any, config, ctx as any, {
      type: 'buffer_write',
      offset: 0,
      data: new ArrayBuffer(4),
    });
    expect((node as any).__gpuBufferState.lastWriteTime).toBeGreaterThanOrEqual(before);
  });

  it('queues write when isMapped=true', () => {
    const { node, ctx, config } = attach();
    (node as any).__gpuBufferState.isMapped = true;
    const buf = new ArrayBuffer(8);
    gpuBufferHandler.onEvent!(node as any, config, ctx as any, {
      type: 'buffer_write',
      offset: 0,
      data: buf,
    });
    expect((node as any).__gpuBufferState.pendingWrites).toHaveLength(1);
    expect((node as any).__gpuBufferState.pendingWrites[0]).toEqual({ offset: 0, data: buf });
  });
});

// ─── onEvent — buffer_map / buffer_unmap ─────────────────────────────────────

describe('gpuBufferHandler.onEvent — buffer_map/unmap', () => {
  it('buffer_map sets isMapped=true and emits gpu_buffer_map', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gpuBufferHandler.onEvent!(node as any, config, ctx as any, {
      type: 'buffer_map',
      mode: 'write',
    });
    expect((node as any).__gpuBufferState.isMapped).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_buffer_map',
      expect.objectContaining({ mode: 'write' })
    );
  });

  it('buffer_unmap sets isMapped=false and emits gpu_buffer_unmap', () => {
    const { node, ctx, config } = attach();
    (node as any).__gpuBufferState.isMapped = true;
    ctx.emit.mockClear();
    gpuBufferHandler.onEvent!(node as any, config, ctx as any, { type: 'buffer_unmap' });
    expect((node as any).__gpuBufferState.isMapped).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('gpu_buffer_unmap', expect.objectContaining({ node }));
  });
});

// ─── onEvent — buffer_resize / buffer_clear ──────────────────────────────────

describe('gpuBufferHandler.onEvent — resize/clear', () => {
  it('buffer_resize emits gpu_buffer_resize with size and preserveData=true', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gpuBufferHandler.onEvent!(node as any, config, ctx as any, {
      type: 'buffer_resize',
      size: 8192,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_buffer_resize',
      expect.objectContaining({ size: 8192, preserveData: true })
    );
  });

  it('buffer_clear emits gpu_buffer_clear with offset and size', () => {
    const { node, ctx, config } = attach({ size: 2048 });
    ctx.emit.mockClear();
    gpuBufferHandler.onEvent!(node as any, config, ctx as any, {
      type: 'buffer_clear',
      offset: 0,
      size: 512,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_buffer_clear',
      expect.objectContaining({ offset: 0, size: 512 })
    );
  });
});

// ─── onEvent — buffer_query ───────────────────────────────────────────────────

describe('gpuBufferHandler.onEvent — buffer_query', () => {
  it('emits buffer_info snapshot', () => {
    const { node, ctx, config } = attach({ size: 512 });
    const state = (node as any).__gpuBufferState;
    state.isAllocated = true;
    state.isMapped = false;
    state.lastWriteTime = 999;
    ctx.emit.mockClear();
    gpuBufferHandler.onEvent!(node as any, config, ctx as any, {
      type: 'buffer_query',
      queryId: 'q1',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'buffer_info',
      expect.objectContaining({
        queryId: 'q1',
        isAllocated: true,
        size: 512,
        isMapped: false,
        lastWriteTime: 999,
        pendingWriteCount: 0,
      })
    );
  });
});
