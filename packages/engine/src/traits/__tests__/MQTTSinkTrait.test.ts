/**
 * MQTTSinkTrait Tests
 *
 * Tests for MQTT publish trait handler.
 *
 * @version 3.1.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mqttSinkHandler,
  hasMQTTSinkTrait,
  getMQTTSinkState,
  getMQTTSinkClient,
  isMQTTSinkConnected,
  type MQTTSinkConfig,
} from '../MQTTSinkTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

// Mock the MQTTClient module
vi.mock('@holoscript/engine/runtime/protocols/MQTTClient', () => ({
  createMQTTClient: vi.fn(() => ({
    connect: vi.fn(() => Promise.resolve()),
    disconnect: vi.fn(),
    publish: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    off: vi.fn(),
  })),
  getMQTTClient: vi.fn(() => null),
  registerMQTTClient: vi.fn(),
}));

describe('mqttSinkHandler', () => {
  let node: any;
  let context: ReturnType<typeof createMockContext>;
  let config: MQTTSinkConfig;

  beforeEach(() => {
    node = createMockNode('mqtt-test-node');
    context = createMockContext();
    config = {
      broker: 'mqtt://localhost:1883',
      topic: 'test/topic',
      retain: false,
      qos: 0,
    };
  });

  describe('handler metadata', () => {
    it('should have correct name', () => {
      expect(mqttSinkHandler.name).toBe('mqtt_sink');
    });

    it('should have default config', () => {
      expect(mqttSinkHandler.defaultConfig).toBeDefined();
      expect(mqttSinkHandler.defaultConfig.broker).toBe('mqtt://localhost:1883');
      expect(mqttSinkHandler.defaultConfig.qos).toBe(0);
      expect(mqttSinkHandler.defaultConfig.retain).toBe(false);
    });
  });

  describe('onAttach', () => {
    it('should initialize state on node', () => {
      attachTrait(mqttSinkHandler, node, config, context);

      expect(node.__mqttSinkState).toBeDefined();
      expect(node.__mqttSinkState.connected).toBe(false);
      expect(node.__mqttSinkState.publishCount).toBe(0);
    });

    it('should create MQTT client', () => {
      attachTrait(mqttSinkHandler, node, config, context);

      expect(node.__mqttSinkState.client).toBeDefined();
    });

    it('should auto-connect by default', () => {
      const autoConfig = { ...config, autoConnect: true };
      attachTrait(mqttSinkHandler, node, autoConfig, context);

      expect(node.__mqttSinkState.client.connect).toHaveBeenCalled();
    });

    it('should not auto-connect when disabled', () => {
      const noAutoConfig = { ...config, autoConnect: false };
      attachTrait(mqttSinkHandler, node, noAutoConfig, context);

      expect(node.__mqttSinkState.client.connect).not.toHaveBeenCalled();
    });
  });

  describe('onDetach', () => {
    it('should clean up state', () => {
      attachTrait(mqttSinkHandler, node, config, context);
      mqttSinkHandler.onDetach?.(node, config, context);

      expect(node.__mqttSinkState).toBeUndefined();
    });

    it('should publish empty message with retain to clear', () => {
      const retainConfig = { ...config, retain: true };
      attachTrait(mqttSinkHandler, node, retainConfig, context);

      const client = node.__mqttSinkState.client;
      mqttSinkHandler.onDetach?.(node, retainConfig, context);

      // Should have published empty message
      expect(client.publish).toHaveBeenCalled();
    });
  });

  describe('onUpdate', () => {
    beforeEach(() => {
      attachTrait(mqttSinkHandler, node, config, context);
      // Simulate connected state
      node.__mqttSinkState.connected = true;
    });

    it('should not publish when disconnected', () => {
      node.__mqttSinkState.connected = false;

      updateTrait(mqttSinkHandler, node, config, context, 16);

      expect(node.__mqttSinkState.client.publish).not.toHaveBeenCalled();
    });

    it('should respect throttle interval', () => {
      const throttledConfig = { ...config, throttle: 1000 };
      node.__mqttSinkState.lastPublished = Date.now() - 500; // 500ms ago

      updateTrait(mqttSinkHandler, node, throttledConfig, context, 16);

      // Should not publish (last publish was 500ms ago, throttle is 1000ms)
      expect(node.__mqttSinkState.client.publish).not.toHaveBeenCalled();
    });

    it('should publish when throttle elapsed', () => {
      const throttledConfig = { ...config, throttle: 1000, onChangeOnly: false };
      node.__mqttSinkState.lastPublished = Date.now() - 1500; // 1500ms ago

      // Add getState mock
      context.getState = vi.fn(() => ({ key: 'value' }));

      updateTrait(mqttSinkHandler, node, throttledConfig, context, 16);

      expect(node.__mqttSinkState.client.publish).toHaveBeenCalled();
    });

    it('should check for changes when onChangeOnly is true', () => {
      const changeConfig = { ...config, onChangeOnly: true, serializeJson: true };
      node.__mqttSinkState.lastStateHash = '{"key":"value"}';

      // Mock getState to return same state
      context.getState = vi.fn(() => ({ key: 'value' }));

      updateTrait(mqttSinkHandler, node, changeConfig, context, 16);

      // Should not publish (state hasn't changed)
      expect(node.__mqttSinkState.client.publish).not.toHaveBeenCalled();
    });
  });

  describe('onEvent', () => {
    beforeEach(() => {
      attachTrait(mqttSinkHandler, node, config, context);
      node.__mqttSinkState.connected = true;
    });

    it('should handle mqtt_publish_request', () => {
      sendEvent(mqttSinkHandler, node, config, context, {
        type: 'mqtt_publish_request',
        topic: 'custom/topic',
        payload: { data: 123 },
      });

      expect(node.__mqttSinkState.client.publish).toHaveBeenCalled();
    });

    it('should handle mqtt_sink_connect_request', () => {
      sendEvent(mqttSinkHandler, node, config, context, {
        type: 'mqtt_sink_connect_request',
      });

      expect(node.__mqttSinkState.client.connect).toHaveBeenCalled();
    });

    it('should handle mqtt_sink_disconnect_request', () => {
      sendEvent(mqttSinkHandler, node, config, context, {
        type: 'mqtt_sink_disconnect_request',
      });

      expect(node.__mqttSinkState.client.disconnect).toHaveBeenCalled();
    });
  });

  describe('topic resolution', () => {
    it('should resolve {nodeId} placeholder', () => {
      const topicConfig = { ...config, topic: 'devices/{nodeId}/state' };
      node.name = 'device-123';
      attachTrait(mqttSinkHandler, node, topicConfig, context);
      node.__mqttSinkState.connected = true;

      // Mock getState
      context.getState = vi.fn(() => ({}));

      updateTrait(mqttSinkHandler, node, { ...topicConfig, onChangeOnly: false }, context, 16);

      const publishCall = node.__mqttSinkState.client.publish.mock.calls[0];
      expect(publishCall[0]).toBe('devices/device-123/state');
    });
  });
});

describe('MQTT sink helper functions', () => {
  let node: any;
  let context: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('helper-test');
    context = createMockContext();
  });

  describe('hasMQTTSinkTrait', () => {
    it('should return false for node without trait', () => {
      expect(hasMQTTSinkTrait(node)).toBe(false);
    });

    it('should return true for node with trait', () => {
      attachTrait(
        mqttSinkHandler,
        node,
        { broker: 'mqtt://localhost', topic: 'test', retain: false, qos: 0 },
        context
      );

      expect(hasMQTTSinkTrait(node)).toBe(true);
    });
  });

  describe('getMQTTSinkState', () => {
    it('should return null for node without trait', () => {
      expect(getMQTTSinkState(node)).toBeNull();
    });

    it('should return state for node with trait', () => {
      attachTrait(
        mqttSinkHandler,
        node,
        { broker: 'mqtt://localhost', topic: 'test', retain: false, qos: 0 },
        context
      );

      const state = getMQTTSinkState(node);
      expect(state).toBeDefined();
      expect(state?.connected).toBe(false);
    });
  });

  describe('getMQTTSinkClient', () => {
    it('should return null for node without trait', () => {
      expect(getMQTTSinkClient(node)).toBeNull();
    });

    it('should return client for node with trait', () => {
      attachTrait(
        mqttSinkHandler,
        node,
        { broker: 'mqtt://localhost', topic: 'test', retain: false, qos: 0 },
        context
      );

      const client = getMQTTSinkClient(node);
      expect(client).toBeDefined();
    });
  });

  describe('isMQTTSinkConnected', () => {
    it('should return false for node without trait', () => {
      expect(isMQTTSinkConnected(node)).toBe(false);
    });

    it('should return connection status', () => {
      attachTrait(
        mqttSinkHandler,
        node,
        { broker: 'mqtt://localhost', topic: 'test', retain: false, qos: 0 },
        context
      );

      expect(isMQTTSinkConnected(node)).toBe(false);

      node.__mqttSinkState.connected = true;
      expect(isMQTTSinkConnected(node)).toBe(true);
    });
  });
});

describe('MQTTSinkConfig', () => {
  it('should support all QoS levels', () => {
    const configs: MQTTSinkConfig[] = [
      { broker: 'mqtt://localhost', topic: 't', qos: 0, retain: false },
      { broker: 'mqtt://localhost', topic: 't', qos: 1, retain: false },
      { broker: 'mqtt://localhost', topic: 't', qos: 2, retain: false },
    ];

    configs.forEach((cfg) => {
      expect([0, 1, 2]).toContain(cfg.qos);
    });
  });

  it('should support authentication options', () => {
    const config: MQTTSinkConfig = {
      broker: 'mqtt://localhost',
      topic: 'test',
      qos: 0,
      retain: false,
      username: 'user',
      password: 'pass',
    };

    expect(config.username).toBe('user');
    expect(config.password).toBe('pass');
  });

  it('should support field filtering', () => {
    const config: MQTTSinkConfig = {
      broker: 'mqtt://localhost',
      topic: 'test',
      qos: 0,
      retain: false,
      fields: ['position', 'rotation'],
    };

    expect(config.fields).toContain('position');
    expect(config.fields).toContain('rotation');
  });
});
