import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mqttSourceHandler, MQTTSourceConfig } from './MQTTSourceTrait';
import * as MQTTClientModule from '@holoscript/engine/runtime/protocols/MQTTClient';

// Mock MQTT Client Module
vi.mock('@holoscript/engine/runtime/protocols/MQTTClient', () => ({
  createMQTTClient: vi.fn(),
  getMQTTClient: vi.fn(),
  registerMQTTClient: vi.fn(),
  MQTTClient: {
    parsePayload: vi.fn((msg) => JSON.parse(msg.payload.toString())),
  },
}));

describe('MQTTSourceTrait', () => {
  let mockClient: any;
  let mockNode: any;
  let mockContext: any;
  let subscribeCallback: Function;

  beforeEach(() => {
    // Setup mock client
    mockClient = {
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      publish: vi.fn(),
      subscribe: vi.fn().mockImplementation((opts, cb) => {
        subscribeCallback = cb;
      }),
      unsubscribe: vi.fn(),
    };

    // Reset module mocks
    vi.mocked(MQTTClientModule.createMQTTClient).mockReturnValue(mockClient);

    // Setup node and context
    mockNode = { name: 'test-node' };
    mockContext = {
      emit: vi.fn(),
      setState: vi.fn(),
      getState: vi.fn().mockReturnValue({}),
    };

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should subscribe on attach', () => {
    const config: MQTTSourceConfig = {
      broker: 'mqtt://test',
      topic: 'sensors/#',
      qos: 1,
      autoConnect: true,
      stateField: 'sensorData',
    };

    mqttSourceHandler.onAttach!(mockNode, config, mockContext);

    expect(mockClient.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'sensors/#', qos: 1 }),
      expect.any(Function)
    );
  });

  it('should process incoming messages', () => {
    const config: MQTTSourceConfig = {
      broker: 'mqtt://test',
      topic: 'data',
      qos: 0,
      parseJson: true,
      stateField: 'value',
    };

    mqttSourceHandler.onAttach!(mockNode, config, mockContext);

    // Simulate message
    const message = { payload: Buffer.from('{"temp": 25}') };
    subscribeCallback(message);

    expect(MQTTClientModule.MQTTClient.parsePayload).toHaveBeenCalledWith(message);
    expect(mockContext.setState).toHaveBeenCalledWith({ value: { temp: 25 } });
    expect(mockContext.emit).toHaveBeenCalledWith(
      'mqtt_message',
      expect.objectContaining({
        value: { temp: 25 },
      })
    );
  });

  it('should debounce updates', () => {
    const config: MQTTSourceConfig = {
      broker: 'mqtt://test',
      topic: 'data',
      qos: 0,
      debounce: 100,
      parseJson: true,
    };

    mqttSourceHandler.onAttach!(mockNode, config, mockContext);

    // Send multiple messages quickly
    subscribeCallback({ payload: Buffer.from('{"v": 1}') });
    subscribeCallback({ payload: Buffer.from('{"v": 2}') });
    subscribeCallback({ payload: Buffer.from('{"v": 3}') });

    // Should not have processed yet
    expect(mockContext.setState).not.toHaveBeenCalled();

    // Advance time
    vi.advanceTimersByTime(110);

    // Should process ONLY the last one
    expect(mockContext.setState).toHaveBeenCalledTimes(1);
    expect(mockContext.setState).toHaveBeenCalledWith({ value: { v: 3 } });
  });
});
