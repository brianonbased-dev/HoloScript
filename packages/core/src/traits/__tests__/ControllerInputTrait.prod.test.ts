/**
 * ControllerInputTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { controllerInputHandler } from '../ControllerInputTrait';

function makeNode() {
  return { id: 'ctrl_node' };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function makeButtons(
  entries: [string, { pressed: boolean; touched: boolean; value: number }][] = []
) {
  return new Map(entries);
}
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...controllerInputHandler.defaultConfig!, ...cfg };
  controllerInputHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('controllerInputHandler.defaultConfig', () => {
  const d = controllerInputHandler.defaultConfig!;
  it('haptic_on_button=true', () => expect(d.haptic_on_button).toBe(true));
  it('haptic_intensity=0.3', () => expect(d.haptic_intensity).toBe(0.3));
  it('deadzone=0.1', () => expect(d.deadzone).toBe(0.1));
  it('button_mapping=[]', () => expect(d.button_mapping).toEqual([]));
  it('trigger_threshold=0.5', () => expect(d.trigger_threshold).toBe(0.5));
  it('grip_threshold=0.5', () => expect(d.grip_threshold).toBe(0.5));
  it('thumbstick_sensitivity=1.0', () => expect(d.thumbstick_sensitivity).toBe(1.0));
  it('invert_y=false', () => expect(d.invert_y).toBe(false));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('controllerInputHandler.onAttach', () => {
  it('creates __controllerInputState', () =>
    expect(attach().node.__controllerInputState).toBeDefined());
  it('left.connected=false', () =>
    expect(attach().node.__controllerInputState.left.connected).toBe(false));
  it('right.connected=false', () =>
    expect(attach().node.__controllerInputState.right.connected).toBe(false));
  it('prevButtons.left is empty Map', () =>
    expect(attach().node.__controllerInputState.prevButtons.left.size).toBe(0));
  it('prevTrigger.left=false', () =>
    expect(attach().node.__controllerInputState.prevTrigger.left).toBe(false));
  it('prevGrip.right=false', () =>
    expect(attach().node.__controllerInputState.prevGrip.right).toBe(false));
  it('emits controller_register', () => {
    const { ctx } = attach();
    expect(ctx.emit).toHaveBeenCalledWith('controller_register', expect.any(Object));
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('controllerInputHandler.onDetach', () => {
  it('emits controller_unregister', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    controllerInputHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('controller_unregister', expect.any(Object));
  });
  it('removes __controllerInputState', () => {
    const { node, config, ctx } = attach();
    controllerInputHandler.onDetach!(node, config, ctx);
    expect(node.__controllerInputState).toBeUndefined();
  });
});

// ─── onUpdate — button mappings onPress ───────────────────────────────────────

describe('controllerInputHandler.onUpdate — onPress mapping', () => {
  it('emits controller_action press on button transition', () => {
    const { node, config, ctx } = attach({
      haptic_on_button: false,
      button_mapping: [{ action: 'jump', button: 'a', onPress: true }],
    });
    node.__controllerInputState.left.connected = true;
    node.__controllerInputState.left.buttons = makeButtons([
      ['a', { pressed: true, touched: true, value: 1 }],
    ]);
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'controller_action',
      expect.objectContaining({ action: 'jump', hand: 'left', type: 'press' })
    );
  });
  it('does NOT emit if button was already pressed', () => {
    const { node, config, ctx } = attach({
      haptic_on_button: false,
      button_mapping: [{ action: 'jump', button: 'a', onPress: true }],
    });
    node.__controllerInputState.left.connected = true;
    node.__controllerInputState.left.buttons = makeButtons([
      ['a', { pressed: true, touched: true, value: 1 }],
    ]);
    node.__controllerInputState.prevButtons.left.set('a', true);
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('controller_action', expect.any(Object));
  });
  it('emits haptic_pulse on press when haptic_on_button=true', () => {
    const { node, config, ctx } = attach({
      haptic_on_button: true,
      haptic_intensity: 0.5,
      button_mapping: [{ action: 'jump', button: 'a', onPress: true }],
    });
    node.__controllerInputState.right.connected = true;
    node.__controllerInputState.right.buttons = makeButtons([
      ['a', { pressed: true, touched: true, value: 1 }],
    ]);
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'haptic_pulse',
      expect.objectContaining({ intensity: 0.5 })
    );
  });
  it('does NOT emit haptic_pulse when haptic_on_button=false', () => {
    const { node, config, ctx } = attach({
      haptic_on_button: false,
      button_mapping: [{ action: 'jump', button: 'a', onPress: true }],
    });
    node.__controllerInputState.left.connected = true;
    node.__controllerInputState.left.buttons = makeButtons([
      ['a', { pressed: true, touched: true, value: 1 }],
    ]);
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('haptic_pulse', expect.any(Object));
  });
  it('skips mapping for wrong hand', () => {
    const { node, config, ctx } = attach({
      haptic_on_button: false,
      button_mapping: [{ action: 'jump', button: 'a', hand: 'right', onPress: true }],
    });
    node.__controllerInputState.left.connected = true;
    node.__controllerInputState.left.buttons = makeButtons([
      ['a', { pressed: true, touched: true, value: 1 }],
    ]);
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('controller_action', expect.any(Object));
  });
});

describe('controllerInputHandler.onUpdate — onRelease', () => {
  it('emits controller_action type=release on button release', () => {
    const { node, config, ctx } = attach({
      haptic_on_button: false,
      button_mapping: [{ action: 'stop', button: 'b', onRelease: true }],
    });
    node.__controllerInputState.left.connected = true;
    node.__controllerInputState.left.buttons = makeButtons([
      ['b', { pressed: false, touched: false, value: 0 }],
    ]);
    node.__controllerInputState.prevButtons.left.set('b', true);
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'controller_action',
      expect.objectContaining({ type: 'release', button: 'b' })
    );
  });
});

describe('controllerInputHandler.onUpdate — onHold', () => {
  it('emits controller_action type=hold each frame while held', () => {
    const { node, config, ctx } = attach({
      haptic_on_button: false,
      button_mapping: [{ action: 'fire', button: 'trigger', onHold: true }],
    });
    node.__controllerInputState.right.connected = true;
    node.__controllerInputState.right.buttons = makeButtons([
      ['trigger', { pressed: true, touched: true, value: 1 }],
    ]);
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'controller_action',
      expect.objectContaining({ type: 'hold', delta: 0.016 })
    );
  });
});

// ─── onUpdate — trigger + grip ────────────────────────────────────────────────

describe('controllerInputHandler.onUpdate — trigger', () => {
  it('emits controller_trigger_press when crossing threshold upward', () => {
    const { node, config, ctx } = attach({ trigger_threshold: 0.5 });
    node.__controllerInputState.left.connected = true;
    node.__controllerInputState.left.triggerValue = 0.8;
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'controller_trigger_press',
      expect.objectContaining({ hand: 'left', value: 0.8 })
    );
  });
  it('emits controller_trigger_release when dropping below threshold', () => {
    const { node, config, ctx } = attach({ trigger_threshold: 0.5 });
    node.__controllerInputState.right.connected = true;
    node.__controllerInputState.right.triggerValue = 0.2;
    node.__controllerInputState.prevTrigger.right = true;
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'controller_trigger_release',
      expect.objectContaining({ hand: 'right' })
    );
  });
  it('no trigger events when controller not connected', () => {
    const { node, config, ctx } = attach({ trigger_threshold: 0.5 });
    node.__controllerInputState.left.connected = false;
    node.__controllerInputState.left.triggerValue = 0.9;
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('controller_trigger_press', expect.any(Object));
  });
});

describe('controllerInputHandler.onUpdate — grip', () => {
  it('emits controller_grip_press on grip threshold', () => {
    const { node, config, ctx } = attach({ grip_threshold: 0.5 });
    node.__controllerInputState.right.connected = true;
    node.__controllerInputState.right.gripValue = 0.7;
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'controller_grip_press',
      expect.objectContaining({ hand: 'right' })
    );
  });
  it('emits controller_grip_release when grip releases', () => {
    const { node, config, ctx } = attach({ grip_threshold: 0.5 });
    node.__controllerInputState.left.connected = true;
    node.__controllerInputState.left.gripValue = 0.1;
    node.__controllerInputState.prevGrip.left = true;
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('controller_grip_release', { node, hand: 'left' });
  });
});

// ─── onUpdate — thumbstick ────────────────────────────────────────────────────

describe('controllerInputHandler.onUpdate — thumbstick', () => {
  it('emits controller_thumbstick when outside deadzone', () => {
    const { node, config, ctx } = attach({
      deadzone: 0.1,
      thumbstick_sensitivity: 1.0,
      invert_y: false,
    });
    node.__controllerInputState.left.connected = true;
    node.__controllerInputState.left.thumbstick = { x: 0.5, y: 0.6 };
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'controller_thumbstick');
    expect(call).toBeDefined();
    expect(call?.[1].x).toBeGreaterThan(0);
  });
  it('does NOT emit controller_thumbstick when inside deadzone', () => {
    const { node, config, ctx } = attach({ deadzone: 0.5, thumbstick_sensitivity: 1.0 });
    node.__controllerInputState.left.connected = true;
    node.__controllerInputState.left.thumbstick = { x: 0.1, y: 0.1 };
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('controller_thumbstick', expect.any(Object));
  });
  it('inverts Y when invert_y=true', () => {
    const { node, config, ctx } = attach({
      deadzone: 0.1,
      thumbstick_sensitivity: 1.0,
      invert_y: true,
    });
    node.__controllerInputState.left.connected = true;
    node.__controllerInputState.left.thumbstick = { x: 0.0, y: 0.9 };
    ctx.emit.mockClear();
    controllerInputHandler.onUpdate!(node, config, ctx, 0.016);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'controller_thumbstick');
    expect(call?.[1].y).toBeLessThan(0);
  });
});

// ─── onEvent ──────────────────────────────────────────────────────────────────

describe('controllerInputHandler.onEvent — controller_data', () => {
  it('emits controller_connected when connected transitions from false→true', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    controllerInputHandler.onEvent!(node, config, ctx, {
      type: 'controller_data',
      hand: 'left',
      data: { connected: true },
    });
    expect(ctx.emit).toHaveBeenCalledWith('controller_connected', { node, hand: 'left' });
  });
  it('emits controller_disconnected when connected transitions from true→false', () => {
    const { node, config, ctx } = attach();
    node.__controllerInputState.right.connected = true;
    ctx.emit.mockClear();
    controllerInputHandler.onEvent!(node, config, ctx, {
      type: 'controller_data',
      hand: 'right',
      data: { connected: false },
    });
    expect(ctx.emit).toHaveBeenCalledWith('controller_disconnected', { node, hand: 'right' });
  });
  it('no connection events when state unchanged', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    controllerInputHandler.onEvent!(node, config, ctx, {
      type: 'controller_data',
      hand: 'left',
      data: { connected: false },
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('controller_connected', expect.any(Object));
    expect(ctx.emit).not.toHaveBeenCalledWith('controller_disconnected', expect.any(Object));
  });
  it('updates triggerValue and gripValue', () => {
    const { node, config, ctx } = attach();
    controllerInputHandler.onEvent!(node, config, ctx, {
      type: 'controller_data',
      hand: 'right',
      data: { triggerValue: 0.9, gripValue: 0.7 },
    });
    expect(node.__controllerInputState.right.triggerValue).toBe(0.9);
    expect(node.__controllerInputState.right.gripValue).toBe(0.7);
  });
});

describe('controllerInputHandler.onEvent — controller_vibrate', () => {
  it('emits haptic_pulse with event intensity + duration', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    controllerInputHandler.onEvent!(node, config, ctx, {
      type: 'controller_vibrate',
      hand: 'right',
      intensity: 0.8,
      duration: 50,
    });
    expect(ctx.emit).toHaveBeenCalledWith('haptic_pulse', {
      hand: 'right',
      intensity: 0.8,
      duration: 50,
    });
  });
  it('uses config defaults when intensity/duration not provided', () => {
    const { node, config, ctx } = attach({ haptic_intensity: 0.4 });
    ctx.emit.mockClear();
    controllerInputHandler.onEvent!(node, config, ctx, {
      type: 'controller_vibrate',
      hand: 'left',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'haptic_pulse',
      expect.objectContaining({ intensity: 0.4, duration: 100 })
    );
  });
});

describe('controllerInputHandler.onEvent — get_controller_pose', () => {
  it('emits controller_pose_result with connected status', () => {
    const { node, config, ctx } = attach();
    node.__controllerInputState.left.connected = true;
    ctx.emit.mockClear();
    controllerInputHandler.onEvent!(node, config, ctx, {
      type: 'get_controller_pose',
      hand: 'left',
      queryId: 'q42',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'controller_pose_result',
      expect.objectContaining({ queryId: 'q42', hand: 'left', connected: true })
    );
  });
});
