import { describe, it, expect, beforeEach } from 'vitest';
import { dataBindingHandler } from '../DataBindingTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount } from './traitTestHelpers';

describe('DataBindingTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    source: 'https://api.example.com/data',
    source_type: 'rest' as const,
    bindings: [
      { source_path: 'temperature', target_property: 'temp', transform: 'none' as const },
      { source_path: 'scale', target_property: 'size', transform: 'scale' as const, transform_params: { factor: 2 } },
    ],
    refresh_rate: 1000,
    interpolation: true,
    interpolation_speed: 5,
    auth_header: '',
    reconnect_interval: 5000,
  };

  beforeEach(() => {
    node = createMockNode('db');
    ctx = createMockContext();
    attachTrait(dataBindingHandler, node, cfg, ctx);
  });

  it('connects on attach', () => {
    expect(getEventCount(ctx, 'data_binding_connect')).toBe(1);
  });

  it('connected event sets state', () => {
    sendEvent(dataBindingHandler, node, cfg, ctx, { type: 'data_binding_connected', handle: 'h1' });
    expect((node as any).__dataBindingState.isConnected).toBe(true);
    expect(getEventCount(ctx, 'on_data_connected')).toBe(1);
  });

  it('data event applies non-numeric bindings immediately', () => {
    sendEvent(dataBindingHandler, node, cfg, ctx, { type: 'data_binding_connected', handle: 'h1' });
    sendEvent(dataBindingHandler, node, cfg, ctx, {
      type: 'data_binding_data',
      data: { temperature: 'hot', scale: 5 },
    });
    expect((node as any).temp).toBe('hot');
    expect(getEventCount(ctx, 'on_data_change')).toBe(1);
  });

  it('scale transform doubles value', () => {
    const noInterp = { ...cfg, interpolation: false };
    const n = createMockNode('db2');
    const c = createMockContext();
    attachTrait(dataBindingHandler, n, noInterp, c);
    sendEvent(dataBindingHandler, n, noInterp, c, { type: 'data_binding_connected', handle: 'h2' });
    sendEvent(dataBindingHandler, n, noInterp, c, {
      type: 'data_binding_data',
      data: { temperature: 25, scale: 3 },
    });
    expect((n as any).temp).toBe(25);
    expect((n as any).size).toBe(6); // 3 * 2
  });

  it('polls on update at refresh_rate', () => {
    sendEvent(dataBindingHandler, node, cfg, ctx, { type: 'data_binding_connected', handle: 'h1' });
    (node as any).__dataBindingState.lastRefresh = 0; // force stale
    updateTrait(dataBindingHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'data_binding_fetch')).toBe(1);
  });

  it('error increments count and emits', () => {
    sendEvent(dataBindingHandler, node, cfg, ctx, { type: 'data_binding_error', error: 'timeout' });
    expect((node as any).__dataBindingState.errorCount).toBe(1);
    expect(getEventCount(ctx, 'on_data_error')).toBe(1);
  });

  it('set_source reconnects', () => {
    sendEvent(dataBindingHandler, node, cfg, ctx, { type: 'data_binding_connected', handle: 'h1' });
    sendEvent(dataBindingHandler, node, cfg, ctx, { type: 'data_binding_set_source', source: 'wss://new' });
    expect((node as any).__dataBindingState.isConnected).toBe(false);
    expect(getEventCount(ctx, 'data_binding_disconnect')).toBe(1);
    expect(getEventCount(ctx, 'data_binding_connect')).toBe(2); // attach + new connect
  });

  it('query emits info', () => {
    sendEvent(dataBindingHandler, node, cfg, ctx, { type: 'data_binding_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'data_binding_info')).toBe(1);
  });

  it('detach disconnects', () => {
    (node as any).__dataBindingState.connectionHandle = 'h1';
    dataBindingHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'data_binding_disconnect')).toBe(1);
    expect((node as any).__dataBindingState).toBeUndefined();
  });
});
