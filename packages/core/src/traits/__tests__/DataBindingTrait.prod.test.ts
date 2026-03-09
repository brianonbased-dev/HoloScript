/**
 * DataBindingTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { dataBindingHandler } from '../DataBindingTrait';

function makeNode(extras: any = {}) {
  return { id: 'db_node', ...extras };
}
function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: any = {}, nodeExtras: any = {}) {
  const node = makeNode(nodeExtras);
  const ctx = makeCtx();
  const config = { ...dataBindingHandler.defaultConfig!, ...cfg };
  dataBindingHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('dataBindingHandler.defaultConfig', () => {
  const d = dataBindingHandler.defaultConfig!;
  it('source="" ', () => expect(d.source).toBe(''));
  it('source_type=rest', () => expect(d.source_type).toBe('rest'));
  it('bindings=[]', () => expect(d.bindings).toHaveLength(0));
  it('refresh_rate=1000', () => expect(d.refresh_rate).toBe(1000));
  it('interpolation=true', () => expect(d.interpolation).toBe(true));
  it('interpolation_speed=5', () => expect(d.interpolation_speed).toBe(5));
  it('auth_header=""', () => expect(d.auth_header).toBe(''));
  it('reconnect_interval=5000', () => expect(d.reconnect_interval).toBe(5000));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('dataBindingHandler.onAttach', () => {
  it('creates __dataBindingState', () => expect(attach().node.__dataBindingState).toBeDefined());
  it('isConnected=false', () => expect(attach().node.__dataBindingState.isConnected).toBe(false));
  it('lastRefresh=0', () => expect(attach().node.__dataBindingState.lastRefresh).toBe(0));
  it('currentData={}', () => expect(attach().node.__dataBindingState.currentData).toEqual({}));
  it('connectionHandle=null', () =>
    expect(attach().node.__dataBindingState.connectionHandle).toBeNull());
  it('errorCount=0', () => expect(attach().node.__dataBindingState.errorCount).toBe(0));
  it('emits data_binding_connect when source is set', () => {
    const { ctx } = attach({ source: 'https://api.example.com/data', source_type: 'rest' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'data_binding_connect',
      expect.objectContaining({ source: 'https://api.example.com/data', sourceType: 'rest' })
    );
  });
  it('no data_binding_connect when source is empty', () => {
    const { ctx } = attach({ source: '' });
    expect(ctx.emit).not.toHaveBeenCalledWith('data_binding_connect', expect.anything());
  });
  it('data_binding_connect includes authHeader', () => {
    const { ctx } = attach({ source: 'https://api.x.com', auth_header: 'Bearer token123' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'data_binding_connect',
      expect.objectContaining({ authHeader: 'Bearer token123' })
    );
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('dataBindingHandler.onDetach', () => {
  it('removes __dataBindingState', () => {
    const { node, config, ctx } = attach();
    dataBindingHandler.onDetach!(node, config, ctx);
    expect(node.__dataBindingState).toBeUndefined();
  });
  it('emits data_binding_disconnect when connectionHandle set', () => {
    const { node, config, ctx } = attach();
    node.__dataBindingState.connectionHandle = 'some-handle';
    ctx.emit.mockClear();
    dataBindingHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('data_binding_disconnect', expect.anything());
  });
  it('no data_binding_disconnect when connectionHandle is null', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    dataBindingHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('data_binding_disconnect', expect.anything());
  });
});

// ─── onEvent — data_binding_connected ────────────────────────────────────────

describe('dataBindingHandler.onEvent — data_binding_connected', () => {
  it('sets isConnected=true', () => {
    const { node, ctx, config } = attach();
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_connected',
      handle: 'h1',
    });
    expect(node.__dataBindingState.isConnected).toBe(true);
  });
  it('stores connectionHandle', () => {
    const { node, ctx, config } = attach();
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_connected',
      handle: 'handle_abc',
    });
    expect(node.__dataBindingState.connectionHandle).toBe('handle_abc');
  });
  it('resets errorCount to 0', () => {
    const { node, ctx, config } = attach();
    node.__dataBindingState.errorCount = 3;
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_connected', handle: 'h' });
    expect(node.__dataBindingState.errorCount).toBe(0);
  });
  it('emits on_data_connected', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_connected', handle: 'h' });
    expect(ctx.emit).toHaveBeenCalledWith('on_data_connected', expect.anything());
  });
});

// ─── onEvent — data_binding_data ─────────────────────────────────────────────

describe('dataBindingHandler.onEvent — data_binding_data', () => {
  it('updates currentData', () => {
    const { node, ctx, config } = attach();
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_data',
      data: { temperature: 22.5 },
    });
    expect(node.__dataBindingState.currentData.temperature).toBe(22.5);
  });
  it('updates lastRefresh timestamp', () => {
    const before = Date.now();
    const { node, ctx, config } = attach();
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_data', data: {} });
    expect(node.__dataBindingState.lastRefresh).toBeGreaterThanOrEqual(before);
  });
  it('emits on_data_change', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_data', data: { v: 1 } });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_data_change',
      expect.objectContaining({ data: { v: 1 } })
    );
  });
  it('applies binding to node property (no interpolation)', () => {
    const { node, ctx, config } = attach({
      interpolation: false,
      bindings: [
        { source_path: 'sensors.temp', target_property: 'temperature', transform: 'none' },
      ],
    });
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_data',
      data: { sensors: { temp: 37 } },
    });
    expect((node as any).temperature).toBe(37);
  });
  it('resolves nested source_path via dot notation', () => {
    const { node, ctx, config } = attach({
      interpolation: false,
      bindings: [{ source_path: 'a.b.c', target_property: 'deepValue', transform: 'none' }],
    });
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_data',
      data: { a: { b: { c: 99 } } },
    });
    expect((node as any).deepValue).toBe(99);
  });
  it('applies scale transform', () => {
    const { node, ctx, config } = attach({
      interpolation: false,
      bindings: [
        {
          source_path: 'val',
          target_property: 'scaled',
          transform: 'scale',
          transform_params: { factor: 2 },
        },
      ],
    });
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_data',
      data: { val: 10 },
    });
    expect((node as any).scaled).toBe(20);
  });
  it('applies normalize transform', () => {
    const { node, ctx, config } = attach({
      interpolation: false,
      bindings: [
        {
          source_path: 'raw',
          target_property: 'norm',
          transform: 'normalize',
          transform_params: { min: 0, max: 100 },
        },
      ],
    });
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_data',
      data: { raw: 50 },
    });
    expect((node as any).norm).toBeCloseTo(0.5);
  });
  it('applies map transform', () => {
    const { node, ctx, config } = attach({
      interpolation: false,
      bindings: [
        {
          source_path: 'state',
          target_property: 'label',
          transform: 'map',
          transform_params: { mapping: { 0: 'off', 1: 'on' } },
        },
      ],
    });
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_data',
      data: { state: 1 },
    });
    expect((node as any).label).toBe('on');
  });
  it('skips binding when source_path not found', () => {
    const { node, ctx, config } = attach({
      interpolation: false,
      bindings: [{ source_path: 'missing.path', target_property: 'x', transform: 'none' }],
    });
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_data',
      data: { other: 1 },
    });
    expect((node as any).x).toBeUndefined();
  });
  it('does not apply numeric binding immediately when interpolation=true', () => {
    const { node, ctx, config } = attach({
      interpolation: true,
      bindings: [{ source_path: 'val', target_property: 'pos', transform: 'none' }],
    });
    (node as any).pos = 0;
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_data',
      data: { val: 100 },
    });
    expect((node as any).pos).toBe(0); // not immediately set
  });
});

// ─── onEvent — data_binding_error ────────────────────────────────────────────

describe('dataBindingHandler.onEvent — data_binding_error', () => {
  it('increments errorCount', () => {
    const { node, ctx, config } = attach();
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_error',
      error: 'timeout',
    });
    expect(node.__dataBindingState.errorCount).toBe(1);
  });
  it('cumulative errorCount', () => {
    const { node, ctx, config } = attach({ reconnect_interval: 0 }); // skip setTimeout
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_error', error: 'err' });
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_error', error: 'err' });
    expect(node.__dataBindingState.errorCount).toBe(2);
  });
  it('emits on_data_error with errorCount', () => {
    const { node, ctx, config } = attach({ reconnect_interval: 0 });
    ctx.emit.mockClear();
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_error',
      error: 'net fail',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_data_error',
      expect.objectContaining({ error: 'net fail', errorCount: 1 })
    );
  });
});

// ─── onEvent — data_binding_disconnect ───────────────────────────────────────

describe('dataBindingHandler.onEvent — data_binding_disconnect', () => {
  it('sets isConnected=false', () => {
    const { node, ctx, config } = attach();
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_connected', handle: 'h' });
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_disconnect' });
    expect(node.__dataBindingState.isConnected).toBe(false);
  });
  it('clears connectionHandle', () => {
    const { node, ctx, config } = attach();
    node.__dataBindingState.connectionHandle = 'h';
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_disconnect' });
    expect(node.__dataBindingState.connectionHandle).toBeNull();
  });
});

// ─── onEvent — data_binding_refresh ──────────────────────────────────────────

describe('dataBindingHandler.onEvent — data_binding_refresh', () => {
  it('emits data_binding_fetch', () => {
    const { node, ctx, config } = attach({ source: 'https://api.x.com', source_type: 'rest' });
    ctx.emit.mockClear();
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_refresh' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'data_binding_fetch',
      expect.objectContaining({ source: 'https://api.x.com', sourceType: 'rest' })
    );
  });
});

// ─── onEvent — data_binding_set_source ───────────────────────────────────────

describe('dataBindingHandler.onEvent — data_binding_set_source', () => {
  it('emits data_binding_connect with new source', () => {
    const { node, ctx, config } = attach({ source: 'old.url' });
    ctx.emit.mockClear();
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_set_source',
      source: 'https://new.api.com',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'data_binding_connect',
      expect.objectContaining({ source: 'https://new.api.com' })
    );
  });
  it('clears currentData', () => {
    const { node, ctx, config } = attach();
    node.__dataBindingState.currentData = { old: 1 };
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_set_source',
      source: 'https://new.api.com',
    });
    expect(node.__dataBindingState.currentData).toEqual({});
  });
  it('sets isConnected=false', () => {
    const { node, ctx, config } = attach();
    node.__dataBindingState.isConnected = true;
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_set_source',
      source: 'https://new.api.com',
    });
    expect(node.__dataBindingState.isConnected).toBe(false);
  });
  it('disconnects existing connection first', () => {
    const { node, ctx, config } = attach();
    node.__dataBindingState.connectionHandle = 'active-conn';
    ctx.emit.mockClear();
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_set_source',
      source: 'https://new.api.com',
    });
    const disconnectCalls = ctx.emit.mock.calls.filter(
      (c: any[]) => c[0] === 'data_binding_disconnect'
    );
    expect(disconnectCalls.length).toBeGreaterThan(0);
  });
});

// ─── onEvent — data_binding_query ────────────────────────────────────────────

describe('dataBindingHandler.onEvent — data_binding_query', () => {
  it('emits data_binding_info snapshot', () => {
    const { node, ctx, config } = attach({
      source: 'https://x.com',
      bindings: [{ source_path: 'a', target_property: 'b' }],
    });
    ctx.emit.mockClear();
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_query', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'data_binding_info',
      expect.objectContaining({
        queryId: 'q1',
        isConnected: false,
        errorCount: 0,
        bindingCount: 1,
      })
    );
  });
  it('reflects connected state in query', () => {
    const { node, ctx, config } = attach();
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_connected', handle: 'h' });
    ctx.emit.mockClear();
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_query', queryId: 'q2' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'data_binding_info')!;
    expect(call[1].isConnected).toBe(true);
  });
});

// ─── onUpdate — polling ───────────────────────────────────────────────────────

describe('dataBindingHandler.onUpdate — polling', () => {
  it('emits data_binding_fetch when refresh_rate elapsed for rest source', () => {
    const { node, ctx, config } = attach({
      source: 'https://api.x.com',
      source_type: 'rest',
      refresh_rate: 1000,
    });
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_connected', handle: 'h' });
    node.__dataBindingState.lastRefresh = Date.now() - 1100; // 1.1s ago
    ctx.emit.mockClear();
    dataBindingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'data_binding_fetch',
      expect.objectContaining({ source: 'https://api.x.com' })
    );
  });
  it('does not fetch before refresh_rate elapsed', () => {
    const { node, ctx, config } = attach({
      source: 'https://api.x.com',
      source_type: 'rest',
      refresh_rate: 1000,
    });
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_connected', handle: 'h' });
    node.__dataBindingState.lastRefresh = Date.now(); // just refreshed
    ctx.emit.mockClear();
    dataBindingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('data_binding_fetch', expect.anything());
  });
  it('does not fetch when not connected', () => {
    const { node, ctx, config } = attach({
      source: 'https://api.x.com',
      source_type: 'rest',
      refresh_rate: 1000,
    });
    node.__dataBindingState.lastRefresh = Date.now() - 2000;
    ctx.emit.mockClear();
    dataBindingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('data_binding_fetch', expect.anything());
  });
  it('applies interpolation toward data values each frame', () => {
    const { node, ctx, config } = attach({
      source_type: 'rest',
      refresh_rate: 0,
      interpolation: true,
      interpolation_speed: 1,
      bindings: [{ source_path: 'x', target_property: 'posX', transform: 'none' }],
    });
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_connected', handle: 'h' });
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_data', data: { x: 100 } });
    (node as any).posX = 0;
    dataBindingHandler.onUpdate!(node, config, ctx, 0.1); // 10% toward 100
    expect((node as any).posX).toBeCloseTo(10); // 0 + (100-0) * 1 * 0.1 = 10
  });
  it('does not interpolate non-numeric values', () => {
    const { node, ctx, config } = attach({
      source_type: 'rest',
      refresh_rate: 0,
      interpolation: true,
      bindings: [{ source_path: 'label', target_property: 'name', transform: 'none' }],
    });
    dataBindingHandler.onEvent!(node, config, ctx, { type: 'data_binding_connected', handle: 'h' });
    dataBindingHandler.onEvent!(node, config, ctx, {
      type: 'data_binding_data',
      data: { label: 'hello' },
    });
    (node as any).name = 'world';
    dataBindingHandler.onUpdate!(node, config, ctx, 0.016);
    // String already applied by data event (non-interpolated), was NOT applied because interpolation=true skips strings
    // name stays 'world' because the data event skipped non-numeric when interpolation=true
    expect((node as any).name).toBe('world');
  });
});
