import { describe, it, expect, beforeEach } from 'vitest';
import { accessibleHandler } from '../AccessibleTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('AccessibleTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    role: 'button' as const,
    label: 'Submit',
    description: 'Submit the form',
    live_region: 'off' as const,
    keyboard_shortcut: 'Enter',
    tab_index: 0,
    focus_visible: true,
    disabled: false,
    value_min: 0,
    value_max: 100,
    value_now: 0,
  };

  beforeEach(() => {
    node = createMockNode('btn');
    ctx = createMockContext();
    attachTrait(accessibleHandler, node, cfg, ctx);
  });

  it('initializes state', () => {
    const s = (node as any).__accessibleState;
    expect(s.isFocused).toBe(false);
    expect(s.tabOrder).toBe(0);
  });

  it('registers on attach', () => {
    expect(getEventCount(ctx, 'accessibility_register')).toBe(1);
  });

  it('hover_enter sets hovered', () => {
    sendEvent(accessibleHandler, node, cfg, ctx, { type: 'hover_enter' });
    expect((node as any).__accessibleState.isHovered).toBe(true);
  });

  it('focus sets focused and emits event', () => {
    sendEvent(accessibleHandler, node, cfg, ctx, { type: 'focus' });
    expect((node as any).__accessibleState.isFocused).toBe(true);
    expect(getEventCount(ctx, 'on_accessible_focus')).toBe(1);
  });

  it('blur clears focus', () => {
    sendEvent(accessibleHandler, node, cfg, ctx, { type: 'focus' });
    sendEvent(accessibleHandler, node, cfg, ctx, { type: 'blur' });
    expect((node as any).__accessibleState.isFocused).toBe(false);
  });

  it('keyboard shortcut triggers activation', () => {
    sendEvent(accessibleHandler, node, cfg, ctx, { type: 'keydown', key: 'Enter' });
    expect(getEventCount(ctx, 'accessible_activate')).toBe(1);
  });

  it('set_expanded updates aria state', () => {
    sendEvent(accessibleHandler, node, cfg, ctx, {
      type: 'accessible_set_expanded',
      expanded: true,
    });
    expect((node as any).__accessibleState.ariaExpanded).toBe(true);
    expect(getEventCount(ctx, 'accessibility_update')).toBe(1);
  });

  it('set_checked updates aria state', () => {
    sendEvent(accessibleHandler, node, cfg, ctx, { type: 'accessible_set_checked', checked: true });
    expect((node as any).__accessibleState.ariaChecked).toBe(true);
  });

  it('slider arrow keys change value', () => {
    const sliderCfg = { ...cfg, role: 'slider' as const, value_now: 50 };
    const n2 = createMockNode('slider');
    const c2 = createMockContext();
    attachTrait(accessibleHandler, n2, sliderCfg, c2);
    sendEvent(accessibleHandler, n2, sliderCfg, c2, { type: 'keydown', key: 'ArrowRight' });
    expect((n2 as any).__accessibleState.ariaValue).toBeGreaterThan(50);
    expect(getEventCount(c2, 'accessible_value_change')).toBe(1);
  });

  it('assertive announce goes to front of queue', () => {
    const assertCfg = { ...cfg, live_region: 'assertive' as const };
    sendEvent(accessibleHandler, node, assertCfg, ctx, {
      type: 'accessible_announce',
      message: 'Alert!',
    });
    expect((node as any).__accessibleState.announceQueue[0]).toBe('Alert!');
  });

  it('cleans up on detach', () => {
    accessibleHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__accessibleState).toBeUndefined();
    expect(getEventCount(ctx, 'accessibility_unregister')).toBe(1);
  });
});
