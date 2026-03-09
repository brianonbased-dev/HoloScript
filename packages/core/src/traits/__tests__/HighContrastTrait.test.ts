import { describe, it, expect, beforeEach } from 'vitest';
import { highContrastHandler } from '../HighContrastTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('HighContrastTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    mode: 'auto' as const,
    outline_width: 2,
    outline_color: '#FFFFFF',
    forced_colors: false,
    foreground_color: '#FFFFFF',
    background_color: '#000000',
    preserve_images: true,
  };

  beforeEach(() => {
    node = createMockNode('hc');
    (node as any).material = { color: '#FF0000', emissive: '#000000', opacity: 1 };
    ctx = createMockContext();
    attachTrait(highContrastHandler, node, cfg, ctx);
  });

  it('initializes inactive for auto mode', () => {
    expect((node as any).__highContrastState.isActive).toBe(false);
    expect(getEventCount(ctx, 'high_contrast_check_system')).toBe(1);
  });

  it('non-auto mode applies contrast on attach', () => {
    const n2 = createMockNode('hc2');
    (n2 as any).material = { color: '#FF0000', emissive: '#000000', opacity: 1 };
    const c2 = createMockContext();
    attachTrait(highContrastHandler, n2, { ...cfg, mode: 'high' as const }, c2);
    expect((n2 as any).__highContrastState.isActive).toBe(true);
    expect(getEventCount(c2, 'high_contrast_apply')).toBe(1);
  });

  it('system preference applies contrast in auto mode', () => {
    sendEvent(highContrastHandler, node, cfg, ctx, {
      type: 'high_contrast_system_preference',
      mode: 'dark',
    });
    expect((node as any).__highContrastState.isActive).toBe(true);
    expect((node as any).__highContrastState.activeMode).toBe('dark');
  });

  it('enable event applies contrast', () => {
    sendEvent(highContrastHandler, node, cfg, ctx, { type: 'high_contrast_enable', mode: 'high' });
    expect((node as any).__highContrastState.isActive).toBe(true);
    expect(getEventCount(ctx, 'on_contrast_change')).toBe(1);
  });

  it('disable restores materials', () => {
    sendEvent(highContrastHandler, node, cfg, ctx, { type: 'high_contrast_enable', mode: 'high' });
    sendEvent(highContrastHandler, node, cfg, ctx, { type: 'high_contrast_disable' });
    expect((node as any).__highContrastState.isActive).toBe(false);
    expect(getEventCount(ctx, 'high_contrast_restore')).toBe(1);
  });

  it('toggle flips state', () => {
    sendEvent(highContrastHandler, node, cfg, ctx, { type: 'high_contrast_toggle' });
    expect((node as any).__highContrastState.isActive).toBe(true);
    sendEvent(highContrastHandler, node, cfg, ctx, { type: 'high_contrast_toggle' });
    expect((node as any).__highContrastState.isActive).toBe(false);
  });

  it('forced_colors uses custom palette', () => {
    const n2 = createMockNode('fc');
    (n2 as any).material = { color: '#FF0000', emissive: '#000000', opacity: 1 };
    const c2 = createMockContext();
    const forcedCfg = {
      ...cfg,
      forced_colors: true,
      foreground_color: '#00FF00',
      background_color: '#0000FF',
    };
    attachTrait(highContrastHandler, n2, forcedCfg, c2);
    sendEvent(highContrastHandler, n2, forcedCfg, c2, { type: 'high_contrast_enable' });
    const ev = getLastEvent(c2, 'high_contrast_apply') as any;
    expect(ev.foreground).toBe('#00FF00');
    expect(ev.background).toBe('#0000FF');
  });

  it('query returns state', () => {
    sendEvent(highContrastHandler, node, cfg, ctx, { type: 'high_contrast_query', queryId: 'q1' });
    const r = getLastEvent(ctx, 'high_contrast_info') as any;
    expect(r.isActive).toBe(false);
    expect(r.queryId).toBe('q1');
  });

  it('cleans up on detach', () => {
    sendEvent(highContrastHandler, node, cfg, ctx, { type: 'high_contrast_enable', mode: 'high' });
    highContrastHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__highContrastState).toBeUndefined();
  });
});
