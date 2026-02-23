/**
 * DigitalTwinTrait Production Tests
 *
 * Maps a physical IoT device to a virtual XR representation.
 * Covers: defaultConfig, onAttach (simulation_mode + model_source guards),
 * onDetach, onUpdate (polling + pendingUpdates flush + history pruning),
 * and all 8 onEvent types including calculateDivergence behavior.
 */

import { describe, it, expect, vi } from 'vitest';
import { digitalTwinHandler } from '../DigitalTwinTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() { return { id: 'dt_test' } as any; }
function makeCtx() { return { emit: vi.fn() }; }

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...digitalTwinHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  digitalTwinHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) { return node.__digitalTwinState as any; }
function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  digitalTwinHandler.onEvent!(node, cfg, ctx as any, evt as any);
}
function update(node: any, cfg: any, ctx: any, delta = 0.016) {
  digitalTwinHandler.onUpdate!(node, cfg, ctx as any, delta);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('DigitalTwinTrait — defaultConfig', () => {
  it('has 8 fields with correct defaults', () => {
    const d = digitalTwinHandler.defaultConfig!;
    expect(d.physical_id).toBe('');
    expect(d.model_source).toBe('');
    expect(d.sync_properties).toEqual([]);
    expect(d.update_mode).toBe('polling');
    expect(d.poll_interval).toBe(5000);
    expect(d.history_retention).toBe(3600);
    expect(d.simulation_mode).toBe(false);
    expect(d.connection_string).toBe('');
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('DigitalTwinTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node, { simulation_mode: true }); // skip connectToPhysical
    const s = st(node);
    expect(s.divergence).toBe(0);
    expect(s.physicalState).toEqual({});
    expect(s.pendingUpdates).toEqual([]);
    expect(s.connectionHandle).toBeNull();
    expect(s.historyBuffer).toEqual([]);
  });

  it('simulation_mode: sets isSynced=true and emits on_twin_connected with mode=simulation', () => {
    const node = makeNode();
    const { ctx } = attach(node, { simulation_mode: true });
    expect(st(node).isSynced).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('on_twin_connected', expect.objectContaining({ mode: 'simulation' }));
  });

  it('emits twin_load_model when model_source is set', () => {
    const node = makeNode();
    const { ctx } = attach(node, { simulation_mode: true, model_source: 'model.glb' });
    expect(ctx.emit).toHaveBeenCalledWith('twin_load_model', expect.objectContaining({ source: 'model.glb' }));
  });

  it('does NOT emit twin_load_model when model_source is empty', () => {
    const node = makeNode();
    const { ctx } = attach(node, { simulation_mode: true, model_source: '' });
    const calls = (ctx.emit as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls).not.toContain('twin_load_model');
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('DigitalTwinTrait — onDetach', () => {
  it('emits twin_disconnect when connectionHandle set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { simulation_mode: true });
    st(node).connectionHandle = { h: 1 };
    ctx.emit.mockClear();
    digitalTwinHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('twin_disconnect', expect.any(Object));
  });

  it('does NOT emit twin_disconnect when connectionHandle is null', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { simulation_mode: true });
    ctx.emit.mockClear();
    digitalTwinHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('twin_disconnect', expect.any(Object));
  });

  it('removes __digitalTwinState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { simulation_mode: true });
    digitalTwinHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__digitalTwinState).toBeUndefined();
  });
});

// ─── onUpdate — polling ───────────────────────────────────────────────────────

describe('DigitalTwinTrait — onUpdate: polling', () => {
  it('no-op when not synced', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { simulation_mode: false, physical_id: '' });
    // isSynced defaults false
    ctx.emit.mockClear();
    update(node, cfg, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('twin_fetch_state', expect.any(Object));
  });

  it('no-op when update_mode=push (even if synced)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { simulation_mode: true, update_mode: 'push' });
    ctx.emit.mockClear();
    update(node, cfg, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('twin_fetch_state', expect.any(Object));
  });

  it('does NOT poll before poll_interval elapsed', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { simulation_mode: true, update_mode: 'polling', poll_interval: 5000 });
    st(node).lastSyncTime = Date.now(); // just polled
    ctx.emit.mockClear();
    update(node, cfg, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('twin_fetch_state', expect.any(Object));
  });

  it('emits twin_fetch_state when poll_interval elapsed', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      simulation_mode: true,
      update_mode: 'polling',
      poll_interval: 100,
      physical_id: 'iot_device_1',
      sync_properties: [{ physical_key: 'temp', virtual_property: 'temperature', direction: 'in' }],
    });
    st(node).lastSyncTime = Date.now() - 200; // 200ms ago, past interval
    ctx.emit.mockClear();
    update(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('twin_fetch_state', expect.objectContaining({
      physicalId: 'iot_device_1',
    }));
  });

  it('filters out "out" direction props from twin_fetch_state', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      simulation_mode: true,
      update_mode: 'polling',
      poll_interval: 0,
      sync_properties: [
        { physical_key: 'temp', virtual_property: 'temperature', direction: 'in' },
        { physical_key: 'cmd', virtual_property: 'command', direction: 'out' },
      ],
    });
    st(node).lastSyncTime = 0;
    ctx.emit.mockClear();
    update(node, cfg, ctx);
    const call = (ctx.emit as any).mock.calls.find((c: any[]) => c[0] === 'twin_fetch_state');
    // Only 'in' direction filtered through
    expect(call![1].properties).toHaveLength(1);
    expect(call![1].properties[0].physical_key).toBe('temp');
  });
});

// ─── onUpdate — pendingUpdates flush ──────────────────────────────────────────

describe('DigitalTwinTrait — onUpdate: pending updates flush', () => {
  it('flushes pendingUpdates and emits twin_send_update per item', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { simulation_mode: true, physical_id: 'dev1' });
    st(node).pendingUpdates = [
      { property: 'brightness', value: 100, timestamp: Date.now() },
      { property: 'color', value: 'red', timestamp: Date.now() },
    ];
    ctx.emit.mockClear();
    update(node, cfg, ctx);
    const sends = (ctx.emit as any).mock.calls.filter((c: any[]) => c[0] === 'twin_send_update');
    expect(sends.length).toBe(2);
    expect(sends[0][1]).toMatchObject({ property: 'brightness', value: 100 });
    expect(sends[1][1]).toMatchObject({ property: 'color', value: 'red' });
    expect(st(node).pendingUpdates).toEqual([]);
  });
});

// ─── onUpdate — history pruning ───────────────────────────────────────────────

describe('DigitalTwinTrait — onUpdate: history pruning', () => {
  it('prunes old history entries beyond history_retention', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { simulation_mode: true, history_retention: 10 }); // 10 seconds
    const past = Date.now() - 20000; // 20 seconds ago
    const recent = Date.now() - 5000; // 5 seconds ago
    st(node).historyBuffer = [
      { timestamp: past, state: { temp: 10 } },
      { timestamp: recent, state: { temp: 20 } },
    ];
    update(node, cfg, ctx);
    expect(st(node).historyBuffer).toHaveLength(1);
    expect(st(node).historyBuffer[0].state.temp).toBe(20);
  });
});

// ─── onEvent — twin_connected ─────────────────────────────────────────────────

describe('DigitalTwinTrait — onEvent: twin_connected', () => {
  it('sets isSynced=true, stores handle, emits on_twin_connected', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { simulation_mode: true, physical_id: 'dev1' });
    st(node).isSynced = false;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'twin_connected', handle: { socket: true } });
    expect(st(node).isSynced).toBe(true);
    expect(st(node).connectionHandle).toEqual({ socket: true });
    expect(ctx.emit).toHaveBeenCalledWith('on_twin_connected', expect.objectContaining({ physicalId: 'dev1' }));
  });
});

// ─── onEvent — twin_state_update ─────────────────────────────────────────────

describe('DigitalTwinTrait — onEvent: twin_state_update', () => {
  it('updates physicalState, applies inbound props to node, records history, emits on_twin_sync', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      simulation_mode: true,
      sync_properties: [
        { physical_key: 'temp', virtual_property: 'temperature', direction: 'in' },
        { physical_key: 'cmd', virtual_property: 'command', direction: 'out' }, // should NOT apply
      ],
    });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'twin_state_update', state: { temp: 98.6, cmd: 'ON' } });

    expect(st(node).physicalState).toEqual({ temp: 98.6, cmd: 'ON' });
    expect((node as any).temperature).toBe(98.6);
    expect((node as any).command).toBeUndefined(); // direction=out, not applied
    expect(st(node).historyBuffer.length).toBe(1);
    expect(ctx.emit).toHaveBeenCalledWith('on_twin_sync', expect.objectContaining({ divergence: expect.any(Number) }));
  });
});

// ─── onEvent — twin_property_changed ─────────────────────────────────────────

describe('DigitalTwinTrait — onEvent: twin_property_changed', () => {
  it('queues pendingUpdate for out/bidirectional properties', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      simulation_mode: true,
      sync_properties: [{ physical_key: 'brightness', virtual_property: 'bright', direction: 'out' }],
    });
    fire(node, cfg, ctx, { type: 'twin_property_changed', property: 'bright', value: 75 });
    expect(st(node).pendingUpdates.length).toBe(1);
    expect(st(node).pendingUpdates[0]).toMatchObject({ property: 'brightness', value: 75 });
  });

  it('does NOT queue for in-direction properties', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      simulation_mode: true,
      sync_properties: [{ physical_key: 'temp', virtual_property: 'temperature', direction: 'in' }],
    });
    fire(node, cfg, ctx, { type: 'twin_property_changed', property: 'temperature', value: 100 });
    expect(st(node).pendingUpdates.length).toBe(0);
  });

  it('no-op for unknown virtual_property', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { simulation_mode: true, sync_properties: [] });
    fire(node, cfg, ctx, { type: 'twin_property_changed', property: 'UNKNOWN', value: 0 });
    expect(st(node).pendingUpdates.length).toBe(0);
  });
});

// ─── onEvent — twin_disconnect ────────────────────────────────────────────────

describe('DigitalTwinTrait — onEvent: twin_disconnect', () => {
  it('sets isSynced=false, clears handle, emits on_twin_disconnected', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { simulation_mode: true });
    st(node).connectionHandle = { h: 1 };
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'twin_disconnect' });
    expect(st(node).isSynced).toBe(false);
    expect(st(node).connectionHandle).toBeNull();
    expect(ctx.emit).toHaveBeenCalledWith('on_twin_disconnected', expect.any(Object));
  });
});

// ─── onEvent — twin_connection_error ──────────────────────────────────────────

describe('DigitalTwinTrait — onEvent: twin_connection_error', () => {
  it('emits on_twin_error with error', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { simulation_mode: true });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'twin_connection_error', error: 'TIMEOUT' });
    expect(ctx.emit).toHaveBeenCalledWith('on_twin_error', expect.objectContaining({ error: 'TIMEOUT' }));
  });
});

// ─── onEvent — twin_get_history ───────────────────────────────────────────────

describe('DigitalTwinTrait — onEvent: twin_get_history', () => {
  it('returns filtered history within [startTime, endTime] and emits twin_history_result', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { simulation_mode: true });
    const now = Date.now();
    st(node).historyBuffer = [
      { timestamp: now - 100, state: { temp: 1 } },
      { timestamp: now - 50, state: { temp: 2 } },
      { timestamp: now - 10, state: { temp: 3 } },
    ];
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'twin_get_history', startTime: now - 80, endTime: now - 20, callbackId: 'cb1' });
    const call = (ctx.emit as any).mock.calls.find((c: any[]) => c[0] === 'twin_history_result');
    expect(call![1].history).toHaveLength(1);
    expect(call![1].history[0].state.temp).toBe(2);
    expect(call![1].callbackId).toBe('cb1');
  });
});

// ─── onEvent — twin_simulate ──────────────────────────────────────────────────

describe('DigitalTwinTrait — onEvent: twin_simulate', () => {
  it('merges changes into physicalState and applies inbound props to node', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      simulation_mode: true,
      sync_properties: [{ physical_key: 'temp', virtual_property: 'temperature', direction: 'in' }],
    });
    fire(node, cfg, ctx, { type: 'twin_simulate', changes: { temp: 42, extra: 'x' } });
    expect(st(node).physicalState).toMatchObject({ temp: 42, extra: 'x' });
    expect((node as any).temperature).toBe(42);
  });
});

// ─── onEvent — twin_query ─────────────────────────────────────────────────────

describe('DigitalTwinTrait — onEvent: twin_query', () => {
  it('emits twin_info with full snapshot', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { simulation_mode: true });
    st(node).isSynced = true;
    st(node).divergence = 0.5;
    st(node).historyBuffer = [{ timestamp: 1, state: {} }];
    st(node).physicalState = { temp: 20 };
    st(node).pendingUpdates = [{ property: 'p', value: 1, timestamp: 1 }];
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'twin_query', queryId: 'dq1' });
    expect(ctx.emit).toHaveBeenCalledWith('twin_info', expect.objectContaining({
      queryId: 'dq1',
      isSynced: true,
      divergence: 0.5,
      historySize: 1,
      pendingUpdates: 1,
    }));
  });
});
