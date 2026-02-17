import { describe, it, expect, beforeEach } from 'vitest';
import { controllerInputHandler } from '../ControllerInputTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount, getLastEvent } from './traitTestHelpers';

describe('ControllerInputTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    haptic_on_button: true,
    haptic_intensity: 0.3,
    deadzone: 0.1,
    button_mapping: [
      { action: 'fire', button: 'trigger' as const, hand: 'right' as const, onPress: true },
      { action: 'grab', button: 'grip' as const, onRelease: true },
    ],
    trigger_threshold: 0.5,
    grip_threshold: 0.5,
    thumbstick_sensitivity: 1.0,
    invert_y: false,
  };

  beforeEach(() => {
    node = createMockNode('ctrl');
    ctx = createMockContext();
    attachTrait(controllerInputHandler, node, cfg, ctx);
  });

  it('registers on attach', () => {
    expect(getEventCount(ctx, 'controller_register')).toBe(1);
  });

  it('controller_data connects controller', () => {
    sendEvent(controllerInputHandler, node, cfg, ctx, {
      type: 'controller_data',
      hand: 'right',
      data: { connected: true },
    });
    expect(getEventCount(ctx, 'controller_connected')).toBe(1);
  });

  it('controller disconnect emits event', () => {
    sendEvent(controllerInputHandler, node, cfg, ctx, { type: 'controller_data', hand: 'left', data: { connected: true } });
    sendEvent(controllerInputHandler, node, cfg, ctx, { type: 'controller_data', hand: 'left', data: { connected: false } });
    expect(getEventCount(ctx, 'controller_disconnected')).toBe(1);
  });

  it('trigger press emits controller_trigger_press', () => {
    const s = (node as any).__controllerInputState;
    s.right.connected = true;
    s.right.triggerValue = 0.8;
    updateTrait(controllerInputHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'controller_trigger_press')).toBe(1);
  });

  it('trigger release emits controller_trigger_release', () => {
    const s = (node as any).__controllerInputState;
    s.right.connected = true;
    s.right.triggerValue = 0.8;
    updateTrait(controllerInputHandler, node, cfg, ctx, 0.016);
    s.right.triggerValue = 0.1;
    updateTrait(controllerInputHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'controller_trigger_release')).toBe(1);
  });

  it('grip press and release detected', () => {
    const s = (node as any).__controllerInputState;
    s.left.connected = true;
    s.left.gripValue = 0.9;
    updateTrait(controllerInputHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'controller_grip_press')).toBe(1);
    s.left.gripValue = 0.0;
    updateTrait(controllerInputHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'controller_grip_release')).toBe(1);
  });

  it('thumbstick movement emits event (excluding deadzone)', () => {
    const s = (node as any).__controllerInputState;
    s.right.connected = true;
    s.right.thumbstick = { x: 0.5, y: 0.3 };
    updateTrait(controllerInputHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'controller_thumbstick')).toBe(1);
  });

  it('thumbstick within deadzone does not emit', () => {
    const s = (node as any).__controllerInputState;
    s.right.connected = true;
    s.right.thumbstick = { x: 0.05, y: 0.05 };
    updateTrait(controllerInputHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'controller_thumbstick')).toBe(0);
  });

  it('controller_vibrate emits haptic_pulse', () => {
    sendEvent(controllerInputHandler, node, cfg, ctx, { type: 'controller_vibrate', hand: 'right', intensity: 0.5, duration: 100 });
    expect(getEventCount(ctx, 'haptic_pulse')).toBe(1);
  });

  it('get_controller_pose returns pose data', () => {
    sendEvent(controllerInputHandler, node, cfg, ctx, { type: 'get_controller_pose', hand: 'left', queryId: 'q1' });
    const r = getLastEvent(ctx, 'controller_pose_result') as any;
    expect(r.queryId).toBe('q1');
    expect(r.hand).toBe('left');
  });

  it('detach unregisters', () => {
    controllerInputHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__controllerInputState).toBeUndefined();
    expect(getEventCount(ctx, 'controller_unregister')).toBe(1);
  });
});
