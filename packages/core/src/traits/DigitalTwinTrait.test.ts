import { describe, it, expect, vi, beforeEach } from 'vitest';
import { digitalTwinHandler } from './DigitalTwinTrait';
import type { IotGateway } from '../services/GatewayAdapter';

describe('DigitalTwinTrait', () => {
  let mockNode: any;
  let mockContext: any;
  let mockGateway: IotGateway;
  let gatewayListeners: Record<string, Function> = {};

  beforeEach(() => {
    mockNode = {};
    mockContext = {
      emit: vi.fn(),
    };
    gatewayListeners = {};

    // Mock Gateway
    mockGateway = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      sendUpdate: vi.fn(),
      on: vi.fn((event, listener) => {
        gatewayListeners[event] = listener;
      }),
      off: vi.fn(),
    };

    // Inject Gateway
    (digitalTwinHandler as any).gateway = mockGateway;
  });

  it('should connect to gateway on attach', () => {
    const config = {
      physical_id: 'device-123',
      connection_string: 'mqtt://broker:1883',
      sync_properties: [],
      update_mode: 'push',
    };

    digitalTwinHandler.onAttach!(mockNode, config as any, mockContext);

    expect(mockGateway.connect).toHaveBeenCalledWith('device-123', 'mqtt://broker:1883');
    expect(mockGateway.on).toHaveBeenCalledWith('connected', expect.any(Function));
    expect(mockGateway.on).toHaveBeenCalledWith('telemetry', expect.any(Function));
  });

  it('should handle telemetry updates (push)', () => {
    const config = {
      physical_id: 'device-123',
      sync_properties: [{ physical_key: 'temp', virtual_property: 'temperature', direction: 'in' }],
      update_mode: 'push',
    };

    digitalTwinHandler.onAttach!(mockNode, config as any, mockContext);

    // Simulate telemetry
    const telemetry = { deviceId: 'device-123', temp: 25.5 };
    if (gatewayListeners['telemetry']) {
      gatewayListeners['telemetry'](telemetry);
    }

    // Verify state update event
    expect(mockContext.emit).toHaveBeenCalledWith('twin_state_update', { state: telemetry });

    // Use onEvent to process the update into node state (simulating event loop)
    digitalTwinHandler.onEvent!(mockNode, config as any, mockContext, {
      type: 'twin_state_update',
      state: telemetry,
    });

    expect(mockNode.temperature).toBe(25.5);
  });

  it('should send outbound updates via gateway', () => {
    const config = {
      physical_id: 'device-123',
      sync_properties: [
        { physical_key: 'setpoint', virtual_property: 'targetTemp', direction: 'out' },
      ],
      update_mode: 'push',
    };

    digitalTwinHandler.onAttach!(mockNode, config as any, mockContext);

    // Simulate property change
    digitalTwinHandler.onEvent!(mockNode, config as any, mockContext, {
      type: 'twin_property_changed',
      property: 'targetTemp',
      value: 30,
    });

    // Trigger update loop
    digitalTwinHandler.onUpdate!(mockNode, config as any, mockContext, 0.16);

    expect(mockGateway.sendUpdate).toHaveBeenCalledWith('device-123', 'setpoint', 30);
  });
});
