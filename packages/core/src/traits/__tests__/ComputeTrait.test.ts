import { describe, it, expect, beforeEach } from 'vitest';
import { computeHandler } from '../ComputeTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('ComputeTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    workgroup_size: [64, 1, 1] as [number, number, number],
    dispatch: [4, 1, 1] as [number, number, number],
    shader_source: 'fn main() {}',
    bindings: {},
    auto_dispatch: false,
    dispatch_on_update: false,
    shared_memory_size: 0,
  };

  beforeEach(() => {
    node = createMockNode('comp');
    ctx = createMockContext();
    attachTrait(computeHandler, node, cfg, ctx);
  });

  it('emits compute_init on attach when shader source present', () => {
    expect(getEventCount(ctx, 'compute_init')).toBe(1);
    expect((node as any).__computeState.isReady).toBe(false);
  });

  it('compute_initialized marks ready', () => {
    sendEvent(computeHandler, node, cfg, ctx, {
      type: 'compute_initialized',
      shaderModule: 'sm',
      pipeline: 'pl',
    });
    expect((node as any).__computeState.isReady).toBe(true);
    expect(getEventCount(ctx, 'on_compute_ready')).toBe(1);
  });

  it('compute_dispatch emits execute when ready', () => {
    sendEvent(computeHandler, node, cfg, ctx, {
      type: 'compute_initialized',
      shaderModule: 'sm',
      pipeline: 'pl',
    });
    sendEvent(computeHandler, node, cfg, ctx, { type: 'compute_dispatch' });
    expect(getEventCount(ctx, 'compute_execute')).toBe(1);
  });

  it('compute_dispatch errors when not ready', () => {
    sendEvent(computeHandler, node, cfg, ctx, { type: 'compute_dispatch' });
    expect(getEventCount(ctx, 'on_compute_error')).toBe(1);
  });

  it('dispatch_on_update triggers auto dispatch', () => {
    const autoCfg = { ...cfg, dispatch_on_update: true };
    const n2 = createMockNode('au');
    const c2 = createMockContext();
    attachTrait(computeHandler, n2, autoCfg, c2);
    sendEvent(computeHandler, n2, autoCfg, c2, {
      type: 'compute_initialized',
      shaderModule: 'sm',
      pipeline: 'pl',
    });
    updateTrait(computeHandler, n2, autoCfg, c2, 0.016);
    expect(getEventCount(c2, 'compute_execute')).toBe(1);
  });

  it('buffer create and write flow', () => {
    sendEvent(computeHandler, node, cfg, ctx, {
      type: 'compute_create_buffer',
      binding: {
        name: 'data',
        group: 0,
        binding: 0,
        usage: 'read_write',
        dataType: 'f32',
        size: 256,
      },
    });
    expect(getEventCount(ctx, 'compute_allocate_buffer')).toBe(1);

    sendEvent(computeHandler, node, cfg, ctx, {
      type: 'compute_buffer_created',
      name: 'data',
      handle: 'h1',
      group: 0,
    });
    expect((node as any).__computeState.buffers.size).toBe(1);
  });

  it('write_buffer with missing buffer errors', () => {
    sendEvent(computeHandler, node, cfg, ctx, {
      type: 'compute_write_buffer',
      buffer: 'nope',
      data: 'x',
    });
    expect(getEventCount(ctx, 'on_compute_error')).toBe(1);
  });

  it('compute_complete increments execution count', () => {
    sendEvent(computeHandler, node, cfg, ctx, { type: 'compute_complete', executionTime: 1.5 });
    expect((node as any).__computeState.executionCount).toBe(1);
    expect(getEventCount(ctx, 'on_compute_complete')).toBe(1);
  });

  it('query returns state', () => {
    sendEvent(computeHandler, node, cfg, ctx, { type: 'compute_query', queryId: 'q1' });
    const info = getLastEvent(ctx, 'compute_info') as any;
    expect(info.queryId).toBe('q1');
    expect(info.isReady).toBe(false);
  });

  it('detach emits destroy when ready', () => {
    sendEvent(computeHandler, node, cfg, ctx, {
      type: 'compute_initialized',
      shaderModule: 'sm',
      pipeline: 'pl',
    });
    computeHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__computeState).toBeUndefined();
    expect(getEventCount(ctx, 'compute_destroy')).toBe(1);
  });
});
