import { describe, it, expect, beforeEach } from 'vitest';
import { alertHandler } from '../AlertTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount } from './traitTestHelpers';

describe('AlertTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    condition: '',
    severity: 'warning' as const,
    visual_effect: 'pulse' as const,
    sound: 'beep.mp3',
    haptic: true,
    notification: true,
    cooldown: 5000,
    auto_dismiss: 0,
    max_active: 3,
    message_template: 'Alert triggered',
  };

  beforeEach(() => {
    node = createMockNode('al');
    ctx = createMockContext();
    attachTrait(alertHandler, node, cfg, ctx);
  });

  it('inits with empty state', () => {
    const s = (node as any).__alertState;
    expect(s.isTriggered).toBe(false);
    expect(s.triggerCount).toBe(0);
  });

  it('trigger creates alert with all feedback', () => {
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_trigger', id: 'a1', message: 'Problem!' });
    expect((node as any).__alertState.isTriggered).toBe(true);
    expect(getEventCount(ctx, 'alert_visual_effect')).toBe(1);
    expect(getEventCount(ctx, 'alert_play_sound')).toBe(1);
    expect(getEventCount(ctx, 'alert_haptic')).toBe(1);
    expect(getEventCount(ctx, 'alert_notification')).toBe(1);
    expect(getEventCount(ctx, 'on_alert_triggered')).toBe(1);
  });

  it('cooldown blocks duplicate triggers', () => {
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_trigger', id: 'a1' });
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_trigger', id: 'a2' });
    expect((node as any).__alertState.triggerCount).toBe(1);
  });

  it('max_active rejects excess alerts', () => {
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_trigger', id: 'a1' });
    (node as any).__alertState.isOnCooldown = false;
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_trigger', id: 'a2' });
    (node as any).__alertState.isOnCooldown = false;
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_trigger', id: 'a3' });
    (node as any).__alertState.isOnCooldown = false;
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_trigger', id: 'a4' });
    expect(getEventCount(ctx, 'alert_rejected')).toBe(1);
  });

  it('acknowledge marks alert', () => {
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_trigger', id: 'ack1' });
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_acknowledge', alertId: 'ack1' });
    expect((node as any).__alertState.activeAlerts.get('ack1').acknowledged).toBe(true);
    expect(getEventCount(ctx, 'on_alert_acknowledged')).toBe(1);
  });

  it('dismiss removes alert', () => {
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_trigger', id: 'd1' });
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_dismiss', alertId: 'd1' });
    expect((node as any).__alertState.activeAlerts.size).toBe(0);
    expect((node as any).__alertState.isTriggered).toBe(false);
    expect(getEventCount(ctx, 'on_alert_cleared')).toBe(1);
  });

  it('dismiss_all clears everything', () => {
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_trigger', id: 'x1' });
    (node as any).__alertState.isOnCooldown = false;
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_trigger', id: 'x2' });
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_dismiss_all' });
    expect((node as any).__alertState.activeAlerts.size).toBe(0);
    expect(getEventCount(ctx, 'on_alerts_cleared')).toBe(1);
  });

  it('query emits info', () => {
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'alert_info')).toBe(1);
  });

  it('detach dismisses active alerts', () => {
    sendEvent(alertHandler, node, cfg, ctx, { type: 'alert_trigger', id: 'det1' });
    alertHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'alert_dismiss_all')).toBe(1);
    expect((node as any).__alertState).toBeUndefined();
  });
});
