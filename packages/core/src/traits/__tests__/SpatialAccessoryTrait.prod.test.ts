/**
 * SpatialAccessoryTrait — Production Test Suite
 *
 * spatialAccessoryHandler stores state on node.__spatialAccessoryState.
 *
 * Key behaviours:
 * 1. defaultConfig — all 11 fields
 * 2. onAttach — state init: isCalibrated=!calibration_required, inputs=Map,
 *               emits accessory_connect when device_id is set
 * 3. onDetach — emits accessory_disconnect when isConnected; removes state
 * 4. onUpdate — no-op when !isConnected; emits accessory_request_pose
 * 5. onEvent — accessory_connected: isConnected=true, LED, on_accessory_connected;
 *              accessory_disconnected; accessory_pose_update: stores+emits apply_pose;
 *              accessory_input: stores input, mapped action, pressure_sensitivity;
 *              accessory_haptic: guard (haptic_feedback+hapticMotors); calibrate/calibration_complete;
 *              battery_update with low battery warning; accessory_query info snapshot
 */
import { describe, it, expect, vi } from 'vitest';
import { spatialAccessoryHandler } from '../SpatialAccessoryTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'sa_node', properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof spatialAccessoryHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...spatialAccessoryHandler.defaultConfig!, ...cfg };
  spatialAccessoryHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('spatialAccessoryHandler.defaultConfig', () => {
  const d = spatialAccessoryHandler.defaultConfig!;
  it('device_type=stylus', () => expect(d.device_type).toBe('stylus'));
  it('device_id=""', () => expect(d.device_id).toBe(''));
  it('tracking_mode=optical', () => expect(d.tracking_mode).toBe('optical'));
  it('attach_point=custom', () => expect(d.attach_point).toBe('custom'));
  it('haptic_feedback=false', () => expect(d.haptic_feedback).toBe(false));
  it('pressure_sensitivity=false', () => expect(d.pressure_sensitivity).toBe(false));
  it('button_count=0', () => expect(d.button_count).toBe(0));
  it('led_enabled=false', () => expect(d.led_enabled).toBe(false));
  it('led_color=#00ff00', () => expect(d.led_color).toBe('#00ff00'));
  it('calibration_required=false', () => expect(d.calibration_required).toBe(false));
  it('input_mapping={}', () => expect(d.input_mapping).toEqual({}));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('spatialAccessoryHandler.onAttach', () => {
  it('initialises __spatialAccessoryState', () => {
    const { node } = attach();
    expect((node as any).__spatialAccessoryState).toBeDefined();
  });

  it('isConnected=false, batteryLevel=1.0 initially', () => {
    const { node } = attach();
    const s = (node as any).__spatialAccessoryState;
    expect(s.isConnected).toBe(false);
    expect(s.batteryLevel).toBe(1.0);
  });

  it('isCalibrated=true when calibration_required=false', () => {
    const { node } = attach({ calibration_required: false });
    expect((node as any).__spatialAccessoryState.isCalibrated).toBe(true);
  });

  it('isCalibrated=false when calibration_required=true', () => {
    const { node } = attach({ calibration_required: true });
    expect((node as any).__spatialAccessoryState.isCalibrated).toBe(false);
  });

  it('inputs is an empty Map', () => {
    const { node } = attach();
    expect((node as any).__spatialAccessoryState.inputs).toBeInstanceOf(Map);
    expect((node as any).__spatialAccessoryState.inputs.size).toBe(0);
  });

  it('emits accessory_connect when device_id is set', () => {
    const { ctx } = attach({
      device_id: 'ctrl_01',
      device_type: 'controller',
      tracking_mode: 'full_6dof',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'accessory_connect');
    expect(call).toBeDefined();
    expect(call![1].deviceId).toBe('ctrl_01');
    expect(call![1].deviceType).toBe('controller');
    expect(call![1].trackingMode).toBe('full_6dof');
  });

  it('does NOT emit accessory_connect when device_id is empty', () => {
    const { ctx } = attach({ device_id: '' });
    expect(ctx.emit).not.toHaveBeenCalledWith('accessory_connect', expect.anything());
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('spatialAccessoryHandler.onDetach', () => {
  it('emits accessory_disconnect when isConnected=true', () => {
    const { node, ctx, config } = attach();
    (node as any).__spatialAccessoryState.isConnected = true;
    ctx.emit.mockClear();
    spatialAccessoryHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('accessory_disconnect', expect.any(Object));
  });

  it('does NOT emit accessory_disconnect when isConnected=false', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    spatialAccessoryHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('accessory_disconnect', expect.anything());
  });

  it('removes __spatialAccessoryState', () => {
    const { node, ctx, config } = attach();
    spatialAccessoryHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__spatialAccessoryState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('spatialAccessoryHandler.onUpdate', () => {
  it('no-op when isConnected=false', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    spatialAccessoryHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('emits accessory_request_pose when isConnected=true', () => {
    const { node, ctx, config } = attach({ tracking_mode: 'full_6dof' });
    (node as any).__spatialAccessoryState.isConnected = true;
    ctx.emit.mockClear();
    spatialAccessoryHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'accessory_request_pose',
      expect.objectContaining({ trackingMode: 'full_6dof' })
    );
  });
});

// ─── onEvent — accessory_connected ───────────────────────────────────────────

describe('spatialAccessoryHandler.onEvent — accessory_connected', () => {
  it('sets isConnected=true, hapticMotors, batteryLevel', () => {
    const { node, ctx, config } = attach();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_connected',
      hapticMotors: 4,
      batteryLevel: 0.75,
    });
    const s = (node as any).__spatialAccessoryState;
    expect(s.isConnected).toBe(true);
    expect(s.hapticMotors).toBe(4);
    expect(s.batteryLevel).toBeCloseTo(0.75, 4);
  });

  it('emits accessory_set_led when led_enabled=true', () => {
    const { node, ctx, config } = attach({ led_enabled: true, led_color: '#ff0000' });
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_connected',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'accessory_set_led',
      expect.objectContaining({
        color: '#ff0000',
        enabled: true,
      })
    );
  });

  it('does NOT emit accessory_set_led when led_enabled=false', () => {
    const { node, ctx, config } = attach({ led_enabled: false });
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_connected',
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('accessory_set_led', expect.anything());
  });

  it('emits on_accessory_connected with deviceType', () => {
    const { node, ctx, config } = attach({ device_type: 'haptic_gloves' });
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_connected',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_accessory_connected',
      expect.objectContaining({ deviceType: 'haptic_gloves' })
    );
  });
});

// ─── onEvent — accessory_disconnected ────────────────────────────────────────

describe('spatialAccessoryHandler.onEvent — accessory_disconnected', () => {
  it('sets isConnected=false and emits on_accessory_disconnected', () => {
    const { node, ctx, config } = attach();
    (node as any).__spatialAccessoryState.isConnected = true;
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_disconnected',
    });
    expect((node as any).__spatialAccessoryState.isConnected).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('on_accessory_disconnected', expect.any(Object));
  });
});

// ─── onEvent — accessory_pose_update ─────────────────────────────────────────

describe('spatialAccessoryHandler.onEvent — accessory_pose_update', () => {
  it('stores pose and emits accessory_apply_pose with attachPoint', () => {
    const { node, ctx, config } = attach({ attach_point: 'right_hand' });
    const pose = {
      position: [1, 2, 3] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
    };
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_pose_update',
      pose,
    });
    expect((node as any).__spatialAccessoryState.lastPose).toEqual(pose);
    expect(ctx.emit).toHaveBeenCalledWith(
      'accessory_apply_pose',
      expect.objectContaining({
        attachPoint: 'right_hand',
        position: pose.position,
        rotation: pose.rotation,
      })
    );
  });
});

// ─── onEvent — accessory_input ───────────────────────────────────────────────

describe('spatialAccessoryHandler.onEvent — accessory_input', () => {
  it('stores button value in inputs Map', () => {
    const { node, ctx, config } = attach();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_input',
      button: 'trigger',
      value: 0.7,
    });
    expect((node as any).__spatialAccessoryState.inputs.get('trigger')).toBeCloseTo(0.7, 4);
  });

  it('emits on_accessory_input when input_mapping has button', () => {
    const { node, ctx, config } = attach({ input_mapping: { trigger: 'fire' } });
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_input',
      button: 'trigger',
      value: 1.0,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_accessory_input',
      expect.objectContaining({
        button: 'trigger',
        action: 'fire',
        value: 1.0,
      })
    );
  });

  it('does NOT emit on_accessory_input for unmapped button', () => {
    const { node, ctx, config } = attach({ input_mapping: {} });
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_input',
      button: 'grip',
      value: 0.5,
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('on_accessory_input', expect.anything());
  });

  it('emits on_pressure_change when pressure_sensitivity=true and 0 < value < 1', () => {
    const { node, ctx, config } = attach({ pressure_sensitivity: true });
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_input',
      button: 'pen_tip',
      value: 0.6,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_pressure_change',
      expect.objectContaining({ pressure: 0.6 })
    );
  });

  it('does NOT emit on_pressure_change when pressure_sensitivity=false', () => {
    const { node, ctx, config } = attach({ pressure_sensitivity: false });
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_input',
      button: 'pen_tip',
      value: 0.6,
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('on_pressure_change', expect.anything());
  });
});

// ─── onEvent — accessory_haptic ──────────────────────────────────────────────

describe('spatialAccessoryHandler.onEvent — accessory_haptic', () => {
  it('emits accessory_play_haptic when haptic_feedback=true and hapticMotors>0', () => {
    const { node, ctx, config } = attach({ haptic_feedback: true });
    (node as any).__spatialAccessoryState.hapticMotors = 2;
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_haptic',
      intensity: 0.8,
      duration: 200,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'accessory_play_haptic',
      expect.objectContaining({
        intensity: 0.8,
        duration: 200,
      })
    );
  });

  it('no-op when haptic_feedback=false', () => {
    const { node, ctx, config } = attach({ haptic_feedback: false });
    (node as any).__spatialAccessoryState.hapticMotors = 2;
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_haptic',
      intensity: 1.0,
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('accessory_play_haptic', expect.anything());
  });

  it('no-op when hapticMotors=0', () => {
    const { node, ctx, config } = attach({ haptic_feedback: true });
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_haptic',
      intensity: 1.0,
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('accessory_play_haptic', expect.anything());
  });
});

// ─── onEvent — calibration ────────────────────────────────────────────────────

describe('spatialAccessoryHandler.onEvent — calibration', () => {
  it('accessory_calibrate sets isCalibrated=false and emits start', () => {
    const { node, ctx, config } = attach({ device_type: 'tracker' });
    (node as any).__spatialAccessoryState.isCalibrated = true;
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_calibrate',
    });
    expect((node as any).__spatialAccessoryState.isCalibrated).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'accessory_start_calibration',
      expect.objectContaining({ deviceType: 'tracker' })
    );
  });

  it('accessory_calibration_complete sets isCalibrated=true', () => {
    const { node, ctx, config } = attach();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_calibration_complete',
    });
    expect((node as any).__spatialAccessoryState.isCalibrated).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('on_accessory_calibrated', expect.any(Object));
  });
});

// ─── onEvent — battery ───────────────────────────────────────────────────────

describe('spatialAccessoryHandler.onEvent — battery_update', () => {
  it('stores batteryLevel', () => {
    const { node, ctx, config } = attach();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_battery_update',
      level: 0.5,
    });
    expect((node as any).__spatialAccessoryState.batteryLevel).toBeCloseTo(0.5, 4);
  });

  it('emits on_accessory_low_battery when level < 0.2', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_battery_update',
      level: 0.1,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_accessory_low_battery',
      expect.objectContaining({ level: 0.1 })
    );
  });

  it('does NOT emit low_battery when level >= 0.2', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_battery_update',
      level: 0.3,
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('on_accessory_low_battery', expect.anything());
  });
});

// ─── onEvent — accessory_query ───────────────────────────────────────────────

describe('spatialAccessoryHandler.onEvent — accessory_query', () => {
  it('emits accessory_info with full snapshot', () => {
    const { node, ctx, config } = attach({
      device_type: 'controller',
      attach_point: 'left_hand',
      button_count: 6,
    });
    const state = (node as any).__spatialAccessoryState;
    state.isConnected = true;
    state.batteryLevel = 0.8;
    state.isCalibrated = true;
    state.hapticMotors = 2;
    ctx.emit.mockClear();
    spatialAccessoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'accessory_query',
      queryId: 'q1',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'accessory_info');
    expect(call).toBeDefined();
    expect(call![1].queryId).toBe('q1');
    expect(call![1].isConnected).toBe(true);
    expect(call![1].batteryLevel).toBeCloseTo(0.8, 4);
    expect(call![1].deviceType).toBe('controller');
    expect(call![1].attachPoint).toBe('left_hand');
    expect(call![1].buttonCount).toBe(6);
    expect(call![1].hapticMotors).toBe(2);
  });
});
