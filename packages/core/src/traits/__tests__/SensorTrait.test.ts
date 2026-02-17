import { describe, it, expect, beforeEach } from 'vitest';
import { sensorHandler } from '../SensorTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount, getLastEvent } from './traitTestHelpers';

describe('SensorTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    protocol: 'rest' as const,
    endpoint: 'http://sensor/temp',
    topic: '',
    data_type: 'number' as const,
    update_interval: 1000,
    unit: '°C',
    range: { min: 0, max: 100 },
    alert_threshold: { high: 80 } as { low?: number; high?: number },
    history_size: 100,
    transform: '',
  };

  beforeEach(() => {
    node = createMockNode('sen');
    ctx = createMockContext();
    attachTrait(sensorHandler, node, cfg, ctx);
  });

  it('connects on attach when endpoint provided', () => {
    expect(getEventCount(ctx, 'sensor_connect')).toBe(1);
  });

  it('no connect without endpoint', () => {
    const n = createMockNode('s2');
    const c = createMockContext();
    attachTrait(sensorHandler, n, { ...cfg, endpoint: '' }, c);
    expect(getEventCount(c, 'sensor_connect')).toBe(0);
  });

  it('sensor_connected sets state', () => {
    sendEvent(sensorHandler, node, cfg, ctx, { type: 'sensor_connected', handle: 'h1' });
    expect((node as any).__sensorState.isConnected).toBe(true);
    expect(getEventCount(ctx, 'on_sensor_connected')).toBe(1);
  });

  it('sensor_data updates value and history', () => {
    sendEvent(sensorHandler, node, cfg, ctx, { type: 'sensor_data', value: 42 });
    const s = (node as any).__sensorState;
    expect(s.currentValue).toBe(42);
    expect(s.history.length).toBe(1);
    expect(getEventCount(ctx, 'on_sensor_update')).toBe(1);
  });

  it('alert triggers on threshold breach', () => {
    sendEvent(sensorHandler, node, cfg, ctx, { type: 'sensor_data', value: 85 });
    expect((node as any).__sensorState.alertActive).toBe(true);
    expect(getEventCount(ctx, 'on_sensor_alert')).toBe(1);
  });

  it('alert cleared when back in range', () => {
    sendEvent(sensorHandler, node, cfg, ctx, { type: 'sensor_data', value: 85 });
    sendEvent(sensorHandler, node, cfg, ctx, { type: 'sensor_data', value: 70 });
    expect(getEventCount(ctx, 'on_sensor_alert_cleared')).toBe(1);
  });

  it('history capped at history_size', () => {
    for (let i = 0; i < 105; i++) {
      sendEvent(sensorHandler, node, cfg, ctx, { type: 'sensor_data', value: i });
    }
    expect((node as any).__sensorState.history.length).toBe(100);
  });

  it('get_history filters by time', () => {
    sendEvent(sensorHandler, node, cfg, ctx, { type: 'sensor_data', value: 10 });
    sendEvent(sensorHandler, node, cfg, ctx, {
      type: 'sensor_get_history',
      startTime: 0,
      endTime: Date.now() + 1000,
      callbackId: 'cb1',
    });
    expect(getEventCount(ctx, 'sensor_history_result')).toBe(1);
  });

  it('sensor_error emits error', () => {
    sendEvent(sensorHandler, node, cfg, ctx, { type: 'sensor_error', error: 'timeout' });
    expect(getEventCount(ctx, 'on_sensor_error')).toBe(1);
  });

  it('sensor_set_endpoint reconnects', () => {
    sendEvent(sensorHandler, node, cfg, ctx, { type: 'sensor_connected', handle: 'h1' });
    sendEvent(sensorHandler, node, cfg, ctx, { type: 'sensor_set_endpoint', endpoint: 'http://new' });
    expect(getEventCount(ctx, 'sensor_disconnect')).toBe(1);
    expect(getEventCount(ctx, 'sensor_connect')).toBe(2);
  });

  it('query emits info', () => {
    sendEvent(sensorHandler, node, cfg, ctx, { type: 'sensor_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'sensor_info')).toBe(1);
  });

  it('detach disconnects', () => {
    sendEvent(sensorHandler, node, cfg, ctx, { type: 'sensor_connected', handle: 'h1' });
    sensorHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'sensor_disconnect')).toBe(1);
    expect((node as any).__sensorState).toBeUndefined();
  });
});
