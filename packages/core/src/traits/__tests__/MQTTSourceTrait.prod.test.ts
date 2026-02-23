/**
 * MQTTSourceTrait — Production Test Suite
 *
 * Dependencies mocked:
 * - MQTTClient (createMQTTClient, getMQTTClient, registerMQTTClient, MQTTClient.parsePayload)
 *
 * Key behaviours:
 * 1. defaultConfig — 5 fields
 * 2. onAttach:
 *   - creates __mqttSourceState
 *   - creates or reuses MQTT client
 *   - registers connect/disconnect/error callbacks → state + emit
 *   - subscribes to topic with callback
 *   - autoConnect=true calls client.connect()
 * 3. subscribe callback (via _triggerMessage):
 *   - without parseJson: passes raw payload
 *   - with parseJson: calls MQTTClient.parsePayload
 *   - increments messageCount, sets lastMessage, calls context.setState
 *   - emits mqtt_message with topic/value/timestamp
 *   - with debounce: only processes after timeout, leading calls ignored
 * 4. onDetach — calls client.unsubscribe(topic); deletes state
 * 5. onUpdate — calls client.connect() when disconnected + autoConnect=true
 * 6. onEvent 'mqtt_connect_request' — calls client.connect()
 * 7. onEvent 'mqtt_disconnect_request' — calls client.disconnect()
 * 8. Exported helpers: hasMQTTSourceTrait, getMQTTSourceState, isMQTTSourceConnected
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock MQTTClient ──────────────────────────────────────────────────────────
const _clientRegistry: Record<string, any> = {};
let _mockClientInstance: any;

function makeMockClient() {
  const evtListeners: Record<string, (...args: any[]) => void> = {};
  let _subscribeCallback: ((msg: any) => void) | null = null;
  const client = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    subscribe: vi.fn((_opts: any, cb: (msg: any) => void) => { _subscribeCallback = cb; }),
    unsubscribe: vi.fn(),
    on: vi.fn((event: string, cb: any) => { evtListeners[event] = cb; }),
    _trigger: (event: string, ...args: any[]) => evtListeners[event]?.(...args),
    _triggerMessage: (msg: any) => _subscribeCallback?.(msg),
  };
  return client;
}

vi.mock('../../runtime/protocols/MQTTClient', () => {
  const parsePayload = vi.fn((msg: any) => {
    try { return JSON.parse(msg.payload); } catch { return msg.payload; }
  });
  return {
    createMQTTClient: vi.fn(() => {
      _mockClientInstance = makeMockClient();
      return _mockClientInstance;
    }),
    getMQTTClient: vi.fn((key: string) => _clientRegistry[key] || null),
    registerMQTTClient: vi.fn((key: string, client: any) => { _clientRegistry[key] = client; }),
    MQTTClient: { parsePayload },
  };
});

import {
  mqttSourceHandler,
  hasMQTTSourceTrait,
  getMQTTSourceState,
  isMQTTSourceConnected,
} from '../MQTTSourceTrait';
import { createMQTTClient, getMQTTClient, MQTTClient } from '../../runtime/protocols/MQTTClient';

// ─── helpers ──────────────────────────────────────────────────────────────────
let _nodeId = 0;
function makeNode(name = 'SrcNode') { return { id: `src_${++_nodeId}`, name }; }
function makeCtx() { return { emit: vi.fn(), setState: vi.fn(), getState: vi.fn().mockReturnValue({}) }; }
function makeConfig(o: any = {}) { return { ...mqttSourceHandler.defaultConfig!, ...o }; }

function attach(configOverrides: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = makeConfig({ autoConnect: false, ...configOverrides });
  mqttSourceHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}
function getState(node: any) { return (node as any).__mqttSourceState; }

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(_clientRegistry).forEach((k) => delete _clientRegistry[k]);
  _mockClientInstance = makeMockClient();
  (createMQTTClient as any).mockImplementation(() => {
    _mockClientInstance = makeMockClient();
    return _mockClientInstance;
  });
  (getMQTTClient as any).mockImplementation((key: string) => _clientRegistry[key] || null);
});

// ─── defaultConfig ────────────────────────────────────────────────────────────
describe('mqttSourceHandler.defaultConfig', () => {
  const d = mqttSourceHandler.defaultConfig!;
  it('broker = mqtt://localhost:1883', () => expect(d.broker).toBe('mqtt://localhost:1883'));
  it('topic = #', () => expect(d.topic).toBe('#'));
  it('qos = 0', () => expect(d.qos).toBe(0));
  it('parseJson = true', () => expect(d.parseJson).toBe(true));
  it('stateField = value', () => expect(d.stateField).toBe('value'));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────
describe('mqttSourceHandler.onAttach', () => {
  it('creates __mqttSourceState', () => expect(attach().node.__mqttSourceState).toBeDefined());
  it('connected = false', () => expect(attach().node.__mqttSourceState.connected).toBe(false));
  it('messageCount = 0', () => expect(attach().node.__mqttSourceState.messageCount).toBe(0));
  it('error = null', () => expect(attach().node.__mqttSourceState.error).toBeNull());

  it('creates MQTT client via createMQTTClient', () => {
    attach();
    expect(createMQTTClient).toHaveBeenCalled();
  });

  it('re-uses existing client for same key', () => {
    const existing = makeMockClient();
    _clientRegistry['mqtt://localhost:1883_default'] = existing;
    (getMQTTClient as any).mockImplementation((key: string) => _clientRegistry[key] || null);
    attach();
    expect(createMQTTClient).not.toHaveBeenCalled();
  });

  it('subscribes to topic on attach', () => {
    attach({ topic: 'sensors/+/temp' });
    expect(_mockClientInstance.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'sensors/+/temp' }),
      expect.any(Function)
    );
  });

  it('auto-connects when autoConnect=true', () => {
    attach({ autoConnect: true });
    expect(_mockClientInstance.connect).toHaveBeenCalled();
  });

  it('does NOT auto-connect when autoConnect=false', () => {
    attach({ autoConnect: false });
    expect(_mockClientInstance.connect).not.toHaveBeenCalled();
  });

  describe('client callbacks', () => {
    it('connect → state.connected=true, clears error, emits mqtt_connected', () => {
      const { node, ctx } = attach();
      getState(node).error = 'old_error';
      getState(node).client._trigger('connect');
      expect(getState(node).connected).toBe(true);
      expect(getState(node).error).toBeNull();
      expect(ctx.emit).toHaveBeenCalledWith('mqtt_connected', expect.objectContaining({ broker: mqttSourceHandler.defaultConfig!.broker }));
    });

    it('disconnect → state.connected=false, emits mqtt_disconnected', () => {
      const { node, ctx } = attach();
      getState(node).connected = true;
      getState(node).client._trigger('disconnect', 'timeout');
      expect(getState(node).connected).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('mqtt_disconnected', expect.any(Object));
    });

    it('error → state.error set, emits mqtt_error', () => {
      const { node, ctx } = attach();
      getState(node).client._trigger('error', new Error('broker_down'));
      expect(getState(node).error).toBe('broker_down');
      expect(ctx.emit).toHaveBeenCalledWith('mqtt_error', expect.objectContaining({ error: 'broker_down' }));
    });
  });
});

// ─── subscribe callback ───────────────────────────────────────────────────────
describe('subscribe message callback', () => {
  it('calls MQTTClient.parsePayload when parseJson=true', () => {
    const { node, ctx } = attach({ parseJson: true });
    getState(node).client._triggerMessage({ payload: '{"x":1}' });
    expect((MQTTClient as any).parsePayload).toHaveBeenCalled();
  });

  it('passes raw payload when parseJson=false', () => {
    const { node, ctx } = attach({ parseJson: false });
    getState(node).client._triggerMessage({ payload: 'raw_string' });
    expect(getState(node).lastMessage).toBe('raw_string');
  });

  it('increments messageCount on each message', () => {
    const { node } = attach({ parseJson: false });
    getState(node).client._triggerMessage({ payload: 'a' });
    getState(node).client._triggerMessage({ payload: 'b' });
    expect(getState(node).messageCount).toBe(2);
  });

  it('calls context.setState with stateField key', () => {
    const { node, ctx } = attach({ parseJson: false, stateField: 'temperature' });
    getState(node).client._triggerMessage({ payload: 42 });
    expect(ctx.setState).toHaveBeenCalledWith({ temperature: 42 });
  });

  it('emits mqtt_message with topic/value/timestamp', () => {
    const { node, ctx } = attach({ parseJson: false, topic: 'test/topic' });
    ctx.emit.mockClear();
    getState(node).client._triggerMessage({ payload: 'hello' });
    expect(ctx.emit).toHaveBeenCalledWith('mqtt_message', expect.objectContaining({
      topic: 'test/topic', value: 'hello',
    }));
  });

  it('debounce: only processes once after timeout fires', async () => {
    vi.useFakeTimers();
    const { node, ctx } = attach({ parseJson: false, debounce: 100 });
    ctx.emit.mockClear();
    // Fire 3 rapid messages
    getState(node).client._triggerMessage({ payload: 'a' });
    getState(node).client._triggerMessage({ payload: 'b' });
    getState(node).client._triggerMessage({ payload: 'c' });
    expect(getState(node).messageCount).toBe(0); // none processed yet
    await vi.runAllTimersAsync();
    expect(getState(node).messageCount).toBe(1); // only one processed
    vi.useRealTimers();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────
describe('mqttSourceHandler.onDetach', () => {
  it('calls client.unsubscribe with topic', () => {
    const { node, ctx, config } = attach({ topic: 'my/topic' });
    const client = getState(node).client;
    mqttSourceHandler.onDetach!(node as any, config, ctx as any);
    expect(client.unsubscribe).toHaveBeenCalledWith('my/topic');
  });
  it('removes __mqttSourceState', () => {
    const { node, ctx, config } = attach();
    mqttSourceHandler.onDetach!(node as any, config, ctx as any);
    expect(getState(node)).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────
describe('mqttSourceHandler.onUpdate', () => {
  it('calls client.connect() when disconnected + autoConnect=true', () => {
    const { node, ctx, config } = attach({ autoConnect: true });
    _mockClientInstance.connect.mockClear();
    // connected=false by default → triggers reconnect in onUpdate
    mqttSourceHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(getState(node).client.connect).toHaveBeenCalled();
  });

  it('does NOT call connect when already connected', () => {
    const { node, ctx, config } = attach({ autoConnect: true });
    getState(node).connected = true;
    _mockClientInstance.connect.mockClear();
    mqttSourceHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(getState(node).client.connect).not.toHaveBeenCalled();
  });

  it('does NOT call connect when autoConnect=false', () => {
    const { node, ctx, config } = attach({ autoConnect: false });
    _mockClientInstance.connect.mockClear();
    mqttSourceHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(getState(node).client.connect).not.toHaveBeenCalled();
  });
});

// ─── onEvent ─────────────────────────────────────────────────────────────────
describe('mqttSourceHandler.onEvent', () => {
  it('mqtt_connect_request → calls client.connect()', () => {
    const { node, ctx, config } = attach();
    mqttSourceHandler.onEvent!(node as any, config, ctx as any, { type: 'mqtt_connect_request' });
    expect(getState(node).client.connect).toHaveBeenCalled();
  });

  it('mqtt_disconnect_request → calls client.disconnect()', () => {
    const { node, ctx, config } = attach();
    mqttSourceHandler.onEvent!(node as any, config, ctx as any, { type: 'mqtt_disconnect_request' });
    expect(getState(node).client.disconnect).toHaveBeenCalled();
  });
});

// ─── exported helpers ─────────────────────────────────────────────────────────
describe('exported helpers', () => {
  it('hasMQTTSourceTrait: true after attach', () => expect(hasMQTTSourceTrait(attach().node)).toBe(true));
  it('hasMQTTSourceTrait: false before attach', () => expect(hasMQTTSourceTrait(makeNode())).toBe(false));
  it('getMQTTSourceState: returns state object', () => expect(getMQTTSourceState(attach().node)).toBeDefined());
  it('isMQTTSourceConnected: false initially', () => expect(isMQTTSourceConnected(attach().node)).toBe(false));
  it('isMQTTSourceConnected: true after connect callback', () => {
    const { node } = attach();
    getState(node).client._trigger('connect');
    expect(isMQTTSourceConnected(node)).toBe(true);
  });
});
