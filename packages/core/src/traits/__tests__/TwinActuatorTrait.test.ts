import { expect, test, vi, describe, beforeEach } from 'vitest';
import twinActuatorHandler, { TwinActuatorConfig } from '../TwinActuatorTrait';
import type { TraitContext, HSPlusNode, Vector3 } from '../TraitTypes';

describe('TwinActuatorTrait', () => {
  let mockNode: HSPlusNode;
  let mockContext: TraitContext;
  let emittedEvents: any[];
  let physicsVelocityApplied: Vector3 | null;

  beforeEach(() => {
    emittedEvents = [];
    physicsVelocityApplied = null;
    mockNode = { id: 'actuator-node', name: 'Actuator', type: 'object' } as HSPlusNode;
    
    const emit = vi.fn((event, payload) => {
      emittedEvents.push({ event, payload });
    });

    mockContext = {
      emit,
      physics: {
        getBodyPosition: vi.fn(),
        getBodyVelocity: vi.fn(),
        applyVelocity: vi.fn((node, vel) => {
          physicsVelocityApplied = vel;
        }),
        applyAngularVelocity: vi.fn(),
        setKinematic: vi.fn(),
        raycast: vi.fn()
      },
      vr: {} as any,
      audio: {} as any,
      haptics: {} as any,
      getState: vi.fn(),
      setState: vi.fn(),
      getScaleMultiplier: vi.fn().mockReturnValue(1),
      setScaleContext: vi.fn()
    };
  });

  test('rejects unallowed actions', () => {
    const config: TwinActuatorConfig = {
      actuator_id: 'robotic_arm_1',
      command_topic: 'motion_cmd',
      allowed_actions: ['rotate'],
      safe_limits: {}
    };

    twinActuatorHandler.onEvent?.(mockNode, config, mockContext, {
      type: 'twin_command',
      action: 'move',
      value: 10
    });

    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0].event).toBe('twin_actuator_error');
    expect(emittedEvents[0].payload.error).toContain('Action move not allowed');
  });

  test('validates safe limits', () => {
    const config: TwinActuatorConfig = {
      actuator_id: 'servo_1',
      command_topic: 'cmd',
      allowed_actions: ['rotate'],
      safe_limits: {
        rotate: [0, 180]
      }
    };

    twinActuatorHandler.onEvent?.(mockNode, config, mockContext, {
      type: 'twin_command',
      action: 'rotate',
      value: 200 // Exceeds 180
    });

    expect(emittedEvents[0].event).toBe('twin_actuator_error');
    
    // Now a valid hit
    twinActuatorHandler.onEvent?.(mockNode, config, mockContext, {
      type: 'twin_command',
      action: 'rotate',
      value: 90
    });

    expect(emittedEvents[1].event).toBe('on_twin_actuate');
    expect(emittedEvents[1].payload.value).toBe(90);
  });

  test('applies optional physics mappings instantly', () => {
    const config: TwinActuatorConfig = {
      actuator_id: 'agv_platform',
      command_topic: 'motion',
      allowed_actions: ['move'],
      safe_limits: {}
    };

    const targetVelocity: Vector3 = { x: 5, y: 0, z: 2 };
    
    twinActuatorHandler.onEvent?.(mockNode, config, mockContext, {
      type: 'twin_command',
      action: 'move',
      velocity: targetVelocity,
      value: 1
    });

    expect(emittedEvents[0].event).toBe('on_twin_actuate');
    expect(physicsVelocityApplied).toStrictEqual(targetVelocity);
  });
});
