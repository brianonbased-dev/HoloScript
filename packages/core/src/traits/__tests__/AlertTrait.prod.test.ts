/**
 * AlertTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { alertHandler } from '../AlertTrait';

function makeNode() { return { id: 'alert_node' }; }
function makeCtx() { return { emit: vi.fn() }; }
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...alertHandler.defaultConfig!, ...cfg };
  alertHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}
function trigger(node: any, ctx: any, config: any, overrides: any = {}) {
  alertHandler.onEvent!(node, config, ctx, { type: 'alert_trigger', ...overrides });
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('alertHandler.defaultConfig', () => {
  const d = alertHandler.defaultConfig!;
  it('condition=""', () => expect(d.condition).toBe(''));
  it('severity=warning', () => expect(d.severity).toBe('warning'));
  it('visual_effect=pulse', () => expect(d.visual_effect).toBe('pulse'));
  it('sound=""', () => expect(d.sound).toBe(''));
  it('haptic=true', () => expect(d.haptic).toBe(true));
  it('notification=true', () => expect(d.notification).toBe(true));
  it('cooldown=5000', () => expect(d.cooldown).toBe(5000));
  it('auto_dismiss=0', () => expect(d.auto_dismiss).toBe(0));
  it('max_active=5', () => expect(d.max_active).toBe(5));
  it('message_template="Alert triggered"', () => expect(d.message_template).toBe('Alert triggered'));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('alertHandler.onAttach', () => {
  it('creates __alertState', () => expect(attach().node.__alertState).toBeDefined());
  it('isTriggered=false', () => expect(attach().node.__alertState.isTriggered).toBe(false));
  it('lastTriggerTime=0', () => expect(attach().node.__alertState.lastTriggerTime).toBe(0));
  it('triggerCount=0', () => expect(attach().node.__alertState.triggerCount).toBe(0));
  it('activeAlerts map is empty', () => expect(attach().node.__alertState.activeAlerts.size).toBe(0));
  it('isOnCooldown=false', () => expect(attach().node.__alertState.isOnCooldown).toBe(false));
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('alertHandler.onDetach', () => {
  it('removes __alertState', () => {
    const { node, config, ctx } = attach();
    alertHandler.onDetach!(node, config, ctx);
    expect(node.__alertState).toBeUndefined();
  });
  it('emits alert_dismiss_all when active alerts exist', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config, { id: 'a1' });
    ctx.emit.mockClear();
    alertHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('alert_dismiss_all', expect.anything());
  });
  it('no alert_dismiss_all when no active alerts', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    alertHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('alert_dismiss_all', expect.anything());
  });
});

// ─── onEvent — alert_trigger ──────────────────────────────────────────────────

describe('alertHandler.onEvent — alert_trigger', () => {
  it('adds alert to activeAlerts', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config, { id: 'a1' });
    expect(node.__alertState.activeAlerts.has('a1')).toBe(true);
  });
  it('sets isTriggered=true', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config);
    expect(node.__alertState.isTriggered).toBe(true);
  });
  it('increments triggerCount', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config, { id: 'a1' });
    node.__alertState.isOnCooldown = false; // reset for second trigger
    trigger(node, ctx, config, { id: 'a2' });
    expect(node.__alertState.triggerCount).toBe(2);
  });
  it('stores custom message', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config, { id: 'a1', message: 'Custom message' });
    expect(node.__alertState.activeAlerts.get('a1').message).toBe('Custom message');
  });
  it('falls back to message_template', () => {
    const { node, ctx, config } = attach({ cooldown: 0, message_template: 'Default msg' });
    trigger(node, ctx, config, { id: 'a1' });
    expect(node.__alertState.activeAlerts.get('a1').message).toBe('Default msg');
  });
  it('stores severity from event', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config, { id: 'a1', severity: 'critical' });
    expect(node.__alertState.activeAlerts.get('a1').severity).toBe('critical');
  });
  it('falls back to config.severity', () => {
    const { node, ctx, config } = attach({ cooldown: 0, severity: 'error' });
    trigger(node, ctx, config, { id: 'a1' });
    expect(node.__alertState.activeAlerts.get('a1').severity).toBe('error');
  });
  it('acknowledged=false on creation', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config, { id: 'a1' });
    expect(node.__alertState.activeAlerts.get('a1').acknowledged).toBe(false);
  });
  it('goes on cooldown after trigger', () => {
    const { node, ctx, config } = attach({ cooldown: 5000 });
    trigger(node, ctx, config, { id: 'a1' });
    expect(node.__alertState.isOnCooldown).toBe(true);
  });
  it('blocked during cooldown', () => {
    const { node, ctx, config } = attach({ cooldown: 5000 });
    trigger(node, ctx, config, { id: 'a1' });
    ctx.emit.mockClear();
    trigger(node, ctx, config, { id: 'a2' });
    expect(node.__alertState.activeAlerts.has('a2')).toBe(false);
  });
  it('emits on_alert_triggered', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    ctx.emit.mockClear();
    trigger(node, ctx, config, { id: 'a1', message: 'Fire!', severity: 'critical' });
    expect(ctx.emit).toHaveBeenCalledWith('on_alert_triggered', expect.objectContaining({ alertId: 'a1', severity: 'critical', message: 'Fire!' }));
  });
  it('emits alert_visual_effect when visual_effect != none', () => {
    const { node, ctx, config } = attach({ cooldown: 0, visual_effect: 'flash' });
    ctx.emit.mockClear();
    trigger(node, ctx, config);
    expect(ctx.emit).toHaveBeenCalledWith('alert_visual_effect', expect.objectContaining({ effect: 'flash' }));
  });
  it('no alert_visual_effect when visual_effect=none', () => {
    const { node, ctx, config } = attach({ cooldown: 0, visual_effect: 'none' });
    ctx.emit.mockClear();
    trigger(node, ctx, config);
    expect(ctx.emit).not.toHaveBeenCalledWith('alert_visual_effect', expect.anything());
  });
  it('emits alert_play_sound when sound is set', () => {
    const { node, ctx, config } = attach({ cooldown: 0, sound: 'alarm.wav' });
    ctx.emit.mockClear();
    trigger(node, ctx, config);
    expect(ctx.emit).toHaveBeenCalledWith('alert_play_sound', expect.objectContaining({ sound: 'alarm.wav' }));
  });
  it('no alert_play_sound when sound is empty', () => {
    const { node, ctx, config } = attach({ cooldown: 0, sound: '' });
    ctx.emit.mockClear();
    trigger(node, ctx, config);
    expect(ctx.emit).not.toHaveBeenCalledWith('alert_play_sound', expect.anything());
  });
  it('emits alert_haptic when haptic=true', () => {
    const { node, ctx, config } = attach({ cooldown: 0, haptic: true });
    ctx.emit.mockClear();
    trigger(node, ctx, config);
    expect(ctx.emit).toHaveBeenCalledWith('alert_haptic', expect.objectContaining({ intensity: expect.any(Number) }));
  });
  it('no alert_haptic when haptic=false', () => {
    const { node, ctx, config } = attach({ cooldown: 0, haptic: false });
    ctx.emit.mockClear();
    trigger(node, ctx, config);
    expect(ctx.emit).not.toHaveBeenCalledWith('alert_haptic', expect.anything());
  });
  it('haptic intensity=1.0 for critical', () => {
    const { node, ctx, config } = attach({ cooldown: 0, haptic: true });
    ctx.emit.mockClear();
    trigger(node, ctx, config, { severity: 'critical' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alert_haptic')!;
    expect(call[1].intensity).toBe(1.0);
  });
  it('haptic intensity=0.8 for error', () => {
    const { node, ctx, config } = attach({ cooldown: 0, haptic: true });
    ctx.emit.mockClear();
    trigger(node, ctx, config, { severity: 'error' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alert_haptic')!;
    expect(call[1].intensity).toBe(0.8);
  });
  it('haptic intensity=0.5 for warning', () => {
    const { node, ctx, config } = attach({ cooldown: 0, haptic: true, severity: 'warning' });
    ctx.emit.mockClear();
    trigger(node, ctx, config);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alert_haptic')!;
    expect(call[1].intensity).toBe(0.5);
  });
  it('haptic intensity=0.3 for info', () => {
    const { node, ctx, config } = attach({ cooldown: 0, haptic: true });
    ctx.emit.mockClear();
    trigger(node, ctx, config, { severity: 'info' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alert_haptic')!;
    expect(call[1].intensity).toBe(0.3);
  });
  it('emits alert_notification when notification=true', () => {
    const { node, ctx, config } = attach({ cooldown: 0, notification: true });
    ctx.emit.mockClear();
    trigger(node, ctx, config, { id: 'n1', message: 'Alert!' });
    expect(ctx.emit).toHaveBeenCalledWith('alert_notification', expect.objectContaining({ alertId: 'n1', message: 'Alert!' }));
  });
  it('no alert_notification when notification=false', () => {
    const { node, ctx, config } = attach({ cooldown: 0, notification: false });
    ctx.emit.mockClear();
    trigger(node, ctx, config);
    expect(ctx.emit).not.toHaveBeenCalledWith('alert_notification', expect.anything());
  });
  it('emits alert_rejected when max_active reached', () => {
    const { node, ctx, config } = attach({ cooldown: 0, max_active: 2 });
    trigger(node, ctx, config, { id: 'a1' });
    node.__alertState.isOnCooldown = false;
    trigger(node, ctx, config, { id: 'a2' });
    node.__alertState.isOnCooldown = false;
    ctx.emit.mockClear();
    trigger(node, ctx, config, { id: 'a3' });
    expect(ctx.emit).toHaveBeenCalledWith('alert_rejected', expect.objectContaining({ reason: 'max_active_reached' }));
    expect(node.__alertState.activeAlerts.has('a3')).toBe(false);
  });
});

// ─── onEvent — alert_acknowledge ─────────────────────────────────────────────

describe('alertHandler.onEvent — alert_acknowledge', () => {
  it('marks alert as acknowledged', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config, { id: 'a1' });
    alertHandler.onEvent!(node, config, ctx, { type: 'alert_acknowledge', alertId: 'a1' });
    expect(node.__alertState.activeAlerts.get('a1').acknowledged).toBe(true);
  });
  it('emits on_alert_acknowledged', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config, { id: 'a1' });
    ctx.emit.mockClear();
    alertHandler.onEvent!(node, config, ctx, { type: 'alert_acknowledge', alertId: 'a1' });
    expect(ctx.emit).toHaveBeenCalledWith('on_alert_acknowledged', expect.objectContaining({ alertId: 'a1' }));
  });
  it('no-op for unknown alertId', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    alertHandler.onEvent!(node, config, ctx, { type: 'alert_acknowledge', alertId: 'nonexistent' });
    expect(ctx.emit).not.toHaveBeenCalledWith('on_alert_acknowledged', expect.anything());
  });
});

// ─── onEvent — alert_dismiss ──────────────────────────────────────────────────

describe('alertHandler.onEvent — alert_dismiss', () => {
  it('removes alert from activeAlerts', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config, { id: 'a1' });
    alertHandler.onEvent!(node, config, ctx, { type: 'alert_dismiss', alertId: 'a1' });
    expect(node.__alertState.activeAlerts.has('a1')).toBe(false);
  });
  it('sets isTriggered=false when last alert dismissed', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config, { id: 'a1' });
    alertHandler.onEvent!(node, config, ctx, { type: 'alert_dismiss', alertId: 'a1' });
    expect(node.__alertState.isTriggered).toBe(false);
  });
  it('emits alert_dismissed and on_alert_cleared', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config, { id: 'a1' });
    ctx.emit.mockClear();
    alertHandler.onEvent!(node, config, ctx, { type: 'alert_dismiss', alertId: 'a1' });
    expect(ctx.emit).toHaveBeenCalledWith('alert_dismissed', expect.objectContaining({ alertId: 'a1' }));
    expect(ctx.emit).toHaveBeenCalledWith('on_alert_cleared', expect.objectContaining({ alertId: 'a1' }));
  });
  it('no-op for unknown alertId', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    alertHandler.onEvent!(node, config, ctx, { type: 'alert_dismiss', alertId: 'unknown' });
    expect(ctx.emit).not.toHaveBeenCalledWith('alert_dismissed', expect.anything());
  });
});

// ─── onEvent — alert_dismiss_all ─────────────────────────────────────────────

describe('alertHandler.onEvent — alert_dismiss_all', () => {
  it('clears all active alerts', () => {
    const { node, ctx, config } = attach({ cooldown: 0, max_active: 5 });
    trigger(node, ctx, config, { id: 'a1' });
    node.__alertState.isOnCooldown = false;
    trigger(node, ctx, config, { id: 'a2' });
    alertHandler.onEvent!(node, config, ctx, { type: 'alert_dismiss_all' });
    expect(node.__alertState.activeAlerts.size).toBe(0);
  });
  it('sets isTriggered=false', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config);
    alertHandler.onEvent!(node, config, ctx, { type: 'alert_dismiss_all' });
    expect(node.__alertState.isTriggered).toBe(false);
  });
  it('emits on_alerts_cleared with count', () => {
    const { node, ctx, config } = attach({ cooldown: 0, max_active: 5 });
    trigger(node, ctx, config, { id: 'a1' });
    node.__alertState.isOnCooldown = false;
    trigger(node, ctx, config, { id: 'a2' });
    ctx.emit.mockClear();
    alertHandler.onEvent!(node, config, ctx, { type: 'alert_dismiss_all' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'on_alerts_cleared')!;
    expect(call[1].count).toBe(2);
  });
});

// ─── onEvent — alert_query ────────────────────────────────────────────────────

describe('alertHandler.onEvent — alert_query', () => {
  it('emits alert_info snapshot', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config, { id: 'a1' });
    ctx.emit.mockClear();
    alertHandler.onEvent!(node, config, ctx, { type: 'alert_query', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith('alert_info', expect.objectContaining({
      queryId: 'q1',
      isTriggered: true,
      activeCount: 1,
      triggerCount: 1,
      isOnCooldown: true,
    }));
  });
  it('activeAlerts array in snapshot', () => {
    const { node, ctx, config } = attach({ cooldown: 0 });
    trigger(node, ctx, config, { id: 'a1', message: 'Snap' });
    alertHandler.onEvent!(node, config, ctx, { type: 'alert_query', queryId: 'q2' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alert_info')!;
    expect(call[1].activeAlerts[0].id).toBe('a1');
  });
});

// ─── onUpdate — cooldown & auto-dismiss ──────────────────────────────────────

describe('alertHandler.onUpdate', () => {
  it('clears cooldown after cooldown ms elapsed', () => {
    const { node, ctx, config } = attach({ cooldown: 100 });
    trigger(node, ctx, config);
    expect(node.__alertState.isOnCooldown).toBe(true);
    node.__alertState.lastTriggerTime = Date.now() - 200; // 200ms ago > 100ms cooldown
    alertHandler.onUpdate!(node, config, ctx, 0.016);
    expect(node.__alertState.isOnCooldown).toBe(false);
  });
  it('auto_dismiss removes expired alerts', () => {
    const { node, ctx, config } = attach({ cooldown: 0, auto_dismiss: 100 });
    trigger(node, ctx, config, { id: 'a1' });
    node.__alertState.activeAlerts.get('a1').timestamp = Date.now() - 200;
    ctx.emit.mockClear();
    alertHandler.onUpdate!(node, config, ctx, 0.016);
    expect(node.__alertState.activeAlerts.has('a1')).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('alert_dismissed', expect.objectContaining({ alertId: 'a1' }));
  });
  it('does not auto-dismiss when auto_dismiss=0', () => {
    const { node, ctx, config } = attach({ cooldown: 0, auto_dismiss: 0 });
    trigger(node, ctx, config, { id: 'a1' });
    node.__alertState.activeAlerts.get('a1').timestamp = Date.now() - 10000;
    alertHandler.onUpdate!(node, config, ctx, 0.016);
    expect(node.__alertState.activeAlerts.has('a1')).toBe(true);
  });
});
