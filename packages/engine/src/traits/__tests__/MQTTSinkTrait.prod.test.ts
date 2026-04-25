/**
 * MQTTSinkTrait — Production Test Suite
 *
 * Dependencies mocked:
 * - MQTTClient (createMQTTClient, getMQTTClient, registerMQTTClient) from runtime/protocols/MQTTClient
 *
 * Key behaviours:
 * 1. defaultConfig — 7 fields
 * 2. onAttach:
 *   - creates __mqttSinkState with initial values
 *   - creates MQTT client via createMQTTClient; registers it
 *   - re-uses existing client via getMQTTClient if same key
 *   - registers connect/disconnect/error callbacks
 *   - auto-connects when autoConnect=true, skips when false
 * 3. onDetach:
 *   - publishes empty retained message when retain=true
 *   - deletes __mqttSinkState
 * 4. onUpdate:
 *   - no-op when not connected
 *   - applies throttle guard
 *   - onChangeOnly: skips publish when state unchanged
 *   - onChangeOnly=false: publishes every update
 *   - resolves topic placeholders ({nodeId})
 *   - emits mqtt_published on success
 *   - emits mqtt_publish_error on failure
 * 5. onEvent 'mqtt_publish_request' — publishes with custom topic/payload
 * 6. onEvent 'mqtt_sink_connect_request' — calls client.connect()
 * 7. onEvent 'mqtt_sink_disconnect_request' — calls client.disconnect()
 * 8. Exported helpers: hasMQTTSinkTrait, getMQTTSinkState, isMQTTSinkConnected
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock MQTTClient ──────────────────────────────────────────────────────────
const _clientRegistry: Record<string, any> = {};
let _mockClientInstance: any;

function makeMockClient() {
  const listeners: Record<string, (...args: any[]) => void> = {};
  const client = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    publish: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, cb: (...a: any[]) => void) => {
      listeners[event] = cb;
    }),
    _trigger: (event: string, ...args: any[]) => listeners[event]?.(...args),
  };
  return client;
}

vi.mock('@holoscript/engine/runtime/protocols/MQTTClient', () => ({
  createMQTTClient: vi.fn(() => {
    _mockClientInstance = makeMockClient();
    return _mockClientInstance;
  }),
  getMQTTClient: vi.fn((key: string) => _clientRegistry[key] || null),
  registerMQTTClient: vi.fn((key: string, client: any) => {
    _clientRegistry[key] = client;
  }),
}));

import {
  mqttSinkHandler,
  hasMQTTSinkTrait,
  getMQTTSinkState,
  isMQTTSinkConnected,
} from '../MQTTSinkTrait';
import {
  createMQTTClient,
  getMQTTClient,
  registerMQTTClient,
} from '../../runtime/protocols/MQTTClient';

// ─── helpers ──────────────────────────────────────────────────────────────────
let _nodeId = 0;
function makeNode(name = 'TestNode') {
  return { id: `mqtt_node_${++_nodeId}`, name };
}
function makeCtx(state: any = {}) {
  return { emit: vi.fn(), getState: vi.fn().mockReturnValue(state) };
}
function makeConfig(o: any = {}) {
  return { ...mqttSinkHandler.defaultConfig!, ...o };
}

function attach(configOverrides: any = {}, stateOverrides: any = {}) {
  const node = makeNode();
  const ctx = makeCtx(stateOverrides);
  const config = makeConfig({ autoConnect: false, ...configOverrides }); // disable auto-connect by default
  mqttSinkHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

function getState(node: any) {
  return (node as any).__mqttSinkState;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(_clientRegistry).forEach((k) => delete _clientRegistry[k]);
  _mockClientInstance = makeMockClient();
  (createMQTTClient as any).mockImplementation(() => {
    _mockClientInstance = makeMockClient();
    return _mockClientInstance;
  });
  (getMQTTClient as any).mockImplementation((key: string) => _clientRegistry[key] || null);
  (registerMQTTClient as any).mockImplementation((key: string, client: any) => {
    _clientRegistry[key] = client;
  });
});

// ─── defaultConfig ────────────────────────────────────────────────────────────
describe('mqttSinkHandler.defaultConfig', () => {
  const d = mqttSinkHandler.defaultConfig!;
  it('broker = mqtt://localhost:1883', () => expect(d.broker).toBe('mqtt://localhost:1883'));
  it('topic = holoscript/{nodeId}/state', () => expect(d.topic).toBe('holoscript/{nodeId}/state'));
  it('retain = false', () => expect(d.retain).toBe(false));
  it('qos = 0', () => expect(d.qos).toBe(0));
  it('onChangeOnly = true', () => expect(d.onChangeOnly).toBe(true));
  it('serializeJson = true', () => expect(d.serializeJson).toBe(true));
  it('includeTimestamp = false', () => expect(d.includeTimestamp).toBe(false));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────
describe('mqttSinkHandler.onAttach', () => {
  it('creates __mqttSinkState', () => {
    const { node } = attach();
    expect(getState(node)).toBeDefined();
  });
  it('connected = false', () => {
    const { node } = attach();
    expect(getState(node).connected).toBe(false);
  });
  it('publishCount = 0', () => {
    const { node } = attach();
    expect(getState(node).publishCount).toBe(0);
  });
  it('error = null', () => {
    const { node } = attach();
    expect(getState(node).error).toBeNull();
  });
  it('creates MQTT client via createMQTTClient', () => {
    attach();
    expect(createMQTTClient).toHaveBeenCalled();
  });
  it('re-uses existing client via getMQTTClient for same key', () => {
    const existingClient = makeMockClient();
    _clientRegistry['mqtt://localhost:1883_default'] = existingClient;
    attach({ broker: 'mqtt://localhost:1883', clientId: undefined });
    expect(createMQTTClient).not.toHaveBeenCalled();
  });
  it('auto-connects when autoConnect=true', () => {
    attach({ autoConnect: true });
    expect(_mockClientInstance.connect).toHaveBeenCalled();
  });
  it('does NOT auto-connect when autoConnect=false', () => {
    attach({ autoConnect: false });
    expect(_mockClientInstance.connect).not.toHaveBeenCalled();
  });

  describe('MQTT client callbacks', () => {
    it('connect event → state.connected=true, clears error, emits mqtt_sink_connected', () => {
      const { node, ctx } = attach();
      const state = getState(node);
      state.error = 'prev_error';
      state.client._trigger('connect');
      expect(state.connected).toBe(true);
      expect(state.error).toBeNull();
      expect(ctx.emit).toHaveBeenCalledWith(
        'mqtt_sink_connected',
        expect.objectContaining({ broker: mqttSinkHandler.defaultConfig!.broker })
      );
    });

    it('disconnect event → state.connected=false, emits mqtt_sink_disconnected', () => {
      const { node, ctx } = attach();
      const state = getState(node);
      state.connected = true;
      state.client._trigger('disconnect', 'broker_closed');
      expect(state.connected).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('mqtt_sink_disconnected', expect.any(Object));
    });

    it('error event → state.error set, emits mqtt_sink_error', () => {
      const { node, ctx } = attach();
      getState(node).client._trigger('error', new Error('conn_refused'));
      expect(getState(node).error).toBe('conn_refused');
      expect(ctx.emit).toHaveBeenCalledWith(
        'mqtt_sink_error',
        expect.objectContaining({ error: 'conn_refused' })
      );
    });
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────
describe('mqttSinkHandler.onDetach', () => {
  it('removes __mqttSinkState', () => {
    const { node, ctx, config } = attach();
    mqttSinkHandler.onDetach!(node as any, config, ctx as any);
    expect(getState(node)).toBeUndefined();
  });

  it('publishes empty retained message when retain=true', () => {
    const { node, ctx, config } = attach({ retain: true });
    const client = getState(node).client;
    mqttSinkHandler.onDetach!(node as any, config, ctx as any);
    expect(client.publish).toHaveBeenCalledWith(
      expect.any(String),
      '',
      expect.objectContaining({ retain: true })
    );
  });

  it('does NOT publish empty message when retain=false', () => {
    const { node, ctx, config } = attach({ retain: false });
    const client = getState(node).client;
    mqttSinkHandler.onDetach!(node as any, config, ctx as any);
    expect(client.publish).not.toHaveBeenCalled();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────
describe('mqttSinkHandler.onUpdate', () => {
  it('no-op when not connected', () => {
    const { node, ctx, config } = attach({}, { x: 1 });
    mqttSinkHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(getState(node).client.publish).not.toHaveBeenCalled();
  });

  it('publishes when connected and onChangeOnly=false', async () => {
    const { node, ctx, config } = attach({ onChangeOnly: false }, { x: 1 });
    getState(node).connected = true;
    mqttSinkHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    await Promise.resolve(); // flush microtasks
    expect(ctx.emit).toHaveBeenCalledWith('mqtt_published', expect.any(Object));
  });

  it('skips when state unchanged (onChangeOnly=true)', async () => {
    const { node, ctx, config } = attach({ onChangeOnly: true }, { score: 42 });
    getState(node).connected = true;
    // First update — publishes
    mqttSinkHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    await Promise.resolve();
    ctx.emit.mockClear();
    // Second update with same state — should skip
    mqttSinkHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    await Promise.resolve();
    expect(getState(node).client.publish).toHaveBeenCalledTimes(1);
  });

  it('publishes when state changes (onChangeOnly=true)', async () => {
    const ctx1 = makeCtx({ score: 42 });
    const node = makeNode();
    const config = makeConfig({ onChangeOnly: true, autoConnect: false });
    mqttSinkHandler.onAttach!(node as any, config, ctx1 as any);
    getState(node).connected = true;
    // First update
    mqttSinkHandler.onUpdate!(node as any, config, ctx1 as any, 0.016);
    await Promise.resolve();
    // Second update with different state
    ctx1.getState.mockReturnValue({ score: 99 });
    mqttSinkHandler.onUpdate!(node as any, config, ctx1 as any, 0.016);
    await Promise.resolve();
    expect(getState(node).publishCount).toBe(2);
  });

  it('throttle prevents rapid publishes', async () => {
    const { node, ctx, config } = attach({ onChangeOnly: false, throttle: 5000 }, { x: 1 });
    getState(node).connected = true;
    getState(node).lastPublished = Date.now(); // simulate recent publish
    mqttSinkHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    await Promise.resolve();
    expect(getState(node).client.publish).not.toHaveBeenCalled();
  });

  it('resolves {nodeId} placeholder in topic', async () => {
    const myNode = makeNode('Robot');
    const ctx2 = makeCtx({ x: 1 });
    const config = makeConfig({
      topic: 'sensor/{nodeId}/data',
      onChangeOnly: false,
      autoConnect: false,
    });
    mqttSinkHandler.onAttach!(myNode as any, config, ctx2 as any);
    getState(myNode).connected = true;
    mqttSinkHandler.onUpdate!(myNode as any, config, ctx2 as any, 0.016);
    await Promise.resolve();
    expect(getState(myNode).client.publish).toHaveBeenCalledWith(
      'sensor/Robot/data',
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('emits mqtt_publish_error on publish failure', async () => {
    const { node, ctx, config } = attach({ onChangeOnly: false }, { x: 1 });
    const st = getState(node);
    st.connected = true;
    st.client.publish.mockRejectedValueOnce(new Error('broker_full'));
    mqttSinkHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.emit).toHaveBeenCalledWith(
      'mqtt_publish_error',
      expect.objectContaining({ error: 'broker_full' })
    );
  });
});

// ─── onEvent ─────────────────────────────────────────────────────────────────
describe('mqttSinkHandler.onEvent', () => {
  it('mqtt_publish_request — calls client.publish with provided topic/payload', async () => {
    const { node, ctx, config } = attach();
    mqttSinkHandler.onEvent!(node as any, config, ctx as any, {
      type: 'mqtt_publish_request',
      topic: 'custom/topic',
      payload: { val: 1 },
    });
    await Promise.resolve();
    expect(getState(node).client.publish).toHaveBeenCalledWith(
      'custom/topic',
      expect.anything(),
      expect.any(Object)
    );
  });

  it('mqtt_sink_connect_request — calls client.connect()', () => {
    const { node, ctx, config } = attach();
    mqttSinkHandler.onEvent!(node as any, config, ctx as any, {
      type: 'mqtt_sink_connect_request',
    });
    expect(getState(node).client.connect).toHaveBeenCalled();
  });

  it('mqtt_sink_disconnect_request — calls client.disconnect()', () => {
    const { node, ctx, config } = attach();
    mqttSinkHandler.onEvent!(node as any, config, ctx as any, {
      type: 'mqtt_sink_disconnect_request',
    });
    expect(getState(node).client.disconnect).toHaveBeenCalled();
  });
});

// ─── exported helpers ─────────────────────────────────────────────────────────
describe('exported helpers', () => {
  it('hasMQTTSinkTrait: true after attach', () => {
    const { node } = attach();
    expect(hasMQTTSinkTrait(node)).toBe(true);
  });
  it('hasMQTTSinkTrait: false before attach', () => {
    const node = makeNode();
    expect(hasMQTTSinkTrait(node)).toBe(false);
  });
  it('getMQTTSinkState: returns state after attach', () => {
    const { node } = attach();
    expect(getMQTTSinkState(node)).toBeDefined();
    expect(getMQTTSinkState(node)!.publishCount).toBe(0);
  });
  it('isMQTTSinkConnected: false initially', () => {
    const { node } = attach();
    expect(isMQTTSinkConnected(node)).toBe(false);
  });
  it('isMQTTSinkConnected: true after connect callback', () => {
    const { node } = attach();
    getState(node).client._trigger('connect');
    expect(isMQTTSinkConnected(node)).toBe(true);
  });
});
