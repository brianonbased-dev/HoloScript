/**
 * SensorTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { sensorHandler } from '../SensorTrait';

function makeNode() {
  return { id: 'sensor_node' };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...sensorHandler.defaultConfig!, ...cfg };
  sensorHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('sensorHandler.defaultConfig', () => {
  const d = sensorHandler.defaultConfig!;
  it('protocol=rest', () => expect(d.protocol).toBe('rest'));
  it('endpoint=""', () => expect(d.endpoint).toBe(''));
  it('topic=""', () => expect(d.topic).toBe(''));
  it('data_type=number', () => expect(d.data_type).toBe('number'));
  it('update_interval=1000', () => expect(d.update_interval).toBe(1000));
  it('unit=""', () => expect(d.unit).toBe(''));
  it('range={0,100}', () => expect(d.range).toEqual({ min: 0, max: 100 }));
  it('alert_threshold={}', () => expect(d.alert_threshold).toEqual({}));
  it('history_size=100', () => expect(d.history_size).toBe(100));
  it('transform=""', () => expect(d.transform).toBe(''));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('sensorHandler.onAttach', () => {
  it('creates __sensorState', () => expect(attach().node.__sensorState).toBeDefined());
  it('currentValue=null', () => expect(attach().node.__sensorState.currentValue).toBeNull());
  it('isConnected=false', () => expect(attach().node.__sensorState.isConnected).toBe(false));
  it('alertActive=false', () => expect(attach().node.__sensorState.alertActive).toBe(false));
  it('history=[]', () => expect(attach().node.__sensorState.history).toEqual([]));
  it('emits sensor_connect when endpoint set', () => {
    const { ctx } = attach({ endpoint: 'http://sensor.local/temp', protocol: 'rest' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'sensor_connect',
      expect.objectContaining({
        endpoint: 'http://sensor.local/temp',
        protocol: 'rest',
      })
    );
  });
  it('no sensor_connect when endpoint empty', () => {
    const { ctx } = attach({ endpoint: '' });
    expect(ctx.emit).not.toHaveBeenCalledWith('sensor_connect', expect.anything());
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('sensorHandler.onDetach', () => {
  it('removes __sensorState', () => {
    const { node, config, ctx } = attach();
    sensorHandler.onDetach!(node, config, ctx);
    expect(node.__sensorState).toBeUndefined();
  });
  it('emits sensor_disconnect when connectionHandle set', () => {
    const { node, config, ctx } = attach({ endpoint: 'http://x' });
    node.__sensorState.connectionHandle = 'handle-1';
    ctx.emit.mockClear();
    sensorHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('sensor_disconnect', expect.anything());
  });
  it('no emit when no connectionHandle', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    sensorHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('sensor_disconnect', expect.anything());
  });
});

// ─── onUpdate — REST polling ──────────────────────────────────────────────────

describe('sensorHandler.onUpdate — REST polling', () => {
  it('no-op when not connected', () => {
    const { node, config, ctx } = attach({
      protocol: 'rest',
      update_interval: 1000,
      endpoint: 'http://x',
    });
    ctx.emit.mockClear();
    sensorHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
  it('emits sensor_fetch when interval elapsed', () => {
    const { node, config, ctx } = attach({
      protocol: 'rest',
      update_interval: 100,
      endpoint: 'http://x',
    });
    node.__sensorState.isConnected = true;
    node.__sensorState.lastUpdate = Date.now() - 200; // 200ms ago
    ctx.emit.mockClear();
    sensorHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'sensor_fetch',
      expect.objectContaining({ endpoint: 'http://x' })
    );
  });
  it('no sensor_fetch when interval not elapsed', () => {
    const { node, config, ctx } = attach({
      protocol: 'rest',
      update_interval: 60000,
      endpoint: 'http://x',
    });
    node.__sensorState.isConnected = true;
    node.__sensorState.lastUpdate = Date.now(); // just now
    ctx.emit.mockClear();
    sensorHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
  it('no poll for websocket protocol', () => {
    const { node, config, ctx } = attach({
      protocol: 'websocket',
      update_interval: 100,
      endpoint: 'ws://x',
    });
    node.__sensorState.isConnected = true;
    node.__sensorState.lastUpdate = 0;
    ctx.emit.mockClear();
    sensorHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent — sensor_connected ───────────────────────────────────────────────

describe('sensorHandler.onEvent — sensor_connected', () => {
  it('sets isConnected=true', () => {
    const { node, config, ctx } = attach();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_connected', handle: 'h1' });
    expect(node.__sensorState.isConnected).toBe(true);
  });
  it('stores connectionHandle', () => {
    const { node, config, ctx } = attach();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_connected', handle: 'h1' });
    expect(node.__sensorState.connectionHandle).toBe('h1');
  });
  it('emits on_sensor_connected', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_connected', handle: 'h1' });
    expect(ctx.emit).toHaveBeenCalledWith('on_sensor_connected', expect.anything());
  });
});

// ─── onEvent — sensor_data ────────────────────────────────────────────────────

describe('sensorHandler.onEvent — sensor_data', () => {
  it('stores currentValue', () => {
    const { node, config, ctx } = attach();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 42 });
    expect(node.__sensorState.currentValue).toBe(42);
  });
  it('previousValue updated correctly', () => {
    const { node, config, ctx } = attach();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 10 });
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 20 });
    expect(node.__sensorState.previousValue).toBe(10);
    expect(node.__sensorState.currentValue).toBe(20);
  });
  it('emits on_sensor_update', () => {
    const { node, config, ctx } = attach({ unit: '°C' });
    ctx.emit.mockClear();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 25 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_sensor_update',
      expect.objectContaining({
        value: 25,
        unit: '°C',
      })
    );
  });
  it('records history entry', () => {
    const { node, config, ctx } = attach();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 5 });
    expect(node.__sensorState.history).toHaveLength(1);
    expect(node.__sensorState.history[0].value).toBe(5);
  });
  it('history capped at history_size', () => {
    const { node, config, ctx } = attach({ history_size: 3 });
    for (let i = 0; i < 5; i++) {
      sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: i });
    }
    expect(node.__sensorState.history).toHaveLength(3);
    expect(node.__sensorState.history[2].value).toBe(4);
  });
  it('applies transform: double value', () => {
    const { node, config, ctx } = attach({ transform: 'value * 2' });
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 5 });
    expect(node.__sensorState.currentValue).toBe(10);
  });
  it('keeps original value on bad transform', () => {
    const { node, config, ctx } = attach({ transform: 'invalid((((' });
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 7 });
    expect(node.__sensorState.currentValue).toBe(7);
  });
  it('alert fires when value above high threshold', () => {
    const { node, config, ctx } = attach({ alert_threshold: { high: 50 } });
    ctx.emit.mockClear();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 75 });
    expect(ctx.emit).toHaveBeenCalledWith('on_sensor_alert', expect.anything());
    expect(node.__sensorState.alertActive).toBe(true);
  });
  it('alert fires when value below low threshold', () => {
    const { node, config, ctx } = attach({ alert_threshold: { low: 10 } });
    ctx.emit.mockClear();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 5 });
    expect(ctx.emit).toHaveBeenCalledWith('on_sensor_alert', expect.anything());
  });
  it('no alert when value within range', () => {
    const { node, config, ctx } = attach({ alert_threshold: { low: 0, high: 100 } });
    ctx.emit.mockClear();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 50 });
    expect(ctx.emit).not.toHaveBeenCalledWith('on_sensor_alert', expect.anything());
  });
  it('alert_cleared fires when returning to safe range', () => {
    const { node, config, ctx } = attach({ alert_threshold: { high: 50 } });
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 75 });
    ctx.emit.mockClear();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 30 });
    expect(ctx.emit).toHaveBeenCalledWith('on_sensor_alert_cleared', expect.anything());
    expect(node.__sensorState.alertActive).toBe(false);
  });
  it('alert dedup: no double emit on sustained alert', () => {
    const { node, config, ctx } = attach({ alert_threshold: { high: 50 } });
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 75 });
    ctx.emit.mockClear();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 80 });
    expect(ctx.emit).not.toHaveBeenCalledWith('on_sensor_alert', expect.anything());
  });
  it('non-number value skips threshold check', () => {
    const { node, config, ctx } = attach({ alert_threshold: { high: 50 } });
    ctx.emit.mockClear();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_data', value: 'hot' });
    expect(ctx.emit).not.toHaveBeenCalledWith('on_sensor_alert', expect.anything());
  });
});

// ─── onEvent — sensor_error ───────────────────────────────────────────────────

describe('sensorHandler.onEvent — sensor_error', () => {
  it('emits on_sensor_error', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_error', error: 'timeout' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_sensor_error',
      expect.objectContaining({ error: 'timeout' })
    );
  });
});

// ─── onEvent — sensor_disconnect ─────────────────────────────────────────────

describe('sensorHandler.onEvent — sensor_disconnect', () => {
  it('sets isConnected=false', () => {
    const { node, config, ctx } = attach();
    node.__sensorState.isConnected = true;
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_disconnect' });
    expect(node.__sensorState.isConnected).toBe(false);
  });
  it('clears connectionHandle', () => {
    const { node, config, ctx } = attach();
    node.__sensorState.connectionHandle = 'h1';
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_disconnect' });
    expect(node.__sensorState.connectionHandle).toBeNull();
  });
});

// ─── onEvent — sensor_get_history ────────────────────────────────────────────

describe('sensorHandler.onEvent — sensor_get_history', () => {
  it('emits sensor_history_result with filtered entries', () => {
    const { node, config, ctx } = attach();
    const t0 = Date.now() - 5000;
    node.__sensorState.history = [
      { timestamp: t0, value: 1 },
      { timestamp: Date.now(), value: 2 },
    ];
    ctx.emit.mockClear();
    sensorHandler.onEvent!(node, config, ctx, {
      type: 'sensor_get_history',
      startTime: t0 - 1,
      endTime: Date.now() + 1,
      callbackId: 'cb1',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'sensor_history_result')!;
    expect(call[1].history).toHaveLength(2);
    expect(call[1].callbackId).toBe('cb1');
  });
  it('filters by time range', () => {
    const { node, config, ctx } = attach();
    const now = Date.now();
    node.__sensorState.history = [
      { timestamp: now - 10000, value: 'old' },
      { timestamp: now, value: 'new' },
    ];
    ctx.emit.mockClear();
    sensorHandler.onEvent!(node, config, ctx, {
      type: 'sensor_get_history',
      startTime: now - 1000,
      endTime: now + 1,
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'sensor_history_result')!;
    expect(call[1].history).toHaveLength(1);
    expect(call[1].history[0].value).toBe('new');
  });
});

// ─── onEvent — sensor_set_endpoint ───────────────────────────────────────────

describe('sensorHandler.onEvent — sensor_set_endpoint', () => {
  it('reconnects with new endpoint', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    sensorHandler.onEvent!(node, config, ctx, {
      type: 'sensor_set_endpoint',
      endpoint: 'http://new-endpoint',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'sensor_connect',
      expect.objectContaining({ endpoint: 'http://new-endpoint' })
    );
  });
  it('disconnects old connection if handle exists', () => {
    const { node, config, ctx } = attach();
    node.__sensorState.connectionHandle = 'old';
    ctx.emit.mockClear();
    sensorHandler.onEvent!(node, config, ctx, {
      type: 'sensor_set_endpoint',
      endpoint: 'http://new',
    });
    expect(ctx.emit).toHaveBeenCalledWith('sensor_disconnect', expect.anything());
  });
});

// ─── onEvent — sensor_query ───────────────────────────────────────────────────

describe('sensorHandler.onEvent — sensor_query', () => {
  it('emits sensor_info snapshot', () => {
    const { node, config, ctx } = attach({ unit: 'K', range: { min: 0, max: 500 } });
    node.__sensorState.isConnected = true;
    node.__sensorState.currentValue = 300;
    ctx.emit.mockClear();
    sensorHandler.onEvent!(node, config, ctx, { type: 'sensor_query', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'sensor_info',
      expect.objectContaining({
        queryId: 'q1',
        isConnected: true,
        currentValue: 300,
        unit: 'K',
      })
    );
  });
});
