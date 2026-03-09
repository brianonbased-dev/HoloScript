/**
 * ComputeTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { computeHandler } from '../ComputeTrait';

function makeNode() {
  return { id: 'compute_node' };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...computeHandler.defaultConfig!, ...cfg };
  computeHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('computeHandler.defaultConfig', () => {
  const d = computeHandler.defaultConfig!;
  it('workgroup_size=[64,1,1]', () => expect(d.workgroup_size).toEqual([64, 1, 1]));
  it('dispatch=[1,1,1]', () => expect(d.dispatch).toEqual([1, 1, 1]));
  it('shader_source=""', () => expect(d.shader_source).toBe(''));
  it('bindings={}', () => expect(d.bindings).toEqual({}));
  it('auto_dispatch=false', () => expect(d.auto_dispatch).toBe(false));
  it('dispatch_on_update=false', () => expect(d.dispatch_on_update).toBe(false));
  it('shared_memory_size=0', () => expect(d.shared_memory_size).toBe(0));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('computeHandler.onAttach', () => {
  it('creates __computeState', () => expect(attach().node.__computeState).toBeDefined());
  it('isReady=false', () => expect(attach().node.__computeState.isReady).toBe(false));
  it('executionCount=0', () => expect(attach().node.__computeState.executionCount).toBe(0));
  it('lastDispatchTime=0', () => expect(attach().node.__computeState.lastDispatchTime).toBe(0));
  it('buffers is empty Map', () => expect(attach().node.__computeState.buffers.size).toBe(0));
  it('bindGroups is empty Map', () => expect(attach().node.__computeState.bindGroups.size).toBe(0));
  it('emits compute_init when shader_source is set', () => {
    const { ctx } = attach({ shader_source: '@compute fn main() {}' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_init',
      expect.objectContaining({ shaderSource: '@compute fn main() {}' })
    );
  });
  it('compute_init includes workgroupSize', () => {
    const { ctx } = attach({ shader_source: 'src', workgroup_size: [128, 1, 1] });
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_init',
      expect.objectContaining({ workgroupSize: [128, 1, 1] })
    );
  });
  it('compute_init includes sharedMemorySize', () => {
    const { ctx } = attach({ shader_source: 'src', shared_memory_size: 256 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_init',
      expect.objectContaining({ sharedMemorySize: 256 })
    );
  });
  it('no compute_init when shader_source is empty', () => {
    const { ctx } = attach({ shader_source: '' });
    expect(ctx.emit).not.toHaveBeenCalledWith('compute_init', expect.anything());
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('computeHandler.onDetach', () => {
  it('removes __computeState', () => {
    const { node, config, ctx } = attach();
    computeHandler.onDetach!(node, config, ctx);
    expect(node.__computeState).toBeUndefined();
  });
  it('emits compute_destroy when isReady=true', () => {
    const { node, config, ctx } = attach();
    node.__computeState.isReady = true;
    node.__computeState.buffers.set('myBuf', {});
    ctx.emit.mockClear();
    computeHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_destroy',
      expect.objectContaining({ buffers: ['myBuf'] })
    );
  });
  it('no compute_destroy when isReady=false', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    computeHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('compute_destroy', expect.anything());
  });
});

// ─── onEvent — compute_initialized ───────────────────────────────────────────

describe('computeHandler.onEvent — compute_initialized', () => {
  it('sets isReady=true', () => {
    const { node, ctx, config } = attach();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_initialized',
      shaderModule: {},
      pipeline: {},
    });
    expect(node.__computeState.isReady).toBe(true);
  });
  it('stores shaderModule and pipeline', () => {
    const { node, ctx, config } = attach();
    const mod = { id: 'module1' };
    const pipe = { id: 'pipe1' };
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_initialized',
      shaderModule: mod,
      pipeline: pipe,
    });
    expect(node.__computeState.shaderModule).toBe(mod);
    expect(node.__computeState.pipeline).toBe(pipe);
  });
  it('emits on_compute_ready', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_initialized',
      shaderModule: {},
      pipeline: {},
    });
    expect(ctx.emit).toHaveBeenCalledWith('on_compute_ready', expect.anything());
  });
});

// ─── onEvent — compute_dispatch ───────────────────────────────────────────────

describe('computeHandler.onEvent — compute_dispatch', () => {
  it('emits on_compute_error when not ready', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, { type: 'compute_dispatch' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_compute_error',
      expect.objectContaining({ error: 'Compute not initialized' })
    );
  });
  it('emits compute_execute when ready', () => {
    const { node, ctx, config } = attach({ dispatch: [4, 2, 1] });
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_initialized',
      shaderModule: {},
      pipeline: { tag: 'p' },
    });
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, { type: 'compute_dispatch' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_execute',
      expect.objectContaining({ dispatch: [4, 2, 1] })
    );
  });
  it('uses event.dispatch when provided', () => {
    const { node, ctx, config } = attach({ dispatch: [1, 1, 1] });
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_initialized',
      shaderModule: {},
      pipeline: {},
    });
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, { type: 'compute_dispatch', dispatch: [8, 4, 2] });
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_execute',
      expect.objectContaining({ dispatch: [8, 4, 2] })
    );
  });
  it('updates lastDispatchTime on dispatch', () => {
    const { node, ctx, config } = attach();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_initialized',
      shaderModule: {},
      pipeline: {},
    });
    computeHandler.onEvent!(node, config, ctx, { type: 'compute_dispatch' });
    expect(node.__computeState.lastDispatchTime).toBeGreaterThan(0);
  });
});

// ─── onEvent — compute_dispatch_indirect ──────────────────────────────────────

describe('computeHandler.onEvent — compute_dispatch_indirect', () => {
  it('emits compute_execute_indirect', () => {
    const { node, ctx, config } = attach();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_initialized',
      shaderModule: {},
      pipeline: {},
    });
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_dispatch_indirect',
      buffer: {},
      offset: 64,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_execute_indirect',
      expect.objectContaining({ offset: 64 })
    );
  });
  it('offset defaults to 0', () => {
    const { node, ctx, config } = attach();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_initialized',
      shaderModule: {},
      pipeline: {},
    });
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, { type: 'compute_dispatch_indirect', buffer: {} });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'compute_execute_indirect')!;
    expect(call[1].offset).toBe(0);
  });
});

// ─── onEvent — buffer events ──────────────────────────────────────────────────

describe('computeHandler.onEvent — buffer events', () => {
  it('compute_write_buffer emits on_compute_error when buffer not found', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_write_buffer',
      buffer: 'missing',
      data: [],
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_compute_error',
      expect.objectContaining({ error: expect.stringContaining('missing') })
    );
  });
  it('compute_write_buffer emits compute_buffer_write when buffer found', () => {
    const { node, ctx, config } = attach();
    node.__computeState.buffers.set('positions', { handle: 'h' });
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_write_buffer',
      buffer: 'positions',
      data: [1, 2, 3],
      offset: 4,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_buffer_write',
      expect.objectContaining({ offset: 4 })
    );
  });
  it('compute_read_buffer emits compute_buffer_read_error when buffer not found', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_read_buffer',
      buffer: 'ghost',
      callbackId: 'cb1',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_buffer_read_error',
      expect.objectContaining({ callbackId: 'cb1' })
    );
  });
  it('compute_read_buffer emits compute_buffer_read when found', () => {
    const { node, ctx, config } = attach();
    node.__computeState.buffers.set('velocities', { handle: 'h2' });
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_read_buffer',
      buffer: 'velocities',
      callbackId: 'cb2',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_buffer_read',
      expect.objectContaining({ bufferName: 'velocities', callbackId: 'cb2' })
    );
  });
  it('compute_buffer_data emits on_compute_data', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_buffer_data',
      bufferName: 'positions',
      data: [1],
      callbackId: 'cb',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_compute_data',
      expect.objectContaining({ bufferName: 'positions' })
    );
  });
  it('compute_buffer_created stores handle in buffers map', () => {
    const { node, ctx, config } = attach();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_buffer_created',
      name: 'buf1',
      handle: { h: 1 },
      group: 0,
    });
    expect(node.__computeState.buffers.has('buf1')).toBe(true);
  });
  it('compute_buffer_created emits compute_update_bind_group', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_buffer_created',
      name: 'buf1',
      handle: {},
      group: 0,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_update_bind_group',
      expect.objectContaining({ group: 0 })
    );
  });
  it('compute_bind_group_created stores bind group', () => {
    const { node, ctx, config } = attach();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_bind_group_created',
      group: 0,
      handle: { bg: 1 },
    });
    expect(node.__computeState.bindGroups.has(0)).toBe(true);
  });
  it('compute_create_buffer emits compute_allocate_buffer with correct size (f32=4 bytes)', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_create_buffer',
      binding: { name: 'buf', group: 0, binding: 0, usage: 'read', dataType: 'f32', size: 64 },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_allocate_buffer',
      expect.objectContaining({ size: 256 })
    ); // 64 * 4
  });
  it('compute_create_buffer uses mat4 (64 bytes)', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_create_buffer',
      binding: {
        name: 'transforms',
        group: 0,
        binding: 0,
        usage: 'read_write',
        dataType: 'mat4',
        size: 10,
      },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_allocate_buffer',
      expect.objectContaining({ size: 640 })
    ); // 10 * 64
  });
});

// ─── onEvent — compute_complete / compute_error / compute_query ───────────────

describe('computeHandler.onEvent — complete, error, query', () => {
  it('compute_complete increments executionCount', () => {
    const { node, ctx, config } = attach();
    computeHandler.onEvent!(node, config, ctx, { type: 'compute_complete', executionTime: 5 });
    expect(node.__computeState.executionCount).toBe(1);
  });
  it('compute_complete emits on_compute_complete with executionCount', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, { type: 'compute_complete', executionTime: 3 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_compute_complete',
      expect.objectContaining({ executionCount: 1, executionTime: 3 })
    );
  });
  it('compute_error emits on_compute_error', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, { type: 'compute_error', error: 'GPU OOM' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_compute_error',
      expect.objectContaining({ error: 'GPU OOM' })
    );
  });
  it('compute_set_shader emits compute_compile_shader', () => {
    const { node, ctx, config } = attach({ workgroup_size: [32, 1, 1] });
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_set_shader',
      source: 'new shader',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_compile_shader',
      expect.objectContaining({ source: 'new shader', workgroupSize: [32, 1, 1] })
    );
  });
  it('compute_query emits compute_info with isReady and executionCount', () => {
    const { node, ctx, config } = attach({ dispatch: [2, 2, 2] });
    computeHandler.onEvent!(node, config, ctx, { type: 'compute_complete', executionTime: 1 });
    ctx.emit.mockClear();
    computeHandler.onEvent!(node, config, ctx, { type: 'compute_query', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_info',
      expect.objectContaining({
        queryId: 'q1',
        isReady: false,
        executionCount: 1,
        dispatch: [2, 2, 2],
      })
    );
  });
});

// ─── onUpdate — dispatch_on_update ────────────────────────────────────────────

describe('computeHandler.onUpdate', () => {
  it('no-ops when not ready', () => {
    const { node, ctx, config } = attach({ dispatch_on_update: true });
    ctx.emit.mockClear();
    computeHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).not.toHaveBeenCalledWith('compute_execute', expect.anything());
  });
  it('emits compute_execute when dispatch_on_update=true and ready', () => {
    const { node, ctx, config } = attach({ dispatch_on_update: true, dispatch: [1, 1, 1] });
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_initialized',
      shaderModule: {},
      pipeline: {},
    });
    ctx.emit.mockClear();
    computeHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).toHaveBeenCalledWith(
      'compute_execute',
      expect.objectContaining({ dispatch: [1, 1, 1] })
    );
  });
  it('no compute_execute when dispatch_on_update=false', () => {
    const { node, ctx, config } = attach({ dispatch_on_update: false });
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_initialized',
      shaderModule: {},
      pipeline: {},
    });
    ctx.emit.mockClear();
    computeHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).not.toHaveBeenCalledWith('compute_execute', expect.anything());
  });
  it('updates lastDispatchTime on dispatch_on_update', () => {
    const { node, ctx, config } = attach({ dispatch_on_update: true });
    computeHandler.onEvent!(node, config, ctx, {
      type: 'compute_initialized',
      shaderModule: {},
      pipeline: {},
    });
    computeHandler.onUpdate!(node, config, ctx, 1);
    expect(node.__computeState.lastDispatchTime).toBeGreaterThan(0);
  });
});
