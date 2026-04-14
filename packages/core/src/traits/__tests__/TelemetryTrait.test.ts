import { expect, test, vi, describe, beforeEach } from 'vitest';
import telemetryHandler, { TelemetryConfig } from '../TelemetryTrait';
import type { TraitContext, HSPlusNode } from '../TraitTypes';

describe('TelemetryTrait', () => {
  let mockNode: HSPlusNode;
  let mockContext: TraitContext;
  let emittedEvents: any[];

  beforeEach(() => {
    emittedEvents = [];
    mockNode = { id: 'test-node', name: 'TestNode', type: 'object' } as HSPlusNode;

    // Using vi.fn() for context mock
    const emit = vi.fn((event, payload) => {
      emittedEvents.push({ event, payload });
    });

    mockContext = {
      emit,
      physics: {
        getBodyPosition: vi.fn().mockReturnValue([1, 2, 3 ]),
        getBodyVelocity: vi.fn().mockReturnValue([0.1, 0.2, 0.3 ]),
        applyVelocity: vi.fn(),
        applyAngularVelocity: vi.fn(),
        setKinematic: vi.fn(),
        raycast: vi.fn(),
      },
      vr: {} as any,
      audio: {} as any,
      haptics: {} as any,
      getState: vi.fn(),
      setState: vi.fn(),
      getScaleMultiplier: vi.fn().mockReturnValue(1),
      setScaleContext: vi.fn(),
    };
  });

  test('buffers telemetry events and flushes', () => {
    const config: TelemetryConfig = {
      channels: ['medical_stream'],
      aggregation_ms: 1000,
      batch_size: 2,
      include_physics: false,
    };

    telemetryHandler.onAttach?.(mockNode, config, mockContext);

    // Log an event
    telemetryHandler.onEvent?.(mockNode, config, mockContext, {
      type: 'telemetry_log',
      payload: { vital: 'HR', value: 75 },
    });

    // Should not have emitted yet because batch size is 2
    expect(emittedEvents.length).toBe(0);

    // Log another event
    telemetryHandler.onEvent?.(mockNode, config, mockContext, {
      type: 'telemetry_log',
      payload: { vital: 'BP', value: 120 },
    });

    // Now update should flush since batch size is 2
    telemetryHandler.onUpdate?.(mockNode, config, mockContext, 16);

    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0].event).toBe('on_telemetry_batch');
    const payload = emittedEvents[0].payload.payload;
    expect(payload.length).toBe(2);
    expect(payload[0].vital).toBe('HR');
    expect(payload[1].vital).toBe('BP');
  });

  test('appends physical state if requested', () => {
    const config: TelemetryConfig = {
      channels: ['robot_kinematics'],
      aggregation_ms: 0, // force flush immediately
      batch_size: 1,
      include_physics: true,
    };

    telemetryHandler.onAttach?.(mockNode, config, mockContext);
    telemetryHandler.onUpdate?.(mockNode, config, mockContext, 16);

    expect(emittedEvents.length).toBe(1);
    const data = emittedEvents[0].payload.payload[0];
    expect(data.type).toBe('physics');
    expect(data.position[1]).toBe(2);
    expect(data.velocity[0]).toBe(0.1);
  });
});
