import { describe, it, expect, beforeEach } from 'vitest';
import { spatialAccessoryHandler } from '../SpatialAccessoryTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('SpatialAccessoryTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    device_type: 'stylus' as const,
    device_id: 'pen-001',
    tracking_mode: 'full_6dof' as const,
    attach_point: 'right_hand' as const,
    haptic_feedback: true,
    pressure_sensitivity: true,
    button_count: 2,
    led_enabled: false,
    led_color: '#00ff00',
    calibration_required: false,
    input_mapping: { tip: 'draw', side: 'erase' } as Record<string, string>,
  };

  beforeEach(() => {
    node = createMockNode('acc');
    ctx = createMockContext();
    attachTrait(spatialAccessoryHandler, node, cfg, ctx);
  });

  it('connects on attach with device_id', () => {
    expect(getEventCount(ctx, 'accessory_connect')).toBe(1);
  });

  it('connected sets state and emits', () => {
    sendEvent(spatialAccessoryHandler, node, cfg, ctx, {
      type: 'accessory_connected',
      hapticMotors: 2,
      batteryLevel: 0.9,
    });
    const s = (node as any).__spatialAccessoryState;
    expect(s.isConnected).toBe(true);
    expect(s.hapticMotors).toBe(2);
    expect(getEventCount(ctx, 'on_accessory_connected')).toBe(1);
  });

  it('led enabled on connect when configured', () => {
    const n = createMockNode('ac2');
    const c = createMockContext();
    attachTrait(spatialAccessoryHandler, n, { ...cfg, led_enabled: true }, c);
    sendEvent(spatialAccessoryHandler, n, { ...cfg, led_enabled: true }, c, {
      type: 'accessory_connected',
      hapticMotors: 0,
      batteryLevel: 1,
    });
    expect(getEventCount(c, 'accessory_set_led')).toBe(1);
  });

  it('disconnected updates state', () => {
    sendEvent(spatialAccessoryHandler, node, cfg, ctx, {
      type: 'accessory_connected',
      hapticMotors: 0,
      batteryLevel: 1,
    });
    sendEvent(spatialAccessoryHandler, node, cfg, ctx, { type: 'accessory_disconnected' });
    expect((node as any).__spatialAccessoryState.isConnected).toBe(false);
  });

  it('pose update emits apply_pose', () => {
    sendEvent(spatialAccessoryHandler, node, cfg, ctx, {
      type: 'accessory_pose_update',
      pose: { position: [1, 2, 3], rotation: [0, 0, 0, 1] },
    });
    expect(getEventCount(ctx, 'accessory_apply_pose')).toBe(1);
  });

  it('input with mapping emits action', () => {
    sendEvent(spatialAccessoryHandler, node, cfg, ctx, {
      type: 'accessory_input',
      button: 'tip',
      value: 0.8,
    });
    expect(getEventCount(ctx, 'on_accessory_input')).toBe(1);
    const ev = getLastEvent(ctx, 'on_accessory_input') as any;
    expect(ev.action).toBe('draw');
  });

  it('pressure sensitivity emits pressure change', () => {
    sendEvent(spatialAccessoryHandler, node, cfg, ctx, {
      type: 'accessory_input',
      button: 'tip',
      value: 0.5,
    });
    expect(getEventCount(ctx, 'on_pressure_change')).toBe(1);
  });

  it('haptic plays when feedback enabled and motors available', () => {
    sendEvent(spatialAccessoryHandler, node, cfg, ctx, {
      type: 'accessory_connected',
      hapticMotors: 2,
      batteryLevel: 1,
    });
    sendEvent(spatialAccessoryHandler, node, cfg, ctx, {
      type: 'accessory_haptic',
      intensity: 0.7,
      duration: 200,
    });
    expect(getEventCount(ctx, 'accessory_play_haptic')).toBe(1);
  });

  it('calibration flow works', () => {
    sendEvent(spatialAccessoryHandler, node, cfg, ctx, { type: 'accessory_calibrate' });
    expect((node as any).__spatialAccessoryState.isCalibrated).toBe(false);
    sendEvent(spatialAccessoryHandler, node, cfg, ctx, { type: 'accessory_calibration_complete' });
    expect((node as any).__spatialAccessoryState.isCalibrated).toBe(true);
  });

  it('low battery emits warning', () => {
    sendEvent(spatialAccessoryHandler, node, cfg, ctx, {
      type: 'accessory_battery_update',
      level: 0.1,
    });
    expect(getEventCount(ctx, 'on_accessory_low_battery')).toBe(1);
  });

  it('query emits info', () => {
    sendEvent(spatialAccessoryHandler, node, cfg, ctx, { type: 'accessory_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'accessory_info')).toBe(1);
  });

  it('detach disconnects when connected', () => {
    sendEvent(spatialAccessoryHandler, node, cfg, ctx, {
      type: 'accessory_connected',
      hapticMotors: 0,
      batteryLevel: 1,
    });
    spatialAccessoryHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'accessory_disconnect')).toBe(1);
    expect((node as any).__spatialAccessoryState).toBeUndefined();
  });
});
