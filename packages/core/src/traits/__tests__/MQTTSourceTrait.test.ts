import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readJson } from '../../errors/safeJsonParse';
import {
  createMockNode,
  createMockContext,
  attachTrait,
  updateTrait,
  sendEvent,
} from './traitTestHelpers';

// Mock MQTTClient module
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockDisconnect = vi.fn();
const mockOn = vi.fn();

vi.mock('@holoscript/engine/runtime/protocols/MQTTClient', () => ({
  MQTTClient: {
    parsePayload: vi.fn((msg: any) => {
      try {
        return readJson(msg.payload);
      } catch {
        return msg.payload;
      }
    }),
  },
  createMQTTClient: vi.fn(() => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    connect: mockConnect,
    disconnect: mockDisconnect,
    on: mockOn,
  })),
  getMQTTClient: vi.fn(() => null),
  registerMQTTClient: vi.fn(),
}));

import {
  mqttSourceHandler,
  hasMQTTSourceTrait,
  getMQTTSourceState,
  isMQTTSourceConnected,
} from '../MQTTSourceTrait';

describe('MQTTSourceTrait', () => {
  let node: Record<string, unknown>;
  let ctx: any;
  const cfg = {
    broker: 'mqtt://test:1883',
    topic: 'sensors/#',
    qos: 0 as const,
    parseJson: true,
    stateField: 'value',
    autoConnect: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('sensor1');
    ctx = {
      ...createMockContext(),
      setState: vi.fn(),
    };
    attachTrait(mqttSourceHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const s = (node as any).__mqttSourceState;
    expect(s).toBeDefined();
    expect(s.connected).toBe(false);
    expect(s.lastMessage).toBeNull();
    expect(s.messageCount).toBe(0);
    expect(s.client).toBeDefined();
  });

  it('creates MQTT client on attach', () => {
    // Client is stored in state — confirms createMQTTClient was invoked
    const s = (node as any).__mqttSourceState;
    expect(s.client).toBeDefined();
    expect(s.client).not.toBeNull();
  });

  it('subscribes to topic on attach', () => {
    expect(mockSubscribe).toHaveBeenCalledWith(
      { topic: 'sensors/#', qos: 0 },
      expect.any(Function)
    );
  });

  it('auto-connects on attach when autoConnect is true', () => {
    expect(mockConnect).toHaveBeenCalled();
  });

  it('sets up event handlers on client', () => {
    expect(mockOn).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('unsubscribes on detach', () => {
    mqttSourceHandler.onDetach?.(node as any, cfg as any, ctx);
    expect(mockUnsubscribe).toHaveBeenCalledWith('sensors/#');
    expect((node as any).__mqttSourceState).toBeUndefined();
  });

  it('hasMQTTSourceTrait returns true when attached', () => {
    expect(hasMQTTSourceTrait(node)).toBe(true);
  });

  it('hasMQTTSourceTrait returns false for bare node', () => {
    expect(hasMQTTSourceTrait({})).toBe(false);
  });

  it('getMQTTSourceState returns state', () => {
    const s = getMQTTSourceState(node);
    expect(s).not.toBeNull();
    expect(s!.connected).toBe(false);
  });

  it('isMQTTSourceConnected returns false initially', () => {
    expect(isMQTTSourceConnected(node)).toBe(false);
  });

  it('has correct handler name', () => {
    expect(mqttSourceHandler.name).toBe('mqtt_source');
  });

  it('handles mqtt_disconnect_request event', () => {
    sendEvent(mqttSourceHandler, node, cfg, ctx, { type: 'mqtt_disconnect_request' });
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
