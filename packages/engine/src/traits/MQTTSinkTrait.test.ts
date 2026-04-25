import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mqttSinkHandler, MQTTSinkConfig } from './MQTTSinkTrait';
import * as MQTTClientModule from '@holoscript/engine/runtime/protocols/MQTTClient';

// Mock MQTT Client Module
vi.mock('@holoscript/engine/runtime/protocols/MQTTClient', () => ({
  createMQTTClient: vi.fn(),
  getMQTTClient: vi.fn(),
  registerMQTTClient: vi.fn(),
  MQTTClient: {
    parsePayload: vi.fn((msg) => msg.payload), // Simple pass-through for mock
  },
}));

describe('MQTTSinkTrait', () => {
  let mockClient: any;
  let mockNode: any;
  let mockContext: any;

  beforeEach(() => {
    // Setup mock client
    mockClient = {
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };

    // Reset module mocks
    vi.mocked(MQTTClientModule.createMQTTClient).mockReturnValue(mockClient);
    vi.mocked(MQTTClientModule.getMQTTClient).mockReturnValue(null);

    // Setup node and context
    mockNode = { name: 'test-node', type: 'sensor' };
    mockContext = {
      emit: vi.fn(),
      getState: vi.fn().mockReturnValue({ temperature: 25 }),
      setState: vi.fn(),
    };

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should create and connect client on attach', () => {
    const config: MQTTSinkConfig = {
      broker: 'mqtt://test',
      topic: 'data',
      qos: 0,
      retain: false,
      autoConnect: true,
    };

    mqttSinkHandler.onAttach!(mockNode, config, mockContext);

    expect(MQTTClientModule.createMQTTClient).toHaveBeenCalledWith(
      expect.objectContaining({
        broker: 'mqtt://test',
      })
    );
    expect(mockClient.on).toHaveBeenCalledWith('connect', expect.any(Function));

    // Should trigger connect
    expect(mockClient.connect).toHaveBeenCalled();

    // Verify state
    expect((mockNode as any).__mqttSinkState).toBeDefined();
    expect((mockNode as any).__mqttSinkState.client).toBe(mockClient);
  });

  it('should publish data on update', async () => {
    const config: MQTTSinkConfig = {
      broker: 'mqtt://test',
      topic: 'sensors/{nodeId}',
      qos: 1,
      retain: false,
      onChangeOnly: false,
      throttle: 0,
      serializeJson: true,
    };

    // Attach first
    mqttSinkHandler.onAttach!(mockNode, config, mockContext);

    // Simulate connection
    const state = (mockNode as any).__mqttSinkState;
    state.connected = true;

    // Trigger update
    await mqttSinkHandler.onUpdate!(mockNode, config, mockContext, 0.16);

    expect(mockContext.getState).toHaveBeenCalled();

    // Check if publish was called at all
    expect(mockClient.publish).toHaveBeenCalled();

    // Check arguments
    const args = mockClient.publish.mock.calls[0];
    expect(args[0]).toBe('sensors/test-node');
    expect(args[1]).toEqual({ temperature: 25 });
    expect(args[2]).toEqual(expect.objectContaining({ qos: 1 }));
  });

  it('should respect throttling', async () => {
    const config: MQTTSinkConfig = {
      broker: 'mqtt://test',
      topic: 'data',
      qos: 0,
      retain: false,
      throttle: 1000, // 1 sec
      onChangeOnly: false,
    };

    mqttSinkHandler.onAttach!(mockNode, config, mockContext);
    const state = (mockNode as any).__mqttSinkState;
    state.connected = true;

    // First publish
    await mqttSinkHandler.onUpdate!(mockNode, config, mockContext, 0.16);
    expect(mockClient.publish).toHaveBeenCalledTimes(1);

    // Immediate second update - should be throttled
    await mqttSinkHandler.onUpdate!(mockNode, config, mockContext, 0.16);
    expect(mockClient.publish).toHaveBeenCalledTimes(1);

    // Advance time
    vi.setSystemTime(Date.now() + 1100);

    // Third update - should publish
    await mqttSinkHandler.onUpdate!(mockNode, config, mockContext, 0.16);
    expect(mockClient.publish).toHaveBeenCalledTimes(2);
  });

  it('should handle manual publish request', () => {
    const config: MQTTSinkConfig = {
      broker: 'mqtt://test',
      topic: 'data',
      qos: 0,
      retain: false,
      serializeJson: true,
    };

    mqttSinkHandler.onAttach!(mockNode, config, mockContext);

    // Trigger event
    mqttSinkHandler.onEvent!(mockNode, config, mockContext, {
      type: 'mqtt_publish_request',
      payload: { value: 100 },
    } as any);

    expect(mockClient.publish).toHaveBeenCalledWith(
      'data',
      { value: 100 },
      {
        qos: 0,
        retain: false,
      }
    );
  });
});
