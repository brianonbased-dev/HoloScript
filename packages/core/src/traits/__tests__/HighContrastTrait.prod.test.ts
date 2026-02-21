/**
 * HighContrastTrait — Production Test Suite
 *
 * Tests defaultConfig, onAttach (state init + system check + immediate apply for non-auto modes),
 * onDetach (restore if active), onUpdate (no-op),
 * onEvent (system_preference / enable / disable / toggle / query).
 */
import { describe, it, expect, vi } from 'vitest';
import { highContrastHandler } from '../HighContrastTrait';

function makeNode(withMaterial = false) {
  return {
    id: 'hc_node_1',
    ...(withMaterial ? { material: { color: '#AAAAAA', emissive: '#000000', opacity: 1 } } : {}),
  };
}
function makeContext() { return { emit: vi.fn() }; }

function attachNode(config: any = {}, withMaterial = false) {
  const node = makeNode(withMaterial);
  const ctx = makeContext();
  const cfg = { ...highContrastHandler.defaultConfig!, ...config };
  highContrastHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('highContrastHandler.defaultConfig', () => {
  it('mode = auto', () => expect(highContrastHandler.defaultConfig!.mode).toBe('auto'));
  it('outline_width = 2', () => expect(highContrastHandler.defaultConfig!.outline_width).toBe(2));
  it('outline_color = #FFFFFF', () => expect(highContrastHandler.defaultConfig!.outline_color).toBe('#FFFFFF'));
  it('forced_colors = false', () => expect(highContrastHandler.defaultConfig!.forced_colors).toBe(false));
  it('foreground_color = #FFFFFF', () => expect(highContrastHandler.defaultConfig!.foreground_color).toBe('#FFFFFF'));
  it('background_color = #000000', () => expect(highContrastHandler.defaultConfig!.background_color).toBe('#000000'));
  it('preserve_images = true', () => expect(highContrastHandler.defaultConfig!.preserve_images).toBe(true));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('highContrastHandler.onAttach', () => {
  it('creates __highContrastState on node', () => {
    const { node } = attachNode();
    expect((node as any).__highContrastState).toBeDefined();
  });
  it('initial isActive = false', () => {
    const { node } = attachNode();
    expect((node as any).__highContrastState.isActive).toBe(false);
  });
  it('initial activeMode = off', () => {
    const { node } = attachNode();
    expect((node as any).__highContrastState.activeMode).toBe('off');
  });
  it('initial originalMaterials is a Map', () => {
    const { node } = attachNode();
    expect((node as any).__highContrastState.originalMaterials).toBeInstanceOf(Map);
  });
  it('initial systemPreference = auto', () => {
    const { node } = attachNode();
    expect((node as any).__highContrastState.systemPreference).toBe('auto');
  });
  it('emits high_contrast_check_system on attach', () => {
    const { ctx } = attachNode();
    expect(ctx.emit).toHaveBeenCalledWith('high_contrast_check_system', expect.any(Object));
  });
  it('applies contrast immediately when mode is not auto or off (e.g. dark)', () => {
    const { ctx } = attachNode({ mode: 'dark' });
    expect(ctx.emit).toHaveBeenCalledWith('high_contrast_apply', expect.any(Object));
  });
  it('does NOT apply immediately when mode = auto', () => {
    const { ctx } = attachNode({ mode: 'auto' });
    const applied = ctx.emit.mock.calls.some((c: any[]) => c[0] === 'high_contrast_apply');
    expect(applied).toBe(false);
  });
  it('does NOT apply immediately when mode = off', () => {
    const { ctx } = attachNode({ mode: 'off' });
    const applied = ctx.emit.mock.calls.some((c: any[]) => c[0] === 'high_contrast_apply');
    expect(applied).toBe(false);
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('highContrastHandler.onDetach', () => {
  it('removes __highContrastState', () => {
    const { node, cfg, ctx } = attachNode();
    highContrastHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__highContrastState).toBeUndefined();
  });
  it('calls restore if isActive=true', () => {
    const node = makeNode(true);
    const ctx = makeContext();
    const cfg = { ...highContrastHandler.defaultConfig!, mode: 'dark' };
    highContrastHandler.onAttach!(node, cfg, ctx);
    // Force isActive=true manually
    (node as any).__highContrastState.isActive = true;
    ctx.emit.mockClear();
    highContrastHandler.onDetach!(node, cfg, ctx);
    // Should attempt to restore (may emit on_contrast_change with isActive=false)
    expect(ctx.emit).toHaveBeenCalledWith('on_contrast_change', expect.objectContaining({ isActive: false }));
  });
});

// ─── onUpdate ────────────────────────────────────────────────────────────────

describe('highContrastHandler.onUpdate', () => {
  it('onUpdate is a no-op (event-driven only)', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    highContrastHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent ─────────────────────────────────────────────────────────────────

describe('highContrastHandler.onEvent', () => {
  it('high_contrast_system_preference stores systemPreference', () => {
    const { node, cfg, ctx } = attachNode({ mode: 'auto' });
    highContrastHandler.onEvent!(node, cfg, ctx, { type: 'high_contrast_system_preference', mode: 'dark' });
    expect((node as any).__highContrastState.systemPreference).toBe('dark');
  });
  it('high_contrast_system_preference applies contrast when mode=auto', () => {
    const { node, cfg, ctx } = attachNode({ mode: 'auto' });
    ctx.emit.mockClear();
    highContrastHandler.onEvent!(node, cfg, ctx, { type: 'high_contrast_system_preference', mode: 'dark' });
    expect(ctx.emit).toHaveBeenCalledWith('high_contrast_apply', expect.any(Object));
  });
  it('high_contrast_system_preference does NOT apply when mode!=auto', () => {
    const { node, cfg, ctx } = attachNode({ mode: 'light' }); // not auto
    ctx.emit.mockClear();
    highContrastHandler.onEvent!(node, cfg, ctx, { type: 'high_contrast_system_preference', mode: 'dark' });
    const applied = ctx.emit.mock.calls.some((c: any[]) => c[0] === 'high_contrast_apply');
    expect(applied).toBe(false);
  });
  it('high_contrast_enable emits high_contrast_apply and sets isActive=true', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    highContrastHandler.onEvent!(node, cfg, ctx, { type: 'high_contrast_enable', mode: 'high' });
    expect((node as any).__highContrastState.isActive).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('high_contrast_apply', expect.any(Object));
  });
  it('high_contrast_enable with forced_colors uses config colors for palette', () => {
    const { node, cfg, ctx } = attachNode({ forced_colors: true, foreground_color: '#FF0000', background_color: '#0000FF', outline_color: '#00FF00' });
    ctx.emit.mockClear();
    highContrastHandler.onEvent!(node, cfg, ctx, { type: 'high_contrast_enable', mode: 'high' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'high_contrast_apply');
    expect(call?.[1].foreground).toBe('#FF0000');
    expect(call?.[1].background).toBe('#0000FF');
  });
  it('high_contrast_disable emits on_contrast_change with isActive=false', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__highContrastState.isActive = true;
    ctx.emit.mockClear();
    highContrastHandler.onEvent!(node, cfg, ctx, { type: 'high_contrast_disable' });
    expect((node as any).__highContrastState.isActive).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('on_contrast_change', expect.objectContaining({ isActive: false }));
  });
  it('high_contrast_toggle enables when isActive=false', () => {
    const { node, cfg, ctx } = attachNode({ mode: 'dark' });
    (node as any).__highContrastState.isActive = false;
    (node as any).__highContrastState.systemPreference = 'dark';
    ctx.emit.mockClear();
    highContrastHandler.onEvent!(node, cfg, ctx, { type: 'high_contrast_toggle' });
    expect((node as any).__highContrastState.isActive).toBe(true);
  });
  it('high_contrast_toggle disables when isActive=true', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__highContrastState.isActive = true;
    ctx.emit.mockClear();
    highContrastHandler.onEvent!(node, cfg, ctx, { type: 'high_contrast_toggle' });
    expect((node as any).__highContrastState.isActive).toBe(false);
  });
  it('high_contrast_query emits high_contrast_info with current state', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__highContrastState.isActive = true;
    (node as any).__highContrastState.activeMode = 'dark';
    ctx.emit.mockClear();
    highContrastHandler.onEvent!(node, cfg, ctx, { type: 'high_contrast_query', queryId: 'qx' });
    expect(ctx.emit).toHaveBeenCalledWith('high_contrast_info', expect.objectContaining({
      queryId: 'qx', isActive: true, activeMode: 'dark',
    }));
  });
  it('activeMode = high after applying high palette', () => {
    const { node, cfg, ctx } = attachNode();
    highContrastHandler.onEvent!(node, cfg, ctx, { type: 'high_contrast_enable', mode: 'high' });
    expect((node as any).__highContrastState.activeMode).toBe('high');
  });
  it('apply does NOT emit when mode=off', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    highContrastHandler.onEvent!(node, cfg, ctx, { type: 'high_contrast_enable', mode: 'off' });
    const applied = ctx.emit.mock.calls.some((c: any[]) => c[0] === 'high_contrast_apply');
    expect(applied).toBe(false);
  });
});
