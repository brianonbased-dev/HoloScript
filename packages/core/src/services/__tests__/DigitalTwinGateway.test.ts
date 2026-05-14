/**
 * DigitalTwinGateway — Unit Tests
 *
 * Covers: singleton, IotGateway contract, event emitter, actuator helpers,
 * and setGateway wiring into trait handlers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DigitalTwinGateway,
  digitalTwinGateway,
  setGateway,
  type TwinPayload,
} from '../DigitalTwinGateway';
import { digitalTwinHandler } from '../../traits/DigitalTwinTrait';
import { holoTwinHandler } from '../../traits/HoloTwinTrait';

describe('DigitalTwinGateway — exported singleton', () => {
  it('digitalTwinGateway is the singleton instance', () => {
    expect(digitalTwinGateway).toBe(DigitalTwinGateway.getInstance());
  });
});

describe('DigitalTwinGateway — reset isolation', () => {
  beforeEach(() => {
    DigitalTwinGateway.resetInstance();
  });

  // ─── Singleton ──────────────────────────────────────────────────────────────

  it('getInstance returns the same singleton', () => {
    const a = DigitalTwinGateway.getInstance();
    const b = DigitalTwinGateway.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance clears connections', () => {
    const gw = DigitalTwinGateway.getInstance();
    gw.connect('dev-1', 'mqtt://broker.local');
    expect(gw.getStatus('dev-1')).toBe('connected');
    DigitalTwinGateway.resetInstance();
    const fresh = DigitalTwinGateway.getInstance();
    expect(fresh.getStatus('dev-1')).toBe('disconnected');
  });

  // ─── IotGateway contract ─────────────────────────────────────────────────────

  it('connect stores a connection and emits connected', () => {
    const gw = DigitalTwinGateway.getInstance();
    const listener = vi.fn();
    gw.on('connected', listener);
    gw.connect('sensor-01', 'mqtt://broker.local');
    expect(gw.getStatus('sensor-01')).toBe('connected');
    expect(listener).toHaveBeenCalledTimes(1);
    const call = listener.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.deviceId).toBe('sensor-01');
    expect(call.protocol).toBe('mqtt');
  });

  it('connect parses REST protocol from https:// string', () => {
    const gw = DigitalTwinGateway.getInstance();
    gw.connect('sensor-02', 'https://api.local');
    expect(gw.getStatus('sensor-02')).toBe('connected');
  });

  it('connect parses OPC-UA protocol from opc.tcp:// string', () => {
    const gw = DigitalTwinGateway.getInstance();
    gw.connect('sensor-03', 'opc.tcp://plc.local:4840');
    expect(gw.getStatus('sensor-03')).toBe('connected');
  });

  it('disconnect removes connection and emits disconnected', () => {
    const gw = DigitalTwinGateway.getInstance();
    gw.connect('sensor-04', 'mqtt://broker.local');
    const listener = vi.fn();
    gw.on('disconnected', listener);
    gw.disconnect('sensor-04');
    expect(gw.getStatus('sensor-04')).toBe('disconnected');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('sendUpdate calls pushToPhysical internally', () => {
    const gw = DigitalTwinGateway.getInstance();
    const spy = vi.spyOn(gw, 'pushToPhysical').mockResolvedValue(undefined);
    gw.sendUpdate('actuator-01', 'open', { angle: 90 });
    expect(spy).toHaveBeenCalledWith('actuator-01', 'open', { angle: 90 });
    spy.mockRestore();
  });

  it('off removes a listener', () => {
    const gw = DigitalTwinGateway.getInstance();
    const listener = vi.fn();
    gw.on('error', listener);
    gw.off('error', listener);
    gw.connect('sensor-05', 'mqtt://broker.local');
    expect(listener).not.toHaveBeenCalled();
  });

  // ─── Event emitter ──────────────────────────────────────────────────────────

  it('handleIncomingData emits telemetry to listeners', () => {
    const gw = DigitalTwinGateway.getInstance();
    const listener = vi.fn();
    gw.on('telemetry', listener);
    const payload: TwinPayload = {
      id: 'twin-1',
      topic: 'sensor-06',
      payload: { temperature: 42 },
      timestamp: Date.now(),
    };
    gw.handleIncomingData(payload);
    expect(listener).toHaveBeenCalledTimes(1);
    const data = listener.mock.calls[0]![0] as Record<string, unknown>;
    expect(data.deviceId).toBe('sensor-06');
    expect((data.readings as Record<string, unknown>).temperature).toBe(42);
  });

  it('listener exceptions do not break other listeners', () => {
    const gw = DigitalTwinGateway.getInstance();
    const bad = vi.fn().mockImplementation(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    gw.on('telemetry', bad);
    gw.on('telemetry', good);
    gw.handleIncomingData({
      id: 'twin-2',
      topic: 'sensor-07',
      payload: {},
      timestamp: Date.now(),
    });
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  // ─── Actuator helpers ───────────────────────────────────────────────────────

  it('pushToActuator routes to actuators/{id} topic', async () => {
    const gw = DigitalTwinGateway.getInstance();
    const spy = vi.spyOn(gw, 'pushToPhysical').mockResolvedValue(undefined);
    await gw.pushToActuator('valve-01', 'open', 90);
    expect(spy).toHaveBeenCalledWith('actuators/valve-01', 'open', 90);
    spy.mockRestore();
  });

  // ─── setGateway wiring ──────────────────────────────────────────────────────

  it('setGateway wires into digitalTwinHandler', () => {
    const gw = DigitalTwinGateway.getInstance();
    setGateway(gw);
    expect((digitalTwinHandler as Record<string, unknown>).gateway).toBe(gw);
  });

  it('setGateway wires into holoTwinHandler', () => {
    const gw = DigitalTwinGateway.getInstance();
    setGateway(gw);
    expect((holoTwinHandler as Record<string, unknown>).gateway).toBe(gw);
  });
});