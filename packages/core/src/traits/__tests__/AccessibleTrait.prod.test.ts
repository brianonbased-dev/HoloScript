/**
 * AccessibleTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { accessibleHandler } from '../AccessibleTrait';

function makeNode(extras: any = {}) {
  return { id: 'acc_node', ...extras };
}
function makeCtx(accessibilityMock: any = null) {
  return {
    emit: vi.fn(),
    accessibility: accessibilityMock ?? { announce: vi.fn(), setAltText: vi.fn() },
  };
}
function attach(cfg: any = {}, nodeExtras: any = {}) {
  const node = makeNode(nodeExtras);
  const ctx = makeCtx();
  const config = { ...accessibleHandler.defaultConfig!, ...cfg };
  accessibleHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('accessibleHandler.defaultConfig', () => {
  const d = accessibleHandler.defaultConfig!;
  it('role=button', () => expect(d.role).toBe('button'));
  it('label empty string', () => expect(d.label).toBe(''));
  it('live_region=off', () => expect(d.live_region).toBe('off'));
  it('tab_index=0', () => expect(d.tab_index).toBe(0));
  it('focus_visible=true', () => expect(d.focus_visible).toBe(true));
  it('disabled=false', () => expect(d.disabled).toBe(false));
  it('value_min=0 value_max=100 value_now=0', () => {
    expect(d.value_min).toBe(0);
    expect(d.value_max).toBe(100);
    expect(d.value_now).toBe(0);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('accessibleHandler.onAttach', () => {
  it('creates __accessibleState', () => expect(attach().node.__accessibleState).toBeDefined());
  it('isFocused=false', () => expect(attach().node.__accessibleState.isFocused).toBe(false));
  it('isHovered=false', () => expect(attach().node.__accessibleState.isHovered).toBe(false));
  it('announceQueue empty', () =>
    expect(attach().node.__accessibleState.announceQueue).toHaveLength(0));
  it('tabOrder matches tab_index', () =>
    expect(attach({ tab_index: 3 }).node.__accessibleState.tabOrder).toBe(3));
  it('ariaValue=null for non-slider role', () =>
    expect(attach({ role: 'button' }).node.__accessibleState.ariaValue).toBeNull());
  it('ariaValue=value_now for slider role', () => {
    const { node } = attach({ role: 'slider', value_now: 50 });
    expect(node.__accessibleState.ariaValue).toBe(50);
  });
  it('ariaValue=value_now for progressbar role', () => {
    const { node } = attach({ role: 'progressbar', value_now: 75 });
    expect(node.__accessibleState.ariaValue).toBe(75);
  });
  it('emits accessibility_register', () => {
    const { ctx } = attach({ role: 'checkbox', label: 'Accept' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'accessibility_register',
      expect.objectContaining({ role: 'checkbox', label: 'Accept' })
    );
  });
  it('accessibility_register includes tabIndex and shortcut', () => {
    const { ctx } = attach({ tab_index: 2, keyboard_shortcut: 'Enter' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'accessibility_register',
      expect.objectContaining({ tabIndex: 2, shortcut: 'Enter' })
    );
  });
  it('calls setAltText when label set', () => {
    const node = makeNode();
    const ctx = makeCtx();
    const config = { ...accessibleHandler.defaultConfig!, label: 'My Button' };
    accessibleHandler.onAttach!(node, config, ctx);
    expect(ctx.accessibility.setAltText).toHaveBeenCalledWith('acc_node', 'My Button');
  });
  it('no setAltText when label empty', () => {
    const node = makeNode();
    const ctx = makeCtx();
    const config = { ...accessibleHandler.defaultConfig!, label: '' };
    accessibleHandler.onAttach!(node, config, ctx);
    expect(ctx.accessibility.setAltText).not.toHaveBeenCalled();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('accessibleHandler.onDetach', () => {
  it('removes __accessibleState', () => {
    const { node, config, ctx } = attach();
    accessibleHandler.onDetach!(node, config, ctx);
    expect(node.__accessibleState).toBeUndefined();
  });
  it('emits accessibility_unregister', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    accessibleHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('accessibility_unregister', expect.anything());
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('accessibleHandler.onUpdate', () => {
  it('emits accessibility_focus_ring when focused and focus_visible=true', () => {
    const { node, config, ctx } = attach({ focus_visible: true });
    node.__accessibleState.isFocused = true;
    ctx.emit.mockClear();
    accessibleHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'accessibility_focus_ring',
      expect.objectContaining({ visible: true })
    );
  });
  it('no focus_ring when not focused', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    accessibleHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('accessibility_focus_ring', expect.anything());
  });
  it('drains announceQueue when cooldown elapsed', () => {
    const node = makeNode();
    const announce = vi.fn();
    const ctx = { emit: vi.fn(), accessibility: { announce, setAltText: vi.fn() } };
    const config = { ...accessibleHandler.defaultConfig!, live_region: 'polite' as const };
    accessibleHandler.onAttach!(node, config, ctx);
    (node as any).__accessibleState.announceQueue.push('Hello');
    (node as any).__accessibleState.lastAnnounceTime = 0; // far in the past
    accessibleHandler.onUpdate!(node, config, ctx, 0.016);
    expect(announce).toHaveBeenCalledWith('Hello');
  });
  it('does not drain announceQueue before cooldown', () => {
    const node = makeNode();
    const announce = vi.fn();
    const ctx = { emit: vi.fn(), accessibility: { announce, setAltText: vi.fn() } };
    const config = { ...accessibleHandler.defaultConfig! };
    accessibleHandler.onAttach!(node, config, ctx);
    (node as any).__accessibleState.announceQueue.push('Soon');
    (node as any).__accessibleState.lastAnnounceTime = Date.now(); // just now
    accessibleHandler.onUpdate!(node, config, ctx, 0.016);
    expect(announce).not.toHaveBeenCalled();
  });
});

// ─── onEvent — hover ──────────────────────────────────────────────────────────

describe('accessibleHandler.onEvent — hover', () => {
  it('hover_enter sets isHovered=true', () => {
    const { node, ctx, config } = attach();
    accessibleHandler.onEvent!(node, config, ctx, { type: 'hover_enter' });
    expect(node.__accessibleState.isHovered).toBe(true);
  });
  it('hover_enter announces label', () => {
    const { node, ctx, config } = attach({ label: 'Close Button' });
    accessibleHandler.onEvent!(node, config, ctx, { type: 'hover_enter' });
    expect(ctx.accessibility.announce).toHaveBeenCalledWith('Close Button');
  });
  it('hover_exit sets isHovered=false', () => {
    const { node, ctx, config } = attach();
    node.__accessibleState.isHovered = true;
    accessibleHandler.onEvent!(node, config, ctx, { type: 'hover_exit' });
    expect(node.__accessibleState.isHovered).toBe(false);
  });
});

// ─── onEvent — focus / blur ───────────────────────────────────────────────────

describe('accessibleHandler.onEvent — focus / blur', () => {
  it('focus sets isFocused=true', () => {
    const { node, ctx, config } = attach();
    accessibleHandler.onEvent!(node, config, ctx, { type: 'focus' });
    expect(node.__accessibleState.isFocused).toBe(true);
  });
  it('focus announcement includes role', () => {
    const { node, ctx, config } = attach({ label: 'Submit', role: 'button' });
    accessibleHandler.onEvent!(node, config, ctx, { type: 'focus' });
    expect(ctx.accessibility.announce).toHaveBeenCalledWith(expect.stringContaining('button'));
  });
  it('focus announcement includes description when set', () => {
    const { node, ctx, config } = attach({ label: 'Name', description: 'Enter your name' });
    accessibleHandler.onEvent!(node, config, ctx, { type: 'focus' });
    expect(ctx.accessibility.announce).toHaveBeenCalledWith(
      expect.stringContaining('Enter your name')
    );
  });
  it('focus announces keyboard shortcut', () => {
    const { node, ctx, config } = attach({ keyboard_shortcut: 'Space' });
    accessibleHandler.onEvent!(node, config, ctx, { type: 'focus' });
    expect(ctx.accessibility.announce).toHaveBeenCalledWith(expect.stringContaining('Space'));
  });
  it('focus emits on_accessible_focus', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    accessibleHandler.onEvent!(node, config, ctx, { type: 'focus' });
    expect(ctx.emit).toHaveBeenCalledWith('on_accessible_focus', expect.anything());
  });
  it('blur clears isFocused', () => {
    const { node, ctx, config } = attach();
    node.__accessibleState.isFocused = true;
    accessibleHandler.onEvent!(node, config, ctx, { type: 'blur' });
    expect(node.__accessibleState.isFocused).toBe(false);
  });
  it('blur emits accessibility_focus_ring visible=false', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    accessibleHandler.onEvent!(node, config, ctx, { type: 'blur' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'accessibility_focus_ring',
      expect.objectContaining({ visible: false })
    );
  });
});

// ─── onEvent — keydown ────────────────────────────────────────────────────────

describe('accessibleHandler.onEvent — keydown', () => {
  it('keyboard_shortcut triggers accessible_activate', () => {
    const { node, ctx, config } = attach({ keyboard_shortcut: 'Enter' });
    ctx.emit.mockClear();
    accessibleHandler.onEvent!(node, config, ctx, { type: 'keydown', key: 'Enter' });
    expect(ctx.emit).toHaveBeenCalledWith('accessible_activate', expect.anything());
  });
  it('non-shortcut key does not trigger accessible_activate', () => {
    const { node, ctx, config } = attach({ keyboard_shortcut: 'Enter' });
    ctx.emit.mockClear();
    accessibleHandler.onEvent!(node, config, ctx, { type: 'keydown', key: 'Escape' });
    expect(ctx.emit).not.toHaveBeenCalledWith('accessible_activate', expect.anything());
  });
  it('slider ArrowRight increments ariaValue', () => {
    const { node, ctx, config } = attach({
      role: 'slider',
      value_min: 0,
      value_max: 100,
      value_now: 50,
    });
    accessibleHandler.onEvent!(node, config, ctx, { type: 'keydown', key: 'ArrowRight' });
    expect(node.__accessibleState.ariaValue).toBeCloseTo(60); // 50 + 10%
  });
  it('slider ArrowLeft decrements ariaValue', () => {
    const { node, ctx, config } = attach({
      role: 'slider',
      value_min: 0,
      value_max: 100,
      value_now: 50,
    });
    accessibleHandler.onEvent!(node, config, ctx, { type: 'keydown', key: 'ArrowLeft' });
    expect(node.__accessibleState.ariaValue).toBeCloseTo(40);
  });
  it('slider ArrowUp increments ariaValue', () => {
    const { node, ctx, config } = attach({
      role: 'slider',
      value_min: 0,
      value_max: 100,
      value_now: 50,
    });
    accessibleHandler.onEvent!(node, config, ctx, { type: 'keydown', key: 'ArrowUp' });
    expect(node.__accessibleState.ariaValue).toBeCloseTo(60);
  });
  it('slider ArrowDown decrements ariaValue', () => {
    const { node, ctx, config } = attach({
      role: 'slider',
      value_min: 0,
      value_max: 100,
      value_now: 50,
    });
    accessibleHandler.onEvent!(node, config, ctx, { type: 'keydown', key: 'ArrowDown' });
    expect(node.__accessibleState.ariaValue).toBeCloseTo(40);
  });
  it('slider value clamped to value_max', () => {
    const { node, ctx, config } = attach({
      role: 'slider',
      value_min: 0,
      value_max: 100,
      value_now: 95,
    });
    accessibleHandler.onEvent!(node, config, ctx, { type: 'keydown', key: 'ArrowRight' });
    expect(node.__accessibleState.ariaValue).toBe(100);
  });
  it('slider value clamped to value_min', () => {
    const { node, ctx, config } = attach({
      role: 'slider',
      value_min: 0,
      value_max: 100,
      value_now: 5,
    });
    accessibleHandler.onEvent!(node, config, ctx, { type: 'keydown', key: 'ArrowLeft' });
    expect(node.__accessibleState.ariaValue).toBe(0);
  });
  it('slider emits accessible_value_change on arrow key', () => {
    const { node, ctx, config } = attach({
      role: 'slider',
      value_min: 0,
      value_max: 100,
      value_now: 50,
    });
    ctx.emit.mockClear();
    accessibleHandler.onEvent!(node, config, ctx, { type: 'keydown', key: 'ArrowRight' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'accessible_value_change',
      expect.objectContaining({ value: expect.any(Number) })
    );
  });
  it('button role arrow keys do not change ariaValue', () => {
    const { node, ctx, config } = attach({ role: 'button' });
    accessibleHandler.onEvent!(node, config, ctx, { type: 'keydown', key: 'ArrowRight' });
    expect(node.__accessibleState.ariaValue).toBeNull();
  });
});

// ─── onEvent — accessible_announce ───────────────────────────────────────────

describe('accessibleHandler.onEvent — accessible_announce', () => {
  it('polite adds to end of queue', () => {
    const { node, ctx, config } = attach({ live_region: 'polite' });
    accessibleHandler.onEvent!(node, config, ctx, {
      type: 'accessible_announce',
      message: 'First',
    });
    accessibleHandler.onEvent!(node, config, ctx, {
      type: 'accessible_announce',
      message: 'Second',
    });
    expect(node.__accessibleState.announceQueue[0]).toBe('First');
    expect(node.__accessibleState.announceQueue[1]).toBe('Second');
  });
  it('assertive inserts to front of queue', () => {
    const { node, ctx, config } = attach({ live_region: 'assertive' });
    accessibleHandler.onEvent!(node, config, ctx, {
      type: 'accessible_announce',
      message: 'First',
    });
    accessibleHandler.onEvent!(node, config, ctx, {
      type: 'accessible_announce',
      message: 'Urgent',
    });
    expect(node.__accessibleState.announceQueue[0]).toBe('Urgent');
  });
  it('live_region=off does not queue', () => {
    const { node, ctx, config } = attach({ live_region: 'off' });
    accessibleHandler.onEvent!(node, config, ctx, {
      type: 'accessible_announce',
      message: 'Ignored',
    });
    expect(node.__accessibleState.announceQueue).toHaveLength(0);
  });
});

// ─── onEvent — aria state setters ────────────────────────────────────────────

describe('accessibleHandler.onEvent — aria state setters', () => {
  it('accessible_set_expanded sets ariaExpanded', () => {
    const { node, ctx, config } = attach();
    accessibleHandler.onEvent!(node, config, ctx, {
      type: 'accessible_set_expanded',
      expanded: true,
    });
    expect(node.__accessibleState.ariaExpanded).toBe(true);
  });
  it('accessible_set_expanded emits accessibility_update', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    accessibleHandler.onEvent!(node, config, ctx, {
      type: 'accessible_set_expanded',
      expanded: false,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'accessibility_update',
      expect.objectContaining({ property: 'expanded', value: false })
    );
  });
  it('accessible_set_checked sets ariaChecked', () => {
    const { node, ctx, config } = attach();
    accessibleHandler.onEvent!(node, config, ctx, {
      type: 'accessible_set_checked',
      checked: true,
    });
    expect(node.__accessibleState.ariaChecked).toBe(true);
  });
  it('accessible_set_checked emits accessibility_update', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    accessibleHandler.onEvent!(node, config, ctx, {
      type: 'accessible_set_checked',
      checked: true,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'accessibility_update',
      expect.objectContaining({ property: 'checked', value: true })
    );
  });
  it('accessible_set_value sets ariaValue', () => {
    const { node, ctx, config } = attach();
    accessibleHandler.onEvent!(node, config, ctx, { type: 'accessible_set_value', value: 42 });
    expect(node.__accessibleState.ariaValue).toBe(42);
  });
  it('accessible_set_value emits accessibility_update', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    accessibleHandler.onEvent!(node, config, ctx, { type: 'accessible_set_value', value: 42 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'accessibility_update',
      expect.objectContaining({ property: 'valuenow', value: 42 })
    );
  });
});
